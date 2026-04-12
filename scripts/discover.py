"""Max Mahon v2 — Discovery: Claude analyzes quality-screened stocks for DCA candidates."""

import json
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
REPORTS_DIR = ROOT / "reports"
WATCHLIST = ROOT / "watchlist.json"


def get_latest_screener() -> Path:
    files = sorted(DATA_DIR.glob("screener_*.json"), reverse=True)
    if not files:
        print("No screener data found. Run screen_stocks.py first.")
        sys.exit(1)
    return files[0]


def fmt_candidate(c):
    m = c.get("metrics", {})
    agg = c.get("aggregates", {})
    bd = c.get("breakdown", {})
    signals = c.get("signals", [])
    warnings = c.get("warnings", [])
    yearly = c.get("yearly_metrics", [])
    div_hist = c.get("dividend_history", {})

    sig_str = f" | Signals: [{', '.join(signals)}]" if signals else ""
    warn_str = f"\n  ⚠ Warnings: {'; '.join(warnings)}" if warnings else ""

    # Yearly table
    yearly_str = ""
    if yearly:
        rows = []
        for y in yearly:
            rev = f"{y['revenue']/1e9:.1f}B" if y.get('revenue') else "N/A"
            ni = f"{y['net_income']/1e9:.1f}B" if y.get('net_income') else "N/A"
            eps = f"{y['diluted_eps']:.2f}" if y.get('diluted_eps') else "N/A"
            roe = f"{y['roe']*100:.0f}%" if y.get('roe') else "N/A"
            nm = f"{y['net_margin']*100:.0f}%" if y.get('net_margin') else "N/A"
            rows.append(f"    {y['year']}: Rev={rev} NI={ni} EPS={eps} ROE={roe} NM={nm}")
        yearly_str = "\n  Yearly:\n" + "\n".join(rows)

    # Dividend history
    div_str = ""
    if div_hist:
        sorted_years = sorted(div_hist.keys(), key=lambda x: int(x))
        recent = sorted_years[-8:] if len(sorted_years) > 8 else sorted_years
        div_entries = [f"{y}:฿{div_hist[y]:.2f}" for y in recent]
        div_str = f"\n  DPS History: {', '.join(div_entries)}"

    payout_str = f"{m['payout']*100:.0f}%" if m.get("payout") is not None else "N/A"
    rev_cagr = f"{agg.get('revenue_cagr', 0)*100:.0f}%" if agg.get('revenue_cagr') is not None else "N/A"
    eps_cagr = f"{agg.get('eps_cagr', 0)*100:.0f}%" if agg.get('eps_cagr') is not None else "N/A"

    return f"""- **{c['name']}** ({c['symbol']}) | Sector: {c['sector']} | Quality Score: {c['score']}/100 (P{bd.get('profitability',0)}+G{bd.get('growth',0)}+D{bd.get('dividend',0)}+S{bd.get('strength',0)}){sig_str}
  Yield: {m.get('dividend_yield', 0):.1f}% | P/E: {m.get('pe') or 'N/A'} | Fwd P/E: {m.get('forward_pe') or 'N/A'}
  Payout: {payout_str} | Rev CAGR: {rev_cagr} | EPS CAGR: {eps_cagr}
  Div Streak: {agg.get('dividend_streak', 0)}yr | Avg ROE: {f"{agg.get('avg_roe', 0)*100:.0f}%" if agg.get('avg_roe') else 'N/A'}
  Reasons: {', '.join(c.get('reasons', []))}{yearly_str}{div_str}{warn_str}"""


def build_prompt(screener_path: Path) -> str:
    data = json.loads(screener_path.read_text(encoding="utf-8"))
    watchlist = json.loads(WATCHLIST.read_text(encoding="utf-8"))

    watched_syms = [s["symbol"] for s in watchlist["stocks"]]
    new_finds = [c for c in data["candidates"] if not c["in_watchlist"]]
    existing = [c for c in data["candidates"] if c["in_watchlist"]]

    new_section = "\n".join(fmt_candidate(c) for c in new_finds[:15]) or "ไม่พบตัวใหม่ที่ผ่านเกณฑ์"
    existing_section = "\n".join(fmt_candidate(c) for c in existing) or "ไม่มีตัวใน watchlist ที่ผ่าน"

    return f"""คุณคือ Max Mahon — นักวิเคราะห์หุ้นไทย เชี่ยวชาญการคัดหุ้นคุณภาพสูงสำหรับ DCA ระยะยาว
สไตล์: Warren Buffett (คุณภาพธุรกิจ + moat) + เซียนฮง สถาพร (ปันผลดี + growth)
เป้าหมาย: หาหุ้นที่เหมาะ DCA 10-20 ปี ปันผลดีและเติบโตสม่ำเสมอ

วันที่: {data['date']}
Scanned: {data['total_scanned']} ตัว | ผ่าน Hard Filters: {data['passed_filter']} ตัว | ถูก filter ออก: {data.get('filtered_out', 0)} ตัว | ตัวใหม่: {data['new_discoveries']} ตัว

## Hard Filters (ต้องผ่านทุกข้อ — สไตล์ Buffett)
- ROE เฉลี่ย 4 ปี ≥ 15% (ไม่มีปีต่ำกว่า 12%)
- Net Margin เฉลี่ย ≥ 10% (ไม่บังคับ financial sector)
- D/E ≤ 1.5 (non-financial) / ≤ 10 (financial)
- EPS บวกอย่างน้อย 3 จาก 4 ปี
- FCF บวกอย่างน้อย 3 จาก 4 ปี
- Market Cap ≥ 5B THB

## Quality Score (100 คะแนน)
- **Profitability (30):** ROE consistency + gross margin + net margin trend
- **Growth (25):** Revenue CAGR + EPS CAGR + revenue consistency
- **Dividend (25):** Yield + payout sustainability + dividend streak
- **Strength (20):** D/E + interest coverage + FCF consistency + OCF/NI ratio

## Signal Tags
- **COMPOUNDER** — ROE ≥20% ทุกปี + revenue CAGR ≥10% + payout <60% → Buffett dream stock
- **CASH_COW** — FCF yield >8% + payout <70% + D/E <0.5 → เครื่องจักรเงินสด
- **DIVIDEND_KING** — yield ≥5% + payout 30-70% + streak ≥5 ปี → ปันผลมั่นคง
- **CONTRARIAN** — ราคาใกล้ 52w low + quality score สูง → ของดีราคาถูก
- **TURNAROUND** — forward PE ต่ำกว่า trailing มาก + revenue CAGR บวก
- **YIELD_TRAP** — yield >8% + ROE ลดลงทุกปี + payout >100% → ⚠ กับดัก
- **DATA_WARNING** — ข้อมูลผิดปกติ ห้ามใช้ตัดสินใจ

## Watchlist ปัจจุบัน ({len(watched_syms)} ตัว)
{', '.join(watched_syms)}

## ตัวใน Watchlist ที่ผ่านเกณฑ์
{existing_section}

## ตัวใหม่ที่ผ่านเกณฑ์ (ยังไม่อยู่ใน Watchlist)
{new_section}

---

## สิ่งที่ต้องทำ

สร้าง Discovery Report เป็น Markdown:

1. **สรุปผลคัดกรอง** — ผ่าน hard filters กี่ตัวจากทั้งหมด ภาพรวมเป็นยังไง (2-3 บรรทัด)

2. **ตัวใหม่ที่น่าเพิ่ม Watchlist** — จัดลำดับตาม quality score + signal:
   - ดู TREND หลายปีจาก Yearly data ไม่ใช่แค่ปีเดียว
   - COMPOUNDER → เหมาะ DCA สุด เพราะ compound returns
   - CASH_COW → เครื่องจักรเงินสด เหมาะ income portfolio
   - CONTRARIAN → ของดีราคาถูก แต่ต้องตรวจว่าถูกจริงไม่ใช่ถูกเพราะแย่
   - DATA_WARNING → เตือนชัดเจน ห้ามแนะนำ
   - วิเคราะห์แต่ละตัว: Business Quality, Financial Health, Growth Consistency, Dividend Sustainability
   - ให้ rating DCA: ⭐⭐⭐ / ⭐⭐ / ⭐
   - แนะนำ: ✅ เพิ่ม watchlist / ⚠️ ติดตามก่อน / ❌ ข้ามได้

3. **ตัวที่ควรออกจาก Watchlist** — ตัวไหนใน watchlist ปัจจุบันที่ไม่ผ่าน hard filters หรือ quality ต่ำ

4. **Sector Insight** — sector ไหนมี quality stocks เยอะสุด

5. **สรุป Action Items** — ตัวไหนควรเพิ่ม ตัวไหนควรออก เป็น list ชัดเจน

กฎ:
- เขียนภาษาไทย
- ใช้ตัวเลขจริง ห้ามแต่ง
- ข้อมูลไม่พอ = บอกตรงๆ
- ห้ามแนะนำซื้อขาย ให้ข้อมูลเท่านั้น
- ถ้ามี DATA_WARNING ต้องระบุชัดเจน
- เน้น TREND หลายปี — earnings กระโดด 100%+ ต้องตรวจว่าเป็น base effect หรือ growth จริง
- ตัวที่ผ่าน hard filters แล้ว = คุณภาพพื้นฐานดี แต่ยังต้องดู valuation + growth + dividend ประกอบ
"""


def main():
    screener = get_latest_screener()
    print(f"Using screener: {screener.name}")

    prompt = build_prompt(screener)

    today = datetime.now().strftime("%Y-%m-%d")
    report_path = REPORTS_DIR / f"discovery_{today}.md"

    print("Max Mahon v2 analyzing discoveries with Claude...")

    def find_claude_cli():
        for name in ["claude.cmd", "claude"]:
            p = shutil.which(name)
            if p:
                return p
        raise FileNotFoundError("ไม่เจอ Claude CLI — กรุณาติดตั้ง")

    claude_cmd = find_claude_cli()
    result = subprocess.run(
        [claude_cmd, "--print", "--model", "claude-sonnet-4-6", "-p", "-"],
        input=prompt,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=300,
    )

    if result.returncode != 0:
        print(f"Claude error: {result.stderr}")
        sys.exit(1)

    header = f"""---
agent: Max Mahon v2
date: {today}
type: discovery
---

"""
    report_path.write_text(header + result.stdout.strip(), encoding="utf-8")
    print(f"Discovery report → {report_path}")


if __name__ == "__main__":
    main()
