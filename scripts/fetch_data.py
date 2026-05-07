"""Max Mahon v4 — fetch multi-year Thai stock fundamentals.

Primary: thaifin (10+ years Thai financials)
Supplement: yahooquery (realtime price, DPS events, capex + interest_expense per year)
No fallback: if thaifin fails the stock is treated as delisted/missing.
"""

import json
import logging
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

import pandas as pd

logger = logging.getLogger(__name__)

# Ensure project root is in sys.path for `from scripts.xxx` imports
_project_root = str(Path(__file__).resolve().parent.parent)
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from scripts.data_adapter import fetch_fundamentals as _adapter_fetch
from scripts.data_adapter import fetch_from_thaifin

ROOT = Path(__file__).resolve().parent.parent
USER_DATA = ROOT / "user_data.json"
DATA_DIR = ROOT / "data"

FINANCIAL_SECTORS = {"Financial Services", "Banking", "Insurance"}


def safe_get(df, row_name, col):
    try:
        val = df.loc[row_name, col]
        if pd.isna(val):
            return None
        return float(val)
    except (KeyError, TypeError):
        return None


def safe_div(a, b):
    if a is None or b is None or b == 0:
        return None
    return a / b


def normalize_yield(val):
    if val is None:
        return None
    if val < 1:
        return val * 100
    return val


def compute_cagr(values, reject_negatives=False):
    # If reject_negatives, return None if any value is negative (e.g. EPS with loss years)
    if reject_negatives and any(v is not None and v < 0 for v in values):
        return None
    clean = [(i, v) for i, v in enumerate(values) if v is not None and v > 0]
    if len(clean) < 2:
        return None
    first_i, first_v = clean[0]
    last_i, last_v = clean[-1]
    years = last_i - first_i
    if years <= 0:
        return None
    try:
        return (last_v / first_v) ** (1 / years) - 1
    except (ValueError, ZeroDivisionError):
        return None


def count_dividend_streak(dps_by_year):
    if not dps_by_year:
        return 0
    current_year = datetime.now().year
    years = [y for y in sorted(dps_by_year.keys(), reverse=True) if y < current_year]
    streak = 0
    for y in years:
        if dps_by_year[y] > 0:
            streak += 1
        else:
            break
    return streak


def count_dividend_growth_streak(dps_by_year):
    if not dps_by_year:
        return 0
    current_year = datetime.now().year
    years = [y for y in sorted(dps_by_year.keys(), reverse=True) if y < current_year]
    streak = 0
    for i in range(len(years) - 1):
        if dps_by_year[years[i]] > dps_by_year[years[i + 1]] and dps_by_year[years[i + 1]] > 0:
            streak += 1
        else:
            break
    return streak


def validate_metrics(info, yearly_metrics):
    warnings = []
    dy = normalize_yield(info.get("dividendYield"))
    if dy is not None and dy > 15:
        warnings.append(f"yield {dy:.0f}% ผิดปกติ — ตรวจสอบข้อมูล")

    eg = info.get("earningsGrowth")
    if eg is not None and abs(eg) > 3:
        warnings.append(f"earnings growth {eg*100:.0f}% — อาจเป็น base effect หรือข้อมูลผิด")

    payout = info.get("payoutRatio")
    if payout is not None and payout > 1.5:
        warnings.append(f"payout {payout*100:.0f}% — จ่ายเกินกำไร")

    for ym in yearly_metrics:
        roe = ym.get("roe")
        if roe is not None and abs(roe) > 1.5:
            warnings.append(f"ROE {roe*100:.0f}% ปี {ym['year']} — สูงผิดปกติ")
            break

    return warnings


def _build_aggregates(yearly_metrics, dps_by_year):
    """Compute aggregates from yearly_metrics and dividend history."""
    revenues = [m["revenue"] for m in yearly_metrics]
    eps_list = [m["diluted_eps"] for m in yearly_metrics]
    roe_list = [m["roe"] for m in yearly_metrics if m["roe"] is not None]
    nm_list = [m["net_margin"] for m in yearly_metrics if m["net_margin"] is not None]
    gm_list = [m["gross_margin"] for m in yearly_metrics if m["gross_margin"] is not None]
    om_list = [m["operating_margin"] for m in yearly_metrics if m["operating_margin"] is not None]
    fcf_list = [m["fcf"] for m in yearly_metrics if m["fcf"] is not None]

    revenue_cagr = compute_cagr(revenues)
    eps_cagr = compute_cagr(eps_list, reject_negatives=True)
    avg_roe = sum(roe_list) / len(roe_list) if roe_list else None
    avg_net_margin = sum(nm_list) / len(nm_list) if nm_list else None
    min_roe = min(roe_list) if roe_list else None

    revenue_positive_years = sum(1 for i in range(1, len(revenues))
                                  if revenues[i] is not None and revenues[i - 1] is not None
                                  and revenues[i] > revenues[i - 1])
    total_revenue_comparisons = sum(1 for i in range(1, len(revenues))
                                     if revenues[i] is not None and revenues[i - 1] is not None)

    eps_positive_years = sum(1 for e in eps_list if e is not None and e > 0)
    fcf_positive_years = sum(1 for f in fcf_list if f > 0)

    div_streak = count_dividend_streak(dps_by_year)
    div_growth_streak = count_dividend_growth_streak(dps_by_year)

    # dps_cagr from dividend_history
    dps_years = sorted([y for y in dps_by_year if dps_by_year[y] and dps_by_year[y] > 0])
    if len(dps_years) >= 2:
        first_dps = dps_by_year[dps_years[0]]
        last_dps = dps_by_year[dps_years[-1]]
        n_years = dps_years[-1] - dps_years[0]
        if first_dps > 0 and n_years > 0:
            dps_cagr = (last_dps / first_dps) ** (1 / n_years) - 1
        else:
            dps_cagr = None
    else:
        dps_cagr = None

    latest = yearly_metrics[-1] if yearly_metrics else {}

    avg_gross_margin = sum(gm_list) / len(gm_list) if gm_list else None
    avg_operating_margin = sum(om_list) / len(om_list) if om_list else None

    return {
        "revenue_cagr": revenue_cagr,
        "eps_cagr": eps_cagr,
        "dps_cagr": dps_cagr,
        "avg_roe": avg_roe,
        "min_roe": min_roe,
        "avg_net_margin": avg_net_margin,
        "avg_gross_margin": avg_gross_margin,
        "avg_operating_margin": avg_operating_margin,
        "revenue_growth_years": revenue_positive_years,
        "revenue_growth_total_comparisons": total_revenue_comparisons,
        "eps_positive_years": eps_positive_years,
        "eps_total_years": len([e for e in eps_list if e is not None]),
        "fcf_positive_years": fcf_positive_years,
        "fcf_total_years": len(fcf_list),
        "dividend_streak": div_streak,
        "dividend_growth_streak": div_growth_streak,
        "years_of_data": len(yearly_metrics),
        "latest_interest_coverage": latest.get("interest_coverage"),
        "latest_ocf_ni_ratio": latest.get("ocf_ni_ratio"),
        "latest_capital_intensity": latest.get("capital_intensity"),
    }




CACHE_ROOT = Path(__file__).parent.parent / 'data' / 'screener_cache'


def _cache_dir_today() -> Path:
    today = datetime.now().strftime('%Y-%m-%d')
    return CACHE_ROOT / today


def _load_from_cache(symbol: str) -> dict | None:
    p = _cache_dir_today() / f'{symbol}.json'
    if not p.exists():
        return None
    try:
        data = json.loads(p.read_text(encoding='utf-8'))
        # Sanity check: fetched_at must be from today (cache file might be stale on day rollover)
        fa = data.get('fetched_at', '')
        if fa.startswith(datetime.now().strftime('%Y-%m-%d')):
            return data
    except Exception:
        pass
    return None


def _save_to_cache(symbol: str, data: dict) -> None:
    if not data or data.get('delisted') or not data.get('price'):
        return  # don't cache failures
    # Integrity guard: stock has dividend_yield > 0 (SETSMART/thaifin confirms it pays dividends)
    # but dividend_history is empty = yahoo fetch flake; don't poison the day's cache
    dy = data.get('dividend_yield')
    div_history = data.get('dividend_history') or {}
    if dy is not None and dy > 0 and not div_history:
        logger.warning("cache skip for %s: dividend_yield=%.2f%% but dividend_history empty (suspected yahoo flake)",
                       symbol, dy)
        return
    cache_dir = _cache_dir_today()
    cache_dir.mkdir(parents=True, exist_ok=True)
    p = cache_dir / f'{symbol}.json'
    try:
        p.write_text(json.dumps(data, ensure_ascii=False, default=str), encoding='utf-8')
    except Exception as e:
        logger.warning(f'cache save failed for {symbol}: {e}')


def fetch_multi_year(symbol: str) -> dict:
    """Fetch multi-year fundamentals. thaifin primary, yahooquery supplement, no fallback."""
    # Try thaifin + yahooquery supplement via adapter
    adapter_result = _adapter_fetch(symbol)

    if adapter_result is not None and "error" not in adapter_result:
        # Adapter succeeded — compute aggregates and finalize
        yearly_metrics = adapter_result["yearly_metrics"]
        dividend_history = adapter_result["dividend_history"]

        aggregates = _build_aggregates(yearly_metrics, dividend_history)

        # Validate
        # Build a minimal info-like dict for validate_metrics
        info_for_validate = {
            "dividendYield": adapter_result.get("dividend_yield"),
            "earningsGrowth": adapter_result.get("earnings_growth"),
            "payoutRatio": adapter_result.get("payout_ratio"),
        }
        warnings = validate_metrics(info_for_validate, yearly_metrics)

        adapter_result["aggregates"] = aggregates
        adapter_result["warnings"] = warnings
        adapter_result["fetched_at"] = datetime.now().isoformat()
        return adapter_result

    if adapter_result is not None and "error" in adapter_result:
        return adapter_result

    # No legacy fallback — thaifin is single source of truth for fundamentals
    return {"symbol": symbol, "delisted": True, "error": "thaifin fetch returned no data"}


def fetch_multi_year_safe(symbol: str, use_cache: bool = True) -> dict:
    """Wrap fetch_multi_year with try/except + day-scoped cache.

    Returns cached data if same-day cache hit (instant). Otherwise fetches
    + caches successful results. Failures (delisted, no price) NOT cached.
    """
    if use_cache:
        cached = _load_from_cache(symbol)
        if cached is not None:
            return cached
    try:
        result = fetch_multi_year(symbol)
    except Exception as e:
        logger.warning(f"fetch failed for {symbol}: {e}")
        return {"symbol": symbol, "delisted": True, "error": str(e)}
    if isinstance(result, dict) and "error" in result and not result.get("price"):
        err = result.get("error", "unknown")
        logger.warning(f"fetch returned error for {symbol}: {err}")
        return {"symbol": symbol, "delisted": True, "error": str(err)}
    if use_cache:
        _save_to_cache(symbol, result)
    return result


def main():
    # Read from user_data.json (new format)
    user_data = json.loads(USER_DATA.read_text(encoding="utf-8"))
    symbols = user_data.get("watchlist", [])

    print(f"Max Mahon v4 fetching {len(symbols)} stocks (multi-year, parallel)...")

    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=5) as ex:
        futures = {ex.submit(fetch_multi_year_safe, sym): sym for sym in symbols}
        for n, future in enumerate(as_completed(futures), 1):
            sym = futures[future]
            try:
                data = future.result()
            except Exception as e:
                print(f"  [{n}/{len(symbols)}] {sym} ERROR: {e}")
                results.append({"symbol": sym, "error": str(e)})
                continue
            # Ensure symbol field is set (defensive — for deterministic sort below)
            if not data.get("symbol"):
                data["symbol"] = sym
            results.append(data)
            if data.get("delisted"):
                print(f"  [{n}/{len(symbols)}] {sym} DELISTED/ERROR: {data.get('error', 'unknown')}")
                continue
            if "error" in data:
                print(f"  [{n}/{len(symbols)}] {sym} ERROR: {data['error']}")
                continue
            price = data.get("price") or "N/A"
            dy = data.get("dividend_yield")
            dy_str = f"{dy:.1f}%" if dy else "N/A"
            years = data["aggregates"]["years_of_data"]
            streak = data["aggregates"]["dividend_streak"]
            warns = len(data.get("warnings", []))
            warn_str = f" ⚠{warns}" if warns > 0 else ""
            print(f"  [{n}/{len(symbols)}] {sym} ฿{price} yield={dy_str} | {years}yr | streak={streak}yr{warn_str}")

    # Sort results to match original symbol order (deterministic output)
    sym_order = {s: i for i, s in enumerate(symbols)}
    results.sort(key=lambda d: sym_order.get(d.get("symbol"), 999999))

    today = datetime.now().strftime("%Y-%m-%d")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out_path = DATA_DIR / f"snapshot_{today}.json"
    out_path.write_text(
        json.dumps(
            {"date": today, "agent": "Max Mahon v4", "stocks": results},
            ensure_ascii=False,
            indent=2,
            default=str,
        ),
        encoding="utf-8",
    )
    print(f"\nSaved → {out_path}")
    return out_path


if __name__ == "__main__":
    main()
