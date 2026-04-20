---
agent: Max Mahon v5
date: 2026-04-20
type: integration_loop_karl_todo
plan: niwes-06-integration-karl-loop
status: pending_karl_action
---

# Karl TODO — Before Phase 4 (Threshold Adjustment Decision)

Phase 3 ของ integration loop ต้องใช้มนุษย์. Agent ได้รวบรวมข้อมูล pattern analysis + recommendations ไว้แล้ว แต่การตัดสินใจ adjust threshold **ต้องผ่าน Karl** ที่เข้าใจ Niwes philosophy จริงๆ.

## Why This Matters

จาก Phase 2 pattern analysis:
- 87% ของรายการหุ้นสนใจ Karl (watchlist + notes) FAIL Niwes filter
- Karl watchlist (CBG, DITTO, MOSHI) ทั้งหมด 100% fail
- Gap ใหญ่: Karl ชอบ growth story (CPALL, consumer) vs Niwes = dividend + cheap book

**ห้ามบิด threshold โดยไม่เข้าใจ philosophy** — ถ้า Karl แค่ยืด P/BV ให้ CPALL ผ่าน = ทำลาย framework

## Required Reading — L01 ถึง L05

Karl ต้อง run: `/learn niwes`

### Lesson Map (จาก learn skill)

| Lesson | Title | Why Required |
|---|---|---|
| L01 | Biography + Philosophy | รู้ว่า ดร.นิเวศน์ เป็นใคร + 8 ปรัชญาหลัก |
| L02 | Investment Journey | ดูว่า ดร.นิเวศน์ เริ่มจากอะไร พัฒนา framework มายังไง |
| L03 | Criteria 5-5-5-5 | เข้าใจเกณฑ์แต่ละข้อมาจากไหน + ทำไม strict |
| L04 | Hidden Value | เข้าใจ concept "ใครไม่เห็นแต่ผมเห็น" → อธิบาย QH, INTUCH, TCAP |
| L05 | Case CPALL | ตัวอย่าง stock ที่เคย fit Niwes แต่ตอนนี้แพงเกิน — เรียนจากกรณีจริง |

### Rationale

- **Before adjusting thresholds, Karl needs to understand Niwes philosophy to make correct data-driven decisions (not arbitrary)**
- ถ้า Karl ปรับ threshold โดยไม่รู้ว่าทำไมมันถึงเป็นแบบนั้น → risk drift framework
- L01-L03 ให้พื้นฐาน, L04 explain signal HIDDEN_VALUE, L05 คุยเรื่องหุ้นที่ Karl ชอบ (CPALL) แต่ fail

### Acceptance (ของ Phase 3)

Karl ต้องมี notebook files:
- `projects/Investic/notebook/niwes/lesson-01-biography-philosophy.md` (done already)
- `projects/Investic/notebook/niwes/lesson-02-investment-journey.md` (TODO)
- `projects/Investic/notebook/niwes/lesson-03-criteria-5555.md` (TODO)
- `projects/Investic/notebook/niwes/lesson-04-hidden-value.md` (TODO)
- `projects/Investic/notebook/niwes/lesson-05-case-cpall.md` (TODO)

แต่ละไฟล์ต้องมี:
- 'ตกผลึก' section (Karl เขียนเองว่าเรียนรู้อะไร)
- Personal note (เชื่อมกับ experience/watchlist ของ Karl)

## Pattern Analysis Summary (context for Karl)

สรุปจาก Phase 2 → `reports/integration_loop_watchlist_diff_2026-04-20.md`

**Top 3 Failure Causes (DROP stocks, n=13):**
1. **P/BV > 1.5** — 92% — หุ้น Karl แพงเทียบ book
2. **P/E > 15** — 69% — re-rating ของ consumer/growth
3. **Yield < 5%** — 69% — growth stocks จ่ายปันผลน้อย

**Near-Miss (fail แค่ 1 filter):**
- SCB — streak 4yr vs ≥5
- HMPRO — P/BV 3.13 vs ≤1.5
- SAWAD — yield 3.2% vs ≥5%
- TISCO — P/BV 2.10 vs ≤1.5

## Suggested Threshold Adjustments (REQUIRES KARL APPROVAL)

จาก Phase 2 — **ยังไม่ apply ทั้งหมด** รอ Karl เรียนจบ + approve:

### Adjustment 1: Dividend Streak — tier-based
- **Current:** ≥5 years (hard fail ถ้าต่ำกว่า)
- **Recommended:** 5+ = PASS, 3-4 = REVIEW (with flag "TOO_NEW"), <3 = FAIL
- **Reasoning:** IPO-track stocks (DITTO 4yr, MOSHI 3yr) fail เพราะ history limit ไม่ใช่คุณภาพจ่ายปันผล
- **Lesson justification:** (รอ Karl กรอกหลัง L02+L03)
- **Status:** PENDING KARL REVIEW

### Adjustment 2: EPS Positive — 4/5 with recent-3-positive gate
- **Current:** 5/5 years required
- **Recommended:** 4/5 allowed if 3 ปีล่าสุดเป็นบวก (post-COVID recovery)
- **Reasoning:** MINT/AOT fail เพราะ COVID ไม่ใช่ธุรกิจแย่
- **Lesson justification:** (รอ Karl กรอกหลัง L02)
- **Status:** PENDING KARL REVIEW

### Adjustment 3: P/BV — **DO NOT CHANGE**
- **Current:** ≤1.5
- **Recommendation:** KEEP
- **Reasoning:** 92% DROP rate = filter ทำงานถูก + core ของ Niwes = "ซื้อทรัพย์สินต่ำกว่ามูลค่า"

### Adjustment 4: P/E — **DO NOT CHANGE**
- **Current:** ≤15
- **Recommendation:** KEEP
- **Reasoning:** Niwes standard จาก quotes direct

### Adjustment 5: Yield — **DO NOT CHANGE**
- **Current:** ≥5%
- **Recommendation:** KEEP
- **Reasoning:** หัวใจ Dividend-First, relax = kill framework

## Workflow (Phase 3 → Phase 4)

1. Karl run `/learn niwes` → อ่าน L01-L05 → จด notebook (each with "ตกผลึก" + personal note)
2. Karl review `reports/integration_loop_watchlist_diff_2026-04-20.md` + pattern summary
3. Karl review suggestions above → approve / reject / modify each
4. Karl fill "Lesson justification" fields in `docs/niwes/13-threshold-adjustments.md`
5. Karl update `scripts/screen_stocks.py` thresholds (or ask agent to apply after approval)
6. Rerun curated scan → diff ผล → บันทึกใน decision log

## Decision Deadline

**ไม่มี** — แต่ชี้ว่า framework ยังไม่ calibrated จนกว่า Karl จะ run loop นี้ให้ครบ
- ถ้า Karl scan ตอนนี้ → ได้ 11 ตัว PASS (BBL, QH, TCAP, KTB, KBANK, PTT, RATCH, KKP, LH, EGCO, OR)
- ถ้า watchlist/notes ของ Karl ไม่ตรงกับ passes → "scan ไม่ตอบโจทย์" = ต้องเลือก: ปรับ watchlist ตาม Niwes หรือปรับ Niwes ตาม watchlist
