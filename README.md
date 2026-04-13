# Max Mahon

Thai stock analyst agent — automated weekly analysis of SET-listed stocks using Warren Buffett and Hong Sathaporn investment philosophy.

Dashboard at [max.intensivetrader.com](https://max.intensivetrader.com)

## What It Does

- **Weekly analysis:** Fetches multi-year financials via yfinance, then Claude analyzes 6 dimensions (business quality, financial health, growth, dividend sustainability, valuation, DCA suitability)
- **Discovery:** Screens ~99 SET stocks through hard filters, scores quality out of 100, tags signals (COMPOUNDER, CASH_COW, DIVIDEND_KING, etc.), and Claude picks new candidates
- **Dashboard:** Web UI for browsing watchlist, viewing stock details, and triggering pipelines

## Tech Stack

- Python + yfinance (data)
- Claude CLI (AI analysis)
- FastAPI + APScheduler (server + scheduling)
- HTML/CSS/JS dashboard (served by FastAPI)

## Running

```bash
# Start the server (port 50089)
max-server.bat
# or
py -m uvicorn server.app:app --port 50089

# Run pipelines manually
py scripts/run_weekly.py              # weekly analysis
py scripts/run_weekly.py --discover   # discovery run
py scripts/fetch_data.py              # fetch data only
py scripts/screen_stocks.py           # screen stocks only
```

Requires `MAX_TOKEN` in root `.env` for API auth (Bearer token).

## Project Structure

```
scripts/
  fetch_data.py      # multi-year financials + dividends
  analyze.py         # Claude analysis prompt + run
  screen_stocks.py   # hard filters + quality score
  discover.py        # Claude picks new stocks from screener
  run_weekly.py      # pipeline runner
server/
  app.py             # FastAPI server, scheduler, SSE
web/                 # dashboard frontend
reports/             # generated analysis reports
data/                # snapshots + screener results (gitignored)
watchlist.json       # tracked stocks
```
