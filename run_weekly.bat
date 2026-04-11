@echo off
REM Max Mahon — Weekly Stock Analysis
REM Runs every Sunday 9:00 via Task Scheduler

cd /d "C:\WORKSPACE\projects\max"

REM Week 1,3 of month: weekly only
REM Week 2,4 of month: weekly + discovery (scan new stocks)
REM Use Python to calculate week-of-month (locale-safe)
for /f %%w in ('py -c "from datetime import date; d=date.today(); print((d.day-1)//7+1)"') do set WEEK=%%w
if %WEEK%==2 goto discover
if %WEEK%==4 goto discover

:weekly
echo [Max Mahon] Weekly analysis...
py scripts\run_weekly.py
goto end

:discover
echo [Max Mahon] Weekly + Discovery scan...
py scripts\run_weekly.py --discover
goto end

:end
echo [Max Mahon] Done.
