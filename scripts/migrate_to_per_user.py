"""One-shot migration: legacy global ``data/user_data.json`` → per-user folder.

Usage:
    py scripts/migrate_to_per_user.py
        # default user-id = อาร์ท (Karl) UUID from Plan 01 smoke test

    py scripts/migrate_to_per_user.py --user-id <uuid>
        # explicit target user

What it does:
    1. Reads legacy ``data/user_data.json`` (Plan-01-era global file).
    2. Writes a copy to ``data/users/<user-id>/user_data.json`` (creates dirs).
    3. Moves the legacy file to ``data/_archive/user_data.legacy.json`` so the
       new code path (server.app + scripts.user_data_io) cannot accidentally
       pick it up again.

Safe to re-run: if the legacy file is already absent, the script reports
``nothing to migrate`` and exits 0 without touching the destination.

This script is intentionally NOT auto-run. After Plan 02 lands on main,
อาร์ทกดเอง when ready (we don't want a worktree merge to mutate production
data unprompted).
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

# Default = อาร์ท's Supabase UUID, verified Plan 01 smoke test 2026-04-29
DEFAULT_USER_ID = "bfb6d2cf-c241-4d38-a48f-4e8ce1973659"

PROJECT_DIR = Path(__file__).resolve().parent.parent
LEGACY_PATH = PROJECT_DIR / "data" / "user_data.json"
LEGACY_PATH_ALT = PROJECT_DIR / "user_data.json"  # pre-Plan-02 location at project root
ARCHIVE_DIR = PROJECT_DIR / "data" / "_archive"
ARCHIVE_PATH = ARCHIVE_DIR / "user_data.legacy.json"


def _resolve_legacy_source() -> Path | None:
    """Return whichever legacy file exists (data/user_data.json or root /user_data.json)."""
    if LEGACY_PATH.exists():
        return LEGACY_PATH
    if LEGACY_PATH_ALT.exists():
        return LEGACY_PATH_ALT
    return None


def migrate(user_id: str) -> int:
    legacy = _resolve_legacy_source()
    if legacy is None:
        print(f"[migrate] nothing to migrate — {LEGACY_PATH} (and {LEGACY_PATH_ALT}) not found")
        return 0

    # Validate JSON before doing anything destructive.
    try:
        content = legacy.read_text(encoding="utf-8")
        parsed = json.loads(content)
    except (OSError, json.JSONDecodeError) as e:
        print(f"[migrate] ERROR: cannot read/parse {legacy}: {e}", file=sys.stderr)
        return 2
    if not isinstance(parsed, dict):
        print(f"[migrate] ERROR: legacy file is not a JSON object (got {type(parsed).__name__})", file=sys.stderr)
        return 2

    # Destination
    target_dir = PROJECT_DIR / "data" / "users" / user_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / "user_data.json"

    if target.exists():
        print(f"[migrate] WARN: {target} already exists — refusing to overwrite", file=sys.stderr)
        print(f"[migrate]   delete that file first if you really want to redo migration", file=sys.stderr)
        return 3

    target.write_text(content, encoding="utf-8")
    print(f"[migrate] copied legacy → {target}")

    # Archive the legacy file so the server can no longer accidentally read it.
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    if ARCHIVE_PATH.exists():
        # Don't blow away an existing archive; rotate by suffixing.
        i = 1
        while True:
            rotated = ARCHIVE_DIR / f"user_data.legacy.{i}.json"
            if not rotated.exists():
                shutil.move(str(legacy), str(rotated))
                print(f"[migrate] archived legacy → {rotated} (older archive kept at {ARCHIVE_PATH})")
                break
            i += 1
    else:
        shutil.move(str(legacy), str(ARCHIVE_PATH))
        print(f"[migrate] archived legacy → {ARCHIVE_PATH}")

    print(f"[migrate] migrated, archived (user_id={user_id})")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Migrate legacy user_data.json to per-user folder.")
    p.add_argument(
        "--user-id",
        default=DEFAULT_USER_ID,
        help=f"Target user UUID (default: {DEFAULT_USER_ID} = อาร์ท)",
    )
    args = p.parse_args(argv)
    return migrate(args.user_id)


if __name__ == "__main__":
    sys.exit(main())
