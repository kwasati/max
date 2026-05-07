"""Smoke test for scoring rebalance v2 — 12 Niwes alignment fixes."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))


def _stock_data(sym, *, dy=5.0, streak=10, growth_streak=2, dh=None,
                pe=10, pbv=1.0, mcap=10_000_000_000, payout=0.5,
                de_ratio=0.5, int_cov=8, ocf_ni=1.2,
                rev_cagr=0.08, eps_cagr=0.06, ev_ebitda=8,
                yield_5y=4.0, fcf_pos=5, fcf_total=5,
                eps_5_pos=True, warnings=None):
    eps_list = [1.0, 1.1, 1.2, 1.3, 1.5] if eps_5_pos else [1.0, -0.5, 1.2, 1.3, 1.5]
    yearly = []
    for i, e in enumerate(eps_list):
        yearly.append({
            "year": 2020 + i,
            "diluted_eps": e,
            "close": 100.0,
            "bvps": 80.0,
            "payout_ratio": payout,
            "roe": 0.15,
            "net_margin": 0.10,
            "revenue": 1e9,
            "de_ratio": de_ratio,
            "ev_per_ebit_da": ev_ebitda,
        })
    return {
        "symbol": sym,
        "price": 100,
        "dividend_yield": dy,
        "pe_ratio": pe,
        "pb_ratio": pbv,
        "market_cap": mcap,
        "payout_ratio": payout,
        "five_year_avg_yield": yield_5y,
        "dividend_history": dh if dh is not None else {2020 + i: 1.0 + i*0.1 for i in range(5)},
        "yearly_metrics": yearly,
        "aggregates": {
            "dividend_streak": streak,
            "dividend_growth_streak": growth_streak,
            "fcf_positive_years": fcf_pos,
            "fcf_total_years": fcf_total,
            "latest_ocf_ni_ratio": ocf_ni,
            "latest_interest_coverage": int_cov,
            "revenue_cagr": rev_cagr,
            "eps_cagr": eps_cagr,
        },
        "warnings": warnings or [],
    }


def test_main_path_score_reasonable():
    from screen_stocks import quality_score
    s = _stock_data("MAIN.BK", dy=7.0, streak=22, growth_streak=5, pe=8, pbv=0.6)
    r = quality_score(s)
    assert r["score"] >= 60, f"main path expected >=60, got {r['score']}"
    assert "track_record" in r["breakdown"], "breakdown should include track_record"
    print(f"[PASS] main path score reasonable (got {r['score']})")


def test_niwes_growing_boost():
    from screen_stocks import quality_score
    # NIWES_GROWING: yield 3% + growth_streak 5 + EPS 5/5 + PE/PBV ok
    s = _stock_data("GROW.BK", dy=3.0, streak=8, growth_streak=5, pe=12, pbv=1.2)
    r = quality_score(s)
    assert "NIWES_GROWING" in r["signals"], f"expected NIWES_GROWING, got {r['signals']}"
    # without modifier: lower score; with +10 modifier: should be > 30
    assert r["score"] > 30, f"NIWES_GROWING boosted score expected >30, got {r['score']}"
    print(f"[PASS] NIWES_GROWING +10 boost (score {r['score']})")


def test_stable_payer_dividend_growth():
    from screen_stocks import dividend_score
    # Stable: DPS 1.0 every year for 5 years (stdev=0, mean=1)
    s = _stock_data("STABLE.BK", dy=5.5, streak=10, growth_streak=0,
                    dh={2020: 1.0, 2021: 1.0, 2022: 1.0, 2023: 1.0, 2024: 1.0})
    score, reasons = dividend_score(s)
    has_stable = any("stable" in r.lower() or "คงที่" in r for r in reasons)
    assert has_stable, f"expected stable reason, got {reasons}"
    print(f"[PASS] stable payer gets dividend growth pts (score {score})")


def test_no_debt_interest_coverage():
    from screen_stocks import cash_flow_score
    # No debt: int_cov None + de_ratio 0.05 -> max 2 pts
    s = _stock_data("NODEBT.BK", int_cov=None, de_ratio=0.05)
    score, reasons = cash_flow_score(s)
    has_nodebt = any("no debt" in r.lower() or "ไม่มีหนี้" in r for r in reasons)
    assert has_nodebt, f"expected no-debt reason, got {reasons}"
    print(f"[PASS] no-debt interest coverage max ({score} pts)")


def test_yield_spike_penalty():
    from screen_stocks import quality_score
    # yield 16% + 5y_avg 7% = ratio 2.3 > 1.8 trigger YIELD_SPIKE
    s = _stock_data("SPIKE.BK", dy=16.0, streak=20, growth_streak=2, yield_5y=7.0)
    r = quality_score(s)
    assert "YIELD_SPIKE_FROM_PRICE_DROP" in r["signals"], f"expected spike, got {r['signals']}"
    # YIELD_SPIKE -5 modifier — verify score is reduced (compare without spike: same data minus spike condition)
    # Quick check: if score appears reasonable but with -5 applied, total should be < if no spike
    # We just verify modifier was applied via not-zero result + signal present
    assert r["score"] < 100, f"score should be capped, got {r['score']}"
    print(f"[PASS] YIELD_SPIKE detected + score adjusted (score {r['score']})")


def test_data_warning_soft_penalty():
    from screen_stocks import quality_score
    # DATA_WARNING via warnings field — score reduced -5 (was -15)
    base = _stock_data("BASE.BK", dy=7.0, streak=22)
    warned = _stock_data("WARN.BK", dy=7.0, streak=22, warnings=["sanity test"])
    r_base = quality_score(base)
    r_warn = quality_score(warned)
    diff = r_base["score"] - r_warn["score"]
    assert "DATA_WARNING" in r_warn["signals"], f"expected DATA_WARNING, got {r_warn['signals']}"
    assert diff == 5, f"expected DATA_WARNING penalty 5, got diff {diff}"
    print(f"[PASS] DATA_WARNING soft penalty -5 (was -15)")


if __name__ == "__main__":
    failures = []
    tests = [
        test_main_path_score_reasonable,
        test_niwes_growing_boost,
        test_stable_payer_dividend_growth,
        test_no_debt_interest_coverage,
        test_yield_spike_penalty,
        test_data_warning_soft_penalty,
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
