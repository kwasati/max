# Max Mahon Changelog

## v6.3.0 — 2026-04-25 · Portfolio Builder จาก Watchlist (Niwes role-based)

**Feature ใหม่ทั้งฟีเจอร์ — เอาหุ้นใน watchlist มาจัดพอร์ตแบบนิเวศน์ ตอบโจทย์ "หุ้นในมือกลายเป็นพอร์ตได้ยังไง"** ของเก่า portfolio builder ที่ archive ไปวันก่อน (capital-based, ขอเงินก้อน) ถูกแทนด้วยแนวคิดใหม่: ไม่ต้องใส่เงิน ใช้หุ้นใน watchlist เป็น input แสดงเป็น % พร้อมระบุบทบาทของแต่ละตัว (anchor/supporting/tail) + เหตุผลภาษาคน

### New — หน้าจัดพอร์ต `/portfolio` + `/m/portfolio`
- **Input:** หุ้นทุกตัวที่อยู่ใน watchlist (auto-load) — ไม่ต้องกรอกเงิน
- **Output:** พอร์ต 5 ตัว 5 sector (Banking / Energy / Property / REIT-PFund / Other) ตามแนวนิเวศน์ 80/20 concentration (40/35/12/8/5)
- **Role badges สี:** Anchor (sage strong) สำหรับ rank 1-2 / Supporting (silver) rank 3 / Tail (stone) rank 4-5 — ดู 3 วิรู้ตัวไหนสำคัญ
- **Reason ต่อหุ้น:** อธิบายเป็นภาษาคนว่าทำไมตัวนี้ถึงเป็น anchor/supporting/tail (signals + yield + PE/PBV)
- **Pin override:** ปักหมุดหุ้นที่อยากบังคับใส่พอร์ต — ชนะ score แม้ตัวอื่นใน sector เดียวกันจะ score สูงกว่า
- **Bench list:** หุ้นใน watchlist ที่ไม่ติดพอร์ต พร้อมเหตุผลที่ไม่เลือก (sector ซ้ำ / score รอง)
- **Sector warning:** แจ้งเมื่อ watchlist ขาด sector หลัก (เช่น Banking ว่าง → แนะนำ BBL/SCB/KBANK)
- **Claude Opus pillar-1 commentary:** ปุ่มเดียวให้แมกซ์อธิบายภาพรวมพอร์ต — เชื่อมกับเสาหลัก 1 (พอร์ตปันผล 100M) + scenario ตัวเลขจริง + step ถัดไป (cached 7 วัน)

### Changed — Watchlist row คลิกได้
- กดที่ symbol+name ใน watchlist → ไปหน้า full report ของหุ้นนั้นเลย (ทั้ง desktop + mobile) — ก่อนหน้านี้ต้องไป search หาหรือคลิกผ่านที่อื่น

### Changed — Nav 3-tab → 4-tab
- เพิ่มเมนู "จัดพอร์ต" ระหว่าง WATCHLIST กับ SETTINGS ทั้ง desktop top nav + mobile bottom nav
- Mobile bottom-nav: 3-col grid → 4-col + mappedActive map รับ key portfolio (fix active state)

### Architecture
- `scripts/portfolio_builder.py` (ใหม่) — pure functions ไม่มี I/O: sector canonical mapper (5 buckets) + Niwes composite score + role tagger + bench builder + sector warnings + orchestrator
- `server/app.py` — เพิ่ม `GET /api/portfolio/builder` (build) + `POST /api/portfolio/builder/explain` (Opus 4-7 + cache 7d) + `GET /portfolio` + `GET /m/portfolio` (HTML routes reuse existing shell)
- `web/v6/static/js/pages/portfolio.{js,mobile.js}` (ใหม่) — page modules ตาม approved mockups
- `web/v6/shared/tokens.css` — เพิ่ม role badge tokens (anchor/supporting/tail × bg/fg) ทั้ง light + dark
- `web/v6/static/css/components.css` — เพิ่ม PORTFOLIO BUILDER section + mobile overrides

### Notes — ของเก่าที่ลบไปแล้ว
- `/api/portfolio/{pnl,simulated,transactions}` + `/api/simulate/*` (capital-based portfolio + DCA simulator) — archived 2026-04-25 ก่อนหน้า feature นี้ (ดู `_archive/portfolio-simulator-builder-2026-04-25/`)
- เมนูเก่า "Portfolio" + "Simulator" ใน nav 5-tab → ทิ้ง รวมเหลือ 4-tab

---

## v6.2.0 — 2026-04-23 · Portfolio Builder + UI Modernize (Robinhood Sage) + Stock Detail Polish

**Mega-release วันเดียวจบ ~55 tasks** — feature ใหม่ 'จัดพอร์ตสไตล์แมกซ์' + retire vintage newspaper UI แทนด้วย Robinhood muted sage palette + Claude Opus prompt rewrite + daily price refresh scheduler + UI polish (Δ score + inline analysis + price as-of)

### New — Feature 'จัดพอร์ตสไตล์แมกซ์' (Niwes portfolio builder)
- `scripts/portfolio_builder.py` — pure functions: `niwes_composite_score()` + `group_by_sector()` + `top_per_sector()` + `allocate_80_20()` + `apply_overrides()` + `build_portfolio()`
- `POST /api/portfolio/builder` — รับ `capital` + `pins` + `excludes` → return 5-stock portfolio (5 SET sectors, 80/20 weighted 40/35/12/8/5)
- New page `/portfolio-builder` + `/m/portfolio-builder` — desktop + mobile
- UI ตาม approved mockups: `mockup/portfolio-builder-robinhood.html` (mobile) + `portfolio-builder-robinhood-desktop.html`

### New — Daily Price Refresh Scheduler
- `scripts/daily_price_refresh.py` — batch yahooquery fetch สำหรับ watchlist + PASS candidates
- APScheduler cron 19:00 Asia/Bangkok (หลังตลาดปิด 17:00 + 2h buffer)
- Writes `data/price_cache/{sym}.json` with `price` + `fetched_at` ISO timestamp
- Admin endpoint `POST /api/admin/price-refresh/trigger` สำหรับ manual trigger

### Changed — UI redesign (retire vintage newspaper)
- **Typography swap:** Playfair Display + Lora (serif editorial) → **Inter** (sans-serif modern) ทั้งระบบ
- **Masthead chrome removed:** 'VOL. VI · NO. 17 / THURSDAY · APRIL 23 / The Dividend Review / BUILDER EDITION' → modern app header (logo mark + brand + nav tabs + settings icon)
- **Section kickers ทิ้ง:** '№ XX · PAGE NAME' + display headings ขนาด 5.2rem editorial
- **Color system:** Robinhood muted sage — 2-layer tokens (primitive sage/rose/wheat/lavender/slate-blue + semantic bg/fg/border/accent/rank/shadow) — proper light + dark mode support
- **Mobile bottom-nav:** 5 tabs (Home/Screen/Portfolio/จัดพอร์ต/Settings)
- Redesign 6 pages (home/report/watchlist/portfolio/simulator/settings) desktop + mobile

### Changed — Claude Opus analysis prompt (Niwes + Pillar-1 context)
- Ditch legacy 3-perspective (Buffett/เซียนฮง/Max) → **Niwes 4 neutral analysis + 1 Max-to-Art conversational + verdict BUY/HOLD/SELL**
- **New JSON schema 6 keys:** `{dividend, hidden, moat, valuation, to_art, verdict}`
- Max persona injected: AI stock analyst คุยกับ 'อาร์ท' (user) แบบเพื่อน ไม่ formal — ใช้สรรพนาม 'อาร์ท' หรือ 'คุณ' (ห้าม กู/มึง)
- **Pillar-1 context** ฝังใน prompt: **เสาหลัก 1 พอร์ตปันผล 100M, passive income target 10M/ปี, DCA 10-20y, ดร.นิเวศน์ 5-5-5-5 framework กระจาย 5 sector × 80/20**
- `to_art` section = 3 ย่อหน้า (scenario ตัวเลขจริง + ตำแหน่งใน pillar 1 + Step ถัดไปสำหรับอาร์ท)

### Changed — Inline analysis UX
- ปุ่ม 'ขอวิเคราะห์เพิ่มเติม' + ผล = inline ที่เดียวกัน (ไม่ navigate/jump)
- Click → spinner ที่ตำแหน่งเดิม → POST → render 6 parts (verdict badge + 4 sections + Max-to-Art sage-tint) ที่ตำแหน่งเดียว
- Cache hit (GET analysis) → auto-render, ไม่ต้องรอกด
- Verdict badge: BUY=sage / HOLD=dim / SELL=rose
- Icons: 💵 💎 🏛️ ⚖️ 💬

### Changed — Price + as-of date display
- Home cards: `฿43.50 · ณ 23 เม.ย. 68` (Thai Buddhist year short date)
- Report hero: big 36px mono price + `ราคาวันที่ 23 เม.ย. 68`
- Backend: `price_as_of` field ใน `/api/stock/{sym}` response — priority: price_cache > screener date > now

### Fixed — Δ Score display bug
- `/api/watchlist/{sym}/exit-status` back-fill `entry_score` จาก latest screener ถ้า baseline เก่าไม่มี field นี้
- Compute `delta_score = current_score - entry_score` → แสดงใน UI เป็นตัวเลข (ไม่ใช่ '—')

### Fixed — UI latent bugs (production review 2026-04-23)
- Dividend Streak + EPS Positive 5/5 แสดง '—' — `_normalize_stock()` promote `aggregates.dividend_streak` + EPS positive count → flat fields `dividend_streak_years` + `eps_positive_count` ที่ UI อ่าน
- Bottom-nav ทับ content — `padding-bottom: calc(88px + env(safe-area-inset-bottom))` ใน 3 CSS files (fix iPhone home indicator 34px inset overlap)

### Fixed — Screener correctness (QC report 2026-04-23)
- **C1** `compute_payout_sustainability` dead bucket — `dividends_paid` ว่างตลอดจาก thaifin → สูตรใหม่ `payout_ratio = dps/eps` จาก dividend_history + diluted_eps ที่มีอยู่แล้ว (CPALL sustainable years **0 → 11**)
- **C2** `detect_case_study_tags` ไม่ enforce `country` + `roe_3yr_avg_min` → VIETNAM_GROWTH_EXPOSURE false-positive Thai tech; fix + mark `"disabled": true` ใน JSON
- **H1** Remove dead `near_miss` parameter จาก `hard_filter` (2-tuple return)
- **H3** Preserve `debt_to_equity` null semantics (ไม่ coerce null → 0)
- **M2** Align docstring `compute_score_streak` กับ code (up OR stayed, ไม่ใช่ up only)

### References
- Research: `docs/research-thai-stock-data-sources.md`
- Mockups: `mockup/portfolio-builder-robinhood*.html`, `mockup/stock-detail-polish.html`

---

## v6.1.0 — 2026-04-23 · Data Source Refactor — thaifin Hard-Primary + yahooquery Supplement

**Refactor ชั้น data layer** — thaifin เป็น single source of truth สำหรับทุกอย่างที่มันมี (fundamentals 10-16 ปี, sector SET official taxonomy, ev_per_ebit_da, cash, roa, yoy growth ครบ) — swap yfinance → yahooquery เฉพาะจุดที่ thaifin ไม่มี (realtime price, raw DPS events, capex/interest_expense per year)

- ตัด yfinance ออกจาก code ทั้งหมด (scripts + server) — ไม่มี `import yfinance` เหลือเลย
- swap supplement เป็น yahooquery (API เสถียรกว่า, IS 13-15 rows vs yfinance 4-5 ปี)
- sector ใช้ thaifin SET official taxonomy เท่านั้น (Commerce, Banking, Property Development, Energy & Utilities, ICT ฯลฯ) — ไม่ใช่ GICS ของฝรั่ง
- expose thaifin columns ใหม่ 8 ตัว: `cash`, `roa_year`, `revenue_yoy`, `net_profit_yoy`, `eps_yoy`, `cash_cycle`, `financing_activities`, `ev_per_ebit_da`
- ใช้ thaifin `ev_per_ebit_da` ตรงๆ ใน quality_score แทน compute เอง
- ลบ `_fetch_yfinance_legacy` fallback — thaifin = single source of truth ถ้า fail = delisted (คืน `{delisted: True}`)
- Reference: `docs/research-thai-stock-data-sources.md`

---

## v6.0.0 — 2026-04-22 · Vintage Newspaper Frontend + Backend Cleanup

**Major redesign** — Legacy SPA frontend (`web/`) ถอดออก แทนด้วย newspaper editorial theme แยก desktop + mobile ชัดเจน (cream paper + ink + oxblood accent). Backend ทำความสะอาด: legacy endpoints ย้ายไป admin namespace, monitor cluster archive, config schema ตรงกับ Niwes 5-5-5-5 ล้วน.

### Breaking
- Legacy SPA frontend (`web/app.js` / `index.html` / `style.css` / `mobile.html`) ถอดออก — แทนด้วย `web/v6/` vintage newspaper theme
- Monitor cluster (`scripts/news_monitor.py`, `diff_monitor.py`, `alert_monitor.py`, `backtest_runner.py`) ถอดออก — ไม่ใช้แล้ว
- `scripts/run_scan.py` ถอด — pipeline ฝังใน server แล้วทุกอย่าง (trigger ผ่าน `/api/admin/scan/trigger` + APScheduler)
- Config schema ถอด legacy Buffett-era fields (`score_threshold`, `moat_mode` etc.) — เหลือ `schedule` + `filters` (Niwes 5-5-5-5) + `universe`
- 3 endpoints removed: PUT `/api/user/lists/{name}`, DELETE `/api/user/lists/{name}`, GET `/api/exit_check/{sym}` (exit check merged into screener output)
- 8 legacy admin/debug endpoints moved to `/api/admin/*` namespace (scan trigger, events, pipeline control, report listing, etc.)

### New — Frontend (vintage newspaper theme)
- `web/v6/desktop/*.html` + `web/v6/mobile/*.html` — separate shell files, not responsive overflow
- `web/v6/shared/` — tokens.css / base.css / mobile.css (paper/ink/accent design tokens, Playfair Display + Lora + IBM Plex Serif Thai + JetBrains Mono fonts)
- `web/v6/static/js/pages/*.js` — 12 page modules (home + report + watchlist + portfolio + simulator + settings × desktop + mobile)
- 5 pages: Home (masthead + trend + top-3) · Full Report · Watchlist (+ compare up to 3) · Portfolio (real + simulated) · Simulator (3 tabs) · Settings
- Simulator Tab 3 — Portfolio Backtest + TDEX benchmark overlay (3-line chart)
- DCA simulator Tab 1 single stock + Tab 2 portfolio basket
- Compare modal up to 3 stocks (side-by-side metrics)
- Client-side device detect + redirect (`/static/v6/js/device.js`) — touch UA → `/m`, desktop UA → `/`

### New — Backend (6 endpoints)
- `GET /api/watchlist/enriched` — server-side join (positions + screener candidates + prices)
- `GET /api/watchlist/compare?syms=A,B,C` — up to 3 symbols side-by-side
- `GET /api/portfolio/simulated` + `PUT /api/portfolio/simulated` — simulated portfolio allocation CRUD
- `POST /api/simulate/dca-portfolio` — basket DCA simulation
- `POST /api/simulate/portfolio-backtest` — backtest with TDEX benchmark
- `GET /api/screener/trend?weeks=12` — weekly screener count trend (new vs. carried vs. dropped)

### Modified (additive fields, no breaking changes)
- `GET /api/screener` — adds `score_delta` + `previous_score` + `score_streak_weeks` per candidate
- `GET /api/stock/{sym}/exit-status` — adds `narrative` + `trigger_rules[]` + `entry_context`
- `GET /api/portfolio/pnl` — adds `dividends_paid_total` + `yoc_pct` + `weight_pct` per position + `cash_reserve` in total
- `GET /api/user` — passes `cash_reserve` + `simulated_portfolio`
- `GET/POST /api/settings` — adds validation + `next_run_at` (from APScheduler) + `last_saved_at`
- 4 more minor additive fields (see Plan 02 commits)

### Admin namespace
- `/api/admin/scan/trigger` · `/api/admin/events` · `/api/admin/pipeline/*` · `/api/admin/reports/*` · `/api/admin/auth`
- Auth: same `MAX_TOKEN` Bearer, separate router mounted at `/api/admin`

### Framework (unchanged from v5.0.0)
- Niwes scoring version `niwes-dividend-first-v2` (already shipped in v5)
- 3-tier PASS/REVIEW/FAIL bucketing
- Exit baseline + structural risk score
- 8 case study patterns in `data/case_study_patterns.json`

### Deploy
- Single FastAPI server on port 50089 (unchanged)
- Cloudflare Tunnel routes `max.intensivetrader.com` → localhost:50089 (tunnel config server-side at CF dashboard)
- APScheduler Saturday 09:00 cron (configurable in `/settings`)

---

## v5.0.0 — 2026-04-21 · Niwes Algo Framework + Data Source Refactor

**Major refactor** — Max เปลี่ยนจาก Claude-in-loop analyst เป็น pure deterministic algo framework. Scan pipeline ไม่พึ่ง LLM ทุกรอบ (reproducible, ถูก, audit ได้). Claude เหลือแค่ on-demand เมื่อกดขอ 'วิเคราะห์เพิ่มเติม' ใน UI.

### สมอง Niwes เป็น Python rules
- **8 case study patterns** ใน `data/case_study_patterns.json` — CPALL (RETAIL_DEFENSIVE_MOAT), TCAP (BANK_VALUE_PBV1), QH (HOLDING_CO_HIDDEN), GULF/RATCH (UTILITY_DEFENSIVE), BDMS (HOSPITAL_AGING), CBG/TU (F&B_CONSUMER_BRAND) + OR (ENERGY_CYCLICAL_EXIT anti) + FPT (VIETNAM_GROWTH_EXPOSURE disabled)
- **3 moat tags** — BRAND_MOAT / STRUCTURAL_MOAT / GOVT_LOCKIN (sector + margin + streak heuristics)
- **Exclude petroleum** จาก utility/structural moat (PTT/PTTEP/BCP/TOP/ESSO/SPRC/IRPC/OR) — SET จัดกลุ่มเดียวกันแต่ธุรกิจต่าง

### 3-tier Hard Filter (PASS/REVIEW/FAIL)
- Dividend streak 3-tier — ≥5 ปี PASS / 3-4 REVIEW / <3 FAIL
- EPS 3-tier — 5/5 PASS / 4/5 + last 3 positive REVIEW (COVID exception) / else FAIL
- Yield/PE/PBV/Mcap ยัง hard — ไม่ผ่านคือ FAIL ทันที
- REVIEW bucket = หุ้นก้ำกึ่งที่ Karl ต้องตัดสินใจเอง (UI tab 'รีวิว')

### Exit baseline + Telegram alert
- `data/exit_baselines.json` — save snapshot ตอนผ่าน NIWES_5555 ครั้งแรก (pe/pbv/dy baseline)
- `detect_exit_signal()` — check FILTER_DEGRADATION / VALUATION_BUBBLE / THESIS_CHANGE_FLAG
- Telegram alert — ส่งแจ้งเตือนถ้ามี high-severity trigger ใน watchlist (ผ่าน `scripts/telegram_alert.py`)

### History v2 + portfolio tracking
- history.json schema v2 — เพิ่ม `top_candidates[]` / `watchlist_status[]` / `entry_thesis{}` / `dividend_paid_since_entry{}` / `price_snapshot{}` ต่อ scan
- `user_data.transactions[]` — BUY/SELL tracking
- CRUD + P&L endpoints: POST/DELETE/GET `/api/portfolio/transactions`, GET `/api/portfolio/pnl` (compute cost basis + unrealized pnl)

### Report Template (deterministic, no LLM)
- `scripts/report_template.py` — markdown generator 7 sections (frontmatter / header / Top Picks / Sector Spread / Review / New / Exit Alerts / Watch Out / footer)
- Sector Spread flag `⚠ over-concentrated` ถ้า single sector > 40%
- Scoring version bumped: `niwes-dividend-first-v1` → `niwes-dividend-first-v2`

### On-demand Claude (not scan pipeline)
- `GET /api/stock/{sym}/analysis` — cache-only (TTL 7 วัน, 404 if no cache)
- `POST /api/stock/{sym}/analyze` — trigger Claude + write cache (Karl กดขอใน UI)
- UI: replace auto-load with button + stale_cache confirm dialog

### UI extensions (web/)
- **Score breakdown** stacked bar (4 segments: dividend 50/valuation 25/cashflow 15/hidden 10)
- **Price history chart** (yearly, 10-15 points)
- **Yield trend** — rolling 5y avg
- **Dividend history table** — year / DPS / YoY% / Payout%
- **Watchlist exit status** section — baseline + triggers + severity summary
- **Review tab** — render review_candidates
- Case study + moat tags display ใน stock table

### Data Source Stability (bug fix)
- **Problem:** build แรกกู vาง yfinance ดึง historical yearly data (price_avg via `yf.Ticker().history(period='10y')`) — yfinance หุ้นไทย > 3-5 ปีไม่ครบ = log spam "possibly delisted"
- **Fix:** ใช้ thaifin เป็นหลัก (ตาม CLAUDE.md) — expose 5 orphan fields (`close`, `dividend_yield`, `mkt_cap`, `bvps`, `payout_ratio`) per year ใน yearly_metrics
- `/api/stock/{sym}/price-history` — default thaifin yearly, `?granularity=monthly` fallback yfinance (DCA use case)
- `_holding_mcap()` — ลอง thaifin ก่อน fallback yfinance
- CLAUDE.md: เพิ่ม **"Data Source Invariants"** section (Rule 1-3 + don't/do examples) — ป้องกันพลาดซ้ำ

### Post-fix bugs
- Bug: scan.py `sorted(glob('screener_*.json'))` lexicographic — picked curated file (c > 2 lexically) → regex-filter `screener_YYYY-MM-DD.json`
- Bug: report_template field name — `m.get('dy')` → `m.get('dividend_yield')` (actual screener uses `dividend_yield`)

### Integration test
- `scripts/integration_test.py` — curated 10 symbols + benchmark <300s
- Runtime ~20s · 3/5 tag assertions pass (data-driven, not bug)

### Scan results (first post-refactor scan_num=3)
- 933 stocks → **54 candidates PASS** + 3 REVIEW + 874 filtered
- Sector spread: Property 17% / Banking 15% / Finance 13% / Energy 13% — กระจายดี
- Case study hits: QH HOLDING_CO_HIDDEN, TU F&B_CONSUMER_BRAND + RETAIL_MOAT, RATCH/EGCO UTILITY_DEFENSIVE, 4 BANK_VALUE_PBV1
- Dividend champions: 11 ตัว streak ≥ 25 ปี (EGCO 26, METCO 26, ALUCON 26, LANNA 26, PTTEP 26, KYE 26, SUC 25, STANLY 25, KKP 25, SCCC 25, HTC 25)

---

## v4.0.0 — 2026-04-19 · UX + Flow Rework

**Breaking change** — ยุบ weekly + discovery เป็น scan เดียว, wipe watchlist seed, restructure UI

### Flow changes
- ยกเลิก `weekly` + `discovery` mode → **เหลือ `scan` mode เดียว** (screen 933 → quality score → Claude วิเคราะห์ 6 ด้าน top candidates + watchlist)
- 1 รายงานต่อ scan — 4 sections: Top Picks / Watchlist Update / New In Batch / Watch Out
- Scheduler: ไม่สลับ odd/even weeks แล้ว — cron เดียว เรียก scan ทุกอาทิตย์
- `POST /api/scan/trigger` สำหรับ manual scan

### New scripts
- `scripts/scan.py` — unified scan with Anthropic SDK + Opus 4.7 + prompt caching
- `scripts/run_scan.py` — pipeline runner (fetch + universe-refresh-if-stale + screen + scan)

### Data model
- `data/history.json` — scan history index (num, date, counts, summary, report)
- `data/watchlist_events.jsonl` — watchlist add/remove event log
- Wipe `user_data.json` watchlist ([] empty) — backup ที่ `user_data.backup.json`

### New UI — Home Feed
- หน้าแรกเป็น feed แยก (lede + at-a-glance + latest report card)
- Header บางลงใน tab อื่น — ไม่โผล่ thesis ทุกหน้า
- Report card clickable → full report viewer

### New UI — Watchlist (real)
- ปุ่ม ★ บน card + detail panel ทำงานจริง persist ไป `user_data.json`
- Watchlist tab แสดงทุกตัวที่ follow — ผ่าน+หลุดรอบ พร้อมเหตุผลที่หลุด
- Empty state เมื่อยังไม่มีหุ้นติดตาม

### New UI — Stock List
- ลบ "ค้นพบใหม่" tab — merge เข้า "ผ่านเกณฑ์" ด้วย NEW IN BATCH badge (gold)
- Badge ปรากฏบน card ที่ไม่เคยผ่านเกณฑ์ใน scan ก่อนหน้า
- Renamed "ไม่ผ่าน" → "หลุดรอบ"

### New UI — History + Report Viewer
- เมนู ประวัติ แยก — list scan ย้อนหลัง (date, summary, stats)
- Report viewer: markdown → editorial HTML (§ H2 prefix, pick boxes, hard shadow)
- Back button กลับหน้าก่อน (home หรือ history)

### New UI — Stock Detail
- Tab row: ภาพรวม / ประวัติ / เปรียบเทียบ
- ประวัติ tab: SVG score timeline + event log (first_pass / failed / passed / signal / watchlist_add / watchlist_remove)

### Real-time
- SSE listener → running banner amber + dot pulse ขณะ scan
- Completion toast → tap = go to report
- Auto-refresh home + history + list หลัง scan เสร็จ

### Mobile
- Rewrite mobile.html editorial style (Fraunces serif + IBM Plex Sans Thai + JetBrains Mono)
- Cream palette (#f4f0e6) + forest/amber/burgundy accents + hard shadows
- 5-tab bottom nav: หน้าแรก / หุ้น / ติดตาม / ประวัติ / ตั้งค่า

### Removed
- `scripts/analyze.py`, `scripts/discover.py`, `scripts/run_weekly.py`, `run_weekly.bat`
- `/api/run/{action}`, `/api/reports/{report_type}` endpoints
- `pipeline.odd_weeks` + `pipeline.even_weeks` config fields

---

## v3.3.1 — 2026-04-19 · Pipeline SDK Migration

Weekly + discovery pipeline ย้ายจาก Claude CLI subprocess → Anthropic Python SDK เพื่อแก้ปัญหา pipeline ล่มทุกรอบจาก CLI timeout 300s

### Migration
- `scripts/analyze.py` + `scripts/discover.py` เลิกใช้ `claude.cmd` subprocess ทั้งคู่
- เปลี่ยนมาเรียก `anthropic.Anthropic().messages.create()` ตรง (pattern เดียวกับ `server/app.py`)
- Model: `claude-sonnet-4-6` → **`claude-opus-4-7`** ทั้ง 2 script ให้ consistent กับ on-demand analysis endpoint
- Auth: ใช้ `MAX_ANTHROPIC_API_KEY` จาก `C:/WORKSPACE/.env`

### Prompt caching
- แยก prompt เป็น 2 layer: **system** (framework + rules + analysis instructions — static) + **user** (watchlist/screener data — dynamic)
- ใส่ `cache_control: {type: ephemeral}` บน system block → cache hit ทุกครั้งที่รัน pipeline ภายใน 5 นาที ลด input cost + latency

### Config
- `max_tokens=16000` เพียงพอสำหรับ markdown report ยาว (เดิม CLI ไม่มี cap)
- `timeout=900.0` (15 นาที) — CLI เดิม hard 300s ไม่พอสำหรับ watchlist 18 ตัว × multi-year data

### Dependencies
- `anthropic` + `python-dotenv` เพิ่มเป็น import ตรงใน 2 script (ก่อนหน้ามีแค่ใน server)

---

## v3.3.0 — 2026-04-18 · Editorial UI Port

Complete visual overhaul of the web dashboard from generic card-grid style to editorial magazine aesthetic.

### Design
- Typography stack: **Fraunces** (serif display) + **IBM Plex Sans Thai** (body) + **JetBrains Mono** (tabular numbers)
- Palette: paper (`#f4f0e6`) / ink (`#121420`) / forest (`#1d5b4f`) / amber (`#b45309`) / burgundy (`#a02143`) / navy (`#1f3f76`) / gold (`#c89b2c`)
- Newspaper masthead with unified sticky wrapper (vol/issue/date · title · scanned/passed)
- Editorial section heads: `№ 01 / WATCHLIST`, `№ 02 / DISCOVERY`
- Drop cap on lede body prose (3.5em Fraunces forest)

### Components
- Lede section (kicker + headline with forest→amber gradient em + Fraunces body + mono byline) replaces 4-card summary row
- Stats panel sidebar (5 rows: passed / avg score / avg yield / discoveries / warnings) with .pos/.warn class toggles (no inline `style.color`)
- Watchlist as editorial table: `table.watch` with score bar + 6 tag variants (Compounder / Dividend King / Cash Cow / Contrarian / Yield Trap / Turnaround) + loading/empty/error state rows
- Deep dive detail panel: 2-col layout (prose + pull-quote + `#analysis-section` left, fact-sheet 12 rows + 3 mini-charts right). Chart.js re-themed with forest/amber/navy palette
- Discovery strip: separate section shown only on `discoveries` tab, 3-col card grid, paper-2 background
- Global signal legend block: visible on every tab, 4 color-coded definitions

### Secondary pages
- Requests / DCA / Settings rethemed with unified editorial card (paper-3 + rule border + shadow offset)
- Preset buttons color-mapped: dividend=amber, growth=forest, value=burgundy, quality=navy
- DCA toggle slider with forest-on / line-strong-off state
- Inputs: paper bg, line-strong border, JetBrains mono, forest focus ring
- Save button as dark ink pill (mono uppercase)

### Responsive
- 1024px: lede + dive stack 1-col, disc-grid 2-col, legend-block 2-col
- 720px: masthead 1-col center, sec-nav horizontal scroll, watch table hides cols 6-10, disc-grid 1-col, legend 1-col, footer stacks

### Preservation
- All functionality preserved: API bindings, Chart.js, scheduler, SSE events, `#analysis-section` async AI analysis flow, DCA compute, filter logic, settings save, search presets/custom filters
- Semantic IDs kept (#header-meta, #tabs, #stock-list, #summary-row, #detail, #discoveries-list, #analysis-section, all page-panel IDs and form field IDs)
- Legacy color token aliases retained (`--green`/`--blue`/`--red`/`--yellow`/`--orange`/`--purple` → new palette) for any remaining inline style references

### Footer
- Newspaper-style footer with branding, schedule info, copyright, disclaimer

---

## 2026-04-14 — Pipeline Crash Fix + Console ไม่กระตุก

**แก้ไข:**
- **คัดกรอง 933 ตัวพังทั้ง pipeline** — หุ้นบางตัวไม่มีข้อมูลการเติบโต แล้วเอาค่าว่างไปเทียบกับตัวเลข ทำให้ script พัง ตอนคำนวณราคาเหมาะสม → แก้ให้ใช้ 0 แทนค่าว่าง
- **หุ้นดึงข้อมูลไม่ได้ ข้ามไปตัวถัดไปแทนพัง** — เดิมถ้าข้อมูลเป็นค่าว่างจะ error ตอนตรวจสอบ → เพิ่มการดักก่อน
- **สรุปผลแสดงจำนวนหุ้นที่ error** — เดิมไม่รู้ว่ามีกี่ตัวที่มีปัญหา

**ปรับปรุง:**
- **หน้าจอ server ไม่กระตุกอีกแล้ว** — เดิม clear จอทั้งหมดทุก 2 วินาที ทำให้กระตุกและลบข้อความที่คลุมไว้ → เปลี่ยนเป็นเขียนทับทีละบรรทัดแทน

---

## 2026-04-13 — Sort Fix + Request Detail + Header Update

- **แก้ Sort ไม่ทำงาน** — ข้อมูล yield/avg5y อยู่ใน metrics.* แต่ sort อ่านจาก top-level ที่เป็น null ทุกตัว → fallback ไป metrics แล้ว
- **แก้ Sort dropdown ตำแหน่งผิด** — ย้าย toolbar ออกจาก flex container ที่จัดแนวนอน → อยู่บนสุดของ grid แล้ว
- **แก้ Sort state ไม่ sync** — browser จำค่า dropdown จากครั้งก่อน แต่ state ยังเป็น score → sync ก่อน render แรก
- **แก้คำขอกดดูไม่ได้** — เพิ่ม selectStock() ที่สลับกลับ tab หลัก + โหลดรายละเอียด
- **หุ้นไม่ผ่าน** — ข้อมูลยังไม่มีเพราะ screener เก่า ต้องรันคัดกรองใหม่ (ปรับข้อความแจ้ง)
- **เปลี่ยน Scoring label** → "Buffett Hong Quality"

## 2026-04-13 — Dashboard Redesign + Pipeline Overhaul + Mobile Mockup

**Dashboard ใหม่:**
- Card ไม่ซ้อนกันแล้ว — คะแนนอยู่ซ้าย ปุ่มจัดการโชว์ตอนแตะเท่านั้น
- กดหุ้นแล้ว slide แบ่งซ้ายขวา ปิดก็ slide กลับ (ไม่ใช่ 2 ช่องตลอดเวลา)
- แต่ละหน้า (DCA, คำขอ, ตั้งค่า) มี layout เฉพาะ ไม่ยัด layout หุ้นไปทุกที่
- หุ้นที่ไม่ผ่านกดดูรายละเอียดได้แล้ว + มีป้ายบอกว่าไม่ผ่านเพราะอะไร
- เพิ่ม dropdown เรียงลำดับ — คะแนน/yield/P-E/D-E

**ข้อมูลแม่นขึ้น:**
- ปันผลต่อหุ้น (DPS) เป็นข้อมูลหลักแล้ว ไม่ใช่คำนวณกลับจาก yield × ราคา
- เงินสดอิสระ (FCF) คำนวณถูก — ใช้แค่ค่าใช้จ่ายลงทุน ไม่รวม M&A/ขายทรัพย์สิน
- ตัวครอบคลุมดอกเบี้ยมีค่าจริงแล้ว (เดิมเป็น 0 ตลอด)

**คะแนนแม่นขึ้น:**
- หุ้น ROE สูงจริง (>50%) ไม่โดนลงโทษแล้ว (เดิมโดนหัก 15 แต้ม)
- ปันผลเท่าเดิมไม่นับว่าเพิ่ม (เดิมนับ)
- ถ้าไม่มีข้อมูลดอกเบี้ย กระจายคะแนนไปด้านอื่นแทนที่จะให้ 0
- AI เห็นน้ำหนักที่ถูกแล้ว (ปันผล 35 ไม่ใช่ 25)

**ค้นหาหุ้น:**
- กดปุ่ม "ปันผลดี" "เติบโต" "ราคาถูก" "คุณภาพสูง" ค้นได้เลย
- กำหนดเงื่อนไขเองได้ (เลือกตัวเลข + เปรียบเทียบ + ค่า)

**Server เสถียรขึ้น:**
- ดึงข้อมูลไม่ค้างทั้งระบบแล้ว
- pipeline ไม่เขียนซ้ำ 2 ที่
- ข้อมูลเก่าถูกลบอัตโนมัติหลัง 24 ชม.
- timeout เพิ่มจาก 10 นาที เป็น 30 นาที
- เมนู mobile ไม่ลอยตามนิ้วแล้ว

**Mobile mockup:**
- ออกแบบหน้าจอมือถือแยกต่างหาก (ยังเป็น mockup)
- Bottom nav 4 tabs + card list แนวตั้ง + slide detail เต็มจอ

## 2026-04-13 — v3 Overhaul: ข้อมูลใหม่ + ควบคุมเอง + คะแนนปันผลนำ + UI ใหม่

**ข้อมูล:**
- เปลี่ยนแหล่งข้อมูลหลักเป็น thaifin — ได้งบการเงินย้อน 10-16 ปี แม่นกว่าเดิมมาก
- ขยายจำนวนหุ้นที่ scan จาก 99 ตัว เป็น 933 ตัว (ทั้ง SET + mai)
- ระบบคำขอทำงานได้จริง — พิมพ์แค่ชื่อหุ้น ไม่ต้องใส่ .BK + แสดงผลถูกต้อง

**ควบคุมเอง:**
- เพิ่ม/ลบหุ้นที่ติดตามจากหน้าจอได้ ไม่ต้องแก้ไฟล์
- ซ่อนหุ้นที่ไม่สนใจ (blacklist) ออกจากผลลัพธ์
- จดบันทึกในแต่ละหุ้นได้
- สร้างรายการเองได้ (เช่น "เก็บแล้ว", "จับตา")
- ดูหุ้นที่ไม่ผ่านเกณฑ์ได้ — พร้อมเหตุผลว่าทำไมไม่ผ่าน

**คะแนน:**
- ปรับน้ำหนักใหม่ ปันผลนำ 35 คะแนน (จาก 25) — ตรงสไตล์ DCA passive income
- เพิ่มคะแนน "ปันผลเพิ่มต่อเนื่อง" (ใหม่ 8 คะแนน)
- ราคามีผลต่อคะแนนแล้ว — แพงมากลดหนัก ถูกได้ bonus
- หุ้นมีข้อมูลผิดปกติถูกลดคะแนนจริง (เดิมแค่ติด tag)
- คะแนนไม่ทะลุ 100 อีกแล้ว
- หุ้นที่เกือบผ่านเกณฑ์ไม่ตกรอบ แต่ถูกลดคะแนนแทน (soft zone)

**หน้าจอ:**
- ใช้ได้ทั้งมือถือและ desktop — layout ปรับตามหน้าจอ
- กราฟ 3 แบบ: ปันผลต่อหุ้น, ROE, รายได้ vs กำไร
- วงกลมคะแนน + ป้ายสัญญาณสี + เกรดราคา
- Buffett checklist ดูง่าย
- ตารางตัวเลขรายปี scroll ได้

## 2026-04-12 — Overhaul + สูตร Buffett ตรงหลักการ + ตั้งค่าได้

**แก้ไข:**
- กดปุ่มวิเคราะห์แล้วพังเพราะหา Claude ไม่เจอ — แก้แล้ว ทำงานได้ทุกเครื่อง
- จำลอง DCA เห็นปันผลเป็น 0 ทั้งที่หุ้นจ่ายจริง — แก้แล้ว ดึงจากประวัติจ่ายจริง
- ผลตอบแทนต่อปีเป็นพันเปอร์เซ็นต์เมื่อย้อนหลังสั้น — จำกัดขั้นต่ำแล้ว
- ต้นปีหุ้นดีถูกตัดเพราะยังไม่จ่ายปันผลปีนี้ — ไม่นับปีปัจจุบันอีกแล้ว
- หุ้นธนาคารถูกตัดทิ้งทั้ง sector เพราะใช้เกณฑ์เดียวกับหุ้นอื่น — แยกเกณฑ์แล้ว
- อัตราส่วนหนี้แสดงผิด 100 เท่าบนหน้าจอ — แก้แล้ว
- การเติบโตของกำไรดูดีเกินจริง (ข้ามปีขาดทุน) — จับได้แล้ว
- 2 งานวิเคราะห์รันชนกันได้ — ใส่ตัวล็อกแล้ว

**เพิ่มใหม่:**
- หน้าจอเปลี่ยนเป็น card grid สวยขึ้น + ภาษาไทยทั้งหมด
- ระบบประเมินราคา (A-F) — จับหุ้นแพงเกินจริงได้ น้ำหนักเน้น PE เทียบกลุ่ม
- ปุ่มวิเคราะห์รวบเป็นปุ่มเดียว ซ่อนปุ่มย่อยไว้ + แสดงตารางเวลาอัตโนมัติ
- ตั้งค่า schedule ผ่าน UI ได้ — เลือกวัน/เวลา, เปิด/ปิด, เลือก pipeline
- ปรับเกณฑ์คัดกรองหุ้นได้เอง (ROE, Net Margin, D/E, Market Cap)
- DCA ปรับค่าได้ — แยกย้อนหลัง/คาดการณ์ + ใส่ % การโตเอง
- ใช้ SG&A ให้คะแนนความมี moat (ข้อมูลมีอยู่แล้วแต่ไม่ได้ใช้)
- ค่าปันผลเฉลี่ย 5 ปีไม่หายอีก (คำนวณจากประวัติจ่ายจริงถ้าข้อมูลขาด)

**เบื้องหลัง:**
- สูตรปรับให้ตรงหลักการ Buffett จริง + เหมาะตลาดไทย
- เอกสารอัพเดต — เซียนฮงไม่มีเกณฑ์ตัวเลขชัด (เป็นการสังเกตพอร์ต) + ข้อจำกัด yfinance

## 2026-04-12 — v2 Server + Dashboard + Buffett/เซียนฮง

- อัพเกรดการวิเคราะห์จาก snapshot ปีเดียว → ดึง 5 ปี financials + 20+ ปี dividends
- Scoring ใหม่ 100 คะแนน 4 ด้าน (Profitability/Growth/Dividend/Strength) + Hard Filters แบบ Buffett
- Signal tags ใหม่ (COMPOUNDER, CASH_COW, DATA_WARNING สำหรับข้อมูลผิดปกติ)
- สร้าง FastAPI server — ดูข้อมูลหุ้นผ่าน web ได้จากทุกที่
- Dashboard แสดง Buffett Checklist + เซียนฮง Checklist + YoY table + กราฟปันผล + DCA verdict
- ทุก metric กดขยายดูคำอธิบายได้ (อธิบายแบบคนธรรมดาฟังรู้เรื่อง)
- Pipeline control จาก browser — กดปุ่ม Fetch/Screen/Full Pipeline ได้เลย
- Request analyze — สั่งวิเคราะห์หุ้นตัวไหนก็ได้ที่ไม่อยู่ใน watchlist
- Scheduler ใน server (แทน Task Scheduler) — อาทิตย์ 09:00 สลับ weekly/discovery
- Cloudflare Tunnel → max.intensivetrader.com เข้าจากภายนอกได้

## 2026-04-11 — วันเกิด Max Mahon

- สร้างระบบทั้งหมดตั้งแต่ 0 — ดึงข้อมูลหุ้นไทย วิเคราะห์ด้วย Claude ทุกสัปดาห์
- Watchlist 12 ตัว — PTT, ADVANC, CPALL, SCB, GULF, BDMS, MINT, AOT, HMPRO, SAWAD, LH, TISCO
- ระบบคัดหุ้น scan ตลาด ~100 ตัว ให้คะแนนตามปันผล ราคา การเติบโต คุณภาพ
- Signal tags ฉลาด — จับ yield trap, หาของถูก (contrarian), จับตัวฟื้นตัว (turnaround), เจอ dividend king
- แก้ bug ข้อมูลหุ้นที่มาไม่ consistent + กรองหุ้นธนาคารผิด + ข้อมูลเพี้ยน
- เพิ่มกองทุนอสังหา (REITs) ใน universe — จุดบอดเดิมที่ขาดหายไป
- ตั้ง schedule รันอัตโนมัติทุกอาทิตย์เช้า
- ทดสอบจริง report แรกออกมาครบถ้วน วิเคราะห์หุ้น 12 ตัวได้เป๊ะ
