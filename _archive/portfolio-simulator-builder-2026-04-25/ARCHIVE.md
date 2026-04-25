# Portfolio + Builder + Simulator — Archived 2026-04-25

## Reason
Karl removed these 3 features to focus MaxMahon scope on: screener + watchlist + report only.

## What's archived
- **Portfolio** — real + simulated portfolio tracking, transactions, P&L
- **Portfolio Builder** — Niwes 5-sector 80/20 auto-allocator
- **Simulator** — DCA single + multi + portfolio backtest

## Restore
`git revert <this-commit-sha>` to bring back all 3 features.

## Contents
- `frontend/` — 4 shell HTML files (desktop + mobile portfolio + portfolio-builder)
- `frontend/pages/` — 6 JS modules (portfolio + portfolio-builder + simulator, desktop + .mobile)
- `backend/portfolio_builder.py` — Niwes composite scorer + 80/20 allocator
- `backend/app-py-removed-endpoints.py` — extracted endpoint code from server/app.py before deletion
- `backend/user_data-fields-removed.json` — `transactions` + `cash_reserve` + `simulated_portfolio` values backed up before removal
- `styles/extracted-css.css` — portfolio + simulator + portfolio-builder CSS blocks extracted from components.css
