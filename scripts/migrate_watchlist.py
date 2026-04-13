"""Migrate watchlist.json → user_data.json (one-time)."""

import json
from datetime import datetime
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
WATCHLIST_PATH = PROJECT_DIR / "watchlist.json"
USER_DATA_PATH = PROJECT_DIR / "user_data.json"


def migrate():
    if USER_DATA_PATH.exists():
        print(f"[migrate] user_data.json already exists — skipping")
        return

    if not WATCHLIST_PATH.exists():
        print(f"[migrate] watchlist.json not found — creating empty user_data.json")
        data = {
            "watchlist": [],
            "blacklist": [],
            "notes": {},
            "custom_lists": {},
            "updated_at": datetime.now().isoformat(),
        }
    else:
        wl = json.loads(WATCHLIST_PATH.read_text(encoding="utf-8"))
        stocks = wl.get("stocks", [])
        data = {
            "watchlist": sorted(s["symbol"] for s in stocks),
            "blacklist": [],
            "notes": {s["symbol"]: s["reason"] for s in stocks if s.get("reason")},
            "custom_lists": {},
            "updated_at": datetime.now().isoformat(),
        }

    USER_DATA_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[migrate] created user_data.json with {len(data['watchlist'])} stocks")


if __name__ == "__main__":
    migrate()
