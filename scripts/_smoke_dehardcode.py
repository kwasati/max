"""Smoke test for Plan D backend de-hardcode (portfolio_builder dynamic suggestions)."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))


def test_compute_sector_suggestions_top3_by_score():
    from portfolio_builder import compute_sector_suggestions
    screener = {
        'candidates': [
            {'symbol': 'CPNREIT.BK', 'score': 70, 'sector': 'Property Fund & REITs'},
            {'symbol': 'AIMIRT.BK', 'score': 60, 'sector': 'Property Fund & REITs'},
            {'symbol': 'DIF.BK', 'score': 30, 'sector': 'Property Fund & REITs'},
            {'symbol': 'BBL.BK', 'score': 80, 'sector': 'Banking'},
        ]
    }
    out = compute_sector_suggestions(screener)
    assert out['REIT-PFund'][:3] == ['CPNREIT', 'AIMIRT', 'DIF'], f"expected top 3 by score, got {out['REIT-PFund']}"
    assert out['Banking'][0] == 'BBL', f"expected BBL top, got {out['Banking']}"
    print('[PASS] compute_sector_suggestions returns top 3 by score per canonical sector')


def test_compute_sector_suggestions_empty_fallback():
    from portfolio_builder import compute_sector_suggestions, STATIC_SECTOR_SUGGESTIONS
    out = compute_sector_suggestions({'candidates': []})
    assert out['REIT-PFund'] == STATIC_SECTOR_SUGGESTIONS['REIT-PFund'], 'expected fallback to static'
    assert out['Banking'] == STATIC_SECTOR_SUGGESTIONS['Banking']
    print('[PASS] compute_sector_suggestions falls back to static when scan empty')


def test_build_sector_warnings_uses_passed_suggestions():
    from portfolio_builder import build_sector_warnings
    custom = {'REIT-PFund': ['CPNREIT', 'AIMIRT'], 'Banking': ['BBL'], 'Property': ['QH'], 'Energy': ['PTT']}
    warnings = build_sector_warnings({'Banking'}, custom)
    msg_text = ' '.join(w['msg'] for w in warnings)
    assert 'CPNREIT' in msg_text, f'expected CPNREIT in warnings msg, got: {msg_text}'
    assert 'DIF' not in msg_text or 'CPNREIT' in msg_text, 'should use passed suggestions, not static DIF list'
    print('[PASS] build_sector_warnings uses passed suggestions')


if __name__ == '__main__':
    failures = []
    tests = [
        test_compute_sector_suggestions_top3_by_score,
        test_compute_sector_suggestions_empty_fallback,
        test_build_sector_warnings_uses_passed_suggestions,
    ]
    for fn in tests:
        try:
            fn()
        except AssertionError as e:
            failures.append(f'{fn.__name__}: {e}')
            print(f'[FAIL] {fn.__name__}: {e}')
        except Exception as e:
            failures.append(f'{fn.__name__}: {type(e).__name__}: {e}')
            print(f'[FAIL] {fn.__name__}: {type(e).__name__}: {e}')
    print()
    if failures:
        print(f'[FAIL] {len(failures)} test(s) failed: {failures}')
        sys.exit(1)
    print(f'[PASS] all {len(tests)} tests passed')
    sys.exit(0)
