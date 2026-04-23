# Max Mahon

Thai stock analyst agent — Niwes Dividend-First framework. Weekly automated scan of 933 Thai stocks (SET + mai), pure deterministic algo scoring, vintage newspaper frontend.

Dashboard at [max.intensivetrader.com](https://max.intensivetrader.com)

## What It Does

- **Unified scan (weekly, Saturday 09:00):** Fetches multi-year financials via thaifin + yahooquery, screens 933-stock universe through Niwes 5-5-5-5 hard filters (Yield ≥5% · Streak ≥5y · EPS positive 5y · PE ≤15 · PBV ≤1.5 · Mcap ≥5B), scores quality out of 100, tags signals (NIWES_5555, HIDDEN_VALUE, QUALITY_DIVIDEND, DEEP_VALUE, etc.)
- **3-tier bucket:** PASS / REVIEW / FAIL — REVIEW shows edge cases that need manual decision
- **Exit alerts:** Saves entry baseline on first NIWES_5555 pass; Telegram alert when FILTER_DEGRADATION / VALUATION_BUBBLE / THESIS_CHANGE triggers
- **Vintage newspaper dashboard:** Separate desktop + mobile frontends, editorial typography (Playfair Display + Lora + IBM Plex Serif Thai), oxblood accent
- **On-demand Claude:** One-click deeper analysis per stock via UI (cached 7 days); scan pipeline itself is 100% deterministic (no LLM in loop)

## หลักการทำงานของ algo Max Mahon (ภาษาคน)

ลืม syntax ไปก่อน — เล่าเป็น flow ของ Max ที่ **เลียนแบบวิธีคิด ดร.นิเวศน์** กับหุ้น 933 ตัวทุกสัปดาห์:

### ขั้น 1 — ดึงข้อมูลหุ้น
Max เอารายชื่อหุ้นไทยทั้งตลาด (SET 704 + mai 229 = 933 ตัว) แล้วไล่ดึงข้อมูล **ย้อนหลัง 16 ปี** ของแต่ละตัวออกมา: รายได้, กำไร, EPS, เงินปันผล, มูลค่าบริษัท, ROE, หนี้สิน, กระแสเงินสด ฯลฯ

แหล่งข้อมูล = thaifin เป็นหลัก + yahooquery สำหรับราคาปัจจุบัน/ปันผลรายครั้ง

### ขั้น 2 — คัดรอบแรก "5-5-5-5" (เกณฑ์ไม่ผ่าน = คัดทิ้งเลย)
เช็คว่าหุ้นผ่านกฎ ดร.นิเวศน์ 6 ข้อหรือเปล่า:

1. **มาร์เก็ตแคป ≥ 5,000 ล้าน** — ไม่ถึง = ตัดทิ้งทันที (กันหุ้นเล็กเสี่ยงสภาพคล่อง)
2. **ปันผล streak** — จ่ายต่อเนื่องกี่ปี? ≥5 ปี = ผ่าน, 3-4 ปี = ต้องทบทวน, <3 ปี = ตัด
3. **EPS บวก 5/5 ปีล่าสุด** — กำไรไม่ขาดทุนเลย 5 ปี (exception: 4/5 ปี + 3 ปีหลังบวก = ทบทวน ไม่ตัด)
4. **ปันผลปัจจุบัน ≥ 5%**
5. **P/E ≤ 15** (ไม่แพงเกิน)
6. **P/BV ≤ 1.5** (ราคาไม่สูงเกินมูลค่าบัญชี)

หุ้นจะถูกแยกเป็น 3 ถัง:
- **PASS** = ผ่านทุกข้อ → เข้าขั้น 3 ไปคิดคะแนน
- **REVIEW** = ผ่านแต่ streak หรือ EPS ไม่เต็ม → เก็บรายชื่อไว้ให้ user ตัดสินเอง
- **FAIL** = ตกข้อใดข้อหนึ่ง → เก็บเหตุผลลง "filtered out"

> **กฎ ดร.นิเวศน์ 5-5-5-5:** ปันผล ≥ 5%, 5 ปีที่แล้วก็ได้ ≥ 5%, กระจาย ≥ 5 อุตสาหกรรม, ถือ ≥ 5 ปี

### ขั้น 3 — ให้คะแนนคุณภาพ 100 เต็ม (เฉพาะกลุ่ม PASS)

4 ด้าน:

| ด้าน | คะแนนเต็ม | เกณฑ์ |
|---|---|---|
| **ปันผลเป็นหัวใจ** | 50 | yield สูง (15) + streak นาน (15) + จ่ายยั่งยืน (10) + ปันผลโต (10) |
| **ราคาสมเหตุสมผล** | 25 | P/E ถูก (10) + P/BV ถูก (10) + EV/EBITDA ถูก (5) |
| **กระแสเงินสดแข็งแรง** | 15 | FCF บวก (5) + OCF ครอบกำไร (5) + ดอกเบี้ยรับได้สบาย (5) |
| **Hidden Value** | 10 | ถือหุ้นบริษัทอื่นที่ตลาดไม่ price in (เช่น QH ถือ HMPRO) |

### ขั้น 4 — แปะป้าย (signal tags)

ระบบอ่านหุ้นแต่ละตัวแล้วแปะป้าย:

- **NIWES_5555** — ผ่าน 5-5-5-5 ครบทุกข้อแบบเต็มๆ (ถือเป็น entry trigger → บันทึก baseline P/E ไว้ใช้ตรวจ bubble)
- **HIDDEN_VALUE** — มีทรัพย์สินซ่อน (จาก `hidden_value_holdings.json` ที่เตรียมไว้)
- **QUALITY_DIVIDEND** — yield≥5% + payout<70% + streak≥10 ปี
- **DEEP_VALUE** — P/E≤8 + P/BV≤1
- **DIVIDEND_TRAP** — yield>8% + ROE ลด 3 ปีติด + payout>100% = ปันผลดูสวยแต่เริ่มรั่ว **-20 คะแนน**
- **DATA_WARNING** — ข้อมูลบางจุดผิดปกติ (yield>15%, ROE>150%, etc.) **-15 คะแนน**

**เพิ่ม case study tags จาก patterns file** (8 แพทเทิร์น): RETAIL_DEFENSIVE_MOAT (CPALL), BANK_VALUE_PBV1 (TCAP), HOLDING_CO_HIDDEN (QH), UTILITY_DEFENSIVE, HOSPITAL_AGING, F&B_CONSUMER_BRAND, ENERGY_CYCLICAL_EXIT, VIETNAM_GROWTH_EXPOSURE

**เพิ่ม moat tags** (deterministic): BRAND_MOAT (consumer + margin>20% + streak≥10), STRUCTURAL_MOAT (utility/transport mcap≥50B), GOVT_LOCKIN (government service)

### ขั้น 5 — Valuation Grade (เกรด A-F)

คิดทีหลังจาก loop ใหญ่จบ (เพราะต้องรู้ค่า median ก่อน):

- **PEG ratio** เทียบ P/E vs EPS CAGR (20 คะแนน)
- **P/E vs sector median** — ถูกกว่า median 20% = เต็ม (35 คะแนน)
- **ปันผลปัจจุบัน vs เฉลี่ย 5 ปี** — สูงกว่าเฉลี่ย = หุ้นถูกลง (30 คะแนน)
- **ตำแหน่งราคา 52w range** — ใกล้ low = ถูก (15 คะแนน)

รวม 100 แล้วเกรด: ≥80=A, ≥60=B, ≥40=C, ≥20=D, <20=F

**เกรดกลับไปปรับคะแนน quality:** A→+5, B→0, C→-5, D→-10, F→-20 (+ แปะ OVERPRICED ถ้า F)

### ขั้น 6 — Exit Signal (สำหรับหุ้น watchlist เท่านั้น)

ถ้าหุ้นใน watchlist Max คอย monitor 3 เงื่อนไข:

1. **FILTER_DEGRADATION** — เคย PASS 5-5-5-5 ตอนนี้ไม่ผ่านแล้ว (fundamental แย่ลง)
2. **VALUATION_BUBBLE** — P/E ปัจจุบัน > 3x ของ P/E ตอน baseline (ฟองสบู่ราคา)
3. **THESIS_CHANGE_FLAG** — user flag เองจากข่าว (manual)

severity = high → Telegram alert (flag only, Max **ไม่เคยสั่งขายอัตโนมัติ** — user ตัดสิน)

### ขั้น 7 — เรียงลำดับ + บันทึก

- sort candidates descending by score (สูงสุดก่อน)
- score_streak: เทียบกับ screener เก่า 20 สัปดาห์ย้อนหลัง ดูว่าคะแนน trend ขึ้นต่อเนื่องกี่สัปดาห์
- save → `data/screener_{date}.json` + รายงาน markdown `reports/scan_{date}.md`
- append history v2 entry → `data/history.json`
- Telegram alert ถ้ามี high-severity exit trigger

### ภาพรวม

**ปรัชญา:** pure deterministic — ไม่มี LLM ตัดสินแทน user, ไม่มี ML black box. ทุก tag + คะแนน **reproducible 100%** ถ้าข้อมูลเดิม. Claude SDK ใช้เฉพาะตอน user กด "วิเคราะห์เพิ่ม" ต่อตัว (cache 7 วัน)

**จุดแข็ง:** โค้ดสะอาด — แยก fetch / screen / scan / report / history เป็น modules ชัด, sanity check ครบ (DATA_WARNING, DIVIDEND_TRAP), ใช้ Niwes framework เต็มตัว

## Tech Stack

- Python + thaifin (primary data) + yahooquery (price/dividends)
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
