"""Smoke test for Stage 2 yahoo flake recovery + DATA_INCOMPLETE flow.

Fixture + mock-based — does not run real scan or fetch real data.
Verifies hard_filter guard + assign_signals DATA_INCOMPLETE tag.
Stage 2 main() logic is integration-tested via production scan rerun.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))


def _stock_data(sym, dy=5.0, dh=None, mcap=10_000_000_000, pe=10, pbv=1.0):
    return {
        "symbol": sym,
        "price": 100,
        "dividend_yield": dy,
        "pe_ratio": pe,
        "pb_ratio": pbv,
        "market_cap": mcap,
        "payout_ratio": 0.5,
        "five_year_avg_yield": 4.0,
        "dividend_history": dh or {},
        "yearly_metrics": [
            {"year": 2020 + i, "diluted_eps": 1.0 + i * 0.1, "close": 100, "bvps": 80,
             "payout_ratio": 0.5, "roe": 0.15, "net_margin": 0.1, "revenue": 1e9}
            for i in range(5)
        ],
        "aggregates": {
            "dividend_streak": (max(dh.keys()) - min(dh.keys()) + 1) if dh else 0,
            "dividend_growth_streak": 0,
        },
        "warnings": [],
    }


def test_hard_filter_guards_data_incomplete():
    from screen_stocks import hard_filter
    flake = _stock_data("FLAKE.BK", dy=5.0, dh=None)
    status, reasons = hard_filter(flake)
    assert status == "FAIL", f"expected FAIL, got {status}"
    assert any("ไม่มีข้อมูลปันผลย้อนหลัง" in r for r in reasons), f"expected guard reason, got {reasons}"
    print("[PASS] hard_filter blocks DATA_INCOMPLETE (FAIL with reason)")


def test_assign_signals_emits_data_incomplete_tag():
    from screen_stocks import assign_signals
    flake = _stock_data("FLAKE.BK", dy=5.0, dh=None)
    signals = assign_signals(flake, total_score=50)
    assert "DATA_INCOMPLETE" in signals, f"expected DATA_INCOMPLETE in signals, got {signals}"
    print("[PASS] assign_signals emits DATA_INCOMPLETE tag")


def test_healthy_stock_no_data_incomplete():
    from screen_stocks import assign_signals
    healthy = _stock_data("HEALTHY.BK", dy=5.0, dh={2020: 1.0, 2021: 1.1, 2022: 1.2, 2023: 1.3, 2024: 1.4})
    signals = assign_signals(healthy, total_score=50)
    assert "DATA_INCOMPLETE" not in signals, f"expected no DATA_INCOMPLETE, got {signals}"
    print("[PASS] healthy stock does not emit DATA_INCOMPLETE")


if __name__ == "__main__":
    failures = []
    tests = [
        test_hard_filter_guards_data_incomplete,
        test_assign_signals_emits_data_incomplete_tag,
        test_healthy_stock_no_data_incomplete,
    ]
    for fn in tests:
        try:
            fn()
        except AssertionError as e:
            failures.append(f"{fn.__name__}: {e}")
            print(f"[FAIL] {fn.__name__}: {e}")
        except Exception as e:
            failures.append(f"{fn.__name__}: {type(e).__name__}: {e}")
            print(f"[FAIL] {fn.__name__}: {type(e).__name__}: {e}")
    print()
    if failures:
        print(f"[FAIL] {len(failures)} test(s) failed: {failures}")
        sys.exit(1)
    print(f"[PASS] all {len(tests)} tests passed")
    sys.exit(0)
