"""Max Mahon — feed stock data to Claude CLI for weekly analysis."""

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
    """Find the most recent snapshot file."""
    files = sorted(DATA_DIR.glob("snapshot_*.json"), reverse=True)
    if not files:
        print("No snapshot found. Run fetch_data.py first.")
        sys.exit(1)
    return files[0]


def build_prompt(snapshot_path: Path) -> str:
    """Build the analysis prompt for Claude."""
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    watchlist = json.loads(WATCHLIST.read_text(encoding="utf-8"))

    reasons = {s["symbol"]: s["reason"] for s in watchlist["stocks"]}

    stock_sections = []
    for stock in snapshot["stocks"]:
        if "error" in stock and not stock.get("price"):
            stock_sections.append(f"### {stock['symbol']}\nError fetching data: {stock['error']}")
            continue

        sym = stock["symbol"]
        reason = reasons.get(sym, "")

        def fmt(val, pct=False, mult=1):
            if val is None:
                return "N/A"
            if pct:
                return f"{val * mult:.1f}%"
            return f"{val:,.2f}" if isinstance(val, float) else f"{val:,}"

        section = f"""### {stock.get('name', sym)} ({sym})
- Watchlist reason: {reason}
- Sector: {stock.get('sector', 'N/A')} | Industry: {stock.get('industry', 'N/A')}
- Price: ฿{fmt(stock.get('price'))} | 52W: ฿{fmt(stock.get('52w_low'))} - ฿{fmt(stock.get('52w_high'))}
- P/E: {fmt(stock.get('pe_ratio'))} | Forward P/E: {fmt(stock.get('forward_pe'))} | P/BV: {fmt(stock.get('pb_ratio'))}
- Dividend Yield: {fmt(stock.get('dividend_yield'), pct=True, mult=1)} | Payout Ratio: {fmt(stock.get('payout_ratio'), pct=True, mult=100)}
- 5Y Avg Yield: {fmt(stock.get('five_year_avg_yield'))}%
- EPS: {fmt(stock.get('eps_trailing'))} | Forward EPS: {fmt(stock.get('eps_forward'))}
- Revenue Growth: {fmt(stock.get('revenue_growth'), pct=True, mult=100)} | Earnings Growth: {fmt(stock.get('earnings_growth'), pct=True, mult=100)}
- Profit Margin: {fmt(stock.get('profit_margin'), pct=True, mult=100)} | ROE: {fmt(stock.get('roe'), pct=True, mult=100)}
- D/E: {fmt(stock.get('debt_to_equity'))} | Free Cashflow: {fmt(stock.get('free_cashflow'))}
- Recent Dividends (last 8): {stock.get('recent_dividends', [])}"""
        stock_sections.append(section)

    stocks_text = "\n\n".join(stock_sections)
    date = snapshot["date"]

    return f"""คุณคือ Max Mahon — นักวิเคราะห์หุ้นไทยเน้นปัจจัยพื้นฐาน เชี่ยวชาญหุ้นปันผลและหุ้นเติบโต

วันที่วิเคราะห์: {date}

## ข้อมูลหุ้นใน Watchlist

{stocks_text}

---

## สิ่งที่ต้องวิเคราะห์

สร้าง Weekly Report เป็น Markdown โดยวิเคราะห์ทุกตัวใน watchlist:

1. **สรุปภาพรวม** — ตลาดหุ้นไทยสัปดาห์นี้เป็นอย่างไร (2-3 บรรทัด)

2. **วิเคราะห์รายตัว** — แต่ละตัวให้:
   - สถานะปัจจุบัน (ราคาเทียบ 52W range, แพง/ถูก)
   - คุณภาพปันผล (yield, payout ratio, ความสม่ำเสมอ)
   - โอกาสเติบโต (revenue/earnings growth, forward PE vs trailing PE)
   - ความเสี่ยง (D/E, margin trend)
   - สรุป: น่าสะสม / ถือต่อ / ระวัง

3. **Top Picks สัปดาห์นี้** — 3 ตัวที่น่าสนใจที่สุด พร้อมเหตุผล

4. **Watch Out** — ตัวที่ต้องระวัง พร้อมเหตุผล

5. **สรุปท้าย** — 3 บรรทัด คำแนะนำภาพรวม

กฎ:
- เขียนภาษาไทย อ่านง่าย ไม่ต้องเป็นทางการมาก
- ใช้ข้อมูลตัวเลขจริงที่ให้ ห้ามแต่งตัวเลข
- ถ้าข้อมูลไม่พอให้บอกตรงๆ ว่า "ข้อมูลไม่เพียงพอ"
- ห้ามแนะนำซื้อขายโดยตรง ให้วิเคราะห์ให้ข้อมูลเท่านั้น
"""


def run_claude(prompt: str, output_path: Path):
    """Run Claude CLI with the analysis prompt."""
    print("Max Mahon analyzing with Claude...")

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

    report = result.stdout.strip()

    today = datetime.now().strftime("%Y-%m-%d")
    header = f"""---
agent: Max Mahon
date: {today}
type: weekly-analysis
---

"""
    output_path.write_text(header + report, encoding="utf-8")
    print(f"Report saved → {output_path}")


def main():
    snapshot = get_latest_snapshot()
    print(f"Using snapshot: {snapshot.name}")

    prompt = build_prompt(snapshot)

    today = datetime.now().strftime("%Y-%m-%d")
    report_path = REPORTS_DIR / f"weekly_{today}.md"

    run_claude(prompt, report_path)
    print("\nMax Mahon signing off. ✌️")


if __name__ == "__main__":
    main()
