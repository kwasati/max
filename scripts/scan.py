"""Max Mahon v5 — Unified Scan (Niwes): top candidates + watchlist update + new in batch + watch out."""

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
REPORTS_DIR = ROOT / "reports"
USER_DATA = ROOT / "user_data.json"
HISTORY_FILE = DATA_DIR / "history.json"

# Plan 08 — make screen_stocks importable for exit signal detection
sys.path.insert(0, str(ROOT / "scripts"))
try:
    from screen_stocks import detect_exit_signal, load_exit_baseline
except Exception:
    detect_exit_signal = None
    load_exit_baseline = None

load_dotenv(Path("C:/WORKSPACE/.env"))


_SCREENER_DATE_PATTERN = re.compile(r"^screener_\d{4}-\d{2}-\d{2}\.json$")


def get_latest_screener() -> Path:
    files = sorted(
        [f for f in DATA_DIR.glob("screener_*.json") if _SCREENER_DATE_PATTERN.match(f.name)],
        reverse=True,
    )
    if not files:
        print("No screener data found. Run screen_stocks.py first.")
        sys.exit(1)
    return files[0]


def build_stock_section(stock: dict, reason: str = "") -> str:
    """รับ candidate จาก screener (มี yearly_metrics, dividend_history, aggregates) สร้าง section markdown"""
    sym = stock.get("symbol", "?")
    name = stock.get("name", sym)
    metrics = stock.get("metrics", {})
    agg = stock.get("aggregates", {})
    yearly = stock.get("yearly_metrics", [])
    div_hist = stock.get("dividend_history", {})
    signals = stock.get("signals", [])
    warnings = stock.get("warnings", [])
    reasons = stock.get("reasons", [])
    bd = stock.get("breakdown", {})
    score = stock.get("score")

    header_lines = [f"### {name} ({sym})"]
    if reason:
        header_lines.append(f"- Watchlist note: {reason}")
    header_lines.append(f"- Sector: {stock.get('sector', 'N/A')}")
    if score is not None:
        header_lines.append(
            f"- Quality Score: {score}/100 "
            f"(P{bd.get('profitability', 0)}+G{bd.get('growth', 0)}+D{bd.get('dividend', 0)}+S{bd.get('strength', 0)})"
        )
    if signals:
        header_lines.append(f"- Signals: {', '.join(signals)}")
    header_lines.append(
        f"- Price: ฿{fmt(metrics.get('price'))} | P/E: {fmt(metrics.get('pe'))} | Fwd P/E: {fmt(metrics.get('forward_pe'))}"
    )
    header_lines.append(
        f"- Dividend Yield: {fmt(metrics.get('dividend_yield'))}% | Payout: {fmt(metrics.get('payout'), pct=True)}"
    )

    yearly_lines = []
    if yearly:
        yearly_lines.append("\n**Yearly Financials:**")
        yearly_lines.append("| ปี | Revenue | Net Income | EPS | ROE | Net Margin | D/E | FCF |")
        yearly_lines.append("|---|---|---|---|---|---|---|---|")
        for y in yearly:
            yearly_lines.append(
                f"| {y.get('year')} "
                f"| {fmt(y.get('revenue'), billions=True)} "
                f"| {fmt(y.get('net_income'), billions=True)} "
                f"| {fmt(y.get('diluted_eps'))} "
                f"| {fmt(y.get('roe'), pct=True)} "
                f"| {fmt(y.get('net_margin'), pct=True)} "
                f"| {fmt(y.get('de_ratio'))} "
                f"| {fmt(y.get('fcf'), billions=True)} |"
            )

    div_lines = []
    if div_hist:
        div_lines.append("\n**Dividend History (DPS per year):**")
        sorted_years = sorted(div_hist.keys(), key=lambda x: int(x) if str(x).isdigit() else 0)
        recent = sorted_years[-10:] if len(sorted_years) > 10 else sorted_years
        div_entries = [f"{y}: ฿{div_hist[y]:.2f}" for y in recent]
        div_lines.append(", ".join(div_entries))

    agg_lines = []
    if agg:
        agg_lines.append("\n**Aggregates:**")
        agg_lines.append(
            f"- Revenue CAGR: {fmt(agg.get('revenue_cagr'), pct=True)} | EPS CAGR: {fmt(agg.get('eps_cagr'), pct=True)}"
        )
        agg_lines.append(
            f"- Avg ROE: {fmt(agg.get('avg_roe'), pct=True)} | Min ROE: {fmt(agg.get('min_roe'), pct=True)} | Avg Net Margin: {fmt(agg.get('avg_net_margin'), pct=True)}"
        )
        agg_lines.append(
            f"- Dividend Streak (ไม่เคยขาด): {agg.get('dividend_streak', 0)} ปี | Growth Streak: {agg.get('dividend_growth_streak', 0)} ปี"
        )
        agg_lines.append(
            f"- Interest Coverage: {fmt(agg.get('latest_interest_coverage'))}x | OCF/NI: {fmt(agg.get('latest_ocf_ni_ratio'))}x"
        )

    reason_lines = []
    if reasons:
        reason_lines.append(f"\n**Reasons:** {', '.join(reasons)}")

    warn_lines = []
    if warnings:
        warn_lines.append(f"\n**⚠ Data Warnings:** {'; '.join(warnings)}")

    return "\n".join(header_lines + yearly_lines + div_lines + agg_lines + reason_lines + warn_lines)


def build_filtered_section(stock: dict, reason: str = "") -> str:
    """สำหรับ watchlist stocks ที่ fail filter (schema: symbol, name, sector, reasons, basic_metrics)"""
    sym = stock.get("symbol", "?")
    name = stock.get("name", sym)
    basic = stock.get("basic_metrics", {})
    fail_reasons = stock.get("reasons", [])

    lines = [f"### {name} ({sym}) — ❌ หลุดรอบนี้"]
    if reason:
        lines.append(f"- Watchlist note: {reason}")
    lines.append(f"- Sector: {stock.get('sector', 'N/A')}")
    lines.append(f"- Fail reasons: {'; '.join(fail_reasons) if fail_reasons else 'N/A'}")
    lines.append(
        f"- Price: ฿{fmt(basic.get('price'))} | P/E: {fmt(basic.get('pe'))} | "
        f"Yield: {fmt(basic.get('dividend_yield'))}% | ROE: {fmt(basic.get('roe'), pct=True)} | "
        f"D/E: {fmt(basic.get('de'))} | MCap: {fmt(basic.get('mcap'), billions=True)}"
    )
    return "\n".join(lines)


def load_historical_candidates(current_screener: Path) -> set:
    """รวบรวม symbols ทั้งหมดที่เคยอยู่ใน candidates array ของ screener รอบก่อนๆ (ไม่รวม current)"""
    seen = set()
    for f in DATA_DIR.glob("screener_*.json"):
        if f.name == current_screener.name:
            continue
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            for c in data.get("candidates", []):
                if c.get("symbol"):
                    seen.add(c["symbol"])
        except Exception:
            continue
    return seen


def classify_stocks(screener_data: dict, watchlist: list, current_screener: Path):
    """แยกเป็น 3 groups: top_candidates, watchlist_current, new_in_batch"""
    candidates = screener_data.get("candidates", [])
    filtered_out = screener_data.get("filtered_out_stocks", [])
    wl_set = set(watchlist)

    # top_candidates: score >= 50, ไม่อยู่ใน watchlist, sort desc, cap 15
    top = [c for c in candidates if c.get("score", 0) >= 50 and c["symbol"] not in wl_set]
    top.sort(key=lambda x: x.get("score", 0), reverse=True)
    top = top[:15]

    # watchlist_current: watchlist symbols ที่เจอใน screener (passed or failed)
    cand_by_sym = {c["symbol"]: c for c in candidates}
    fail_by_sym = {f["symbol"]: f for f in filtered_out}

    watchlist_current = []
    for sym in watchlist:
        if sym in cand_by_sym:
            stock = dict(cand_by_sym[sym])
            stock["_status"] = "PASSED"
            watchlist_current.append(stock)
        elif sym in fail_by_sym:
            stock = dict(fail_by_sym[sym])
            stock["_status"] = "FAILED"
            watchlist_current.append(stock)

    # new_in_batch: top_candidates ที่ symbol ไม่เคยอยู่ใน candidates array ของ screener รอบก่อน
    historical = load_historical_candidates(current_screener)
    new_in_batch = [c for c in top if c["symbol"] not in historical]

    # Plan 08 — watchlist_exit_alerts: stocks with exit triggers per Niwes exit rules
    watchlist_exit_alerts = []
    if detect_exit_signal is not None and load_exit_baseline is not None:
        for stock in watchlist_current:
            sym = stock.get("symbol", "")
            if not sym:
                continue
            baseline = load_exit_baseline(sym)
            if not baseline:
                continue
            m = stock.get("metrics") or stock.get("basic_metrics") or {}
            current_data = {
                "dividend_yield": m.get("dividend_yield"),
                "pe_ratio": m.get("pe"),
                "pb_ratio": m.get("pb_ratio"),
                "market_cap": m.get("mcap"),
                "aggregates": stock.get("aggregates", {}),
                "yearly_metrics": stock.get("yearly_metrics", []),
            }
            triggers = detect_exit_signal(sym, current_data, baseline)
            if triggers:
                sigs = list(stock.get("signals") or [])
                if "EXIT_SIGNAL" not in sigs:
                    sigs.append("EXIT_SIGNAL")
                stock["signals"] = sigs
                watchlist_exit_alerts.append({
                    "symbol": sym,
                    "name": stock.get("name", sym),
                    "status": stock.get("_status"),
                    "triggers": triggers,
                })

    return top, watchlist_current, new_in_batch, watchlist_exit_alerts


def build_exit_alerts_section(exit_alerts: list) -> str:
    """Format Watchlist Exit Alerts section for scan report (Plan 08)."""
    if not exit_alerts:
        return "— ไม่มี exit alert ในรอบนี้"
    parts = []
    for a in exit_alerts:
        sym = a.get("symbol", "?")
        name = a.get("name", sym)
        status = a.get("status", "")
        lines = [f"### {name} ({sym}) — ⚠ EXIT ALERT ({status})"]
        for t in a.get("triggers", []):
            lines.append(f"- **{t['type']}** [{t['severity']}] — {t['reason']}")
        parts.append("\n".join(lines))
    return "\n\n".join(parts)


def load_history() -> dict:
    if not HISTORY_FILE.exists():
        return {"scans": []}
    try:
        data = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or "scans" not in data:
            return {"scans": []}
        return data
    except Exception:
        return {"scans": []}


def next_scan_num(history: dict) -> int:
    scans = history.get("scans", [])
    if not scans:
        return 1
    nums = [s.get("num", 0) for s in scans]
    return max(nums) + 1


def main():
    screener_path = get_latest_screener()
    print(f"Using screener: {screener_path.name}")

    screener_data = json.loads(screener_path.read_text(encoding="utf-8"))

    if USER_DATA.exists():
        user_data = json.loads(USER_DATA.read_text(encoding="utf-8"))
    else:
        user_data = {"watchlist": [], "notes": {}}

    watchlist = user_data.get("watchlist", [])
    notes = user_data.get("notes", {})

    top_candidates, watchlist_current, new_in_batch, watchlist_exit_alerts = classify_stocks(
        screener_data, watchlist, screener_path
    )

    print(
        f"Classified: top={len(top_candidates)} watchlist={len(watchlist_current)} "
        f"new={len(new_in_batch)} exit_alerts={len(watchlist_exit_alerts)}"
    )

    history = load_history()
    scan_num = next_scan_num(history)
    today = datetime.now().strftime("%Y-%m-%d")
    scan_date = screener_data.get("date", today)

    # Wire deterministic report generation (niwes-algo-02 task 3)
    from report_template import generate_report_md

    # Determine prev_scan for diff (New In Batch section)
    prev_scan = None
    try:
        scans_list = history.get("scans") if isinstance(history, dict) else history
        if scans_list:
            prev_scan = scans_list[-1]  # most recent prior scan (before this one)
    except Exception:
        prev_scan = None

    report_path = REPORTS_DIR / f"scan_{today}.md"
    report_md = generate_report_md(screener_data, scan_num, prev_scan)
    report_path.write_text(report_md, encoding="utf-8")
    print(f"report written: {report_path}")

    # Wire v2 history
    from history_manager import build_v2_entry, append_scan_v2

    history_entry = build_v2_entry(screener_data, scan_num, report_path.name)
    append_scan_v2(history_entry, history)  # pass loaded history dict to avoid re-read
    print(f"history entry appended: scan_num={scan_num}")

    # Telegram alert for high-severity exit triggers (plan 05 Phase 3)
    try:
        from telegram_alert import send_exit_alert
        candidates = screener_data.get("candidates", [])
        high_triggers = [
            {**t, "symbol": c["symbol"]}
            for c in candidates
            for t in c.get("exit_triggers", [])
            if t.get("severity") == "high"
        ]
        if high_triggers:
            send_exit_alert(high_triggers)
    except Exception as e:
        print(f"telegram alert skip: {e}")


if __name__ == "__main__":
    main()
