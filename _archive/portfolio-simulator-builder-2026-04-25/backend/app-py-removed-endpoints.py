"""Endpoints removed from server/app.py during cleanup-finalize-01.
Archived 2026-04-25. Restore via git revert if needed.
"""


# ===== Block 1: TransactionIn + transactions endpoints =====
# ---------------------------------------------------------------------------
# Portfolio Transactions + P&L API (Plan 05 Phase 4)
# ---------------------------------------------------------------------------


class TransactionIn(BaseModel):
    symbol: str
    date: str  # 'YYYY-MM-DD'
    type: str  # 'BUY' | 'SELL'
    price: float
    qty: float
    note: Optional[str] = None


@app.post("/api/portfolio/transactions")
async def add_transaction(tx: TransactionIn):
    """Append new transaction + save to user_data.json. Server generates uuid."""
    data = load_user_data()
    data.setdefault("transactions", [])
    entry = {"id": str(uuid.uuid4()), **tx.model_dump()}
    data["transactions"].append(entry)
    save_user_data(data)
    return entry


@app.delete("/api/portfolio/transactions/{tx_id}")
async def delete_transaction(tx_id: str):
    data = load_user_data()
    data["transactions"] = [
        t for t in data.get("transactions", []) if t.get("id") != tx_id
    ]
    save_user_data(data)
    return {"deleted": tx_id}


@app.get("/api/portfolio/transactions")
async def list_transactions(symbol: Optional[str] = None):
    data = load_user_data()
    txs = data.get("transactions", [])
    if symbol:
        txs = [t for t in txs if t.get("symbol") == symbol]
    return {"transactions": txs}

# ===== Block 2: /api/portfolio/pnl endpoint =====
@app.get("/api/portfolio/pnl")
async def get_pnl():
    """Compute positions + totals from transactions.
    current_price pulled from latest screener (candidates + review + filtered_out).
    v6 Phase 2 — adds name, dividends_received, dividend_yield_on_cost, weight_pct
    per position; total.dividends_received + total.cash_reserve top-level.
    """
    data = load_user_data()
    txs = data.get("transactions", [])
    by_sym: dict[str, list] = {}
    for t in txs:
        by_sym.setdefault(t["symbol"], []).append(t)

    # Try latest screener for prices + name + dividend_history
    screener_map: dict[str, dict] = {}
    try:
        screener = _latest_screener_file()
        all_entries = (
            screener.get("candidates", [])
            + screener.get("review_candidates", [])
            + screener.get("filtered_out_stocks", [])
        )
        for e in all_entries:
            sym = e.get("symbol")
            if sym:
                screener_map[sym] = e
    except HTTPException:
        pass

    price_map = {
        sym: (e.get("metrics") or {}).get("price") or e.get("price")
        for sym, e in screener_map.items()
    }

    positions = []
    total_cost = 0.0
    total_mv = 0.0
    total_dividends = 0.0
    for sym, ts in by_sym.items():
        buys = [t for t in ts if t.get("type") == "BUY"]
        sells = [t for t in ts if t.get("type") == "SELL"]
        qty = sum(t["qty"] for t in buys) - sum(t["qty"] for t in sells)
        if qty <= 0:
            continue
        cost = sum(t["price"] * t["qty"] for t in buys) - sum(
            t["price"] * t["qty"] for t in sells
        )
        avg = cost / qty if qty else 0
        cur_price = price_map.get(sym)
        mv = cur_price * qty if cur_price is not None else None
        pnl = (mv - cost) if mv is not None else None
        pct = (pnl / cost * 100) if (pnl is not None and cost) else None

        # v6 — name lookup
        s_entry = screener_map.get(sym) or {}
        name = s_entry.get("name") or sym
        if "_" in name:
            parts = name.split("_", 1)
            name = parts[1] if len(parts) > 1 else name

        # v6 — dividends_received: cumulative DPS × qty held per ex-div date
        # Simplification: sum (dps × qty) for dividend years on/after earliest BUY date
        dividends_received = 0.0
        div_hist = s_entry.get("dividend_history") or {}
        earliest_buy_date = None
        if buys:
            try:
                earliest_buy_date = min(t.get("date") or "" for t in buys)
            except Exception:
                earliest_buy_date = None
        earliest_year = None
        if earliest_buy_date and len(earliest_buy_date) >= 4:
            try:
                earliest_year = int(earliest_buy_date[:4])
            except ValueError:
                earliest_year = None
        latest_annual_dps = None
        for k, v in div_hist.items():
            try:
                yr = int(float(k))
                dps = float(v) if v is not None else 0
            except (TypeError, ValueError):
                continue
            if earliest_year is None or yr >= earliest_year:
                dividends_received += dps * qty
            # latest DPS for yoc
            if latest_annual_dps is None or yr > latest_annual_dps[0]:
                latest_annual_dps = (yr, dps)

        dividend_yield_on_cost = None
        if latest_annual_dps and latest_annual_dps[1] and cost and qty:
            dividend_yield_on_cost = round(
                (latest_annual_dps[1] * qty) / cost * 100, 2
            )

        positions.append({
            "symbol": sym,
            "name": name,
            "qty": qty,
            "cost_basis": cost,
            "avg_cost": avg,
            "current_price": cur_price,
            "market_value": mv,
            "unrealized_pnl": pnl,
            "unrealized_pct": pct,
            "dividends_received": round(dividends_received, 2),
            "dividend_yield_on_cost": dividend_yield_on_cost,
            "weight_pct": None,  # filled below once total_mv is known
        })
        total_cost += cost
        total_dividends += dividends_received
        if mv is not None:
            total_mv += mv

    # Compute weight_pct per position now that total_mv is known
    if total_mv:
        for p in positions:
            if p["market_value"] is not None:
                p["weight_pct"] = round(p["market_value"] / total_mv * 100, 2)

    return {
        "positions": positions,
        "total": {
            "cost": total_cost,
            "market_value": total_mv if total_mv else None,
            "unrealized_pnl": (total_mv - total_cost) if total_mv else None,
            "unrealized_pct": ((total_mv - total_cost) / total_cost * 100)
            if total_cost
            else None,
            "dividends_received": round(total_dividends, 2),
            "cash_reserve": float(data.get("cash_reserve") or 0),
        },
    }

# ===== Block 3: PortfolioBuilderRequest + /api/portfolio/builder =====
class PortfolioBuilderRequest(BaseModel):
    capital: Optional[float] = None
    pins: list[str] = []
    excludes: list[str] = []


@app.post("/api/portfolio/builder")
async def portfolio_builder(req: PortfolioBuilderRequest):
    """Build Niwes-style 5-sector portfolio from latest screener PASS candidates."""
    # Lazy import — avoid polluting startup time
    if str(SCRIPTS_DIR) not in sys.path:
        sys.path.insert(0, str(SCRIPTS_DIR))
    from portfolio_builder import build_portfolio

    # Find latest screener JSON (YYYY-MM-DD format, sorted by mtime)
    files = sorted(
        [
            f for f in DATA_DIR.glob("screener_*.json")
            if re.match(r"^screener_\d{4}-\d{2}-\d{2}\.json$", f.name)
        ],
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if not files:
        raise HTTPException(404, "no screener data — run /api/admin/scan/trigger first")
    screener = json.loads(files[0].read_text(encoding="utf-8"))
    candidates = screener.get("candidates", [])
    # Enrich candidates with current_price from metrics
    for c in candidates:
        c["current_price"] = (c.get("metrics") or {}).get("current_price")
    result = build_portfolio(
        candidates=candidates,
        capital=req.capital,
        pins=req.pins,
        excludes=req.excludes,
    )
    result["screener_date"] = screener.get("date")
    return result

# ===== Block 4: _yahoo_monthly_series + DcaPortfolioRequest + /api/simulate/dca-portfolio =====
# ============================================================================
# v6 Phase 3 — Portfolio simulator endpoints
# ============================================================================


def _yahoo_monthly_series(ticker_symbol: str) -> Optional[list[tuple]]:
    """Fetch monthly price + dividend history for a symbol via yahooquery.
    Returns list of (date, close_price, dividend_on_this_month) tuples. None on failure.
    Cash proxy returns a flat-1.0 series built in caller.
    """
    try:
        from yahooquery import Ticker as YQTicker
        import pandas as pd
    except Exception:
        return None
    try:
        t = YQTicker(ticker_symbol)
        hist = t.history(period="max", interval="1mo", adj_ohlc=False)
        if not hasattr(hist, 'shape') or hist.empty:
            return None
        # Flatten multi-index (symbol, date) -> DatetimeIndex
        if hasattr(hist.index, 'get_level_values') and ticker_symbol in hist.index.get_level_values(0):
            hist = hist.xs(ticker_symbol, level=0)
        if not isinstance(hist.index, pd.DatetimeIndex):
            hist.index = pd.to_datetime(hist.index)
        hist.index = hist.index.tz_localize(None) if hist.index.tz else hist.index

        # Dividends — separate call in yahooquery
        divs = None
        try:
            divs_df = t.dividend_history(start="2000-01-01")
            if hasattr(divs_df, 'shape') and not divs_df.empty:
                if hasattr(divs_df.index, 'get_level_values') and ticker_symbol in divs_df.index.get_level_values(0):
                    divs_df = divs_df.xs(ticker_symbol, level=0)
                divs = divs_df['dividends'] if 'dividends' in divs_df.columns else divs_df.iloc[:, 0]
                if not isinstance(divs.index, pd.DatetimeIndex):
                    divs.index = pd.to_datetime(divs.index)
                divs.index = divs.index.tz_localize(None) if divs.index.tz else divs.index
        except Exception:
            divs = None

        close_col = "close" if "close" in hist.columns else ("Close" if "Close" in hist.columns else None)
        if close_col is None:
            return None

        rows = []
        for idx, row in hist.iterrows():
            month_start = pd.Timestamp(year=idx.year, month=idx.month, day=1)
            month_end = month_start + pd.offsets.MonthEnd(0)
            div_this_month = 0.0
            if divs is not None and not divs.empty:
                mask = (divs.index >= month_start) & (divs.index <= month_end)
                div_this_month = float(divs[mask].sum()) if mask.any() else 0.0
            close_val = row[close_col]
            if close_val is None or pd.isna(close_val):
                continue
            rows.append((month_start.strftime("%Y-%m-%d"), float(close_val), div_this_month))
        return rows
    except Exception:
        return None


class DcaPortfolioRequest(BaseModel):
    positions: list[dict]
    monthly_amount: float
    duration_years: int = 10
    reinvest_dividends: bool = True


@app.post("/api/simulate/dca-portfolio")
async def simulate_dca_portfolio(req: DcaPortfolioRequest):
    """Multi-stock DCA with weighted allocation. No benchmark.

    Loops per-position using monthly yahooquery series; sums by month.
    """
    if not req.positions:
        raise HTTPException(400, "positions list is empty")
    total_weight = sum((p.get("weight_pct") or 0) for p in req.positions)
    if total_weight <= 0:
        raise HTTPException(400, "weight_pct sum must be > 0")

    duration_months = max(1, int(req.duration_years * 12))
    # Fetch series per symbol
    series_by_sym: dict[str, list[tuple]] = {}
    for p in req.positions:
        sym = (p.get("symbol") or "").strip()
        if not sym or sym.lower() == "cash":
            continue
        if not sym.endswith(".BK") and "." not in sym:
            sym = sym + ".BK"
        rows = _yahoo_monthly_series(sym)
        if not rows:
            raise HTTPException(503, f"no monthly history for {sym}")
        series_by_sym[sym] = rows[-duration_months:]

    if not series_by_sym:
        raise HTTPException(400, "no non-cash positions to simulate")

    # Build monthly index from the shortest series
    n_months = min(len(v) for v in series_by_sym.values())
    n_months = min(n_months, duration_months)
    if n_months < 1:
        raise HTTPException(400, "insufficient price history")

    # Per-position state
    per_pos: dict[str, dict] = {}
    for p in req.positions:
        sym = (p.get("symbol") or "").strip()
        if not sym or sym.lower() == "cash":
            continue
        if not sym.endswith(".BK") and "." not in sym:
            sym = sym + ".BK"
        per_pos[sym] = {
            "symbol": sym,
            "weight_pct": float(p.get("weight_pct") or 0),
            "shares": 0.0,
            "invested": 0.0,
            "dividends": 0.0,
        }

    timeline = []
    total_invested_cum = 0.0
    total_dividends_cum = 0.0
    for m in range(n_months):
        # Monthly contribution
        for sym, pos in per_pos.items():
            alloc = req.monthly_amount * (pos["weight_pct"] / total_weight)
            price = series_by_sym[sym][m][1]
            if price > 0:
                shares_bought = alloc / price
                pos["shares"] += shares_bought
                pos["invested"] += alloc
            # Dividend for the month (per share held)
            div_per_share = series_by_sym[sym][m][2]
            if div_per_share:
                div_cash = div_per_share * pos["shares"]
                pos["dividends"] += div_cash
                total_dividends_cum += div_cash
                if req.reinvest_dividends and price > 0:
                    pos["shares"] += div_cash / price

        total_invested_cum += req.monthly_amount
        portfolio_value = sum(
            pos["shares"] * series_by_sym[sym][m][1]
            for sym, pos in per_pos.items()
        )
        timeline.append({
            "month_index": m,
            "date": series_by_sym[list(series_by_sym.keys())[0]][m][0],
            "invested_cumulative": round(total_invested_cum, 2),
            "portfolio_value": round(portfolio_value, 2),
            "dividends_cumulative": round(total_dividends_cum, 2),
        })

    final_value = timeline[-1]["portfolio_value"]
    total_return_pct = (
        round((final_value - total_invested_cum) / total_invested_cum * 100, 2)
        if total_invested_cum else 0
    )
    years = n_months / 12
    cagr_pct = (
        round(((final_value / total_invested_cum) ** (1 / years) - 1) * 100, 2)
        if years > 0 and total_invested_cum > 0 and final_value > 0 else 0
    )

    per_position = []
    for sym, pos in per_pos.items():
        last_price = series_by_sym[sym][-1][1]
        ending = pos["shares"] * last_price
        ret_pct = (
            round((ending - pos["invested"]) / pos["invested"] * 100, 2)
            if pos["invested"] else 0
        )
        per_position.append({
            "symbol": sym,
            "weight_pct": pos["weight_pct"],
            "invested": round(pos["invested"], 2),
            "ending_value": round(ending, 2),
            "return_pct": ret_pct,
            "dividends": round(pos["dividends"], 2),
        })

    avg_yoc = 0
    if total_invested_cum > 0 and total_dividends_cum > 0:
        avg_yoc = round(total_dividends_cum / total_invested_cum * 100, 2)

    return {
        "total_invested": round(total_invested_cum, 2),
        "ending_value": round(final_value, 2),
        "total_return_pct": total_return_pct,
        "cagr_pct": cagr_pct,
        "total_dividends": round(total_dividends_cum, 2),
        "avg_yoc_pct": avg_yoc,
        "duration_months": n_months,
        "per_position": per_position,
        "timeline": timeline,
    }

# ===== Block 5: SimulatedPortfolioBody + /api/portfolio/simulated GET + PUT =====
class SimulatedPortfolioBody(BaseModel):
    positions: list[dict] = []
    cash_reserve_pct: float = 0.0


@app.get("/api/portfolio/simulated")
async def get_simulated_portfolio():
    """Target allocation + computed live metrics per position."""
    user_data = load_user_data()
    sim = user_data.get("simulated_portfolio") or {"positions": [], "cash_reserve_pct": 0.0}
    positions_in = sim.get("positions") or []
    cash_reserve_pct = float(sim.get("cash_reserve_pct") or 0)

    try:
        screener = _latest_screener_file()
    except HTTPException:
        screener = {"candidates": [], "review_candidates": [], "filtered_out_stocks": []}
    all_entries = (
        (screener.get("candidates") or [])
        + (screener.get("review_candidates") or [])
        + (screener.get("filtered_out_stocks") or [])
    )
    by_sym = {e.get("symbol"): e for e in all_entries if e.get("symbol")}

    positions_out = []
    total_weight = 0.0
    weighted_yield_sum = 0.0
    for p in positions_in:
        sym = p.get("symbol")
        w = float(p.get("weight_pct") or 0)
        total_weight += w
        entry = by_sym.get(sym) or {}
        name = entry.get("name") or sym
        if name and "_" in name:
            parts = name.split("_", 1)
            name = parts[1] if len(parts) > 1 else name
        metrics = entry.get("metrics") or {}
        cur_price = metrics.get("current_price") or metrics.get("price")
        yield_pct = metrics.get("dividend_yield")
        score = entry.get("score")
        signals = entry.get("signals") or []
        if yield_pct is not None:
            weighted_yield_sum += yield_pct * w
        positions_out.append({
            "symbol": sym,
            "name": name,
            "label": p.get("label", ""),
            "weight_pct": w,
            "current_price": cur_price,
            "target_yield_pct": yield_pct,
            "score": score,
            "signals": signals,
        })

    projected_yoc_pct = (
        round(weighted_yield_sum / total_weight, 2) if total_weight > 0 else 0
    )

    return {
        "positions": positions_out,
        "cash_reserve_pct": cash_reserve_pct,
        "total_weight_pct": round(total_weight, 2),
        "projected_yoc_pct": projected_yoc_pct,
        "concentration_profile": "30/30/30/10",
    }


@app.put("/api/portfolio/simulated")
async def put_simulated_portfolio(body: SimulatedPortfolioBody):
    """Replace simulated portfolio. Validates weight_pct sum ≤ 100."""
    total_w = sum(float(p.get("weight_pct") or 0) for p in body.positions)
    if total_w + body.cash_reserve_pct > 100.01:
        raise HTTPException(
            400,
            f"total weight ({total_w:.2f}) + cash_reserve_pct ({body.cash_reserve_pct:.2f}) exceeds 100",
        )

    data = load_user_data()
    # Sanitize positions — keep {symbol, label, weight_pct}
    clean_positions = []
    for p in body.positions:
        sym = (p.get("symbol") or "").strip()
        if not sym:
            continue
        clean_positions.append({
            "symbol": sym,
            "label": str(p.get("label") or ""),
            "weight_pct": float(p.get("weight_pct") or 0),
        })
    data["simulated_portfolio"] = {
        "positions": clean_positions,
        "cash_reserve_pct": float(body.cash_reserve_pct),
        "updated_at": datetime.now().isoformat(timespec="seconds"),
    }
    save_user_data(data)
    return {"status": "ok", "simulated_portfolio": data["simulated_portfolio"]}

# ===== Block 6: PortfolioBacktestRequest + /api/simulate/portfolio-backtest =====
class PortfolioBacktestRequest(BaseModel):
    positions: list[dict]
    start_date: str
    monthly_amount: float
    reinvest_dividends: bool = True
    benchmark: str = "SET"


@app.post("/api/simulate/portfolio-backtest")
async def portfolio_backtest(req: PortfolioBacktestRequest):
    """DCA backtest with SET benchmark. Cash positions sit idle (MVP).

    TDEX ETF primary benchmark (dividend-reinvested); ^SET fallback.
    Assumptions documented in response.assumptions.
    """
    if not req.positions:
        raise HTTPException(400, "positions list is empty")
    # Parse start_date
    try:
        start_dt = datetime.strptime(req.start_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, f"start_date must be YYYY-MM-DD, got '{req.start_date}'")

    total_weight = sum((p.get("weight_pct") or 0) for p in req.positions)
    if total_weight <= 0:
        raise HTTPException(400, "weight_pct sum must be > 0")

    # Fetch series per symbol + filter to start_date
    series_by_sym: dict[str, list[tuple]] = {}
    cash_positions: list[dict] = []
    for p in req.positions:
        sym = (p.get("symbol") or "").strip()
        if not sym:
            continue
        if sym.lower() == "cash":
            cash_positions.append(p)
            continue
        if not sym.endswith(".BK") and "." not in sym:
            sym = sym + ".BK"
        rows = _yahoo_monthly_series(sym)
        if not rows:
            raise HTTPException(503, f"no monthly history for {sym}")
        filtered = [r for r in rows if r[0] >= req.start_date]
        if not filtered:
            raise HTTPException(
                400, f"no history for {sym} after {req.start_date}"
            )
        series_by_sym[sym] = filtered

    if not series_by_sym:
        raise HTTPException(400, "no non-cash positions to simulate")

    # Benchmark — TDEX primary, ^SET fallback
    bench_rows = _yahoo_monthly_series("TDEX.BK")
    proxy_label = "TDEX ETF (Thai dividend, includes reinvest)"
    if not bench_rows:
        bench_rows = _yahoo_monthly_series("^SET")
        proxy_label = "^SET index (price-only fallback)"
    if not bench_rows:
        raise HTTPException(503, "benchmark data unavailable")
    bench_rows = [r for r in bench_rows if r[0] >= req.start_date]

    # Align to shortest series
    n_months = min(
        min(len(v) for v in series_by_sym.values()),
        len(bench_rows),
    )
    if n_months < 1:
        raise HTTPException(400, "insufficient price history")

    per_pos: dict[str, dict] = {}
    for p in req.positions:
        sym = (p.get("symbol") or "").strip()
        if not sym or sym.lower() == "cash":
            continue
        if not sym.endswith(".BK") and "." not in sym:
            sym = sym + ".BK"
        per_pos[sym] = {
            "shares": 0.0,
            "invested": 0.0,
            "dividends": 0.0,
            "weight_pct": float(p.get("weight_pct") or 0),
        }
    cash_weight_total = sum(float(p.get("weight_pct") or 0) for p in cash_positions)

    # Benchmark state
    bench_shares = 0.0

    timeline: list[dict] = []
    yearly_agg: dict[int, dict] = {}
    total_invested_cum = 0.0
    total_dividends_cum = 0.0
    cash_cum = 0.0
    portfolio_peak = 0.0
    max_dd = 0.0
    max_dd_date = None

    for m in range(n_months):
        month_date = series_by_sym[list(series_by_sym.keys())[0]][m][0]
        # Monthly contribution — allocate by weight across non-cash positions + cash
        for sym, pos in per_pos.items():
            alloc = req.monthly_amount * (pos["weight_pct"] / total_weight)
            price = series_by_sym[sym][m][1]
            if price > 0:
                pos["shares"] += alloc / price
                pos["invested"] += alloc
            # Dividends
            div_ps = series_by_sym[sym][m][2]
            if div_ps:
                div_cash = div_ps * pos["shares"]
                pos["dividends"] += div_cash
                total_dividends_cum += div_cash
                if req.reinvest_dividends and price > 0:
                    pos["shares"] += div_cash / price

        cash_alloc = req.monthly_amount * (cash_weight_total / total_weight)
        cash_cum += cash_alloc

        # Benchmark gets full monthly_amount (apples-to-apples DCA)
        bench_price = bench_rows[m][1]
        bench_div_ps = bench_rows[m][2]
        if bench_price > 0:
            bench_shares += req.monthly_amount / bench_price
        if bench_div_ps and req.reinvest_dividends and bench_price > 0:
            bench_shares += (bench_div_ps * bench_shares) / bench_price

        total_invested_cum += req.monthly_amount
        portfolio_value = cash_cum + sum(
            pos["shares"] * series_by_sym[sym][m][1]
            for sym, pos in per_pos.items()
        )
        benchmark_value = bench_shares * bench_price

        # Drawdown
        if portfolio_value > portfolio_peak:
            portfolio_peak = portfolio_value
        if portfolio_peak > 0:
            dd = (portfolio_value - portfolio_peak) / portfolio_peak * 100
            if dd < max_dd:
                max_dd = dd
                max_dd_date = month_date

        timeline.append({
            "date": month_date,
            "invested_cumulative": round(total_invested_cum, 2),
            "portfolio_value": round(portfolio_value, 2),
            "dividends_cumulative": round(total_dividends_cum, 2),
            "benchmark_value": round(benchmark_value, 2),
        })

        # Yearly aggregation
        year = int(month_date[:4])
        y = yearly_agg.setdefault(year, {
            "year": year,
            "invested_ytd": 0.0,
            "port_value_ytd": 0.0,
            "dividends_ytd": 0.0,
            "benchmark_ytd": 0.0,
        })
        y["invested_ytd"] = total_invested_cum
        y["port_value_ytd"] = portfolio_value
        y["dividends_ytd"] = total_dividends_cum
        y["benchmark_ytd"] = benchmark_value

    end_date = timeline[-1]["date"] if timeline else req.start_date
    final_value = timeline[-1]["portfolio_value"] if timeline else 0
    final_bench = timeline[-1]["benchmark_value"] if timeline else 0

    total_return_pct = (
        round((final_value - total_invested_cum) / total_invested_cum * 100, 2)
        if total_invested_cum else 0
    )
    years = n_months / 12
    cagr_pct = (
        round(((final_value / total_invested_cum) ** (1 / years) - 1) * 100, 2)
        if years > 0 and total_invested_cum > 0 and final_value > 0 else 0
    )
    bench_return_pct = (
        round((final_bench - total_invested_cum) / total_invested_cum * 100, 2)
        if total_invested_cum else 0
    )

    yearly_breakdown = [
        {
            "year": y["year"],
            "invested_ytd": round(y["invested_ytd"], 2),
            "port_value_ytd": round(y["port_value_ytd"], 2),
            "dividends_ytd": round(y["dividends_ytd"], 2),
            "benchmark_ytd": round(y["benchmark_ytd"], 2),
        }
        for y in sorted(yearly_agg.values(), key=lambda x: x["year"])
    ]

    return {
        "start_date": req.start_date,
        "end_date": end_date,
        "duration_months": n_months,
        "total_invested": round(total_invested_cum, 2),
        "portfolio_value_today": round(final_value, 2),
        "total_return_pct": total_return_pct,
        "cagr_pct": cagr_pct,
        "dividends_received_total": round(total_dividends_cum, 2),
        "max_drawdown_pct": round(max_dd, 2),
        "max_drawdown_date": max_dd_date,
        "benchmark": {
            "symbol": req.benchmark,
            "ending_value": round(final_bench, 2),
            "return_pct": bench_return_pct,
            "delta_vs_portfolio": round(final_value - final_bench, 2),
        },
        "timeline": timeline,
        "yearly_breakdown": yearly_breakdown,
        "assumptions": {
            "benchmark_proxy": proxy_label,
            "transaction_costs_modeled": False,
            "tax_modeled": False,
            "cash_return_rate_pct": 0,
        },
    }

# ===== Block 7c: _render_shell_path helper =====
def _render_shell_path(rel: str, fallback: Path) -> HTMLResponse:
    """Render a dedicated shell if present, else fall back to the generic one."""
    path = _V6_DIR / rel
    target = path if path.exists() else fallback
    if not target.exists():
        raise HTTPException(404, f"v6 shell missing: {rel}")
    html = target.read_text(encoding="utf-8")
    html = html.replace("{{CACHEBUST}}", str(int(time.time())))
    return HTMLResponse(html)

# ===== Block 7a: GET /portfolio + /portfolio-builder desktop routes =====
@app.get("/portfolio", response_class=HTMLResponse)
async def serve_desktop_portfolio():
    """Desktop portfolio — dedicated shell preloads Chart.js."""
    return _render_shell_path("desktop/portfolio.html", _V6_DESKTOP)


@app.get("/portfolio-builder", response_class=HTMLResponse)
async def serve_desktop_portfolio_builder():
    """Desktop portfolio builder — Niwes 5-sector 80/20."""
    return _render_shell_path("desktop/portfolio-builder.html", _V6_DESKTOP)

# ===== Block 7b: GET /m/portfolio + /m/portfolio-builder mobile routes =====
@app.get("/m/portfolio", response_class=HTMLResponse)
async def serve_mobile_portfolio():
    """Mobile portfolio — dedicated shell preloads Chart.js."""
    return _render_shell_path("mobile/portfolio.html", _V6_MOBILE)


@app.get("/m/portfolio-builder", response_class=HTMLResponse)
async def serve_mobile_portfolio_builder():
    """Mobile portfolio builder — Niwes 5-sector 80/20."""
    return _render_shell_path("mobile/portfolio-builder.html", _V6_MOBILE)
