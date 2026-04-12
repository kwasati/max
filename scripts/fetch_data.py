"""Max Mahon v2 — fetch multi-year Thai stock fundamentals from yfinance.

Pulls 4-5 years of financial statements + 10+ years of dividend history,
computes yearly metrics (ROE, margins, D/E, etc.), aggregates (CAGR, streaks),
and sanity-checks for data anomalies.
"""

import json
import math
import sys
import time
from datetime import datetime
from pathlib import Path

import yfinance as yf
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
WATCHLIST = ROOT / "watchlist.json"
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


def compute_cagr(values):
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
    years = sorted(dps_by_year.keys(), reverse=True)
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
    years = sorted(dps_by_year.keys(), reverse=True)
    streak = 0
    for i in range(len(years) - 1):
        if dps_by_year[years[i]] >= dps_by_year[years[i + 1]] and dps_by_year[years[i + 1]] > 0:
            streak += 1
        else:
            break
    return streak


def validate_metrics(info, yearly_metrics):
    warnings = []
    dy = normalize_yield(info.get("dividendYield"))
    if dy is not None and dy > 20:
        warnings.append(f"yield {dy:.0f}% ผิดปกติ — ตรวจสอบข้อมูล")

    eg = info.get("earningsGrowth")
    if eg is not None and abs(eg) > 3:
        warnings.append(f"earnings growth {eg*100:.0f}% — อาจเป็น base effect หรือข้อมูลผิด")

    payout = info.get("payoutRatio")
    if payout is not None and payout > 1.5:
        warnings.append(f"payout {payout*100:.0f}% — จ่ายเกินกำไร")

    for ym in yearly_metrics:
        roe = ym.get("roe")
        if roe is not None and abs(roe) > 0.5:
            warnings.append(f"ROE {roe*100:.0f}% ปี {ym['year']} — สูงผิดปกติ")
            break

    return warnings


def fetch_multi_year(symbol: str) -> dict:
    tk = yf.Ticker(symbol)
    info = tk.info or {}

    if len(info) < 5:
        return {"symbol": symbol, "error": f"near-empty info ({len(info)} keys)"}

    sector = info.get("sector", "N/A")
    is_financial = sector in FINANCIAL_SECTORS

    # --- Income Statement ---
    inc = tk.income_stmt
    bs = tk.balance_sheet
    cf = tk.cashflow
    divs = tk.dividends

    yearly_metrics = []
    years_available = []

    if inc is not None and len(inc.columns) > 0:
        for col in inc.columns:
            year = col.year if hasattr(col, 'year') else col.date().year
            year_str = str(year)

            revenue = safe_get(inc, "Total Revenue", col)
            gross_profit = safe_get(inc, "Gross Profit", col)
            operating_income = safe_get(inc, "Operating Income", col)
            net_income = safe_get(inc, "Net Income", col)
            ebitda = safe_get(inc, "EBITDA", col)
            interest_expense = safe_get(inc, "Interest Expense", col)
            diluted_eps = safe_get(inc, "Diluted EPS", col)

            equity = safe_get(bs, "Stockholders Equity", col) if bs is not None else None
            total_debt = safe_get(bs, "Total Debt", col) if bs is not None else None
            total_assets = safe_get(bs, "Total Assets", col) if bs is not None else None
            current_assets = safe_get(bs, "Current Assets", col) if bs is not None else None
            current_liab = safe_get(bs, "Current Liabilities", col) if bs is not None else None

            # Cashflow — may have fewer columns, match by year
            ocf = None
            fcf = None
            capex = None
            div_paid = None
            if cf is not None:
                for cf_col in cf.columns:
                    cf_year = cf_col.year if hasattr(cf_col, 'year') else cf_col.date().year
                    if cf_year == year:
                        ocf = safe_get(cf, "Operating Cash Flow", cf_col)
                        fcf = safe_get(cf, "Free Cash Flow", cf_col)
                        capex = safe_get(cf, "Capital Expenditure", cf_col)
                        div_paid = safe_get(cf, "Cash Dividends Paid", cf_col)
                        break

            if revenue is None and net_income is None:
                continue

            roe = safe_div(net_income, equity)
            gross_margin = safe_div(gross_profit, revenue) if not is_financial else None
            net_margin = safe_div(net_income, revenue)
            operating_margin = safe_div(operating_income, revenue)
            de_ratio = safe_div(total_debt, equity)
            current_ratio = safe_div(current_assets, current_liab)
            interest_coverage = safe_div(ebitda, abs(interest_expense)) if interest_expense and interest_expense != 0 else None
            ocf_ni_ratio = safe_div(ocf, net_income) if net_income and net_income > 0 else None
            capital_intensity = safe_div(abs(capex) if capex else None, ocf) if ocf and ocf > 0 else None

            yearly_metrics.append({
                "year": year_str,
                "revenue": revenue,
                "gross_profit": gross_profit,
                "operating_income": operating_income,
                "net_income": net_income,
                "ebitda": ebitda,
                "interest_expense": interest_expense,
                "diluted_eps": diluted_eps,
                "equity": equity,
                "total_debt": total_debt,
                "total_assets": total_assets,
                "ocf": ocf,
                "fcf": fcf,
                "capex": capex,
                "dividends_paid": div_paid,
                "roe": roe,
                "gross_margin": gross_margin,
                "net_margin": net_margin,
                "operating_margin": operating_margin,
                "de_ratio": de_ratio,
                "current_ratio": current_ratio,
                "interest_coverage": interest_coverage,
                "ocf_ni_ratio": ocf_ni_ratio,
                "capital_intensity": capital_intensity,
            })
            years_available.append(year)

    yearly_metrics.sort(key=lambda x: x["year"])

    # --- Dividends grouped by year ---
    dps_by_year = {}
    if divs is not None and len(divs) > 0:
        for idx, val in divs.items():
            y = idx.year
            dps_by_year[y] = dps_by_year.get(y, 0) + val

    # --- Aggregates ---
    revenues = [m["revenue"] for m in yearly_metrics]
    eps_list = [m["diluted_eps"] for m in yearly_metrics]
    roe_list = [m["roe"] for m in yearly_metrics if m["roe"] is not None]
    nm_list = [m["net_margin"] for m in yearly_metrics if m["net_margin"] is not None]
    fcf_list = [m["fcf"] for m in yearly_metrics if m["fcf"] is not None]

    revenue_cagr = compute_cagr(revenues)
    eps_cagr = compute_cagr(eps_list)
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

    latest = yearly_metrics[-1] if yearly_metrics else {}

    aggregates = {
        "revenue_cagr": revenue_cagr,
        "eps_cagr": eps_cagr,
        "avg_roe": avg_roe,
        "min_roe": min_roe,
        "avg_net_margin": avg_net_margin,
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

    # --- Sanity check ---
    warnings = validate_metrics(info, yearly_metrics)

    # --- TTM snapshot (backward compat) ---
    raw_dy = info.get("dividendYield")
    dy = normalize_yield(raw_dy)

    recent_divs = divs.tail(8).tolist() if divs is not None and len(divs) > 0 else []

    return {
        "symbol": symbol,
        "name": info.get("shortName", symbol),
        "sector": sector,
        "industry": info.get("industry", "N/A"),
        "currency": info.get("currency", "THB"),
        "price": info.get("currentPrice") or info.get("regularMarketPrice"),
        "market_cap": info.get("marketCap"),
        "pe_ratio": info.get("trailingPE"),
        "forward_pe": info.get("forwardPE"),
        "pb_ratio": info.get("priceToBook"),
        "dividend_yield": dy,
        "dividend_rate": info.get("dividendRate"),
        "payout_ratio": info.get("payoutRatio"),
        "five_year_avg_yield": info.get("fiveYearAvgDividendYield"),
        "eps_trailing": info.get("trailingEps"),
        "eps_forward": info.get("forwardEps"),
        "revenue": info.get("totalRevenue"),
        "revenue_growth": info.get("revenueGrowth"),
        "earnings_growth": info.get("earningsGrowth"),
        "profit_margin": info.get("profitMargins"),
        "gross_margins": info.get("grossMargins"),
        "operating_margins": info.get("operatingMargins"),
        "roe": info.get("returnOnEquity"),
        "roa": info.get("returnOnAssets"),
        "debt_to_equity": info.get("debtToEquity"),
        "current_ratio": info.get("currentRatio"),
        "free_cashflow": info.get("freeCashflow"),
        "operating_cashflow": info.get("operatingCashflow"),
        "recent_dividends": recent_divs,
        "52w_high": info.get("fiftyTwoWeekHigh"),
        "52w_low": info.get("fiftyTwoWeekLow"),
        "50d_avg": info.get("fiftyDayAverage"),
        "200d_avg": info.get("twoHundredDayAverage"),
        "yearly_metrics": yearly_metrics,
        "dividend_history": dps_by_year,
        "aggregates": aggregates,
        "warnings": warnings,
        "fetched_at": datetime.now().isoformat(),
    }


def main():
    watchlist = json.loads(WATCHLIST.read_text(encoding="utf-8"))
    symbols = [s["symbol"] for s in watchlist["stocks"]]

    print(f"Max Mahon v2 fetching {len(symbols)} stocks (multi-year)...")
    results = []
    for i, sym in enumerate(symbols):
        try:
            print(f"  [{i+1}/{len(symbols)}] {sym}", end=" ")
            data = fetch_multi_year(sym)
            results.append(data)

            if "error" in data:
                print(f"ERROR: {data['error']}")
                continue

            price = data.get("price") or "N/A"
            dy = data.get("dividend_yield")
            dy_str = f"{dy:.1f}%" if dy else "N/A"
            years = data["aggregates"]["years_of_data"]
            streak = data["aggregates"]["dividend_streak"]
            warns = len(data.get("warnings", []))
            warn_str = f" ⚠{warns}" if warns > 0 else ""
            print(f"฿{price} yield={dy_str} | {years}yr data | div streak={streak}yr{warn_str}")
        except Exception as e:
            print(f"ERROR: {e}")
            results.append({"symbol": sym, "error": str(e)})

        time.sleep(0.3)

    today = datetime.now().strftime("%Y-%m-%d")
    out_path = DATA_DIR / f"snapshot_{today}.json"
    out_path.write_text(
        json.dumps(
            {"date": today, "agent": "Max Mahon v2", "stocks": results},
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
