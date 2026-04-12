@echo off
title Max Mahon Server
cd /d "C:\WORKSPACE\projects\max"
set PYTHONUTF8=1
py -m uvicorn server.app:app --host 0.0.0.0 --port 50089
pause
