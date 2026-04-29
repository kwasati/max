"""Admin / legacy endpoints. v6 frontend does not call these.

Kept for external API consumers + CLI debugging. Review for removal in v7
if still unused.

Mounted in server/app.py via `app.include_router(admin_router)`. All routes
live under /api/admin/* prefix.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import sys
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

import markdown
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from server.auth import require_admin


# All /api/admin/* endpoints require an admin-role JWT (Supabase whitelist).
# Router-level dependency guarantees every route below is admin-gated even if
# someone forgets to add Depends(require_admin) to a new handler.
router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)

# ---------------------------------------------------------------------------
# Shared state — must be initialized from app.py via init_admin(...)
# ---------------------------------------------------------------------------
_DATA_DIR: Optional[Path] = None
_REPORTS_DIR: Optional[Path] = None
_PROJECT_DIR: Optional[Path] = None
_pipeline_state: Optional[dict] = None
_pipeline_lock: Optional[threading.Lock] = None
_request_status: Optional[dict] = None
_request_timestamps: Optional[dict] = None
_execute_sync = None
_get_scripts_for_mode = None
_fetch_one = None


def init_admin(
    *,
    data_dir: Path,
    reports_dir: Path,
    project_dir: Path,
    pipeline_state: dict,
    pipeline_lock: threading.Lock,
    request_status: dict,
    request_timestamps: dict,
    execute_sync,
    get_scripts_for_mode,
    fetch_one,
):
    """Wire shared state from main app before router is mounted."""
    global _DATA_DIR, _REPORTS_DIR, _PROJECT_DIR
    global _pipeline_state, _pipeline_lock
    global _request_status, _request_timestamps
    global _execute_sync, _get_scripts_for_mode, _fetch_one
    _DATA_DIR = data_dir
    _REPORTS_DIR = reports_dir
    _PROJECT_DIR = project_dir
    _pipeline_state = pipeline_state
    _pipeline_lock = pipeline_lock
    _request_status = request_status
    _request_timestamps = request_timestamps
    _execute_sync = execute_sync
    _get_scripts_for_mode = get_scripts_for_mode
    _fetch_one = fetch_one


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _list_files(directory: Path, pattern: str) -> list[str]:
    return sorted(p.name for p in directory.glob(pattern))


# ---------------------------------------------------------------------------
# /api/admin/history — legacy v1 history
# ---------------------------------------------------------------------------
@router.get("/history")
async def admin_get_scan_history():
    """Return list of all scans (newest first) — v1 history."""
    history_file = _DATA_DIR / "history.json"
    if not history_file.exists():
        return {"scans": [], "total": 0}
    data = _read_json(history_file)
    scans = data.get("scans", [])
    scans_sorted = sorted(scans, key=lambda s: s.get("num", 0), reverse=True)
    return {"scans": scans_sorted, "total": len(scans_sorted)}


# ---------------------------------------------------------------------------
# /api/admin/reports + /api/admin/reports/scan
# ---------------------------------------------------------------------------
@router.get("/reports")
async def admin_list_reports():
    """List report files (scan + ad-hoc requests)."""
    scans = _list_files(_REPORTS_DIR, "scan_*.md")
    requests = _list_files(_DATA_DIR, "request_*.json")
    return {"scans": scans, "requests": requests}


@router.get("/reports/scan")
async def admin_get_scan_report(num: Optional[int] = None):
    """Return rendered HTML of a scan report. num=latest if not provided."""
    history_file = _DATA_DIR / "history.json"
    if not history_file.exists():
        raise HTTPException(404, "No scan history")
    history = _read_json(history_file)
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
    report_path = _REPORTS_DIR / report_name
    try:
        if not report_path.resolve().is_relative_to(_REPORTS_DIR.resolve()):
            raise HTTPException(400, "Invalid report path")
    except AttributeError:
        if _REPORTS_DIR.resolve() not in report_path.resolve().parents:
            raise HTTPException(400, "Invalid report path")
    if not report_path.exists():
        raise HTTPException(404, f"Report file {report_name} missing")
    md_text = report_path.read_text(encoding="utf-8")
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
# /api/admin/request + /api/admin/request/status + /api/admin/requests
# ---------------------------------------------------------------------------
class _RequestBody(BaseModel):
    symbols: list[str]


@router.post("/request")
async def admin_request_analyze(body: _RequestBody):
    """Fetch & analyze specific stocks in background (admin/debug)."""
    # Symbol normalization
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
        _request_status[s] = "processing"
        _request_timestamps[s] = now

    async def _run():
        loop = asyncio.get_event_loop()
        try:
            results = []
            for sym in symbols:
                try:
                    data = await loop.run_in_executor(None, _fetch_one, sym)
                    results.append(data)
                    _request_status[sym] = "done"
                    _request_timestamps[sym] = datetime.now()
                except Exception as e:
                    results.append({"symbol": sym, "error": str(e)})
                    _request_status[sym] = "error"
                    _request_timestamps[sym] = datetime.now()
            today = datetime.now().strftime("%Y-%m-%d")
            joined = "_".join(s.replace(".BK", "") for s in symbols)
            out_path = _DATA_DIR / f"request_{today}_{joined}.json"
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
                _request_status[sym] = "error"
                _request_timestamps[sym] = datetime.now()
            print(f"[admin/request] error: {e}", file=sys.stderr)

    asyncio.create_task(_run())
    return {"status": "processing", "symbols": symbols}


@router.get("/request/status")
async def admin_request_status():
    """Get processing status for requested symbols."""
    return _request_status


@router.get("/requests")
async def admin_list_requests():
    """List request results with stock data."""
    results = []
    for f in sorted(_DATA_DIR.glob("request_*.json"), reverse=True):
        try:
            data = _read_json(f)
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
# /api/admin/scan/trigger + /api/admin/events (SSE)
# ---------------------------------------------------------------------------
@router.post("/scan/trigger")
async def admin_trigger_scan():
    """Manual trigger unified scan pipeline (admin/debug)."""
    with _pipeline_lock:
        if _pipeline_state["running"]:
            raise HTTPException(
                409, f"Pipeline already running: {_pipeline_state['current_task']}"
            )
    scripts = _get_scripts_for_mode("scan")
    threading.Thread(
        target=_execute_sync, args=(scripts, "admin manual scan"), daemon=True
    ).start()
    return {"status": "started", "mode": "scan", "scripts": scripts}


@router.get("/events")
async def admin_sse_events(request: Request):
    """SSE endpoint streaming pipeline status every 5 seconds."""
    async def event_generator():
        while True:
            if await request.is_disconnected():
                break
            data = json.dumps({
                "pipeline_running": _pipeline_state["running"],
                "current_task": _pipeline_state["current_task"],
                "last_run": _pipeline_state["last_run"],
                "last_result": _pipeline_state["last_result"],
            })
            yield {"event": "status", "data": data, "retry": 10000}
            await asyncio.sleep(5)

    return EventSourceResponse(event_generator())
