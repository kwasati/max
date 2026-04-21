"""One-off idempotent migration: backfill v2 keys to legacy history.json entries.

Creates backup at data/history.json.v1.bak (once, if not exists).
Scans each entry in 'scans' array. If entry lacks any v2 key, adds empty default.
Safe to re-run — entries with all keys are untouched.
"""
import json
import shutil
from pathlib import Path

_HIST = Path(__file__).resolve().parent.parent / "data" / "history.json"
_BAK = _HIST.with_suffix(".json.v1.bak")
_V2_DEFAULTS = {
    "top_candidates": [],
    "watchlist_status": [],
    "entry_thesis": {},
    "dividend_paid_since_entry": {},
    "price_snapshot": {},
    "scoring_version": "niwes-dividend-first-v1-legacy",
}


def main():
    if not _HIST.exists():
        print("no history.json — nothing to migrate")
        return
    if not _BAK.exists():
        shutil.copy2(_HIST, _BAK)
        print(f"backed up -> {_BAK}")
    data = json.loads(_HIST.read_text(encoding="utf-8"))
    changed = 0
    for entry in data.get("scans", []):
        for k, v in _V2_DEFAULTS.items():
            if k not in entry:
                entry[k] = list(v) if isinstance(v, list) else (dict(v) if isinstance(v, dict) else v)
                changed += 1
    _HIST.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"migrated {changed} fields across {len(data.get('scans', []))} entries")


if __name__ == "__main__":
    main()
