# DPS Fix Verification — 2026-04-27

Verifies fix from plan `fix-dps-fiscal-year-attribution` — DIY (Fiscal Year Attribution per SET methodology) replacing Yahoo `dividendRate` for 4 dividend fields.

## Before vs After

| Symbol | Field | Before (bug) | After (fix) | Note |
|--------|-------|--------------|-------------|------|
| **BBL.BK** | price | 158.5000 | 160.5000 | snapshot vs current |
| | yield | 10.4100% | 6.2305% | DIY methodology |
| | dps | 16.5000 | 10.0000 | FY total |
| | payout | 0.3527 | 0.4151 | DPS/EPS same FY |
| | yield_5y | 3.5300% | 4.1745% | avg 5 complete FY |
| **METCO.BK** | price | 264.0000 | 264.0000 | snapshot vs current |
| | yield | 11.3600% | 3.0303% | DIY methodology |
| | dps | 30.0000 | 8.0000 | FY total |
| | payout | 0.1496 | 0.4251 | DPS/EPS same FY |
| | yield_5y | 4.5500% | 4.5455% | avg 5 complete FY |
| **QH.BK** | price | 1.4200 | 1.3400 | snapshot vs current |
| | yield | 9.8600% | 6.7164% | DIY methodology |
| | dps | 0.1400 | 0.0900 | FY total |
| | payout | 0.6250 | 0.5625 | DPS/EPS same FY |
| | yield_5y | 8.4500% | 8.8060% | avg 5 complete FY |
| **SAT.BK** | price | 14.7000 | 14.6000 | snapshot vs current |
| | yield | 10.8800% | 10.9589% | DIY methodology |
| | dps | 1.6000 | 1.6000 | FY total |
| | payout | 0.9535 | 0.9275 | DPS/EPS same FY |
| | yield_5y | 9.5000% | 10.5479% | avg 5 complete FY |

## SET Streaming Reference (อาร์ทกรอกเอง)

| Symbol | SET DIY yield | Max yield (after) | Diff | PASS (±1%) |
|--------|---------------|-------------------|------|------------|
| **BBL.BK** | _____ %  | 6.23% | _____ | _____ |
| **METCO.BK** | _____ %  | 3.03% | _____ | _____ |
| **QH.BK** | _____ %  | 6.72% | _____ | _____ |
| **SAT.BK** | _____ %  | 10.96% | _____ | _____ |

_Tolerance: ±1.0% absolute. ตัวอย่าง: SET=6.8% / Max=6.23% → diff=0.57% → PASS_

## Methodology

- Heuristic: ex-date Jan-Jun ปี N+1 → final ของ FY N | ex-date Jul-Dec ปี N → interim ของ FY N
- yield = latest complete FY DPS / current price
- payout = latest FY DPS / latest FY EPS (same period)
- yield_5y = avg(last 5 complete FY DPS) / current price
- dividend_history = bin by fiscal year (was: bin by payment calendar year)

## Known data quality caveat

Yahoo `dividend_history` may lag SET by days/weeks for newly-declared dividends. Example: BBL FY2025 final ex-date Apr 22 2026, SET shows 10 baht, Yahoo shows 8 baht (verified 2026-04-27). Resulting yield gap ~0.5% within tolerance. ระยะยาวควรย้ายไป SETSMART (separate plan).