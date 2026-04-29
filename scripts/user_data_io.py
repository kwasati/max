"""Per-user data file accessor — replaces single global user_data.json.

Each user has an isolated directory under ``data/users/<uuid>/`` containing
their own ``user_data.json`` (watchlist / blacklist / notes / custom lists /
transactions / simulated_portfolio).

Public API:
    DATA_ROOT                     — Path to data/users/
    DEFAULT_USER_DATA             — dict template for a fresh user
    user_dir(user_id)             — ensure & return Path to a user's folder
    load_user_data(user_id)       — read JSON (or default) for user
    save_user_data(user_id, data) — atomic-ish write (stamps updated_at)
    all_user_ids()                — list user UUIDs that have a folder
    aggregate_watchlists()        — set union of all users' watchlists

Used by:
    server.app — per-endpoint user data load/save (Phase 3.7)
    scripts.daily_price_refresh — cron aggregate (Phase 4.8)
    scripts.migrate_to_per_user — one-shot legacy migration (Phase 3.8)
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Iterator

PROJECT_DIR = Path(__file__).resolve().parent.parent
DATA_ROOT = PROJECT_DIR / "data" / "users"


DEFAULT_USER_DATA: dict = {
    "watchlist": [],
    "blacklist": [],
    "notes": {},
    "custom_lists": {},
    "transactions": [],
    "simulated_portfolio": {},
    "updated_at": None,
}


def user_dir(user_id: str) -> Path:
    """Return Path to ``data/users/{user_id}/``, creating parents if needed."""
    if not user_id or not isinstance(user_id, str):
        raise ValueError(f"user_id must be a non-empty str, got {user_id!r}")
    d = DATA_ROOT / user_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def _user_file(user_id: str) -> Path:
    return user_dir(user_id) / "user_data.json"


def _default() -> dict:
    """Fresh deep copy of the default schema (so callers can mutate safely)."""
    return {
        "watchlist": [],
        "blacklist": [],
        "notes": {},
        "custom_lists": {},
        "transactions": [],
        "simulated_portfolio": {},
        "updated_at": None,
    }


def load_user_data(user_id: str) -> dict:
    """Read this user's ``user_data.json``. Return defaults if file missing."""
    path = _user_file(user_id)
    if not path.exists():
        return _default()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return _default()
    if not isinstance(data, dict):
        return _default()
    # Ensure expected top-level keys are present (forward-compat with new fields).
    base = _default()
    base.update(data)
    return base


def save_user_data(user_id: str, data: dict) -> None:
    """Write this user's data, stamping ``updated_at``."""
    if not isinstance(data, dict):
        raise TypeError("data must be a dict")
    payload = dict(data)  # shallow copy so caller's dict is untouched
    payload["updated_at"] = datetime.now().isoformat()
    path = _user_file(user_id)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def all_user_ids() -> list[str]:
    """List user UUIDs that have a directory under DATA_ROOT (sorted)."""
    if not DATA_ROOT.exists():
        return []
    return sorted(p.name for p in DATA_ROOT.iterdir() if p.is_dir())


def _iter_user_files() -> Iterator[Path]:
    for uid in all_user_ids():
        f = DATA_ROOT / uid / "user_data.json"
        if f.exists():
            yield f


def aggregate_watchlists() -> set[str]:
    """Return the set-union of every user's watchlist (deduped)."""
    out: set[str] = set()
    for f in _iter_user_files():
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        for sym in (data.get("watchlist") or []):
            if sym:
                out.add(sym)
    return out
