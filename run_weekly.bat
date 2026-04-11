@echo off
REM Max Mahon — Weekly Stock Analysis
REM Schedule this with Windows Task Scheduler (every Sunday 9:00 AM)

cd /d "C:\WORKSPACE\projects\max"
py scripts\run_weekly.py

pause
