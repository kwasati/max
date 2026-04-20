@echo off
REM ============================================================================
REM run_monitor_pipeline.bat — Niwes news monitor pipeline (Plan niwes-07)
REM
REM Runs 3 steps in sequence:
REM   1. monitor_niwes_news.py   (scrape news)
REM   2. diff_niwes_portfolio.py (detect changes with Haiku)
REM   3. alert_niwes.py          (send Telegram for high-confidence findings)
REM
REM Stops on first error (echo + exit 1).
REM Log file: data/monitor_log_YYYY-MM-DD.log
REM
REM Schedule via Windows Task Scheduler — see docs/niwes/14-monitoring-setup.md
REM ============================================================================

setlocal EnableDelayedExpansion

REM Force UTF-8 for Thai text in stdout/files
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

REM Project root = parent of this script's dir
set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%.."
pushd "%PROJECT_ROOT%"

REM Date stamp — YYYY-MM-DD (ISO) via PowerShell (locale-independent)
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "TODAY=%%i"

if not exist "data" mkdir "data"
set "LOG=data\monitor_log_%TODAY%.log"

echo ============================================================ >> "%LOG%"
echo [%DATE% %TIME%] Niwes monitor pipeline starting >> "%LOG%"
echo ============================================================ >> "%LOG%"

echo [1/3] Scraping news ...
echo [1/3] Scraping news ... >> "%LOG%"
py scripts\monitor_niwes_news.py >> "%LOG%" 2>&1
if errorlevel 1 (
    echo ERROR: monitor_niwes_news.py failed — see %LOG%
    echo [ERROR] monitor_niwes_news.py failed >> "%LOG%"
    popd
    exit /b 1
)

echo [2/3] Detecting portfolio changes with Haiku ...
echo [2/3] Detecting portfolio changes with Haiku ... >> "%LOG%"
py scripts\diff_niwes_portfolio.py >> "%LOG%" 2>&1
if errorlevel 1 (
    echo ERROR: diff_niwes_portfolio.py failed — see %LOG%
    echo [ERROR] diff_niwes_portfolio.py failed >> "%LOG%"
    popd
    exit /b 1
)

echo [3/3] Sending Telegram alerts if needed ...
echo [3/3] Sending Telegram alerts if needed ... >> "%LOG%"
py scripts\alert_niwes.py >> "%LOG%" 2>&1
if errorlevel 1 (
    echo ERROR: alert_niwes.py failed — see %LOG%
    echo [ERROR] alert_niwes.py failed >> "%LOG%"
    popd
    exit /b 1
)

echo [%DATE% %TIME%] Niwes monitor pipeline finished OK >> "%LOG%"
echo Done. Log: %LOG%
popd
endlocal
exit /b 0
