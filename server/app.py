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
from server.admin import router as admin_router, init_admin

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


def _load_previous_screener(exclude_current: Path) -> Optional[dict]:
    """Load the screener JSON immediately preceding the latest one, sorted by filename date."""
    files = sorted(
        [
            f for f in DATA_DIR.glob("screener_*.json")
            if re.match(r"^screener_\d{4}-\d{2}-\d{2}\.json$", f.name)
        ],
        reverse=True,
    )
    for f in files:
        if f == exclude_current:
            continue
        try:
            return read_json(f)
        except Exception:
            continue
    return None


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

    # v6 Phase 2 — load previous scan scores for delta computation
    prev = _load_previous_screener(exclude_current=path)
    prev_scores: dict[str, int] = {}
    if prev:
        for pc in (prev.get("candidates") or []):
            sym = _norm_sym(pc.get("symbol", ""))
            score = pc.get("score")
            if sym and score is not None:
                prev_scores[sym] = score

    for c in data.get("candidates", []):
        sym = _norm_sym(c.get("symbol", ""))
        c["is_new_in_batch"] = bool(sym) and sym not in historical
        c["in_watchlist"] = bool(sym) and sym in watched
        # v6 additions — score delta + streak + is_new_this_week alias
        prev_score = prev_scores.get(sym)
        c["previous_score"] = prev_score
        cur_score = c.get("score")
        c["score_delta"] = (
            (cur_score - prev_score) if (prev_score is not None and cur_score is not None) else None
        )
        c["is_new_this_week"] = c.get("is_new_in_batch", False)
        # score_streak_weeks preserved from scan.py if set; else null
        if "score_streak_weeks" not in c:
            c["score_streak_weeks"] = None
    for c in data.get("review_candidates", []):
        sym = _norm_sym(c.get("symbol", ""))
        c["in_watchlist"] = bool(sym) and sym in watched
    for c in data.get("filtered_out_stocks", []):
        sym = _norm_sym(c.get("symbol", ""))
        c["in_watchlist"] = bool(sym) and sym in watched

    # v6 additions — top-level summary block
    cands = data.get("candidates", []) or []
    yields = [
        (c.get("metrics") or {}).get("dividend_yield")
        for c in cands
    ]
    yields = [y for y in yields if y is not None]
    sectors = {c.get("sector") for c in cands if c.get("sector")}
    passed_count = sum(
        1 for c in cands if "NIWES_5555" in (c.get("signals") or [])
    )
    # If no explicit PASS tier, fall back to all candidates as "passed"
    if passed_count == 0:
        passed_count = len(cands)
    data["summary"] = {
        "total_scanned": data.get("total_scanned", 0),
        "passed_count": passed_count,
        "review_count": len(data.get("review_candidates", []) or []),
        "avg_yield": round(sum(yields) / len(yields), 2) if yields else 0,
        "top_score": max((c.get("score", 0) for c in cands), default=0),
        "new_entrants": sum(1 for c in cands if c.get("is_new_in_batch")),
        "sectors": len(sectors),
    }
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

    # v6 Phase 2 — enrich response with narrative + five_year_history + dividend_history_10y
    stock_data["narrative"] = _load_cached_narrative(symbol)
    stock_data["five_year_history"] = _build_five_year_history(stock_data)
    stock_data["dividend_history_10y"] = _build_dividend_history_10y(stock_data)
    # reasons_narrative: current 'reasons' is already a list[str]; keep shape, alias for frontend clarity
    stock_data["reasons_narrative"] = stock_data.get("reasons") or []

    return stock_data


def _load_cached_narrative(symbol: str) -> dict:
    """Return narrative {case_text, lede} from Claude analysis cache if present, else nulls."""
    cache_path = _ANALYSIS_CACHE_DIR / f"{symbol}.json"
    if cache_path.exists():
        try:
            cached = json.loads(cache_path.read_text(encoding="utf-8"))
            max_text = cached.get("max") or cached.get("buffett") or ""
            if max_text:
                # First paragraph becomes lede; full text is case_text
                lede = max_text.split("\n\n", 1)[0] if "\n\n" in max_text else max_text[:200]
                return {"case_text": max_text, "lede": lede}
        except Exception:
            pass
    return {"case_text": None, "lede": None}


def _build_five_year_history(stock_data: dict) -> list[dict]:
    """Join yearly_metrics + dividend_history into 5-year table."""
    yearly = stock_data.get("yearly_metrics") or []
    if not yearly:
        return []
    # Sort descending by year, take last 5
    sorted_yrs = sorted(yearly, key=lambda y: y.get("year", 0), reverse=True)[:5]
    div_hist = stock_data.get("dividend_history") or {}
    # Normalize dividend_history keys to string year
    dps_by_year: dict[str, float] = {}
    for k, v in div_hist.items():
        try:
            dps_by_year[str(int(float(k)))] = float(v) if v is not None else None
        except (TypeError, ValueError):
            dps_by_year[str(k)] = v
    out = []
    for y in sorted_yrs:
        yr = y.get("year")
        out.append({
            "year": yr,
            "revenue": y.get("revenue"),
            "net_income": y.get("net_income") or y.get("earnings"),
            "eps": y.get("eps"),
            "roe": y.get("roe"),
            "net_margin": y.get("net_margin"),
            "de": y.get("de") or y.get("debt_to_equity"),
            "ocf": y.get("ocf") or y.get("operating_cashflow"),
            "dps": dps_by_year.get(str(yr)),
        })
    return out


def _build_dividend_history_10y(stock_data: dict) -> list[dict]:
    """Explicit 10-year {year, dps, yield_pct} aggregate."""
    div_hist = stock_data.get("dividend_history") or {}
    yearly = {
        str(y.get("year")): y for y in (stock_data.get("yearly_metrics") or [])
        if y.get("year") is not None
    }
    # Normalize + sort
    rows: list[dict] = []
    for k, v in div_hist.items():
        try:
            yr = int(float(k))
            dps = float(v) if v is not None else None
        except (TypeError, ValueError):
            continue
        close = None
        y_entry = yearly.get(str(yr))
        if y_entry:
            close = y_entry.get("close") or y_entry.get("price")
        yield_pct = None
        if dps and close and close > 0:
            yield_pct = round(dps / close * 100, 2)
        rows.append({"year": yr, "dps": dps, "yield_pct": yield_pct})
    rows.sort(key=lambda r: r["year"], reverse=True)
    return rows[:10]


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


# ---------------------------------------------------------------------------
# Admin router wiring — shares pipeline_state + helpers with main app
# ---------------------------------------------------------------------------
init_admin(
    data_dir=DATA_DIR,
    reports_dir=REPORTS_DIR,
    project_dir=PROJECT_DIR,
    pipeline_state=pipeline_state,
    pipeline_lock=_pipeline_lock,
    request_status=request_status,
    request_timestamps=request_timestamps,
    execute_sync=_execute_sync,
    get_scripts_for_mode=_get_scripts_for_mode,
    fetch_one=_fetch_one,
)
app.include_router(admin_router)


# ---------------------------------------------------------------------------
# Config System
# ---------------------------------------------------------------------------

CONFIG_PATH = PROJECT_DIR / "config.json"
DEFAULT_CONFIG = {
    "schedule": {"enabled": True, "day_of_week": "sat", "hour": 9, "minute": 0},
    "filters": {
        "min_dividend_yield": 5.0,
        "min_dividend_streak": 5,
        "min_eps_positive_years": 5,
        "max_pe": 15.0,
        "bonus_pe": 8.0,
        "max_pbv": 1.5,
        "bonus_pbv": 1.0,
        "min_market_cap": 5_000_000_000,
    },
    "universe": "set_mai",
    "last_saved_at": None,
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

_ALLOWED_FILTER_KEYS = {
    "min_dividend_yield",
    "min_dividend_streak",
    "min_eps_positive_years",
    "max_pe",
    "bonus_pe",
    "max_pbv",
    "bonus_pbv",
    "min_market_cap",
}
_ALLOWED_UNIVERSE = {"set_only", "set_mai"}


def _compute_next_run() -> Optional[str]:
    """Return ISO datestr of next scheduled scan (if scheduler enabled + job exists)."""
    try:
        job = scheduler.get_job("max_pipeline")
    except Exception:
        return None
    if not job or not job.next_run_time:
        return None
    try:
        return job.next_run_time.isoformat(timespec="seconds")
    except Exception:
        return str(job.next_run_time)


@app.get("/api/settings")
async def get_settings():
    config = load_config()
    config["next_run_at"] = _compute_next_run()
    return config


@app.post("/api/settings")
async def post_settings(request: Request):
    body = await request.json()
    # v6 Phase 2 — validate schema
    filters = body.get("filters")
    if filters is not None:
        if not isinstance(filters, dict):
            raise HTTPException(400, "filters must be an object")
        unknown = set(filters.keys()) - _ALLOWED_FILTER_KEYS
        if unknown:
            raise HTTPException(
                400,
                f"unknown filter keys: {sorted(unknown)}; allowed: {sorted(_ALLOWED_FILTER_KEYS)}",
            )
    universe = body.get("universe")
    if universe is not None and universe not in _ALLOWED_UNIVERSE:
        raise HTTPException(
            400,
            f"universe must be one of {sorted(_ALLOWED_UNIVERSE)}, got '{universe}'",
        )

    config = load_config()
    for k in body:
        if k in config and isinstance(config[k], dict) and isinstance(body[k], dict):
            config[k].update(body[k])
        else:
            config[k] = body[k]
    # Stamp last_saved_at on every save
    config["last_saved_at"] = datetime.now().isoformat(timespec="seconds")
    save_config(config)
    apply_schedule(config)
    config["next_run_at"] = _compute_next_run()
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
        data = json.loads(USER_DATA_PATH.read_text(encoding="utf-8"))
    else:
        data = {}
    # v6 Phase 2 — ensure all expected top-level keys are present
    data.setdefault("watchlist", [])
    data.setdefault("blacklist", [])
    data.setdefault("notes", {})
    data.setdefault("custom_lists", {})
    data.setdefault("transactions", [])
    data.setdefault("cash_reserve", 0)
    data.setdefault(
        "simulated_portfolio",
        {"positions": [], "cash_reserve_pct": 0.0, "updated_at": None},
    )
    data.setdefault("updated_at", None)
    return data


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
    """Return v2 history with optional symbol filter + pagination.

    v6 Phase 2 — enrich each scan's counts with avg_yield, top_score, new_entrants,
    sectors (derived from top_candidates when missing). Empty state returns a
    stable {scans: [], count: 0, signature_version: "v2"} shape.
    """
    _project_root = str(PROJECT_DIR)
    if _project_root not in sys.path:
        sys.path.insert(0, _project_root)
    from scripts.history_manager import load_history as _load_v2_history

    limit = min(max(limit, 1), 200)
    hist = _load_v2_history()
    scans = hist.get("scans", []) or []
    if symbol:
        scans = [
            s for s in scans
            if any(c.get("symbol") == symbol for c in s.get("top_candidates", []))
        ]
    scans = scans[-limit:]

    # v6 Phase 2 — ensure each scan entry's counts exposes the full v6 shape
    for s in scans:
        counts = s.get("counts") or {}
        top = s.get("top_candidates") or []
        yields = [c.get("yield") for c in top if c.get("yield") is not None]
        sectors = {c.get("sector") for c in top if c.get("sector")}
        # preserve existing keys, fill missing
        counts.setdefault("passed", counts.get("passed", 0))
        counts.setdefault("review", counts.get("review", 0))
        counts.setdefault("failed", counts.get("filtered", counts.get("failed", 0)))
        if counts.get("avg_yield") is None:
            counts["avg_yield"] = round(sum(yields) / len(yields), 2) if yields else 0
        if counts.get("top_score") is None:
            counts["top_score"] = max((c.get("score", 0) for c in top), default=0)
        if counts.get("new_entrants") is None:
            counts["new_entrants"] = counts.get("new", 0)
        if counts.get("sectors") is None:
            counts["sectors"] = len(sectors)
        s["counts"] = counts

    return {
        "scans": scans,
        "count": len(scans),
        "signature_version": "v2",
    }


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
    # v6 Phase 2 — matched_patterns[] with narrative lookup
    matched_patterns = [
        {
            "tag": tag,
            "narrative": (patterns.get(tag) or {}).get("narrative", ""),
            "source": (patterns.get(tag) or {}).get("source"),
        }
        for tag in case_tags
    ]
    return {
        "symbol": symbol,
        "signals": signals,
        "case_study_tags": case_tags,
        "moat_tags": moat_tags,
        "hidden_holdings": _check_hidden_value(symbol),
        "bucket": bucket,
        "matched_patterns": matched_patterns,
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

    # v6 Phase 2 — enrich with narrative + trigger_rules + entry_context
    baseline = baselines.get(symbol) or {}
    metrics = (entry or {}).get("metrics") or {}
    current_score = (entry or {}).get("score")
    entry_score = baseline.get("entry_score")
    date_added = baseline.get("date_added")
    weeks_held = None
    if date_added:
        try:
            d = datetime.strptime(date_added, "%Y-%m-%d")
            weeks_held = int((datetime.now() - d).days / 7)
        except ValueError:
            weeks_held = None

    delta_score = None
    if current_score is not None and entry_score is not None:
        delta_score = current_score - entry_score

    # 5-row trigger_rules table — expose threshold + current + status per Niwes sell rule
    def _rule_status(trig_list: list, label: str) -> str:
        for t in trig_list:
            if t.get("rule") == label or t.get("label") == label:
                sev = t.get("severity", "")
                return "FIRED" if sev in ("high", "medium") else "OK"
        return "OK"

    trigger_rules = [
        {
            "label": "P/E expansion",
            "threshold": "> 1.5x baseline",
            "current": metrics.get("pe"),
            "status": _rule_status(triggers, "pe_expansion"),
        },
        {
            "label": "P/BV expansion",
            "threshold": "> 1.5x baseline",
            "current": metrics.get("pb_ratio"),
            "status": _rule_status(triggers, "pbv_expansion"),
        },
        {
            "label": "Yield compression",
            "threshold": "< 50% of baseline",
            "current": metrics.get("dividend_yield"),
            "status": _rule_status(triggers, "yield_compression"),
        },
        {
            "label": "Dividend cut",
            "threshold": "DPS cut > 30%",
            "current": metrics.get("dividend_yield"),
            "status": _rule_status(triggers, "dividend_cut"),
        },
        {
            "label": "Score decay",
            "threshold": "Δ < -15 from entry",
            "current": delta_score,
            "status": "FIRED" if (delta_score is not None and delta_score < -15) else "OK",
        },
    ]

    entry_context = {
        "entry_date": date_added,
        "entry_pe": baseline.get("pe_baseline"),
        "entry_yield": baseline.get("dy_baseline"),
        "delta_score": delta_score,
        "weeks_held": weeks_held,
    }

    # Narrative — italicized paragraph matching mockup section 10
    if date_added:
        narrative = (
            f"เข้า watchlist วันที่ {date_added} · P/E ตอนเข้า "
            f"{baseline.get('pe_baseline') or '-'} · Yield ตอนเข้า "
            f"{baseline.get('dy_baseline') or '-'}%. "
        )
        if delta_score is not None:
            direction = "ขึ้น" if delta_score >= 0 else "ลง"
            narrative += f"Score {direction} {abs(delta_score)} จุด จากตอนเข้า. "
        if sev_high == 0 and sev_med == 0:
            narrative += "ยังไม่มีสัญญาณ exit — hold ต่อ."
        else:
            narrative += f"มีสัญญาณเตือน {sev_high} high / {sev_med} medium — review."
    else:
        narrative = "ยังไม่ได้ set baseline — รอหุ้นผ่าน 5-5-5-5 ก่อน."

    return {
        "symbol": symbol,
        "in_watchlist": in_watchlist,
        "baseline": baseline or None,
        "triggers": triggers,
        "severity_summary": {"high": sev_high, "medium": sev_med},
        "narrative": narrative,
        "trigger_rules": trigger_rules,
        "entry_context": entry_context,
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


# ============================================================================
# v6 Phase 3 — Portfolio simulator endpoints
# ============================================================================


def _yf_monthly_series(ticker_symbol: str) -> Optional[list[tuple]]:
    """Fetch monthly price + dividend history for a symbol. Returns list of
    (date, close_price, dividend_on_this_month) tuples. None on failure.
    Cash proxy returns a flat-1.0 series built in caller.
    """
    try:
        import yfinance as yf
        import pandas as pd
    except Exception:
        return None
    try:
        t = yf.Ticker(ticker_symbol)
        hist = t.history(period="max", interval="1mo", auto_adjust=False)
        if hist.empty:
            return None
        hist.index = hist.index.tz_localize(None) if hist.index.tz else hist.index
        try:
            divs = t.dividends
            divs.index = divs.index.tz_localize(None) if divs.index.tz else divs.index
        except Exception:
            divs = None
        rows = []
        for idx, row in hist.iterrows():
            month_start = pd.Timestamp(year=idx.year, month=idx.month, day=1)
            month_end = month_start + pd.offsets.MonthEnd(0)
            div_this_month = 0.0
            if divs is not None and not divs.empty:
                mask = (divs.index >= month_start) & (divs.index <= month_end)
                div_this_month = float(divs[mask].sum()) if mask.any() else 0.0
            close = float(row.get("Close") or 0)
            rows.append((month_start.strftime("%Y-%m-%d"), close, div_this_month))
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

    Loops per-position using monthly yfinance series; sums by month.
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
        rows = _yf_monthly_series(sym)
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


@app.get("/api/screener/trend")
async def screener_trend(weeks: int = 12):
    """Return last N scans from history.json in v6-friendly shape."""
    weeks = min(max(weeks, 1), 52)
    _project_root = str(PROJECT_DIR)
    if _project_root not in sys.path:
        sys.path.insert(0, _project_root)
    from scripts.history_manager import load_history as _load_v2_history

    hist = _load_v2_history()
    scans = (hist.get("scans") or [])[-weeks:]
    weeks_out = []
    for s in scans:
        counts = s.get("counts") or {}
        top = s.get("top_candidates") or []
        yields = [c.get("yield") for c in top if c.get("yield") is not None]
        scan_date = (s.get("date") or "")[:10]
        num = s.get("num")
        weeks_out.append({
            "week_label": f"W{num}" if num else scan_date,
            "scan_date": scan_date,
            "passed": counts.get("passed", 0),
            "review": counts.get("review", 0),
            "avg_yield": counts.get("avg_yield") if counts.get("avg_yield") is not None
                else (round(sum(yields) / len(yields), 2) if yields else 0),
            "top_score": counts.get("top_score") if counts.get("top_score") is not None
                else max((c.get("score", 0) for c in top), default=0),
        })
    return {"weeks": weeks_out}


@app.get("/api/watchlist/enriched")
async def watchlist_enriched():
    """Join watchlist × screener × exit_baselines × notes in one call.
    Avoids client-side N+1 fetches (one per symbol).
    """
    user_data = load_user_data()
    watchlist = user_data.get("watchlist") or []
    notes = user_data.get("notes") or {}

    baselines_file = DATA_DIR / "exit_baselines.json"
    baselines = (
        json.loads(baselines_file.read_text(encoding="utf-8"))
        if baselines_file.exists()
        else {}
    )

    try:
        screener = _latest_screener_file()
    except HTTPException:
        screener = {"candidates": [], "review_candidates": [], "filtered_out_stocks": []}

    all_entries = (
        (screener.get("candidates") or [])
        + (screener.get("review_candidates") or [])
        + (screener.get("filtered_out_stocks") or [])
    )
    by_sym = {
        e.get("symbol"): e for e in all_entries if e.get("symbol")
    }

    positions: list[dict] = []
    hold_count = 0
    review_count = 0
    consider_exit_count = 0
    delta_vals: list[int] = []
    oldest_days = 0

    for sym in watchlist:
        entry = by_sym.get(sym) or {}
        name = entry.get("name") or sym
        if "_" in name:
            parts = name.split("_", 1)
            name = parts[1] if len(parts) > 1 else name
        current_score = entry.get("score")
        baseline = baselines.get(sym) or {}
        entry_score = baseline.get("entry_score")
        entry_date = baseline.get("date_added")
        delta_entry = None
        days_held = None
        if current_score is not None and entry_score is not None:
            delta_entry = current_score - entry_score
            delta_vals.append(delta_entry)
        if entry_date:
            try:
                d = datetime.strptime(entry_date, "%Y-%m-%d")
                days_held = (datetime.now() - d).days
                if days_held > oldest_days:
                    oldest_days = days_held
            except ValueError:
                days_held = None
        # Exit signal
        triggers = entry.get("exit_triggers") or []
        sev_high = sum(1 for t in triggers if t.get("severity") == "high")
        sev_med = sum(1 for t in triggers if t.get("severity") == "medium")
        if sev_high > 0:
            exit_signal = "CONSIDER_EXIT"
            consider_exit_count += 1
        elif sev_med > 0:
            exit_signal = "REVIEW"
            review_count += 1
        else:
            exit_signal = "HOLD"
            hold_count += 1

        positions.append({
            "symbol": sym,
            "name": name,
            "current_score": current_score,
            "entry_score": entry_score,
            "delta_entry": delta_entry,
            "entry_date": entry_date,
            "days_held": days_held,
            "exit_signal": exit_signal,
            "note": notes.get(sym, ""),
        })

    avg_delta = (
        round(sum(delta_vals) / len(delta_vals), 1) if delta_vals else 0
    )

    return {
        "summary": {
            "tracked": len(watchlist),
            "hold": hold_count,
            "review": review_count,
            "consider_exit": consider_exit_count,
            "avg_delta_entry": avg_delta,
            "oldest_position_days": oldest_days,
        },
        "positions": positions,
    }


@app.get("/api/watchlist/compare")
async def watchlist_compare(symbols: str):
    """Compare up to 3 symbols side-by-side. Returns normalized rows.

    symbols=comma-separated list (max 3).
    """
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not sym_list:
        raise HTTPException(400, "symbols query param required")
    if len(sym_list) > 3:
        raise HTTPException(400, "max 3 symbols supported")

    try:
        screener = _latest_screener_file()
    except HTTPException:
        raise HTTPException(404, "no screener data found")

    all_entries = (
        (screener.get("candidates") or [])
        + (screener.get("review_candidates") or [])
        + (screener.get("filtered_out_stocks") or [])
    )
    by_sym = {e.get("symbol"): e for e in all_entries if e.get("symbol")}

    baselines_file = DATA_DIR / "exit_baselines.json"
    baselines = (
        json.loads(baselines_file.read_text(encoding="utf-8"))
        if baselines_file.exists()
        else {}
    )

    def _metric(sym: str, getter) -> Optional[float]:
        e = by_sym.get(sym)
        if not e:
            return None
        try:
            return getter(e)
        except Exception:
            return None

    def _exit_signal(sym: str) -> str:
        e = by_sym.get(sym) or {}
        triggers = e.get("exit_triggers") or []
        sev_high = sum(1 for t in triggers if t.get("severity") == "high")
        sev_med = sum(1 for t in triggers if t.get("severity") == "medium")
        if sev_high > 0:
            return "CONSIDER_EXIT"
        if sev_med > 0:
            return "REVIEW"
        return "HOLD"

    def _signals(sym: str) -> str:
        e = by_sym.get(sym) or {}
        sigs = e.get("signals") or []
        short = {
            "NIWES_5555": "5555",
            "QUALITY_DIVIDEND": "QD",
            "HIDDEN_VALUE": "HV",
            "DEEP_VALUE": "DV",
        }
        return ", ".join(short.get(s, s) for s in sigs)

    score_vals = [_metric(s, lambda e: e.get("score")) for s in sym_list]
    yield_vals = [_metric(s, lambda e: (e.get("metrics") or {}).get("dividend_yield")) for s in sym_list]
    pe_vals = [_metric(s, lambda e: (e.get("metrics") or {}).get("pe")) for s in sym_list]
    pbv_vals = [_metric(s, lambda e: (e.get("metrics") or {}).get("pb_ratio") or e.get("pb_ratio")) for s in sym_list]
    streak_vals = [_metric(s, lambda e: (e.get("aggregates") or {}).get("dividend_streak")) for s in sym_list]
    payout_vals = [_metric(s, lambda e: (e.get("metrics") or {}).get("payout")) for s in sym_list]
    roe_vals = [_metric(s, lambda e: (e.get("metrics") or {}).get("roe")) for s in sym_list]
    mcap_vals = [_metric(s, lambda e: (e.get("metrics") or {}).get("mcap")) for s in sym_list]
    mcap_b = [round(m / 1e9, 1) if m is not None else None for m in mcap_vals]
    exit_vals = [_exit_signal(s) for s in sym_list]
    signal_vals = [_signals(s) for s in sym_list]

    def _best_max(vals: list) -> Optional[int]:
        non_null = [(i, v) for i, v in enumerate(vals) if v is not None]
        if not non_null:
            return None
        return max(non_null, key=lambda x: x[1])[0]

    def _best_min(vals: list) -> Optional[int]:
        non_null = [(i, v) for i, v in enumerate(vals) if v is not None]
        if not non_null:
            return None
        return min(non_null, key=lambda x: x[1])[0]

    def _delta(vals: list) -> str:
        non_null = [v for v in vals if v is not None]
        if len(non_null) < 2:
            return "-"
        diff = non_null[-1] - non_null[0]
        sign = "+" if diff >= 0 else ""
        return f"{sign}{round(diff, 2)}"

    rows = [
        {"label": "Score", "values": score_vals, "best_index": _best_max(score_vals), "delta": _delta(score_vals)},
        {"label": "Yield", "values": yield_vals, "best_index": _best_max(yield_vals), "delta": _delta(yield_vals)},
        {"label": "P/E", "values": pe_vals, "best_index": _best_min(pe_vals), "delta": _delta(pe_vals)},
        {"label": "P/BV", "values": pbv_vals, "best_index": _best_min(pbv_vals), "delta": _delta(pbv_vals)},
        {"label": "Streak", "values": streak_vals, "best_index": _best_max(streak_vals), "delta": _delta(streak_vals)},
        {"label": "Payout", "values": payout_vals, "best_index": _best_min(payout_vals), "delta": _delta(payout_vals)},
        {"label": "ROE", "values": roe_vals, "best_index": _best_max(roe_vals), "delta": _delta(roe_vals)},
        {"label": "Exit Signal", "values": exit_vals, "best_index": None, "delta": "-"},
        {"label": "Mcap (B THB)", "values": mcap_b, "best_index": None, "delta": "-"},
        {"label": "Signals", "values": signal_vals, "best_index": None, "delta": "-"},
    ]

    return {"symbols": sym_list, "rows": rows}


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
        rows = _yf_monthly_series(sym)
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
    bench_rows = _yf_monthly_series("TDEX.BK")
    proxy_label = "TDEX ETF (Thai dividend, includes reinvest)"
    if not bench_rows:
        bench_rows = _yf_monthly_series("^SET")
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


# ---------------------------------------------------------------------------
# Static files (SPA) — v6 shells — mount last so API routes take priority
# ---------------------------------------------------------------------------
_V6_DIR = WEB_DIR / "v6"
_V6_DESKTOP = _V6_DIR / "desktop" / "index.html"
_V6_MOBILE = _V6_DIR / "mobile" / "index.html"
_V6_STATIC = _V6_DIR / "static"


def _render_shell(html_path: Path) -> HTMLResponse:
    if not html_path.exists():
        raise HTTPException(404, "v6 shell missing")
    html = html_path.read_text(encoding="utf-8")
    html = html.replace("{{CACHEBUST}}", str(int(time.time())))
    return HTMLResponse(html)


@app.get("/mobile", response_class=HTMLResponse)
@app.get("/m", response_class=HTMLResponse)
@app.get("/m/watchlist", response_class=HTMLResponse)
@app.get("/m/portfolio", response_class=HTMLResponse)
@app.get("/m/simulator", response_class=HTMLResponse)
@app.get("/m/settings", response_class=HTMLResponse)
async def serve_mobile():
    return _render_shell(_V6_MOBILE)


@app.get("/", response_class=HTMLResponse)
@app.get("/watchlist", response_class=HTMLResponse)
@app.get("/portfolio", response_class=HTMLResponse)
@app.get("/simulator", response_class=HTMLResponse)
@app.get("/settings", response_class=HTMLResponse)
async def serve_index():
    return _render_shell(_V6_DESKTOP)


# Desktop SPA routes — all route to the same shell; page JS picks module by pathname
@app.get("/home", response_class=HTMLResponse)
@app.get("/watchlist", response_class=HTMLResponse)
@app.get("/portfolio", response_class=HTMLResponse)
@app.get("/simulator", response_class=HTMLResponse)
@app.get("/settings", response_class=HTMLResponse)
async def serve_desktop_page():
    return _render_shell(_V6_DESKTOP)


@app.get("/report/{symbol}", response_class=HTMLResponse)
async def serve_desktop_report(symbol: str):
    return _render_shell(_V6_DESKTOP)


# Mobile SPA routes
@app.get("/m/home", response_class=HTMLResponse)
@app.get("/m/watchlist", response_class=HTMLResponse)
@app.get("/m/portfolio", response_class=HTMLResponse)
@app.get("/m/simulator", response_class=HTMLResponse)
@app.get("/m/settings", response_class=HTMLResponse)
async def serve_mobile_page():
    return _render_shell(_V6_MOBILE)


@app.get("/m/report/{symbol}", response_class=HTMLResponse)
async def serve_mobile_report(symbol: str):
    return _render_shell(_V6_MOBILE)


_V6_SHARED = _V6_DIR / "shared"
# Mount shared/ FIRST (longer path wins in FastAPI mount resolution) so
# /static/v6/shared/tokens.css → web/v6/shared/tokens.css, while
# /static/v6/js/... and /static/v6/css/... still map to web/v6/static/.
if _V6_SHARED.exists():
    app.mount("/static/v6/shared", StaticFiles(directory=str(_V6_SHARED)), name="v6-shared")
if _V6_STATIC.exists():
    app.mount("/static/v6", StaticFiles(directory=str(_V6_STATIC)), name="v6-static")


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
