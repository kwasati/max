# Max Mahon

Thai stock analyst agent — automated weekly scan of SET-listed stocks using Warren Buffett and Hong Sathaporn investment philosophy.

Dashboard at [max.intensivetrader.com](https://max.intensivetrader.com)

## What It Does

- **Unified scan (weekly):** Fetches multi-year financials via thaifin + yfinance, screens SET+mai universe through hard filters, scores quality out of 100, tags signals (COMPOUNDER, CASH_COW, DIVIDEND_KING, etc.), and Claude picks top candidates + summarizes 6 dimensions (business quality, financial health, growth, dividend sustainability, valuation, DCA suitability)
- **Dashboard:** Web UI for browsing watchlist, viewing stock details, reading scan reports, and triggering the pipeline

## Tech Stack

- Python + thaifin + yfinance (data)
- Anthropic SDK (AI analysis)
- FastAPI + APScheduler (server + scheduling)
- HTML/CSS/JS dashboard (served by FastAPI)

## Running

```bash
# Start the server (port 50089)
max-server.bat
# or
py -m uvicorn server.app:app --port 50089

# Run the pipeline manually
# Trigger scan via API: curl -X POST http://localhost:50089/api/scan/trigger -H "Authorization: Bearer $MAX_TOKEN"
py scripts/fetch_data.py              # fetch data only
py scripts/screen_stocks.py           # screen stocks only
py scripts/scan.py                    # scan step only
```

Requires `MAX_TOKEN` in root `.env` for API auth (Bearer token).

## Project Structure

```
scripts/
  fetch_data.py      # multi-year financials + dividends
  update_universe.py # refresh SET/mai universe
  screen_stocks.py   # hard filters + quality score
  scan.py            # Claude scan (top picks + summary)
  run_scan.py        # pipeline runner
server/
  app.py             # FastAPI server, scheduler, SSE
web/                 # dashboard frontend
reports/             # scan_*.md reports
data/                # snapshots + screener + history.json (gitignored)
user_data.json       # watchlist + blacklist + notes
```
