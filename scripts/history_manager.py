"""History manager for Max Mahon scan archive.

v2 schema adds portfolio-ready fields per scan entry:
  - top_candidates[]: sym/score/yield/pe/pbv/tags (top 15 by score)
  - watchlist_status[]: per watchlist stock {sym, status, triggers}
  - entry_thesis{}: per NIWES_5555 stock (criteria snapshot for later reference)
  - dividend_paid_since_entry{}: reserved for portfolio tracker (empty in scan-time)
  - price_snapshot{}: {sym: {price, date}} for backtest time series

v1 legacy entries preserved as-is; migrate via scripts/migrate_history_v2.py.
"""
import json
from pathlib import Path
from datetime import datetime, date

_HISTORY_PATH = Path(__file__).resolve().parent.parent / "data" / "history.json"


def load_history() -> dict:
    """Return history dict. If file missing/unreadable, return {'scans': []}."""
    if not _HISTORY_PATH.exists():
        return {"scans": []}
    try:
        return json.loads(_HISTORY_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {"scans": []}


def iso_week_key(d: date) -> str:
    """Return ISO week key like '2026-W17' (Mon-Sun, ISO 8601)."""
    iso = d.isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


def build_v2_entry(screener_data: dict, scanned_at: datetime, report_filename: str) -> dict:
    """Build a v2 history entry from screener output.

    Returns dict with iso_week + scanned_at + date + counts/summary/report/
    scoring_version/top_candidates/watchlist_status/entry_thesis/
    dividend_paid_since_entry/price_snapshot.
    """
    cands = screener_data.get("candidates", [])
    review = screener_data.get("review_candidates", [])
    top = sorted(cands, key=lambda x: x.get("score", 0), reverse=True)[:15]

    top_candidates = [
        {
            "symbol": c["symbol"],
            "score": c.get("score", 0),
            "yield": (c.get("metrics") or {}).get("dy"),
            "pe": (c.get("metrics") or {}).get("pe"),
            "pbv": (c.get("metrics") or {}).get("pb_ratio") or c.get("pb_ratio"),
            "tags": c.get("signals", []),
        }
        for c in top
    ]
    watchlist_status = [
        {
            "symbol": c["symbol"],
            "status": "HELD" if "NIWES_5555" in c.get("signals", []) else "REVIEW",
            "triggers": c.get("exit_triggers", []),
        }
        for c in cands if c.get("in_watchlist")
    ]
    entry_thesis = {
        c["symbol"]: {
            "sector": c.get("sector"),
            "pe": (c.get("metrics") or {}).get("pe"),
            "pbv": (c.get("metrics") or {}).get("pb_ratio"),
            "yield": (c.get("metrics") or {}).get("dy"),
            "streak": (c.get("aggregates") or {}).get("dividend_streak"),
            "tags": c.get("signals", []),
        }
        for c in cands if "NIWES_5555" in c.get("signals", [])
    }
    price_snapshot = {
        c["symbol"]: {
            "price": (c.get("metrics") or {}).get("price"),
            "date": screener_data.get("date"),
        }
        for c in top
    }
    return {
        "iso_week": iso_week_key(scanned_at.date()),
        "scanned_at": scanned_at.isoformat(timespec="seconds"),
        "date": scanned_at.strftime("%Y-%m-%d"),
        "counts": {
            "scanned": screener_data.get("total_scanned", 0),
            "passed": len(cands),
            "review": len(review),
            "new": screener_data.get("new_discoveries", 0),
            "filtered": screener_data.get("filtered_out", 0),
        },
        "summary": ", ".join(c["symbol"] for c in top[:3]) + f" · +{screener_data.get('new_discoveries', 0)} ใหม่",
        "report": report_filename,
        "scoring_version": screener_data.get("scoring_version", "niwes-dividend-first-v2"),
        "top_candidates": top_candidates,
        "watchlist_status": watchlist_status,
        "entry_thesis": entry_thesis,
        "dividend_paid_since_entry": {},
        "price_snapshot": price_snapshot,
    }


def append_scan_v2(entry: dict, history: dict | None = None) -> dict:
    """Append entry to history + atomic write. Returns updated history dict."""
    hist = history or load_history()
    hist.setdefault("scans", []).append(entry)
    _HISTORY_PATH.write_text(
        json.dumps(hist, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return hist
