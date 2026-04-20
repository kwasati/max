"""
alert_niwes.py — Send Telegram alerts for high-confidence Niwes portfolio changes.

Reads data/niwes_diff_latest.json (written by diff_niwes_portfolio.py — only
contains findings with confidence >= 70 and change_type != 'none').

Tracks sent findings in data/niwes_alert_sent.json (keyed by stable SHA1 of
change_type|symbol|evidence) — prevents re-alerting the same finding.

Uses C:/WORKSPACE/.env creds. Tries KARL_NOTIFY_BOT_TOKEN / KARL_NOTIFY_CHAT_ID
first (plan spec), falls back to TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID
(actual Karl Notify bot env vars in this workspace).

Usage:
  py scripts/alert_niwes.py              # normal — read diff_latest
  py scripts/alert_niwes.py --mock       # send 1 mock finding (smoke test)
  py scripts/alert_niwes.py --dry-run    # print what would be sent, don't POST
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _niwes_cache import (  # noqa: E402
    finding_id,
    load_alert_sent,
    save_alert_sent,
)

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)
DIFF_LATEST = DATA_DIR / "niwes_diff_latest.json"
ALERT_SENT = DATA_DIR / "niwes_alert_sent.json"

load_dotenv(Path("C:/WORKSPACE/.env"))

# Plan spec names (preferred) -> actual workspace names (fallback)
TOKEN = os.getenv("KARL_NOTIFY_BOT_TOKEN") or os.getenv("TELEGRAM_BOT_TOKEN")
CHAT_ID = os.getenv("KARL_NOTIFY_CHAT_ID") or os.getenv("TELEGRAM_CHAT_ID")


def send_telegram(msg: str, dry_run: bool = False) -> bool:
    if dry_run:
        print("[dry-run] message would be sent:")
        print(msg)
        return True
    if not TOKEN or not CHAT_ID:
        print(
            "[error] Telegram creds missing — set KARL_NOTIFY_BOT_TOKEN + "
            "KARL_NOTIFY_CHAT_ID (or TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID) in "
            "C:/WORKSPACE/.env"
        )
        return False
    try:
        r = requests.post(
            f"https://api.telegram.org/bot{TOKEN}/sendMessage",
            json={
                "chat_id": CHAT_ID,
                "text": msg,
                "parse_mode": "Markdown",
                "disable_web_page_preview": False,
            },
            timeout=15,
        )
        if r.status_code == 200 and r.json().get("ok"):
            return True
        print(f"[error] Telegram API returned {r.status_code}: {r.text[:200]}")
        return False
    except requests.RequestException as e:
        print(f"[error] Telegram request failed: {e}")
        return False


def format_finding_line(f: dict[str, Any]) -> str:
    change = f.get("change_type", "?")
    symbol = f.get("symbol", "")
    conf = f.get("confidence", 0)
    url = f.get("evidence", "")
    reasoning = f.get("reasoning", "")
    # Markdown-safe — underscores in URLs fine because parse_mode=Markdown uses _italic_ inside text
    line = f"🔔 ดร.นิเวศน์ update — *{change}* {symbol} (confidence {conf}%)"
    if reasoning:
        line += f"\n    _{reasoning[:160]}_"
    if url:
        line += f"\n    source: {url}"
    return line


def build_batch_message(findings: list[dict[str, Any]]) -> str:
    if len(findings) == 1:
        return format_finding_line(findings[0])
    header = f"🔔 ดร.นิเวศน์ update — {len(findings)} new signals"
    body = "\n\n".join(format_finding_line(f) for f in findings)
    return f"{header}\n\n{body}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mock", action="store_true", help="send 1 mock finding (smoke test)")
    ap.add_argument("--dry-run", action="store_true", help="print, don't POST")
    args = ap.parse_args()

    if args.mock:
        findings = [
            {
                "change_type": "exit",
                "symbol": "QH",
                "evidence": "https://example.com/mock-niwes-exit-qh",
                "confidence": 85,
                "reasoning": "Mock test — ดร.นิเวศน์ ขาย QH ทั้งหมด (mock finding)",
            }
        ]
    else:
        if not DIFF_LATEST.exists():
            print(f"[info] no {DIFF_LATEST} — run diff_niwes_portfolio.py first")
            return 0
        data = json.loads(DIFF_LATEST.read_text(encoding="utf-8"))
        findings = data.get("findings", [])

    if not findings:
        print("[info] no high-confidence findings — nothing to alert")
        return 0

    # Dedup: skip findings already sent
    sent = load_alert_sent(ALERT_SENT)
    new_findings = []
    for f in findings:
        fid = finding_id(f)
        if fid in sent:
            print(f"[skip] already alerted: {f.get('change_type')} {f.get('symbol')}")
            continue
        new_findings.append((fid, f))

    if not new_findings:
        print("[info] all findings already alerted — nothing new to send")
        return 0

    msg = build_batch_message([f for _, f in new_findings])
    print(f"[info] sending {len(new_findings)} finding(s) to Telegram ...")
    ok = send_telegram(msg, dry_run=args.dry_run)
    if not ok:
        print("[error] send failed — not updating sent cache")
        return 1

    if not args.dry_run:
        for fid, _ in new_findings:
            sent.add(fid)
        save_alert_sent(ALERT_SENT, sent)
        print(f"[done] sent — updated {ALERT_SENT}")
    else:
        print("[dry-run] not updating sent cache")
    return 0


if __name__ == "__main__":
    sys.exit(main())
