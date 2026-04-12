"""Max Mahon v2 — Stock Screener: multi-year quality scoring (Buffett + เซียนฮง)."""

import json
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
UNIVERSE = DATA_DIR / "set_universe.json"
WATCHLIST = ROOT / "watchlist.json"

sys.path.insert(0, str(ROOT / "scripts"))
from fetch_data import fetch_multi_year, normalize_yield, FINANCIAL_SECTORS

DEFAULT_FILTERS = {
    "min_roe_avg": 0.15,
    "min_roe_floor": 0.12,
    "min_net_margin": 0.10,
    "max_de_non_fin": 1.5,
    "max_de_financial": 10,
    "min_eps_positive_years": 3,
    "min_fcf_positive_years": 3,
    "min_market_cap": 5_000_000_000,
}


def load_filters() -> dict:
    """Load filters from config.json, fallback to defaults."""
    config_path = ROOT / "config.json"
    if config_path.exists():
        try:
            config = json.loads(config_path.read_text(encoding="utf-8"))
            return {**DEFAULT_FILTERS, **config.get("filters", {})}
        except Exception:
            pass
    return dict(DEFAULT_FILTERS)


HARD_FILTERS = load_filters()


def hard_filter(data: dict) -> tuple:
    reasons = []
    sector = data.get("sector", "")
    is_financial = sector in FINANCIAL_SECTORS
    agg = data.get("aggregates", {})
    info_mcap = data.get("market_cap") or 0

    if info_mcap < HARD_FILTERS["min_market_cap"]:
        reasons.append(f"market cap {info_mcap/1e9:.0f}B < 5B")
        return False, reasons

    # ROE check — need multi-year data
    yearly = data.get("yearly_metrics", [])
    roe_vals = [m["roe"] for m in yearly if m.get("roe") is not None]

    if len(roe_vals) >= 2:
        avg_roe = sum(roe_vals) / len(roe_vals)
        min_roe = min(roe_vals)
        roe_target = 0.10 if is_financial else HARD_FILTERS["min_roe_avg"]
        roe_floor = 0.08 if is_financial else HARD_FILTERS["min_roe_floor"]
        if avg_roe < roe_target - 0.005:
            reasons.append(f"avg ROE {avg_roe*100:.0f}% < {roe_target*100:.0f}%")
        if min_roe < roe_floor - 0.005:
            reasons.append(f"min ROE {min_roe*100:.0f}% < {roe_floor*100:.0f}%")
    elif data.get("roe") is not None:
        roe_target = 0.10 if is_financial else HARD_FILTERS["min_roe_avg"]
        if data["roe"] < roe_target:
            reasons.append(f"ROE {data['roe']*100:.0f}% < {roe_target*100:.0f}%")

    # Net Margin — skip for financials
    if not is_financial:
        nm_vals = [m["net_margin"] for m in yearly if m.get("net_margin") is not None]
        if len(nm_vals) >= 2:
            avg_nm = sum(nm_vals) / len(nm_vals)
            if avg_nm < HARD_FILTERS["min_net_margin"]:
                reasons.append(f"avg net margin {avg_nm*100:.0f}% < 10%")
        elif data.get("profit_margin") is not None:
            if data["profit_margin"] < HARD_FILTERS["min_net_margin"]:
                reasons.append(f"net margin {data['profit_margin']*100:.0f}% < 10%")

    # D/E
    de_vals = [m["de_ratio"] for m in yearly if m.get("de_ratio") is not None]
    latest_de = de_vals[-1] if de_vals else (data.get("debt_to_equity") or 0) / 100 if data.get("debt_to_equity") else None
    if latest_de is not None:
        max_de = HARD_FILTERS["max_de_financial"] if is_financial else HARD_FILTERS["max_de_non_fin"]
        if latest_de > max_de:
            reasons.append(f"D/E {latest_de:.1f} > {max_de}")

    # EPS positive years
    eps_pos = agg.get("eps_positive_years", 0)
    eps_total = agg.get("eps_total_years", 0)
    if eps_total >= 3 and eps_pos < HARD_FILTERS["min_eps_positive_years"]:
        reasons.append(f"EPS positive {eps_pos}/{eps_total}yr < 3")

    # FCF positive years — skip for financials
    if not is_financial:
        fcf_pos = agg.get("fcf_positive_years", 0)
        fcf_total = agg.get("fcf_total_years", 0)
        if fcf_total >= 3 and fcf_pos < HARD_FILTERS["min_fcf_positive_years"]:
            reasons.append(f"FCF positive {fcf_pos}/{fcf_total}yr < 3")

    return len(reasons) == 0, reasons


def profitability_score(data: dict) -> tuple:
    score = 0
    reasons = []
    yearly = data.get("yearly_metrics", [])
    sector = data.get("sector", "")
    is_financial = sector in FINANCIAL_SECTORS

    # ROE consistency (15 pts)
    roe_vals = [m["roe"] for m in yearly if m.get("roe") is not None]
    if roe_vals:
        years_above_15 = sum(1 for r in roe_vals if r >= 0.15)
        pts = min(15, years_above_15 * 4)
        score += pts
        avg_roe = sum(roe_vals) / len(roe_vals)
        if pts >= 12:
            reasons.append(f"ROE เด่น avg {avg_roe*100:.0f}%")
        elif pts >= 8:
            reasons.append(f"ROE ดี avg {avg_roe*100:.0f}%")
    elif data.get("roe") is not None and data["roe"] >= 0.15:
        score += 8
        reasons.append(f"ROE {data['roe']*100:.0f}% (TTM)")

    # Gross Margin (10 pts) — skip for financials
    if not is_financial:
        gm_vals = [m["gross_margin"] for m in yearly if m.get("gross_margin") is not None]
        if gm_vals:
            avg_gm = sum(gm_vals) / len(gm_vals)
            if avg_gm >= 0.40:
                score += 10
                reasons.append(f"gross margin สูง {avg_gm*100:.0f}%")
            elif avg_gm >= 0.30:
                score += 7
            elif avg_gm >= 0.20:
                score += 4
        elif data.get("gross_margins") is not None:
            gm = data["gross_margins"]
            if gm >= 0.40:
                score += 10
            elif gm >= 0.30:
                score += 7
            elif gm >= 0.20:
                score += 4
    else:
        nm_vals = [m["net_margin"] for m in yearly if m.get("net_margin") is not None]
        if nm_vals:
            avg_nm = sum(nm_vals) / len(nm_vals)
            if avg_nm >= 0.30:
                score += 10
            elif avg_nm >= 0.20:
                score += 7
            elif avg_nm >= 0.10:
                score += 4

    # Net Margin trend (5 pts)
    nm_vals = [m["net_margin"] for m in yearly if m.get("net_margin") is not None]
    if len(nm_vals) >= 3:
        improving = all(nm_vals[i] >= nm_vals[i-1] for i in range(1, len(nm_vals)))
        if improving:
            score += 5
            reasons.append("net margin เพิ่มทุกปี")
        elif nm_vals[-1] > nm_vals[0]:
            score += 2

    return score, reasons


def growth_score(data: dict) -> tuple:
    score = 0
    reasons = []
    agg = data.get("aggregates", {})

    # Revenue CAGR (10 pts)
    rev_cagr = agg.get("revenue_cagr")
    if rev_cagr is not None:
        if rev_cagr >= 0.15:
            score += 10
            reasons.append(f"revenue CAGR {rev_cagr*100:.0f}%")
        elif rev_cagr >= 0.10:
            score += 7
            reasons.append(f"revenue CAGR {rev_cagr*100:.0f}%")
        elif rev_cagr >= 0.05:
            score += 4
        elif rev_cagr >= 0:
            score += 2

    # EPS CAGR (10 pts)
    eps_cagr = agg.get("eps_cagr")
    if eps_cagr is not None:
        if eps_cagr >= 0.15:
            score += 10
            reasons.append(f"EPS CAGR {eps_cagr*100:.0f}%")
        elif eps_cagr >= 0.10:
            score += 7
        elif eps_cagr >= 0.05:
            score += 4
        elif eps_cagr >= 0:
            score += 2

    # Revenue consistency (5 pts)
    growth_yrs = agg.get("revenue_growth_years", 0)
    total_comp = agg.get("revenue_growth_total_comparisons", 0)
    if total_comp >= 3:
        if growth_yrs == total_comp:
            score += 5
            reasons.append("revenue โตทุกปี")
        elif growth_yrs >= total_comp - 1:
            score += 3

    return score, reasons


def dividend_score(data: dict) -> tuple:
    score = 0
    reasons = []
    agg = data.get("aggregates", {})

    # Yield (8 pts)
    dy = data.get("dividend_yield")
    if dy is not None:
        if dy >= 6:
            score += 8
            reasons.append(f"yield สูง {dy:.1f}%")
        elif dy >= 4:
            score += 6
            reasons.append(f"yield ดี {dy:.1f}%")
        elif dy >= 3:
            score += 4
        elif dy >= 2:
            score += 2

    # Payout sustainability (7 pts)
    payout = data.get("payout_ratio")
    if payout is not None:
        if 0.30 <= payout <= 0.70:
            score += 7
            reasons.append("payout สมดุล")
        elif 0.70 < payout <= 0.85:
            score += 4
        elif payout > 1.0:
            reasons.append("payout เกิน 100%")

    # Dividend streak (10 pts) — based on 10+ year history
    streak = agg.get("dividend_streak", 0)
    if streak >= 10:
        score += 10
        reasons.append(f"จ่ายปันผล {streak} ปีติดต่อกัน")
    elif streak >= 7:
        score += 7
        reasons.append(f"จ่ายปันผล {streak} ปีติด")
    elif streak >= 5:
        score += 5
    elif streak >= 3:
        score += 3

    return score, reasons


def strength_score(data: dict) -> tuple:
    score = 0
    reasons = []
    yearly = data.get("yearly_metrics", [])
    agg = data.get("aggregates", {})
    sector = data.get("sector", "")
    is_financial = sector in FINANCIAL_SECTORS

    # D/E level (5 pts)
    de_vals = [m["de_ratio"] for m in yearly if m.get("de_ratio") is not None]
    latest_de = de_vals[-1] if de_vals else None
    if latest_de is not None:
        if is_financial:
            if latest_de < 2:
                score += 5
            elif latest_de < 5:
                score += 3
        else:
            if latest_de < 0.5:
                score += 5
                reasons.append("หนี้ต่ำมาก")
            elif latest_de < 1.0:
                score += 3

    # Interest Coverage (5 pts)
    int_cov = agg.get("latest_interest_coverage")
    if int_cov is not None:
        if int_cov > 10:
            score += 5
            reasons.append(f"interest coverage {int_cov:.0f}x")
        elif int_cov > 5:
            score += 3
        elif int_cov > 3:
            score += 1

    # FCF consistency (5 pts)
    fcf_pos = agg.get("fcf_positive_years", 0)
    fcf_total = agg.get("fcf_total_years", 0)
    if fcf_total >= 3:
        if fcf_pos == fcf_total:
            score += 5
            reasons.append("FCF บวกทุกปี")
        elif fcf_pos >= fcf_total - 1:
            score += 3

    # OCF/NI ratio (5 pts) — clean accounting
    ocf_ni = agg.get("latest_ocf_ni_ratio")
    if ocf_ni is not None:
        if 0.8 <= ocf_ni <= 1.5:
            score += 5
            reasons.append("กำไรมีเงินสดรองรับ")
        elif 0.5 <= ocf_ni <= 2.0:
            score += 3
        elif ocf_ni < 0.5:
            reasons.append("กำไรไม่สะท้อนเงินสดจริง")

    return score, reasons


def assign_signals(data: dict, total_score: int) -> list:
    signals = []
    yearly = data.get("yearly_metrics", [])
    agg = data.get("aggregates", {})
    sector = data.get("sector", "")
    is_financial = sector in FINANCIAL_SECTORS

    # DATA_WARNING
    if data.get("warnings"):
        signals.append("DATA_WARNING")

    dy = data.get("dividend_yield") or 0
    payout = data.get("payout_ratio")
    eg = data.get("earnings_growth") or 0
    price = data.get("price")
    low_52w = data.get("52w_low")
    fwd_pe = data.get("forward_pe")
    pe = data.get("pe_ratio")

    # YIELD_TRAP — multi-year: yield high but earnings declining trend
    roe_vals = [m["roe"] for m in yearly if m.get("roe") is not None]
    if dy > 8:
        declining = False
        if len(roe_vals) >= 3 and all(roe_vals[i] < roe_vals[i-1] for i in range(1, len(roe_vals))):
            declining = True
        if declining or (payout is not None and payout > 1.0):
            signals.append("YIELD_TRAP")

    # CONTRARIAN — price near low + high quality score
    if price and low_52w and low_52w > 0 and price <= low_52w * 1.20 and total_score >= 50:
        signals.append("CONTRARIAN")

    # TURNAROUND
    if fwd_pe and pe and fwd_pe > 1 and pe > 1 and fwd_pe < pe * 0.7:
        rev_cagr = agg.get("revenue_cagr")
        if rev_cagr is not None and rev_cagr > 0:
            signals.append("TURNAROUND")

    # DIVIDEND_KING — multi-year: streak ≥5, yield ≥5%, payout sustainable
    streak = agg.get("dividend_streak", 0)
    if dy >= 5 and streak >= 5 and payout is not None and 0.3 <= payout <= 0.7:
        signals.append("DIVIDEND_KING")

    # COMPOUNDER — Buffett style
    if len(roe_vals) >= 3:
        all_above_20 = all(r >= 0.20 for r in roe_vals)
        rev_cagr = agg.get("revenue_cagr")
        if all_above_20 and rev_cagr is not None and rev_cagr >= 0.10:
            if payout is None or payout < 0.60:
                signals.append("COMPOUNDER")

    # CASH_COW
    fcf = data.get("free_cashflow") or 0
    mcap = data.get("market_cap") or 1
    fcf_yield = fcf / mcap if mcap > 0 else 0
    de_vals = [m["de_ratio"] for m in yearly if m.get("de_ratio") is not None]
    latest_de = de_vals[-1] if de_vals else 999
    if fcf_yield > 0.08 and (payout is None or payout < 0.70) and latest_de < 0.5:
        signals.append("CASH_COW")

    return signals


def valuation_grade(data: dict, sector_medians: dict) -> dict:
    """Evaluate price attractiveness — Grade A-F."""
    pe = data.get("pe_ratio")
    agg = data.get("aggregates", {})
    eps_cagr = agg.get("eps_cagr", 0)
    sector = data.get("sector", "unknown")
    median_pe = sector_medians.get(sector, 20)

    score = 0  # 0-100, higher = cheaper

    # PEG ratio (20 pts)
    peg = pe / (eps_cagr * 100) if eps_cagr > 0 and pe else None
    if peg and peg < 1:
        score += 20
    elif peg and peg < 2:
        score += 12
    elif peg and peg < 3:
        score += 4

    # P/E vs sector median (35 pts)
    if pe and pe < median_pe * 0.8:
        score += 35
    elif pe and pe < median_pe * 1.2:
        score += 21
    elif pe and pe < median_pe * 2:
        score += 7

    # Yield vs 5y avg (30 pts)
    yield_now = data.get("dividend_yield", 0) or 0
    yield_5y = data.get("five_year_avg_yield", 0) or 0
    if yield_5y > 0:
        ratio = yield_now / yield_5y
        if ratio > 1.3:
            score += 30
        elif ratio > 0.9:
            score += 18
        elif ratio > 0.6:
            score += 6

    # 52w position (15 pts)
    low_52w = data.get("52w_low")
    high_52w = data.get("52w_high")
    price = data.get("price")
    if low_52w and high_52w and price and high_52w > low_52w:
        pos_52w = (price - low_52w) / (high_52w - low_52w)
    else:
        pos_52w = 0.5
    if pos_52w < 0.3:
        score += 15
    elif pos_52w < 0.6:
        score += 9
    elif pos_52w < 0.8:
        score += 3

    # Grade mapping
    if score >= 80:
        grade = "A"
    elif score >= 60:
        grade = "B"
    elif score >= 40:
        grade = "C"
    elif score >= 20:
        grade = "D"
    else:
        grade = "F"

    labels = {
        "A": "ราคาน่าสนใจมาก",
        "B": "ราคาเหมาะสม",
        "C": "ราคาปกติ",
        "D": "ราคาค่อนข้างสูง",
        "F": "ราคาสูงเกินจริง",
    }

    signals = []
    if grade == "F":
        signals.append("OVERPRICED")

    return {
        "grade": grade,
        "label": labels[grade],
        "score": score,
        "peg": round(peg, 2) if peg else None,
        "signals": signals,
    }


def quality_score(data: dict) -> dict:
    p_score, p_reasons = profitability_score(data)
    g_score, g_reasons = growth_score(data)
    d_score, d_reasons = dividend_score(data)
    s_score, s_reasons = strength_score(data)

    total = p_score + g_score + d_score + s_score
    signals = assign_signals(data, total)

    # Signal adjustments
    if "YIELD_TRAP" in signals:
        total -= 15
    if "CONTRARIAN" in signals:
        total += 10
    if "COMPOUNDER" in signals:
        total += 10

    all_reasons = p_reasons + g_reasons + d_reasons + s_reasons

    return {
        "score": max(0, total),
        "breakdown": {
            "profitability": p_score,
            "growth": g_score,
            "dividend": d_score,
            "strength": s_score,
        },
        "signals": signals,
        "reasons": all_reasons,
    }


def main():
    universe = json.loads(UNIVERSE.read_text(encoding="utf-8"))
    watchlist = json.loads(WATCHLIST.read_text(encoding="utf-8"))
    watched = {s["symbol"] for s in watchlist["stocks"]}

    symbols = universe["symbols"]
    print(f"Max Mahon v2 screening {len(symbols)} stocks (quality scoring)...")

    candidates = []
    filtered_out = 0

    for i, sym in enumerate(symbols):
        try:
            data = fetch_multi_year(sym)

            if "error" in data and not data.get("price"):
                print(f"  [{i+1}/{len(symbols)}] {sym} — error: {data['error']}")
                continue

            passed, filter_reasons = hard_filter(data)
            if not passed:
                filtered_out += 1
                print(f"  [{i+1}/{len(symbols)}] {sym} — filtered: {', '.join(filter_reasons[:2])}")
                continue

            result = quality_score(data)
            in_watchlist = sym in watched

            # five_year_avg_yield fallback — compute from dividend_history if null
            five_yr_yield = data.get("five_year_avg_yield")
            if five_yr_yield is None and data.get("dividend_history") and data.get("price"):
                dh = data["dividend_history"]
                recent_5 = sorted(dh.keys())[-5:]
                if recent_5:
                    avg_dps = sum(dh[y] for y in recent_5) / len(recent_5)
                    five_yr_yield = avg_dps / data["price"] * 100 if data["price"] > 0 else None

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
                    "rev_growth": data.get("revenue_growth"),
                    "earn_growth": data.get("earnings_growth"),
                    "mcap": data.get("market_cap"),
                    "fcf": data.get("free_cashflow"),
                    "current_price": data.get("price"),
                    "52w_low": data.get("52w_low"),
                    "52w_high": data.get("52w_high"),
                    "pb_ratio": data.get("pb_ratio"),
                    "five_year_avg_yield": five_yr_yield,
                    "gross_margins": data.get("gross_margins"),
                    "operating_margins": data.get("operating_margins"),
                },
                "aggregates": data.get("aggregates", {}),
                "warnings": data.get("warnings", []),
                "yearly_metrics": data.get("yearly_metrics", []),
                "dividend_history": data.get("dividend_history", {}),
            }
            candidates.append(entry)

            marker = "★" if in_watchlist else "✦"
            sig_str = f" [{','.join(result['signals'])}]" if result["signals"] else ""
            breakdown = result["breakdown"]
            bd_str = f"P{breakdown['profitability']}+G{breakdown['growth']}+D{breakdown['dividend']}+S{breakdown['strength']}"
            print(f"  [{i+1}/{len(symbols)}] {marker} {sym} — {result['score']}/100 ({bd_str}){sig_str}")

        except Exception as e:
            print(f"  [{i+1}/{len(symbols)}] {sym} — error: {e}")
        finally:
            time.sleep(0.3)

    # Compute sector median P/E from candidates
    sector_pe = {}
    for c in candidates:
        pe = c["metrics"].get("pe")
        if pe and 0 < pe < 100:
            sector_pe.setdefault(c["sector"], []).append(pe)
    sector_medians = {s: sorted(vals)[len(vals) // 2] for s, vals in sector_pe.items() if vals}

    # Add valuation grade to each candidate
    for c in candidates:
        # Rebuild data dict for valuation_grade
        val_data = {
            "pe_ratio": c["metrics"].get("pe"),
            "aggregates": c.get("aggregates", {}),
            "sector": c.get("sector", "unknown"),
            "dividend_yield": c["metrics"].get("dividend_yield"),
            "five_year_avg_yield": c["metrics"].get("five_year_avg_yield"),
            "52w_low": c["metrics"].get("52w_low"),
            "52w_high": c["metrics"].get("52w_high"),
            "price": c["metrics"].get("current_price"),
        }
        val = valuation_grade(val_data, sector_medians)
        c["valuation"] = val
        # Add OVERPRICED signal
        if "OVERPRICED" in val["signals"] and "OVERPRICED" not in c["signals"]:
            c["signals"].append("OVERPRICED")

    candidates.sort(key=lambda x: x["score"], reverse=True)
    new_finds = [c for c in candidates if not c["in_watchlist"]]

    today = datetime.now().strftime("%Y-%m-%d")
    out = {
        "date": today,
        "agent": "Max Mahon v2",
        "scoring_version": "buffett-sian-hong-v2",
        "total_scanned": len(symbols),
        "passed_filter": len(candidates),
        "filtered_out": filtered_out,
        "new_discoveries": len(new_finds),
        "hard_filters": HARD_FILTERS,
        "candidates": candidates,
    }

    out_path = DATA_DIR / f"screener_{today}.json"
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2, default=str), encoding="utf-8")

    print(f"\n{'='*60}")
    print(f"Scanned: {len(symbols)} | Passed: {len(candidates)} | Filtered: {filtered_out} | New: {len(new_finds)}")
    print(f"\nTop 10:")
    for c in candidates[:10]:
        marker = "★" if c["in_watchlist"] else "✦ NEW"
        bd = c["breakdown"]
        sig = f" [{','.join(c['signals'])}]" if c["signals"] else ""
        print(f"  {marker} {c['symbol']} — {c['score']}/100 (P{bd['profitability']}+G{bd['growth']}+D{bd['dividend']}+S{bd['strength']}){sig}")
    print(f"\nSaved → {out_path}")

    return out_path


if __name__ == "__main__":
    main()
