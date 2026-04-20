# Max Mahon v5 — Claude Instructions

## Architecture
- **Agent:** Max Mahon — Thai stock analyst, Niwes Dividend-First style
- **Stack:** Python + thaifin + yfinance (supplement) + Anthropic SDK (claude-opus-4-7)
- **AI:** Weekly pipeline + discovery ใช้ SDK + prompt caching (ไม่ใช่ CLI subprocess อีกต่อไป) — เรียก `anthropic.Anthropic().messages.create()` ตรง, auth ผ่าน `MAX_ANTHROPIC_API_KEY`
- **Server:** FastAPI on port 50089, Cloudflare Tunnel → max.intensivetrader.com
- **Schedule:** APScheduler ใน server (cron เดียว, อาทิตย์ 09:00 เรียก scan)
- **Philosophy:** Dr.Niwes Way: VI ฉบับ ดร.นิเวศน์ — Dividend-First + Hidden Value + 5-5-5-5
- **Goal:** คัดหุ้นสำหรับ DCA 10-20 ปี ปันผลคือผลตอบแทนหลัก + safety จาก PE/PBV ต่ำ + hidden value

### Data Sources
- **Primary:** thaifin — 10-16 ปี financial statements + ratios
- **Supplement:** yfinance — realtime price, 52w range, forward PE, market cap, DPS, capex, interest_expense
- **DPS = Source of Truth** — ปันผลต่อหุ้นใช้จาก yfinance dividends history โดยตรง, yield% คำนวณจาก DPS/price
- **FCF = OCF - capex** — ไม่ใช้ total investing activities
- **Universe:** 933 stocks (SET 704 + mai 229) via thaifin

### User Data
- `user_data.json` — watchlist, blacklist, notes, custom lists (จัดการจาก UI ได้)

### Pipeline
- **Unified Scan (ทุกสัปดาห์):** fetch → update_universe → screen → scan (Claude รวม screener + top picks) → scan_*.md
- เก็บประวัติใน `data/history.json` — หน้า History เปิดดูย้อนหลังได้

### Server
- **Port:** 50089
- **URL:** https://max.intensivetrader.com
- **Startup:** `max-server.bat` หรือ `py -m uvicorn server.app:app --port 50089`
- **Auth:** `MAX_TOKEN` ใน `.env` (Bearer token สำหรับ API)
- **Dashboard:** web/ → serve static ที่ `/`
- **API:** `/api/watchlist`, `/api/screener`, `/api/stock/{symbol}`, `/api/stock/{symbol}/history`, `/api/scan/trigger`, `/api/history`, `/api/reports`, `/api/reports/scan`, `/api/request`, `/api/search` (POST), `/api/events` (SSE)
- **Mobile:** `web/mobile.html` — แยก UI สำหรับมือถือ (mockup, ยังไม่ serve)

## Key Files
- `user_data.json` — user preferences (watchlist, blacklist, notes, lists)
- `scripts/data_adapter.py` — thaifin + yfinance adapter
- `scripts/update_universe.py` — ดึง list หุ้นทั้ง SET/mai
- `scripts/migrate_watchlist.py` — migration จาก watchlist.json เดิม
- `scripts/fetch_data.py` — ดึง multi-year financials + dividends + compute yearly metrics + sanity check
- `scripts/screen_stocks.py` — hard filters + quality score 100 + signal tags
- `scripts/scan.py` — unified scan (screener + top picks) สร้าง scan_*.md report
- `scripts/run_scan.py` — pipeline runner (fetch + universe + screen + scan)
- `server/app.py` — FastAPI server (data API, pipeline control, scheduler, SSE, request analyze)
- `web/index.html` — dashboard HTML
- `web/style.css` — SET.or.th inspired theme
- `web/app.js` — dashboard frontend (stock list, detail panel, pipeline controls)
- `max-server.bat` — startup script
- `reports/` — scan reports (scan_*.md)
- `data/` — snapshots + screener results + history.json (gitignored)

## Hard Filters — Niwes 5-5-5-5 (ต้องผ่านทุกข้อ)
- Dividend Yield ≥ 5% (ใช้ normalized earnings)
- Dividend Streak ≥ 5 ปีติดต่อกัน
- EPS positive 5/5 ปีล่าสุด (ไม่มีปีขาดทุน)
- P/E ≤ 15 (bonus: ≤ 8)
- P/BV ≤ 1.5 (bonus: ≤ 1.0)
- Market Cap ≥ 5B THB

## Quality Score (100 คะแนน — Niwes Dividend-First)

| ด้าน | คะแนน | เกณฑ์ |
|---|---|---|
| Dividend | 50 | Yield (15) + Streak (15) + Payout Sustainability (10) + Dividend Growth (10) |
| Valuation | 25 | P/E (10) + P/BV (10) + EV/EBITDA (5) |
| Cash Flow Strength | 15 | FCF positive (5) + OCF/NI ratio (5) + Interest coverage (5) |
| Hidden Value | 10 | check_hidden_value flag (5) + holding > parent mcap (5) |

### Modifiers
- Valuation grade: A:+5, B:0, C:-5, D:-10, F:-20
- Signals: DIVIDEND_TRAP -20, DATA_WARNING -15
- **Cap: 0-100 เสมอ**

## Signal Tags

| Tag | ความหมาย |
|---|---|
| NIWES_5555 | ผ่านเกณฑ์ 5-5-5-5 ครบทุกข้อ |
| HIDDEN_VALUE | มี holding ที่ตลาดไม่ได้ pricing in (ดู `data/hidden_value_holdings.json`) |
| QUALITY_DIVIDEND | yield ≥5% + payout <70% + streak ≥10 ปี |
| DEEP_VALUE | P/E ≤8 + P/BV ≤1.0 |
| DIVIDEND_TRAP | yield >8% + ROE declining + payout >100% (renamed from YIELD_TRAP) |
| DATA_WARNING | ข้อมูลผิดปกติ (yield >20%, growth >300%) |
| OVERPRICED | จาก valuation_grade F |

## Analysis Framework (6 ด้าน — Niwes-style)
- **Dividend Sustainability** — ปันผล ≥5%? streak กี่ปี? payout ratio ยั่งยืนไหม? จ่ายจาก cash จริงไม่ใช่หนี้?
- **Hidden Value** — มี asset/stake ที่ตลาดไม่ได้คิดเข้าราคาไหม? (เช่น QH ถือ HMPRO, INTUCH ถือ ADVANC)
- **Business Quality** — ขาดไม่ได้ของผู้บริโภค? อยู่ในชีวิตประจำวัน? ผ่านวิกฤติมาหลายรอบ?
- **Valuation Discipline** — P/E ≤15 (bonus ≤8)? P/BV ≤1.5 (bonus ≤1.0)? เทียบ historical ของตัวเองถูก/แพง?
- **DCA Suitability** — เหมาะสะสม 10-20 ปีไหม? (⭐⭐⭐ / ⭐⭐ / ⭐)
- **Macro Risk** — sector concentration + structural Thai (เศรษฐกิจซบ ดอกเบี้ย ค่าเงิน)

## References
- **Niwes research:** `docs/niwes/00-index.md` — master index ของบทความ + quotes verbatim
- **Niwes philosophy:** `docs/niwes/03-philosophy.md` — 8 ปรัชญาหลัก พร้อม source
- **Niwes criteria:** `docs/niwes/04-criteria.md` — เกณฑ์ 5-5-5-5 ละเอียด
- **Archive:** `docs/archive/README.md` — Buffett+เซียนฮง snapshot (pre-Niwes, commit 8c308d6) เก็บไว้สำหรับ A/B

## Rules
- ห้ามแนะนำซื้อขายโดยตรง — วิเคราะห์ให้ข้อมูลเท่านั้น
- ตัวเลขต้องมาจากข้อมูลจริง ห้ามแต่ง
- ข้อมูลไม่พอ = บอกตรงๆ
- ดู TREND หลายปี ไม่ใช่แค่ snapshot ปีเดียว
