"""Max Mahon — Real-time console status panel.

Uses ANSI cursor-home to redraw in-place without clearing screen.
No flickering, no selection loss.
"""

import os
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

_first_render = True


# ANSI colors
class C:
    reset = "\x1b[0m"
    dim = "\x1b[2m"
    bold = "\x1b[1m"
    red = "\x1b[31m"
    green = "\x1b[32m"
    yellow = "\x1b[33m"
    blue = "\x1b[34m"
    cyan = "\x1b[36m"
    white = "\x1b[37m"


def _uptime_str(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h > 0:
        return f"{h}h {m}m {s}s"
    if m > 0:
        return f"{m}m {s}s"
    return f"{s}s"


def _ts() -> str:
    now = datetime.now()
    return now.strftime("%H:%M:%S")


# Request counter (thread-safe)
_request_count = 0
_request_lock = threading.Lock()
_last_requests: list[str] = []  # last 5 requests for display


def count_request(method: str, path: str, status_code: int):
    global _request_count
    with _request_lock:
        _request_count += 1
        entry = f"{C.dim}{_ts()}{C.reset} {method} {path} "
        if status_code < 400:
            entry += f"{C.green}{status_code}{C.reset}"
        else:
            entry += f"{C.red}{status_code}{C.reset}"
        _last_requests.append(entry)
        if len(_last_requests) > 5:
            _last_requests.pop(0)


def render(
    port: int,
    pid: int,
    start_time: float,
    pipeline_state: dict,
    data_dir: Path,
    url: str = "https://max.intensivetrader.com",
):
    """Render the status panel in-place (no flicker)."""
    global _first_render
    if _first_render:
        os.system("cls" if os.name == "nt" else "clear")
        _first_render = False

    uptime = time.time() - start_time

    # Find latest data
    snap_files = sorted(data_dir.glob("snapshot_*.json"), key=lambda p: p.name, reverse=True)
    last_date = snap_files[0].stem.replace("snapshot_", "") if snap_files else "-"
    screener_files = sorted(data_dir.glob("screener_*.json"), key=lambda p: p.name, reverse=True)
    screener_date = screener_files[0].stem.replace("screener_", "") if screener_files else "-"

    # Pipeline status
    if pipeline_state["running"]:
        pipe_icon = f"{C.yellow}◆{C.reset}"
        pipe_text = f"{C.yellow}{pipeline_state['current_task']}{C.reset}"
    elif pipeline_state["last_result"] and "OK" in str(pipeline_state["last_result"]):
        pipe_icon = f"{C.green}●{C.reset}"
        pipe_text = f"{C.green}idle{C.reset}"
    else:
        pipe_icon = f"{C.green}●{C.reset}"
        pipe_text = f"{C.green}idle{C.reset}"

    last_run = pipeline_state.get("last_run")
    last_run_str = last_run[:19].replace("T", " ") if last_run else "-"
    last_result = pipeline_state.get("last_result") or "-"
    if len(last_result) > 60:
        last_result = last_result[:57] + "..."

    with _request_lock:
        req_count = _request_count
        recent = list(_last_requests)

    clr = "\x1b[K"
    lines = [
        f"{clr}",
        f"  {C.cyan}●{C.reset} {C.bold}Max Mahon Server{C.reset}{clr}",
        f"{C.dim}    Port: {port} · PID: {pid} · Uptime: {_uptime_str(uptime)}{C.reset}{clr}",
        f"{C.dim}    URL:  {url}{C.reset}{clr}",
        f"{clr}",
        f"  {C.bold}Data{C.reset}{clr}",
        f"    Snapshot:  {C.white}{last_date}{C.reset}{clr}",
        f"    Screener:  {C.white}{screener_date}{C.reset}{clr}",
        f"{clr}",
        f"  {C.bold}Pipeline{C.reset}{clr}",
        f"    Status:    {pipe_icon} {pipe_text}{clr}",
        f"    Last run:  {C.dim}{last_run_str}{C.reset}{clr}",
        f"    Result:    {C.dim}{last_result}{C.reset}{clr}",
        f"{clr}",
        f"  {C.bold}Requests{C.reset}  {C.dim}({req_count} total){C.reset}{clr}",
    ]
    if recent:
        for r in recent:
            lines.append(f"    {r}{clr}")
    else:
        lines.append(f"    {C.dim}No requests yet{C.reset}{clr}")
    lines.append(f"{clr}")
    lines.append(f"{C.dim}  Ctrl+C to stop{C.reset}{clr}")
    lines.append(f"{clr}")

    sys.stdout.write("\x1b[H" + "\n".join(lines))
    sys.stdout.flush()


def start_refresh_loop(
    port: int,
    pid: int,
    start_time: float,
    pipeline_state: dict,
    data_dir: Path,
    url: str = "https://max.intensivetrader.com",
    interval: float = 2.0,
):
    """Start background thread that refreshes console every N seconds."""

    def _loop():
        while True:
            try:
                render(port, pid, start_time, pipeline_state, data_dir, url)
            except Exception:
                pass
            time.sleep(interval)

    t = threading.Thread(target=_loop, daemon=True)
    t.start()
    return t
