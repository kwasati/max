"""Max Mahon v5 — Stock Screener: Niwes Dividend-First framework (5-5-5-5)."""

import json
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
UNIVERSE = DATA_DIR / "set_universe.json"
WATCHLIST = ROOT / "watchlist.json"
USER_DATA = ROOT / "user_data.json"

sys.path.insert(0, str(ROOT / "scripts"))
from fetch_data import fetch_multi_year, normalize_yield, FINANCIAL_SECTORS
from data_adapter import (
    compute_normalized_earnings,
    compute_payout_sustainability,
    check_hidden_value,
)
from case_study_detector import detect_case_study_tags, detect_moat_tags, load_patterns

_PATTERNS = load_patterns()

DEFAULT_FILTERS = {
    "min_dividend_yield": 5.0,
    "min_dividend_streak": 5,
    "min_eps_positive_years": 5,
    "max_pe": 15.0,
    "bonus_pe": 8.0,
    "max_pbv": 1.5,
    "bonus_pbv": 1.0,
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
    """Niwes 5-5-5-5 hard filter.

    1. dividend_yield ≥ 5%
    2. dividend_streak ≥ 5 years
    3. EPS positive 5/5 latest years (no loss using normalized earnings)
    4. P/E ≤ 15
    5. P/BV ≤ 1.5
    6. market_cap ≥ 5B THB
    """
    reasons = []
    near_miss = []
    agg = data.get("aggregates", {})
    info_mcap = data.get("market_cap") or 0

    # 6. Market cap
    if info_mcap < HARD_FILTERS["min_market_cap"]:
        reasons.append(f"market cap {info_mcap/1e9:.1f}B < {HARD_FILTERS['min_market_cap']/1e9:.0f}B")
        return False, reasons, near_miss

    # 1. Dividend yield ≥5%
    dy = data.get("dividend_yield")
    if dy is None:
        reasons.append("ไม่มีข้อมูลปันผล")
    elif dy < HARD_FILTERS["min_dividend_yield"]:
        reasons.append(f"dividend yield {dy:.1f}% < {HARD_FILTERS['min_dividend_yield']:.0f}%")

    # 2. Dividend streak ≥5y
    streak = agg.get("dividend_streak", 0)
    if streak < HARD_FILTERS["min_dividend_streak"]:
        reasons.append(f"dividend streak {streak}yr < {HARD_FILTERS['min_dividend_streak']}yr")

    # 3. No loss 5 years (using normalized earnings)
    norm_eps = compute_normalized_earnings(data)
    if norm_eps:
        sorted_years = sorted(norm_eps.keys())[-5:]
        recent_eps = [norm_eps[y] for y in sorted_years]
        positive_years = sum(1 for e in recent_eps if e is not None and e > 0)
        total_years = len(recent_eps)
        if total_years >= 5:
            if positive_years < HARD_FILTERS["min_eps_positive_years"]:
                reasons.append(f"EPS positive {positive_years}/{total_years}yr < 5/5")
        else:
            # Not enough history — fail gracefully
            reasons.append(f"EPS history only {total_years}yr (need 5)")
    else:
        reasons.append("ไม่มีข้อมูล EPS")

    # 4. P/E ≤15
    pe = data.get("pe_ratio")
    if pe is None or pe <= 0:
        reasons.append("ไม่มี P/E ที่ใช้ได้")
    elif pe > HARD_FILTERS["max_pe"]:
        reasons.append(f"P/E {pe:.1f} > {HARD_FILTERS['max_pe']:.0f}")

    # 5. P/BV ≤1.5
    pbv = data.get("pb_ratio")
    if pbv is None or pbv <= 0:
        reasons.append("ไม่มี P/BV ที่ใช้ได้")
    elif pbv > HARD_FILTERS["max_pbv"]:
        reasons.append(f"P/BV {pbv:.2f} > {HARD_FILTERS['max_pbv']:.1f}")

    return len(reasons) == 0, reasons, near_miss


def dividend_score(data: dict) -> tuple:
    """Niwes Dividend pillar — 50 pts max.

    yield (15) + streak (15) + payout sustainability (10) + dividend growth (10)
    """
    score = 0
    reasons = []
    agg = data.get("aggregates", {})

    # Yield (15 pts) — Niwes wants ≥5%
    dy = data.get("dividend_yield")
    if dy is not None:
        if dy >= 7:
            score += 15
            reasons.append(f"yield สูง {dy:.1f}%")
        elif dy >= 5:
            score += 12
            reasons.append(f"yield ผ่านเกณฑ์ {dy:.1f}%")
        elif dy >= 4:
            score += 8
        elif dy >= 3:
            score += 5
        elif dy >= 2:
            score += 2

    # Streak (15 pts) — Niwes wants ≥5y, ideally 10+
    streak = agg.get("dividend_streak", 0)
    if streak >= 15:
        score += 15
        reasons.append(f"จ่ายปันผล {streak} ปีติดต่อกัน")
    elif streak >= 10:
        score += 12
        reasons.append(f"จ่ายปันผล {streak} ปีติด")
    elif streak >= 5:
        score += 8
    elif streak >= 3:
        score += 4

    # Payout sustainability (10 pts) — uses compute_payout_sustainability
    sust_map = compute_payout_sustainability(data)
    payout = data.get("payout_ratio")
    sust_count = sum(1 for v in sust_map.values() if v.get("sustainable"))
    if sust_count >= 5:
        score += 10
        reasons.append("payout ยั่งยืน 5+ ปี")
    elif sust_count >= 3:
        score += 6
    elif payout is not None and payout < 0.70:
        score += 4
    elif payout is not None and payout >= 1.0:
        reasons.append("payout เกิน 100%")

    # Dividend Growth (10 pts)
    div_growth_streak = agg.get("dividend_growth_streak", 0)
    if div_growth_streak >= 5:
        score += 10
        reasons.append(f"ปันผลเพิ่มต่อเนื่อง {div_growth_streak} ปี")
    elif div_growth_streak >= 3:
        score += 6
    elif div_growth_streak >= 1:
        score += 3

    return min(score, 50), reasons


def valuation_score(data: dict) -> tuple:
    """Niwes Valuation pillar — 25 pts max.

    P/E (10) + P/BV (10) + EV/EBITDA (5)
    """
    score = 0
    reasons = []

    # P/E (10 pts) — bonus PE ≤8
    pe = data.get("pe_ratio")
    if pe is not None and pe > 0:
        if pe <= HARD_FILTERS["bonus_pe"]:
            score += 10
            reasons.append(f"P/E {pe:.1f} ถูกมาก")
        elif pe <= 12:
            score += 7
            reasons.append(f"P/E {pe:.1f} ถูก")
        elif pe <= HARD_FILTERS["max_pe"]:
            score += 4
        elif pe <= 20:
            score += 1

    # P/BV (10 pts) — bonus PBV ≤1
    pbv = data.get("pb_ratio")
    if pbv is not None and pbv > 0:
        if pbv <= HARD_FILTERS["bonus_pbv"]:
            score += 10
            reasons.append(f"P/BV {pbv:.2f} ต่ำกว่า book")
        elif pbv <= 1.2:
            score += 7
        elif pbv <= HARD_FILTERS["max_pbv"]:
            score += 4
        elif pbv <= 2.0:
            score += 1

    # EV/EBITDA proxy (5 pts) — use mcap/ebitda if available, else fallback
    yearly = data.get("yearly_metrics", [])
    latest = yearly[-1] if yearly else {}
    ebitda = latest.get("ebitda")
    mcap = data.get("market_cap")
    if ebitda and mcap and ebitda > 0:
        ev_ebitda = mcap / ebitda
        if ev_ebitda <= 6:
            score += 5
            reasons.append(f"EV/EBITDA {ev_ebitda:.1f}x ถูก")
        elif ev_ebitda <= 10:
            score += 3
        elif ev_ebitda <= 15:
            score += 1

    return min(score, 25), reasons


def cash_flow_score(data: dict) -> tuple:
    """Niwes Cash Flow Strength pillar — 15 pts max.

    FCF positive (5) + OCF/NI ratio (5) + Interest coverage (5)
    """
    score = 0
    reasons = []
    agg = data.get("aggregates", {})

    # FCF positive (5 pts)
    fcf_pos = agg.get("fcf_positive_years", 0)
    fcf_total = agg.get("fcf_total_years", 0)
    if fcf_total >= 3:
        if fcf_pos == fcf_total:
            score += 5
            reasons.append("FCF บวกทุกปี")
        elif fcf_pos >= fcf_total - 1:
            score += 3
        elif fcf_pos >= fcf_total // 2:
            score += 1

    # OCF/NI ratio (5 pts)
    ocf_ni = agg.get("latest_ocf_ni_ratio")
    if ocf_ni is not None:
        if 0.8 <= ocf_ni <= 3.0:
            score += 5
            reasons.append("กำไรมีเงินสดรองรับ")
        elif 0.5 <= ocf_ni:
            score += 3

    # Interest coverage (5 pts)
    int_cov = agg.get("latest_interest_coverage")
    if int_cov is not None:
        if int_cov > 10:
            score += 5
            reasons.append(f"interest coverage {int_cov:.0f}x")
        elif int_cov > 5:
            score += 3
        elif int_cov > 3:
            score += 1

    return min(score, 15), reasons


def hidden_value_score(data: dict) -> tuple:
    """Niwes Hidden Value pillar — 10 pts max.

    Base 5 if symbol has hidden-value flag.
    +5 if any holding's note indicates holding > parent market cap.
    """
    score = 0
    reasons = []
    sym = data.get("symbol", "")
    holdings = check_hidden_value(sym)
    if not holdings:
        return 0, reasons

    score += 5
    reasons.append(f"hidden value: {len(holdings)} holding(s)")

    for h in holdings:
        note = (h.get("note") or "").lower()
        if "exceed" in note or "more than" in note or "worth more" in note:
            score += 5
            reasons.append("hidden holding > parent mcap")
            break

    return min(score, 10), reasons


def detect_exit_signal(symbol: str, current_data: dict, historical_baseline: dict | None = None) -> list[dict]:
    """Detect exit triggers for a watchlist stock (Niwes sell rules).

    Args:
        symbol: stock symbol (e.g., "CPALL.BK")
        current_data: latest fetch_multi_year dict for the stock
        historical_baseline: optional baseline dict with keys:
            - passed_5555 (bool): whether stock previously passed 5-5-5-5
            - pe_baseline (float): baseline PE used at entry (for bubble detection)
            - thesis_change_flag (bool): manual flag set by news monitoring (Plan 07)

    Returns:
        list of trigger dicts, each with keys: {type, reason, severity}
        - type: FILTER_DEGRADATION | VALUATION_BUBBLE | THESIS_CHANGE_FLAG
        - reason: short Thai string explaining why
        - severity: "high" | "medium" | "low"

    Notes:
        - Flag-only — NEVER auto-sells. Karl reviews via exit decision template.
        - Runs per watchlist stock, not across whole universe.
        - Mirrors 15-exit-rules.md Rule 2 (filter degradation) + Rule 3 (valuation bubble).
    """
    triggers: list[dict] = []
    baseline = historical_baseline or {}

    # --- Trigger 1: FILTER_DEGRADATION ---
    # If stock previously passed 5-5-5-5 but now fails any Niwes hard filter
    if baseline.get("passed_5555"):
        passed_now, fail_reasons, _ = hard_filter(current_data)
        if not passed_now:
            triggers.append({
                "type": "FILTER_DEGRADATION",
                "reason": f"เคยผ่าน 5-5-5-5 แต่ตอนนี้ fail: {'; '.join(fail_reasons[:3])}",
                "severity": "high" if len(fail_reasons) >= 2 else "medium",
            })

    # --- Trigger 2: VALUATION_BUBBLE ---
    # Current P/E > 3x baseline P/E (mirrors Rule 3 logic, threshold 3x)
    pe_now = current_data.get("pe_ratio")
    pe_baseline = baseline.get("pe_baseline")
    if pe_now is not None and pe_now > 0 and pe_baseline is not None and pe_baseline > 0:
        ratio = pe_now / pe_baseline
        if ratio >= 3.0:
            triggers.append({
                "type": "VALUATION_BUBBLE",
                "reason": f"P/E ปัจจุบัน {pe_now:.1f} > 3x baseline {pe_baseline:.1f} ({ratio:.1f}x)",
                "severity": "high",
            })
        elif ratio >= 2.0:
            triggers.append({
                "type": "VALUATION_BUBBLE",
                "reason": f"P/E ปัจจุบัน {pe_now:.1f} = {ratio:.1f}x baseline (watch)",
                "severity": "medium",
            })

    # --- Trigger 3: THESIS_CHANGE_FLAG ---
    # Manual flag from news monitoring (Plan 07). Just echoes the flag + any note.
    if baseline.get("thesis_change_flag"):
        note = baseline.get("thesis_change_note", "manual flag from news monitoring")
        triggers.append({
            "type": "THESIS_CHANGE_FLAG",
            "reason": note,
            "severity": "high",
        })

    return triggers


def load_exit_baseline(symbol: str) -> dict:
    """Load exit baseline for a symbol from data/exit_baselines.json.

    Returns baseline dict (may be empty if symbol not tracked yet).
    File structure: { "CPALL.BK": {"passed_5555": true, "pe_baseline": 8.5, ...}, ... }
    """
    baseline_path = DATA_DIR / "exit_baselines.json"
    if not baseline_path.exists():
        return {}
    try:
        all_baselines = json.loads(baseline_path.read_text(encoding="utf-8"))
        return all_baselines.get(symbol, {}) or {}
    except Exception:
        return {}


def assign_signals(data: dict, total_score: int) -> list:
    """Niwes signal tags."""
    signals = []
    agg = data.get("aggregates", {})
    yearly = data.get("yearly_metrics", [])

    # DATA_WARNING (keep)
    if data.get("warnings"):
        signals.append("DATA_WARNING")

    dy = data.get("dividend_yield") or 0
    pe = data.get("pe_ratio")
    pbv = data.get("pb_ratio")
    payout = data.get("payout_ratio")
    streak = agg.get("dividend_streak", 0)
    sym = data.get("symbol", "")

    # NIWES_5555 — passes 5-5-5-5
    norm_eps = compute_normalized_earnings(data)
    sorted_years = sorted(norm_eps.keys())[-5:] if norm_eps else []
    eps_recent = [norm_eps[y] for y in sorted_years]
    eps_5_pos = len(eps_recent) >= 5 and all(e is not None and e > 0 for e in eps_recent)

    if (dy >= 5 and streak >= 5 and eps_5_pos
            and pe is not None and 0 < pe <= 15
            and pbv is not None and 0 < pbv <= 1.5):
        signals.append("NIWES_5555")

    # HIDDEN_VALUE
    if check_hidden_value(sym):
        signals.append("HIDDEN_VALUE")

    # QUALITY_DIVIDEND — yield≥5 + payout<70 + streak≥10
    if dy >= 5 and payout is not None and payout < 0.70 and streak >= 10:
        signals.append("QUALITY_DIVIDEND")

    # DEEP_VALUE — P/E≤8 + P/BV≤1
    if pe is not None and 0 < pe <= 8 and pbv is not None and 0 < pbv <= 1.0:
        signals.append("DEEP_VALUE")

    # DIVIDEND_TRAP (renamed from YIELD_TRAP) — yield>8 + ROE declining + payout>100
    roe_vals = [m["roe"] for m in yearly if m.get("roe") is not None]
    if dy > 8:
        declining = (len(roe_vals) >= 3 and
                     all(roe_vals[i] < roe_vals[i-1] for i in range(1, len(roe_vals))))
        if declining and payout is not None and payout > 1.0:
            signals.append("DIVIDEND_TRAP")

    signals.extend(detect_case_study_tags(data, _PATTERNS))
    signals.extend(detect_moat_tags(data))
    return signals


def valuation_grade(data: dict, sector_medians: dict) -> dict:
    """Evaluate price attractiveness — Grade A-F."""
    pe = data.get("pe_ratio")
    agg = data.get("aggregates", {})
    eps_cagr = agg.get("eps_cagr") or 0
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
    """Niwes Dividend-First Quality Score — 100 pts cap.

    Dividend 50 + Valuation 25 + Cash Flow 15 + Hidden Value 10
    """
    d_score, d_reasons = dividend_score(data)
    v_score, v_reasons = valuation_score(data)
    c_score, c_reasons = cash_flow_score(data)
    h_score, h_reasons = hidden_value_score(data)

    total = d_score + v_score + c_score + h_score
    signals = assign_signals(data, total)

    # Signal adjustments (cap applied after valuation modifier in main)
    if "DIVIDEND_TRAP" in signals:
        total -= 20
    if "DATA_WARNING" in signals:
        total -= 15

    all_reasons = d_reasons + v_reasons + c_reasons + h_reasons

    return {
        "score": max(0, min(100, total)),
        "breakdown": {
            "dividend": d_score,
            "valuation": v_score,
            "cash_flow": c_score,
            "hidden_value": h_score,
        },
        "signals": signals,
        "reasons": all_reasons,
    }


def main():
    universe = json.loads(UNIVERSE.read_text(encoding="utf-8"))

    # Read user data (new format) or fallback to old watchlist.json
    if USER_DATA.exists():
        user_data = json.loads(USER_DATA.read_text(encoding="utf-8"))
        watched = set(user_data.get("watchlist", []))
        blacklisted = set(user_data.get("blacklist", []))
    else:
        watchlist = json.loads(WATCHLIST.read_text(encoding="utf-8"))
        watched = {s["symbol"] for s in watchlist["stocks"]}
        blacklisted = set()

    symbols = universe["symbols"]
    print(f"Max Mahon v5 screening {len(symbols)} stocks (Niwes 5-5-5-5)...")

    candidates = []
    filtered_stocks = []
    filtered_out = 0
    error_count = 0

    for i, sym in enumerate(symbols):
        if sym in blacklisted:
            print(f"  [{i+1}/{len(symbols)}] {sym} — blacklisted, skipping")
            continue

        try:
            data = fetch_multi_year(sym)

            if data is None:
                print(f"  [{i+1}/{len(symbols)}] {sym} — skipped: no data")
                continue

            if "error" in data and not data.get("price"):
                print(f"  [{i+1}/{len(symbols)}] {sym} — error: {data['error']}")
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
                        "eps": data.get("eps_trailing"),
                    }
                })
                print(f"  [{i+1}/{len(symbols)}] {sym} — filtered: {', '.join(filter_reasons[:2])}")
                continue

            data['_hidden_holdings'] = check_hidden_value(sym)
            result = quality_score(data)

            # Apply near-miss penalty
            if near_miss:
                result["score"] = max(0, result["score"] - 5 * len(near_miss))
                result["signals"].extend([nm.split(":")[0] for nm in near_miss])
                result["reasons"].extend(near_miss)
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
            bd_str = f"D{breakdown['dividend']}+V{breakdown['valuation']}+C{breakdown['cash_flow']}+H{breakdown['hidden_value']}"
            print(f"  [{i+1}/{len(symbols)}] {marker} {sym} — {result['score']}/100 ({bd_str}){sig_str}")

        except Exception as e:
            error_count += 1
            print(f"  [{i+1}/{len(symbols)}] {sym} — error: {e}")

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
        # Apply valuation modifier + final 0-100 cap (after all signal adjustments)
        val_modifier = {"A": 5, "B": 0, "C": -5, "D": -10, "F": -20}
        c["score"] = max(0, min(100, c["score"] + val_modifier.get(val["grade"], 0)))
        # Add OVERPRICED signal
        if "OVERPRICED" in val["signals"] and "OVERPRICED" not in c["signals"]:
            c["signals"].append("OVERPRICED")

    candidates.sort(key=lambda x: x["score"], reverse=True)
    new_finds = [c for c in candidates if not c["in_watchlist"]]

    today = datetime.now().strftime("%Y-%m-%d")
    out = {
        "date": today,
        "agent": "Max Mahon v5",
        "scoring_version": "niwes-dividend-first-v1",
        "total_scanned": len(symbols),
        "passed_filter": len(candidates),
        "filtered_out": filtered_out,
        "new_discoveries": len(new_finds),
        "hard_filters": HARD_FILTERS,
        "candidates": candidates,
        "filtered_out_stocks": filtered_stocks,
    }

    out_path = DATA_DIR / f"screener_{today}.json"
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2, default=str), encoding="utf-8")

    print(f"\n{'='*60}")
    print(f"Scanned: {len(symbols)} | Passed: {len(candidates)} | Filtered: {filtered_out} | Errors: {error_count} | New: {len(new_finds)}")
    print(f"\nTop 10:")
    for c in candidates[:10]:
        marker = "★" if c["in_watchlist"] else "✦ NEW"
        bd = c["breakdown"]
        sig = f" [{','.join(c['signals'])}]" if c["signals"] else ""
        print(f"  {marker} {c['symbol']} — {c['score']}/100 (D{bd['dividend']}+V{bd['valuation']}+C{bd['cash_flow']}+H{bd['hidden_value']}){sig}")
    print(f"\nSaved → {out_path}")

    return out_path


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"screen_stocks fatal: {e}", file=sys.stderr)
        sys.exit(1)
