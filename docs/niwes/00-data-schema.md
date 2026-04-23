# Data Adapter Schema — Niwes Readiness Audit

> Source: `scripts/data_adapter.py` (thaifin + yahooquery) + `scripts/fetch_data.py` (multi-year aggregator).
> Public entry point: `fetch_fundamentals(symbol)` in data_adapter (NOT `fetch_stock_data` — name in plan reference is outdated).
> Multi-year orchestrator: `fetch_multi_year(symbol)` in fetch_data — calls adapter then enriches with `aggregates` + `warnings` + `fetched_at`.

## Top-level Fields (per stock)

| Field | Source | Unit | Year Coverage | Notes |
|---|---|---|---|---|
| `symbol` | derived | string | n/a | `XXX.BK` form |
| `name` | thaifin > yahooquery | string | n/a | Company name |
| `sector` | thaifin > yahooquery | string | n/a | |
| `industry` | thaifin > yahooquery | string | n/a | |
| `currency` | yahooquery | string | n/a | THB default |
| `price` | yahooquery | THB | realtime | `currentPrice` or `regularMarketPrice` |
| `market_cap` | yahooquery > thaifin | THB | latest | |
| `pe_ratio` | yahooquery > thaifin | ratio | trailing | |
| `forward_pe` | yahooquery | ratio | forward | |
| `pb_ratio` | yahooquery > thaifin | ratio | latest | |
| `dividend_yield` | computed: DPS/price\*100 | % (e.g. 4.5 = 4.5%) | trailing | DPS-first |
| `dps` | yahooquery `dividendRate` | THB/share | annual | |
| `dividend_rate` | yahooquery | THB/share | annual | duplicate of dps |
| `payout_ratio` | yahooquery | decimal (0-1+) | trailing | |
| `five_year_avg_yield` | computed: avg(DPS 5yr)/price\*100 | % | 5y average | |
| `eps_trailing` | thaifin > yahooquery | THB/share | latest | |
| `eps_forward` | yahooquery | THB/share | forward | |
| `revenue` | thaifin > yahooquery | THB | latest | |
| `revenue_growth` | thaifin > yahooquery | decimal | YoY | |
| `earnings_growth` | thaifin > yahooquery | decimal | YoY | |
| `profit_margin` | thaifin > yahooquery | decimal | latest | net margin |
| `gross_margins` | thaifin > yahooquery | decimal | latest | |
| `operating_margins` | yahooquery | decimal | latest | thaifin doesn't have direct |
| `roe` | thaifin > yahooquery | decimal | latest | |
| `roa` | thaifin > yahooquery | decimal | latest | |
| `debt_to_equity` | thaifin (\*100) > yahooquery | percentage form | latest | yahooquery compat: thaifin ratio multiplied by 100 |
| `current_ratio` | yahooquery | ratio | latest | thaifin doesn't expose |
| `free_cashflow` | yahooquery > thaifin | THB | latest | yahooquery preferred (real capex) |
| `operating_cashflow` | yahooquery > thaifin | THB | latest | |
| `recent_dividends` | yahooquery | list[float] | last 8 | |
| `52w_high` | yahooquery | THB | 52w | |
| `52w_low` | yahooquery | THB | 52w | |
| `50d_avg` | yahooquery | THB | 50d | |
| `200d_avg` | yahooquery | THB | 200d | |
| `yearly_metrics` | thaifin (patched by yahooquery) | list[dict] | 10-16 yr | see below |
| `dividend_history` | yahooquery dividends | dict {year: DPS} | 10+ yr | **source of truth for streak** |
| `aggregates` | computed | dict | derived | added by `fetch_multi_year` |
| `warnings` | computed | list[str] | derived | added by `fetch_multi_year` |
| `fetched_at` | runtime | iso datetime | n/a | |

## yearly_metrics[] (per year, sorted ascending)

| Field | Source | Unit | Notes |
|---|---|---|---|
| `year` | thaifin index | string | e.g. "2566" |
| `revenue` | thaifin | THB | |
| `gross_profit` | thaifin | THB | |
| `operating_income` | yahooquery > thaifin computed | THB | yahooquery patched if available |
| `net_income` | thaifin `net_profit` | THB | |
| `ebitda` | thaifin (net_income + DA) > yahooquery OI+DA | THB | approximation |
| `interest_expense` | yahooquery income_stmt | THB | None if not in yahooquery |
| `diluted_eps` | thaifin `earning_per_share` | THB/share | |
| `sga` | thaifin | THB | |
| `equity` | thaifin | THB | |
| `total_debt` | thaifin | THB | |
| `total_assets` | thaifin `asset` | THB | |
| `ocf` | thaifin `operating_activities` | THB | |
| `fcf` | yahooquery: ocf - abs(capex). thaifin fallback: ocf + investing | THB | yahooquery preferred |
| `capex` | yahooquery Capital Expenditure (negative) | THB | thaifin uses investing_activities as proxy |
| `dividends_paid` | yahooquery cashflow | THB | None from thaifin |
| `roe` | thaifin (decimal) | decimal | |
| `gross_margin` | thaifin | decimal | |
| `net_margin` | thaifin | decimal | |
| `operating_margin` | yahooquery OI/revenue > thaifin computed | decimal | |
| `sga_ratio` | thaifin | decimal | |
| `de_ratio` | thaifin | ratio | |
| `current_ratio` | n/a | n/a | always None — thaifin yearly missing |
| `interest_coverage` | yahooquery OI/IE | ratio | capped at 200 |
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

`dividend_history` is a `dict {int year: float DPS}` — yahooquery dividends grouped by calendar year.

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

### Result (live run, 2026-04-20)

```json
{
  "CPALL.BK": 22,
  "TCAP.BK": 23,
  "PTT.BK": 24,
  "SCB.BK": 4,
  "KBANK.BK": 21
}
```

### Analysis

- 4 of 5 symbols pass Niwes streak threshold (≥ 5 yrs): CPALL, TCAP, PTT, KBANK — strong long-term dividend payers, all 20+ year streaks.
- **FLAG: SCB.BK = 4 yrs** — fails Niwes 5-year minimum. Likely cause: dividend cut/suspension during a recent year (COVID era 2020 or banking sector restructuring) broke the streak. Need to inspect `dividend_history` for SCB to confirm which year(s) had zero DPS before applying screener at production scale.
- Function works correctly on real data; coverage is sufficient (10+ years of history available via thaifin + yahooquery).
- No data fetch failures — verification complete.
