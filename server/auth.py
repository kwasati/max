"""Auth module — Supabase JWT verification (ES256 + JWKS) + role-based guard.

Replaces legacy Bearer MAX_TOKEN middleware. Verifies Supabase-issued JWT using
public keys fetched from the project JWKS endpoint, then matches the token's
email against `MAXMAHON_ALLOWED_USERS` whitelist (env JSON array) to enforce
both authentication and admin/viewer role gating.

Public API:
    get_current_user(authorization=Header(...))  → dict {user_id, email, name, role}
    require_admin(user=Depends(get_current_user)) → dict (raises 403 if not admin)

Plan 01 smoke test (2026-04-29) confirmed: alg=ES256, aud=authenticated,
issuer=https://zmscqylztzvzeyxwamzp.supabase.co/auth/v1.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Optional

import jwt
from fastapi import Depends, Header, HTTPException, status
from jwt import PyJWKClient

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SUPABASE_URL = "https://zmscqylztzvzeyxwamzp.supabase.co"
JWKS_URL = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
ALGORITHMS = ["ES256"]
AUDIENCE = "authenticated"

# PyJWKClient caches keys for 1 hour by default (matches Supabase JWKS recommendation).
_jwks_client: Optional[PyJWKClient] = None


def _get_jwks_client() -> PyJWKClient:
    """Lazily build a module-level JWKS client (caches public keys for 1h)."""
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(JWKS_URL, cache_keys=True, lifespan=3600)
    return _jwks_client


# ---------------------------------------------------------------------------
# Whitelist
# ---------------------------------------------------------------------------
_whitelist_cache: Optional[dict] = None


def _load_whitelist() -> dict:
    """Parse MAXMAHON_ALLOWED_USERS env JSON into {email: user_dict}.

    Expected env value: JSON array of {email, name, role} objects.
    Cached at module level — reset by clearing the global from a test harness.
    """
    global _whitelist_cache
    if _whitelist_cache is not None:
        return _whitelist_cache
    raw = os.getenv("MAXMAHON_ALLOWED_USERS", "").strip()
    if not raw:
        logger.warning("MAXMAHON_ALLOWED_USERS not set — all auth will fail with 403")
        _whitelist_cache = {}
        return _whitelist_cache
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error("MAXMAHON_ALLOWED_USERS is not valid JSON: %s", e)
        _whitelist_cache = {}
        return _whitelist_cache
    if not isinstance(parsed, list):
        logger.error("MAXMAHON_ALLOWED_USERS must be a JSON array of users")
        _whitelist_cache = {}
        return _whitelist_cache
    out: dict = {}
    for entry in parsed:
        if not isinstance(entry, dict):
            continue
        email = (entry.get("email") or "").strip().lower()
        if not email:
            continue
        out[email] = {
            "email": email,
            "name": entry.get("name"),
            "role": entry.get("role") or "viewer",
        }
    _whitelist_cache = out
    return _whitelist_cache


# ---------------------------------------------------------------------------
# Dependency: extract current user from Bearer JWT
# ---------------------------------------------------------------------------
async def get_current_user(authorization: str = Header(default="")) -> dict:
    """FastAPI dependency. Verify Supabase JWT and return user dict.

    Returns: {user_id, email, name, role}
    Raises:
        401 — missing / invalid / expired token
        403 — token valid but email not in MAXMAHON_ALLOWED_USERS whitelist
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header (expected 'Bearer <jwt>')",
        )
    token = authorization[len("Bearer "):].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Empty bearer token",
        )

    # Resolve signing key from JWKS via token's kid
    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token).key
    except Exception as e:
        logger.warning("JWKS key lookup failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not resolve token signing key",
        ) from e

    # Verify signature + audience + expiry
    try:
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=ALGORITHMS,
            audience=AUDIENCE,
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
        )
    except jwt.InvalidTokenError as e:
        logger.warning("JWT verify failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
        ) from e

    user_id = payload.get("sub")
    email = (payload.get("email") or "").strip().lower()
    if not user_id or not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing sub or email claim",
        )

    whitelist = _load_whitelist()
    entry = whitelist.get(email)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"User '{email}' not in MaxMahon whitelist",
        )

    return {
        "user_id": user_id,
        "email": email,
        "name": entry.get("name"),
        "role": entry.get("role") or "viewer",
    }


# ---------------------------------------------------------------------------
# Dependency: admin-only guard
# ---------------------------------------------------------------------------
async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """FastAPI dependency. Allow only users whose whitelist role == 'admin'."""
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin only",
        )
    return user
