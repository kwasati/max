# Max Mahon v2 — Claude Instructions

## Architecture
- **Agent:** Max Mahon — Thai stock analyst, Buffett + เซียนฮง style
- **Stack:** Python + yfinance + Claude CLI
- **Schedule:** Windows Task Scheduler ทุกอาทิตย์ 09:00
- **Philosophy:** Warren Buffett (business quality + moat + long-term) + เซียนฮง สถาพร (dividend + growth)
- **Goal:** คัดหุ้นสำหรับ DCA 10-20 ปี ปันผลดีและเติบโตสม่ำเสมอ

### Data Sources
- **Primary:** yfinance — 4-5 ปี financial statements + 20+ ปี dividend history
- **Planned:** SETSMART API (SET official) — เมื่อมี API key

### Pipeline
- **Weekly (ทุกสัปดาห์):** fetch multi-year data → Claude วิเคราะห์ 6 ด้าน → weekly report
- **Discovery (สัปดาห์ที่ 2,4):** screen SET 99 ตัว → hard filters → quality score → Claude คัดตัวใหม่

## Key Files
- `watchlist.json` — รายชื่อหุ้นที่ติดตาม
- `data/set_universe.json` — SET universe สำหรับ screening (~99 ตัว)
- `scripts/fetch_data.py` — ดึง multi-year financials + dividends + compute yearly metrics + sanity check
- `scripts/analyze.py` — สร้าง prompt + Claude วิเคราะห์ watchlist (6 ด้าน)
- `scripts/screen_stocks.py` — hard filters + quality score 100 + signal tags
- `scripts/discover.py` — Claude วิเคราะห์ผล screener แนะนำตัวใหม่
- `scripts/run_weekly.py` — pipeline runner (--discover flag)
- `reports/` — weekly + discovery reports
- `data/` — snapshots + screener results (gitignored)

## Hard Filters (ต้องผ่านทุกข้อ)
- ROE เฉลี่ย 4 ปี ≥ 15% (ไม่มีปีต่ำกว่า 12%) — Buffett
- Net Margin เฉลี่ย ≥ 10% (ยกเว้น financial sector)
- D/E ≤ 1.5 (non-financial) / ≤ 10 (financial) — เซียนฮง
- EPS บวกอย่างน้อย 3 จาก 4 ปี
- FCF บวกอย่างน้อย 3 จาก 4 ปี (ยกเว้น financial)
- Market Cap ≥ 5B THB

## Quality Score (100 คะแนน)

| ด้าน | คะแนน | เกณฑ์ |
|---|---|---|
| Profitability | 30 | ROE consistency (15) + Gross Margin (10) + Net Margin trend (5) |
| Growth | 25 | Revenue CAGR (10) + EPS CAGR (10) + Revenue consistency (5) |
| Dividend | 25 | Yield (8) + Payout sustainability (7) + Dividend streak (10) |
| Strength | 20 | D/E level (5) + Interest Coverage (5) + FCF consistency (5) + OCF/NI (5) |

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
- เซียนฮง สถาพร: P/E ≤15, yield ≥4-5%, growth ≥26%, D/E ≤1.0 (FinSpace, Kaohoon)

## Rules
- ห้ามแนะนำซื้อขายโดยตรง — วิเคราะห์ให้ข้อมูลเท่านั้น
- ตัวเลขต้องมาจากข้อมูลจริง ห้ามแต่ง
- ข้อมูลไม่พอ = บอกตรงๆ
- ดู TREND หลายปี ไม่ใช่แค่ snapshot ปีเดียว
