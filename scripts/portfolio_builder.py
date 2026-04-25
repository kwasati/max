"""Niwes portfolio construction — pure functions, no I/O.

Build 5-stock 5-sector 80/20 portfolio from watchlist + screener output.
Pure logic only: stdlib + dict-in/dict-out. No FastAPI, no file reads.
"""
from collections import defaultdict


def to_canonical_sector(raw):
    """Map raw SET sector string → 5 canonical buckets."""
    if not raw or raw.strip() in ('', '-'):
        return 'Other'
    r = raw.lower()
    if 'bank' in r:
        return 'Banking'
    if any(k in r for k in ['energy', 'petroleum', 'refining', 'utilit']):
        return 'Energy'
    if 'reit' in r or 'property fund' in r or 'infrastructure trust' in r:
        return 'REIT-PFund'
    if 'property' in r or 'real estate' in r:
        return 'Property'
    return 'Other'


def niwes_composite_score(stock):
    """Rank score combining yield + value + hidden + quality. 0 to ~100+."""
    dy = stock.get('dividend_yield') or 0
    pe = stock.get('pe_ratio') or 999
    pbv = stock.get('pb_ratio') or 999
    signals = stock.get('signals') or []
    quality = stock.get('score') or 0
    yield_score = min(dy, 8) * 3
    pe_value = max(0, (15 - pe) / 15 * 20) if pe > 0 else 0
    pbv_value = max(0, (1.5 - pbv) / 1.5 * 15) if pbv > 0 else 0
    hidden_bonus = 20 if 'HIDDEN_VALUE' in signals else 0
    quality_contribution = quality * 0.25
    return yield_score + pe_value + pbv_value + hidden_bonus + quality_contribution


def enrich_watchlist_stocks(watchlist, screener):
    """Join watchlist symbols with screener entries; flatten nested metrics."""
    all_entries = (
        (screener.get('candidates') or [])
        + (screener.get('review_candidates') or [])
        + (screener.get('filtered_out_stocks') or [])
    )
    by_sym = {e.get('symbol'): e for e in all_entries if e.get('symbol')}
    out = []
    for sym in watchlist:
        c = by_sym.get(sym)
        if not c:
            continue
        m = c.get('metrics') or {}
        out.append({
            'symbol': c.get('symbol'),
            'name': c.get('name'),
            'sector': c.get('sector'),
            'sector_canonical': to_canonical_sector(c.get('sector')),
            'dividend_yield': m.get('dividend_yield'),
            'pe_ratio': m.get('pe'),
            'pb_ratio': m.get('pb_ratio'),
            'current_price': m.get('current_price'),
            'signals': c.get('signals') or [],
            'score': c.get('score'),
        })
    return out


def apply_pin_overrides(stocks, pins):
    """Mark pinned stocks; emit warning for pin not in watchlist."""
    pins = pins or []
    warnings = []
    available = {s.get('symbol') for s in stocks}
    for p in pins:
        if p not in available:
            warnings.append(f'pin not in watchlist: {p}')
    pin_set = set(pins)
    for s in stocks:
        s['_pinned'] = s.get('symbol') in pin_set
    return stocks, warnings


def top_per_canonical_sector(stocks):
    """Pick top-1 per canonical sector — pin wins, else max composite."""
    groups = defaultdict(list)
    for s in stocks:
        groups[s.get('sector_canonical', 'Other')].append(s)
    picks = []
    for sector, members in groups.items():
        if not members:
            continue
        pinned = [s for s in members if s.get('_pinned')]
        if pinned:
            chosen = pinned[0]
        else:
            scored = [(s, niwes_composite_score(s)) for s in members]
            scored.sort(key=lambda x: x[1], reverse=True)
            chosen = scored[0][0]
        chosen['_composite'] = niwes_composite_score(chosen)
        picks.append(chosen)
    picks.sort(key=lambda x: x.get('_composite', 0), reverse=True)
    return picks


DEFAULT_WEIGHTS = [40, 35, 12, 8, 5]


def allocate_80_20(picks):
    """Assign 80/20 weights from DEFAULT_WEIGHTS; rescale if <5 picks."""
    picks = picks[:5]
    n = len(picks)
    if n == 0:
        return []
    base = DEFAULT_WEIGHTS[:n]
    total = sum(base)
    weights = [round(w / total * 100, 1) for w in base]
    for s, w in zip(picks, weights):
        s['weight_pct'] = w
    return picks


SECTOR_CLASS_MAP = {
    'Banking': 's-bank', 'Energy': 's-nrg', 'Property': 's-prop',
    'REIT-PFund': 's-purple', 'Other': 's-comm',
}


def tag_roles(picks):
    """Annotate role tags + UI metadata (rank, score_dot, sector_class)."""
    role_map = {
        1: ('anchor', 'ตัวหลัก'), 2: ('anchor', 'ตัวหลัก'),
        3: ('supporting', 'ตัวรอง'),
        4: ('tail', 'ตัวท้าย'), 5: ('tail', 'ตัวท้าย'),
    }
    for i, p in enumerate(picks, 1):
        role, label = role_map.get(i, ('tail', 'ตัวท้าย'))
        p['rank'] = i
        p['role'] = role
        p['role_label_th'] = label
        p['score_dot'] = 'a' if (p.get('score') or 0) >= 80 else 'b'
        p['sector_class'] = SECTOR_CLASS_MAP.get(p.get('sector_canonical', 'Other'), 's-comm')
    return picks


ROLE_LABEL_EN = {'anchor': 'Anchor', 'supporting': 'Supporting', 'tail': 'Tail'}


def generate_role_reason(stock, role, rank):
    """Thai 1-line role reasoning composed from signals + metrics."""
    role_label = ROLE_LABEL_EN.get(role, 'Pick')
    signals = stock.get('signals') or []
    score = stock.get('score') or 0
    pe = stock.get('pe_ratio')
    pbv = stock.get('pb_ratio')
    dy = stock.get('dividend_yield') or 0
    sector = stock.get('sector_canonical', 'Other')
    sym = stock.get('symbol', '?')

    clauses = []
    if role == 'anchor' and score >= 85:
        clauses.append(f'score {score} สูง')
    if 'HIDDEN_VALUE' in signals:
        clauses.append('hidden value (cross-holdings/land bank ที่ยังไม่ pricing in)')
    if 'DEEP_VALUE' in signals and pe is not None and pbv is not None:
        clauses.append(f'PE {pe} ต่ำ + PBV {pbv}')
    if 'QUALITY_DIVIDEND' in signals:
        clauses.append('streak ปันผลยาว')
    if dy >= 7:
        clauses.append(f'yield {dy}% สูง')

    if not clauses:
        clauses.append(f'top-1 ของ {sector} (score {score})')

    if role == 'tail' and score < 75:
        clauses.append('— น้ำหนักน้อย · monitor closely')

    body = ' · '.join(clauses)
    return f'ทำไมเป็น {role_label}: {body}'


def build_bench(all_stocks, picks):
    """Non-picked stocks with bench reason explaining why not picked."""
    pick_syms = {p.get('symbol') for p in picks}
    pick_by_sector = {}
    for p in picks:
        pick_by_sector[p.get('sector_canonical')] = p

    bench = []
    for s in all_stocks:
        sym = s.get('symbol')
        if sym in pick_syms:
            continue
        score = s.get('score') or 0
        sector = s.get('sector_canonical', 'Other')
        pe = s.get('pe_ratio') or 0
        dy = s.get('dividend_yield') or 0

        sector_pick = pick_by_sector.get(sector)
        if sector_pick:
            reason = (
                f'{sector} มี {sector_pick.get("symbol")} เป็น {sector_pick.get("role")} แล้ว '
                f'· score {score} รอง'
            )
        elif score < 60:
            flags = []
            if pe and pe > 20:
                flags.append('PE สูง')
            if dy and dy < 3:
                flags.append('yield ต่ำ')
            tail = (' · ' + ' · '.join(flags)) if flags else ''
            reason = f'score {score} ต่ำ{tail}'
        else:
            reason = f'score {score} — sector {sector} (อันดับรอง)'

        bench.append({
            'symbol': sym,
            'name': s.get('name'),
            'score': score,
            'reason': reason,
        })
    return bench


SECTOR_SUGGESTIONS = {
    'Banking': ['BBL', 'SCB', 'KBANK'],
    'Energy': ['PTT', 'PTTEP', 'BCP'],
    'Property': ['QH', 'AP', 'LPN'],
    'REIT-PFund': ['DIF', 'JASIF', 'CPNREIT'],
}


def build_sector_warnings(picked):
    """Warnings for canonical sectors absent from picks (excluding 'Other')."""
    warnings = []
    for sector in ('Banking', 'Energy', 'Property', 'REIT-PFund'):
        if sector not in picked:
            warnings.append({
                'sector': sector,
                'msg': f'{sector} ว่าง — ลองเพิ่ม {" · ".join(SECTOR_SUGGESTIONS[sector])} ใน watchlist',
                'suggestions': SECTOR_SUGGESTIONS[sector],
            })
    return warnings


def build_portfolio(watchlist, screener, pins=None):
    """Orchestrator — build Niwes 5-sector 80/20 portfolio from watchlist."""
    enriched = enrich_watchlist_stocks(watchlist, screener)
    enriched, pin_warnings = apply_pin_overrides(enriched, pins)
    picks = top_per_canonical_sector(enriched)
    picks = allocate_80_20(picks)
    picks = tag_roles(picks)

    for p in picks:
        p['reason'] = generate_role_reason(p, p['role'], p['rank'])
        sigs = p.get('signals') or []
        score = p.get('score') or 0
        tags = []
        if 'NIWES_5555' in sigs:
            tags.append('PASS')
        elif score >= 70:
            tags.append('REVIEW')
        if 'HIDDEN_VALUE' in sigs:
            tags.append('Hidden value')
        if p.get('_pinned'):
            tags.append('PINNED')
        p['tags'] = tags

    bench = build_bench(enriched, picks)
    picked_sectors = {p.get('sector_canonical') for p in picks}
    sector_warnings = build_sector_warnings(picked_sectors)

    stock_count = len(picks)
    sector_filled = f'{stock_count}/5'
    score_avg = round(sum((p.get('score') or 0) for p in picks) / max(stock_count, 1))

    warnings = sector_warnings + [
        {'sector': None, 'msg': w, 'suggestions': []} for w in pin_warnings
    ]

    return {
        'summary': {
            'stock_count': stock_count,
            'sector_filled': sector_filled,
            'score_avg': score_avg,
        },
        'warnings': warnings,
        'portfolio': picks,
        'bench': bench,
    }


if __name__ == '__main__':
    import json
    import sys

    # Windows console default cp874 cannot encode Thai + middle-dot — force utf-8
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

    sample_screener = {
        'candidates': [
            {'symbol': 'QH', 'name': 'ควอลิตี้เฮ้าส์', 'sector': 'Property Development',
             'metrics': {'dividend_yield': 7.5, 'pe': 11, 'pb_ratio': 0.85, 'current_price': 1.33},
             'score': 92, 'signals': ['NIWES_5555', 'HIDDEN_VALUE']},
            {'symbol': 'TCAP', 'name': 'ทุนธนชาต', 'sector': 'Banking',
             'metrics': {'dividend_yield': 5.8, 'pe': 8.2, 'pb_ratio': 0.9, 'current_price': 58.25},
             'score': 88, 'signals': ['NIWES_5555', 'HIDDEN_VALUE']},
            {'symbol': 'MC', 'name': 'แม็คกรุ๊ป', 'sector': 'Commerce',
             'metrics': {'dividend_yield': 9.9, 'pe': 10, 'pb_ratio': 1.2, 'current_price': 9.6},
             'score': 85, 'signals': ['NIWES_5555']},
            {'symbol': 'INTUCH', 'name': 'อินทัช', 'sector': 'Information & Communication Technology',
             'metrics': {'dividend_yield': 6.2, 'pe': 13, 'pb_ratio': 1.4, 'current_price': 65.0},
             'score': 82, 'signals': ['NIWES_5555', 'HIDDEN_VALUE']},
            {'symbol': 'PTT', 'name': 'ปตท', 'sector': 'Energy & Utilities',
             'metrics': {'dividend_yield': 7.0, 'pe': 9, 'pb_ratio': 1.0, 'current_price': 32.0},
             'score': 70, 'signals': ['NIWES_5555']},
            {'symbol': 'BBL', 'name': 'กรุงเทพ', 'sector': 'Banking',
             'metrics': {'dividend_yield': 5.5, 'pe': 9, 'pb_ratio': 0.7, 'current_price': 165.0},
             'score': 78, 'signals': ['NIWES_5555']},
            {'symbol': 'CPALL', 'name': 'ซีพี ออลล์', 'sector': 'Commerce',
             'metrics': {'dividend_yield': 2.1, 'pe': 28, 'pb_ratio': 5.5, 'current_price': 60.0},
             'score': 62, 'signals': []},
            {'symbol': 'SCC', 'name': 'ปูนซิเมนต์ไทย', 'sector': 'Construction Materials',
             'metrics': {'dividend_yield': 4.5, 'pe': 12, 'pb_ratio': 1.1, 'current_price': 280.0},
             'score': 75, 'signals': []},
            {'symbol': 'BCP', 'name': 'บางจาก', 'sector': 'Energy & Utilities',
             'metrics': {'dividend_yield': 5.0, 'pe': 7, 'pb_ratio': 0.9, 'current_price': 35.0},
             'score': 68, 'signals': []},
            {'symbol': 'HMPRO', 'name': 'โฮมโปรดักส์', 'sector': 'Commerce',
             'metrics': {'dividend_yield': 3.5, 'pe': 22, 'pb_ratio': 4.2, 'current_price': 11.5},
             'score': 71, 'signals': []},
        ],
        'review_candidates': [],
        'filtered_out_stocks': [],
    }
    sample_watchlist = ['QH', 'TCAP', 'MC', 'INTUCH', 'PTT', 'BBL', 'CPALL', 'SCC', 'BCP', 'HMPRO']

    print('=== TEST 1: No pins ===')
    result = build_portfolio(sample_watchlist, sample_screener)
    print(json.dumps({
        'summary': result['summary'],
        'portfolio_summary': [
            {'rank': p['rank'], 'role': p['role'], 'sym': p['symbol'],
             'sector_canonical': p['sector_canonical'], 'weight_pct': p['weight_pct'],
             'score': p['score']}
            for p in result['portfolio']
        ],
        'bench_count': len(result['bench']),
        'warnings': result['warnings'],
    }, ensure_ascii=False, indent=2))

    print('\n=== TEST 2: Pin BCP (lower-score Energy stock vs PTT) ===')
    result2 = build_portfolio(sample_watchlist, sample_screener, pins=['BCP'])
    energy_pick = [p for p in result2['portfolio'] if p['sector_canonical'] == 'Energy']
    print(f'Energy slot: {energy_pick[0]["symbol"] if energy_pick else "NONE"} (expected BCP)')

    print('\n=== TEST 3: Drop Banking — verify warning ===')
    no_bank = {**sample_screener,
               'candidates': [c for c in sample_screener['candidates'] if c['sector'] != 'Banking']}
    no_bank_wl = [s for s in sample_watchlist if s not in ('TCAP', 'BBL')]
    result3 = build_portfolio(no_bank_wl, no_bank)
    bank_warn = [w for w in result3['warnings'] if w.get('sector') == 'Banking']
    print(f'Banking warning: {bank_warn[0]["msg"] if bank_warn else "MISSING — FAIL"}')
