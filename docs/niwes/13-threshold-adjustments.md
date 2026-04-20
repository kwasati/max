# Threshold Adjustments — Decision Log

> **Status:** PENDING Karl review after L01-L05
> **Context:** `reports/integration_loop_watchlist_diff_2026-04-20.md` + `reports/integration_loop_karl_todo_2026-04-20.md`
> **Plan:** niwes-06-integration-karl-loop

บันทึกการตัดสินใจ adjust threshold ใน `scripts/screen_stocks.py` — **ห้าม edit script จนกว่า Karl จะ approve ทุก row ด้านล่าง + กรอก "Lesson justification" ให้ครบ**

## Input Data (from Phase 2 pattern analysis)

Universe = 15 stocks (watchlist + notes), 13 DROP, 2 KEEP(low).

| Filter | Fail rate | % of DROP |
|---|---|---|
| P/BV > 1.5 | 12/13 | 92% |
| P/E > 15 | 9/13 | 69% |
| Yield < 5% | 9/13 | 69% |
| EPS <5/5 | 5/13 | 38% |
| Streak <5yr | 4/13 | 31% |
| Market cap <5B | 0/13 | 0% |

## Recommended Adjustments

### Adjustment 1: Dividend Streak — tier-based (add REVIEW tier)

- **Current:** `min_dividend_streak = 5` (hard fail if below)
- **Recommended:** Add tier
  - `>= 5` → PASS
  - `3-4` → REVIEW (tag `TOO_NEW`)
  - `< 3` → FAIL
- **Reasoning:** 4/13 DROP stocks fail streak. DITTO (4yr) + MOSHI (3yr) fail เพราะเป็น IPO ใหม่ ไม่ใช่คุณภาพปันผลแย่. Niwes ไม่ได้ห้ามซื้อ IPO เด็ดขาด — แค่เตือนว่า track record ยังไม่พอ
- **Lesson justification:** _(Karl กรอกหลัง L02+L03 — อ้าง philosophy "รู้จักบริษัท" ให้ชัด)_
- **Status:** PENDING KARL REVIEW
- **Impact if applied:** DITTO, MOSHI จะกลับมา REVIEW (ยังไม่ PASS) แทน DROP ทันที — Karl จะเห็น detail มากขึ้นก่อนตัดสิน

### Adjustment 2: EPS Positive — 4/5 with recent-3-positive gate

- **Current:** `min_eps_positive_years = 5` (5/5 hard required)
- **Recommended:** `4/5` allowed IF 3 ปีล่าสุดเป็นบวกทั้งหมด (post-COVID carve-out)
- **Reasoning:** 5/13 DROP fail EPS. MINT/AOT fail เพราะ COVID 2020-2022 ไม่ใช่ธุรกิจแย่. Niwes ผ่าน 2020 recession เอง — ท่านรู้ดีว่ามี exception ที่ต้องพิจารณา
- **Lesson justification:** _(Karl กรอกหลัง L02 — ดูว่า ดร.นิเวศน์ ผ่าน COVID ยังไง + ท่านมอง earnings cyclical ยังไง)_
- **Status:** PENDING KARL REVIEW
- **Impact if applied:** MINT, AOT, MBK จะได้โอกาสเข้า screener (ถ้า filter อื่นผ่าน — ยังต้องดู yield/P/E/P/BV)

### Adjustment 3: P/BV — DO NOT CHANGE

- **Current:** `max_pbv = 1.5`
- **Recommended:** KEEP (ไม่เปลี่ยน)
- **Reasoning:** 92% DROP rate = filter ทำงานถูก + core ของ Niwes philosophy = "ซื้อทรัพย์สินต่ำกว่ามูลค่า" (มี quote verbatim ใน `docs/niwes/03-philosophy.md`). Relax = ละทิ้ง margin of safety
- **Lesson justification:** _(Karl ยืนยันหลัง L01+L03 — ว่าเข้าใจ margin of safety concept)_
- **Status:** PENDING KARL REVIEW (แค่ confirm KEEP)
- **Impact if applied:** ไม่มี (คงเดิม)

### Adjustment 4: P/E — DO NOT CHANGE

- **Current:** `max_pe = 15`, `bonus_pe = 8`
- **Recommended:** KEEP
- **Reasoning:** Niwes standard จาก 5-5-5-5 framework direct quote. Relax = accept expensive stocks → conflict กับ Dividend-First
- **Lesson justification:** _(Karl ยืนยันหลัง L03)_
- **Status:** PENDING KARL REVIEW (confirm KEEP)

### Adjustment 5: Dividend Yield — DO NOT CHANGE

- **Current:** `min_dividend_yield = 5.0`
- **Recommended:** KEEP
- **Reasoning:** ≥5% คือหัวใจของ Dividend-First. Relax จะเปิดทางหุ้น growth ซึ่งละทิ้ง thesis ทั้งหมด
- **Lesson justification:** _(Karl ยืนยันหลัง L01 — Dividend-First ทำไมถึงเป็น 5% ไม่ใช่ 3%)_
- **Status:** PENDING KARL REVIEW (confirm KEEP)

## Karl Approval Checklist

- [ ] เรียน L01 จบ + เขียน ตกผลึก
- [ ] เรียน L02 จบ + เขียน ตกผลึก
- [ ] เรียน L03 จบ + เขียน ตกผลึก
- [ ] เรียน L04 จบ + เขียน ตกผลึก
- [ ] เรียน L05 จบ + เขียน ตกผลึก
- [ ] กรอก "Lesson justification" ทั้ง 5 adjustment ด้านบน
- [ ] ตัดสิน APPROVE / REJECT / MODIFY แต่ละ adjustment
- [ ] (ถ้า APPROVE) update `scripts/screen_stocks.py` ตาม
- [ ] Rerun curated scan → diff vs baseline → บันทึกผลด้านล่าง

## Post-Adjustment Results (TO BE FILLED AFTER KARL APPROVES + RERUN)

### Before/After Comparison

| Metric | Before (2026-04-20) | After (TBD) | Delta |
|---|---|---|---|
| Total scanned | 35 | TBD | TBD |
| Passed filter | 11 | TBD | TBD |
| Filtered out | 24 | TBD | TBD |

### Top 10 Changes

_(to be filled after rerun)_

### Watchlist Impact

_(to be filled after rerun — ดูว่า CBG/DITTO/MOSHI เปลี่ยนสถานะไหม)_

## Related

- Pattern analysis → `reports/integration_loop_watchlist_diff_2026-04-20.md`
- Karl TODO → `reports/integration_loop_karl_todo_2026-04-20.md`
- Baseline scan (before any adjust) → `reports/integration_loop_scan_2026-04-20.md`
- Niwes philosophy → `docs/niwes/03-philosophy.md`
- Niwes 5-5-5-5 criteria → `docs/niwes/04-criteria.md`
