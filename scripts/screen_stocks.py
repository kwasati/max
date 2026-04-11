"""Max Mahon — Stock Screener: scan SET universe, find hidden gems."""

import json
import sys
import time
from datetime import datetime
from pathlib import Path

import yfinance as yf

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
UNIVERSE = DATA_DIR / "set_universe.json"
WATCHLIST = ROOT / "watchlist.json"

CRITERIA = {
    "min_dividend_yield": 2.5,
    "max_pe": 18,
    "min_roe": 8,
    "max_debt_to_equity": 200,
    "min_market_cap": 5_000_000_000,
}


def normalize_yield(val):
    """Normalize dividendYield: yfinance returns decimal (0.055) or percent (5.5)."""
    if val is None:
        return 0
    if val < 1:
        return val * 100
    return val


def score_stock(info: dict) -> dict:
    """Score a stock on dividend quality + growth potential."""
    raw_dy = info.get("dividendYield") or 0
    dy = normalize_yield(raw_dy)
    pe = info.get("trailingPE")
    fwd_pe = info.get("forwardPE")
    roe = info.get("returnOnEquity") or 0
    de = info.get("debtToEquity") or 999
    raw_payout = info.get("payoutRatio")
    payout = raw_payout  # None = unknown, keep as sentinel
    rev_growth = info.get("revenueGrowth") or 0
    earn_growth = info.get("earningsGrowth") or 0
    mcap = info.get("marketCap") or 0
    fcf = info.get("freeCashflow") or 0
    current_price = info.get("currentPrice") or info.get("regularMarketPrice")
    low_52w = info.get("fiftyTwoWeekLow")

    score = 0
    reasons = []
    signals = []

    # Dividend quality (max 40 pts)
    if dy >= 5:
        score += 20
        reasons.append(f"yield สูงมาก {dy:.1f}%")
    elif dy >= 3.5:
        score += 15
        reasons.append(f"yield ดี {dy:.1f}%")
    elif dy >= 2.5:
        score += 10
        reasons.append(f"yield พอใช้ {dy:.1f}%")

    # Payout scoring: skip when None (unknown)
    if payout is not None:
        if 0.3 <= payout <= 0.7:
            score += 10
            reasons.append("payout ratio สมดุล")
        elif 0.7 < payout <= 0.85:
            score += 5
            reasons.append("payout ค่อนข้างสูง")

    if fcf > 0:
        score += 10
        reasons.append("free cashflow บวก")

    # Valuation (max 25 pts) — require PE > 1 to filter corrupt data
    if pe and pe > 1 and pe < 10:
        score += 15
        reasons.append(f"P/E ถูกมาก {pe:.1f}")
    elif pe and pe > 1 and pe < 14:
        score += 10
        reasons.append(f"P/E สมเหตุสมผล {pe:.1f}")
    elif pe and pe > 1 and pe < 18:
        score += 5

    if fwd_pe and fwd_pe > 1 and pe and pe > 1 and fwd_pe < pe * 0.85:
        score += 10
        reasons.append("forward P/E ลดลงชัด → กำไรโต")

    # Growth (max 20 pts)
    if rev_growth > 0.10:
        score += 10
        reasons.append(f"revenue โต {rev_growth*100:.0f}%")
    elif rev_growth > 0.03:
        score += 5

    if earn_growth > 0.15:
        score += 10
        reasons.append(f"earnings โต {earn_growth*100:.0f}%")
    elif earn_growth > 0.05:
        score += 5

    # Earnings crash penalty
    if earn_growth < -0.10:
        score -= 10
        reasons.append(f"earnings ร่วง {earn_growth*100:.0f}%")

    # Quality (max 15 pts)
    if roe > 0.20:
        score += 10
        reasons.append(f"ROE เด่น {roe*100:.0f}%")
    elif roe > 0.12:
        score += 7
    elif roe > 0.08:
        score += 3

    if de < 80:
        score += 5
        reasons.append("หนี้ต่ำ")

    # --- Smart Scoring: Yield Trap ---
    if dy > 8 and (earn_growth < -0.05 or (payout is not None and payout > 1.0)):
        signals.append("YIELD_TRAP")
        score -= 15
        reasons.append("⚠ yield trap: ปันผลสูงแต่กำไรถดถอย/จ่ายเกินตัว")

    # --- Smart Scoring: Contrarian ---
    if (current_price and low_52w and low_52w > 0
            and current_price <= low_52w * 1.20
            and dy > 3 and earn_growth >= -0.05):
        signals.append("CONTRARIAN")
        score += 15
        reasons.append("★ contrarian: ราคาใกล้ 52w low + yield ดี + กำไรไม่ถดถอย")

    # --- Smart Scoring: Turnaround ---
    if fwd_pe and pe and fwd_pe > 1 and pe > 1 and fwd_pe < pe * 0.7 and rev_growth > 0:
        signals.append("TURNAROUND")
        score += 10
        reasons.append("★ turnaround: forward PE ต่ำกว่า trailing มาก + revenue โต")

    # --- Smart Scoring: Dividend King ---
    if dy > 5 and payout is not None and 0.3 <= payout <= 0.7:
        signals.append("DIVIDEND_KING")
        reasons.append("★ dividend king: yield สูง + payout สมดุล")

    return {
        "score": score,
        "signals": signals,
        "reasons": reasons,
        "metrics": {
            "dividend_yield": dy,
            "pe": pe,
            "forward_pe": fwd_pe,
            "roe": roe,
            "de": de,
            "payout": payout,
            "rev_growth": rev_growth,
            "earn_growth": earn_growth,
            "mcap": mcap,
            "fcf": fcf,
            "current_price": current_price,
            "52w_low": low_52w,
        },
    }


def passes_filter(info: dict) -> bool:
    """Basic filter before scoring."""
    raw_dy = info.get("dividendYield") or 0
    dy = normalize_yield(raw_dy)
    pe = info.get("trailingPE")
    roe = info.get("returnOnEquity") or 0
    de = info.get("debtToEquity") or 999
    mcap = info.get("marketCap") or 0
    sector = info.get("sector", "")

    if mcap < CRITERIA["min_market_cap"]:
        return False
    if dy < CRITERIA["min_dividend_yield"]:
        return False
    if pe and pe > CRITERIA["max_pe"]:
        return False
    if roe < CRITERIA["min_roe"] / 100:
        return False
    # Sector-aware D/E filter: banks/finance naturally have high D/E
    if sector in ("Financial Services", "Banking"):
        if de > 2000:
            return False
    elif de > CRITERIA["max_debt_to_equity"]:
        return False
    return True


def main():
    universe = json.loads(UNIVERSE.read_text(encoding="utf-8"))
    watchlist = json.loads(WATCHLIST.read_text(encoding="utf-8"))
    watched = {s["symbol"] for s in watchlist["stocks"]}

    symbols = universe["symbols"]
    print(f"Max Mahon screening {len(symbols)} stocks...")

    candidates = []
    skipped = 0

    for i, sym in enumerate(symbols):
        try:
            tk = yf.Ticker(sym)
            info = tk.info or {}

            # Empty info detection
            if len(info) < 5:
                print(f"  [{i+1}/{len(symbols)}] {sym} — near-empty info ({len(info)} keys), skipping")
                skipped += 1
                continue

            name = info.get("shortName", sym)

            if not passes_filter(info):
                skipped += 1
                print(f"  [{i+1}/{len(symbols)}] {sym} — filtered out")
                continue

            result = score_stock(info)
            in_watchlist = sym in watched

            entry = {
                "symbol": sym,
                "name": name,
                "sector": info.get("sector", "N/A"),
                "in_watchlist": in_watchlist,
                **result,
            }
            candidates.append(entry)

            marker = "★" if in_watchlist else "✦"
            sig_str = f" [{','.join(result['signals'])}]" if result.get("signals") else ""
            print(f"  [{i+1}/{len(symbols)}] {marker} {sym} ({name}) — score: {result['score']}{sig_str} | {', '.join(result['reasons'][:3])}")

        except Exception as e:
            print(f"  [{i+1}/{len(symbols)}] {sym} — error: {e}")
        finally:
            time.sleep(0.3)

    candidates.sort(key=lambda x: x["score"], reverse=True)

    new_finds = [c for c in candidates if not c["in_watchlist"]]

    today = datetime.now().strftime("%Y-%m-%d")
    out = {
        "date": today,
        "agent": "Max Mahon",
        "total_scanned": len(symbols),
        "passed_filter": len(candidates),
        "new_discoveries": len(new_finds),
        "criteria": CRITERIA,
        "candidates": candidates,
    }

    out_path = DATA_DIR / f"screener_{today}.json"
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2, default=str), encoding="utf-8")

    print(f"\n{'='*50}")
    print(f"Scanned: {len(symbols)} | Passed: {len(candidates)} | New finds: {len(new_finds)}")
    print(f"\nTop 10:")
    for c in candidates[:10]:
        marker = "★" if c["in_watchlist"] else "✦ NEW"
        print(f"  {marker} {c['symbol']} — score {c['score']} | {', '.join(c['reasons'][:2])}")
    print(f"\nSaved → {out_path}")

    return out_path


if __name__ == "__main__":
    main()
