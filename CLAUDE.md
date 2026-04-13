# Max Mahon v3 — Claude Instructions

## Architecture
- **Agent:** Max Mahon — Thai stock analyst, Dividend-First + Buffett Quality style
- **Stack:** Python + thaifin + yfinance (supplement) + Claude CLI
- **Server:** FastAPI on port 50089, Cloudflare Tunnel → max.intensivetrader.com
- **Schedule:** APScheduler ใน server (อาทิตย์ 09:00, สลับ weekly/discovery)
- **Philosophy:** Dividend-First (passive income DCA) + Warren Buffett (quality) + เซียนฮง สถาพร (value growth)
- **Goal:** คัดหุ้นสำหรับ DCA 10-20 ปี ปันผลดีเป็นหลัก เติบโตสม่ำเสมอ

### Data Sources
- **Primary:** thaifin — 10-16 ปี financial statements + ratios
- **Supplement:** yfinance — realtime price, 52w range, forward PE, market cap, DPS, capex, interest_expense
- **DPS = Source of Truth** — ปันผลต่อหุ้นใช้จาก yfinance dividends history โดยตรง, yield% คำนวณจาก DPS/price
- **FCF = OCF - capex** — ไม่ใช้ total investing activities
- **Universe:** 933 stocks (SET 704 + mai 229) via thaifin

### User Data
- `user_data.json` — watchlist, blacklist, notes, custom lists (จัดการจาก UI ได้)

### Pipeline
- **Weekly (ทุกสัปดาห์):** fetch multi-year data → Claude วิเคราะห์ 6 ด้าน → weekly report
- **Discovery (สัปดาห์ที่ 2,4):** screen SET+mai 933 ตัว → hard filters → quality score → Claude คัดตัวใหม่

### Server
- **Port:** 50089
- **URL:** https://max.intensivetrader.com
- **Startup:** `max-server.bat` หรือ `py -m uvicorn server.app:app --port 50089`
- **Auth:** `MAX_TOKEN` ใน `.env` (Bearer token สำหรับ API)
- **Dashboard:** web/ → serve static ที่ `/`
- **API:** `/api/watchlist`, `/api/screener`, `/api/stock/{symbol}`, `/api/run/{action}`, `/api/request`, `/api/search` (POST), `/api/events` (SSE)
- **Mobile:** `web/mobile.html` — แยก UI สำหรับมือถือ (mockup, ยังไม่ serve)

## Key Files
- `user_data.json` — user preferences (watchlist, blacklist, notes, lists)
- `scripts/data_adapter.py` — thaifin + yfinance adapter
- `scripts/update_universe.py` — ดึง list หุ้นทั้ง SET/mai
- `scripts/migrate_watchlist.py` — migration จาก watchlist.json เดิม
- `scripts/fetch_data.py` — ดึง multi-year financials + dividends + compute yearly metrics + sanity check
- `scripts/analyze.py` — สร้าง prompt + Claude วิเคราะห์ watchlist (6 ด้าน)
- `scripts/screen_stocks.py` — hard filters + quality score 100 + signal tags
- `scripts/discover.py` — Claude วิเคราะห์ผล screener แนะนำตัวใหม่
- `scripts/run_weekly.py` — pipeline runner (--discover flag)
- `server/app.py` — FastAPI server (data API, pipeline control, scheduler, SSE, request analyze)
- `web/index.html` — dashboard HTML
- `web/style.css` — SET.or.th inspired theme
- `web/app.js` — dashboard frontend (stock list, detail panel, pipeline controls)
- `max-server.bat` — startup script
- `reports/` — weekly + discovery reports
- `data/` — snapshots + screener results (gitignored)

## Hard Filters (ต้องผ่านทุกข้อ)
- ROE เฉลี่ย ≥ 15% non-financial / ≥ 10% financial (ไม่มีปีต่ำกว่า 12% / 8%) — Buffett
- Net Margin เฉลี่ย ≥ 10% (ยกเว้น financial sector)
- D/E ≤ 1.5 (non-financial) / ≤ 10 (financial) — เซียนฮง
- EPS บวกอย่างน้อย 3 จาก 4 ปี
- FCF บวกอย่างน้อย 3 จาก 4 ปี (ยกเว้น financial)
- Market Cap ≥ 5B THB

## Quality Score (100 คะแนน, Dividend-First)

| ด้าน | คะแนน | เกณฑ์ |
|---|---|---|
| Dividend | 35 | Yield (10) + Streak (10) + Payout (7) + Dividend Growth (8) |
| Profitability | 25 | ROE consistency (12) + Margins (8) + Trend (5) |
| Growth | 20 | Revenue CAGR (8) + EPS CAGR (8) + Consistency (4) |
| Strength | 20 | D/E (5) + Interest Coverage (5) + FCF (5) + OCF/NI (5) |

### Modifiers
- Valuation: A:+5, B:0, C:-5, D:-10, F:-20
- Signals: COMPOUNDER +5, CONTRARIAN +5, YIELD_TRAP -20, DATA_WARNING -15
- Soft zone: near-miss ROE/NM -5 pts
- **Cap: 0-100 เสมอ**

## Signal Tags

| Tag | ความหมาย |
|---|---|
| COMPOUNDER | ROE ≥20% ทุกปี + rev CAGR ≥10% + payout <60% — Buffett dream stock |
| CASH_COW | FCF yield >8% + payout <70% + D/E <0.5 |
| DIVIDEND_KING | yield ≥5% + payout 30-70% + streak ≥5 ปี |
| CONTRARIAN | ราคาใกล้ 52w low + quality score ≥50 |
| TURNAROUND | forward PE < trailing PE * 0.7 + revenue CAGR บวก |
| YIELD_TRAP | yield >8% + ROE ลดทุกปี + payout >100% |
| DATA_WARNING | ข้อมูลผิดปกติ (yield >20%, growth >300%) |

## Analysis Framework (6 ด้าน)
- **Business Quality** — moat, competitive position
- **Financial Health** — debt, cash flow, interest coverage
- **Growth Consistency** — trend หลายปี ไม่ใช่แค่ปีเดียว
- **Dividend Sustainability** — จ่ายจาก cash จริงหรือหนี้, track record
- **Valuation** — P/E vs quality, เทียบ historical
- **DCA Suitability** — เหมาะสะสมระยะยาว 10-20 ปีไหม

## References
- Buffett criteria: ROE ≥15% sustained, Gross Margin >40%, D/E <0.5, FCF positive (Validea, TradingCenter)
- เซียนฮง สถาพร: เน้น cash flow quality, ความสม่ำเสมอ, หนี้น้อย (เกณฑ์ตัวเลขเช่น P/E ≤ 15 มาจากการวิเคราะห์พอร์ตโดย secondary sources ไม่ใช่เกณฑ์ที่แกประกาศ)

## Rules
- ห้ามแนะนำซื้อขายโดยตรง — วิเคราะห์ให้ข้อมูลเท่านั้น
- ตัวเลขต้องมาจากข้อมูลจริง ห้ามแต่ง
- ข้อมูลไม่พอ = บอกตรงๆ
- ดู TREND หลายปี ไม่ใช่แค่ snapshot ปีเดียว
