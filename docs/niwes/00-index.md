# 00-index.md — Niwes Research Master Index

> **Purpose:** ดร.นิเวศน์ เหมวชิรวรากร deep research corpus for Karl + MaxMahon Thai stock analyst agent.
> **Compiled:** 2026-04-20 (niwes-02 plan)
> **Authority:** [00-research-rules.md](00-research-rules.md) — verbatim quote rule applies to every file.

---

## Files in This Folder

| # | File | Purpose | Word count (approx) |
|---|---|---|---|
| 00a | [00-sources.md](00-sources.md) | 57 sources, ≥82% HTTP-verified | ~600 |
| 00b | [00-research-rules.md](00-research-rules.md) | Verbatim quote rule (5 rules) | ~400 |
| 00c | [00-data-schema.md](00-data-schema.md) | (from niwes-01) — data schema | — |
| 00d | [00-backtest-protocol.md](00-backtest-protocol.md) | (from niwes-01) — backtest protocol | — |
| 01 | [01-biography.md](01-biography.md) | Life, education, 1997 layoff, milestones | ~1,200 |
| 02 | [02-investment-journey.md](02-investment-journey.md) | Timeline 1997 → 2025 (15+ year-events) | ~1,400 |
| 03 | [03-philosophy.md](03-philosophy.md) | 8 core principles + Graham/Buffett comparison | ~1,000 |
| 04 | [04-criteria.md](04-criteria.md) | 13 stock-selection criteria + 5-5-5-5 formula | ~1,200 |
| 05 | [05-portfolio-construction.md](05-portfolio-construction.md) | Allocation 30-30-30-10, sizing, rebalance | ~700 |
| 06 | [06-case-cpall.md](06-case-cpall.md) | CPALL 17-year hold via wife's account | ~700 |
| 07 | [07-case-tcap.md](07-case-tcap.md) | TCAP cheap PE + hidden TMB | ~600 |
| 08 | [08-case-qh.md](08-case-qh.md) | QH hidden value via HMPRO 19.87% (KEY model) | ~800 |
| 09 | [09-case-or-exit.md](09-case-or-exit.md) | OR exit (with [VERIFY] flags) | ~500 |
| 10 | [10-case-vietnam-fpt.md](10-case-vietnam-fpt.md) | Vietnam pivot + FPT + ตีแตก จำกัด | ~900 |
| 11 | [11-current-portfolio.md](11-current-portfolio.md) | Latest Dec 2025 holdings table | ~800 |
| 12 | [12-recent-views-2025-2026.md](12-recent-views-2025-2026.md) | 10 verbatim quotes + 2024–2025 reasoning | ~1,100 |

**Total niwes-02 output:** 14 files (00-sources, 00-research-rules + 01–12).

---

## Integration Loop (niwes-06)

Feedback loop ระหว่าง Niwes framework กับการใช้งานจริงของ Karl — ดูว่า watchlist ปัจจุบันตรงกับ framework แค่ไหน + adjust threshold ถ้าจำเป็น (ต้อง data-driven + หลัง Karl เรียน lessons).

| File | Purpose |
|---|---|
| [13-threshold-adjustments.md](13-threshold-adjustments.md) | Decision log — 5 threshold recommendations PENDING Karl review |
| `../../reports/integration_loop_scan_2026-04-20.md` | Baseline Niwes scan (curated 35 stocks, 11 pass) |
| `../../reports/integration_loop_watchlist_diff_2026-04-20.md` | Watchlist comparison — 13/15 DROP + pattern analysis |
| `../../reports/integration_loop_karl_todo_2026-04-20.md` | Karl learning TODO (L01-L05) + decision matrix |
| `../../reports/_placeholder_integration_loop_after_adjust.md` | Placeholder for post-adjust scan (fill after Karl approves) |

**Workflow:** Karl completes L01-L05 → reviews pattern analysis → approves threshold adjustments in `13-threshold-adjustments.md` → agent applies + reruns scan

**Why integration loop:** framework ที่ไม่ถูกใช้จริง = เสียเปล่า. Pattern analysis ต้องมา feedback เข้า criteria ไม่ใช่ build แล้วทิ้ง

---

## Quick Start (Read in This Order)

If you have **30 minutes** and need to onboard fast:

1. [01-biography.md](01-biography.md) — who he is + 1997 turning point
2. [03-philosophy.md](03-philosophy.md) — 8 core principles
3. [04-criteria.md](04-criteria.md) — 5-5-5-5 + 13 selection rules
4. [11-current-portfolio.md](11-current-portfolio.md) — what he actually owns now
5. [12-recent-views-2025-2026.md](12-recent-views-2025-2026.md) — what he's saying RIGHT NOW

If you have **2 hours** and want depth, add:

6. [02-investment-journey.md](02-investment-journey.md) — full timeline
7. [05-portfolio-construction.md](05-portfolio-construction.md) — allocation + sizing logic
8. [08-case-qh.md](08-case-qh.md) — KEY mental model (hidden value)
9. [10-case-vietnam-fpt.md](10-case-vietnam-fpt.md) — geographic diversification + Berkshire model
10. [06-case-cpall.md](06-case-cpall.md) + [07-case-tcap.md](07-case-tcap.md) — long-hold case studies
11. [09-case-or-exit.md](09-case-or-exit.md) — when to sell
12. [00-sources.md](00-sources.md) + [00-research-rules.md](00-research-rules.md) — verify anything yourself

---

## For MaxMahon Framework — File-to-Feature Mapping

ใช้เป็น input โดยตรงสำหรับ niwes-04-framework-migration:

| MaxMahon Feature | Source File(s) | What to extract |
|---|---|---|
| Hard filter rules (replace Buffett+เซียนฮง) | [04-criteria.md](04-criteria.md) | 5-5-5-5 + PE 7-8 + PBV<1 + yield ≥5% + sector mix |
| Quality Score weights | [03-philosophy.md](03-philosophy.md) + [04-criteria.md](04-criteria.md) | Dividend 35 → bump to 45 (Niwes prioritizes dividend > growth) |
| Signal tags (DIVIDEND_KING etc.) | [04-criteria.md](04-criteria.md) | Add NIWES_5555 tag (passes all 4 fives), HIDDEN_VALUE tag (sum-of-parts > mcap) |
| Portfolio construction (allocation) | [05-portfolio-construction.md](05-portfolio-construction.md) | 30/30/30/Cash + 5-stock concentration in 5 sectors |
| Sell trigger / exit logic | [09-case-or-exit.md](09-case-or-exit.md) + [02-investment-journey.md](02-investment-journey.md) | Thesis change (not price-based stop) + structural shift |
| Foreign-stock workflow | [10-case-vietnam-fpt.md](10-case-vietnam-fpt.md) | VN core 8-stock + FPT type, Holding-co structure |
| Monitoring loop trigger | [12-recent-views-2025-2026.md](12-recent-views-2025-2026.md) | Track macro statements vs portfolio drift |

---

## For Karl Personally — Decision Aid Reference

| Decision | Read |
|---|---|
| "Should I buy this Thai stock today?" | [04-criteria.md](04-criteria.md) → check 5-5-5-5 |
| "Is my port too concentrated?" | [05-portfolio-construction.md](05-portfolio-construction.md) → 5 sectors check |
| "Should I add VN exposure?" | [10-case-vietnam-fpt.md](10-case-vietnam-fpt.md) + [12-recent-views-2025-2026.md](12-recent-views-2025-2026.md) |
| "Should I sell this loser?" | [09-case-or-exit.md](09-case-or-exit.md) → thesis change vs price drop |
| "What's Niwes saying right now?" | [12-recent-views-2025-2026.md](12-recent-views-2025-2026.md) |

---

## Verification Status

- ✓ ≥30 sources collected (57 actual)
- ✓ ≥80% HTTP-verified (82.5%)
- ✓ Verbatim quote rule documented + enforced
- ✓ Zero `[VERIFY]` flags in 01-biography.md
- ✓ Zero `[VERIFY]` flags in 04-criteria.md
- ✓ All `[VERIFY]` flags in 09 + 11 are explicit + reasoned
- ✓ All relative links use plain filename (works from same dir)

---

## What This Folder is NOT

- Not a stock recommendation
- Not personal financial advice
- Not real-time data — snapshot as of Dec 2025 / earlier
- Not a complete biography (covers VI career; doesn't cover personal/family in depth beyond what's needed for context)

For real-time signals → use MaxMahon agent built on top of this corpus.
For deeper personal life details → see ดร.นิเวศน์'s books (ตีแตก / VI ฉบับเซียน / เซียนหุ้นมือทอง).
