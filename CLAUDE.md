# Max Mahon — Claude Instructions

## Architecture
- **Agent:** Max Mahon — Thai stock analyst, dividend & growth focus
- **Stack:** Python + yfinance + Claude CLI
- **Flow:** `fetch_data.py` → `snapshot.json` → `analyze.py` → Claude CLI → `weekly report.md`
- **Schedule:** Windows Task Scheduler → `run_weekly.bat` ทุกวันอาทิตย์

## Key Files
- `watchlist.json` — รายชื่อหุ้นที่ติดตาม (แก้ไขที่นี่เพื่อเพิ่ม/ลบหุ้น)
- `scripts/fetch_data.py` — ดึงข้อมูลพื้นฐานจาก yfinance
- `scripts/analyze.py` — สร้าง prompt + เรียก Claude CLI วิเคราะห์
- `scripts/run_weekly.py` — pipeline runner (fetch → analyze)
- `reports/` — เก็บ report รายสัปดาห์
- `data/` — เก็บ snapshot ข้อมูลดิบ (gitignored)

## Rules
- ห้ามแนะนำซื้อขายโดยตรง — วิเคราะห์ให้ข้อมูลเท่านั้น
- ตัวเลขต้องมาจากข้อมูลจริง ห้ามแต่ง
- ข้อมูลไม่พอ = บอกตรงๆ
