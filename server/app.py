"""Max Mahon — FastAPI server for stock dashboard.

Serves data APIs, pipeline control, reports, and static files.
Run: py -m uvicorn server.app:app --port 50089
"""

import asyncio
import json
import logging
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

import markdown
import uvicorn
from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from server.console import count_request, start_refresh_loop

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SERVER_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SERVER_DIR.parent
DATA_DIR = PROJECT_DIR / "data"
REPORTS_DIR = PROJECT_DIR / "reports"
SCRIPTS_DIR = PROJECT_DIR / "scripts"
WEB_DIR = PROJECT_DIR / "web"

# ---------------------------------------------------------------------------
# Env / Auth
# ---------------------------------------------------------------------------
load_dotenv(Path("C:/WORKSPACE/.env"))
MAX_TOKEN = os.getenv("MAX_TOKEN", "")

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Max Mahon Server", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

START_TIME = time.time()

# ---------------------------------------------------------------------------
# Pipeline state
# ---------------------------------------------------------------------------
pipeline_state = {
    "running": False,
    "current_task": None,
    "last_run": None,
    "last_result": None,
}

# ---------------------------------------------------------------------------
# Auth middleware
# ---------------------------------------------------------------------------

@app.middleware("http")
async def request_logger(request: Request, call_next):
    """Track requests for console display."""
    response = await call_next(request)
    path = request.url.path
    # Only log API requests (skip static files + SSE events stream)
    if path.startswith("/api/") and path != "/api/events":
        count_request(request.method, path, response.status_code)
    return response


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    # Skip auth for non-API routes (static files, root, etc.)
    if not path.startswith("/api/"):
        return await call_next(request)
    # Skip auth if no token configured
    if not MAX_TOKEN:
        return await call_next(request)
    auth = request.headers.get("Authorization", "")
    if auth != f"Bearer {MAX_TOKEN}":
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Unauthorized"},
        )
    return await call_next(request)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def find_latest(pattern: str, directory: Path) -> Optional[Path]:
    """Glob for files matching pattern, return most recent by name."""
    files = sorted(directory.glob(pattern), key=lambda p: p.name, reverse=True)
    return files[0] if files else None


def read_json(path: Path) -> dict:
    """Read a JSON file with utf-8 encoding."""
    return json.loads(path.read_text(encoding="utf-8"))


def list_files(directory: Path, pattern: str) -> list[str]:
    """List filenames matching glob pattern in directory."""
    if not directory.exists():
        return []
    return sorted(
        [f.name for f in directory.glob(pattern)],
        reverse=True,
    )


# ---------------------------------------------------------------------------
# Data API
# ---------------------------------------------------------------------------

@app.get("/api/watchlist")
async def get_watchlist():
    path = find_latest("snapshot_*.json", DATA_DIR)
    if not path:
        raise HTTPException(404, "No snapshot data found")
    return read_json(path)


@app.get("/api/screener")
async def get_screener():
    path = find_latest("screener_*.json", DATA_DIR)
    if not path:
        raise HTTPException(404, "No screener data found")
    return read_json(path)


@app.get("/api/stock/{symbol}")
async def get_stock(symbol: str):
    """Merge stock data from snapshot + screener."""
    stock_data = None

    # Try snapshot first (watchlist stocks)
    snap_path = find_latest("snapshot_*.json", DATA_DIR)
    if snap_path:
        snap = read_json(snap_path)
        for s in snap.get("stocks", []):
            if s.get("symbol", "").upper() == symbol.upper():
                stock_data = dict(s)
                break

    # Enrich or fallback from screener (discoveries + score)
    scr_path = find_latest("screener_*.json", DATA_DIR)
    if scr_path:
        scr = read_json(scr_path)
        for c in scr.get("candidates", []):
            if c.get("symbol", "").upper() == symbol.upper():
                if stock_data is None:
                    # Not in watchlist — use screener as primary source
                    stock_data = dict(c)
                else:
                    # Merge screener data into snapshot
                    stock_data["score"] = c.get("score")
                    stock_data["breakdown"] = c.get("breakdown")
                    stock_data["signals"] = c.get("signals")
                    stock_data["reasons"] = c.get("reasons")
                    stock_data["screener_metrics"] = c.get("metrics")
                    # Merge fields snapshot might not have
                    for key in ("aggregates", "yearly_metrics", "dividend_history"):
                        if key not in stock_data and key in c:
                            stock_data[key] = c[key]
                break

    # Also check request files
    if stock_data is None:
        for req_file in sorted(DATA_DIR.glob("request_*.json"), reverse=True):
            req = read_json(req_file)
            for s in req.get("stocks", []):
                if s.get("symbol", "").upper() == symbol.upper():
                    stock_data = dict(s)
                    break
            if stock_data:
                break

    if stock_data is None:
        raise HTTPException(404, f"Stock {symbol} not found")

    # Normalize field names so frontend gets consistent schema
    _normalize_stock(stock_data)
    return stock_data


def _normalize_stock(d: dict):
    """Ensure consistent field names regardless of data source."""
    # Screener uses 'metrics' sub-dict for price/valuation data
    m = d.pop("metrics", None) or {}

    # Map screener fields → standard fields (snapshot-style)
    _defaults = {
        "price": m.get("current_price"),
        "market_cap": m.get("mcap"),
        "pe_ratio": m.get("pe"),
        "forward_pe": m.get("forward_pe"),
        "dividend_yield": m.get("dividend_yield"),
        "payout_ratio": m.get("payout"),
        "free_cashflow": m.get("fcf"),
        "earnings_growth": m.get("earn_growth"),
        "roe": m.get("roe"),
        "debt_to_equity": m.get("de"),
        "52w_low": m.get("52w_low"),
        "52w_high": m.get("52w_high"),
        "pb_ratio": m.get("pb_ratio"),
        "five_year_avg_yield": m.get("five_year_avg_yield"),
        "revenue_growth": m.get("rev_growth"),
    }
    for key, fallback in _defaults.items():
        if d.get(key) is None and fallback is not None:
            d[key] = fallback

    # Normalize name (remove "SYMBOL_" prefix from screener format)
    name = d.get("name", "")
    if "_" in name:
        parts = name.split("_", 1)
        d["name"] = parts[1] if len(parts) > 1 else name

    # Ensure score fields use consistent names
    if "score" in d and "quality_score" not in d:
        d["quality_score"] = d["score"]
    if "breakdown" in d and "score_breakdown" not in d:
        d["score_breakdown"] = d["breakdown"]


@app.get("/api/history")
async def get_history():
    """List available data dates."""
    snapshots = list_files(DATA_DIR, "snapshot_*.json")
    screeners = list_files(DATA_DIR, "screener_*.json")
    requests = list_files(DATA_DIR, "request_*.json")
    return {
        "snapshots": snapshots,
        "screeners": screeners,
        "requests": requests,
    }


@app.get("/api/status")
async def get_status():
    uptime = time.time() - START_TIME
    # Find latest data date
    snap = find_latest("snapshot_*.json", DATA_DIR)
    last_date = None
    if snap:
        # Extract date from filename: snapshot_YYYY-MM-DD.json
        last_date = snap.stem.replace("snapshot_", "")
    return {
        "uptime_seconds": round(uptime, 1),
        "last_data_date": last_date,
        "pipeline_running": pipeline_state["running"],
        "current_task": pipeline_state["current_task"],
        "last_run": pipeline_state["last_run"],
        "last_result": pipeline_state["last_result"],
    }


# ---------------------------------------------------------------------------
# Request Analyze API
# ---------------------------------------------------------------------------

class RequestBody(BaseModel):
    symbols: list[str]


@app.post("/api/request")
async def request_analyze(body: RequestBody, background_tasks=None):
    """Fetch & analyze specific stocks in background."""
    symbols = body.symbols
    if not symbols:
        raise HTTPException(400, "symbols list is empty")

    async def _run():
        try:
            # Import fetch_multi_year from scripts
            sys.path.insert(0, str(SCRIPTS_DIR))
            from fetch_data import fetch_multi_year

            results = []
            for sym in symbols:
                try:
                    data = fetch_multi_year(sym)
                    results.append(data)
                except Exception as e:
                    results.append({"symbol": sym, "error": str(e)})

            today = datetime.now().strftime("%Y-%m-%d")
            joined = "_".join(s.replace(".BK", "") for s in symbols)
            out_path = DATA_DIR / f"request_{today}_{joined}.json"
            out_path.write_text(
                json.dumps(
                    {
                        "date": today,
                        "type": "request",
                        "symbols": symbols,
                        "stocks": results,
                    },
                    ensure_ascii=False,
                    indent=2,
                    default=str,
                ),
                encoding="utf-8",
            )
        except Exception as e:
            print(f"[request] error: {e}", file=sys.stderr)

    asyncio.create_task(_run())
    return {"status": "processing", "symbols": symbols}


@app.get("/api/requests")
async def list_requests():
    """List request result files."""
    files = list_files(DATA_DIR, "request_*.json")
    return {"requests": files}


# ---------------------------------------------------------------------------
# Pipeline Control API
# ---------------------------------------------------------------------------

PIPELINE_MAP = {
    "fetch": ["fetch_data.py"],
    "analyze": ["analyze.py"],
    "screen": ["screen_stocks.py"],
    "discover": ["discover.py"],
    "weekly": ["fetch_data.py", "analyze.py"],
    "discovery": ["fetch_data.py", "screen_stocks.py", "discover.py"],
}


@app.post("/api/run/{action}")
async def run_pipeline(action: str):
    if action not in PIPELINE_MAP:
        raise HTTPException(400, f"Unknown action: {action}. Valid: {list(PIPELINE_MAP.keys())}")

    if pipeline_state["running"]:
        raise HTTPException(409, f"Pipeline already running: {pipeline_state['current_task']}")

    scripts = PIPELINE_MAP[action]

    def _execute_sync():
        pipeline_state["running"] = True
        pipeline_state["last_result"] = None
        try:
            env = {**os.environ, "PYTHONUTF8": "1"}
            for script in scripts:
                pipeline_state["current_task"] = script
                script_path = SCRIPTS_DIR / script
                result = subprocess.run(
                    [sys.executable, str(script_path)],
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    cwd=str(PROJECT_DIR),
                    env=env,
                    timeout=600,
                )
                if result.returncode != 0:
                    err_msg = result.stderr[:500] if result.stderr else ""
                    out_msg = result.stdout[-500:] if result.stdout else ""
                    pipeline_state["last_result"] = f"FAILED at {script}: {err_msg}"
                    logging.error(f"[pipeline] {script} failed:\nSTDERR: {result.stderr}\nSTDOUT: {result.stdout}")
                    return
            pipeline_state["last_result"] = f"OK — {action} completed"
        except Exception as e:
            pipeline_state["last_result"] = f"ERROR: {e}"
            logging.error(f"[pipeline] error: {e}")
        finally:
            pipeline_state["running"] = False
            pipeline_state["current_task"] = None
            pipeline_state["last_run"] = datetime.now().isoformat()

    import threading
    threading.Thread(target=_execute_sync, daemon=True).start()
    return {"status": "started", "action": action, "scripts": scripts}


@app.get("/api/events")
async def sse_events(request: Request):
    """SSE endpoint streaming pipeline status every 2 seconds."""
    async def event_generator():
        while True:
            if await request.is_disconnected():
                break
            data = json.dumps({
                "pipeline_running": pipeline_state["running"],
                "current_task": pipeline_state["current_task"],
                "last_run": pipeline_state["last_run"],
                "last_result": pipeline_state["last_result"],
            })
            yield {"event": "status", "data": data}
            await asyncio.sleep(2)

    return EventSourceResponse(event_generator())


# ---------------------------------------------------------------------------
# Reports API
# ---------------------------------------------------------------------------

@app.get("/api/reports")
async def list_reports():
    """List report files grouped by type."""
    weekly = list_files(REPORTS_DIR, "weekly_*.md")
    discovery = list_files(REPORTS_DIR, "discovery_*.md")
    # Also check for request-based reports in data/
    requests = list_files(DATA_DIR, "request_*.json")
    return {
        "weekly": weekly,
        "discovery": discovery,
        "request": requests,
    }


@app.get("/api/reports/{report_type}")
async def get_report(report_type: str, date: Optional[str] = None):
    """Render a markdown report to HTML."""
    if report_type not in ("weekly", "discovery"):
        raise HTTPException(400, f"Unknown report type: {report_type}")

    if date:
        path = REPORTS_DIR / f"{report_type}_{date}.md"
    else:
        path = find_latest(f"{report_type}_*.md", REPORTS_DIR)

    if not path or not path.exists():
        raise HTTPException(404, f"Report not found: {report_type} {date or 'latest'}")

    md_text = path.read_text(encoding="utf-8")
    html = markdown.markdown(
        md_text,
        extensions=["tables", "fenced_code"],
    )
    return HTMLResponse(content=html)


# ---------------------------------------------------------------------------
# Config System
# ---------------------------------------------------------------------------

CONFIG_PATH = PROJECT_DIR / "config.json"
DEFAULT_CONFIG = {
    "schedule": {"enabled": True, "day_of_week": "sun", "hour": 9, "minute": 0},
    "pipeline": {"odd_weeks": "weekly", "even_weeks": "discovery"},
    "filters": {
        "min_roe_avg": 0.15,
        "min_roe_floor": 0.12,
        "min_net_margin": 0.10,
        "max_de_non_fin": 1.5,
        "max_de_financial": 10,
        "min_eps_positive_years": 3,
        "min_fcf_positive_years": 3,
        "min_market_cap": 5_000_000_000,
    },
}


def load_config() -> dict:
    """Load config from file, merged with defaults for missing keys."""
    if CONFIG_PATH.exists():
        try:
            saved = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            config = {}
            for k in DEFAULT_CONFIG:
                if isinstance(DEFAULT_CONFIG[k], dict):
                    config[k] = {**DEFAULT_CONFIG[k], **(saved.get(k) or {})}
                else:
                    config[k] = saved.get(k, DEFAULT_CONFIG[k])
            return config
        except Exception as e:
            logging.error(f"[config] failed to load: {e}")
    return {k: (dict(v) if isinstance(v, dict) else v) for k, v in DEFAULT_CONFIG.items()}


def save_config(config: dict):
    """Write config to file."""
    CONFIG_PATH.write_text(
        json.dumps(config, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# Settings API
# ---------------------------------------------------------------------------

@app.get("/api/settings")
async def get_settings():
    return load_config()


@app.post("/api/settings")
async def post_settings(request: Request):
    body = await request.json()
    config = load_config()
    for k in body:
        if k in config and isinstance(config[k], dict) and isinstance(body[k], dict):
            config[k].update(body[k])
        else:
            config[k] = body[k]
    save_config(config)
    apply_schedule(config)
    return {"status": "ok", "config": config}


# ---------------------------------------------------------------------------
# Scheduler
# ---------------------------------------------------------------------------

def get_week_of_month() -> int:
    """Return week number 1-4+ for current date."""
    today = datetime.now()
    return (today.day - 1) // 7 + 1


def scheduled_run():
    """Run pipeline based on config — week logic from config['pipeline']."""
    if pipeline_state["running"]:
        print("[scheduler] pipeline already running, skip")
        return
    config = load_config()
    pipeline_cfg = config.get("pipeline", DEFAULT_CONFIG["pipeline"])
    week = get_week_of_month()
    action = pipeline_cfg["odd_weeks"] if week in (1, 3) else pipeline_cfg["even_weeks"]
    if action not in PIPELINE_MAP:
        logging.error(f"[scheduler] unknown action '{action}' in config, falling back to weekly")
        action = "weekly"
    print(f"[scheduler] week {week} — running {action}")
    scripts = PIPELINE_MAP[action]
    pipeline_state["running"] = True
    pipeline_state["last_result"] = None
    try:
        env = {**os.environ, "PYTHONUTF8": "1"}
        for script in scripts:
            pipeline_state["current_task"] = script
            script_path = SCRIPTS_DIR / script
            result = subprocess.run(
                [sys.executable, str(script_path)],
                capture_output=True,
                text=True,
                encoding="utf-8",
                cwd=str(PROJECT_DIR),
                env=env,
                timeout=600,
            )
            if result.returncode != 0:
                err_msg = result.stderr[:500] if result.stderr else ""
                pipeline_state["last_result"] = f"FAILED at {script}: {err_msg}"
                logging.error(f"[scheduler] {script} failed:\nSTDERR: {result.stderr}\nSTDOUT: {result.stdout}")
                return
        pipeline_state["last_result"] = f"OK — scheduled {action} completed"
    except Exception as e:
        pipeline_state["last_result"] = f"ERROR: {e}"
        logging.error(f"[scheduler] error: {e}")
    finally:
        pipeline_state["running"] = False
        pipeline_state["current_task"] = None
        pipeline_state["last_run"] = datetime.now().isoformat()


scheduler = BackgroundScheduler()


def apply_schedule(config: dict):
    """Add or remove scheduler job based on config."""
    sched = config.get("schedule", DEFAULT_CONFIG["schedule"])
    try:
        scheduler.remove_job("max_pipeline")
    except Exception:
        pass
    if sched.get("enabled", True):
        scheduler.add_job(
            scheduled_run,
            "cron",
            id="max_pipeline",
            day_of_week=sched.get("day_of_week", "sun"),
            hour=sched.get("hour", 9),
            minute=sched.get("minute", 0),
        )
        logging.info(f"[scheduler] scheduled: {sched['day_of_week']} {sched['hour']:02d}:{sched['minute']:02d}")
    else:
        logging.info("[scheduler] disabled by config")


@app.on_event("startup")
async def on_startup():
    scheduler.start()
    apply_schedule(load_config())
    start_refresh_loop(
        port=50089,
        pid=os.getpid(),
        start_time=START_TIME,
        pipeline_state=pipeline_state,
        data_dir=DATA_DIR,
    )


@app.on_event("shutdown")
async def on_shutdown():
    scheduler.shutdown(wait=False)


# ---------------------------------------------------------------------------
# DCA Simulator API
# ---------------------------------------------------------------------------

@app.get("/api/dca/{symbol}")
async def dca_simulate(
    symbol: str,
    days: str = "1,15",
    amount: float = 5000,
    backtest_years: int = 0,
    forward_years: int = 10,
    reinvest: bool = True,
    price_growth: Optional[float] = None,
    div_growth: Optional[float] = None,
):
    """DCA backtest + forward projection for a stock.

    backtest_years: 0 = use all available history
    forward_years: projection period
    price_growth/div_growth: override auto-detected rates (as decimal, e.g. 0.08 = 8%)
    """
    import yfinance as yf
    import pandas as pd
    from datetime import date, timedelta
    import math

    ticker_symbol = symbol if ".BK" in symbol.upper() else symbol + ".BK"
    ticker_symbol = ticker_symbol.upper()

    try:
        ticker = yf.Ticker(ticker_symbol)
    except Exception as e:
        raise HTTPException(400, f"Cannot fetch ticker: {e}")

    # Parse DCA days
    try:
        dca_days = sorted(set(int(d.strip()) for d in days.split(",") if d.strip()))
    except ValueError:
        raise HTTPException(400, "Invalid days format. Use comma-separated numbers e.g. 1,15")

    if not dca_days or any(d < 1 or d > 28 for d in dca_days):
        raise HTTPException(400, "Days must be between 1 and 28")

    # Fetch historical price data (max available)
    try:
        hist = ticker.history(period="max", auto_adjust=True)
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch history: {e}")

    if hist.empty:
        raise HTTPException(404, f"No price history for {ticker_symbol}")

    # Fetch dividends
    try:
        dividends = ticker.dividends
    except Exception:
        dividends = None

    # Get current stock data for forward projection
    stock_agg = {}
    scr_path = find_latest("screener_*.json", DATA_DIR)
    if scr_path:
        scr = read_json(scr_path)
        for c in scr.get("candidates", []):
            if c.get("symbol", "").upper() == ticker_symbol:
                stock_agg = c.get("aggregates", {})
                break
    if not stock_agg:
        snap_path = find_latest("snapshot_*.json", DATA_DIR)
        if snap_path:
            snap = read_json(snap_path)
            for s in snap.get("stocks", []):
                if s.get("symbol", "").upper() == ticker_symbol:
                    stock_agg = s.get("aggregates", {})
                    break

    # ===== HISTORICAL BACKTEST =====
    hist.index = hist.index.tz_localize(None) if hist.index.tz else hist.index

    # Filter to backtest_years if specified
    if backtest_years > 0:
        cutoff = hist.index[-1] - pd.DateOffset(years=backtest_years)
        hist = hist[hist.index >= cutoff]

    available_dates = hist.index.to_list()

    if dividends is not None and not dividends.empty:
        dividends.index = dividends.index.tz_localize(None) if dividends.index.tz else dividends.index

    def find_next_trading_day(target_date, max_days=10):
        """Find the next available trading day on or after target_date."""
        for offset in range(max_days):
            check = target_date + timedelta(days=offset)
            if check in hist.index:
                return check
        return None

    # Run backtest
    total_shares = 0.0
    total_invested = 0.0
    total_dividends_received = 0.0
    dividend_pool = 0.0  # accumulated dividends for reinvestment
    yearly_backtest = []

    start_year = hist.index[0].year
    end_year = hist.index[-1].year

    for year in range(start_year, end_year + 1):
        year_shares_bought = 0.0
        year_invested = 0.0
        year_dividends = 0.0

        for month in range(1, 13):
            for day in dca_days:
                try:
                    target = date(year, month, day)
                except ValueError:
                    continue  # invalid date (e.g., Feb 30)

                target_ts = pd.Timestamp(target)
                trading_day = find_next_trading_day(target_ts)
                if trading_day is None:
                    continue

                price = hist.loc[trading_day, "Close"]
                if price <= 0:
                    continue

                invest_amount = amount
                # Add dividend pool if reinvesting
                if reinvest and dividend_pool > 0:
                    invest_amount += dividend_pool
                    dividend_pool = 0.0

                shares = invest_amount / price
                total_shares += shares
                total_invested += amount  # track original investment only
                year_shares_bought += shares
                year_invested += amount

        # Calculate dividends received this year
        if dividends is not None and not dividends.empty:
            year_divs = dividends[(dividends.index.year == year)]
            for div_date, div_amount in year_divs.items():
                div_received = div_amount * total_shares
                year_dividends += div_received
                total_dividends_received += div_received
                if reinvest:
                    dividend_pool += div_received

        # End-of-year valuation
        year_end_prices = hist[hist.index.year == year]
        if not year_end_prices.empty:
            eoy_price = year_end_prices.iloc[-1]["Close"]
            portfolio_value = total_shares * eoy_price
        else:
            portfolio_value = 0

        if year_invested > 0 or total_invested > 0:
            yearly_backtest.append({
                "year": year,
                "shares_bought": round(year_shares_bought, 2),
                "invested_this_year": round(year_invested, 0),
                "total_shares": round(total_shares, 2),
                "total_invested": round(total_invested, 0),
                "portfolio_value": round(portfolio_value, 0),
                "dividends_received": round(year_dividends, 0),
                "total_dividends": round(total_dividends_received, 0),
            })

    # Current valuation
    current_price = hist.iloc[-1]["Close"] if not hist.empty else 0
    current_value = total_shares * current_price
    total_return_pct = ((current_value + total_dividends_received - total_invested) / total_invested * 100) if total_invested > 0 else 0

    # CAGR
    years_elapsed = (hist.index[-1] - hist.index[0]).days / 365.25 if len(hist) > 1 else 1
    if total_invested > 0 and years_elapsed > 0 and current_value > 0:
        cagr = (((current_value + total_dividends_received) / total_invested) ** (1 / years_elapsed) - 1) * 100
    else:
        cagr = 0

    # Yield on Cost
    # Use last year's dividends per share * total shares / total invested
    last_year = end_year
    last_year_divs = dividends[(dividends.index.year == last_year)].sum() if dividends is not None and not dividends.empty else 0
    annual_div_income = last_year_divs * total_shares
    yield_on_cost = (annual_div_income / total_invested * 100) if total_invested > 0 else 0

    avg_cost = total_invested / total_shares if total_shares > 0 else 0

    backtest_result = {
        "total_invested": round(total_invested, 0),
        "current_value": round(current_value, 0),
        "total_shares": round(total_shares, 2),
        "avg_cost": round(avg_cost, 2),
        "current_price": round(current_price, 2),
        "total_return_pct": round(total_return_pct, 1),
        "cagr": round(cagr, 1),
        "total_dividends": round(total_dividends_received, 0),
        "yield_on_cost": round(yield_on_cost, 1),
        "years": round(years_elapsed, 1),
        "yearly": yearly_backtest,
    }

    # ===== FORWARD PROJECTION =====
    # Auto-detect growth rates from aggregates
    auto_price_growth = stock_agg.get("eps_cagr") or stock_agg.get("revenue_cagr") or 0.08
    if auto_price_growth < 0:
        auto_price_growth = 0.03
    auto_price_growth = min(max(auto_price_growth, 0.03), 0.15)

    # Get current dividend yield
    info = {}
    try:
        info = ticker.info or {}
    except Exception:
        pass
    current_div_yield = info.get("dividendYield") or info.get("trailingAnnualDividendYield") or 0
    if current_div_yield > 1:
        current_div_yield = current_div_yield / 100  # normalize

    # Derive base DPS from historical dividends (fallback 3 years)
    base_dps = 0
    if dividends is not None and not dividends.empty:
        for yr_check in [end_year, end_year - 1, end_year - 2]:
            yr_divs = dividends[dividends.index.year == yr_check].sum()
            if yr_divs > 0:
                base_dps = yr_divs
                break
    if base_dps == 0:
        base_dps = current_price * current_div_yield

    # Auto dividend growth rate
    dps_cagr = stock_agg.get("dps_cagr")
    if dps_cagr and dps_cagr > 0:
        auto_div_growth = min(max(dps_cagr, 0.02), 0.10)
    elif stock_agg.get("dividend_growth_streak", 0) > 5:
        auto_div_growth = 0.07
    elif stock_agg.get("dividend_growth_streak", 0) > 3:
        auto_div_growth = 0.05
    else:
        auto_div_growth = 0.03

    # Use user overrides or auto
    price_growth_auto = price_growth is None
    div_growth_auto = div_growth is None
    price_growth_rate = auto_price_growth if price_growth is None else price_growth
    div_growth_rate = auto_div_growth if div_growth is None else div_growth

    dca_per_year = amount * len(dca_days) * 12
    proj_shares = 0.0
    proj_invested = 0.0
    proj_dividends = 0.0
    proj_price = current_price
    proj_div_yield = current_div_yield
    yearly_projection = []

    for yr in range(1, forward_years + 1):
        # Price grows
        proj_price = current_price * ((1 + price_growth_rate) ** yr)

        # Buy shares throughout the year at average price for that year
        avg_price_this_year = current_price * ((1 + price_growth_rate) ** (yr - 0.5))
        shares_this_year = dca_per_year / avg_price_this_year if avg_price_this_year > 0 else 0

        # Reinvest dividends
        div_income = 0
        if proj_shares > 0:
            # Dividend per share grows from historical base DPS
            dps_this_year = base_dps * ((1 + div_growth_rate) ** yr)
            div_income = dps_this_year * proj_shares
            proj_dividends += div_income
            if reinvest and avg_price_this_year > 0:
                shares_this_year += div_income / avg_price_this_year

        proj_shares += shares_this_year
        proj_invested += dca_per_year
        portfolio_val = proj_shares * proj_price

        yearly_projection.append({
            "year": yr,
            "price": round(proj_price, 2),
            "shares_bought": round(shares_this_year, 2),
            "total_shares": round(proj_shares, 2),
            "total_invested": round(proj_invested, 0),
            "portfolio_value": round(portfolio_val, 0),
            "dividends_this_year": round(div_income, 0),
            "total_dividends": round(proj_dividends, 0),
        })

    proj_final_value = proj_shares * proj_price if yearly_projection else 0
    proj_total_return = ((proj_final_value + proj_dividends - proj_invested) / proj_invested * 100) if proj_invested > 0 else 0
    proj_cagr = ((((proj_final_value + proj_dividends) / proj_invested) ** (1 / forward_years)) - 1) * 100 if proj_invested > 0 and forward_years > 0 else 0
    proj_yoc = 0
    if yearly_projection and proj_invested > 0:
        last_div = yearly_projection[-1]["dividends_this_year"]
        proj_yoc = (last_div / proj_invested * 100)

    projection_result = {
        "total_invested": round(proj_invested, 0),
        "projected_value": round(proj_final_value, 0),
        "total_shares": round(proj_shares, 2),
        "total_return_pct": round(proj_total_return, 1),
        "cagr": round(proj_cagr, 1),
        "total_dividends": round(proj_dividends, 0),
        "yield_on_cost": round(proj_yoc, 1),
        "assumptions": {
            "price_growth_rate": round(price_growth_rate * 100, 1),
            "price_growth_source": f"จาก EPS CAGR {auto_price_growth*100:.1f}%" if price_growth_auto else "กำหนดเอง",
            "div_growth_rate": round(div_growth_rate * 100, 1),
            "div_growth_source": f"จาก DPS CAGR {auto_div_growth*100:.1f}%" if div_growth_auto else "กำหนดเอง",
            "current_div_yield": round(current_div_yield * 100, 1),
        },
        "yearly": yearly_projection,
    }

    return {
        "symbol": ticker_symbol,
        "dca_days": dca_days,
        "amount_per_dca": amount,
        "reinvest_dividends": reinvest,
        "backtest_years": backtest_years,
        "forward_years": forward_years,
        "backtest": backtest_result,
        "projection": projection_result,
    }


# ---------------------------------------------------------------------------
# Static files (SPA) — mount last so API routes take priority
# ---------------------------------------------------------------------------
if WEB_DIR.exists():
    app.mount("/", StaticFiles(directory=str(WEB_DIR), html=True), name="static")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run(
        "server.app:app",
        host="0.0.0.0",
        port=50089,
        reload=True,
        log_level="warning",
        access_log=False,
    )
