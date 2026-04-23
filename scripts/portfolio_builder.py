"""Niwes portfolio construction logic — pure functions, no I/O.

Feature: จัดพอร์ตสไตล์แมกซ์ — 5 หุ้น 5 sector 80/20 weight pattern.
"""
from collections import defaultdict


def niwes_composite_score(stock: dict) -> float:
    """Rank score combining yield + value + hidden + quality. 0 to ~100+."""
    dy = stock.get("dividend_yield") or 0
    pe = stock.get("pe_ratio") or 999
    pbv = stock.get("pb_ratio") or 999
    signals = stock.get("signals") or []
    quality = stock.get("score") or 0

    # yield — reward up to 8%
    yield_score = min(dy, 8) * 3  # up to 24
    # PE value — cheaper is better (PE <= 15)
    pe_value = max(0, (15 - pe) / 15 * 20) if pe > 0 else 0  # up to 20
    # PBV value — cheaper is better (PBV <= 1.5)
    pbv_value = max(0, (1.5 - pbv) / 1.5 * 15) if pbv > 0 else 0  # up to 15
    # Hidden value bonus
    hidden_bonus = 20 if "HIDDEN_VALUE" in signals else 0
    # Quality score contribution (normalize to 0-25)
    quality_contribution = quality * 0.25  # up to 25
    return yield_score + pe_value + pbv_value + hidden_bonus + quality_contribution


def group_by_sector(stocks: list) -> dict:
    """Group PASS stocks by SET sector. Unknown sector bucketed as 'Unknown'."""
    groups = defaultdict(list)
    for s in stocks:
        sector = s.get("sector") or "Unknown"
        groups[sector].append(s)
    return dict(groups)


DEFAULT_WEIGHTS = [40, 35, 12, 8, 5]  # 80/20 Niwes pattern


def allocate_80_20(picks: list) -> list:
    """Assign weights from DEFAULT_WEIGHTS pattern to picks sorted by composite.
    If fewer than 5 picks, rescale proportional to sum 100.
    """
    picks = picks[:5]
    n = len(picks)
    if n == 0:
        return []
    base = DEFAULT_WEIGHTS[:n]
    total = sum(base)
    weights = [round(w / total * 100, 1) for w in base]
    for s, w in zip(picks, weights):
        s["weight_pct"] = w
    return picks


def top_per_sector(grouped: dict) -> list:
    """Pick top-1 per sector by niwes_composite_score, sort desc by composite."""
    picks = []
    for sector, stocks in grouped.items():
        if not stocks:
            continue
        scored = [(s, niwes_composite_score(s)) for s in stocks]
        scored.sort(key=lambda x: x[1], reverse=True)
        top = scored[0][0]
        top["_composite"] = scored[0][1]  # annotate for debugging
        picks.append(top)
    picks.sort(key=lambda x: x["_composite"], reverse=True)
    return picks
