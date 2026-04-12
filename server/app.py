"""Max Mahon — FastAPI server for stock dashboard.

Serves data APIs, pipeline control, reports, and static files.
Run: py -m uvicorn server.app:app --port 50089
"""

import asyncio
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

import markdown
import uvicorn
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

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
pipeline_lock = asyncio.Lock()
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
    # Find in snapshot
    snap_path = find_latest("snapshot_*.json", DATA_DIR)
    stock_data = None
    if snap_path:
        snap = read_json(snap_path)
        for s in snap.get("stocks", []):
            if s.get("symbol", "").upper() == symbol.upper():
                stock_data = dict(s)
                break

    if stock_data is None:
        raise HTTPException(404, f"Stock {symbol} not found")

    # Enrich from screener
    scr_path = find_latest("screener_*.json", DATA_DIR)
    if scr_path:
        scr = read_json(scr_path)
        for c in scr.get("candidates", []):
            if c.get("symbol", "").upper() == symbol.upper():
                stock_data["score"] = c.get("score")
                stock_data["breakdown"] = c.get("breakdown")
                stock_data["signals"] = c.get("signals")
                stock_data["reasons"] = c.get("reasons")
                stock_data["screener_metrics"] = c.get("metrics")
                break

    return stock_data


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

    async def _execute():
        async with pipeline_lock:
            pipeline_state["running"] = True
            pipeline_state["last_result"] = None
            try:
                for script in scripts:
                    pipeline_state["current_task"] = script
                    script_path = SCRIPTS_DIR / script
                    proc = await asyncio.create_subprocess_exec(
                        "py", str(script_path),
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                        cwd=str(PROJECT_DIR),
                    )
                    stdout, stderr = await proc.communicate()
                    if proc.returncode != 0:
                        err_msg = stderr.decode("utf-8", errors="replace")
                        pipeline_state["last_result"] = f"FAILED at {script}: {err_msg[:500]}"
                        return
                pipeline_state["last_result"] = f"OK — {action} completed"
            except Exception as e:
                pipeline_state["last_result"] = f"ERROR: {e}"
            finally:
                pipeline_state["running"] = False
                pipeline_state["current_task"] = None
                pipeline_state["last_run"] = datetime.now().isoformat()

    asyncio.create_task(_execute())
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
# Scheduler
# ---------------------------------------------------------------------------

def get_week_of_month() -> int:
    """Return week number 1-4+ for current date."""
    today = datetime.now()
    return (today.day - 1) // 7 + 1


async def scheduled_run():
    """Sunday 09:00 — weekly (week 1,3) or discovery (week 2,4)."""
    week = get_week_of_month()
    action = "weekly" if week in (1, 3) else "discovery"
    print(f"[scheduler] week {week} → running {action}")
    # Trigger pipeline
    scripts = PIPELINE_MAP[action]
    async with pipeline_lock:
        pipeline_state["running"] = True
        pipeline_state["last_result"] = None
        try:
            for script in scripts:
                pipeline_state["current_task"] = script
                script_path = SCRIPTS_DIR / script
                proc = await asyncio.create_subprocess_exec(
                    "py", str(script_path),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=str(PROJECT_DIR),
                )
                stdout, stderr = await proc.communicate()
                if proc.returncode != 0:
                    err_msg = stderr.decode("utf-8", errors="replace")
                    pipeline_state["last_result"] = f"FAILED at {script}: {err_msg[:500]}"
                    return
            pipeline_state["last_result"] = f"OK — scheduled {action} completed"
        except Exception as e:
            pipeline_state["last_result"] = f"ERROR: {e}"
        finally:
            pipeline_state["running"] = False
            pipeline_state["current_task"] = None
            pipeline_state["last_run"] = datetime.now().isoformat()


scheduler = AsyncIOScheduler()
scheduler.add_job(scheduled_run, "cron", day_of_week="sun", hour=9, minute=0)


@app.on_event("startup")
async def on_startup():
    scheduler.start()
    print(f"[max-server] started on port 50089 — data: {DATA_DIR}")


@app.on_event("shutdown")
async def on_shutdown():
    scheduler.shutdown(wait=False)


# ---------------------------------------------------------------------------
# Static files (SPA) — mount last so API routes take priority
# ---------------------------------------------------------------------------
if WEB_DIR.exists():
    app.mount("/", StaticFiles(directory=str(WEB_DIR), html=True), name="static")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run("server.app:app", host="0.0.0.0", port=50089, reload=True)
