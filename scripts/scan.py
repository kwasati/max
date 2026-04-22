"""Max Mahon v5 — Unified Scan (Niwes): top candidates + watchlist update + new in batch + watch out."""

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
REPORTS_DIR = ROOT / "reports"
USER_DATA = ROOT / "user_data.json"
HISTORY_FILE = DATA_DIR / "history.json"

sys.path.insert(0, str(ROOT / "scripts"))

load_dotenv(Path("C:/WORKSPACE/.env"))


_SCREENER_DATE_PATTERN = re.compile(r"^screener_\d{4}-\d{2}-\d{2}\.json$")


def get_latest_screener() -> Path:
    files = sorted(
        [f for f in DATA_DIR.glob("screener_*.json") if _SCREENER_DATE_PATTERN.match(f.name)],
        reverse=True,
    )
    if not files:
        print("No screener data found. Run screen_stocks.py first.")
        sys.exit(1)
    return files[0]


def load_history() -> dict:
    if not HISTORY_FILE.exists():
        return {"scans": []}
    try:
        data = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or "scans" not in data:
            return {"scans": []}
        return data
    except Exception:
        return {"scans": []}


def next_scan_num(history: dict) -> int:
    scans = history.get("scans", [])
    if not scans:
        return 1
    nums = [s.get("num", 0) for s in scans]
    return max(nums) + 1


def main():
    screener_path = get_latest_screener()
    print(f"Using screener: {screener_path.name}")

    screener_data = json.loads(screener_path.read_text(encoding="utf-8"))

    if USER_DATA.exists():
        user_data = json.loads(USER_DATA.read_text(encoding="utf-8"))
    else:
        user_data = {"watchlist": [], "notes": {}}

    watchlist = user_data.get("watchlist", [])
    notes = user_data.get("notes", {})

    history = load_history()
    scan_num = next_scan_num(history)
    today = datetime.now().strftime("%Y-%m-%d")
    scan_date = screener_data.get("date", today)

    # Wire deterministic report generation (niwes-algo-02 task 3)
    from report_template import generate_report_md

    # Determine prev_scan for diff (New In Batch section)
    prev_scan = None
    try:
        scans_list = history.get("scans") if isinstance(history, dict) else history
        if scans_list:
            prev_scan = scans_list[-1]  # most recent prior scan (before this one)
    except Exception:
        prev_scan = None

    report_path = REPORTS_DIR / f"scan_{today}.md"
    report_md = generate_report_md(screener_data, scan_num, prev_scan)
    report_path.write_text(report_md, encoding="utf-8")
    print(f"report written: {report_path}")

    # Wire v2 history
    from history_manager import build_v2_entry, append_scan_v2

    history_entry = build_v2_entry(screener_data, scan_num, report_path.name)
    append_scan_v2(history_entry, history)  # pass loaded history dict to avoid re-read
    print(f"history entry appended: scan_num={scan_num}")

    # Telegram alert for high-severity exit triggers (plan 05 Phase 3)
    try:
        from telegram_alert import send_exit_alert
        candidates = screener_data.get("candidates", [])
        high_triggers = [
            {**t, "symbol": c["symbol"]}
            for c in candidates
            for t in c.get("exit_triggers", [])
            if t.get("severity") == "high"
        ]
        if high_triggers:
            send_exit_alert(high_triggers)
    except Exception as e:
        print(f"telegram alert skip: {e}")


if __name__ == "__main__":
    main()
