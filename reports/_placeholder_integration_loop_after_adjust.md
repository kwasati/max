---
agent: Max Mahon v5
type: placeholder
plan: niwes-06-integration-karl-loop
status: pending
---

# Integration Loop — Post-Adjust Scan (Placeholder)

**This file will be generated AFTER Karl:**
1. Completes `/learn niwes` L01-L05 (writes 5 notebook files with ตกผลึก + personal note)
2. Reviews `docs/niwes/13-threshold-adjustments.md` and fills "Lesson justification" fields
3. Approves / rejects / modifies each of the 5 threshold recommendations
4. (If any approved) updates `scripts/screen_stocks.py` with new thresholds
5. Reruns curated scan via `py tmp/run_curated_screen.py`

The resulting file `reports/integration_loop_scan_after_adjust_{YYYY-MM-DD}.md` should then be compared with `reports/integration_loop_scan_2026-04-20.md` for impact analysis.

## Expected Contents (once generated)

- Same scope/universe as baseline (35 stocks or updated set)
- New passed_filter count
- Before/after comparison table (see `docs/niwes/13-threshold-adjustments.md` Post-Adjustment Results section)
- Watchlist status changes (CBG, DITTO, MOSHI → PASS? REVIEW? still DROP?)
- Any new NIWES_5555 tags added
- Any removed previously-passing stocks

## Compare With

- Baseline scan: `reports/integration_loop_scan_2026-04-20.md`
- Decision log: `docs/niwes/13-threshold-adjustments.md`

## Workflow Ownership

- Agent can help Karl rerun scan + generate this file once thresholds are approved
- **But Karl drives the decision** — agent waits for explicit approval signal
