"""Smoke test for yahoo DPS fetch resilience + cache integrity guard.

Fixture + mock-based - does not fetch real market data.
Verifies _fetch_yahoo_supplement retry logic + _save_to_cache integrity guard.
"""
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))


# === Cache guard tests ===

def test_cache_skip_when_dy_positive_but_dps_empty():
    from fetch_data import _save_to_cache, _cache_dir_today
    cache_dir = _cache_dir_today()
    cache_dir.mkdir(parents=True, exist_ok=True)
    test_sym = "_SMOKETEST_GUARD_A.BK"
    p = cache_dir / f"{test_sym}.json"
    if p.exists():
        p.unlink()
    data = {"symbol": test_sym, "price": 100, "dividend_yield": 5.0, "dividend_history": {}}
    _save_to_cache(test_sym, data)
    assert not p.exists(), f"expected cache skip but file exists: {p}"
    print("[PASS] cache skip when yield>0 + dps empty (poisoned data)")


def test_cache_save_when_dy_zero_dps_empty():
    from fetch_data import _save_to_cache, _cache_dir_today
    cache_dir = _cache_dir_today()
    cache_dir.mkdir(parents=True, exist_ok=True)
    test_sym = "_SMOKETEST_GUARD_B.BK"
    p = cache_dir / f"{test_sym}.json"
    if p.exists():
        p.unlink()
    data = {"symbol": test_sym, "price": 100, "dividend_yield": 0, "dividend_history": {}}
    _save_to_cache(test_sym, data)
    assert p.exists(), "expected cache save but no file (legit non-dividend stock)"
    p.unlink()
    print("[PASS] cache save when yield=0 + dps empty (legit non-dividend stock)")


def test_cache_save_when_dy_positive_dps_filled():
    from fetch_data import _save_to_cache, _cache_dir_today
    cache_dir = _cache_dir_today()
    cache_dir.mkdir(parents=True, exist_ok=True)
    test_sym = "_SMOKETEST_GUARD_C.BK"
    p = cache_dir / f"{test_sym}.json"
    if p.exists():
        p.unlink()
    data = {
        "symbol": test_sym,
        "price": 100,
        "dividend_yield": 5.0,
        "dividend_history": {2024: 1.5, 2023: 1.4, 2022: 1.3},
    }
    _save_to_cache(test_sym, data)
    assert p.exists(), "expected cache save (normal case)"
    p.unlink()
    print("[PASS] cache save when yield>0 + dps filled (normal)")


# === Yahoo retry tests ===

def _build_mock_ticker(dividend_history_fn):
    mock_tk = MagicMock()
    mock_tk.dividend_history = dividend_history_fn
    mock_tk.summary_detail = {"TEST.BK": {"dividendYield": 0.05, "trailingPE": 10}}
    mock_tk.price = {"TEST.BK": {"regularMarketPrice": 100, "shortName": "TEST", "currency": "THB"}}
    mock_tk.key_stats = {"TEST.BK": {}}
    mock_tk.financial_data = {"TEST.BK": {}}
    mock_tk.cash_flow.return_value = pd.DataFrame()
    mock_tk.income_statement.return_value = pd.DataFrame()
    return mock_tk


def _success_dividend_df():
    idx = pd.MultiIndex.from_tuples([
        ("TEST.BK", pd.Timestamp("2022-04-01")),
        ("TEST.BK", pd.Timestamp("2023-04-01")),
        ("TEST.BK", pd.Timestamp("2024-04-01")),
    ], names=["symbol", "date"])
    return pd.DataFrame({"dividends": [1.0, 1.1, 1.2]}, index=idx)


def test_yahoo_retry_succeeds_on_3rd_attempt():
    call_count = {"n": 0}

    def flaky(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] < 3:
            raise Exception(f"simulated flake {call_count['n']}")
        return _success_dividend_df()

    mock_tk = _build_mock_ticker(flaky)
    with patch("yahooquery.Ticker", return_value=mock_tk):
        from data_adapter import _fetch_yahoo_supplement
        result = _fetch_yahoo_supplement("TEST.BK")
    assert call_count["n"] == 3, f"expected 3 attempts, got {call_count['n']}"
    dps = result.get("dps_by_year", {})
    assert len(dps) > 0, f"expected DPS after retry, got: {dps}"
    print(f"[PASS] yahoo retry succeeds on 3rd attempt (got {len(dps)} years)")


def test_yahoo_retry_gives_up_after_3_attempts():
    call_count = {"n": 0}

    def always_fail(*args, **kwargs):
        call_count["n"] += 1
        raise Exception(f"persistent flake {call_count['n']}")

    mock_tk = _build_mock_ticker(always_fail)
    with patch("yahooquery.Ticker", return_value=mock_tk):
        from data_adapter import _fetch_yahoo_supplement
        result = _fetch_yahoo_supplement("TEST.BK")
    assert call_count["n"] == 3, f"expected exactly 3 attempts, got {call_count['n']}"
    assert result.get("dps_by_year", {}) == {}, "expected empty DPS after persistent failure"
    print("[PASS] yahoo retry gives up cleanly after 3 attempts")


if __name__ == "__main__":
    failures = []
    tests = [
        test_cache_skip_when_dy_positive_but_dps_empty,
        test_cache_save_when_dy_zero_dps_empty,
        test_cache_save_when_dy_positive_dps_filled,
        test_yahoo_retry_succeeds_on_3rd_attempt,
        test_yahoo_retry_gives_up_after_3_attempts,
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
