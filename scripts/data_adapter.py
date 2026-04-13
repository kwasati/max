"""Data adapter — thaifin (primary) + yfinance (supplement).

thaifin provides 10+ years of Thai stock financials.
yfinance supplements with realtime price, 52w range, forward PE, payout ratio, etc.

Public API:
    normalize_symbol(raw) → (tf_sym, yf_sym)
    fetch_from_thaifin(symbol) → dict | None
    fetch_yfinance_supplement(symbol) → dict
    fetch_fundamentals(symbol) → dict | None  (combined thaifin + yfinance)
"""

import logging
import math
from datetime import datetime

import pandas as pd

logger = logging.getLogger(__name__)


def normalize_symbol(raw: str) -> tuple[str, str]:
    """Normalize symbol: 'LH' or 'LH.BK' → ('LH', 'LH.BK')."""
    base = raw.replace(".BK", "")
    return (base, f"{base}.BK")


def _to_yf_symbol(symbol: str) -> str:
    """Normalize symbol for yfinance: 'PTT' or 'PTT.BK' → 'PTT.BK'."""
    _, yf_sym = normalize_symbol(symbol)
    return yf_sym


def _to_tf_symbol(symbol: str) -> str:
    """Normalize symbol for thaifin: 'PTT.BK' or 'PTT' → 'PTT'."""
    tf_sym, _ = normalize_symbol(symbol)
    return tf_sym


def _safe(val):
    """Return None for NaN/inf, else float."""
    if val is None:
        return None
    try:
        f = float(val)
        if pd.isna(f) or not math.isfinite(f):
            return None
        return f
    except (TypeError, ValueError):
        return None


def _safe_pct(val):
    """Convert thaifin percentage (e.g. 15.0) → decimal (0.15). None-safe."""
    f = _safe(val)
    if f is None:
        return None
    return f / 100.0


def _safe_div(a, b):
    if a is None or b is None or b == 0:
        return None
    return a / b


def _fetch_thaifin(symbol: str) -> dict | None:
    """Fetch data from thaifin. Returns dict or None on failure."""
    try:
        from thaifin import Stock
        tf_sym = _to_tf_symbol(symbol)
        stock = Stock(tf_sym)
        df = stock.yearly_dataframe

        if df is None or df.empty:
            logger.warning("thaifin: empty data for %s", tf_sym)
            return None

        # Company info
        info = {
            "name": getattr(stock, "company_name", tf_sym),
            "sector": getattr(stock, "sector", "N/A"),
            "industry": getattr(stock, "industry", "N/A"),
        }

        # Build yearly_metrics from dataframe
        yearly_metrics = []
        dividend_yields = {}  # year → yield percentage
        closes = {}  # year → close price

        for year in df.index:
            # Index can be Period or int
            year_int = year.year if hasattr(year, 'year') else int(year)
            year_str = str(year_int)

            revenue = _safe(df.loc[year].get("revenue"))
            gross_profit = _safe(df.loc[year].get("gross_profit"))
            net_income = _safe(df.loc[year].get("net_profit"))
            diluted_eps = _safe(df.loc[year].get("earning_per_share"))
            sga = _safe(df.loc[year].get("sga"))
            equity = _safe(df.loc[year].get("equity"))
            total_debt = _safe(df.loc[year].get("total_debt"))
            total_assets = _safe(df.loc[year].get("asset"))
            ocf = _safe(df.loc[year].get("operating_activities"))
            investing = _safe(df.loc[year].get("investing_activities"))
            close = _safe(df.loc[year].get("close"))
            mkt_cap = _safe(df.loc[year].get("mkt_cap"))
            dy = _safe(df.loc[year].get("dividend_yield"))
            bvps = _safe(df.loc[year].get("book_value_per_share"))
            da = _safe(df.loc[year].get("da"))

            # Store for later use
            if dy is not None:
                dividend_yields[year_int] = dy  # percentage
            if close is not None:
                closes[year_int] = close

            # Skip rows with no meaningful data
            if revenue is None and net_income is None and diluted_eps is None:
                continue

            # Computed fields
            fcf = (ocf + investing) if ocf is not None and investing is not None else None
            roe = _safe_pct(df.loc[year].get("roe"))
            gross_margin = _safe_pct(df.loc[year].get("gpm"))
            net_margin = _safe_pct(df.loc[year].get("npm"))
            sga_ratio = _safe_pct(df.loc[year].get("sga_per_revenue"))
            de_ratio = _safe(df.loc[year].get("debt_to_equity"))  # already ratio

            # Operating income: revenue - cost of goods - sga (approximate)
            operating_income = None
            if gross_profit is not None and sga is not None:
                operating_income = gross_profit - sga
            elif revenue is not None and gross_margin is not None and sga is not None:
                operating_income = revenue * gross_margin - sga

            operating_margin = _safe_div(operating_income, revenue)

            # EBITDA: approximate from ev_per_ebit_da if available, else net_income + da
            ebitda = None
            if net_income is not None and da is not None:
                ebitda = net_income + da

            # Interest expense: not directly available, skip
            interest_expense = None

            # Current ratio: not in thaifin yearly data
            current_ratio = None

            # Interest coverage
            interest_coverage = None  # no interest expense data

            # OCF/NI ratio
            ocf_ni_ratio = _safe_div(ocf, net_income) if net_income and net_income > 0 else None

            # Capital intensity
            capex_abs = abs(investing) if investing is not None else None
            capital_intensity = _safe_div(capex_abs, ocf) if ocf and ocf > 0 else None

            yearly_metrics.append({
                "year": year_str,
                "revenue": revenue,
                "gross_profit": gross_profit,
                "operating_income": operating_income,
                "net_income": net_income,
                "ebitda": ebitda,
                "interest_expense": interest_expense,
                "diluted_eps": diluted_eps,
                "sga": sga,
                "equity": equity,
                "total_debt": total_debt,
                "total_assets": total_assets,
                "ocf": ocf,
                "fcf": fcf,
                "capex": investing,  # negative = spending
                "dividends_paid": None,  # not in thaifin
                "roe": roe,
                "gross_margin": gross_margin,
                "net_margin": net_margin,
                "operating_margin": operating_margin,
                "sga_ratio": sga_ratio,
                "de_ratio": de_ratio,
                "current_ratio": current_ratio,
                "interest_coverage": interest_coverage,
                "ocf_ni_ratio": ocf_ni_ratio,
                "capital_intensity": capital_intensity,
            })

        yearly_metrics.sort(key=lambda x: x["year"])

        # Latest year snapshot for top-level fields
        latest_idx = max(df.index) if len(df.index) > 0 else None
        latest_row = df.loc[latest_idx] if latest_idx is not None else {}
        latest_year = latest_idx.year if hasattr(latest_idx, 'year') else (int(latest_idx) if latest_idx is not None else None)

        # PE ratio from thaifin
        pe_ratio = _safe(latest_row.get("price_earning_ratio")) if latest_year else None
        pb_ratio = _safe(latest_row.get("price_book_value")) if latest_year else None

        # Dividend yield (latest year, percentage)
        latest_dy = _safe(latest_row.get("dividend_yield")) if latest_year else None

        # Five year avg yield from thaifin
        current_year = datetime.now().year
        recent_years = sorted([y for y in dividend_yields.keys()
                               if y >= current_year - 5 and y < current_year])
        five_year_yields = [dividend_yields[y] for y in recent_years if dividend_yields[y] is not None]
        five_year_avg_yield = (sum(five_year_yields) / len(five_year_yields)) if five_year_yields else None

        # Dividend history: DPS per year (dy% * close / 100)
        dividend_history = {}
        for y in dividend_yields:
            dy_val = dividend_yields[y]
            close_val = closes.get(y)
            if dy_val is not None and close_val is not None and close_val > 0:
                dps = dy_val * close_val / 100.0
                dividend_history[y] = round(dps, 4)

        # EPS trailing from latest year
        eps_trailing = _safe(latest_row.get("earning_per_share")) if latest_year else None

        # Revenue/earnings from latest
        latest_revenue = _safe(latest_row.get("revenue")) if latest_year else None
        latest_net_profit = _safe(latest_row.get("net_profit")) if latest_year else None

        # ROE/ROA from latest (decimal)
        latest_roe = _safe_pct(latest_row.get("roe")) if latest_year else None
        latest_roa = _safe_pct(latest_row.get("roa")) if latest_year else None

        # D/E from latest — thaifin is ratio, yfinance expects percentage (*100)
        latest_de = _safe(latest_row.get("debt_to_equity"))
        de_for_output = latest_de * 100 if latest_de is not None else None

        # Margins from latest (decimal)
        latest_npm = _safe_pct(latest_row.get("npm")) if latest_year else None
        latest_gpm = _safe_pct(latest_row.get("gpm")) if latest_year else None

        # OCF from latest
        latest_ocf = _safe(latest_row.get("operating_activities")) if latest_year else None
        latest_investing = _safe(latest_row.get("investing_activities")) if latest_year else None
        latest_fcf = (latest_ocf + latest_investing) if latest_ocf is not None and latest_investing is not None else None

        # Market cap from latest
        latest_mkt_cap = _safe(latest_row.get("mkt_cap")) if latest_year else None

        # Revenue/earnings growth YoY from latest
        revenue_growth = _safe_pct(latest_row.get("revenue_yoy")) if latest_year else None
        earnings_growth = _safe_pct(latest_row.get("net_profit_yoy")) if latest_year else None

        return {
            "info": info,
            "yearly_metrics": yearly_metrics,
            "dividend_history": dividend_history,
            "snapshot": {
                "pe_ratio": pe_ratio,
                "pb_ratio": pb_ratio,
                "dividend_yield": latest_dy,  # percentage
                "five_year_avg_yield": five_year_avg_yield,  # percentage
                "eps_trailing": eps_trailing,
                "revenue": latest_revenue,
                "revenue_growth": revenue_growth,
                "earnings_growth": earnings_growth,
                "profit_margin": latest_npm,
                "gross_margins": latest_gpm,
                "operating_margins": None,  # not directly available
                "roe": latest_roe,
                "roa": latest_roa,
                "debt_to_equity": de_for_output,  # percentage for yfinance compat
                "current_ratio": None,
                "free_cashflow": latest_fcf,
                "operating_cashflow": latest_ocf,
                "market_cap": latest_mkt_cap,
            },
        }

    except Exception as e:
        logger.warning("thaifin failed for %s: %s", symbol, e)
        return None


def _fetch_yfinance_supplement(symbol: str) -> dict:
    """Fetch supplementary data from yfinance (price, 52w, forward PE, etc.)."""
    try:
        import yfinance as yf
        yf_sym = _to_yf_symbol(symbol)
        tk = yf.Ticker(yf_sym)
        info = tk.info or {}

        if len(info) < 5:
            return {"info": info, "divs": None, "error": f"near-empty info ({len(info)} keys)"}

        divs = tk.dividends
        recent_divs = divs.tail(8).tolist() if divs is not None and len(divs) > 0 else []

        return {
            "info": info,
            "divs": divs,
            "recent_dividends": recent_divs,
        }

    except Exception as e:
        logger.warning("yfinance failed for %s: %s", symbol, e)
        return {"info": {}, "divs": None, "recent_dividends": []}


def _fetch_yfinance_full(symbol: str) -> dict | None:
    """Full yfinance fallback — same logic as old fetch_multi_year."""
    try:
        import yfinance as yf
        yf_sym = _to_yf_symbol(symbol)
        tk = yf.Ticker(yf_sym)
        info = tk.info or {}

        if len(info) < 5:
            return None

        return {"tk": tk, "info": info}

    except Exception as e:
        logger.warning("yfinance full fallback failed for %s: %s", symbol, e)
        return None


# Public API aliases
fetch_from_thaifin = _fetch_thaifin
fetch_yfinance_supplement = _fetch_yfinance_supplement


def fetch_fundamentals(symbol: str) -> dict:
    """Fetch fundamentals using thaifin (primary) + yfinance (supplement).

    Returns schema identical to fetch_multi_year() output.
    Falls back to yfinance entirely if thaifin fails.
    """
    yf_sym = _to_yf_symbol(symbol)

    # 1. Try thaifin for historical data
    tf_data = _fetch_thaifin(symbol)

    # 2. Always get yfinance supplement for realtime data
    yf_supp = _fetch_yfinance_supplement(symbol)
    yf_info = yf_supp.get("info", {})

    # If yfinance also has near-empty info, check thaifin
    if "error" in yf_supp and tf_data is None:
        return {"symbol": yf_sym, "error": yf_supp["error"]}

    # 3. If thaifin failed → signal for full yfinance fallback
    use_thaifin = tf_data is not None and len(tf_data.get("yearly_metrics", [])) > 0

    if use_thaifin:
        tf_info = tf_data["info"]
        tf_snap = tf_data["snapshot"]
        yearly_metrics = tf_data["yearly_metrics"]
        dividend_history = tf_data["dividend_history"]

        # Merge: thaifin base + yfinance supplement
        name = tf_info.get("name") or yf_info.get("shortName", yf_sym)
        sector = tf_info.get("sector") or yf_info.get("sector", "N/A")
        industry = tf_info.get("industry") or yf_info.get("industry", "N/A")

        # Price fields: always from yfinance (realtime)
        price = yf_info.get("currentPrice") or yf_info.get("regularMarketPrice")
        market_cap = yf_info.get("marketCap") or tf_snap.get("market_cap")

        # PE: prefer yfinance (realtime), fallback thaifin
        pe_ratio = yf_info.get("trailingPE") or tf_snap.get("pe_ratio")
        forward_pe = yf_info.get("forwardPE")
        pb_ratio = yf_info.get("priceToBook") or tf_snap.get("pb_ratio")

        # Dividend: thaifin yield, yfinance rate/payout
        dy = tf_snap.get("dividend_yield")  # already percentage
        dividend_rate = yf_info.get("dividendRate")
        payout_ratio = yf_info.get("payoutRatio")
        five_year_avg_yield = tf_snap.get("five_year_avg_yield") or yf_info.get("fiveYearAvgDividendYield")

        # EPS
        eps_trailing = tf_snap.get("eps_trailing") or yf_info.get("trailingEps")
        eps_forward = yf_info.get("forwardEps")

        # Financials: prefer thaifin
        revenue = tf_snap.get("revenue") or yf_info.get("totalRevenue")
        revenue_growth = tf_snap.get("revenue_growth") or yf_info.get("revenueGrowth")
        earnings_growth = tf_snap.get("earnings_growth") or yf_info.get("earningsGrowth")
        profit_margin = tf_snap.get("profit_margin") or yf_info.get("profitMargins")
        gross_margins = tf_snap.get("gross_margins") or yf_info.get("grossMargins")
        operating_margins = tf_snap.get("operating_margins") or yf_info.get("operatingMargins")
        roe = tf_snap.get("roe") or yf_info.get("returnOnEquity")
        roa = tf_snap.get("roa") or yf_info.get("returnOnAssets")
        debt_to_equity = tf_snap.get("debt_to_equity") or yf_info.get("debtToEquity")
        current_ratio = tf_snap.get("current_ratio") or yf_info.get("currentRatio")
        free_cashflow = yf_info.get("freeCashflow") or tf_snap.get("free_cashflow")
        operating_cashflow = yf_info.get("operatingCashflow") or tf_snap.get("operating_cashflow")

        # Recent dividends from yfinance
        recent_divs = yf_supp.get("recent_dividends", [])

        # Price technicals from yfinance
        w52_high = yf_info.get("fiftyTwoWeekHigh")
        w52_low = yf_info.get("fiftyTwoWeekLow")
        d50_avg = yf_info.get("fiftyDayAverage")
        d200_avg = yf_info.get("twoHundredDayAverage")

    else:
        # Full yfinance fallback — return None to signal caller to use old logic
        return None

    return {
        "symbol": yf_sym,
        "name": name,
        "sector": sector,
        "industry": industry,
        "currency": yf_info.get("currency", "THB"),
        "price": price,
        "market_cap": market_cap,
        "pe_ratio": pe_ratio,
        "forward_pe": forward_pe,
        "pb_ratio": pb_ratio,
        "dividend_yield": dy,
        "dividend_rate": dividend_rate,
        "payout_ratio": payout_ratio,
        "five_year_avg_yield": five_year_avg_yield,
        "eps_trailing": eps_trailing,
        "eps_forward": eps_forward,
        "revenue": revenue,
        "revenue_growth": revenue_growth,
        "earnings_growth": earnings_growth,
        "profit_margin": profit_margin,
        "gross_margins": gross_margins,
        "operating_margins": operating_margins,
        "roe": roe,
        "roa": roa,
        "debt_to_equity": debt_to_equity,
        "current_ratio": current_ratio,
        "free_cashflow": free_cashflow,
        "operating_cashflow": operating_cashflow,
        "recent_dividends": recent_divs,
        "52w_high": w52_high,
        "52w_low": w52_low,
        "50d_avg": d50_avg,
        "200d_avg": d200_avg,
        "yearly_metrics": yearly_metrics,
        "dividend_history": dividend_history,
    }
