# Max Mahon v6 — Claude Instructions

## Architecture
- **Agent:** Max Mahon — Thai stock analyst, Niwes Dividend-First style
- **Stack:** Python + thaifin (primary) + yahooquery (supplement) + Anthropic SDK (claude-opus-4-7)
- **AI:** On-demand only — **scan pipeline = pure deterministic algo** (Niwes framework แกะเป็น Python rules: case study detectors + moat tags + 3-tier PASS/REVIEW/FAIL + exit baseline + sector spread). Claude SDK ใช้เฉพาะเมื่อ Karl กดขอ 'วิเคราะห์เพิ่มเติม' ใน UI ต่อหุ้น 1 ตัว (POST `/api/stock/{sym}/analyze`) — auth ผ่าน `MAX_ANTHROPIC_API_KEY`, cache TTL 7 วัน
- **Scoring version:** `niwes-dividend-first-v2` (screener + history v2 schema)
- **Reference files:** `data/case_study_patterns.json` (8 patterns: RETAIL_DEFENSIVE_MOAT/BANK_VALUE_PBV1/HOLDING_CO_HIDDEN/VIETNAM_GROWTH_EXPOSURE[disabled]/ENERGY_CYCLICAL_EXIT + UTILITY_DEFENSIVE/HOSPITAL_AGING/F&B_CONSUMER_BRAND), `data/exit_baselines.json`, `data/history.json` (v2 schema: top_candidates/watchlist_status/entry_thesis/dividend_paid_since_entry/price_snapshot), `user_data.json` (`transactions[]` portfolio tracking)
- **Alerting:** Telegram high-severity exit alerts via `scripts/telegram_alert.py` (uses `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` from root `.env`)
- **Server:** FastAPI on port 50089, Cloudflare Tunnel → max.intensivetrader.com
- **Schedule:** APScheduler ใน server — **2 cron jobs**: (1) อาทิตย์ 09:00 Asia/Bangkok → weekly scan 933 หุ้น, (2) ทุกวัน 19:00 Asia/Bangkok → daily price refresh (watchlist + PASS candidates → `data/price_cache/{sym}.json`)
- **Philosophy:** Dr.Niwes Way: VI ฉบับ ดร.นิเวศน์ — Dividend-First + Hidden Value + 5-5-5-5
- **Goal:** คัดหุ้นสำหรับ DCA 10-20 ปี ปันผลคือผลตอบแทนหลัก + safety จาก PE/PBV ต่ำ + hidden value

### Data Sources
- **Layer 0 (after Plan 02 merge):** SETSMART API — primary source ของ aggregate snapshot (yield, P/E, P/BV, market cap, ROE, ROA, EPS, ratios). 4 endpoints: `eod-price-by-symbol`, `eod-price-by-security-type` (bulk all-CS, ~933 rows/day), `financial-data-and-ratio-by-symbol`, `financial-data-and-ratio` (bulk all-companies). Cache: `data/setsmart_cache/eod_{date}.json` + `financial_{year}_q{N}.json` + `eod_by_symbol_{SYM}_{start}_{end}.json` — refresh ทุกวัน 19:00 ผ่าน daily_price_refresh. **Package coverage:** smoke test BBL พบ history ≥ 2022 (~3 ปี) — thaifin ยังจำเป็นสำหรับ history ก่อน 2022. **Adapter:** `scripts/setsmart_adapter.py`
- **Layer 1 (history):** thaifin — 10-16 ปี financial statements + ratios (ใช้สำหรับ history beyond SETSMART package)
- **Layer 2 (supplement):** yahooquery — realtime price (fallback), 52w range, forward PE, market cap (fallback), **DPS event-by-event** (SETSMART ไม่มี), capex, interest_expense
- **DPS = Source of Truth** — ปันผลต่อหุ้นใช้จาก yahooquery dividends history โดยตรง, yield% override จาก SETSMART (ถ้ามี cache) ไม่งั้น compute จาก DPS/price
- **FCF = OCF - capex** — ไม่ใช้ total investing activities
- **Universe:** 933 stocks (SET 704 + mai 229) via thaifin

### Data Source Invariants

**Rule 0 — SETSMART precedence (after Plan 02 merge):**
- SETSMART = primary สำหรับ realtime aggregate (yield, P/E, P/BV, market cap, EPS, ROE, ROA, D/E) — override snapshot fields ใน fetch_fundamentals + `/api/stock/{sym}` ถ้ามี cache
- thaifin = fallback / history beyond SETSMART package (~3 ปี coverage จาก smoke test)
- yahooquery = DPS events + 52w range + capex + interest_expense (SETSMART ไม่มี)

**Rule 1 — Historical/yearly data:**
- ใช้ **thaifin เท่านั้น** สำหรับ field ที่เป็นต่อปี (close, dividend_yield, mkt_cap, bvps, payout_ratio, pe_ratio, pb_ratio, roe, net_margin, revenue, earnings, etc.)
- thaifin เป็น single source of truth ไม่มี fallback — ถ้า thaifin fail = stock delisted.

**Rule 2 — yahooquery ใช้ได้เฉพาะ:**
- Realtime price (current close)
- 52-week range + 50d/200d moving average
- Raw dividends history (DPS events timestamp + amount — source of truth สำหรับ DPS)
- Capex + Operating Income + Interest Expense per year (thaifin ไม่แยกจาก investing_activities / gross-sga)
- DCA simulator granular monthly price (backtest — ผ่าน `/api/stock/{sym}/price-history?granularity=monthly`)

**Rule 3 — ก่อนเพิ่ม field ใหม่ใน yearly_metrics:**
- Cross-check `_fetch_thaifin` column list ก่อนเสมอ (data_adapter.py บรรทัด 107-146 reads)
- ถ้า thaifin มี column นั้น → expose ตรงๆ ใน yearly_metrics dict (build at line 176-203) ห้ามเรียก yahooquery
- ถ้า thaifin ไม่มี → document reason ใน code comment (เช่น `interest_expense` ไม่มีใน thaifin → yahooquery supplement)

**ตัวอย่าง:**
- ❌ เรียก `yahooquery.Ticker(sym).history(period='10y', interval='1mo')` เพื่อ compute `price_avg` — thaifin มี `close` per year อยู่แล้ว
- ❌ เรียก `yahooquery.Ticker(sym).price[sym]['marketCap']` เพื่อ historical mcap — thaifin มี `mkt_cap` per year
- ✅ เรียก `yahooquery.Ticker(sym).history(period='10y', interval='1mo')` เฉพาะ DCA simulator endpoint
- ✅ เรียก `yahooquery.Ticker(sym).summary_detail[sym]['fiftyTwoWeekHigh']` เพราะ thaifin ไม่มี 52w range

### User Data
- `user_data.json` — watchlist, blacklist, notes, custom lists (จัดการจาก UI ได้)

### Pipeline
- **Unified Scan (ทุกสัปดาห์):** fetch → update_universe → screen → scan (Claude รวม screener + top picks) → scan_*.md
- เก็บประวัติใน `data/history.json` — หน้า History เปิดดูย้อนหลังได้

### Server
- **Port:** 50089
- **URL:** https://max.intensivetrader.com (Cloudflare Tunnel → localhost:50089)
- **Startup:** `max-server.bat` หรือ `py -m uvicorn server.app:app --port 50089`
- **Auth:** `MAX_TOKEN` ใน `.env` (Bearer token สำหรับ API)
- **Frontend:** `web/v6/` → served at `/` (desktop) + `/m` (mobile) — client-side device-detect redirect
- **Public API:** `/api/screener`, `/api/screener/trend`, `/api/stock/{sym}/*`, `/api/watchlist`, `/api/watchlist/enriched`, `/api/watchlist/compare`, `/api/portfolio/builder` (GET, watchlist input → 5-sector × 80/20 + role tags anchor/supporting/tail), `/api/portfolio/builder/explain` (POST, Claude Opus pillar-1 commentary), `/api/settings`, `/api/user`, `/api/status`, `/api/history/v2`, `/api/search` (POST)
- **HTML routes (frontend shells):** `/`, `/watchlist`, `/portfolio`, `/settings`, `/report/{sym}` (desktop) + `/m`, `/m/watchlist`, `/m/portfolio`, `/m/settings`, `/m/report/{sym}` (mobile)
- **Admin API:** `/api/admin/*` — scan trigger, **price-refresh/trigger**, SSE events, pipeline control, reports listing (same `MAX_TOKEN` auth)

### Frontend Layout (v6)
- `web/v6/desktop/index.html` + `mobile/index.html` — shared shells; all routes serve same shell, page module loads by pathname
- `web/v6/shared/{tokens,base,mobile}.css` — design tokens + global styles (served at `/static/v6/shared/`)
- `web/v6/static/css/components.css` — page-level component extensions (incl. PORTFOLIO BUILDER section + role badge classes)
- `web/v6/static/js/{api,components,device,utils}.js` — shared client libs
- `web/v6/static/js/pages/{home,report,watchlist,portfolio,settings}.js` — desktop page modules
- `web/v6/static/js/pages/{home,report,watchlist,portfolio,settings}.mobile.js` — mobile page modules
- Nav: 4-tab (LATEST SCAN / WATCHLIST / จัดพอร์ต / SETTINGS) — `components.js` renders both desktop top nav + mobile bottom nav
- Shell imports page module dynamically by pathname (`pages/{route}.js` or `pages/{route}.mobile.js`)
- Device detect: touch UA → `/m`, desktop UA → `/` (one-time redirect on load, no infinite loop)
- `mockup/` — approved design mockups (e.g. `portfolio-from-watchlist-{desktop,mobile}.html`) — source of truth for component HTML

## Key Files
- `user_data.json` — user preferences (watchlist, blacklist, notes, lists, transactions, simulated_portfolio)
- `config.json` — server config (schedule + filters + universe) — edited via `/settings` UI
- `scripts/data_adapter.py` — thaifin + yahooquery adapter
- `scripts/update_universe.py` — ดึง list หุ้นทั้ง SET/mai
- `scripts/migrate_watchlist.py` — migration จาก watchlist.json เดิม
- `scripts/fetch_data.py` — ดึง multi-year financials + dividends + compute yearly metrics + sanity check
- `scripts/screen_stocks.py` — hard filters + quality score 100 + signal tags
- `scripts/scan.py` — unified scan (screener + top picks) สร้าง scan_*.md report
- `scripts/report_template.py` — markdown generator (deterministic, no LLM)
- `scripts/telegram_alert.py` — exit signal alert
- `scripts/portfolio_builder.py` — Niwes portfolio construction pure functions: input watchlist + screener → output 5-sector × 80/20 portfolio (Banking/Energy/Property/REIT-PFund/Other canonical buckets) + role tags (anchor/supporting/tail) + bench list + sector warnings. Used by `/api/portfolio/builder`. Standalone smoke test in `__main__`.
- `scripts/daily_price_refresh.py` — daily 19:00 price refresh for watchlist + PASS (yahooquery batch → `data/price_cache/{sym}.json`)
- `server/app.py` — FastAPI server (public API, pipeline, scheduler, SSE)
- `server/admin.py` — admin namespace router (legacy/debug endpoints)
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

## Analysis Framework (Claude Opus deep analyze — 4 neutral + 1 Max-to-Art + verdict)

**JSON response schema 6 keys:** `{dividend, hidden, moat, valuation, to_art, verdict}`

**4 neutral sections (dispassionate analysis):**
- **Dividend Sustainability** — ปันผล ≥5%? streak กี่ปี? payout ratio ยั่งยืนไหม? จ่ายจาก cash จริงไม่ใช่หนี้? DPS growth trajectory?
- **Hidden Value Audit** — cross-holdings / land bank / non-core assets ที่ตลาดไม่ pricing in?
- **Business Moat (Thai market)** — structural ยืนนานไหม? daily-use? เทียบคู่แข่ง sector?
- **Valuation Discipline** — PE vs sector median + self 5y? PBV <1? yield ≥5% ตอนนี้ + 5 ปีหน้า?

**Max-to-Art conversational section** — Max (AI persona) คุยกับ 'อาร์ท' (user) เชื่อมโยงหุ้นกับ **เสาหลัก 1 พอร์ตปันผล 100M** context: 3 ย่อหน้า = (a) scenario ตัวเลขจริง (ถ้าใส่ X M ที่ yield Y% = ปันผลปีแรก Z, compound 10y yield-on-cost), (b) ตำแหน่งใน pillar 1 (anchor/supporting/tail + concentration 80/20), (c) Step ถัดไปสำหรับอาร์ท

**Verdict** — BUY / HOLD / SELL + เหตุผล 1 ประโยค (lens = DCA 10-20y + dividend-first + pillar 1 fit)

**Legacy archived:** 3-perspective Buffett/เซียนฮง/Max ในบันทึกเดิม (pre-2026-04-23) — ทิ้งแล้ว ไม่ใช้

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
