---
agent: Max Mahon v5
date: 2026-04-20
type: integration_loop_scan
plan: niwes-06-integration-karl-loop
framework: Niwes Dividend-First (5-5-5-5)
scope: curated (watchlist + notes + Niwes baseline + Thai large caps)
---

# Niwes Integration Loop — Scan #1 — 2026-04-20

> "เน้นลงทุนแบบ Value Investing คือดูคุณภาพเปรียบเทียบกับราคา ถ้ามันคุ้มค่าเราก็ซื้อ" — ดร.นิเวศน์

## Scope

- **Curated universe:** 35 stocks (ไม่ใช่ SET+mai 933 ตัวเต็ม)
- **เหตุผล partial:** fetch ทั้ง 933 ตัว ใช้เวลา 30+ นาที + API credits — สำหรับ integration loop ตรวจ watchlist Karl กับ Niwes baseline พอ
- **Stocks ใน universe:**
  - Watchlist Karl (3): CBG, DITTO, MOSHI
  - Notes (12): PTT, ADVANC, CPALL, SCB, GULF, BDMS, MINT, AOT, HMPRO, SAWAD, LH, TISCO
  - Niwes baseline passes (6): TCAP, QH, PTT, KKP, RATCH, EGCO
  - Niwes baseline filtered (6): SCC, BCP, MC, TISCO, MBK, CPALL
  - Thai large caps (11): KBANK, BBL, KTB, TOP, PTTGC, GPSC, BH, INTUCH, OR, DTAC, TRUE
- **Filters (Niwes 5-5-5-5):** dividend yield ≥5%, streak ≥5yr, EPS positive 5/5yr, P/E ≤15, P/BV ≤1.5, market cap ≥5B

## Screener Result

| Metric | Count |
|---|---|
| Scanned | 35 |
| Passed Niwes 5-5-5-5 | 11 (31%) |
| Filtered out | 24 (69%) |
| Errors (delisted/no data) | 0 |

### Top 11 Passing (ranked by Niwes Quality Score)

| Rank | Symbol | Score | D/V/C/H | Yield | P/E | P/BV | Signals |
|---|---|---|---|---|---|---|---|
| 1 | BBL.BK | 64 | 40/23/6/0 | 5.6% | 7.4 | 0.69 | NIWES_5555, QUALITY_DIVIDEND, DEEP_VALUE |
| 2 | QH.BK | 64 | 34/17/8/10 | 9.9% | 8.8 | 0.50 | NIWES_5555, HIDDEN_VALUE, QUALITY_DIVIDEND |
| 3 | TCAP.BK | 61 | 37/23/6/5 | 6.3% | 7.5 | 0.72 | NIWES_5555, HIDDEN_VALUE, QUALITY_DIVIDEND, DEEP_VALUE |
| 4 | KTB.BK | 59 | 40/20/4/0 | 7.9% | 7.0 | 0.75 | NIWES_5555, QUALITY_DIVIDEND |
| 5 | KBANK.BK | 56 | 37/20/4/0 | 5.5% | 7.1 | 0.73 | NIWES_5555, QUALITY_DIVIDEND |
| 6 | PTT.BK | 53 | 34/22/7/0 | 6.0% | 11.0 | 0.87 | NIWES_5555, QUALITY_DIVIDEND |
| 7 | RATCH.BK | 45 | 31/18/6/0 | 6.2% | 11.5 | 0.59 | NIWES_5555, QUALITY_DIVIDEND |
| 8 | KKP.BK | 41 | 37/20/4/0 | 9.0% | 7.0 | 0.74 | NIWES_5555, QUALITY_DIVIDEND, OVERPRICED |
| 9 | LH.BK | 38 | 27/15/6/0 | 6.4% | 12.1 | 0.95 | NIWES_5555 |
| 10 | EGCO.BK | 36 | 27/15/4/0 | 5.6% | 10.4 | 0.48 | NIWES_5555 |
| 11 | OR.BK | 31 | 24/11/11/0 | 5.8% | 12.4 | 1.48 | NIWES_5555 |

### Filtered Sample (top fails)

| Symbol | Primary Reasons |
|---|---|
| CPALL.BK | yield 3.5% / P/E 15.3 / P/BV 3.30 (triple fail — confirmed from baseline) |
| ADVANC.BK | yield 4.8% / P/E 21.9 / P/BV 9.80 |
| AOT.BK | yield 1.5% / P/E 44.5 / P/BV 5.77 / EPS 3/5 |
| GULF.BK | yield 1.8% / streak 0yr / P/E 33.8 / P/BV 2.57 |
| HMPRO.BK | P/BV 3.13 only — yield + P/E ผ่าน |
| CBG.BK (WATCHLIST) | yield 3.2% / P/E 16.2 / P/BV 2.66 |
| DITTO.BK (WATCHLIST) | yield 4.8% / streak 4yr / history 3yr only / P/BV 1.90 |
| MOSHI.BK (WATCHLIST) | yield 3.5% / streak 3yr / history 3yr only / P/E 17.2 / P/BV 4.23 |

## Framework Verification

- No crash — screener ran all 35 symbols end-to-end
- Niwes 5-5-5-5 filter active — 69% filter-out rate matches strict Niwes criteria
- Quality Score — 100-point scale, breakdown visible (D/V/C/H)
- Signal tags — NIWES_5555 (11), QUALITY_DIVIDEND (7), DEEP_VALUE (2), HIDDEN_VALUE (2), OVERPRICED (1)
- Scoring version — `niwes-dividend-first-v1`
- Valuation grade modifier applied (A:+5, B:0, C:-5, D:-10, F:-20), score capped 0-100

## Key Observations

- **Banks dominate passes** — 5/11 = KBANK, BBL, KTB, KKP + TCAP (holding w/ bank exposure via TTB). Matches Niwes portfolio style.
- **Utility/energy core** — PTT, RATCH, EGCO, OR = steady dividend + low P/BV
- **QH stands out** — HIDDEN_VALUE + QUALITY_DIVIDEND + P/BV 0.50 — classic Niwes setup
- **Karl's watchlist 100% fail** — CBG, DITTO, MOSHI ทั้ง 3 ตัว fail Niwes filter. Detailed diff → `integration_loop_watchlist_diff_2026-04-20.md`
- **Growth favorites fail hard** — CPALL, AOT, ADVANC, GULF, BDMS, MINT, HMPRO, SAWAD, BH, TRUE — ปันผลน้อย/แพง/ไม่ match Dividend-First

## Data Source

- Screener JSON: `data/screener_curated_niwes06_2026-04-20.json`
- Script: `tmp/run_curated_screen.py` (one-shot for niwes-06)

## Next

- Watchlist comparison → Phase 2 → `integration_loop_watchlist_diff_2026-04-20.md`
- Pattern analysis + threshold recommendations → embedded in watchlist diff
- Karl lesson learning (L01-L05) → Phase 3 → `integration_loop_karl_todo_2026-04-20.md`
