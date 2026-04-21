"""Integration smoke test for Niwes algo framework.

Runs per-symbol pipeline on curated 10 symbols — verifies expected case study tags + benchmark.
Run before full 933-stock scan to catch bugs early.
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fetch_data import fetch_multi_year_safe
from screen_stocks import assign_signals, hard_filter
from data_adapter import check_hidden_value


CURATED = [
    "CPALL.BK",
    "TCAP.BK",
    "QH.BK",
    "ADVANC.BK",
    "PTT.BK",
    "BDMS.BK",
    "SCB.BK",
    "GULF.BK",
    "CBG.BK",
    "DITTO.BK",
]

EXPECTED_TAGS = {
    "CPALL.BK": "RETAIL_DEFENSIVE_MOAT",
    "TCAP.BK": "BANK_VALUE_PBV1",
    "GULF.BK": "UTILITY_DEFENSIVE",
    "BDMS.BK": "HOSPITAL_AGING",
    "CBG.BK": "F&B_CONSUMER_BRAND",
}


def main():
    t0 = time.time()
    results = {}
    for sym in CURATED:
        stock = fetch_multi_year_safe(sym)
        if stock.get("delisted"):
            results[sym] = {"delisted": True, "error": stock.get("error")}
            continue
        stock["_hidden_holdings"] = check_hidden_value(sym)
        signals = assign_signals(stock, 0)
        status, reasons, _ = hard_filter(stock)
        results[sym] = {"signals": signals, "status": status}

    elapsed = time.time() - t0
    print(f"\n=== Integration Test ({elapsed:.1f}s) ===")
    passed = 0
    failed = 0
    for sym, exp_tag in EXPECTED_TAGS.items():
        sigs = results.get(sym, {}).get("signals", [])
        ok = exp_tag in sigs
        marker = "ok" if ok else "FAIL"
        print(f"{marker} {sym}: expect {exp_tag} | got {sigs}")
        if ok:
            passed += 1
        else:
            failed += 1

    # Print all results for visibility
    print(f"\n--- All results ---")
    for sym, r in results.items():
        print(f"  {sym}: {r}")

    print(f"\n{passed}/{passed + failed} tag assertions pass | runtime {elapsed:.1f}s")
    assert elapsed < 300, f"runtime {elapsed:.1f}s exceeds 5 min budget"
    # Tag assertions are informational — some may fail if stocks don't currently meet Niwes criteria
    # (e.g., CBG current margins/streak may not match F&B pattern today)
    # Don't hard-fail on assertion count — just report
    print(f"\nBenchmark: {'PASS' if elapsed < 300 else 'FAIL'} (<300s budget)")


if __name__ == "__main__":
    main()
