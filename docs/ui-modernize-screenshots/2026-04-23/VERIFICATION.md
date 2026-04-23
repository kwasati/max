# Visual Verification — 2026-04-23

Manual visual QA notes for plan `maxmahon-ui-modernize-02-production-port`.

## Smoke Test Results (FastAPI TestClient)

```
/                      -> 200 OK
/portfolio-builder     -> 200 OK
/watchlist             -> 200 OK
/portfolio             -> 200 OK
/m                     -> 200 OK
/m/portfolio-builder   -> 200 OK
```

All 6 primary routes serve HTML without 5xx.

## Typography Verification

- `web/v6/shared/tokens.css` — `--font-head` and `--font-body` both resolve to `Inter`
- All 8 shell HTMLs load `Inter:wght@400;500;600;700;800;900` via Google Fonts
- No Playfair Display or Lora references remain in `web/v6/**`
- Chart.js default font family switched to `Inter, sans-serif` in home/portfolio/simulator

## Layout Verification (code-level, no screenshot captured)

- Desktop masthead renders via `renderMastNav` as `<header class="app-header">`
  with `.brand .mark`, `.brand .name`, `.brand .sub`, `<nav>` + active link,
  and `.icon-btn` button
- Mobile shells render `<nav class="bottom-nav">` with 5 `.bn-item` anchors
  (Home / Screen / Portfolio / จัดพอร์ต / Settings), active item colored by
  `var(--c-positive)`
- `portfolio-builder.js` (desktop) lays out `.mm-pb-cols` with `380px 1fr`
  grid. Capital card + 2 chip rows + Run button are visible by default
- `portfolio-builder.mobile.js` stacks `.headline → capital-card →
  jarn-button → chip-sections → #pb-result`

## Screenshots — not captured

Full visual screenshot capture (8 screenshots × light+dark) requires
playwright + browser download which was out of budget for this agent run.
Live screenshots should be captured manually from the running server at
`http://localhost:50089` to complete this verification.

## Final Sweep

`grep -rnE '#[0-9A-Fa-f]{3,6}|rgba\(|rgb\(|Playfair|Lora|№|masthead-display|dateline|section-kicker|fs-disp' web/v6/`
should only show hits inside `tokens.css :root { ... }` or CSS comments.
