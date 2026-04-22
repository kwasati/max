# Max Mahon

Thai stock analyst agent — Niwes Dividend-First framework. Weekly automated scan of 933 Thai stocks (SET + mai), pure deterministic algo scoring, vintage newspaper frontend.

Dashboard at [max.intensivetrader.com](https://max.intensivetrader.com)

## What It Does

- **Unified scan (weekly, Saturday 09:00):** Fetches multi-year financials via thaifin + yfinance, screens 933-stock universe through Niwes 5-5-5-5 hard filters (Yield ≥5% · Streak ≥5y · EPS positive 5y · PE ≤15 · PBV ≤1.5 · Mcap ≥5B), scores quality out of 100, tags signals (NIWES_5555, HIDDEN_VALUE, QUALITY_DIVIDEND, DEEP_VALUE, etc.)
- **3-tier bucket:** PASS / REVIEW / FAIL — REVIEW shows edge cases that need manual decision
- **Exit alerts:** Saves entry baseline on first NIWES_5555 pass; Telegram alert when FILTER_DEGRADATION / VALUATION_BUBBLE / THESIS_CHANGE triggers
- **Vintage newspaper dashboard:** Separate desktop + mobile frontends, editorial typography (Playfair Display + Lora + IBM Plex Serif Thai), oxblood accent
- **On-demand Claude:** One-click deeper analysis per stock via UI (cached 7 days); scan pipeline itself is 100% deterministic (no LLM in loop)

## Tech Stack

- Python + thaifin (primary data) + yfinance (price/dividends)
- Anthropic SDK (on-demand only)
- FastAPI + APScheduler (server + weekly cron)
- Vanilla JS + Chart.js (dashboard, no build step)

## Quickstart

```bash
# Start the server (port 50089)
max-server.bat
# or
py -m uvicorn server.app:app --port 50089
```

Open:
- Desktop: http://localhost:50089/ (auto-redirects touch UA → /m)
- Mobile: http://localhost:50089/m
- Settings: http://localhost:50089/settings (edit schedule + filters + universe)

Auto-scan runs Saturday 09:00 per config; trigger manually:
```bash
curl -X POST http://localhost:50089/api/admin/scan/trigger \
  -H "Authorization: Bearer $MAX_TOKEN"
```

Requires `MAX_TOKEN` in root `.env` for API auth (Bearer token) and `MAX_ANTHROPIC_API_KEY` for on-demand Claude analysis.

## Project Structure

```
scripts/
  fetch_data.py      # multi-year financials + dividends
  update_universe.py # refresh SET/mai universe
  screen_stocks.py   # hard filters + quality score
  scan.py            # screener + case detectors + sector spread + reports
  report_template.py # markdown generator (deterministic)
  telegram_alert.py  # exit signal alerts
server/
  app.py             # FastAPI server, scheduler, SSE, public API
  admin.py           # /api/admin/* namespace (debug + pipeline control)
web/v6/              # vintage newspaper frontend (desktop + mobile)
  desktop/*.html     # desktop shells
  mobile/*.html      # mobile shells
  shared/*.css       # design tokens + base styles
  static/css/        # component extensions
  static/js/pages/   # 12 page modules (desktop + mobile × 6 pages)
reports/             # scan_*.md reports
data/                # snapshots + screener + history.json (gitignored)
user_data.json       # watchlist + blacklist + notes + transactions + simulated portfolio
config.json          # schedule + filters + universe (edited via /settings UI)
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md) — current version **v6.0.0** (vintage newspaper redesign + backend cleanup).
