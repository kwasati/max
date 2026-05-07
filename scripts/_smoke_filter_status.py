"""Smoke test for filter_status banner backend (Plan: report-filter-status-banner).

Validates that ``server.app.get_stock`` emits the correct ``filter_status`` field
plus ancillary metadata for the three screener buckets:

- candidates           -> filter_status='PASS'  (preserves score + breakdown)
- review_candidates    -> filter_status='REVIEW' (exposes review_reasons)
- filtered_out_stocks  -> filter_status='FAIL'   (score=0, breakdown all zeros)

Filesystem + SETSMART + narrative dependencies are patched out so the test
runs without real data files.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))


def _call_get_stock(symbol: str, screener_data: dict) -> dict:
    """Invoke get_stock() with mocked filesystem + SETSMART + narrative deps."""
    from server import app as app_mod

    # Use a real Path so downstream `_resolve_price_as_of` can call
    # `.stem` / regex without choking on MagicMock attributes.
    fake_screener_path = Path("screener_2099-01-01.json")

    def fake_find_latest(pattern: str, *_args, **_kwargs):
        if pattern.startswith("screener"):
            return fake_screener_path
        return None  # no snapshot, no other latest files

    def fake_read_json(_path):
        return screener_data

    fake_user = {
        "user_id": "test-user",
        "email": "t@t",
        "role": "admin",
        "name": "tester",
    }

    # Stub SETSMART cache dir so the override block finds zero files and exits cleanly.
    fake_cache_dir = MagicMock()
    fake_cache_dir.glob.return_value = []

    with patch.object(app_mod, "find_latest", side_effect=fake_find_latest), \
         patch.object(app_mod, "read_json", side_effect=fake_read_json), \
         patch.object(app_mod, "_load_cached_narrative",
                      return_value={"case_text": None, "lede": None}), \
         patch.object(app_mod, "_build_five_year_history", return_value={}), \
         patch.object(app_mod, "_build_dividend_history_10y", return_value=[]), \
         patch.object(app_mod, "load_user_data", return_value={"watchlist": []}):
        # Patch SETSMART CACHE_DIR via the adapter module — get_stock imports it
        # lazily inside the try-block, so patch it on the source module. Even if
        # the import itself fails the get_stock function logs a warning and
        # continues, so the override block is non-blocking either way.
        try:
            import setsmart_adapter  # noqa: F401
            with patch("setsmart_adapter.CACHE_DIR", fake_cache_dir):
                return asyncio.run(app_mod.get_stock(symbol, user=fake_user))
        except ImportError:
            return asyncio.run(app_mod.get_stock(symbol, user=fake_user))


def test_pass_candidates_lookup():
    """Stock in screener.candidates -> filter_status='PASS' + breakdown preserved."""
    screener = {
        "candidates": [
            {
                "symbol": "BBL.BK",
                "score": 80,
                "breakdown": {
                    "dividend": 40,
                    "valuation": 20,
                    "cash_flow": 8,
                    "hidden_value": 5,
                    "track_record": 7,
                },
                "signals": ["NIWES_5555"],
                "reasons": ["passes filter"],
                "metrics": {"pe": 8.5},
            }
        ],
        "review_candidates": [],
        "filtered_out_stocks": [],
    }
    result = _call_get_stock("BBL.BK", screener)
    assert result.get("filter_status") == "PASS", \
        f"expected PASS got {result.get('filter_status')}"
    assert result.get("score") == 80, f"expected score=80 got {result.get('score')}"
    bd = result.get("breakdown", {})
    assert bd.get("dividend") == 40, f"expected breakdown.dividend=40 got {bd}"
    assert bd.get("valuation") == 20
    assert bd.get("track_record") == 7
    print("[PASS] candidates lookup -> filter_status='PASS' + breakdown preserved")


def test_review_candidates_lookup():
    """Stock in review_candidates -> filter_status='REVIEW' + review_reasons exposed.

    Mirrors production screener payload (screen_stocks.py line ~893): review entries
    have NO ``score`` or ``breakdown`` keys — only ``review_reasons``.
    """
    screener = {
        "candidates": [],
        "review_candidates": [
            {
                "symbol": "REVCO.BK",
                "name": "REVCO.BK",
                "sector": "N/A",
                "review_reasons": [
                    "EPS 4/5 ปี (COVID exception)",
                    "ตรวจสอบเพิ่มเติม",
                ],
            }
        ],
        "filtered_out_stocks": [],
    }
    result = _call_get_stock("REVCO.BK", screener)
    assert result.get("filter_status") == "REVIEW", \
        f"expected REVIEW got {result.get('filter_status')}"
    review_reasons = result.get("review_reasons") or []
    assert review_reasons, f"expected non-empty review_reasons got {review_reasons!r}"
    assert "EPS 4/5" in review_reasons[0], \
        f"expected EPS 4/5 in first review_reason got {review_reasons[0]!r}"
    print("[PASS] review_candidates lookup -> filter_status='REVIEW' + review_reasons")


def test_filtered_out_stocks_lookup():
    """Stock in filtered_out_stocks -> filter_status='FAIL' + breakdown all zeros + score=0.

    Mirrors production screener payload (screen_stocks.py line ~872): filtered-out
    entries have NO ``score`` or ``breakdown`` keys; get_stock applies all-zero
    defaults via ``setdefault`` so the report UI can render the score card.
    """
    screener = {
        "candidates": [],
        "review_candidates": [],
        "filtered_out_stocks": [
            {
                "symbol": "METCO.BK",
                "name": "METCO.BK",
                "sector": "N/A",
                "filter_reasons": ["ไม่มีข้อมูลปันผลย้อนหลัง (yahoo flake)"],
                "reasons": ["ไม่มีข้อมูลปันผลย้อนหลัง (yahoo flake)"],
            }
        ],
    }
    result = _call_get_stock("METCO.BK", screener)
    assert result.get("filter_status") == "FAIL", \
        f"expected FAIL got {result.get('filter_status')}"
    assert result.get("score") == 0, f"expected score=0 got {result.get('score')}"
    bd = result.get("breakdown", {})
    assert bd.get("dividend") == 0, f"breakdown.dividend not zero: {bd}"
    assert bd.get("valuation") == 0, f"breakdown.valuation not zero: {bd}"
    assert bd.get("cash_flow") == 0, f"breakdown.cash_flow not zero: {bd}"
    assert bd.get("hidden_value") == 0, f"breakdown.hidden_value not zero: {bd}"
    assert bd.get("track_record") == 0, f"breakdown.track_record not zero: {bd}"
    filter_reasons = result.get("filter_reasons") or []
    assert filter_reasons, f"expected non-empty filter_reasons got {filter_reasons!r}"
    assert "ปันผลย้อนหลัง" in filter_reasons[0], \
        f"expected dividend-history reason got {filter_reasons[0]!r}"
    print("[PASS] filtered_out_stocks lookup -> filter_status='FAIL' + breakdown all zero + score=0")


if __name__ == "__main__":
    failures: list[tuple[str, str]] = []
    tests = [
        test_pass_candidates_lookup,
        test_review_candidates_lookup,
        test_filtered_out_stocks_lookup,
    ]
    for fn in tests:
        try:
            fn()
        except Exception as e:  # noqa: BLE001 — smoke test wants every failure surfaced
            failures.append((fn.__name__, repr(e)))
            print(f"[FAIL] {fn.__name__}: {e!r}")
    print()
    if failures:
        print(f"[FAIL] {len(failures)} of {len(tests)} tests failed.")
        sys.exit(1)
    print(f"[PASS] all {len(tests)} tests passed")
    sys.exit(0)
