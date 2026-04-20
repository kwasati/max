"""Structural Risk Score for Thai market (Plan 08).

Reads latest data/thai_macro_*.json snapshot, computes 0-100 score:
- 0 = healthy
- 100 = severe structural break

Weighted trend per indicator (plan spec):
- GDP declining 3y: +30
- FDI declining (latest 3 observations trend down): +25
- Foreign holdings declining: +25 (or skipped if manual_update_needed)
- Dependency ratio rising fast (>2pp over 5y): +20

If score > 70: trigger recommendation to reduce Thai allocation
per ดร.นิเวศน์ playbook (60% → 30%).

Usage:
    py scripts/structural_risk_score.py            # prints report
    py -c "from scripts.structural_risk_score import compute_score; print(compute_score())"
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"


def _latest_macro_file() -> Path | None:
    files = sorted(DATA_DIR.glob("thai_macro_*.json"), reverse=True)
    return files[0] if files else None


def _latest_n_values(obs: list[dict], n: int = 3) -> list[float]:
    """Return last N non-null values sorted oldest-first."""
    vals = [o["value"] for o in obs if o.get("value") is not None]
    # obs is newest-first, so reverse to oldest-first then take last N
    return list(reversed(vals))[-n:]


def _is_declining(vals: list[float]) -> bool:
    """Return True if strictly declining across the list (len >= 2)."""
    if len(vals) < 2:
        return False
    return all(vals[i] < vals[i - 1] for i in range(1, len(vals)))


def compute_score(snapshot: dict | None = None) -> dict[str, Any]:
    """Compute structural risk score from a macro snapshot.

    Args:
        snapshot: dict from monitor_thai_macro.py. If None, load latest file.

    Returns:
        {
            "score": int 0-100,
            "trigger": bool,
            "recommendation": str,
            "breakdown": {indicator: points_added},
            "notes": list of str,
            "source_file": str,
        }
    """
    source_file = None
    if snapshot is None:
        path = _latest_macro_file()
        if path is None:
            return {
                "score": 0,
                "trigger": False,
                "recommendation": "NO_DATA — run monitor_thai_macro.py first",
                "breakdown": {},
                "notes": ["no macro snapshot found"],
                "source_file": None,
            }
        snapshot = json.loads(path.read_text(encoding="utf-8"))
        source_file = path.name

    indicators = snapshot.get("indicators", {}) or {}
    breakdown: dict[str, int] = {}
    notes: list[str] = []
    score = 0

    # 1) GDP declining 3y → +30
    gdp = indicators.get("gdp_growth_pct", {})
    gdp_vals = _latest_n_values(gdp.get("observations", []), 3)
    if len(gdp_vals) >= 3 and _is_declining(gdp_vals):
        breakdown["gdp_growth_pct"] = 30
        score += 30
        notes.append(f"GDP declining 3y ({', '.join(f'{v:.1f}' for v in gdp_vals)})")
    elif len(gdp_vals) >= 2 and _is_declining(gdp_vals):
        breakdown["gdp_growth_pct"] = 15
        score += 15
        notes.append(f"GDP declining 2y ({', '.join(f'{v:.1f}' for v in gdp_vals)})")
    else:
        breakdown["gdp_growth_pct"] = 0

    # 2) FDI declining → +25 (compare latest 3 observations)
    fdi = indicators.get("fdi_inflows_usd", {})
    fdi_vals = _latest_n_values(fdi.get("observations", []), 3)
    if len(fdi_vals) >= 3 and _is_declining(fdi_vals):
        breakdown["fdi_inflows_usd"] = 25
        score += 25
        notes.append("FDI declining 3y")
    elif len(fdi_vals) >= 2 and fdi_vals[-1] < fdi_vals[0] * 0.7:
        # drop >30% peak-to-latest = warning
        breakdown["fdi_inflows_usd"] = 12
        score += 12
        notes.append("FDI dropped >30% from earlier peak")
    else:
        breakdown["fdi_inflows_usd"] = 0

    # 3) Foreign holdings declining → +25 (or skip if manual)
    fh = indicators.get("foreign_set_holdings_pct", {})
    if fh.get("manual_update_needed"):
        breakdown["foreign_set_holdings_pct"] = 0
        notes.append("foreign SET holdings: manual update needed — skipped")
    else:
        fh_vals = _latest_n_values(fh.get("observations", []), 3)
        if len(fh_vals) >= 2 and _is_declining(fh_vals):
            breakdown["foreign_set_holdings_pct"] = 25
            score += 25
            notes.append("foreign SET holdings declining")
        else:
            breakdown["foreign_set_holdings_pct"] = 0

    # 4) Dependency ratio rising fast (>2pp over 5y) → +20
    dep = indicators.get("dependency_ratio", {})
    dep_obs = dep.get("observations", []) or []
    dep_vals_all = [o["value"] for o in dep_obs if o.get("value") is not None]
    if len(dep_vals_all) >= 2:
        # obs is newest-first
        latest = dep_vals_all[0]
        oldest = dep_vals_all[-1]
        delta = latest - oldest
        if delta > 2.0:
            breakdown["dependency_ratio"] = 20
            score += 20
            notes.append(f"dependency ratio +{delta:.1f}pp over period")
        elif delta > 1.0:
            breakdown["dependency_ratio"] = 10
            score += 10
            notes.append(f"dependency ratio +{delta:.1f}pp (watch)")
        else:
            breakdown["dependency_ratio"] = 0
    else:
        breakdown["dependency_ratio"] = 0

    score = max(0, min(100, score))
    trigger = score > 70

    if trigger:
        recommendation = (
            "STRUCTURAL_BREAK: reduce Thai allocation per ดร.นิเวศน์ playbook "
            "(60% → 30%). See docs/niwes/12-recent-views-2025-2026.md"
        )
    elif score > 40:
        recommendation = "ELEVATED: monitor quarterly; consider trimming to 50%"
    elif score > 20:
        recommendation = "WATCH: minor concerns; keep current allocation but watch"
    else:
        recommendation = "HEALTHY: maintain current Thai allocation"

    return {
        "score": score,
        "trigger": trigger,
        "recommendation": recommendation,
        "breakdown": breakdown,
        "notes": notes,
        "source_file": source_file,
    }


def main() -> None:
    result = compute_score()
    print(f"Structural Risk Score: {result['score']}/100")
    print(f"Trigger: {result['trigger']}")
    print(f"Recommendation: {result['recommendation']}")
    print("Breakdown:")
    for k, v in result["breakdown"].items():
        print(f"  {k}: +{v}")
    if result["notes"]:
        print("Notes:")
        for n in result["notes"]:
            print(f"  - {n}")
    print(f"Source: {result['source_file']}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"structural_risk_score fatal: {e}", file=sys.stderr)
        sys.exit(1)
