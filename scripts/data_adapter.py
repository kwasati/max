"""Data adapter — thaifin (primary) + yahooquery (supplement).

thaifin provides 10+ years of Thai stock financials.
yahooquery supplements with realtime price, 52w range, forward PE, payout ratio, etc.

Public API:
    normalize_symbol(raw) → (tf_sym, yf_sym)
    fetch_from_thaifin(symbol) → dict | None
    fetch_yahoo_supplement(symbol) → dict
    fetch_fundamentals(symbol) → dict | None  (combined thaifin + yahooquery)
"""

import logging
import math
from datetime import datetime

import pandas as pd

logger = logging.getLogger(__name__)


# Cache for holding mcap lookups (symbol → int | None). Per-process memoization.
_HOLDING_MCAP_CACHE: dict[str, "int | None"] = {}


def _holding_mcap(sym: str) -> "int | None":
    if sym in _HOLDING_MCAP_CACHE:
        return _HOLDING_MCAP_CACHE[sym]
    v = None
    # Try thaifin first (primary source for Thai stocks)
    try:
        from thaifin import Stock
        tf_sym = sym.replace(".BK", "")
        tf_stock = Stock(tf_sym)
        df = tf_stock.yearly_dataframe
        if df is not None and not df.empty:
            latest_mkt_cap = _safe(df.iloc[-1].get("mkt_cap"))
            if latest_mkt_cap is not None and latest_mkt_cap > 0:
                v = int(latest_mkt_cap)
    except Exception:
        pass
    # Fallback to yahooquery (for non-Thai holdings or when thaifin fails)
    if v is None:
        try:
            from yahooquery import Ticker
            tk = Ticker(sym)
            px = tk.price.get(sym, {}) if isinstance(tk.price, dict) else {}
            sd = tk.summary_detail.get(sym, {}) if isinstance(tk.summary_detail, dict) else {}
            yq_v = None
            if isinstance(sd, dict):
                yq_v = sd.get("marketCap")
            if yq_v is None and isinstance(px, dict):
                yq_v = px.get("marketCap")
            if yq_v:
                v = int(yq_v)
        except Exception:
            pass
    _HOLDING_MCAP_CACHE[sym] = v
    return v


def normalize_symbol(raw: str) -> tuple[str, str]:
    """Normalize symbol: 'LH' or 'LH.BK' → ('LH', 'LH.BK')."""
    base = raw.replace(".BK", "")
    return (base, f"{base}.BK")


def _to_yf_symbol(symbol: str) -> str:
    """Normalize symbol for Yahoo (.BK suffix): 'PTT' or 'PTT.BK' → 'PTT.BK'."""
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

            # Payout ratio per year — thaifin doesn't provide directly; compute
            payout_ratio_year = None
            if dy is not None and close is not None and diluted_eps is not None and diluted_eps > 0:
                # dy is percentage (e.g. 5.2), close is THB, diluted_eps is THB
                dps_approx = (dy / 100.0) * close  # THB
                payout_ratio_year = dps_approx / diluted_eps  # decimal (0-1+)

            # Additional thaifin columns exposed (previously unused)
            cash_val = _safe(df.loc[year].get("cash"))
            roa_year = _safe_pct(df.loc[year].get("roa"))
            revenue_yoy = _safe_pct(df.loc[year].get("revenue_yoy"))
            net_profit_yoy = _safe_pct(df.loc[year].get("net_profit_yoy"))
            eps_yoy = _safe_pct(df.loc[year].get("earning_per_share_yoy"))
            cash_cycle = _safe(df.loc[year].get("cash_cycle"))
            financing_activities = _safe(df.loc[year].get("financing_activities"))
            ev_per_ebit_da = _safe(df.loc[year].get("ev_per_ebit_da"))

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
                "close": close,
                "dividend_yield": dy,
                "mkt_cap": mkt_cap,
                "bvps": bvps,
                "payout_ratio": payout_ratio_year,
                "cash": cash_val,
                "roa_year": roa_year,
                "revenue_yoy": revenue_yoy,
                "net_profit_yoy": net_profit_yoy,
                "eps_yoy": eps_yoy,
                "cash_cycle": cash_cycle,
                "financing_activities": financing_activities,
                "ev_per_ebit_da": ev_per_ebit_da,
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

        # D/E from latest — thaifin is ratio, downstream expects percentage (*100)
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

        # Additional latest-year values (mirroring new yearly_metrics fields)
        latest_cash = _safe(latest_row.get("cash")) if latest_year else None
        latest_roa_year = _safe_pct(latest_row.get("roa")) if latest_year else None
        latest_revenue_yoy = _safe_pct(latest_row.get("revenue_yoy")) if latest_year else None
        latest_net_profit_yoy = _safe_pct(latest_row.get("net_profit_yoy")) if latest_year else None
        latest_eps_yoy = _safe_pct(latest_row.get("earning_per_share_yoy")) if latest_year else None
        latest_cash_cycle = _safe(latest_row.get("cash_cycle")) if latest_year else None
        latest_financing_activities = _safe(latest_row.get("financing_activities")) if latest_year else None
        latest_ev_per_ebit_da = _safe(latest_row.get("ev_per_ebit_da")) if latest_year else None

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
                "debt_to_equity": de_for_output,  # percentage for downstream schema compat
                "current_ratio": None,
                "free_cashflow": latest_fcf,
                "operating_cashflow": latest_ocf,
                "market_cap": latest_mkt_cap,
                "cash": latest_cash,
                "roa_year": latest_roa_year,
                "revenue_yoy": latest_revenue_yoy,
                "net_profit_yoy": latest_net_profit_yoy,
                "eps_yoy": latest_eps_yoy,
                "cash_cycle": latest_cash_cycle,
                "financing_activities": latest_financing_activities,
                "ev_per_ebit_da": latest_ev_per_ebit_da,
            },
        }

    except Exception as e:
        logger.warning("thaifin failed for %s: %s", symbol, e)
        return None


def _attribute_dividends_to_fiscal_years(divs) -> dict:
    """Group dividends by fiscal year per SET methodology.

    SET DIY uses 'latest annual operating period' which = fiscal year.
    For Thai stocks (FY = calendar year):
      - ex-date Jan-Jun of year N+1 → final of FY N
      - ex-date Jul-Dec of year N → interim of FY N

    Args:
        divs: pandas Series with timestamp index, DPS values

    Returns:
        {
            'by_fy': {fy_year: total_dps},
            'is_complete': {fy_year: bool},  # True if both interim+final detected, or single payment + no recent payment expected
            'events_per_fy': {fy_year: [(date, amount, period), ...]},  # for debug
        }

    Example:
        >>> # BBL events: Sep 2025=2.0, Apr 2026=10.0
        >>> result = _attribute_dividends_to_fiscal_years(divs)
        >>> result['by_fy'][2025]
        12.0
    """
    if divs is None or (hasattr(divs, 'empty') and divs.empty):
        return {'by_fy': {}, 'is_complete': {}, 'events_per_fy': {}}

    by_fy = {}
    events_per_fy = {}
    for idx, val in divs.items():
        try:
            ts = idx if hasattr(idx, 'month') else None
            if ts is None:
                continue
            month = ts.month
            cal_year = ts.year
            amount = float(val)
            if month <= 6:
                fy = cal_year - 1  # H1 next year = final of last FY
                period = 'final'
            else:
                fy = cal_year       # H2 same year = interim of this FY
                period = 'interim'
            by_fy[fy] = by_fy.get(fy, 0) + round(amount, 4)
            events_per_fy.setdefault(fy, []).append((ts, amount, period))
        except (ValueError, TypeError, AttributeError):
            continue

    # Detect completeness: adaptive per company's typical pay frequency
    # 1. Count events per FY for older FYs (skip latest 1 — may still be in-progress)
    # 2. Find mode (most common count) → typical_count for this company
    # 3. FY complete = event count >= typical_count
    sorted_fys = sorted(by_fy.keys())
    is_complete = {}
    typical_count = 2  # default semi-annual (common Thai pattern)
    if len(sorted_fys) >= 2:
        # Use older FYs (exclude latest) to detect pattern
        older_counts = [len(events_per_fy.get(fy, [])) for fy in sorted_fys[:-1]]
        if older_counts:
            from collections import Counter
            typical_count = Counter(older_counts).most_common(1)[0][0]
            if typical_count < 1:
                typical_count = 1  # safety floor

    for fy in sorted_fys:
        actual_count = len(events_per_fy.get(fy, []))
        is_complete[fy] = actual_count >= typical_count

    return {'by_fy': by_fy, 'is_complete': is_complete, 'events_per_fy': events_per_fy, 'typical_count': typical_count}


def _fetch_yahoo_supplement(symbol: str) -> dict:
    """Fetch supplementary data from yahooquery (price, 52w, forward PE, etc.).

    Also fetches: dividends history (DPS by year), capex, operating income,
    interest expense — used to supplement thaifin data.
    """
    try:
        from yahooquery import Ticker
        yq_sym = _to_yf_symbol(symbol)
        tk = Ticker(yq_sym)

        # Build info dict from multiple yahooquery endpoints — maintain legacy schema keys
        sd = tk.summary_detail.get(yq_sym, {}) if isinstance(tk.summary_detail, dict) else {}
        px = tk.price.get(yq_sym, {}) if isinstance(tk.price, dict) else {}
        ks = tk.key_stats.get(yq_sym, {}) if isinstance(tk.key_stats, dict) else {}
        fd = tk.financial_data.get(yq_sym, {}) if isinstance(tk.financial_data, dict) else {}

        # yahooquery returns strings like "Quote not found" when symbol fails — normalize to dict
        if not isinstance(sd, dict):
            sd = {}
        if not isinstance(px, dict):
            px = {}
        if not isinstance(ks, dict):
            ks = {}
        if not isinstance(fd, dict):
            fd = {}

        info = {
            "currentPrice": px.get("regularMarketPrice") or fd.get("currentPrice"),
            "regularMarketPrice": px.get("regularMarketPrice"),
            "marketCap": sd.get("marketCap") or px.get("marketCap"),
            "trailingPE": sd.get("trailingPE"),
            "forwardPE": sd.get("forwardPE") or ks.get("forwardPE"),
            "priceToBook": ks.get("priceToBook"),
            "dividendRate": sd.get("dividendRate"),
            "trailingAnnualDividendRate": sd.get("trailingAnnualDividendRate"),
            "payoutRatio": sd.get("payoutRatio"),
            "fiveYearAvgDividendYield": sd.get("fiveYearAvgDividendYield"),
            "fiftyTwoWeekHigh": sd.get("fiftyTwoWeekHigh"),
            "fiftyTwoWeekLow": sd.get("fiftyTwoWeekLow"),
            "fiftyDayAverage": sd.get("fiftyDayAverage"),
            "twoHundredDayAverage": sd.get("twoHundredDayAverage"),
            "freeCashflow": ks.get("freeCashflow") or fd.get("freeCashflow"),
            "operatingCashflow": fd.get("operatingCashflow"),
            "trailingEps": ks.get("trailingEps"),
            "forwardEps": ks.get("forwardEps"),
            "dividendYield": sd.get("dividendYield"),
            "revenueGrowth": fd.get("revenueGrowth"),
            "earningsGrowth": fd.get("earningsGrowth"),
            "profitMargins": fd.get("profitMargins"),
            "grossMargins": fd.get("grossMargins"),
            "operatingMargins": fd.get("operatingMargins"),
            "returnOnEquity": fd.get("returnOnEquity"),
            "returnOnAssets": fd.get("returnOnAssets"),
            "debtToEquity": fd.get("debtToEquity"),
            "currentRatio": fd.get("currentRatio"),
            "totalRevenue": fd.get("totalRevenue"),
            "shortName": px.get("shortName"),
            "currency": px.get("currency"),
        }

        if info.get("currentPrice") is None:
            return {"info": info, "divs": None, "error": "near-empty info (no price)"}

        # Dividends — yahooquery dividend_history returns DataFrame
        divs = None
        recent_divs = []
        dps_by_year = {}
        dps_by_fiscal_year = {}
        fy_is_complete = {}
        try:
            divs_df = tk.dividend_history(start="2000-01-01")
            if hasattr(divs_df, 'shape') and not divs_df.empty:
                # Multi-index (symbol, date) — flatten to date index
                if hasattr(divs_df.index, 'get_level_values'):
                    levels = divs_df.index.get_level_values(0)
                    if yq_sym in levels:
                        divs_df = divs_df.xs(yq_sym, level=0)
                # Extract dividends column (named or first col)
                if 'dividends' in divs_df.columns:
                    divs = divs_df['dividends']
                else:
                    divs = divs_df.iloc[:, 0]
                recent_divs = divs.tail(8).tolist() if len(divs) > 0 else []
                for idx, val in divs.items():
                    try:
                        y = idx.year if hasattr(idx, 'year') else int(str(idx)[:4])
                        dps_by_year[y] = dps_by_year.get(y, 0) + round(float(val), 4)
                    except (ValueError, TypeError):
                        continue
                # FY attribution per SET DIY methodology
                fy_result = _attribute_dividends_to_fiscal_years(divs)
                dps_by_fiscal_year = fy_result['by_fy']
                fy_is_complete = fy_result['is_complete']
        except Exception:
            pass

        # Capex + Operating Income + Interest Expense — annual cash_flow + income_statement
        capex_by_year = {}
        operating_income_by_year = {}
        interest_expense_by_year = {}

        try:
            cf = tk.cash_flow(frequency='a')
            if hasattr(cf, 'shape') and not cf.empty and 'CapitalExpenditure' in cf.columns:
                for _, row in cf.iterrows():
                    as_of = row.get('asOfDate')
                    if as_of is None:
                        continue
                    y = as_of.year if hasattr(as_of, 'year') else int(str(as_of)[:4])
                    val = _safe(row.get('CapitalExpenditure'))
                    if val is not None:
                        capex_by_year[y] = val  # negative = spending
        except Exception:
            pass

        try:
            inc = tk.income_statement(frequency='a')
            if hasattr(inc, 'shape') and not inc.empty:
                for _, row in inc.iterrows():
                    as_of = row.get('asOfDate')
                    if as_of is None:
                        continue
                    y = as_of.year if hasattr(as_of, 'year') else int(str(as_of)[:4])
                    oi = _safe(row.get('OperatingIncome'))
                    ie = _safe(row.get('InterestExpense'))
                    if oi is not None:
                        operating_income_by_year[y] = oi
                    if ie is not None:
                        interest_expense_by_year[y] = ie
        except Exception:
            pass

        return {
            "info": info,
            "divs": divs,
            "recent_dividends": recent_divs,
            "dps_by_year": dps_by_year,                  # legacy calendar bin (debug)
            "dps_by_fiscal_year": dps_by_fiscal_year,    # NEW — SET DIY source of truth
            "fy_is_complete": fy_is_complete,            # NEW — flag complete FYs
            "capex_by_year": capex_by_year,
            "operating_income_by_year": operating_income_by_year,
            "interest_expense_by_year": interest_expense_by_year,
        }

    except Exception as e:
        logger.warning("yahooquery failed for %s: %s", symbol, e)
        return {"info": {}, "divs": None, "recent_dividends": [],
                "dps_by_year": {}, "dps_by_fiscal_year": {}, "fy_is_complete": {},
                "capex_by_year": {},
                "operating_income_by_year": {}, "interest_expense_by_year": {}}


# Public API aliases
fetch_from_thaifin = _fetch_thaifin
fetch_yahoo_supplement = _fetch_yahoo_supplement
# DEPRECATED: keep for any external caller — prefer _fetch_yahoo_supplement
fetch_yfinance_supplement = _fetch_yahoo_supplement


def fetch_fundamentals(symbol: str) -> dict:
    """Fetch fundamentals using thaifin (primary) + yahooquery (supplement).

    Returns schema identical to fetch_multi_year() output.
    """
    yf_sym = _to_yf_symbol(symbol)

    # 1. Try thaifin for historical data
    tf_data = _fetch_thaifin(symbol)

    # 2. Always get yahooquery supplement for realtime data
    yf_supp = _fetch_yahoo_supplement(symbol)
    yf_info = yf_supp.get("info", {})

    # If Yahoo supplement also empty, check thaifin
    if "error" in yf_supp and tf_data is None:
        return {"symbol": yf_sym, "error": yf_supp["error"]}

    # 3. If thaifin failed → return delisted marker (no fallback)
    use_thaifin = tf_data is not None and len(tf_data.get("yearly_metrics", [])) > 0

    if use_thaifin:
        tf_info = tf_data["info"]
        tf_snap = tf_data["snapshot"]
        yearly_metrics = tf_data["yearly_metrics"]

        # --- DPS fix: use Yahoo dividends as source of truth ---
        yf_dps_by_year = yf_supp.get("dps_by_year", {})
        yf_dps_by_fy = yf_supp.get("dps_by_fiscal_year", {})
        yf_fy_complete = yf_supp.get("fy_is_complete", {})
        yf_capex_by_year = yf_supp.get("capex_by_year", {})
        yf_oi_by_year = yf_supp.get("operating_income_by_year", {})
        yf_ie_by_year = yf_supp.get("interest_expense_by_year", {})

        # Build dividend_history from Yahoo DPS attributed to fiscal year (SET DIY methodology)
        dividend_history = {y: round(dps, 4) for y, dps in yf_dps_by_fy.items()}

        # Patch yearly_metrics with capex, operating_income, interest data from Yahoo
        for m in yearly_metrics:
            y = int(m["year"])

            # FCF: OCF - capex (not OCF + investing_activities)
            capex_val = yf_capex_by_year.get(y)
            if capex_val is not None:
                m["capex"] = capex_val  # negative = spending
                if m["ocf"] is not None:
                    m["fcf"] = m["ocf"] - abs(capex_val)
            # else: keep original fcf (OCF + investing) as fallback

            # Interest coverage: operating_income / interest_expense
            oi_val = yf_oi_by_year.get(y)
            ie_val = yf_ie_by_year.get(y)
            if oi_val is not None:
                m["operating_income"] = oi_val
                m["operating_margin"] = _safe_div(oi_val, m.get("revenue"))
            if ie_val is not None:
                m["interest_expense"] = ie_val
            if oi_val is not None and ie_val is not None and ie_val > 0:
                cov = oi_val / ie_val
                m["interest_coverage"] = cov if cov <= 200 else None
            # Also fix EBITDA: use operating_income + DA instead of net_income + DA
            if oi_val is not None and m.get("ebitda") is not None:
                da_approx = m["ebitda"] - (m.get("net_income") or 0)  # DA from old calc
                if da_approx > 0:
                    m["ebitda"] = oi_val + da_approx

        # Merge: thaifin base + Yahoo supplement
        name = tf_info.get("name") or yf_info.get("shortName", yf_sym)
        sector = tf_info.get("sector", "N/A")
        industry = tf_info.get("industry", "N/A")

        # Price fields: always from Yahoo (realtime)
        price = yf_info.get("currentPrice") or yf_info.get("regularMarketPrice")
        market_cap = yf_info.get("marketCap") or tf_snap.get("market_cap")

        # PE: prefer Yahoo (realtime), fallback thaifin
        pe_ratio = yf_info.get("trailingPE") or tf_snap.get("pe_ratio")
        forward_pe = yf_info.get("forwardPE")
        pb_ratio = yf_info.get("priceToBook") or tf_snap.get("pb_ratio")

        # --- Dividend: DPS-first, yield = DPS/price (Fiscal Year Attribution per SET methodology) ---
        complete_fys = sorted([y for y, ok in yf_fy_complete.items() if ok])
        latest_complete_fy = complete_fys[-1] if complete_fys else None

        if latest_complete_fy is not None:
            dps_current = yf_dps_by_fy.get(latest_complete_fy)
        else:
            dps_current = None

        if dps_current is not None and price is not None and price > 0:
            dy = dps_current / price * 100
        else:
            dy = tf_snap.get("dividend_yield")  # fallback thaifin

        # five_year_avg_yield = avg DPS of last 5 COMPLETE FYs / current price
        current_year = datetime.now().year
        recent_complete_fys = complete_fys[-5:] if len(complete_fys) >= 5 else complete_fys
        recent_dps = [yf_dps_by_fy.get(y) for y in recent_complete_fys if yf_dps_by_fy.get(y) is not None]
        if recent_dps and price is not None and price > 0:
            avg_dps = sum(recent_dps) / len(recent_dps)
            five_year_avg_yield = avg_dps / price * 100
        else:
            raw_5y = yf_info.get("fiveYearAvgDividendYield")
            five_year_avg_yield = raw_5y if raw_5y is not None else None

        dividend_rate = dps_current
        # payout_ratio = latest FY DPS / latest FY EPS (same period match)
        payout_ratio = None
        if latest_complete_fy is not None and dps_current is not None:
            for m in yearly_metrics:
                if int(m.get("year", 0)) == latest_complete_fy:
                    eps_fy = m.get("diluted_eps")
                    if eps_fy and eps_fy > 0:
                        payout_ratio = dps_current / eps_fy
                    break
        if payout_ratio is None:
            payout_ratio = yf_info.get("payoutRatio")  # fallback Yahoo

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

        # FCF: prefer Yahoo (uses proper capex), fallback thaifin
        free_cashflow = yf_info.get("freeCashflow") or tf_snap.get("free_cashflow")
        operating_cashflow = yf_info.get("operatingCashflow") or tf_snap.get("operating_cashflow")

        # Recent dividends from Yahoo
        recent_divs = yf_supp.get("recent_dividends", [])

        # Price technicals from Yahoo
        w52_high = yf_info.get("fiftyTwoWeekHigh")
        w52_low = yf_info.get("fiftyTwoWeekLow")
        d50_avg = yf_info.get("fiftyDayAverage")
        d200_avg = yf_info.get("twoHundredDayAverage")

    else:
        # thaifin failed — return None to signal delisted/missing
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
        "dividend_yield": dy,  # percentage (e.g. 4.5 = 4.5%)
        "dps": dps_current,  # actual dividend per share amount
        "dividend_rate": dividend_rate,
        "payout_ratio": payout_ratio,
        "five_year_avg_yield": five_year_avg_yield,  # percentage
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


# --- Niwes extensions (append-only — do not modify fetch_fundamentals) ---

EXTRAORDINARY_KEYWORDS = ("extraordinary", "one-time", "one time", "gain on sale",
                         "loss on sale", "impairment", "restructuring", "non-recurring")


def compute_normalized_earnings(stock_data: dict) -> dict:
    """Return {year: normalized_eps} after stripping extraordinary items.

    thaifin yearly_dataframe does not expose line-item names for extraordinary
    items, so this falls back to using diluted_eps as-is. When richer income
    statement data becomes available (item-name keyword match against
    EXTRAORDINARY_KEYWORDS), this function will exclude those items from
    net_income before recomputing EPS.
    """
    out = {}
    for m in stock_data.get("yearly_metrics", []):
        year = m.get("year")
        eps = m.get("diluted_eps")
        if year is None or eps is None:
            continue
        out[year] = eps
    return out


def compute_payout_sustainability(stock_data: dict) -> dict:
    """Return {year: {payout_ratio, sustainable}} per yearly_metrics row.

    payout_ratio = DPS / diluted_eps (both known fields).
    sustainable = payout < 0.80 AND fcf positive (dividends paid from real cash).

    Replaces old formula that depended on dividends_paid which is always None from thaifin.
    """
    out = {}
    dividend_history = stock_data.get("dividend_history", {}) or {}
    for m in stock_data.get("yearly_metrics", []):
        year = m.get("year")
        if year is None:
            continue
        eps = m.get("diluted_eps")
        fcf = m.get("fcf")
        # dividend_history keys are int (from fetch), yearly_metrics.year is str — try both
        dps = dividend_history.get(year)
        if dps is None:
            try:
                dps = dividend_history.get(int(year))
            except (TypeError, ValueError):
                dps = None
        if dps is not None and eps is not None and eps > 0:
            payout_ratio = dps / eps
        else:
            payout_ratio = None
        sustainable = (
            payout_ratio is not None and payout_ratio < 0.80
            and fcf is not None and fcf > 0
        )
        out[year] = {"payout_ratio": payout_ratio, "sustainable": sustainable}
    return out


def check_hidden_value(symbol: str) -> list:
    """Return list of hidden-value holdings for symbol, or [] if none.

    Reads bootstrap data from data/hidden_value_holdings.json.
    Symbol normalized to .BK form for lookup.
    """
    import json
    from pathlib import Path

    _, yf_sym = normalize_symbol(symbol)
    json_path = Path(__file__).resolve().parent.parent / "data" / "hidden_value_holdings.json"
    if not json_path.exists():
        return []
    try:
        data = json.loads(json_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []
    holdings = data.get(yf_sym, [])
    # Enrich holdings with holding_mcap (error-safe, memoized)
    for h in holdings:
        if "holding_mcap" not in h:  # don't overwrite if caller pre-set
            h["holding_mcap"] = _holding_mcap(h.get("holding"))
    return holdings


if __name__ == '__main__':
    import pandas as pd
    mock_divs = pd.Series(
        [2.0, 10.0],
        index=[pd.Timestamp('2025-09-15'), pd.Timestamp('2026-04-22')],
    )
    result = _attribute_dividends_to_fiscal_years(mock_divs)
    assert result['by_fy'][2025] == 12.0, f"Expected FY2025=12.0, got {result['by_fy'].get(2025)}"
    print('FY attribution OK')
