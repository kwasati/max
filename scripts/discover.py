"""Max Mahon — Discovery: Claude analyzes screener results, suggests new picks."""

import json
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


def build_prompt(screener_path: Path) -> str:
    data = json.loads(screener_path.read_text(encoding="utf-8"))
    watchlist = json.loads(WATCHLIST.read_text(encoding="utf-8"))

    watched_syms = [s["symbol"] for s in watchlist["stocks"]]
    new_finds = [c for c in data["candidates"] if not c["in_watchlist"]]
    existing = [c for c in data["candidates"] if c["in_watchlist"]]

    def fmt_candidate(c):
        m = c["metrics"]
        return f"""- **{c['name']}** ({c['symbol']}) | Sector: {c['sector']} | Score: {c['score']}/100
  Yield: {m['dividend_yield']:.1f}% | P/E: {m['pe'] or 'N/A'} | Fwd P/E: {m['forward_pe'] or 'N/A'}
  ROE: {m['roe']*100:.0f}% | D/E: {m['de']:.0f} | Payout: {m['payout']*100:.0f}%
  Rev Growth: {m['rev_growth']*100:.0f}% | Earn Growth: {m['earn_growth']*100:.0f}%
  Reasons: {', '.join(c['reasons'])}"""

    new_section = "\n".join(fmt_candidate(c) for c in new_finds[:20]) or "ไม่พบตัวใหม่ที่ผ่านเกณฑ์"
    existing_section = "\n".join(fmt_candidate(c) for c in existing) or "ไม่มีตัวใน watchlist ที่ผ่าน"

    return f"""คุณคือ Max Mahon — นักวิเคราะห์หุ้นไทย เชี่ยวชาญการคัดหุ้นปันผลและหุ้นเติบโต

วันที่: {data['date']}
Scanned: {data['total_scanned']} ตัว | ผ่านเกณฑ์: {data['passed_filter']} ตัว | ตัวใหม่: {data['new_discoveries']} ตัว

เกณฑ์คัดกรอง:
- Dividend Yield ≥ {data['criteria']['min_dividend_yield']}%
- P/E ≤ {data['criteria']['max_pe']}
- ROE ≥ {data['criteria']['min_roe']}%
- D/E ≤ {data['criteria']['max_debt_to_equity']}
- Market Cap ≥ 5B THB

## หุ้นใน Watchlist ปัจจุบัน ({len(watched_syms)} ตัว)
{', '.join(watched_syms)}

## หุ้นใน Watchlist ที่ผ่านเกณฑ์
{existing_section}

## หุ้นใหม่ที่ผ่านเกณฑ์ (ยังไม่อยู่ใน Watchlist)
{new_section}

---

## สิ่งที่ต้องทำ

สร้าง Discovery Report เป็น Markdown:

1. **สรุปผลคัดกรอง** — ภาพรวม หุ้นไทยที่ผ่านเกณฑ์มีลักษณะร่วมอะไร (2-3 บรรทัด)

2. **ตัวใหม่ที่น่าเพิ่ม Watchlist** — วิเคราะห์แต่ละตัวใหม่:
   - ทำไมผ่านเกณฑ์
   - จุดแข็ง / จุดเสี่ยง
   - เหมาะกับสไตล์ "ปันผล + เติบโต" แค่ไหน
   - แนะนำ: ✅ เพิ่ม watchlist / ⚠️ ติดตามก่อน / ❌ ข้ามได้

3. **ตัวที่ควรออกจาก Watchlist** — มีตัวไหนใน watchlist ปัจจุบันที่ตัวเลขแย่ลงไหม

4. **Sector Insight** — sector ไหนมี value เยอะสุดตอนนี้

5. **สรุป Action Items** — ตัวไหนควรเพิ่ม ตัวไหนควรออก เป็น list ชัดเจน

กฎ:
- เขียนภาษาไทย
- ใช้ตัวเลขจริงจากข้อมูล ห้ามแต่ง
- ถ้าข้อมูลไม่พอ บอกตรงๆ
- ห้ามแนะนำซื้อขาย ให้ข้อมูลเท่านั้น
"""


def main():
    screener = get_latest_screener()
    print(f"Using screener: {screener.name}")

    prompt = build_prompt(screener)

    today = datetime.now().strftime("%Y-%m-%d")
    report_path = REPORTS_DIR / f"discovery_{today}.md"

    print("Max Mahon analyzing discoveries with Claude...")
    result = subprocess.run(
        ["claude", "--print", "--model", "claude-sonnet-4-6", "-p", prompt],
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=300,
    )

    if result.returncode != 0:
        print(f"Claude error: {result.stderr}")
        sys.exit(1)

    header = f"""---
agent: Max Mahon
date: {today}
type: discovery
---

"""
    report_path.write_text(header + result.stdout.strip(), encoding="utf-8")
    print(f"Discovery report → {report_path}")


if __name__ == "__main__":
    main()
