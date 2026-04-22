# Max Mahon v6 — Design Mockup

**Deliverable:** visual direction for the v6 frontend redesign. Open `index.html` first.

## What this is
Ten clickable HTML mockups (5 pages × desktop + mobile) plus a cover/landing page, styled as a vintage financial newspaper. No backend integration, no build step — open any `.html` directly in a browser.

## Visual identity
- **Palette:** cream (`#F4EFE6`) + ink (`#1A1814`) + oxblood accent (`#7A1F2B`). No other hues.
- **Fonts:** Playfair Display (headlines + scores), Lora (body), IBM Plex Serif Thai (Thai fallback), JetBrains Mono (numbers).
- **Hierarchy:** weight, italic, rule lines (thin/thick/double), drop caps, section numbers (№ 01). Never by color. Never by icon.
- **No shadows, no gradients, no rounded corners above 2px.**

## File map
```
index.html                  — cover + TOC + design rationale + palette + type specimens
shared/tokens.css           — CSS variables (colors, fonts, spacing, rule weights)
shared/base.css             — masthead, card, rule, pull-quote, drop-cap, table, button
shared/mobile.css           — mobile-specific overrides (stacked, bottom nav, touch targets)
desktop/01-home.html        — watchlist dashboard
desktop/02-report.html      — BBL full report (10 sections, donut + bar + line charts)
desktop/03-watchlist.html   — saved positions + compare view
desktop/04-portfolio.html   — real + simulated (2 stacked sections, donut pies)
desktop/05-simulator.html   — 3-tab DCA/backtest (Chart.js line charts)
desktop/06-settings.html    — scan schedule, threshold sliders, universe radio
mobile/01-06                — portrait variants, bottom nav, single-column
```

## Data
All sample data uses realistic Thai dividend stocks (BBL, TCAP, INTUCH, KBANK, SCB, QH, LH, CPALL, BJC, TOP, PTT, MAKRO, AOT, ADVANC, AP, SCCC). Numbers are illustrative — not live from backend.

## Decisions worth flagging for Karl

- **Dividend History as 10-year bar chart** — currently the full report section 7 shows DPS bars. If Karl wants yield% overlay or a dual-axis, this is the first thing to change.
- **Score History line has a benchmark overlay** in simulator backtest (SET index) — made this up for visual density; confirm if you want that or just the portfolio line alone.
- **Compare view** is embedded on the watchlist page (not a separate modal). If it needs to be a real overlay with backdrop, needs different treatment.
- **Deep analyze button** renders a "pending" state example — UX for the polling/streaming result needs its own micro-mockup when we build for real.
- **Mobile simulator uses a dropdown** instead of tabs (horizontal scroll tabs on mobile are ugly). If Karl prefers swipe-between-tabs, the layout would shift.
- **Settings has no Telegram alert UI** — removed per spec (those live in `.env`).
- **No dark mode** — newspapers aren't dark. If Karl wants one, it's a whole separate design pass (inverted cream/ink doesn't just flip).
- **No notification or alert center UI** — not in scope.

## Known gaps (deliberate)
- No accessibility audit beyond min touch targets
- No print stylesheet (though the print-era aesthetic would translate)
- No real-data integration — `onclick` handlers just navigate, don't fetch
- No service worker / offline mode
- No loading skeletons (everything shows populated sample data)

## How to view
Open `index.html` in any browser. All fonts load from Google Fonts CDN, Chart.js from jsdelivr CDN. Works offline once cached.
