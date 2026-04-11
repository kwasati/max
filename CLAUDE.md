# Max Mahon — Claude Instructions

## Architecture
- **Agent:** Max Mahon — Thai stock analyst, dividend & growth focus
- **Stack:** Python + yfinance + Claude CLI
- **Schedule:** Windows Task Scheduler ทุกอาทิตย์ 09:00

### Pipeline
- **Weekly (ทุกสัปดาห์):** fetch data → Claude วิเคราะห์ → weekly report
- **Discovery (สัปดาห์ที่ 2,4):** scan SET ~100 ตัว → score + signal tags → Claude คัดตัวใหม่ → discovery report

## Key Files
- `watchlist.json` — รายชื่อหุ้นที่ติดตาม
- `data/set_universe.json` — SET universe สำหรับ screening (~90 ตัว)
- `scripts/fetch_data.py` — ดึงข้อมูลพื้นฐานจาก yfinance
- `scripts/analyze.py` — สร้าง prompt + Claude วิเคราะห์ watchlist
- `scripts/screen_stocks.py` — scan + score หุ้นทั้ง universe
- `scripts/discover.py` — Claude วิเคราะห์ผล screener แนะนำตัวใหม่
- `scripts/run_weekly.py` — pipeline runner (--discover flag)
- `reports/` — weekly + discovery reports
- `data/` — snapshots + screener results (gitignored)

## Scoring (screen_stocks.py)
- Dividend quality: yield, payout ratio, free cashflow (max 40 pts)
- Valuation: P/E, forward P/E improvement (max 25 pts)
- Growth: revenue + earnings growth (max 20 pts), earnings crash penalty (-10 pts)
- Quality: ROE, D/E ratio (max 15 pts), sector-aware D/E for banks

### Signal Tags
- YIELD_TRAP: yield > 8% + negative earnings/payout > 100% → score -15
- CONTRARIAN: price near 52w low + yield > 3% + stable earnings → score +15
- TURNAROUND: forward PE < trailing PE * 0.7 + revenue growing → score +10
- DIVIDEND_KING: yield > 5% + payout 30-70%

## Rules
- ห้ามแนะนำซื้อขายโดยตรง — วิเคราะห์ให้ข้อมูลเท่านั้น
- ตัวเลขต้องมาจากข้อมูลจริง ห้ามแต่ง
- ข้อมูลไม่พอ = บอกตรงๆ
