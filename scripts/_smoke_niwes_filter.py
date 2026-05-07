"""Smoke test for Niwes 5-5-5-5 filter alignment changes.

Fixture-based — does not fetch market data. Verifies hard_filter() + assign_signals()
behavior across 5 critical cases (main path, exception path, regression, signals).
"""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from screen_stocks import hard_filter, assign_signals


def _make_fixture(*, dy, streak, growth_streak, eps_5_pos=True, pe=10, pbv=1.0,
                  mcap=10_000_000_000, payout=0.5, yield_5y=None, roe_trend=None):
    """Build a data dict shaped like fetch_data output for filter/signal testing."""
    eps_list = [1.0, 1.1, 1.2, 1.3, 1.5] if eps_5_pos else [1.0, -0.5, 1.2, 1.3, 1.5]
    yearly = []
    for i, e in enumerate(eps_list):
        yearly.append({
            "year": 2020 + i,
            "diluted_eps": e,
            "close": 100.0,
            "bvps": 80.0,
            "payout_ratio": payout,
            "roe": (roe_trend[i] if roe_trend else 0.15),
            "net_margin": 0.10,
            "revenue": 1e9,
        })
    return {
        "symbol": "TEST.BK",
        "dividend_yield": dy,
        "pe_ratio": pe,
        "pb_ratio": pbv,
        "market_cap": mcap,
        "payout_ratio": payout,
        "five_year_avg_yield": yield_5y,
        "yearly_metrics": yearly,
        "aggregates": {
            "dividend_streak": streak,
            "dividend_growth_streak": growth_streak,
        },
        "warnings": [],
    }


CASES = [
    {
        "name": "1. Main path PASS (yield 7.5, streak 10)",
        "data": _make_fixture(dy=7.5, streak=10, growth_streak=2),
        "expect_status": "PASS",
        "expect_signals_in": ["NIWES_5555"],
        "expect_signals_not_in": ["NIWES_GROWING"],
    },
    {
        "name": "2. Exception PASS (yield 3.0, growth_streak 5)",
        "data": _make_fixture(dy=3.0, streak=8, growth_streak=5),
        "expect_status": "PASS",
        "expect_signals_in": ["NIWES_GROWING"],
        "expect_signals_not_in": ["NIWES_5555"],
    },
    {
        "name": "3. Exception FAIL (yield 3.0, growth_streak 2 — not enough)",
        "data": _make_fixture(dy=3.0, streak=8, growth_streak=2),
        "expect_status": "FAIL",
        "expect_reason_contains": "growing exception not met",
    },
    {
        "name": "4. Low-streak regression PASS (yield 6.0, streak 2 — was FAIL before)",
        "data": _make_fixture(dy=6.0, streak=2, growth_streak=1),
        "expect_status": "PASS",
    },
    {
        "name": "5. Yield-spike signal (yield 8.0, 5y_avg 4.0)",
        "data": _make_fixture(dy=8.0, streak=10, growth_streak=2, yield_5y=4.0),
        "expect_signals_in": ["YIELD_SPIKE_FROM_PRICE_DROP"],
    },
]


def _run():
    failures = []
    for case in CASES:
        data = case["data"]
        status, reasons = hard_filter(data)
        signals = assign_signals(data, total_score=70)
        ok = True
        notes = []
        if "expect_status" in case and status != case["expect_status"]:
            ok = False
            notes.append(f"status={status} expected={case['expect_status']}")
        if "expect_reason_contains" in case:
            joined = " | ".join(reasons)
            if case["expect_reason_contains"] not in joined:
                ok = False
                notes.append(f"reasons={joined!r} missing {case['expect_reason_contains']!r}")
        for sig in case.get("expect_signals_in", []):
            if sig not in signals:
                ok = False
                notes.append(f"signal {sig!r} missing (signals={signals})")
        for sig in case.get("expect_signals_not_in", []):
            if sig in signals:
                ok = False
                notes.append(f"signal {sig!r} should NOT be present (signals={signals})")
        label = "[PASS]" if ok else "[FAIL]"
        print(f"{label} {case['name']}")
        if notes:
            for n in notes:
                print(f"       - {n}")
        if not ok:
            failures.append(case["name"])
    print()
    if failures:
        print(f"[FAIL] {len(failures)} case(s) failed: {failures}")
        sys.exit(1)
    print(f"[PASS] all {len(CASES)} cases passed")
    sys.exit(0)


if __name__ == "__main__":
    _run()
