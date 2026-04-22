@echo off
title Max Mahon Server
cd /d "C:\WORKSPACE\projects\MaxMahon"

:: UTF-8 for Python (Windows Thai encoding fix)
set PYTHONUTF8=1

:: Check dependencies
py -c "import fastapi, uvicorn, sse_starlette, apscheduler, markdown" 2>nul
if errorlevel 1 (
    echo Installing dependencies...
    pip install fastapi uvicorn sse-starlette apscheduler python-markdown python-dotenv pydantic yfinance
)

echo.
echo   Max Mahon Server
echo   Port:  50089
echo   URL:   https://max.intensivetrader.com
echo   Local: http://localhost:50089
echo.

:: Start server — console UI handles display, suppress uvicorn logs
py -m uvicorn server.app:app --host 0.0.0.0 --port 50089 --log-level warning --no-access-log

pause
