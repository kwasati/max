"""Monitor Thai macro indicators for structural risk assessment (Plan 08).

Pulls public data for 5 indicators ดร.นิเวศน์ flags when reducing Thai allocation:
1. Thai GDP growth (World Bank API fallback)
2. FDI inflows trend (World Bank API fallback)
3. Current Account Balance (World Bank API fallback)
4. Foreign holdings in SET (manual update — no free realtime API)
5. Demographic dependency ratio (World Bank API fallback)

Policy (per plan scope):
- Public API/scrape ONLY — no paid source
- If no free source → flag 'manual update needed' but continue (don't block)
- Save snapshot to data/thai_macro_{YYYY-MM-DD}.json

Usage:
    py scripts/monitor_thai_macro.py
"""

from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

try:
    import requests
except ImportError:  # pragma: no cover
    requests = None  # type: ignore

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)

# World Bank API indicators for Thailand (country code: THA)
# Docs: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation
WB_BASE = "https://api.worldbank.org/v2/country/THA/indicator"
WB_INDICATORS = {
    "gdp_growth_pct": "NY.GDP.MKTP.KD.ZG",  # GDP growth (annual %)
    "fdi_inflows_usd": "BX.KLT.DINV.CD.WD",  # FDI, net inflows (BoP, current US$)
    "current_account_pct_gdp": "BN.CAB.XOKA.GD.ZS",  # CAB (% of GDP)
    "dependency_ratio": "SP.POP.DPND",  # Age dependency ratio (% of working-age pop)
}


def _fetch_worldbank(indicator: str, years: int = 5) -> list[dict]:
    """Fetch recent `years` observations for a World Bank indicator (Thailand).

    Returns list of {year: int, value: float|None}, newest first.
    Returns [] on failure.
    """
    if requests is None:
        return []
    url = f"{WB_BASE}/{indicator}"
    try:
        r = requests.get(
            url,
            params={"format": "json", "per_page": years, "date": f"2018:{datetime.now().year}"},
            timeout=15,
        )
        r.raise_for_status()
        data = r.json()
        if not isinstance(data, list) or len(data) < 2:
            return []
        rows = data[1] or []
        out = []
        for row in rows:
            try:
                yr = int(row.get("date", 0))
                val = row.get("value")
                out.append({"year": yr, "value": float(val) if val is not None else None})
            except (ValueError, TypeError):
                continue
        return sorted(out, key=lambda x: x["year"], reverse=True)
    except Exception as e:
        print(f"  [warn] fetch failed for {indicator}: {e}", file=sys.stderr)
        return []


def collect_macro() -> dict[str, Any]:
    """Collect all Thai macro indicators. Returns snapshot dict."""
    snapshot: dict[str, Any] = {
        "date": datetime.now().strftime("%Y-%m-%d"),
        "source": "World Bank API + manual flags",
        "indicators": {},
        "manual_update_needed": [],
    }

    for key, wb_code in WB_INDICATORS.items():
        print(f"Fetching {key} ({wb_code})...")
        obs = _fetch_worldbank(wb_code)
        # pick most recent observation with non-null value
        latest_non_null = next((o for o in obs if o.get("value") is not None), None)
        if obs and latest_non_null is not None:
            snapshot["indicators"][key] = {
                "source": f"worldbank:{wb_code}",
                "observations": obs,
                "latest_value": latest_non_null["value"],
                "latest_year": latest_non_null["year"],
            }
        else:
            # Flag as manual update but don't block
            snapshot["indicators"][key] = {
                "source": f"worldbank:{wb_code}",
                "observations": [],
                "latest_value": None,
                "latest_year": None,
                "manual_update_needed": True,
                "note": "World Bank API returned no data — verify manually",
            }
            snapshot["manual_update_needed"].append(key)

    # Foreign SET holdings — no free realtime API; flag manual
    # (SET publishes monthly reports; scraping tosses out of scope for MVP.)
    snapshot["indicators"]["foreign_set_holdings_pct"] = {
        "source": "SET monthly report (manual)",
        "observations": [],
        "latest_value": None,
        "latest_year": None,
        "manual_update_needed": True,
        "note": "SET foreign holdings % — no free realtime API; update from monthly SET report",
        # TODO: verify source — SET provides free historical data but no stable JSON endpoint
    }
    snapshot["manual_update_needed"].append("foreign_set_holdings_pct")

    return snapshot


def main() -> Path:
    snapshot = collect_macro()
    out_path = DATA_DIR / f"thai_macro_{snapshot['date']}.json"
    out_path.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    indicators_ok = sum(
        1 for v in snapshot["indicators"].values()
        if v.get("latest_value") is not None
    )
    indicators_total = len(snapshot["indicators"])
    print(f"\n{'='*60}")
    print(f"Saved → {out_path}")
    print(f"Indicators with data: {indicators_ok}/{indicators_total}")
    if snapshot["manual_update_needed"]:
        print(f"Manual update needed: {', '.join(snapshot['manual_update_needed'])}")
    return out_path


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"monitor_thai_macro fatal: {e}", file=sys.stderr)
        sys.exit(1)
