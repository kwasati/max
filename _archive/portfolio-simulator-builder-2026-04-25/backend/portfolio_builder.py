"""Niwes portfolio construction logic — pure functions, no I/O.

Feature: จัดพอร์ตสไตล์แมกซ์ — 5 หุ้น 5 sector 80/20 weight pattern.
"""
import math
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


def apply_overrides(candidates: list, pins: list, excludes: list) -> tuple:
    """Filter candidates by user pins + excludes.

    Returns (filtered_stocks, warnings). Pins validated against candidates;
    unknown pin symbols surface as warnings.
    """
    warnings = []
    symbols_available = {s.get("symbol") for s in candidates}
    for pin in pins:
        if pin not in symbols_available:
            warnings.append(f"pin symbol not in PASS list: {pin}")
    excludes_set = set(excludes)
    filtered = [s for s in candidates if s.get("symbol") not in excludes_set]
    # Mark pins so downstream can prioritize within sector
    pins_set = set(pins)
    for s in filtered:
        s["_pinned"] = s.get("symbol") in pins_set
    return filtered, warnings


def build_portfolio(
    candidates: list,
    capital=None,
    pins=None,
    excludes=None,
) -> dict:
    """Main entry — build 5-stock portfolio from PASS candidates.

    Flow: overrides → group by sector → top-per-sector (pin wins) →
    allocate 80/20 weights → compute amounts/shares if capital given.
    """
    pins = pins or []
    excludes = excludes or []
    filtered, warnings = apply_overrides(candidates, pins, excludes)
    grouped = group_by_sector(filtered)
    # top-per-sector with pin priority
    picks_per_sector = []
    for sector, stocks in grouped.items():
        if not stocks:
            continue
        pinned = [s for s in stocks if s.get("_pinned")]
        if pinned:
            pick = pinned[0]
        else:
            scored = [(s, niwes_composite_score(s)) for s in stocks]
            scored.sort(key=lambda x: x[1], reverse=True)
            pick = scored[0][0]
        pick["_composite"] = niwes_composite_score(pick)
        picks_per_sector.append(pick)
    picks_per_sector.sort(key=lambda x: x["_composite"], reverse=True)
    picked = allocate_80_20(picks_per_sector)
    if len(picked) < 5:
        warnings.append(
            f"only {len(picked)} sectors available — need 5 for full diversification"
        )
    # Calc amounts + shares if capital provided
    if capital is not None and capital > 0:
        for s in picked:
            amount = capital * s["weight_pct"] / 100
            price = s.get("current_price") or s.get("price") or 0
            s["amount_thb"] = round(amount, 2)
            s["shares"] = math.floor(amount / price) if price > 0 else 0
    # Build response
    scores = [s.get("score", 0) for s in picked]
    return {
        "portfolio": picked,
        "sector_count": len(picks_per_sector),
        "total_score_avg": round(sum(scores) / len(scores), 1) if scores else 0,
        "warnings": warnings,
    }
