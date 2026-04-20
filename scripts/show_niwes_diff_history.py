"""
show_niwes_diff_history.py — Pretty-print niwes_diff_history.json for trend review.

Usage:
  py scripts/show_niwes_diff_history.py              # all entries
  py scripts/show_niwes_diff_history.py --last 5     # last 5 runs
  py scripts/show_niwes_diff_history.py --symbol QH  # findings mentioning a symbol
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _niwes_cache import load_diff_history  # noqa: E402

HISTORY = Path(__file__).resolve().parent.parent / "data" / "niwes_diff_history.json"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--last", type=int, default=0, help="show only last N entries")
    ap.add_argument("--symbol", type=str, default="", help="filter by symbol")
    ap.add_argument("--min-confidence", type=int, default=0)
    args = ap.parse_args()

    entries = load_diff_history(HISTORY)
    if not entries:
        print(f"[info] no history at {HISTORY}")
        return 0

    if args.last > 0:
        entries = entries[-args.last :]

    type_counter: Counter[str] = Counter()
    symbol_counter: Counter[str] = Counter()

    for e in entries:
        date = e.get("date", "?")
        findings = e.get("findings", [])
        news_count = e.get("news_count", 0)
        shown = []
        for f in findings:
            if args.symbol and f.get("symbol", "").upper() != args.symbol.upper():
                continue
            if f.get("confidence", 0) < args.min_confidence:
                continue
            if f.get("change_type") == "none":
                continue
            shown.append(f)
            type_counter[f.get("change_type", "")] += 1
            if f.get("symbol"):
                symbol_counter[f.get("symbol", "")] += 1

        if not shown and (args.symbol or args.min_confidence > 0):
            continue

        print(f"\n=== {date} (news={news_count}, findings={len(findings)}) ===")
        for f in shown:
            print(
                f"  [{f.get('confidence','?')}%] {f.get('change_type','')} "
                f"{f.get('symbol','')} — {f.get('reasoning','')[:100]}"
            )
            print(f"      evidence: {f.get('evidence','')}")

    print("\n--- Summary ---")
    print(f"entries scanned: {len(entries)}")
    print(f"change_types: {dict(type_counter)}")
    print(f"top symbols: {dict(symbol_counter.most_common(5))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
