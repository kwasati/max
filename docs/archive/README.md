# Archive — Buffett + เซียนฮง Framework v3

## Rationale

This folder preserves the **Buffett-Quality + เซียนฮง สถาพร** framework that powered Max Mahon v4 from v3.x → just before the Niwes pivot (niwes-04-framework-migration).

We are not throwing this away. The Buffett+เซียนฮง logic is kept verbatim for:

- **Future reference** — if Niwes 5-5-5-5 proves too strict (e.g. <5 stocks pass on most weeks) we can compare/blend
- **A/B comparison** — re-run the old screener side-by-side to see which framework would have caught winners we miss
- **Historical record** — hard filters and quality score weights from this era are documented in scan reports under `reports/scan_*.md` (pre-2026-04-20)

## Files

- `buffett_seanhong_screener_v3.py.txt` — copy of `scripts/screen_stocks.py` at the niwes-02 merge commit
- `buffett_seanhong_scan_v3.py.txt` — copy of `scripts/scan.py` at the niwes-02 merge commit

## Snapshot Commit

- **Branch:** `main`
- **Commit hash:** `8c308d6` — "merge: niwes-02-research-report (15 tasks, 14 docs)"
- **Date:** 2026-04-20
- **Reason for archive:** about to replace framework with Niwes 100% in `niwes-04-framework-migration`

## Restore

If you ever need to revert:

```bash
git show 8c308d6:scripts/screen_stocks.py > scripts/screen_stocks.py
git show 8c308d6:scripts/scan.py > scripts/scan.py
```

Or copy from the .txt snapshots in this folder back to `scripts/`.
