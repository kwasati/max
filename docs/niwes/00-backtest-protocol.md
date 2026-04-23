# Niwes Backtest Protocol

> Validation framework for the 5-5-5-5 portfolio strategy.
> Code: `scripts/backtest_niwes.py`. Output: `data/backtest_niwes_<range>.json`.

## Run Commands

- **Dry-run (single year):** `py scripts/backtest_niwes.py --years 2566-2566`
- **Full backtest (10 years):** `py scripts/backtest_niwes.py --years 2557-2568`
- **Custom range:** `py scripts/backtest_niwes.py --years 2560-2565 --output data/custom.json`

## JSON Output Format

```json
{
  "yearly_returns": {
    "2566": 0.0716,
    "2567": 0.082,
    "...": "..."
  },
  "total_return": 0.95,
  "max_drawdown": -0.18,
  "sharpe": 1.4,
  "filters": {
    "min_yield_pct": 5.0,
    "min_dividend_streak": 5,
    "max_pe": 15.0,
    "max_pbv": 1.5,
    "max_loss_years": 0,
    "lookback_years": 5
  },
  "portfolio_size": 10
}
```

### Field meanings

- `yearly_returns` — dict of `{Buddhist year: decimal return}`. 0.10 = +10%.
- `total_return` — compounded portfolio return over the full window. 0.95 = +95%.
- `max_drawdown` — worst peak-to-trough decline. -0.18 = -18%.
- `sharpe` — mean / stdev of yearly returns (no risk-free rate adjustment).
- `filters` — frozen Niwes thresholds applied each year.
- `portfolio_size` — top N selected per year (default 10, equal weight).

## Interpretation Rules

| Outcome | Action |
|---|---|
| Niwes return > SET50 by **≥ 200 bps consistently** (≥ 7 of 10 years) | **Framework validated** — proceed to live deployment |
| Niwes return ≈ SET50 (within ±100 bps) | Strategy adds no alpha — review thresholds or drop |
| Niwes return < SET50 by 200+ bps | **Reject baseline** — investigate: regime change, data error, or threshold drift |
| Max drawdown > -30% | Position sizing or stop-loss layer required before going live |
| Sharpe < 0.5 | Risk-adjusted return weak — consider sector/quality weighting overlay |

### Threshold Judgment

- **PASS criterion:** `total_return_niwes - total_return_set50 >= 0.20` (20 percentage points cumulative over 10 years) AND `max_drawdown >= -0.30` AND `sharpe >= 0.6`.
- **FAIL criterion:** any one of the above unmet.
- **Borderline (within 5pp of PASS):** retest with looser/tighter filter combinations to find optimum (e.g. yield 4% vs 5%, P/E 12 vs 15) before deciding.

## Recommendation: When to Run Full Backtest

1. **Wait for `niwes-04-framework-migration` to complete** — that plan migrates the screener pipeline to Niwes-aware logic. Running before then would force re-runs.
2. **After migration:** execute full 10-year backtest (`2557-2568`), save baseline JSON to `data/backtest_baseline.json`.
3. **Plan 06 integration loop:** the baseline becomes the reference point for incremental tuning. Any new filter or weight change must be validated against the baseline before merging.

## Known Limitations (current dry-run version)

- Capital gain returns are approximated by dividend yield only — full implementation needs yahooquery adjusted close prices per year.
- INTUCH and other delisted symbols generate fetch errors (logged, skipped).
- Sharpe ratio uses no risk-free rate — adjust if comparing to industry-standard reports.
- Portfolio rebalance assumes year-end execution at zero cost — real slippage/commission not modeled.

These gaps must be closed before the protocol becomes a production decision tool. They are out of scope for plan `niwes-01-data-adapter-readiness` and tracked for the framework migration plan.
