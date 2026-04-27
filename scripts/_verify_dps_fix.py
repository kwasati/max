"""Verify DPS fix — fetch 4 stocks via fetch_fundamentals + write comparison report."""

import sys
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))

from data_adapter import fetch_fundamentals  # noqa: E402

SYMBOLS = ['BBL.BK', 'METCO.BK', 'QH.BK', 'SAT.BK']

# Before-fix baseline (from screener_2026-04-25.json, captured before DPS fix)
BEFORE = {
    'BBL.BK':   {'price': 158.5,  'yield': 10.41, 'dps': 16.50, 'payout': 0.3527, 'yield_5y': 3.53},
    'METCO.BK': {'price': 264.0,  'yield': 11.36, 'dps': 30.00, 'payout': 0.1496, 'yield_5y': 4.55},
    'QH.BK':    {'price': 1.42,   'yield': 9.86,  'dps': 0.14,  'payout': 0.625,  'yield_5y': 8.45},
    'SAT.BK':   {'price': 14.7,   'yield': 10.88, 'dps': 1.60,  'payout': 0.9535, 'yield_5y': 9.50},
}

print('Fetching 4 stocks via fetch_fundamentals (post-fix)...')
print()

after = {}
for sym in SYMBOLS:
    try:
        data = fetch_fundamentals(sym)
        after[sym] = {
            'price': data.get('price'),
            'yield': data.get('dividend_yield'),
            'dps': data.get('dps'),
            'payout': data.get('payout_ratio'),
            'yield_5y': data.get('five_year_avg_yield'),
        }

        def _fmt_pct(v):
            return f"{v:.2f}%" if isinstance(v, (int, float)) else str(v)

        a = after[sym]
        print(f"{sym}: price={a['price']}, yield={_fmt_pct(a['yield'])}, dps={a['dps']}, payout={a['payout']}, yield_5y={_fmt_pct(a['yield_5y'])}")
    except Exception as e:
        print(f"{sym}: ERROR {e}")
        after[sym] = None

# Build report
today = datetime.now().strftime('%Y-%m-%d')
report_path = ROOT / 'docs' / f'dps-fix-verification-{today}.md'
report_path.parent.mkdir(exist_ok=True)

lines = [
    f'# DPS Fix Verification — {today}',
    '',
    'Verifies fix from plan `fix-dps-fiscal-year-attribution` — DIY (Fiscal Year Attribution per SET methodology) replacing Yahoo `dividendRate` for 4 dividend fields.',
    '',
    '## Before vs After',
    '',
    '| Symbol | Field | Before (bug) | After (fix) | Note |',
    '|--------|-------|--------------|-------------|------|',
]

for sym in SYMBOLS:
    b = BEFORE.get(sym, {})
    a = after.get(sym, {})
    if a is None:
        lines.append(f'| {sym} | — | — | FETCH FAILED | — |')
        continue

    def fmt(v, suffix=''):
        if v is None:
            return 'None'
        if isinstance(v, float):
            return f"{v:.4f}{suffix}"
        return f"{v}{suffix}"

    lines.append(f"| **{sym}** | price | {fmt(b.get('price'))} | {fmt(a.get('price'))} | snapshot vs current |")
    lines.append(f"| | yield | {fmt(b.get('yield'), '%')} | {fmt(a.get('yield'), '%')} | DIY methodology |")
    lines.append(f"| | dps | {fmt(b.get('dps'))} | {fmt(a.get('dps'))} | FY total |")
    lines.append(f"| | payout | {fmt(b.get('payout'))} | {fmt(a.get('payout'))} | DPS/EPS same FY |")
    lines.append(f"| | yield_5y | {fmt(b.get('yield_5y'), '%')} | {fmt(a.get('yield_5y'), '%')} | avg 5 complete FY |")

lines += [
    '',
    '## SET Streaming Reference (อาร์ทกรอกเอง)',
    '',
    '| Symbol | SET DIY yield | Max yield (after) | Diff | PASS (±1%) |',
    '|--------|---------------|-------------------|------|------------|',
]

for sym in SYMBOLS:
    a = after.get(sym, {})
    yield_after = a.get('yield') if a else None
    yield_str = f"{yield_after:.2f}%" if yield_after is not None else '—'
    lines.append(f"| **{sym}** | _____ %  | {yield_str} | _____ | _____ |")

lines += [
    '',
    '_Tolerance: ±1.0% absolute. ตัวอย่าง: SET=6.8% / Max=6.23% → diff=0.57% → PASS_',
    '',
    '## Methodology',
    '',
    '- Heuristic: ex-date Jan-Jun ปี N+1 → final ของ FY N | ex-date Jul-Dec ปี N → interim ของ FY N',
    '- yield = latest complete FY DPS / current price',
    '- payout = latest FY DPS / latest FY EPS (same period)',
    '- yield_5y = avg(last 5 complete FY DPS) / current price',
    '- dividend_history = bin by fiscal year (was: bin by payment calendar year)',
    '',
    '## Known data quality caveat',
    '',
    'Yahoo `dividend_history` may lag SET by days/weeks for newly-declared dividends. Example: BBL FY2025 final ex-date Apr 22 2026, SET shows 10 baht, Yahoo shows 8 baht (verified 2026-04-27). Resulting yield gap ~0.5% within tolerance. ระยะยาวควรย้ายไป SETSMART (separate plan).',
]

report_path.write_text('\n'.join(lines), encoding='utf-8')
print(f'\nReport written: {report_path}')
