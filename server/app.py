"""Max Mahon — FastAPI server for stock dashboard.

Serves data APIs, pipeline control, reports, and static files.
Run: py -m uvicorn server.app:app --port 50089
"""

import asyncio
import hashlib
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
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
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
from server.auth import get_current_user, require_admin

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
_PORTFOLIO_OPUS_CACHE_DIR = DATA_DIR / "portfolio_opus_cache"
_PORTFOLIO_OPUS_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Env / Auth
# ---------------------------------------------------------------------------
load_dotenv(Path("C:/WORKSPACE/.env"))

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

logger = logging.getLogger(__name__)

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


# Auth migration: legacy global Bearer middleware removed. Per-endpoint
# Supabase JWT verification now happens via Depends(get_current_user) /
# Depends(require_admin) on the routes that need it (see server.auth).


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
async def get_screener(user: dict = Depends(get_current_user)):
    path = find_latest("screener_*.json", DATA_DIR)
    if not path:
        raise HTTPException(404, "No screener data found")
    data = read_json(path)
    # P3.1 — tag each candidate with is_new_in_batch (never passed in any prior screener)
    historical = _get_historical_passed_symbols(exclude_current=path)
    # P3.2 — inject in_watchlist on BOTH candidates + filtered_out_stocks from this user's watchlist
    try:
        user_data = load_user_data(user["user_id"])
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
        # price_as_of — allow home cards to render Thai as-of date per candidate
        raw_sym = c.get("symbol")
        if raw_sym:
            c["price_as_of"] = _resolve_price_as_of(raw_sym)
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
async def get_stock(symbol: str, user: dict = Depends(get_current_user)):
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

    # Override snapshot fields with SETSMART cache (daily refresh layer).
    # Compute-heavy fields (score/breakdown/signals/aggregates) stay from screener cache.
    # Snapshot fields (yield/pe/pbv/marketCap/price) override from SETSMART (refresh daily 19:00).
    if stock_data is not None:
        try:
            _scripts_dir = str(PROJECT_DIR / "scripts")
            if _scripts_dir not in sys.path:
                sys.path.insert(0, _scripts_dir)
            from setsmart_adapter import CACHE_DIR as SS_CACHE_DIR

            sym_no_bk = _norm_sym(symbol).replace(".BK", "")

            eod_files = sorted(SS_CACHE_DIR.glob("eod_*.json"), reverse=True)
            # Filter out per-symbol files; only bulk eod_YYYY-MM-DD.json
            eod_files = [f for f in eod_files if not f.name.startswith("eod_by_symbol_")]
            # Walk newest→older: skip empty cache files (weekend/holiday) until symbol found
            ss_eod_row = None
            for f in eod_files:
                rows = json.loads(f.read_text(encoding="utf-8"))
                if not rows:
                    continue
                for r in rows:
                    if r.get("symbol") == sym_no_bk:
                        ss_eod_row = r
                        break
                if ss_eod_row is not None:
                    break

            if ss_eod_row:
                # Override top-level snapshot fields (matches stock_data schema used by frontend)
                if ss_eod_row.get("dividendYield") is not None:
                    stock_data["dividend_yield"] = ss_eod_row["dividendYield"]
                if ss_eod_row.get("pe") is not None:
                    stock_data["pe_ratio"] = ss_eod_row["pe"]
                if ss_eod_row.get("pbv") is not None:
                    stock_data["pb_ratio"] = ss_eod_row["pbv"]
                if ss_eod_row.get("close") is not None:
                    stock_data["price"] = ss_eod_row["close"]
                if ss_eod_row.get("marketCap") is not None:
                    stock_data["market_cap"] = ss_eod_row["marketCap"]

                logger.info("SETSMART override applied for %s: yield=%s, pe=%s",
                            symbol, ss_eod_row.get("dividendYield"), ss_eod_row.get("pe"))
        except Exception as e:
            logger.warning("SETSMART override skipped for %s: %s", symbol, e)

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

    stock_data['user_in_watchlist'] = symbol in (load_user_data(user["user_id"]).get('watchlist') or [])

    return stock_data


def _load_cached_narrative(symbol: str) -> dict:
    """Return narrative {case_text, lede} from Claude analysis cache if present, else nulls.

    New 6-key schema: prefer ``to_art`` (conversational Max-to-อาร์ท dialog) for the
    editorial case text; fall back to stitching the 4 analysis sections.
    """
    cache_path = _ANALYSIS_CACHE_DIR / f"{symbol}.json"
    if cache_path.exists():
        try:
            cached = json.loads(cache_path.read_text(encoding="utf-8"))
            text = (cached.get("to_art") or "").strip()
            if not text:
                parts = [
                    cached.get("dividend"),
                    cached.get("hidden"),
                    cached.get("moat"),
                    cached.get("valuation"),
                ]
                text = "\n\n".join([p for p in parts if p]).strip()
            if text:
                lede = text.split("\n\n", 1)[0] if "\n\n" in text else text[:200]
                return {
                    "case_text": text,
                    "lede": lede,
                    "verdict": cached.get("verdict"),
                    "analyzed_at": cached.get("analyzed_at"),
                }
        except Exception:
            pass
    return {"case_text": None, "lede": None, "verdict": None, "analyzed_at": None}


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


def _resolve_price_as_of(symbol: str) -> str:
    """Return YYYY-MM-DD string for when the price was last known.

    Priority: price_cache file (from daily scheduler) > latest screener date > today.
    Falls back to today's date if nothing else is available.
    """
    cache_file = DATA_DIR / "price_cache" / f"{symbol}.json"
    if cache_file.exists():
        try:
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
            fetched_at = cached.get("fetched_at") or ""
            if fetched_at:
                return fetched_at.split("T")[0]
        except (OSError, json.JSONDecodeError):
            pass
    # Latest screener date — validate YYYY-MM-DD format before trusting
    scr_path = find_latest("screener_*.json", DATA_DIR)
    if scr_path:
        try:
            scr = read_json(scr_path)
            date = scr.get("date")
            if isinstance(date, str) and re.match(r"^\d{4}-\d{2}-\d{2}", date):
                return date[:10]
        except (OSError, json.JSONDecodeError):
            pass
        # Fallback: parse from filename screener_YYYY-MM-DD.json
        stem = scr_path.stem
        if stem.startswith("screener_"):
            candidate = stem.replace("screener_", "")[:10]
            if re.match(r"^\d{4}-\d{2}-\d{2}$", candidate):
                return candidate
    return datetime.now().strftime("%Y-%m-%d")


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

    # Aggregates → flat fields used by report UI
    # (UI reads stock.dividend_streak_years / stock.eps_positive_count directly)
    agg = d.get("aggregates") or {}
    if d.get("dividend_streak_years") is None and agg.get("dividend_streak") is not None:
        d["dividend_streak_years"] = agg.get("dividend_streak")
    if d.get("eps_positive_count") is None:
        # UI expects 0-5 range (label "EPS Positive 5/5", last 5 yrs).
        # Prefer counting from yearly_metrics (last 5); else fall back to
        # aggregates.eps_positive_years (capped at 5).
        yearly = d.get("yearly_metrics") or []
        eps_count = None
        if yearly:
            sorted_yr = sorted(yearly, key=lambda y: y.get("year", 0))[-5:]
            eps_vals = [
                y.get("diluted_eps") if y.get("diluted_eps") is not None else y.get("eps")
                for y in sorted_yr
            ]
            eps_vals = [e for e in eps_vals if e is not None]
            if eps_vals:
                eps_count = sum(1 for e in eps_vals if e > 0)
        if eps_count is None and agg.get("eps_positive_years") is not None:
            try:
                eps_count = min(5, int(agg.get("eps_positive_years")))
            except (TypeError, ValueError):
                eps_count = None
        if eps_count is not None:
            d["eps_positive_count"] = eps_count

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

    # price_as_of — priority: price_cache > screener date > today
    sym = d.get("symbol")
    if sym:
        d["price_as_of"] = _resolve_price_as_of(sym)


@app.get("/api/stock/{symbol}/history")
async def get_stock_history(symbol: str):
    """Aggregate score + signal changes across all screener files for a symbol.

    Returns:
        {symbol, timeline: [{date, iso_week, score, signals, passed, reasons}],
         events: [{date, iso_week, type, action, detail}]}
    Timeline points come from every screener_*.json sorted by date ASC.
    Events are derived (first_pass / failed / passed / signal) + watchlist adds.
    """
    sym_norm = _norm_sym(symbol)
    timeline: list[dict] = []

    # Load history.json to map screener dates → ISO week keys
    history_file = DATA_DIR / "history.json"
    iso_weeks: dict[str, str] = {}
    if history_file.exists():
        try:
            hist = read_json(history_file)
            for s in hist.get("scans", []):
                rep = s.get("report", "") or ""
                # scan_YYYY-MM-DD.md → date key
                date_key = rep.replace("scan_", "").replace(".md", "") if rep else None
                if date_key:
                    iso_weeks[date_key] = s.get("iso_week")
        except Exception as e:
            logging.warning(f"stock history: history.json parse error: {e}")

    # Iterate screener files chronologically (old → new)
    for scr_file in sorted(DATA_DIR.glob("screener_*.json")):
        try:
            data = read_json(scr_file)
            date = data.get("date") or scr_file.stem.replace("screener_", "")
            iso_week = iso_weeks.get(date)
            found = False
            for c in data.get("candidates", []):
                if _norm_sym(c.get("symbol", "")) == sym_norm:
                    timeline.append({
                        "date": date,
                        "iso_week": iso_week,
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
                            "iso_week": iso_week,
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
                "iso_week": pt["iso_week"],
                "type": "first_pass",
                "action": "ผ่านเกณฑ์ (ครั้งแรก)",
                "detail": f"score {pt['score']}" if pt["score"] is not None else "",
            })
        elif prev_passed is True and pt["passed"] is False:
            detail = pt["reasons"][0] if pt["reasons"] else ""
            events.append({
                "date": pt["date"],
                "iso_week": pt["iso_week"],
                "type": "failed",
                "action": "หลุดรอบ",
                "detail": detail,
            })
        elif prev_passed is False and pt["passed"] is True:
            events.append({
                "date": pt["date"],
                "iso_week": pt["iso_week"],
                "type": "passed",
                "action": "กลับมาผ่านเกณฑ์",
                "detail": f"score {pt['score']}" if pt["score"] is not None else "",
            })
        # new signal (appeared this scan, not in previous)
        new_signals = set(pt["signals"]) - prev_signals
        for sig in sorted(new_signals):
            events.append({
                "date": pt["date"],
                "iso_week": pt["iso_week"],
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
            "iso_week": None,
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


@app.get("/api/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Return the authenticated user's identity (from Supabase JWT + whitelist)."""
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user.get("name"),
        "role": user["role"],
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
                timeout=3600,
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
async def post_settings(request: Request, _: dict = Depends(require_admin)):
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


def scheduled_price_refresh_job():
    """Daily 19:00 Asia/Bangkok — refresh current prices for watchlist + candidates.

    Runs after SET close (17:00) + 2h buffer so closing prices are stable. Delegates
    to ``scripts/daily_price_refresh.refresh_prices``; writes per-symbol JSON into
    ``data/price_cache/`` for consumption by ``_resolve_price_as_of``.
    """
    logging.info("[daily price refresh] START")
    _scripts_dir = str(PROJECT_DIR / "scripts")
    if _scripts_dir not in sys.path:
        sys.path.insert(0, _scripts_dir)
    try:
        from daily_price_refresh import refresh_prices
        result = refresh_prices()
        logging.info(f"[daily price refresh] DONE ({len(result)} prices)")
    except Exception as e:
        logging.error(f"[daily price refresh] FAILED: {e}")
        raise


scheduler = BackgroundScheduler()


def apply_schedule(config: dict):
    """Add or remove scheduler jobs based on config.

    Always registers the daily 19:00 Asia/Bangkok price refresh (independent of the
    weekly scan schedule toggle) so ``price_as_of`` stays fresh.
    """
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

    # Daily price refresh — 19:00 Asia/Bangkok (independent of weekly scan toggle).
    try:
        scheduler.remove_job("daily_price_refresh")
    except Exception:
        pass
    scheduler.add_job(
        scheduled_price_refresh_job,
        "cron",
        id="daily_price_refresh",
        hour=19,
        minute=0,
        timezone="Asia/Bangkok",
    )
    logging.info("[scheduler] daily_price_refresh scheduled: 19:00 Asia/Bangkok")


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


@app.post("/api/admin/price-refresh/trigger")
async def admin_trigger_price_refresh(_: dict = Depends(require_admin)):
    """Manually trigger the daily price refresh job (otherwise runs 19:00 Asia/Bangkok).

    Runs the refresh in an executor so the request does not block the event loop,
    then returns a count of prices written.
    """
    loop = asyncio.get_event_loop()

    def _run() -> int:
        _scripts_dir = str(PROJECT_DIR / "scripts")
        if _scripts_dir not in sys.path:
            sys.path.insert(0, _scripts_dir)
        from daily_price_refresh import refresh_prices
        return len(refresh_prices())

    try:
        count = await loop.run_in_executor(None, _run)
    except Exception as e:
        raise HTTPException(500, f"price refresh failed: {e}")
    return {"status": "ok", "refreshed": count}


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
    from yahooquery import Ticker as YQTicker
    import pandas as pd
    from datetime import date, timedelta
    import math

    ticker_symbol = symbol if ".BK" in symbol.upper() else symbol + ".BK"
    ticker_symbol = ticker_symbol.upper()

    try:
        ticker = YQTicker(ticker_symbol)
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
        hist = ticker.history(period="max", adj_ohlc=True)
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch history: {e}")

    if not hasattr(hist, 'shape') or hist.empty:
        raise HTTPException(404, f"No price history for {ticker_symbol}")

    # yahooquery returns multi-index (symbol, date) — flatten to DatetimeIndex
    if hasattr(hist.index, 'get_level_values') and ticker_symbol in hist.index.get_level_values(0):
        hist = hist.xs(ticker_symbol, level=0)
    # Normalize column names to Title-case so downstream "Close" access works
    hist = hist.rename(columns={"close": "Close", "open": "Open", "high": "High", "low": "Low", "volume": "Volume"})
    if "Close" not in hist.columns:
        raise HTTPException(500, f"Unexpected history schema — missing Close column (got {list(hist.columns)})")
    # Ensure DatetimeIndex
    if not isinstance(hist.index, pd.DatetimeIndex):
        hist.index = pd.to_datetime(hist.index)

    # Fetch dividends
    try:
        divs_df = ticker.dividend_history(start="2000-01-01")
        if hasattr(divs_df, 'shape') and not divs_df.empty:
            if hasattr(divs_df.index, 'get_level_values') and ticker_symbol in divs_df.index.get_level_values(0):
                divs_df = divs_df.xs(ticker_symbol, level=0)
            dividends = divs_df['dividends'] if 'dividends' in divs_df.columns else divs_df.iloc[:, 0]
            if not isinstance(dividends.index, pd.DatetimeIndex):
                dividends.index = pd.to_datetime(dividends.index)
        else:
            dividends = None
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
        sd = ticker.summary_detail
        if isinstance(sd, dict):
            info = sd.get(ticker_symbol) or {}
            if not isinstance(info, dict):
                info = {}
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
# User Data API — per-user via scripts.user_data_io (Plan 02 Phase 3)
# ---------------------------------------------------------------------------

# Lazy import: scripts/ is added to sys.path elsewhere in the file too. We do
# the load here once so all endpoints below share the same callable refs.
_scripts_dir_for_user_io = str(PROJECT_DIR)
if _scripts_dir_for_user_io not in sys.path:
    sys.path.insert(0, _scripts_dir_for_user_io)
from scripts.user_data_io import load_user_data, save_user_data  # noqa: E402


def _normalize_symbol(s: str) -> str:
    sym = s.strip().upper()
    if not sym.endswith(".BK"):
        sym += ".BK"
    return sym


@app.get("/api/user")
async def get_user_data(user: dict = Depends(get_current_user)):
    return load_user_data(user["user_id"])


class WatchlistUpdate(BaseModel):
    add: list[str] = []
    remove: list[str] = []


@app.put("/api/user/watchlist")
async def update_watchlist(
    body: WatchlistUpdate,
    user: dict = Depends(get_current_user),
):
    data = load_user_data(user["user_id"])
    old_wl = set(data.get("watchlist") or [])
    wl = set(old_wl)
    for s in body.add:
        wl.add(_normalize_symbol(s))
    for s in body.remove:
        wl.discard(_normalize_symbol(s))
    data["watchlist"] = sorted(wl)
    save_user_data(user["user_id"], data)

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
                        {"date": now_iso, "symbol": sym, "action": "add",
                         "user_id": user["user_id"]},
                        ensure_ascii=False,
                    ) + "\n")
                for sym in sorted(removed):
                    f.write(json.dumps(
                        {"date": now_iso, "symbol": sym, "action": "remove",
                         "user_id": user["user_id"]},
                        ensure_ascii=False,
                    ) + "\n")
        except Exception as e:
            logging.warning(f"watchlist_events log error: {e}")

    return {"watchlist": data["watchlist"]}


@app.put("/api/user/blacklist")
async def update_blacklist(
    body: WatchlistUpdate,
    user: dict = Depends(get_current_user),
):
    data = load_user_data(user["user_id"])
    bl = set(data.get("blacklist") or [])
    for s in body.add:
        bl.add(_normalize_symbol(s))
    for s in body.remove:
        bl.discard(_normalize_symbol(s))
    data["blacklist"] = sorted(bl)
    save_user_data(user["user_id"], data)
    return {"blacklist": data["blacklist"]}


class NoteUpdate(BaseModel):
    note: str


@app.put("/api/user/notes/{symbol}")
async def update_note(
    symbol: str,
    body: NoteUpdate,
    user: dict = Depends(get_current_user),
):
    data = load_user_data(user["user_id"])
    sym = _normalize_symbol(symbol)
    notes = data.setdefault("notes", {})
    if body.note.strip():
        notes[sym] = body.note.strip()
    else:
        notes.pop(sym, None)
    save_user_data(user["user_id"], data)
    return {"notes": data["notes"]}








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

    return f"""คุณกำลังสวมบทบาท 'Max' — AI stock analyst ส่วนตัวของ 'อาร์ท' (user) Max = เพื่อนสนิทที่เชี่ยวชาญหุ้นปันผลไทย สไตล์ ดร.นิเวศน์ เหมวชิรวรากร

**เป้าหมายของอาร์ท (context สำคัญ — อ้างอิงใน section Max คุยกับอาร์ท เสมอ):**
- เสาหลัก 1 = พอร์ตหุ้นปันผลไทย มูลค่าเป้าหมาย 100,000,000 บาท
- Passive income target = 10,000,000 บาท/ปี จากปันผล
- Horizon = DCA 10-20 ปี (ไม่ trade สั้น)
- Framework = ดร.นิเวศน์ 5-5-5-5 → กระจาย 5 sector × 80/20 concentration (anchor 40% + supporting 35% + 3 tails 25%)

**Tone guidance:** Max คุยกับอาร์ทแบบเพื่อน ไม่ formal — ใช้สรรพนาม 'อาร์ท' หรือ 'คุณ' (ห้าม กู/มึง), ใส่ตัวเลขจริง (เงินลงทุน, ปันผลที่จะได้, yield-on-cost projection), ชี้ทิศทางว่าทำยังไงต่อ ไม่ใช่แค่ข้อมูล

**ข้อมูลหุ้น {sym} ({name}):**
- คะแนน: {score}/100 (ปันผล {bd.get('dividend',0)}/50 + ราคา {bd.get('valuation',0)}/25 + cash flow {bd.get('cash_flow',0)}/15 + hidden {bd.get('hidden_value',0)}/10)
- Sector: {sector} | Mcap: {mcap_str}
- Yield: {yield_str}% | Payout: {payout_str}% | streak: {streak}y | FCF+: {fcf_pos}/{fcf_total}
- Rev CAGR: {rev_cagr_str}% | EPS CAGR: {eps_cagr_str}% | ROE: {avg_roe_str}%
- D/E: {de_str} | Int Cov: {int_cov_str}x | OCF/NI: {ocf_ni_str}x
- Valuation: {grade} ({label}) | PEG: {peg_str} | ราคา: {price_str} | 52w: {low52}-{high52}
- สัญญาณ: {signals_str}

**งานของคุณ — 4 analysis + 1 dialog + verdict:**

1. **Dividend Sustainability** (neutral analysis, 3-5 ประโยค) — จ่ายกี่ปี? payout ยั่งยืน? FCF รองรับ? DPS growth trajectory?
2. **Hidden Value Audit** (neutral, 3-5 ประโยค) — cross-holdings / land bank / non-core asset ตลาดไม่ pricing in?
3. **Business Moat (Thai market)** (neutral, 3-5 ประโยค) — structural ยืนนานไหม? daily-use? เทียบคู่แข่ง sector?
4. **Valuation Discipline** (neutral, 3-5 ประโยค) — PE vs sector median + self 5y? PBV <1? yield ≥5% ตอนนี้ + 5 ปีหน้า?

5. **Max คุยกับอาร์ท** (conversational — Max → อาร์ท, 3 ย่อหน้าสั้น):
   - ย่อหน้า 1 = scenario ตัวเลขจริง: 'ถ้าอาร์ทใส่ X M ที่ yield Y% = ปันผลปีแรก Z บาท compound 10 ปีที่ DPS growth 5% → yield-on-cost ประมาณ ...' (ใช้เลขจริงจากข้อมูลหุ้น)
   - ย่อหน้า 2 = ตำแหน่งใน pillar 1: 'ใน sector [X] ถ้าเอาเข้า pillar 1 จะทำหน้าที่ anchor/supporting/tail? concentration กี่ % ของ 100M? กระจายกับหุ้นตัวไหนใน sector เดียวกัน?'
   - ย่อหน้า 3 = Step ถัดไป: 'อาร์ทลอง [action เฉพาะ — เช่น DCA simulator 20y scenarios, ดู historical dividend, เทียบกับหุ้น sector เดียวกัน]'

6. **verdict** — BUY / HOLD / SELL + เหตุผล 1 ประโยค (lens = DCA 10-20y + dividend-first + pillar 1 fit)

**ตอบ JSON (ไม่มี text นอก JSON):**
{{"dividend":"...", "hidden":"...", "moat":"...", "valuation":"...", "to_art":"ย่อหน้า 1...\\n\\nย่อหน้า 2...\\n\\nย่อหน้า 3...", "verdict":"BUY|HOLD|SELL + reason"}}"""


_ANALYSIS_KEYS = ("dividend", "hidden", "moat", "valuation", "to_art", "verdict")


def build_analysis_prompt(symbol: str) -> str:
    """Build the Thai Niwes analysis prompt for a symbol from snapshot + screener.

    Resolves the stock via ``_find_stock_for_analysis`` then delegates to
    ``_build_analysis_prompt`` which renders the Max-to-Art persona prompt with
    pillar-1 context and asks for JSON with 6 keys: dividend, hidden, moat,
    valuation, to_art, verdict.

    Raises HTTPException(404) if the symbol is not found in screener/snapshot.
    """
    stock, _ = _find_stock_for_analysis(symbol)
    if stock is None:
        raise HTTPException(404, f"Stock {symbol} not found")
    return _build_analysis_prompt(stock)


def parse_analysis_response(raw: str) -> dict:
    """Extract JSON dict from Claude response text with 6-key Niwes schema.

    Strips markdown code fences (```json ... ```), then tries strict ``json.loads``.
    Falls back to regex extract of the first ``{...}`` block. Always returns a
    dict with all 6 expected keys — missing keys become empty strings so
    downstream code never sees KeyError.
    """
    text = (raw or "").strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.startswith("```")]
        text = "\n".join(lines).strip()
    data: dict = {}
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            try:
                data = json.loads(m.group(0))
            except Exception:
                data = {}
    if not isinstance(data, dict):
        data = {}
    return {k: str(data.get(k, "") or "") for k in _ANALYSIS_KEYS}


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
            max_tokens=4000,
            messages=[{"role": "user", "content": prompt}],
            timeout=90.0,
        ),
    )
    raw = response.content[0].text.strip()
    parsed = parse_analysis_response(raw)
    if not any(parsed.values()):
        logging.warning(
            "analyze %s: parse produced all empty keys (raw_len=%d, stop_reason=%s) — likely truncated or format mismatch",
            symbol, len(raw), response.stop_reason
        )
    payload = {
        "analyzed_at": datetime.now().isoformat(timespec="seconds"),
        "model": "claude-opus-4-7",
        **parsed,
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
async def get_exit_status(symbol: str, user: dict = Depends(get_current_user)):
    """Return baseline + exit triggers + severity summary for watchlist stock."""
    baselines_file = DATA_DIR / "exit_baselines.json"
    baselines = (
        json.loads(baselines_file.read_text(encoding="utf-8"))
        if baselines_file.exists()
        else {}
    )

    # Load user watchlist (per-user)
    user_data = load_user_data(user["user_id"])
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

    # Back-fill entry_score for baselines created before entry_score was recorded.
    # Strategy: pull score from latest screener candidate as best-available proxy,
    # persist back to baseline file so subsequent reads are stable.
    if entry_score is None and baseline and current_score is not None:
        baseline["entry_score"] = current_score
        baselines[symbol] = baseline
        try:
            baselines_file.write_text(
                json.dumps(baselines, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
            entry_score = current_score
        except OSError as e:
            logging.warning(f"[exit-status] failed to persist backfilled entry_score for {symbol}: {e}")

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
    """Price history — thaifin yearly (primary) or yahooquery monthly (for DCA)."""
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
        # Monthly granularity — yahooquery (for DCA simulator)
        try:
            from yahooquery import Ticker as YQTicker
            import pandas as pd
            loop = asyncio.get_event_loop()
            hist = await loop.run_in_executor(
                None,
                lambda: YQTicker(symbol).history(
                    period="10y", interval="1mo", adj_ohlc=False
                ),
            )
        except Exception as e:
            raise HTTPException(503, f"yahooquery fetch failed: {e}")
        if not hasattr(hist, 'shape') or hist.empty:
            raise HTTPException(404, f"no monthly price history for {symbol}")
        # yahooquery returns multi-index (symbol, date) — flatten
        if hasattr(hist.index, 'get_level_values') and symbol in hist.index.get_level_values(0):
            hist = hist.xs(symbol, level=0)
        close_col = "close" if "close" in hist.columns else ("Close" if "Close" in hist.columns else None)
        if close_col is None:
            raise HTTPException(500, f"Unexpected monthly history schema — missing close column (got {list(hist.columns)})")
        data = []
        for idx, row in hist.iterrows():
            close_val = row[close_col]
            if close_val is None or pd.isna(close_val):
                continue
            data.append({
                "date": idx.strftime("%Y-%m-%d") if hasattr(idx, 'strftime') else str(idx),
                "close": float(close_val),
            })
        payload = {
            "symbol": symbol,
            "source": "yahooquery_monthly",
            "granularity": "monthly",
            "fetched_at": now.isoformat(timespec="seconds"),
            "data": data,
        }

    cache_file.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return payload






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
        iso_week = s.get("iso_week") or ""
        week_label = ("W" + iso_week.split("-W")[-1]) if iso_week else scan_date
        weeks_out.append({
            "week_label": week_label,
            "iso_week": iso_week,
            "scanned_at": s.get("scanned_at"),
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
async def watchlist_enriched(user: dict = Depends(get_current_user)):
    """Join watchlist × screener × exit_baselines × notes in one call.
    Avoids client-side N+1 fetches (one per symbol).
    """
    user_data = load_user_data(user["user_id"])
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


# ============================================================================
# Plan portfolio-from-watchlist Phase 2 — Builder + Explain + HTML routes
# ============================================================================

@app.get("/api/portfolio/builder")
async def get_portfolio_builder(
    pins: str = "",
    user: dict = Depends(get_current_user),
):
    """Build Niwes 5-sector 80/20 portfolio from user watchlist + latest screener.

    `pins` = optional comma-separated symbols to force-include (override resolver).
    Returns: {summary, portfolio, bench, warnings, source}.
    """
    # CRITICAL: lazy import (scripts/ is not a Python package + needs sys.path injection)
    _project_root = str(PROJECT_DIR)
    if _project_root not in sys.path:
        sys.path.insert(0, _project_root)
    from scripts import portfolio_builder as pb_mod

    user_data = load_user_data(user["user_id"])
    watchlist = user_data.get("watchlist") or []
    try:
        screener = _latest_screener_file()
    except HTTPException:
        screener = {"candidates": [], "review_candidates": [], "filtered_out_stocks": []}
    pin_list = [p.strip().upper() for p in pins.split(",") if p.strip()]
    result = pb_mod.build_portfolio(watchlist, screener, pins=pin_list)

    # source block — find latest screener file mtime for freshness display
    files = sorted(DATA_DIR.glob("screener_*.json"), reverse=True)
    if files:
        m_ts = files[0].stat().st_mtime
        scan_at = datetime.fromtimestamp(m_ts).isoformat(timespec="seconds")
        hours_ago = int((datetime.now() - datetime.fromtimestamp(m_ts)).total_seconds() / 3600)
    else:
        scan_at, hours_ago = None, None
    result["source"] = {
        "watchlist_count": len(watchlist),
        "scan_at": scan_at,
        "scan_hours_ago": hours_ago,
    }
    return result


def _build_portfolio_explain_prompt(portfolio: list) -> str:
    """Build Niwes pillar-1 100M context prompt — 3-paragraph commentary."""
    total_yield = 0
    yield_count = 0
    for p in portfolio:
        y = p.get("dividend_yield")
        if y is not None:
            total_yield += y
            yield_count += 1
    avg_yield = round(total_yield / max(yield_count, 1), 2)

    pos_lines = []
    for p in portfolio:
        pos_lines.append(
            f"- {p.get('symbol', '?')} ({p.get('sector_canonical', '?')}) "
            f"weight {p.get('weight_pct', 0)}% · score {p.get('score', '?')} · "
            f"role {p.get('role', '?')} · yield {p.get('dividend_yield', '?')}%"
        )
    portfolio_text = "\n".join(pos_lines)

    return f"""คุณคือ "แมกซ์" — เพื่อนสนิทของอาร์ทที่เข้าใจปรัชญา ดร.นิเวศน์ เหมวชิรวรากร และเสาหลัก 1 ของอาร์ท: พอร์ตหุ้นปันผลไทย เป้าหมาย 100 ล้านบาท ลงทุน DCA 10-20 ปี

อาร์ทเพิ่งจัดพอร์ตจาก watchlist ตามแนวนิเวศน์:
{portfolio_text}
- avg yield: {avg_yield}%

เขียนคุยกับอาร์ทเป็น 3 ย่อหน้า ภาษาคน (ใช้ มึง/กู), ห้ามพ่นชื่อฟังก์ชัน/ตัวแปร, ตรงประเด็น:

ย่อหน้า 1 (Scenario ตัวเลขจริง): ถ้าใส่เงิน 5 ล้านในพอร์ตนี้ที่ avg yield {avg_yield}% — ปันผลปีแรกได้เท่าไหร่ · compound 10 ปีคิด yield-on-cost (สมมติ DPS growth 5%/ปี) จะอยู่ที่กี่ % · เมื่อโต 20 เท่าตามเป้า 100M ปันผลรวมต่อปีเท่าไหร่ — ใช้ตัวเลขจริงไม่ใช่ generic.

ย่อหน้า 2 (ตำแหน่งใน Pillar 1): พอร์ตนี้กระจาย sector แค่ไหน · 80/20 concentration ตามนิเวศน์เป็นยังไง · จุดอ่อนคืออะไร (sector ขาด, score ต่ำ, exposure overlap) · เปรียบเทียบกับนิเวศน์ pattern: top 5 = 70-80% concentration.

ย่อหน้า 3 (Step ถัดไป): อาร์ทควรทำอะไรต่อ — เพิ่ม sector ที่ขาดไหม / DCA แบบไหน / เกณฑ์ exit เมื่อไหร่ · จบแบบ takeaway ที่จับต้องได้.

ห้ามขึ้นต้น "I'd be happy" / "ครับ" / "ได้เลย". เริ่มย่อหน้าแรกด้วย scenario ตัวเลขเลย."""


@app.post("/api/portfolio/builder/explain")
async def explain_portfolio(
    payload: dict,
    user: dict = Depends(get_current_user),
):
    """Claude Opus on-demand commentary on a built portfolio. Cached 7d by hash, per user."""
    if _anthropic_client is None:
        raise HTTPException(503, "MAX_ANTHROPIC_API_KEY missing")
    watchlist = payload.get("watchlist", [])
    pins = payload.get("pins", [])
    portfolio = payload.get("portfolio", [])

    # Cache per-user so two users with similar watchlists don't share output.
    h = hashlib.sha256(
        (user["user_id"] + "|" + "|".join(sorted(watchlist)) + "|" + "|".join(sorted(pins))).encode()
    ).hexdigest()[:16]
    cache_file = _PORTFOLIO_OPUS_CACHE_DIR / f"{h}.json"

    if cache_file.exists():
        try:
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
            age = datetime.now() - datetime.fromisoformat(cached.get("analyzed_at", ""))
            if age < timedelta(days=_CACHE_TTL_DAYS):
                return cached
        except Exception:
            pass

    prompt = _build_portfolio_explain_prompt(portfolio)
    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None,
        lambda: _anthropic_client.messages.create(
            model="claude-opus-4-7",
            max_tokens=4000,
            messages=[{"role": "user", "content": prompt}],
            timeout=90.0,
        ),
    )

    # MANDATORY stop_reason check (Karl rule: Thai output truncate risk)
    if response.stop_reason != "end_turn":
        logging.warning(
            "explain_portfolio: stop_reason=%s (not end_turn) — Thai may be truncated",
            response.stop_reason,
        )

    payload_out = {
        "analyzed_at": datetime.now().isoformat(timespec="seconds"),
        "model": "claude-opus-4-7",
        "commentary": response.content[0].text.strip(),
    }
    cache_file.write_text(
        json.dumps(payload_out, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return payload_out


@app.get("/portfolio", response_class=HTMLResponse)
async def serve_portfolio_desktop():
    return _render_shell(_V6_DESKTOP)


@app.get("/m/portfolio", response_class=HTMLResponse)
async def serve_portfolio_mobile():
    return _render_shell(_V6_MOBILE)


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




# Desktop SPA routes — generic shell unless a dedicated shell file exists
@app.get("/", response_class=HTMLResponse)
@app.get("/home", response_class=HTMLResponse)
@app.get("/watchlist", response_class=HTMLResponse)
@app.get("/settings", response_class=HTMLResponse)
@app.get("/login", response_class=HTMLResponse)
async def serve_index():
    return _render_shell(_V6_DESKTOP)


@app.get("/report/{symbol}", response_class=HTMLResponse)
async def serve_desktop_report(symbol: str):
    return _render_shell(_V6_DESKTOP)




# Mobile SPA routes
@app.get("/mobile", response_class=HTMLResponse)
@app.get("/m", response_class=HTMLResponse)
@app.get("/m/home", response_class=HTMLResponse)
@app.get("/m/watchlist", response_class=HTMLResponse)
@app.get("/m/settings", response_class=HTMLResponse)
@app.get("/m/login", response_class=HTMLResponse)
async def serve_mobile():
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
