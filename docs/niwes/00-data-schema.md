# Data Adapter Schema — Niwes Readiness Audit

> Source: `scripts/data_adapter.py` (thaifin + yfinance) + `scripts/fetch_data.py` (multi-year aggregator).
> Public entry point: `fetch_fundamentals(symbol)` in data_adapter (NOT `fetch_stock_data` — name in plan reference is outdated).
> Multi-year orchestrator: `fetch_multi_year(symbol)` in fetch_data — calls adapter then enriches with `aggregates` + `warnings` + `fetched_at`.

## Top-level Fields (per stock)

| Field | Source | Unit | Year Coverage | Notes |
|---|---|---|---|---|
| `symbol` | derived | string | n/a | `XXX.BK` form |
| `name` | thaifin > yfinance | string | n/a | Company name |
| `sector` | thaifin > yfinance | string | n/a | |
| `industry` | thaifin > yfinance | string | n/a | |
| `currency` | yfinance | string | n/a | THB default |
| `price` | yfinance | THB | realtime | `currentPrice` or `regularMarketPrice` |
| `market_cap` | yfinance > thaifin | THB | latest | |
| `pe_ratio` | yfinance > thaifin | ratio | trailing | |
| `forward_pe` | yfinance | ratio | forward | |
| `pb_ratio` | yfinance > thaifin | ratio | latest | |
| `dividend_yield` | computed: DPS/price\*100 | % (e.g. 4.5 = 4.5%) | trailing | DPS-first |
| `dps` | yfinance `dividendRate` | THB/share | annual | |
| `dividend_rate` | yfinance | THB/share | annual | duplicate of dps |
| `payout_ratio` | yfinance | decimal (0-1+) | trailing | |
| `five_year_avg_yield` | computed: avg(DPS 5yr)/price\*100 | % | 5y average | |
| `eps_trailing` | thaifin > yfinance | THB/share | latest | |
| `eps_forward` | yfinance | THB/share | forward | |
| `revenue` | thaifin > yfinance | THB | latest | |
| `revenue_growth` | thaifin > yfinance | decimal | YoY | |
| `earnings_growth` | thaifin > yfinance | decimal | YoY | |
| `profit_margin` | thaifin > yfinance | decimal | latest | net margin |
| `gross_margins` | thaifin > yfinance | decimal | latest | |
| `operating_margins` | yfinance | decimal | latest | thaifin doesn't have direct |
| `roe` | thaifin > yfinance | decimal | latest | |
| `roa` | thaifin > yfinance | decimal | latest | |
| `debt_to_equity` | thaifin (\*100) > yfinance | percentage form | latest | yfinance compat: thaifin ratio multiplied by 100 |
| `current_ratio` | yfinance | ratio | latest | thaifin doesn't expose |
| `free_cashflow` | yfinance > thaifin | THB | latest | yfinance preferred (real capex) |
| `operating_cashflow` | yfinance > thaifin | THB | latest | |
| `recent_dividends` | yfinance | list[float] | last 8 | |
| `52w_high` | yfinance | THB | 52w | |
| `52w_low` | yfinance | THB | 52w | |
| `50d_avg` | yfinance | THB | 50d | |
| `200d_avg` | yfinance | THB | 200d | |
| `yearly_metrics` | thaifin (patched by yfinance) | list[dict] | 10-16 yr | see below |
| `dividend_history` | yfinance dividends | dict {year: DPS} | 10+ yr | **source of truth for streak** |
| `aggregates` | computed | dict | derived | added by `fetch_multi_year` |
| `warnings` | computed | list[str] | derived | added by `fetch_multi_year` |
| `fetched_at` | runtime | iso datetime | n/a | |

## yearly_metrics[] (per year, sorted ascending)

| Field | Source | Unit | Notes |
|---|---|---|---|
| `year` | thaifin index | string | e.g. "2566" |
| `revenue` | thaifin | THB | |
| `gross_profit` | thaifin | THB | |
| `operating_income` | yfinance > thaifin computed | THB | yfinance patched if available |
| `net_income` | thaifin `net_profit` | THB | |
| `ebitda` | thaifin (net_income + DA) > yfinance OI+DA | THB | approximation |
| `interest_expense` | yfinance income_stmt | THB | None if not in yfinance |
| `diluted_eps` | thaifin `earning_per_share` | THB/share | |
| `sga` | thaifin | THB | |
| `equity` | thaifin | THB | |
| `total_debt` | thaifin | THB | |
| `total_assets` | thaifin `asset` | THB | |
| `ocf` | thaifin `operating_activities` | THB | |
| `fcf` | yfinance: ocf - abs(capex). thaifin fallback: ocf + investing | THB | yfinance preferred |
| `capex` | yfinance Capital Expenditure (negative) | THB | thaifin uses investing_activities as proxy |
| `dividends_paid` | yfinance cashflow | THB | None from thaifin |
| `roe` | thaifin (decimal) | decimal | |
| `gross_margin` | thaifin | decimal | |
| `net_margin` | thaifin | decimal | |
| `operating_margin` | yfinance OI/revenue > thaifin computed | decimal | |
| `sga_ratio` | thaifin | decimal | |
| `de_ratio` | thaifin | ratio | |
| `current_ratio` | n/a | n/a | always None — thaifin yearly missing |
| `interest_coverage` | yfinance OI/IE | ratio | capped at 200 |
| `ocf_ni_ratio` | computed | ratio | None if NI <= 0 |
| `capital_intensity` | computed | ratio | abs(capex)/ocf |

## aggregates (computed by `_build_aggregates` in fetch_data.py)

| Field | Unit | Notes |
|---|---|---|
| `revenue_cagr` | decimal | from yearly revenue list |
| `eps_cagr` | decimal | rejects negatives |
| `dps_cagr` | decimal | from dividend_history |
| `avg_roe` | decimal | mean of yearly ROE |
| `min_roe` | decimal | worst year |
| `avg_net_margin` | decimal | |
| `avg_gross_margin` | decimal | |
| `avg_operating_margin` | decimal | |
| `revenue_growth_years` | int | count of YoY positive years |
| `revenue_growth_total_comparisons` | int | denominator |
| `eps_positive_years` | int | |
| `eps_total_years` | int | |
| `fcf_positive_years` | int | |
| `fcf_total_years` | int | |
| `dividend_streak` | int | **consecutive years with DPS > 0 (from latest year-1 backward)** |
| `dividend_growth_streak` | int | consecutive years DPS strictly increased |
| `years_of_data` | int | length of yearly_metrics |
| `latest_interest_coverage` | ratio | latest year only |
| `latest_ocf_ni_ratio` | ratio | latest year only |
| `latest_capital_intensity` | ratio | latest year only |

## Highlighted: Dividend Streak Logic

`count_dividend_streak(dps_by_year)` in `fetch_data.py` line 76:

- Iterates years descending, skipping current year (incomplete)
- Counts consecutive years where `dps > 0`
- Stops at first zero/missing year
- Returns int (0 if no data)

`dividend_history` is a `dict {int year: float DPS}` — yfinance dividends grouped by calendar year.

## Niwes Requirement Gaps (what's MISSING for 5-5-5-5 framework)

| Niwes Requirement | Available? | Gap / Action |
|---|---|---|
| Dividend Yield ≥ 5% | YES | `dividend_yield` field already exists |
| Dividend Streak ≥ 5 yrs | YES | `aggregates.dividend_streak` |
| P/E ≤ 15 | YES | `pe_ratio` |
| P/BV ≤ 1.5 | YES | `pb_ratio` |
| No loss in 5 years | YES (derivable) | `eps_positive_years` / `yearly_metrics[].net_income` |
| **Normalized earnings** (exclude extraordinary items) | NO | Need `compute_normalized_earnings()` — Task 2.1 |
| **Payout sustainability** (ratio < 80% AND fcf_yield > div_yield) | NO | Need `compute_payout_sustainability()` — Task 2.2 |
| **Hidden value flag** (parent holds subsidiary worth more than market cap) | NO | Need `data/hidden_value_holdings.json` + `check_hidden_value()` — Task 2.3 |

## Verification

Run live data check (5 large/well-known symbols):

```bash
cd projects/MaxMahon
py -c "from scripts.data_adapter import fetch_fundamentals; from scripts.fetch_data import count_dividend_streak; import json; symbols = ['CPALL.BK', 'TCAP.BK', 'PTT.BK', 'SCB.BK', 'KBANK.BK']; results = {s: count_dividend_streak((fetch_fundamentals(s) or {}).get('dividend_history', {})) for s in symbols}; print(json.dumps(results, indent=2))"
```

> NOTE: Plan reference uses `fetch_stock_data` — actual function is `fetch_fundamentals` (data_adapter) or `fetch_multi_year` (fetch_data). Verification command above uses the correct name.

### Result

(captured by Task 1.2 — see next commit)

### Analysis

(captured by Task 1.2)
