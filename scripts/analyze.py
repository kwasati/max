"""Max Mahon v2 — feed multi-year stock data to Claude for deep weekly analysis."""

import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
REPORTS_DIR = ROOT / "reports"
WATCHLIST = ROOT / "watchlist.json"


def get_latest_snapshot() -> Path:
    files = sorted(DATA_DIR.glob("snapshot_*.json"), reverse=True)
    if not files:
        print("No snapshot found. Run fetch_data.py first.")
        sys.exit(1)
    return files[0]


def fmt(val, pct=False, billions=False):
    if val is None:
        return "N/A"
    if pct:
        return f"{val * 100:.1f}%"
    if billions:
        return f"{val / 1e9:.1f}B"
    if isinstance(val, float):
        return f"{val:,.2f}"
    return f"{val:,}"


def build_stock_section(stock: dict, reason: str) -> str:
    if "error" in stock and not stock.get("price"):
        return f"### {stock['symbol']}\nError: {stock['error']}"

    sym = stock["symbol"]
    name = stock.get("name", sym)
    warnings = stock.get("warnings", [])
    yearly = stock.get("yearly_metrics", [])
    div_hist = stock.get("dividend_history", {})
    agg = stock.get("aggregates", {})

    # TTM basics
    header = f"""### {name} ({sym})
- Watchlist reason: {reason}
- Sector: {stock.get('sector', 'N/A')} | Industry: {stock.get('industry', 'N/A')}
- Price: ฿{fmt(stock.get('price'))} | 52W: ฿{fmt(stock.get('52w_low'))} - ฿{fmt(stock.get('52w_high'))}
- P/E: {fmt(stock.get('pe_ratio'))} | Forward P/E: {fmt(stock.get('forward_pe'))} | P/BV: {fmt(stock.get('pb_ratio'))}
- Dividend Yield: {fmt(stock.get('dividend_yield'))}% | Payout: {fmt(stock.get('payout_ratio'), pct=True)}
- 5Y Avg Yield: {stock.get('five_year_avg_yield', 'N/A')}%"""

    # Yearly financials table
    yearly_lines = []
    if yearly:
        yearly_lines.append("\n**Yearly Financials:**")
        yearly_lines.append("| ปี | Revenue | Net Income | EPS | ROE | Net Margin | D/E | FCF |")
        yearly_lines.append("|---|---|---|---|---|---|---|---|")
        for y in yearly:
            yearly_lines.append(
                f"| {y['year']} "
                f"| {fmt(y.get('revenue'), billions=True)} "
                f"| {fmt(y.get('net_income'), billions=True)} "
                f"| {fmt(y.get('diluted_eps'))} "
                f"| {fmt(y.get('roe'), pct=True)} "
                f"| {fmt(y.get('net_margin'), pct=True)} "
                f"| {fmt(y.get('de_ratio'))} "
                f"| {fmt(y.get('fcf'), billions=True)} |"
            )

    # Dividend history
    div_lines = []
    if div_hist:
        div_lines.append("\n**Dividend History (DPS per year):**")
        sorted_years = sorted(div_hist.keys(), key=int)
        recent = sorted_years[-10:] if len(sorted_years) > 10 else sorted_years
        div_entries = [f"{y}: ฿{div_hist[y]:.2f}" for y in recent]
        div_lines.append(", ".join(div_entries))

    # Aggregates
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

    # Warnings
    warn_lines = []
    if warnings:
        warn_lines.append(f"\n**⚠ Data Warnings:** {'; '.join(warnings)}")

    return "\n".join([header] + yearly_lines + div_lines + agg_lines + warn_lines)


def build_prompt(snapshot_path: Path) -> str:
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    watchlist = json.loads(WATCHLIST.read_text(encoding="utf-8"))
    reasons = {s["symbol"]: s["reason"] for s in watchlist["stocks"]}

    stock_sections = []
    for stock in snapshot["stocks"]:
        sym = stock.get("symbol", "")
        reason = reasons.get(sym, "")
        stock_sections.append(build_stock_section(stock, reason))

    stocks_text = "\n\n".join(stock_sections)
    date = snapshot["date"]

    return f"""คุณคือ Max Mahon — นักวิเคราะห์หุ้นไทยเน้นปัจจัยพื้นฐาน
สไตล์: Warren Buffett (คุณภาพธุรกิจ + moat + ถือยาว) + เซียนฮง สถาพร (ปันผลดี + growth)
เป้าหมาย: คัดหุ้นสำหรับ DCA ระยะยาว 10-20 ปี ที่ปันผลดีและเติบโตสม่ำเสมอ

วันที่วิเคราะห์: {date}

## ข้อมูลหุ้นใน Watchlist

{stocks_text}

---

## สิ่งที่ต้องวิเคราะห์

สร้าง Weekly Report เป็น Markdown วิเคราะห์ทุกตัวใน watchlist:

1. **สรุปภาพรวม** — ตลาดหุ้นไทยสัปดาห์นี้ (2-3 บรรทัด)

2. **วิเคราะห์รายตัว** — ดูข้อมูลย้อนหลังหลายปี ไม่ใช่แค่ปีเดียว:
   - **Business Quality** — ธุรกิจแข็งไหม มี moat ไหม ใครแข่งได้
   - **Financial Health** — หนี้ กระแสเงินสด interest coverage ยังดีไหม
   - **Growth Consistency** — revenue/earnings โตสม่ำเสมอกี่ปี ไม่ใช่แค่ปีล่าสุด
   - **Dividend Sustainability** — ปันผลจ่ายจาก cash จริงไหม track record กี่ปี trend ขึ้นหรือลง
   - **Valuation** — แพงหรือถูกเมื่อเทียบกับคุณภาพ
   - **DCA Suitability** — ⭐⭐⭐ (เหมาะมาก) / ⭐⭐ (พอได้) / ⭐ (ไม่แนะนำ DCA)
   - สรุป: น่าสะสม / ถือต่อ / ระวัง / ควรออก

3. **Top Picks สัปดาห์นี้** — 3 ตัวที่เหมาะ DCA ที่สุด + เหตุผลจากข้อมูลจริง

4. **Watch Out** — ตัวที่ต้องระวังหรือควรออกจาก watchlist + เหตุผล

5. **สรุปท้าย** — 3 บรรทัด ภาพรวมพอร์ต

กฎ:
- เขียนภาษาไทย อ่านง่าย
- ใช้ตัวเลขจริงจากข้อมูลที่ให้ ห้ามแต่ง
- ถ้าข้อมูลไม่พอ บอกตรงๆ
- ห้ามแนะนำซื้อขาย ให้วิเคราะห์ข้อมูลเท่านั้น
- ถ้ามี Data Warning ต้องระบุชัดเจนว่าข้อมูลอาจไม่น่าเชื่อถือ
- เน้นดู TREND หลายปี ไม่ใช่แค่ตัวเลขปีเดียว — ถ้า earnings กระโดด 100%+ ต้องดูว่าเป็น base effect หรือ growth จริง
"""


def run_claude(prompt: str, output_path: Path):
    print("Max Mahon v2 analyzing with Claude...")

    result = subprocess.run(
        ["claude.cmd", "--print", "--model", "claude-sonnet-4-6", "-p", "-"],
        input=prompt,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=300,
    )

    if result.returncode != 0:
        print(f"Claude CLI error: {result.stderr}")
        sys.exit(1)

    today = datetime.now().strftime("%Y-%m-%d")
    header = f"""---
agent: Max Mahon v2
date: {today}
type: weekly-analysis
---

"""
    output_path.write_text(header + result.stdout.strip(), encoding="utf-8")
    print(f"Report saved → {output_path}")


def main():
    snapshot = get_latest_snapshot()
    print(f"Using snapshot: {snapshot.name}")

    prompt = build_prompt(snapshot)

    today = datetime.now().strftime("%Y-%m-%d")
    report_path = REPORTS_DIR / f"weekly_{today}.md"

    run_claude(prompt, report_path)


if __name__ == "__main__":
    main()
