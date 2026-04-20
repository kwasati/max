---
agent: Max Mahon v5
date: 2026-04-20
type: integration_loop_watchlist_diff
plan: niwes-06-integration-karl-loop
framework: Niwes Dividend-First (5-5-5-5)
source: data/screener_curated_niwes06_2026-04-20.json
---

# Niwes Watchlist Diff — 2026-04-20

เทียบ watchlist + notes ของ Karl กับ Niwes framework หลัง migrate.
Decision rules:
- **KEEP** — PASS Niwes + Quality Score ≥60
- **REVIEW** — FAIL Niwes แต่ Score 40-60 (near-miss)
- **DROP** — FAIL Niwes + Score <40 (หรือ FAIL แต่ไม่มี score)
- **KEEP (low)** — PASS Niwes แต่ Score <60 (ผ่านเกณฑ์ hard แต่คะแนนไม่สูง)

## Watchlist (3 symbols)

| Symbol | สถานะเดิม (note) | Niwes verdict | Quality Score | Tags | Decision |
|---|---|---|---|---|---|
| CBG.BK | (watchlist explicit) | FAIL | N/A | — | **DROP** |
| DITTO.BK | (watchlist explicit) | FAIL | N/A | — | **DROP** |
| MOSHI.BK | (watchlist explicit) | FAIL | N/A | — | **DROP** |

### Detail — Why Fail

| Symbol | Fail Reasons |
|---|---|
| CBG.BK | yield 3.2% < 5% / P/E 16.2 > 15 / P/BV 2.66 > 1.5 (triple fail) |
| DITTO.BK | yield 4.8% < 5% / streak 4yr < 5yr / EPS history only 3yr / P/BV 1.90 > 1.5 |
| MOSHI.BK | yield 3.5% < 5% / streak 3yr < 5yr / EPS history only 3yr / P/E 17.2 > 15 / P/BV 4.23 > 1.5 |

**Key finding:** 100% ของ watchlist Karl fail Niwes filter. ทุกตัวเป็น growth/consumer play ที่ไม่ match Dividend-First philosophy.

## Notes (12 symbols) — Context Stocks

| Symbol | สถานะเดิม (note) | Niwes verdict | Quality Score | Tags | Decision |
|---|---|---|---|---|---|
| PTT.BK | ปันผลสม่ำเสมอ ราคาถูก | PASS | 53 | NIWES_5555, QUALITY_DIVIDEND | **KEEP (low)** |
| LH.BK | อสังหาปันผลสูง recurring income | PASS | 38 | NIWES_5555 | **KEEP (low)** |
| ADVANC.BK | ปันผลสูง ผู้นำโทรคม | FAIL | N/A | — | **DROP** |
| CPALL.BK | เติบโตต่อเนื่อง ครองตลาด retail | FAIL | N/A | — | **DROP** |
| SCB.BK | ปันผลดี banking leader | FAIL | N/A | — | **DROP** |
| GULF.BK | พลังงานสะอาด growth play | FAIL | N/A | — | **DROP** |
| BDMS.BK | โรงพยาบาล defensive + growth | FAIL | N/A | — | **DROP** |
| MINT.BK | ท่องเที่ยว recovery | FAIL | N/A | — | **DROP** |
| AOT.BK | ผูกขาดสนามบิน | FAIL | N/A | — | **DROP** |
| HMPRO.BK | ปันผลดี ครองตลาด home improvement | FAIL | N/A | — | **DROP** |
| SAWAD.BK | สินเชื่อ growth + ปันผลเริ่มดี | FAIL | N/A | — | **DROP** |
| TISCO.BK | ธนาคารเล็ก ปันผลสูงสุด ROE ดี | FAIL | N/A | — | **DROP** |

### Detail — Why Fail (notes only)

| Symbol | Fail Reasons |
|---|---|
| ADVANC.BK | yield 4.8% < 5% / P/E 21.9 > 15 / P/BV 9.80 > 1.5 |
| CPALL.BK | yield 3.5% < 5% / P/E 15.3 > 15 / P/BV 3.30 > 1.5 |
| SCB.BK | streak 4yr < 5yr (ตัวเดียว — ใกล้ผ่าน) |
| GULF.BK | yield 1.8% < 5% / streak 0yr < 5yr / P/E 33.8 > 15 / P/BV 2.57 > 1.5 (quadruple fail) |
| BDMS.BK | yield 4.3% < 5% / P/E 18.7 > 15 / P/BV 2.81 > 1.5 |
| MINT.BK | yield 3.1% < 5% / EPS positive 4/5yr / P/E 17.4 > 15 / P/BV 2.19 > 1.5 |
| AOT.BK | yield 1.5% < 5% / EPS positive 3/5yr / P/E 44.5 > 15 / P/BV 5.77 > 1.5 |
| HMPRO.BK | P/BV 3.13 > 1.5 (ตัวเดียว — ใกล้ผ่าน, yield + P/E + streak ok) |
| SAWAD.BK | yield 3.2% < 5% (ตัวเดียว — ใกล้ผ่าน) |
| TISCO.BK | P/BV 2.10 > 1.5 (ตัวเดียว — ใกล้ผ่าน, yield 6.7% ok, streak ok) |

## Summary (watchlist + notes = 15 symbols)

| Decision | Count | Percent |
|---|---|---|
| KEEP | 0 | 0% |
| KEEP (low) | 2 | 13% |
| REVIEW | 0 | 0% |
| DROP | 13 | 87% |

**Key finding:** 87% ของรายการสนใจ Karl ไม่ผ่าน Niwes. เฉพาะ PTT + LH เท่านั้นที่ผ่าน (แต่ score ไม่สูง).

**Near-miss** (fail แค่เกณฑ์เดียว — อาจ review ได้ถ้าปรับ threshold):
- SCB (streak 4yr vs ≥5)
- HMPRO (P/BV 3.13 vs ≤1.5)
- SAWAD (yield 3.2% vs ≥5%)
- TISCO (P/BV 2.10 vs ≤1.5)

---

## Pattern Analysis

วิเคราะห์หุ้นที่ FAIL (13 ตัว) — ตัวไหน fail filter ไหนมากที่สุด:

### Failure Rate Per Filter (stock count + %)

| Filter | Failed | % of DROP stocks |
|---|---|---|
| P/BV > 1.5 | 12 | 92% |
| P/E > 15 | 9 | 69% |
| Dividend Yield < 5% | 9 | 69% |
| EPS positive <5/5 years | 5 | 38% |
| Dividend streak <5 years | 4 | 31% |
| Market cap < 5B | 0 | 0% |

### Observations

**1. P/BV เป็นตัวตัด #1 (92%)**
- 12/13 หุ้น DROP fail P/BV ≥1.5
- ค่า P/BV ที่เจอ: 0.95 (LH ผ่าน) → 9.80 (ADVANC)
- Growth/consumer stocks (CPALL 3.30, BDMS 2.81, ADVANC 9.80) แพงเทียบ book value มาก
- P/BV strict ที่ 1.5 = Niwes เชื่อมั่น "ซื้อทรัพย์สินต่ำกว่ามูลค่า" ถ้า Karl เชื่อเรื่อง growth story → อาจต้อง relax (เช่น 2.0)

**2. P/E และ Yield = ตัวตัดระดับใกล้กัน (69% ทั้งคู่)**
- 9/13 หุ้น fail yield (ต่ำกว่า 5%) — consumer/growth ปันผลน้อย
- 9/13 หุ้น fail P/E (สูงกว่า 15) — ตลาด re-rate หุ้น growth
- Correlation: หุ้นที่ fail yield มักก็ fail P/E ด้วย (เพราะแพง → ปันผล yield ต่ำ)

**3. EPS 5/5 เข้มจริงแต่ไม่เป็น bottleneck (38%)**
- 5/13 หุ้น fail EPS — ส่วนใหญ่มาจาก COVID shock (MINT, AOT, MBK) หรือ IPO ใหม่ (DITTO, MOSHI history 3yr only)
- DITTO/MOSHI fail เพราะ "history only 3yr" ไม่ใช่ขาดทุน — อาจพิจารณา allow stocks ที่มี history 3-4 ปี แต่ EPS positive ทั้งหมด

**4. Dividend streak 5yr = บ่วง IPO (31%)**
- DITTO streak 4yr, MOSHI streak 3yr → IPO ใหม่
- SCB streak 4yr → มีช่วงขาดจ่าย (COVID)
- Niwes principle: "จ่ายปันผลสม่ำเสมอ" ต้อง 5+ ปี — strict แต่ปลอดภัย

**5. Market cap ไม่เป็นปัญหา (0%)**
- Universe curated ทั้งหมดเป็น large cap อยู่แล้ว

### Threshold Recommendations (Data-Driven)

**ห้าม edit screen_stocks.py จนกว่า Karl จะ approve** — นี่แค่ recommendation ให้ Karl พิจารณาหลังเรียน L01-L05

**Recommendation 1: P/BV — ไม่แนะนำให้ relax**
- 92% DROP rate = strict ได้ผล (filter ออกหุ้นแพง)
- Niwes philosophy "P/BV ≤ 1.5" เป็น hallmark ของ Dividend-First
- Relax = ละทิ้ง margin of safety → อาจทำให้ strategy drift
- **ข้อเสนอ: คงไว้ 1.5**

**Recommendation 2: Dividend Streak — พิจารณา 3 ปีสำหรับ IPO-track**
- ปัจจุบัน 5 ปี = ตัดหุ้น IPO 3-4 ปีออกหมด
- DITTO/MOSHI history limit 3 ปี → fail "technical" ไม่ใช่เพราะคุณภาพจ่ายปันผล
- **ข้อเสนอ: เพิ่ม tier — 3-4 ปี = REVIEW (ไม่ใช่ DROP เด็ดขาด), 5+ ปี = PASS**
- Alternative: คง 5 ปี แต่เพิ่ม flag "TOO_NEW" แทน fail

**Recommendation 3: EPS 5/5 — พิจารณาเป็น 4/5 พร้อมเงื่อนไข**
- MINT/AOT fail เพราะ COVID (2020-2022) ไม่ใช่ธุรกิจแย่
- 4/5 + ล่าสุด 3 ปีติดกันเป็นบวก = ยอมรับ recovery story
- **ข้อเสนอ: EPS positive ≥4/5 (ถ้า 3 ปีล่าสุดเป็นบวก)**
- Alternative: คง 5/5 เป็น hard filter แต่เพิ่ม signal POST_COVID_RECOVERY สำหรับ 4/5 + 3yr ล่าสุดบวก

**Recommendation 4: P/E — ไม่แนะนำให้ relax**
- ≤15 คือ Niwes standard (ดูจากบทความ + quote)
- Relax = accept expensive stocks ซึ่ง conflict กับ philosophy

**Recommendation 5: Yield — ไม่แนะนำให้ relax**
- ≥5% คือหัวใจ Dividend-First
- Relax จะเปิดทางหุ้น growth ซึ่งละทิ้ง thesis

### Red Flags — อย่า adjust

- **ถ้า 80%+ ของ watchlist fail filter เดียว** → filter อาจ strict ไป (ปัจจุบัน P/BV fail 92% — ใกล้เกณฑ์นี้ แต่เป็น core ของ Niwes ห้ามยืด)
- **ถ้า adjust แล้วทำให้ DROP → KEEP ทั้งหมด** = threshold fake ไม่ตั้งใจ screen

## Karl Decision Matrix

หลังเรียน L01-L05 Karl ต้องตัดสินใจ (อ่านหลักฐานจากตัวเองที่ไม่ได้ผ่าน Niwes):

1. **รับ Niwes 100%** — drop CBG, DITTO, MOSHI, CPALL, AOT, ADVANC, GULF, BDMS, MINT, HMPRO, SAWAD, TISCO ออกจาก focus — เก็บแค่ PTT + LH (+ หุ้น NIWES_5555 ใหม่ เช่น BBL, KTB, KBANK, TCAP, QH)
2. **Hybrid** — ยืด P/BV เป็น 2.0 หรือ streak เป็น 3 → รับ HMPRO/TISCO/DITTO เข้ามา
3. **Reject Niwes** — ยืนยันใช้ framework เดิม (Buffett+เซียนฮง) ก็ได้ — แต่ต้อง revert

**Agent จะไม่ตัดสินใจแทน Karl** — ต้องอ่าน L01-L05 ก่อนแล้วค่อยเลือก.

## Pattern Summary (Karl-facing)

สรุปสั้นให้ Karl ใช้ตัดสินใจหลังเรียน L01-L05:

**Top 3 ปัญหา (สาเหตุ DROP):**
1. **P/BV > 1.5** — 92% ของ DROP = หุ้นที่ Karl เลือก ส่วนใหญ่แพงเทียบ book (CPALL 3.30, ADVANC 9.80, BDMS 2.81)
2. **P/E > 15** — 69% ของ DROP = ตลาด re-rate หุ้น consumer/growth
3. **Yield < 5%** — 69% ของ DROP = หุ้น growth จ่ายปันผลน้อย

**ข้อสรุป:**
- Watchlist Karl ทิศทาง = **growth story** (CPALL, DITTO, MOSHI, CBG, GULF)
- Niwes direction = **dividend + cheap book + bank/utility**
- Gap ใหญ่ = Karl ต้องเลือก philosophy ก่อน ไม่ใช่ adjust threshold เพื่อบิดให้ watchlist ผ่าน

**ห้ามบิด threshold เพื่อให้ DROP → PASS** — นั่นจะทำให้ framework เสียหาย

## Next

- Karl TODO → `integration_loop_karl_todo_2026-04-20.md`
- Threshold adjustment log → `docs/niwes/13-threshold-adjustments.md`
