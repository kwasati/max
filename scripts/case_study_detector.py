"""Niwes Case Study + Moat Pattern Detector.

Pure functions module — matches stock dicts against deterministic rules
(sector keywords + metric thresholds) to produce case study tags and moat tags.
Patterns loaded from data/case_study_patterns.json at import time.

No side effects except pattern file load. No LLM. No network.
"""
import json
from pathlib import Path

_PATTERNS_PATH = Path(__file__).resolve().parent.parent / "data" / "case_study_patterns.json"


def load_patterns() -> dict:
    """Load case study patterns JSON. Returns dict of {tag_name: pattern_def}."""
    return json.loads(_PATTERNS_PATH.read_text(encoding="utf-8"))


def _matches_sector(stock_sector: str, keywords: list[str]) -> bool:
    s = (stock_sector or "").lower()
    return any(kw.lower() in s for kw in keywords)


def detect_case_study_tags(stock: dict, patterns: dict) -> list[str]:
    """Match stock against all non-disabled, non-anti patterns. Return list of matching tag strings.

    Caller must pre-populate stock['_hidden_holdings'] (from data_adapter.check_hidden_value)
    for HOLDING_CO_HIDDEN-style patterns to evaluate correctly.
    """
    tags = []
    agg = stock.get("aggregates") or {}
    streak = agg.get("dividend_streak", 0)
    dy = stock.get("dividend_yield") or 0
    pe = stock.get("pe_ratio")
    pbv = stock.get("pb_ratio")
    mcap = stock.get("market_cap") or 0
    sector = stock.get("sector", "")
    symbol = stock.get("symbol", "")
    for p in patterns.values():
        if p.get("anti_rules") or p.get("disabled"):
            continue
        r = p.get("rules", {})
        if "exclude_symbols" in r and symbol in r["exclude_symbols"]:
            continue
        if "sector_keywords" in r and not _matches_sector(sector, r["sector_keywords"]):
            continue
        if "dividend_streak_min" in r and streak < r["dividend_streak_min"]:
            continue
        if "dividend_yield_min" in r and dy < r["dividend_yield_min"]:
            continue
        if "pe_max" in r and (pe is None or pe <= 0 or pe > r["pe_max"]):
            continue
        if "pbv_max" in r and (pbv is None or pbv <= 0 or pbv > r["pbv_max"]):
            continue
        if "market_cap_min" in r and mcap < r["market_cap_min"]:
            continue
        if r.get("has_hidden_holdings"):
            hh = stock.get("_hidden_holdings") or []
            if not hh:
                continue
            hidden_total = sum(
                (h.get("holding_mcap") or 0) * (h.get("stake_pct", 0) / 100.0) for h in hh
            )
            if hidden_total < r.get("hidden_value_vs_mcap_min", 1.0) * mcap:
                continue
        tags.append(p["tag"])
    return tags


_PETROLEUM_EXCLUDE = {
    "PTT.BK", "PTTEP.BK", "BCP.BK", "TOP.BK", "ESSO.BK",
    "SPRC.BK", "IRPC.BK", "OR.BK",
}


def detect_moat_tags(stock: dict) -> list[str]:
    """Deterministic moat tag detection based on sector + margin + streak + mcap heuristics.

    - BRAND_MOAT: consumer/commerce/food/beverage + net_margin > 20% + streak >= 10y
    - STRUCTURAL_MOAT: utility/transport/telecom/infrastructure + mcap >= 50B
    - GOVT_LOCKIN: sector/industry contains government/e-document/public service/ราชการ

    Petroleum tickers excluded from STRUCTURAL_MOAT since SET groups them under same
    'Energy & Utilities' sector as power gen/utility — semantic mismatch (cyclical vs defensive).
    """
    tags = []
    sector = (stock.get("sector") or "").lower()
    industry = (stock.get("industry") or "").lower()
    agg = stock.get("aggregates") or {}
    nm = stock.get("profit_margin") or agg.get("avg_net_margin") or 0
    streak = agg.get("dividend_streak", 0)
    mcap = stock.get("market_cap") or 0
    symbol = stock.get("symbol", "")
    combo = sector + " " + industry
    if (any(k in sector for k in ["commerce", "food", "beverage", "consumer"])
            and nm > 0.20 and streak >= 10):
        tags.append("BRAND_MOAT")
    if (any(k in sector for k in ["utilit", "transport", "telecom", "infrastructure"])
            and mcap >= 50_000_000_000
            and symbol not in _PETROLEUM_EXCLUDE):
        tags.append("STRUCTURAL_MOAT")
    if any(k in combo for k in ["government", "e-document", "public service", "ราชการ"]):
        tags.append("GOVT_LOCKIN")
    return tags
