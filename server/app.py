"""Max Mahon — FastAPI server for stock dashboard.

Serves data APIs, pipeline control, reports, and static files.
Run: py -m uvicorn server.app:app --port 50089
"""

import asyncio
import json
import logging
import os
import re
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, timedelta
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

try:
    import anthropic as _anthropic_mod
    _anthropic_client = None
except ImportError:
    _anthropic_mod = None
    _anthropic_client = None
    logging.warning("anthropic package not installed — /api/stock/{symbol}/analysis disabled")

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
_ANALYSIS_CACHE_DIR = PROJECT_DIR / "data" / "analysis_cache"
_ANALYSIS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
_CACHE_TTL_DAYS = 7  # plan 05 Phase 3 — Claude cache TTL

# ---------------------------------------------------------------------------
# Env / Auth
# ---------------------------------------------------------------------------
load_dotenv(Path("C:/WORKSPACE/.env"))
MAX_TOKEN = os.getenv("MAX_TOKEN", "")

if _anthropic_mod and _anthropic_client is None:
    _ak = os.getenv("MAX_ANTHROPIC_API_KEY")
    if _ak:
        _anthropic_client = _anthropic_mod.Anthropic(api_key=_ak)
    else:
        logging.warning("MAX_ANTHROPIC_API_KEY not set — AI analysis disabled")

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Max Mahon Server", version="4.0.0")
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
_pipeline_lock = threading.Lock()

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


def _norm_sym(s: str) -> str:
    """Normalize symbol for comparison — strip .BK suffix + upper.

    Mobile UI strips .BK when displaying, screener stores with .BK.
    Match both forms by normalizing both sides.
    """
    return (s or "").upper().replace(".BK", "")


def _get_historical_passed_symbols(exclude_current: Optional[Path] = None) -> set:
    """Return set of all symbols that ever passed (appeared in `candidates` array) in any prior screener file."""
    all_syms = set()
    for scr_file in DATA_DIR.glob("screener_*.json"):
        if exclude_current and scr_file == exclude_current:
            continue
        try:
            data = read_json(scr_file)
            for c in data.get("candidates", []):
                sym = _norm_sym(c.get("symbol", ""))
                if sym:
                    all_syms.add(sym)
        except Exception:
            continue
    return all_syms


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
    data = read_json(path)
    # P3.1 — tag each candidate with is_new_in_batch (never passed in any prior screener)
    historical = _get_historical_passed_symbols(exclude_current=path)
    # P3.2 — inject in_watchlist on BOTH candidates + filtered_out_stocks from live user_data
    try:
        user_data = load_user_data()
    except Exception:
        user_data = {"watchlist": []}
    watched = {_norm_sym(s) for s in (user_data.get("watchlist") or [])}
    for c in data.get("candidates", []):
        sym = _norm_sym(c.get("symbol", ""))
        c["is_new_in_batch"] = bool(sym) and sym not in historical
        c["in_watchlist"] = bool(sym) and sym in watched
    for c in data.get("review_candidates", []):
        sym = _norm_sym(c.get("symbol", ""))
        c["in_watchlist"] = bool(sym) and sym in watched
    for c in data.get("filtered_out_stocks", []):
        sym = _norm_sym(c.get("symbol", ""))
        c["in_watchlist"] = bool(sym) and sym in watched
    return data


@app.get("/api/stock/{symbol}")
async def get_stock(symbol: str):
    """Merge stock data from snapshot + screener."""
    stock_data = None

    # Try snapshot first (watchlist stocks)
    snap_path = find_latest("snapshot_*.json", DATA_DIR)
    if snap_path:
        snap = read_json(snap_path)
        for s in snap.get("stocks", []):
            if _norm_sym(s.get("symbol", "")) == _norm_sym(symbol):
                stock_data = dict(s)
                break

    # Enrich or fallback from screener (discoveries + score)
    scr_path = find_latest("screener_*.json", DATA_DIR)
    if scr_path:
        scr = read_json(scr_path)
        for c in scr.get("candidates", []):
            if _norm_sym(c.get("symbol", "")) == _norm_sym(symbol):
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
                if _norm_sym(s.get("symbol", "")) == _norm_sym(symbol):
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
async def get_scan_history():
    """Return list of all scans (newest first)."""
    history_file = DATA_DIR / "history.json"
    if not history_file.exists():
        return {"scans": [], "total": 0}
    data = read_json(history_file)
    scans = data.get("scans", [])
    # sort newest first by num desc
    scans_sorted = sorted(scans, key=lambda s: s.get("num", 0), reverse=True)
    return {"scans": scans_sorted, "total": len(scans_sorted)}


@app.get("/api/stock/{symbol}/history")
async def get_stock_history(symbol: str):
    """Aggregate score + signal changes across all screener files for a symbol.

    Returns:
        {symbol, timeline: [{date, scan_num, score, signals, passed, reasons}],
         events: [{date, scan_num, type, action, detail}]}
    Timeline points come from every screener_*.json sorted by date ASC.
    Events are derived (first_pass / failed / passed / signal) + watchlist adds.
    """
    sym_norm = _norm_sym(symbol)
    timeline: list[dict] = []

    # Load history.json to map screener dates → scan numbers
    history_file = DATA_DIR / "history.json"
    scan_nums: dict[str, int] = {}
    if history_file.exists():
        try:
            hist = read_json(history_file)
            for s in hist.get("scans", []):
                rep = s.get("report", "") or ""
                # scan_YYYY-MM-DD.md → date key
                date_key = rep.replace("scan_", "").replace(".md", "") if rep else None
                if date_key:
                    scan_nums[date_key] = s.get("num")
        except Exception as e:
            logging.warning(f"stock history: history.json parse error: {e}")

    # Iterate screener files chronologically (old → new)
    for scr_file in sorted(DATA_DIR.glob("screener_*.json")):
        try:
            data = read_json(scr_file)
            date = data.get("date") or scr_file.stem.replace("screener_", "")
            scan_num = scan_nums.get(date)
            found = False
            for c in data.get("candidates", []):
                if _norm_sym(c.get("symbol", "")) == sym_norm:
                    timeline.append({
                        "date": date,
                        "scan_num": scan_num,
                        "score": c.get("score"),
                        "signals": c.get("signals", []) or [],
                        "passed": True,
                        "reasons": [],
                    })
                    found = True
                    break
            if not found:
                for c in data.get("filtered_out_stocks", []) or []:
                    if _norm_sym(c.get("symbol", "")) == sym_norm:
                        reasons = c.get("filter_reasons") or c.get("reasons") or []
                        timeline.append({
                            "date": date,
                            "scan_num": scan_num,
                            "score": None,
                            "signals": [],
                            "passed": False,
                            "reasons": reasons,
                        })
                        break
        except Exception as e:
            logging.warning(f"stock history parse error {scr_file}: {e}")

    # Load watchlist events (if exists)
    events_file = DATA_DIR / "watchlist_events.jsonl"
    watchlist_events: list[dict] = []
    if events_file.exists():
        try:
            for line in events_file.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    ev = json.loads(line)
                    if _norm_sym(ev.get("symbol", "")) == sym_norm:
                        watchlist_events.append(ev)
                except Exception:
                    continue
        except Exception as e:
            logging.warning(f"stock history: watchlist_events read error: {e}")

    # Derive events from timeline transitions
    events: list[dict] = []
    prev_passed: Optional[bool] = None
    prev_signals: set = set()
    for pt in timeline:
        if prev_passed is None and pt["passed"] is True:
            events.append({
                "date": pt["date"],
                "scan_num": pt["scan_num"],
                "type": "first_pass",
                "action": "ผ่านเกณฑ์ (ครั้งแรก)",
                "detail": f"score {pt['score']}" if pt["score"] is not None else "",
            })
        elif prev_passed is True and pt["passed"] is False:
            detail = pt["reasons"][0] if pt["reasons"] else ""
            events.append({
                "date": pt["date"],
                "scan_num": pt["scan_num"],
                "type": "failed",
                "action": "หลุดรอบ",
                "detail": detail,
            })
        elif prev_passed is False and pt["passed"] is True:
            events.append({
                "date": pt["date"],
                "scan_num": pt["scan_num"],
                "type": "passed",
                "action": "กลับมาผ่านเกณฑ์",
                "detail": f"score {pt['score']}" if pt["score"] is not None else "",
            })
        # new signal (appeared this scan, not in previous)
        new_signals = set(pt["signals"]) - prev_signals
        for sig in sorted(new_signals):
            events.append({
                "date": pt["date"],
                "scan_num": pt["scan_num"],
                "type": "signal",
                "action": f"Signal: {sig}",
                "detail": "",
            })
        prev_passed = pt["passed"]
        prev_signals = set(pt["signals"])

    # Merge watchlist events
    for ev in watchlist_events:
        raw_date = ev.get("date", "") or ""
        action = ev.get("action", "")
        events.append({
            "date": raw_date[:10],
            "scan_num": None,
            "type": f"watchlist_{action}",
            "action": "เพิ่มใน watchlist" if action == "add" else "ถอดจาก watchlist",
            "detail": "",
        })

    # Sort events newest first
    events.sort(key=lambda e: e["date"] or "", reverse=True)

    return {"symbol": symbol, "timeline": timeline, "events": events}


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


request_status: dict[str, str] = {}  # symbol → "processing" | "done" | "error"
request_timestamps: dict[str, datetime] = {}  # symbol → when status was set


def _cleanup_request_status():
    """Remove entries older than 24 hours."""
    cutoff = datetime.now() - timedelta(hours=24)
    expired = [k for k, v in request_timestamps.items() if v < cutoff]
    for k in expired:
        del request_timestamps[k]
        request_status.pop(k, None)


def _fetch_one(sym: str):
    """Blocking fetch — runs in thread pool."""
    _project_root = str(PROJECT_DIR)
    if _project_root not in sys.path:
        sys.path.insert(0, _project_root)
    from scripts.fetch_data import fetch_multi_year
    return fetch_multi_year(sym)


@app.post("/api/request")
async def request_analyze(body: RequestBody):
    """Fetch & analyze specific stocks in background."""
    _cleanup_request_status()

    # Normalize symbols — auto-append .BK if missing
    symbols = []
    for s in body.symbols:
        s = s.strip().upper()
        if not s:
            continue
        if not s.endswith(".BK"):
            s += ".BK"
        symbols.append(s)

    if not symbols:
        raise HTTPException(400, "symbols list is empty")

    now = datetime.now()
    for s in symbols:
        request_status[s] = "processing"
        request_timestamps[s] = now

    async def _run():
        loop = asyncio.get_event_loop()
        try:
            results = []
            for sym in symbols:
                try:
                    data = await loop.run_in_executor(None, _fetch_one, sym)
                    results.append(data)
                    request_status[sym] = "done"
                    request_timestamps[sym] = datetime.now()
                except Exception as e:
                    results.append({"symbol": sym, "error": str(e)})
                    request_status[sym] = "error"
                    request_timestamps[sym] = datetime.now()

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
            for sym in symbols:
                request_status[sym] = "error"
                request_timestamps[sym] = datetime.now()
            print(f"[request] error: {e}", file=sys.stderr)

    asyncio.create_task(_run())
    return {"status": "processing", "symbols": symbols}


@app.get("/api/request/status")
async def get_request_status():
    """Get processing status for requested symbols."""
    return request_status


@app.get("/api/requests")
async def list_requests():
    """List request results with stock data."""
    results = []
    for f in sorted(DATA_DIR.glob("request_*.json"), reverse=True):
        try:
            data = read_json(f)
            results.append({
                "file": f.name,
                "date": data.get("date"),
                "symbols": data.get("symbols", []),
                "stocks": data.get("stocks", []),
                "count": len(data.get("stocks", [])),
            })
        except Exception:
            pass
    return {"requests": results}


# ---------------------------------------------------------------------------
# Pipeline Control API
# ---------------------------------------------------------------------------

PIPELINE_MAP = {
    "scan": ["fetch_data.py", "update_universe.py", "screen_stocks.py", "scan.py"],
}


def _get_scripts_for_mode(mode: str) -> list[str]:
    """Return script list for a pipeline mode."""
    if mode not in PIPELINE_MAP:
        logging.error(f"[pipeline] unknown mode '{mode}', falling back to scan")
        mode = "scan"
    return PIPELINE_MAP[mode]


def _execute_sync(scripts: list[str], label: str = "pipeline"):
    """Run pipeline scripts sequentially. Blocks the calling thread.

    Acquires pipeline_lock, updates pipeline_state throughout.
    """
    with _pipeline_lock:
        if pipeline_state["running"]:
            return
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
                timeout=1800,
            )
            if result.returncode != 0:
                err_msg = result.stderr[:500] if result.stderr else ""
                pipeline_state["last_result"] = f"FAILED at {script}: {err_msg}"
                logging.error(f"[{label}] {script} failed:\nSTDERR: {result.stderr}\nSTDOUT: {result.stdout}")
                return
        pipeline_state["last_result"] = f"OK — {label} completed"
    except Exception as e:
        pipeline_state["last_result"] = f"ERROR: {e}"
        logging.error(f"[{label}] error: {e}")
    finally:
        pipeline_state["running"] = False
        pipeline_state["current_task"] = None
        pipeline_state["last_run"] = datetime.now().isoformat()


@app.post("/api/scan/trigger")
async def trigger_scan():
    """Manual trigger unified scan pipeline."""
    with _pipeline_lock:
        if pipeline_state["running"]:
            raise HTTPException(409, f"Pipeline already running: {pipeline_state['current_task']}")
    scripts = _get_scripts_for_mode("scan")
    threading.Thread(target=_execute_sync, args=(scripts, "manual scan"), daemon=True).start()
    return {"status": "started", "mode": "scan", "scripts": scripts}


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
            yield {"event": "status", "data": data, "retry": 10000}
            await asyncio.sleep(5)

    return EventSourceResponse(event_generator())


# ---------------------------------------------------------------------------
# Reports API
# ---------------------------------------------------------------------------

@app.get("/api/reports")
async def list_reports():
    """List report files (scan + ad-hoc requests)."""
    scans = list_files(REPORTS_DIR, "scan_*.md")
    requests = list_files(DATA_DIR, "request_*.json")
    return {
        "scans": scans,
        "requests": requests,
    }


@app.get("/api/reports/scan")
async def get_scan_report(num: Optional[int] = None):
    """Return rendered HTML of a scan report. num=latest if not provided."""
    history_file = DATA_DIR / "history.json"
    if not history_file.exists():
        raise HTTPException(404, "No scan history")
    history = read_json(history_file)
    scans = history.get("scans", [])
    if not scans:
        raise HTTPException(404, "No scans found")
    if num is None:
        entry = max(scans, key=lambda s: s.get("num", 0))
    else:
        entry = next((s for s in scans if s.get("num") == num), None)
    if not entry:
        raise HTTPException(404, f"Scan #{num} not found")
    report_name = entry.get("report", "")
    if not report_name:
        raise HTTPException(404, "Scan entry missing report filename")
    report_path = REPORTS_DIR / report_name
    # path safety — must stay under REPORTS_DIR
    try:
        if not report_path.resolve().is_relative_to(REPORTS_DIR.resolve()):
            raise HTTPException(400, "Invalid report path")
    except AttributeError:
        # Python <3.9 fallback
        if REPORTS_DIR.resolve() not in report_path.resolve().parents:
            raise HTTPException(400, "Invalid report path")
    if not report_path.exists():
        raise HTTPException(404, f"Report file {report_name} missing")
    md_text = report_path.read_text(encoding="utf-8")
    # strip YAML frontmatter if present
    if md_text.startswith("---"):
        end = md_text.find("---", 3)
        if end != -1:
            md_text = md_text[end + 3:].lstrip()
    html = markdown.markdown(md_text, extensions=["tables", "fenced_code"])
    return {
        "num": entry.get("num"),
        "date": entry.get("date"),
        "counts": entry.get("counts", {}),
        "summary": entry.get("summary", ""),
        "html": html,
    }


# ---------------------------------------------------------------------------
# Config System
# ---------------------------------------------------------------------------

CONFIG_PATH = PROJECT_DIR / "config.json"
DEFAULT_CONFIG = {
    "schedule": {"enabled": True, "day_of_week": "sun", "hour": 9, "minute": 0},
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

def scheduled_run():
    """Run unified scan pipeline weekly."""
    config = load_config()
    sched = config.get("schedule", {})
    if not sched.get("enabled", True):
        return
    print("[scheduler] running scan pipeline")
    scripts = _get_scripts_for_mode("scan")
    _execute_sync(scripts, "scheduled scan")


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

    # CAGR — clamp years_elapsed >= 1.0 to prevent explosion on short backtests
    years_elapsed = (hist.index[-1] - hist.index[0]).days / 365.25 if len(hist) > 1 else 1
    years_elapsed = max(years_elapsed, 1.0)
    if total_invested > 0 and years_elapsed > 0 and current_value > 0:
        cagr = (((current_value + total_dividends_received) / total_invested) ** (1 / years_elapsed) - 1) * 100
    else:
        cagr = 0

    # Yield on Cost — fallback 3 years if latest year has no dividend data
    last_year_divs = 0
    if dividends is not None and not dividends.empty:
        for yr_check in [end_year, end_year - 1, end_year - 2]:
            yr_sum = dividends[dividends.index.year == yr_check].sum()
            if yr_sum > 0:
                last_year_divs = yr_sum
                break
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
# User Data API
# ---------------------------------------------------------------------------

USER_DATA_PATH = PROJECT_DIR / "user_data.json"


def load_user_data() -> dict:
    if USER_DATA_PATH.exists():
        return json.loads(USER_DATA_PATH.read_text(encoding="utf-8"))
    return {"watchlist": [], "blacklist": [], "notes": {}, "custom_lists": {}, "updated_at": None}


def save_user_data(data: dict):
    data["updated_at"] = datetime.now().isoformat()
    USER_DATA_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _normalize_symbol(s: str) -> str:
    sym = s.strip().upper()
    if not sym.endswith(".BK"):
        sym += ".BK"
    return sym


@app.get("/api/user")
async def get_user_data():
    return load_user_data()


class WatchlistUpdate(BaseModel):
    add: list[str] = []
    remove: list[str] = []


@app.put("/api/user/watchlist")
async def update_watchlist(body: WatchlistUpdate):
    data = load_user_data()
    old_wl = set(data.get("watchlist") or [])
    wl = set(old_wl)
    for s in body.add:
        wl.add(_normalize_symbol(s))
    for s in body.remove:
        wl.discard(_normalize_symbol(s))
    data["watchlist"] = sorted(wl)
    save_user_data(data)

    # P5.2 — append watchlist events (add/remove) to jsonl log
    added = wl - old_wl
    removed = old_wl - wl
    if added or removed:
        events_file = DATA_DIR / "watchlist_events.jsonl"
        now_iso = datetime.now().isoformat()
        try:
            with events_file.open("a", encoding="utf-8") as f:
                for sym in sorted(added):
                    f.write(json.dumps(
                        {"date": now_iso, "symbol": sym, "action": "add"},
                        ensure_ascii=False,
                    ) + "\n")
                for sym in sorted(removed):
                    f.write(json.dumps(
                        {"date": now_iso, "symbol": sym, "action": "remove"},
                        ensure_ascii=False,
                    ) + "\n")
        except Exception as e:
            logging.warning(f"watchlist_events log error: {e}")

    return {"watchlist": data["watchlist"]}


@app.put("/api/user/blacklist")
async def update_blacklist(body: WatchlistUpdate):
    data = load_user_data()
    bl = set(data["blacklist"])
    for s in body.add:
        bl.add(_normalize_symbol(s))
    for s in body.remove:
        bl.discard(_normalize_symbol(s))
    data["blacklist"] = sorted(bl)
    save_user_data(data)
    return {"blacklist": data["blacklist"]}


class NoteUpdate(BaseModel):
    note: str


@app.put("/api/user/notes/{symbol}")
async def update_note(symbol: str, body: NoteUpdate):
    data = load_user_data()
    sym = _normalize_symbol(symbol)
    if body.note.strip():
        data["notes"][sym] = body.note.strip()
    else:
        data["notes"].pop(sym, None)
    save_user_data(data)
    return {"notes": data["notes"]}


class ListUpdate(BaseModel):
    add: list[str] = []
    remove: list[str] = []


@app.put("/api/user/lists/{list_name}")
async def update_custom_list(list_name: str, body: ListUpdate):
    data = load_user_data()
    cl = data.setdefault("custom_lists", {})
    items = set(cl.get(list_name, []))
    for s in body.add:
        items.add(_normalize_symbol(s))
    for s in body.remove:
        items.discard(_normalize_symbol(s))
    cl[list_name] = sorted(items)
    save_user_data(data)
    return {"list": list_name, "symbols": cl[list_name]}


@app.delete("/api/user/lists/{list_name}")
async def delete_custom_list(list_name: str):
    data = load_user_data()
    data.get("custom_lists", {}).pop(list_name, None)
    save_user_data(data)
    return {"deleted": list_name}


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


@app.get("/api/portfolio/pnl")
async def get_pnl():
    """Compute positions + totals from transactions.
    current_price pulled from latest screener (candidates + review + filtered_out).
    """
    data = load_user_data()
    txs = data.get("transactions", [])
    by_sym: dict[str, list] = {}
    for t in txs:
        by_sym.setdefault(t["symbol"], []).append(t)

    # Try latest screener for prices
    try:
        screener = _latest_screener_file()
        all_entries = (
            screener.get("candidates", [])
            + screener.get("review_candidates", [])
            + screener.get("filtered_out_stocks", [])
        )
        price_map = {
            e["symbol"]: (e.get("metrics") or {}).get("price") or e.get("price")
            for e in all_entries
            if e.get("symbol")
        }
    except HTTPException:
        price_map = {}

    positions = []
    total_cost = 0.0
    total_mv = 0.0
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
        positions.append({
            "symbol": sym,
            "qty": qty,
            "cost_basis": cost,
            "avg_cost": avg,
            "current_price": cur_price,
            "market_value": mv,
            "unrealized_pnl": pnl,
            "unrealized_pct": pct,
        })
        total_cost += cost
        if mv is not None:
            total_mv += mv
    return {
        "positions": positions,
        "total": {
            "cost": total_cost,
            "market_value": total_mv if total_mv else None,
            "unrealized_pnl": (total_mv - total_cost) if total_mv else None,
            "unrealized_pct": ((total_mv - total_cost) / total_cost * 100)
            if total_cost
            else None,
        },
    }


# ---------------------------------------------------------------------------
# Search API
# ---------------------------------------------------------------------------

# Operator functions for criteria matching
_OPS = {
    ">=": lambda a, b: a >= b,
    "<=": lambda a, b: a <= b,
    ">": lambda a, b: a > b,
    "<": lambda a, b: a < b,
    "==": lambda a, b: a == b,
    "!=": lambda a, b: a != b,
}


def _load_all_stocks() -> list[dict]:
    """Load stocks from screener candidates + snapshot + request files.

    Each stock gets a normalized flat dict with common metrics.
    Deduplicates by symbol (screener takes priority).
    """
    seen: dict[str, dict] = {}  # symbol → raw data

    # 1. Screener candidates (richest data)
    scr_path = find_latest("screener_*.json", DATA_DIR)
    if scr_path:
        scr = read_json(scr_path)
        for c in scr.get("candidates", []):
            sym = c.get("symbol", "").upper()
            if sym:
                seen[sym] = dict(c)

    # 2. Snapshot (watchlist stocks — may have fields screener doesn't)
    snap_path = find_latest("snapshot_*.json", DATA_DIR)
    if snap_path:
        snap = read_json(snap_path)
        for s in snap.get("stocks", []):
            sym = s.get("symbol", "").upper()
            if sym and sym not in seen:
                seen[sym] = dict(s)

    # 3. Request files (ad-hoc analyzed stocks)
    for req_file in sorted(DATA_DIR.glob("request_*.json"), reverse=True):
        try:
            req = read_json(req_file)
            for s in req.get("stocks", []):
                sym = s.get("symbol", "").upper()
                if sym and sym not in seen:
                    seen[sym] = dict(s)
        except Exception:
            pass

    return list(seen.values())


def _get_metric(stock: dict, metric: str, year: int | None = None):
    """Extract a metric value from stock data, handling nested structures.

    Returns float or None if not available.
    """
    # If year is specified, look up yearly_metrics
    if year is not None:
        for ym in stock.get("yearly_metrics", []):
            if ym.get("year") == year:
                val = ym.get(metric)
                if val is not None:
                    try:
                        return float(val)
                    except (ValueError, TypeError):
                        return None
        return None

    # Map metric names to where they live in different data sources
    # Try flat fields first (snapshot style)
    FLAT_MAP = {
        "dividend_yield": ["dividend_yield"],
        "dps": ["dividend_rate", "dps"],
        "five_year_avg_yield": ["five_year_avg_yield"],
        "quality_score": ["quality_score", "score"],
        "roe": ["roe"],
        "net_margin": ["profit_margin", "net_margin"],
        "de_ratio": ["debt_to_equity", "de_ratio"],
        "pe_ratio": ["pe_ratio"],
        "payout_ratio": ["payout_ratio"],
        "market_cap": ["market_cap"],
        "fcf": ["free_cashflow", "fcf"],
    }

    # Screener nested: metrics.{key}
    METRICS_MAP = {
        "dividend_yield": "dividend_yield",
        "roe": "roe",
        "de_ratio": "de",
        "pe_ratio": "pe",
        "payout_ratio": "payout",
        "market_cap": "mcap",
        "fcf": "fcf",
        "five_year_avg_yield": "five_year_avg_yield",
    }

    # Aggregates nested: aggregates.{key}
    AGG_MAP = {
        "dividend_streak": "dividend_streak",
        "net_margin": "avg_net_margin",
        "roe": "avg_roe",
    }

    # 1. Try flat fields
    if metric in FLAT_MAP:
        for key in FLAT_MAP[metric]:
            val = stock.get(key)
            if val is not None:
                try:
                    return float(val)
                except (ValueError, TypeError):
                    pass

    # 2. Try screener metrics sub-dict
    m = stock.get("metrics") or {}
    if metric in METRICS_MAP:
        val = m.get(METRICS_MAP[metric])
        if val is not None:
            try:
                return float(val)
            except (ValueError, TypeError):
                pass

    # 3. Try aggregates sub-dict
    agg = stock.get("aggregates") or {}
    if metric in AGG_MAP:
        val = agg.get(AGG_MAP[metric])
        if val is not None:
            try:
                return float(val)
            except (ValueError, TypeError):
                pass

    # 4. Direct field name as last resort
    val = stock.get(metric)
    if val is not None:
        try:
            return float(val)
        except (ValueError, TypeError):
            pass

    return None


def _matches_criteria(stock: dict, criteria: list[dict]) -> bool:
    """Check if a stock matches all criteria. Stocks missing a metric are excluded."""
    for c in criteria:
        metric = c.get("metric", "")
        op = c.get("op", ">=")
        value = c.get("value")
        year = c.get("year")

        if op not in _OPS or value is None:
            continue

        actual = _get_metric(stock, metric, year)
        if actual is None:
            return False

        try:
            if not _OPS[op](actual, float(value)):
                return False
        except (ValueError, TypeError):
            return False
    return True


def _extract_search_result(stock: dict) -> dict:
    """Pick relevant fields for search response."""
    # Normalize name
    name = stock.get("name", "")
    if "_" in name:
        parts = name.split("_", 1)
        name = parts[1] if len(parts) > 1 else name

    m = stock.get("metrics") or {}
    agg = stock.get("aggregates") or {}
    val = stock.get("valuation") or {}

    return {
        "symbol": stock.get("symbol", ""),
        "name": name,
        "sector": stock.get("sector", ""),
        "quality_score": stock.get("quality_score") or stock.get("score"),
        "dividend_yield": stock.get("dividend_yield") or m.get("dividend_yield"),
        "five_year_avg_yield": stock.get("five_year_avg_yield") or m.get("five_year_avg_yield"),
        "dps": stock.get("dividend_rate") or stock.get("dps"),
        "pe_ratio": stock.get("pe_ratio") or m.get("pe"),
        "de_ratio": stock.get("debt_to_equity") or m.get("de"),
        "roe": stock.get("roe") or m.get("roe"),
        "net_margin": stock.get("profit_margin") or agg.get("avg_net_margin"),
        "payout_ratio": stock.get("payout_ratio") or m.get("payout"),
        "market_cap": stock.get("market_cap") or m.get("mcap"),
        "dividend_streak": agg.get("dividend_streak"),
        "valuation_grade": val.get("grade"),
        "signals": stock.get("signals", []),
    }


@app.post("/api/search")
async def search_stocks(request: Request):
    body = await request.json()
    criteria = body.get("criteria", [])
    sort_by = body.get("sort_by", "quality_score")
    sort_order = body.get("sort_order", "desc")
    limit = min(body.get("limit", 50), 200)

    # Load all available stock data
    stocks = _load_all_stocks()

    # Apply filters
    results = []
    for stock in stocks:
        if _matches_criteria(stock, criteria):
            results.append(_extract_search_result(stock))

    # Sort
    reverse = sort_order == "desc"
    results.sort(
        key=lambda x: x.get(sort_by) if x.get(sort_by) is not None else (0 if reverse else 999999),
        reverse=reverse,
    )

    # Limit
    total = len(results)
    results = results[:limit]

    return {"results": results, "total": total, "criteria_used": criteria}


# ---------------------------------------------------------------------------
# AI Analysis API
# ---------------------------------------------------------------------------
def _find_stock_for_analysis(symbol: str) -> tuple[Optional[dict], Optional[str]]:
    """Find stock data from screener/snapshot. Returns (stock_dict, screener_date)."""
    scr_path = find_latest("screener_*.json", DATA_DIR)
    if scr_path:
        scr = read_json(scr_path)
        scr_date = scr.get("date", scr_path.stem.replace("screener_", ""))
        for c in scr.get("candidates", []):
            if _norm_sym(c.get("symbol", "")) == _norm_sym(symbol):
                return c, scr_date
        for c in scr.get("filtered_out_stocks", []):
            if _norm_sym(c.get("symbol", "")) == _norm_sym(symbol):
                return c, scr_date

    snap_path = find_latest("snapshot_*.json", DATA_DIR)
    if snap_path:
        snap = read_json(snap_path)
        snap_date = snap_path.stem.replace("snapshot_", "")
        for s in snap.get("stocks", []):
            if _norm_sym(s.get("symbol", "")) == _norm_sym(symbol):
                return s, snap_date

    return None, None


def _build_analysis_prompt(stock: dict) -> str:
    sym = stock.get("symbol", "")
    name = stock.get("name", sym)
    score = stock.get("score", 0)
    bd = stock.get("breakdown", {})
    sector = stock.get("sector", "")
    m = stock.get("metrics", {})
    agg = stock.get("aggregates", {})
    val = stock.get("valuation", {})
    signals = stock.get("signals", [])
    reasons = stock.get("reasons", [])

    mcap = m.get("mcap")
    mcap_str = f"{mcap / 1e9:.1f}B" if mcap else "-"
    avg_roe = agg.get("avg_roe")
    avg_roe_str = f"{avg_roe * 100:.1f}" if avg_roe else "-"
    avg_gm = agg.get("avg_gross_margin")
    avg_gm_str = f"{avg_gm * 100:.1f}" if avg_gm else "-"
    avg_nm = agg.get("avg_net_margin")
    avg_nm_str = f"{avg_nm * 100:.1f}" if avg_nm else "-"
    de = m.get("de")
    de_str = f"{de:.2f}" if de else "-"
    int_cov = agg.get("latest_interest_coverage")
    int_cov_str = f"{int_cov:.1f}" if int_cov else "-"
    ocf_ni = agg.get("latest_ocf_ni_ratio")
    ocf_ni_str = f"{ocf_ni:.1f}" if ocf_ni else "-"
    rev_cagr = agg.get("revenue_cagr")
    rev_cagr_str = f"{rev_cagr * 100:.1f}" if rev_cagr else "-"
    eps_cagr = agg.get("eps_cagr")
    eps_cagr_str = f"{eps_cagr * 100:.1f}" if eps_cagr else "-"
    div_yield = m.get("dividend_yield")
    yield_str = f"{div_yield:.1f}" if div_yield else "-"
    payout = m.get("payout")
    payout_str = f"{payout * 100:.0f}" if payout else "-"
    streak = agg.get("dividend_streak", 0)
    fcf_pos = agg.get("fcf_positive_years", 0)
    fcf_total = agg.get("fcf_total_years", 0)
    grade = val.get("grade", "-")
    label = val.get("label", "-")
    peg = val.get("peg")
    peg_str = f"{peg:.2f}" if peg else "-"
    price = m.get("current_price")
    price_str = f"{price:.2f}" if price else "-"
    low52 = m.get("52w_low", "-")
    high52 = m.get("52w_high", "-")
    signals_str = ", ".join(signals) if signals else "-"
    reasons_str = ", ".join(reasons) if reasons else "-"

    return f"""คุณคือนักวิเคราะห์หุ้นไทย กำลังวิเคราะห์หุ้น {sym} ({name}) จาก 3 มุมมอง

ข้อมูลหุ้น:
- คะแนนคุณภาพ: {score}/100 (กำไร {bd.get('profitability', 0)}/25, เติบโต {bd.get('growth', 0)}/20, ปันผล {bd.get('dividend', 0)}/35, แข็งแกร่ง {bd.get('strength', 0)}/20)
- Sector: {sector}, Market Cap: {mcap_str}
- ROE เฉลี่ย: {avg_roe_str}%, Gross Margin: {avg_gm_str}%, Net Margin: {avg_nm_str}%
- D/E: {de_str}, Interest Coverage: {int_cov_str}x, OCF/NI: {ocf_ni_str}x
- Revenue CAGR: {rev_cagr_str}%, EPS CAGR: {eps_cagr_str}%
- Dividend Yield: {yield_str}%, Payout: {payout_str}%, จ่ายปันผล {streak} ปีติด
- FCF บวก {fcf_pos}/{fcf_total} ปี
- Valuation: ระดับ {grade} ({label}), PEG: {peg_str}
- ราคาปัจจุบัน: {price_str}, 52w range: {low52}-{high52}
- สัญญาณ: {signals_str}
- เหตุผลคะแนน: {reasons_str}

เขียนวิเคราะห์ 3 มุมมอง เป็นภาษาไทยง่ายๆ เหมือนเพื่อนอธิบายให้ฟัง:

1. **มุมมอง Buffett** — เน้นคุณภาพธุรกิจ moat ความสม่ำเสมอของกำไร margin สูง ความได้เปรียบในการแข่งขัน
2. **มุมมองเซียนฮง** — เน้น cash flow quality กำไรเป็นเงินสดจริงไหม หนี้เยอะไหม ดอกเบี้ยจ่ายไหวไหม ความสม่ำเสมอของรายได้
3. **Max Mahon สรุป** — เน้น passive income เหมาะ DCA ระยะยาว 10-20 ปีไหม yield on cost จะเป็นเท่าไหร่ในอนาคต ความเสี่ยงสำหรับนักลงทุนปันผล แผนการลงทุน

แต่ละมุมมอง 3-5 ประโยค กระชับ ตรงประเด็น ไม่ต้องขึ้นต้นด้วย "จากข้อมูล" หรือ "เมื่อดูจาก"
ถ้าตัวนี้มีจุดอ่อนชัดเจน ต้องพูดตรงๆ ไม่ต้องเกรงใจ

ตอบเป็น JSON format:
{{"buffett": "...", "hong": "...", "max": "..."}}"""


def build_analysis_prompt(symbol: str) -> str:
    """Build the Thai Niwes analysis prompt for a symbol from snapshot + screener.

    Extracted from GET /api/stock/{symbol}/analysis handler for reuse in on-demand
    POST /analyze (plan niwes-algo-03-server). Resolves the stock via
    ``_find_stock_for_analysis`` then delegates to ``_build_analysis_prompt`` which
    renders the Buffett / เซียนฮง / Max Mahon prompt.

    Raises HTTPException(404) if the symbol is not found in screener/snapshot.
    """
    stock, _ = _find_stock_for_analysis(symbol)
    if stock is None:
        raise HTTPException(404, f"Stock {symbol} not found")
    return _build_analysis_prompt(stock)


def parse_analysis_response(raw: str) -> dict:
    """Extract JSON dict from Claude response text.

    Strips markdown code fences (```json ... ```), then tries strict ``json.loads``.
    Falls back to regex extract of the first ``{...}`` block, and finally returns
    ``{"buffett": raw, "hong": "", "max": ""}`` so the endpoint can still respond
    with the raw text if parsing fails.

    Extracted from GET /api/stock/{symbol}/analysis handler for reuse in on-demand
    POST /analyze (plan niwes-algo-03-server).
    """
    text = (raw or "").strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.startswith("```")]
        text = "\n".join(lines).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                pass
        return {"buffett": raw, "hong": "", "max": ""}


@app.get("/api/stock/{symbol}/analysis")
async def get_cached_analysis(symbol: str):
    """Cache-only — no Claude call. Returns 404 with stale_cache if >7d old."""
    cache_file = _ANALYSIS_CACHE_DIR / f"{symbol}.json"
    if not cache_file.exists():
        raise HTTPException(
            404,
            detail={"status": "no_cache", "hint": "POST /api/stock/{symbol}/analyze to generate"}
        )
    cached = json.loads(cache_file.read_text(encoding="utf-8"))
    try:
        age = datetime.now() - datetime.fromisoformat(cached.get("analyzed_at", ""))
    except (ValueError, TypeError):
        age = timedelta(days=999)  # treat as stale if parse fails
    if age > timedelta(days=_CACHE_TTL_DAYS):
        raise HTTPException(
            404,
            detail={
                "status": "stale_cache",
                "hint": f"cache older than {_CACHE_TTL_DAYS}d — POST /api/stock/{{symbol}}/analyze to refresh",
                "cached_at": cached.get("analyzed_at"),
                "age_days": age.days,
            },
        )
    return cached


@app.post("/api/stock/{symbol}/analyze")
async def trigger_analysis(symbol: str):
    """Trigger Claude analysis on-demand, cache result, return payload."""
    if _anthropic_client is None:
        raise HTTPException(503, "anthropic package not installed or MAX_ANTHROPIC_API_KEY missing")
    try:
        prompt = build_analysis_prompt(symbol)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"build_analysis_prompt failed: {e}")
    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None,
        lambda: _anthropic_client.messages.create(
            model="claude-opus-4-7",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
            timeout=60.0,
        ),
    )
    raw = response.content[0].text.strip()
    parsed = parse_analysis_response(raw)
    payload = {
        "analyzed_at": datetime.now().isoformat(timespec="seconds"),
        "model": "claude-opus-4-7",
        "buffett": parsed.get("buffett", ""),
        "hong": parsed.get("hong", ""),
        "max": parsed.get("max", ""),
    }
    (_ANALYSIS_CACHE_DIR / f"{symbol}.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return payload


# ---------------------------------------------------------------------------
# Exit Check API (Plan 08 — Niwes exit strategy)
# ---------------------------------------------------------------------------

@app.get("/api/exit_check/{symbol}")
async def exit_check(symbol: str):
    """Exit check for a watchlist stock — informational only, never auto-executes.

    Returns:
        {
            symbol: str,
            triggers: list of {type, reason, severity},
            niwes_rules_check: {rule_1_thesis: bool, rule_2_filter: bool, ...},
            structural_risk_score: int 0-100,
            structural_recommendation: str,
            recommendation: "HOLD" | "REVIEW" | "CONSIDER_EXIT",
            source_baseline: bool,
            note: str,
        }

    Uses detect_exit_signal (Phase 2.1) + compute_score (Phase 3.2).
    """
    _project_root = str(PROJECT_DIR)
    if _project_root not in sys.path:
        sys.path.insert(0, _project_root)
    try:
        from scripts.screen_stocks import detect_exit_signal, load_exit_baseline
        from scripts.structural_risk_score import compute_score
    except ImportError as e:
        raise HTTPException(503, f"Exit check modules unavailable: {e}")

    # Normalize symbol
    sym = symbol.strip().upper()
    if not sym.endswith(".BK"):
        sym += ".BK"

    # Get current screener data for the stock
    stock_data, _ = _find_stock_for_analysis(sym)
    if stock_data is None:
        raise HTTPException(404, f"Stock {sym} not found in latest screener/snapshot")

    # Reconstruct current_data for detect_exit_signal
    m = stock_data.get("metrics") or stock_data.get("basic_metrics") or {}
    current_data = {
        "dividend_yield": m.get("dividend_yield") or stock_data.get("dividend_yield"),
        "pe_ratio": m.get("pe") or stock_data.get("pe_ratio"),
        "pb_ratio": m.get("pb_ratio") or stock_data.get("pb_ratio"),
        "market_cap": m.get("mcap") or stock_data.get("market_cap"),
        "aggregates": stock_data.get("aggregates", {}),
        "yearly_metrics": stock_data.get("yearly_metrics", []),
    }

    # Load baseline (may be empty if not tracked)
    baseline = load_exit_baseline(sym)
    has_baseline = bool(baseline)

    triggers = detect_exit_signal(sym, current_data, baseline) if has_baseline else []

    # Structural risk score (macro)
    srs = compute_score()
    structural_score = srs.get("score", 0)
    structural_rec = srs.get("recommendation", "")

    # Build niwes_rules_check summary (8 rules from 15-exit-rules.md)
    trigger_types = {t["type"] for t in triggers}
    niwes_rules_check = {
        "rule_1_thesis_change": "THESIS_CHANGE_FLAG" in trigger_types,
        "rule_2_filter_degradation": "FILTER_DEGRADATION" in trigger_types,
        "rule_3_valuation_bubble": "VALUATION_BUBBLE" in trigger_types,
        "rule_4_better_opportunity": False,  # manual
        "rule_5_capital_need": False,  # manual
        "anti_rule_1_short_drop_thesis_intact": False,  # manual
        "anti_rule_2_sector_rotation_noise": False,  # manual
        "anti_rule_3_macro_fear_no_business_impact": False,  # manual
    }

    # Recommendation logic (flag-only)
    high_sev = any(t.get("severity") == "high" for t in triggers)
    if high_sev or structural_score > 70:
        recommendation = "CONSIDER_EXIT"
    elif triggers or structural_score > 40:
        recommendation = "REVIEW"
    else:
        recommendation = "HOLD"

    return {
        "symbol": sym,
        "triggers": triggers,
        "niwes_rules_check": niwes_rules_check,
        "structural_risk_score": structural_score,
        "structural_recommendation": structural_rec,
        "recommendation": recommendation,
        "source_baseline": has_baseline,
        "note": (
            "Informational only. Fill docs/niwes/16-exit-decision-template.md "
            "before any sell action."
        ),
    }


# ============================================================================
# Plan 03 Phase 2: History v2 + Patterns + Exit APIs
# ============================================================================

def _latest_screener_file() -> dict:
    """Load latest screener_*.json from data/. Raises 404 if none."""
    files = sorted(DATA_DIR.glob("screener_*.json"), reverse=True)
    if not files:
        raise HTTPException(404, "no screener file found")
    return json.loads(files[0].read_text(encoding="utf-8"))


@app.get("/api/history/v2")
async def get_history_v2(limit: int = 50, symbol: Optional[str] = None):
    """Return v2 history with optional symbol filter + pagination."""
    _project_root = str(PROJECT_DIR)
    if _project_root not in sys.path:
        sys.path.insert(0, _project_root)
    from scripts.history_manager import load_history as _load_v2_history

    limit = min(max(limit, 1), 200)
    hist = _load_v2_history()
    scans = hist.get("scans", [])
    if symbol:
        scans = [
            s for s in scans
            if any(c.get("symbol") == symbol for c in s.get("top_candidates", []))
        ]
    scans = scans[-limit:]
    return {"scans": scans, "count": len(scans)}


@app.get("/api/stock/{symbol}/patterns")
async def get_stock_patterns(symbol: str):
    """Return case study + moat tags + hidden holdings for symbol from latest screener."""
    _project_root = str(PROJECT_DIR)
    if _project_root not in sys.path:
        sys.path.insert(0, _project_root)
    from scripts.data_adapter import check_hidden_value as _check_hidden_value

    screener = _latest_screener_file()
    entry = next(
        (c for c in screener.get("candidates", []) if c.get("symbol") == symbol),
        None,
    )
    bucket = "candidates" if entry else None
    if not entry:
        entry = next(
            (c for c in screener.get("review_candidates", []) if c.get("symbol") == symbol),
            None,
        )
        bucket = "review" if entry else bucket
    if not entry:
        entry = next(
            (c for c in screener.get("filtered_out_stocks", []) if c.get("symbol") == symbol),
            None,
        )
        bucket = "filtered" if entry else bucket
    if not entry:
        raise HTTPException(404, f"symbol {symbol} not in latest screener")

    signals = entry.get("signals", [])
    patterns_file = DATA_DIR / "case_study_patterns.json"
    patterns = (
        json.loads(patterns_file.read_text(encoding="utf-8"))
        if patterns_file.exists()
        else {}
    )
    case_tags = [s for s in signals if s in patterns]
    moat_tags = [
        s for s in signals
        if s in {"BRAND_MOAT", "STRUCTURAL_MOAT", "GOVT_LOCKIN"}
    ]
    return {
        "symbol": symbol,
        "signals": signals,
        "case_study_tags": case_tags,
        "moat_tags": moat_tags,
        "hidden_holdings": _check_hidden_value(symbol),
        "bucket": bucket,
    }


@app.get("/api/watchlist/{symbol}/exit-status")
async def get_exit_status(symbol: str):
    """Return baseline + exit triggers + severity summary for watchlist stock."""
    baselines_file = DATA_DIR / "exit_baselines.json"
    baselines = (
        json.loads(baselines_file.read_text(encoding="utf-8"))
        if baselines_file.exists()
        else {}
    )

    # Load user watchlist
    user_data = (
        json.loads(USER_DATA_PATH.read_text(encoding="utf-8"))
        if USER_DATA_PATH.exists()
        else {}
    )
    in_watchlist = symbol in set(user_data.get("watchlist", []))

    # Look up exit triggers from latest screener
    screener = _latest_screener_file()
    entry = (
        next(
            (c for c in screener.get("candidates", []) if c.get("symbol") == symbol),
            None,
        )
        or next(
            (c for c in screener.get("review_candidates", []) if c.get("symbol") == symbol),
            None,
        )
    )
    triggers = (entry or {}).get("exit_triggers", []) if entry else []
    sev_high = sum(1 for t in triggers if t.get("severity") == "high")
    sev_med = sum(1 for t in triggers if t.get("severity") == "medium")
    return {
        "symbol": symbol,
        "in_watchlist": in_watchlist,
        "baseline": baselines.get(symbol),
        "triggers": triggers,
        "severity_summary": {"high": sev_high, "medium": sev_med},
    }


# ============================================================================
# Plan 03 Phase 3: Price History endpoint
# ============================================================================
_PRICE_HIST_DIR = DATA_DIR / "price_history"
_PRICE_HIST_DIR.mkdir(parents=True, exist_ok=True)
_PRICE_HIST_TTL_HOURS = 24


@app.get("/api/stock/{symbol}/price-history")
async def get_price_history(symbol: str, granularity: str = "yearly"):
    """Price history — thaifin yearly (primary) or yfinance monthly (for DCA)."""
    if granularity not in ("yearly", "monthly"):
        raise HTTPException(400, f"granularity must be 'yearly' or 'monthly', got '{granularity}'")

    cache_file = _PRICE_HIST_DIR / f"{symbol}_{granularity}.json"
    now = datetime.now()
    if cache_file.exists():
        try:
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
            fetched_at = datetime.fromisoformat(cached["fetched_at"])
            if now - fetched_at < timedelta(hours=_PRICE_HIST_TTL_HOURS):
                return cached
        except (KeyError, ValueError, json.JSONDecodeError):
            pass

    if granularity == "yearly":
        # Thaifin primary — use yearly close from yearly_metrics
        import sys
        from pathlib import Path as _Path
        _scripts_dir = _Path(__file__).resolve().parent.parent / "scripts"
        if str(_scripts_dir) not in sys.path:
            sys.path.insert(0, str(_scripts_dir))
        from fetch_data import fetch_multi_year
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, lambda: fetch_multi_year(symbol))
        if not result or "error" in result:
            raise HTTPException(404, f"no data for {symbol}")
        yearly = result.get("yearly_metrics", [])
        data = [
            {"date": f"{m['year']}-12-31", "close": m["close"]}
            for m in yearly if m.get("close") is not None
        ]
        if not data:
            raise HTTPException(404, f"no yearly close data for {symbol}")
        payload = {
            "symbol": symbol,
            "source": "thaifin_yearly",
            "granularity": "yearly",
            "fetched_at": now.isoformat(timespec="seconds"),
            "data": data,
        }
    else:
        # Monthly granularity — yfinance (for DCA simulator)
        try:
            import yfinance as yf
            loop = asyncio.get_event_loop()
            hist = await loop.run_in_executor(
                None,
                lambda: yf.Ticker(symbol).history(
                    period="10y", interval="1mo", auto_adjust=False
                ),
            )
        except Exception as e:
            raise HTTPException(503, f"yfinance fetch failed: {e}")
        if hist.empty:
            raise HTTPException(404, f"no monthly price history for {symbol}")
        data = [
            {"date": idx.strftime("%Y-%m-%d"), "close": float(row["Close"])}
            for idx, row in hist.iterrows()
        ]
        payload = {
            "symbol": symbol,
            "source": "yfinance_monthly",
            "granularity": "monthly",
            "fetched_at": now.isoformat(timespec="seconds"),
            "data": data,
        }

    cache_file.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return payload


# ---------------------------------------------------------------------------
# Static files (SPA) — mount last so API routes take priority
# ---------------------------------------------------------------------------
@app.get("/mobile", response_class=HTMLResponse)
async def serve_mobile():
    mobile_path = WEB_DIR / "mobile.html"
    html = mobile_path.read_text(encoding="utf-8")
    return HTMLResponse(html)

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_path = WEB_DIR / "index.html"
    html = index_path.read_text(encoding="utf-8")
    css_mtime = int((WEB_DIR / "style.css").stat().st_mtime)
    js_mtime = int((WEB_DIR / "app.js").stat().st_mtime)
    html = html.replace("style.css?v=__CB__", f"style.css?v={css_mtime}")
    html = html.replace("app.js?v=__CB__", f"app.js?v={js_mtime}")
    return HTMLResponse(html)

if WEB_DIR.exists():
    app.mount("/", StaticFiles(directory=str(WEB_DIR)), name="static")


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
