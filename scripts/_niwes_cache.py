"""
_niwes_cache.py — Dedup + history cache helpers for niwes monitor pipeline.

Cache files (all under data/, all gitignored — generated at runtime):
  - niwes_news_seen.json          : {urls: [str], last_updated: ISO}
  - niwes_diff_history.json       : {entries: [{date, findings[]}]}
  - niwes_alert_sent.json         : {finding_ids: [str], last_updated: ISO}

Rationale: keep cache I/O in one place so all 3 monitor scripts
(monitor_niwes_news, diff_niwes_portfolio, alert_niwes) share the same
schema and atomic write behavior.
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"


def _atomic_write(path: Path, payload: dict[str, Any]) -> None:
    """Write JSON atomically (temp file + rename) so a crash mid-write
    never leaves a corrupt cache.
    """
    path.parent.mkdir(exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    os.replace(tmp, path)


# -----------------------------------------------------------------------------
# Seen URLs cache (used by monitor_niwes_news.py)
# -----------------------------------------------------------------------------


def load_seen_urls(path: Path) -> set[str]:
    if not path.exists():
        return set()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return set(raw.get("urls", []))
    except (json.JSONDecodeError, OSError):
        return set()


def save_seen_urls(path: Path, urls: set[str]) -> None:
    _atomic_write(
        path,
        {
            "urls": sorted(urls),
            "count": len(urls),
            "last_updated": datetime.now().isoformat(),
        },
    )


# -----------------------------------------------------------------------------
# Diff history (used by diff_niwes_portfolio.py)
# -----------------------------------------------------------------------------


def load_diff_history(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return raw.get("entries", [])
    except (json.JSONDecodeError, OSError):
        return []


def append_diff_history(path: Path, entry: dict[str, Any]) -> None:
    entries = load_diff_history(path)
    entries.append(entry)
    _atomic_write(
        path,
        {
            "entries": entries,
            "count": len(entries),
            "last_updated": datetime.now().isoformat(),
        },
    )


# -----------------------------------------------------------------------------
# Alert sent cache (used by alert_niwes.py)
# -----------------------------------------------------------------------------


def load_alert_sent(path: Path) -> set[str]:
    if not path.exists():
        return set()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return set(raw.get("finding_ids", []))
    except (json.JSONDecodeError, OSError):
        return set()


def save_alert_sent(path: Path, finding_ids: set[str]) -> None:
    _atomic_write(
        path,
        {
            "finding_ids": sorted(finding_ids),
            "count": len(finding_ids),
            "last_updated": datetime.now().isoformat(),
        },
    )


def finding_id(finding: dict[str, Any]) -> str:
    """Stable hash for a finding so duplicates don't re-alert.

    Use (change_type, symbol, evidence URL) as the uniqueness key.
    """
    import hashlib

    key = f"{finding.get('change_type','')}|{finding.get('symbol','')}|{finding.get('evidence','')}"
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]


# -----------------------------------------------------------------------------
# Self-test
# -----------------------------------------------------------------------------


def _self_test() -> None:
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "seen.json"
        assert load_seen_urls(p) == set()
        save_seen_urls(p, {"https://a.com", "https://b.com"})
        assert load_seen_urls(p) == {"https://a.com", "https://b.com"}

        h = Path(td) / "history.json"
        assert load_diff_history(h) == []
        append_diff_history(h, {"date": "2026-04-20", "findings": []})
        append_diff_history(h, {"date": "2026-04-21", "findings": [{"a": 1}]})
        assert len(load_diff_history(h)) == 2

        s = Path(td) / "sent.json"
        assert load_alert_sent(s) == set()
        save_alert_sent(s, {"abc123", "def456"})
        assert load_alert_sent(s) == {"abc123", "def456"}

        f1 = {"change_type": "exit", "symbol": "QH", "evidence": "https://x.com/1"}
        f2 = {"change_type": "exit", "symbol": "QH", "evidence": "https://x.com/1"}
        assert finding_id(f1) == finding_id(f2)

    print("[ok] _niwes_cache self-test passed")


if __name__ == "__main__":
    _self_test()
