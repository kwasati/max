"""Run Niwes screener on curated set (watchlist + notes + key Niwes baseline stocks).

Avoids 30+ min fetch for full 933 universe. For integration loop scan (niwes-06).
"""
import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from fetch_data import fetch_multi_year
from screen_stocks import (
    hard_filter,
    quality_score,
    valuation_grade,
    HARD_FILTERS,
)


def build_curated_universe() -> list:
    """Watchlist + notes + Niwes baseline + Thai large caps = ~25-30 stocks."""
    user_data = json.loads((ROOT / "user_data.json").read_text(encoding="utf-8"))
    watchlist = set(user_data.get("watchlist", []))
    notes_syms = set(user_data.get("notes", {}).keys())

    # Niwes baseline passes (from baseline_niwes_v1_2026-04-20.md)
    niwes_passes = {"TCAP.BK", "QH.BK", "PTT.BK", "KKP.BK", "RATCH.BK", "EGCO.BK"}
    niwes_filtered = {"SCC.BK", "BCP.BK", "MC.BK", "TISCO.BK", "MBK.BK", "CPALL.BK"}

    # Additional Thai large-caps for breadth
    large_caps = {"KBANK.BK", "BBL.BK", "KTB.BK", "TOP.BK", "PTTGC.BK", "GPSC.BK",
                  "BH.BK", "INTUCH.BK", "OR.BK", "DTAC.BK", "TRUE.BK"}

    merged = sorted(watchlist | notes_syms | niwes_passes | niwes_filtered | large_caps)
    return merged


def run(symbols: list, user_data: dict) -> dict:
    watched = set(user_data.get("watchlist", []))
    blacklisted = set(user_data.get("blacklist", []))

    candidates = []
    filtered_stocks = []
    filtered_out = 0
    error_count = 0

    for i, sym in enumerate(symbols):
        if sym in blacklisted:
            print(f"  [{i+1}/{len(symbols)}] {sym} -- blacklisted")
            continue
        try:
            data = fetch_multi_year(sym)
            if data is None:
                print(f"  [{i+1}/{len(symbols)}] {sym} -- no data")
                error_count += 1
                continue
            if "error" in data and not data.get("price"):
                print(f"  [{i+1}/{len(symbols)}] {sym} -- error: {data.get('error')}")
                error_count += 1
                continue

            passed, filter_reasons, near_miss = hard_filter(data)
            if not passed:
                filtered_out += 1
                filtered_stocks.append({
                    "symbol": sym,
                    "name": data.get("name", sym),
                    "sector": data.get("sector", "N/A"),
                    "reasons": filter_reasons,
                    "basic_metrics": {
                        "price": data.get("price"),
                        "dividend_yield": data.get("dividend_yield"),
                        "roe": data.get("roe"),
                        "de": (data.get("debt_to_equity") or 0) / 100 if data.get("debt_to_equity") else None,
                        "mcap": data.get("market_cap"),
                        "pe": data.get("pe_ratio"),
                        "pb_ratio": data.get("pb_ratio"),
                        "eps": data.get("eps_trailing"),
                    }
                })
                print(f"  [{i+1}/{len(symbols)}] {sym} -- FILTER: {', '.join(filter_reasons[:2])}")
                continue

            result = quality_score(data)
            in_watchlist = sym in watched
            entry = {
                "symbol": sym,
                "name": data.get("name", sym),
                "sector": data.get("sector", "N/A"),
                "in_watchlist": in_watchlist,
                "score": result["score"],
                "breakdown": result["breakdown"],
                "signals": result["signals"],
                "reasons": result["reasons"],
                "metrics": {
                    "dividend_yield": data.get("dividend_yield"),
                    "pe": data.get("pe_ratio"),
                    "forward_pe": data.get("forward_pe"),
                    "roe": data.get("roe"),
                    "de": (data.get("debt_to_equity") or 0) / 100,
                    "payout": data.get("payout_ratio"),
                    "mcap": data.get("market_cap"),
                    "current_price": data.get("price"),
                    "pb_ratio": data.get("pb_ratio"),
                },
                "aggregates": data.get("aggregates", {}),
                "warnings": data.get("warnings", []),
            }
            candidates.append(entry)
            marker = "[W]" if in_watchlist else "[N]"
            bd = result["breakdown"]
            sig = f" [{','.join(result['signals'])}]" if result["signals"] else ""
            print(f"  [{i+1}/{len(symbols)}] {marker} {sym} -- PASS {result['score']}/100 (D{bd['dividend']}+V{bd['valuation']}+C{bd['cash_flow']}+H{bd['hidden_value']}){sig}")
        except Exception as e:
            error_count += 1
            print(f"  [{i+1}/{len(symbols)}] {sym} -- EXCEPTION: {e}")

    # Sector medians + valuation grade
    sector_pe = {}
    for c in candidates:
        pe = c["metrics"].get("pe")
        if pe and 0 < pe < 100:
            sector_pe.setdefault(c["sector"], []).append(pe)
    sector_medians = {s: sorted(vs)[len(vs)//2] for s, vs in sector_pe.items() if vs}

    for c in candidates:
        val_data = {
            "pe_ratio": c["metrics"].get("pe"),
            "aggregates": c.get("aggregates", {}),
            "sector": c.get("sector", "unknown"),
            "dividend_yield": c["metrics"].get("dividend_yield"),
            "five_year_avg_yield": None,
            "52w_low": None,
            "52w_high": None,
            "price": c["metrics"].get("current_price"),
        }
        val = valuation_grade(val_data, sector_medians)
        c["valuation"] = val
        val_modifier = {"A": 5, "B": 0, "C": -5, "D": -10, "F": -20}
        c["score"] = max(0, min(100, c["score"] + val_modifier.get(val["grade"], 0)))
        if "OVERPRICED" in val["signals"] and "OVERPRICED" not in c["signals"]:
            c["signals"].append("OVERPRICED")

    candidates.sort(key=lambda x: x["score"], reverse=True)

    today = datetime.now().strftime("%Y-%m-%d")
    return {
        "date": today,
        "agent": "Max Mahon v5 -- curated (niwes-06)",
        "scoring_version": "niwes-dividend-first-v1",
        "total_scanned": len(symbols),
        "passed_filter": len(candidates),
        "filtered_out": filtered_out,
        "errors": error_count,
        "hard_filters": HARD_FILTERS,
        "candidates": candidates,
        "filtered_out_stocks": filtered_stocks,
    }


def main():
    symbols = build_curated_universe()
    user_data = json.loads((ROOT / "user_data.json").read_text(encoding="utf-8"))
    print(f"\nCurated universe: {len(symbols)} stocks")
    print(f"Watchlist: {user_data.get('watchlist', [])}")
    print(f"Filters: {HARD_FILTERS}\n")

    out = run(symbols, user_data)

    today = out["date"]
    out_path = ROOT / "data" / f"screener_curated_niwes06_{today}.json"
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2, default=str), encoding="utf-8")

    print(f"\n{'='*60}")
    print(f"Scanned: {out['total_scanned']} | Passed: {out['passed_filter']} | Filtered: {out['filtered_out']} | Errors: {out['errors']}")
    print(f"\nTop passing:")
    for c in out["candidates"][:10]:
        marker = "[W]" if c["in_watchlist"] else "[N]"
        bd = c["breakdown"]
        sig = f" [{','.join(c['signals'])}]" if c["signals"] else ""
        print(f"  {marker} {c['symbol']} -- {c['score']}/100 (D{bd['dividend']}+V{bd['valuation']}+C{bd['cash_flow']}+H{bd['hidden_value']}){sig}")
    print(f"\nSaved -> {out_path}")


if __name__ == "__main__":
    main()
