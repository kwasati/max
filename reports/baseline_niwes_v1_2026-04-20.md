---
agent: Max Mahon v5
date: 2026-04-20
type: baseline
framework: Niwes Dividend-First (5-5-5-5)
plan: niwes-04-framework-migration
---

# Baseline Niwes v1 — 2026-04-20

บันทึกผลแรกหลัง migrate Max Mahon จาก Buffett+เซียนฮง เป็น Niwes 100%.

## Test Scope

- **Universe:** 15 หุ้นคัดด้วยมือ (curated subset) — ไม่ได้ run SET+mai ครบ 933 ตัว
  - เหตุผล: ไม่มี `set_universe.json` ใน branch นี้ (gitignored) + ประหยัดเวลา fetch 30+ นาที
  - Universe ที่ใช้: `data/set_universe.json` (manual_baseline_niwes_v1)
  - Stocks: TCAP, QH, INTUCH, BCP, MC, PTT, ADVANC, SCC, TISCO, KKP, EGCO, RATCH, LH, MBK, CPALL
- **Pipeline:** partial — `screen_stocks.py` + `scan.py` (ข้าม `fetch_data.py` stage ใน run_scan เพราะ adapter cache ใช้ real-time fetch ใน screen)

## Screener Output

- **Scanned:** 15
- **Passed Niwes 5-5-5-5:** 7 (47%)
- **Filtered:** 8
- **Errors:** 1 (INTUCH — thaifin ไม่มี symbol)

### Top 7 Candidates (Niwes Score)

| Rank | Symbol | Score | Breakdown (D/V/C/H) | Signals |
|---|---|---|---|---|
| 1 | TCAP.BK | 71 | 37/23/6/5 | NIWES_5555, HIDDEN_VALUE, QUALITY_DIVIDEND, DEEP_VALUE |
| 2 | QH.BK | 69 | 34/17/8/10 | NIWES_5555, HIDDEN_VALUE, QUALITY_DIVIDEND |
| 3 | PTT.BK | 58 | 34/22/7/0 | NIWES_5555, QUALITY_DIVIDEND |
| 4 | KKP.BK | 56 | 37/20/4/0 | NIWES_5555, QUALITY_DIVIDEND |
| 5 | RATCH.BK | 45 | 31/18/6/0 | NIWES_5555, QUALITY_DIVIDEND |
| 6 | EGCO.BK | 41 | 27/15/4/0 | NIWES_5555 |
| 7 | LH.BK | 38 | 27/15/6/0 | NIWES_5555 |

### Filtered-Out Sample (why they failed)

| Symbol | Fail Reasons |
|---|---|
| CPALL.BK | yield 3.5% < 5%, P/E 15.3 > 15, P/BV 3.30 > 1.5 |
| ADVANC.BK | yield 4.8% < 5%, P/E 21.9 > 15 |
| SCC.BK | yield 2.2% < 5%, P/E 19.6 > 15 |
| TISCO.BK | P/BV 2.10 > 1.5 |
| BCP.BK | yield 2.9% < 5%, P/E 17.2 > 15 |
| MC.BK | P/BV 2.31 > 1.5 |
| MBK.BK | EPS positive 4/5yr < 5/5 |

## Scan Output

- **Report:** `reports/scan_2026-04-20.md` (202 lines)
- **Top Picks analyzed:** 4 (ที่ score ≥50 ไม่อยู่ watchlist)
- **Framework verified:** 6 dimensions ครบ (Dividend Sustainability, Hidden Value, Business Quality, Valuation Discipline, DCA Suitability, Macro Risk)
- **Verbatim Niwes quotes:** ใช้ใน system prompt + report intro
- **Tone:** Niwes-style (Dividend-First + Hidden Value + ≥5-year horizon)

## Acceptance Check

| Criterion | Status |
|---|---|
| scan_*.md generates without Python crash | PASS |
| Has Niwes signal tags | PASS (NIWES_5555 x7, HIDDEN_VALUE x2, DEEP_VALUE x1) |
| Analysis follows 6-dimension framework | PASS |
| ≥1 stock passes Niwes filter | PASS (7 stocks) |
| No Buffett/เซียนฮง refs in code | PASS |

## Threshold Review

- **Niwes 5-5-5-5 strictness is REAL** — 8/15 ตัว (53%) หลุดด่าน, ส่วนใหญ่เพราะ yield <5% หรือ P/BV >1.5
- CPALL (flagship เซียน VI) หลุด Niwes filter ด้วย 3 เหตุผลพร้อมกัน — สะท้อนว่าตอนนี้ CPALL แพงเกินเกณฑ์ Niwes
- ตัวผ่านล้วนเป็น **financial/utility/property/holding** sector (ตรงกับ Niwes portfolio style)
- ถ้ารันทั้ง SET (933 ตัว) คาดว่าผ่านราว 30-80 ตัว (3-9%) — ต้องตรวจหลัง run universe เต็ม

## Follow-Up Tasks (for next plans)

1. Run `update_universe.py` เพื่อดึง SET+mai ครบ (933 ตัว) — niwes-05 จะต้องใช้
2. Verify ว่า `compute_payout_sustainability` ได้ `dividends_paid` จริงเมื่อ yfinance supplement ส่งมา (ปัจจุบัน thaifin ไม่มี field นี้)
3. Consider เพิ่ม hidden_value_holdings.json ให้ครอบคลุมมากกว่า 5 ตัวปัจจุบัน
4. A/B compare กับ Buffett+เซียนฮง snapshot (`docs/archive/`) ว่ารอบเดียวกัน top picks ต่างกันขนาดไหน

## Commit Trail

| Phase | Commit | Summary |
|---|---|---|
| 1 | 4f422b5 | archive Buffett+เซียนฮง snapshot |
| 2 | f285e5c | Niwes 5-5-5-5 hard filters |
| 3 | f1cbcaf | Niwes Dividend-First quality score |
| 4 | 8cc06f8 | Niwes signal tags |
| 5 | a428d19 | Niwes prompt + 6-dim framework |
| 6 | 6babc77 | update CLAUDE.md to Niwes |
| 7 | (this commit) | e2e partial scan + baseline |
