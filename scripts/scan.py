"""Max Mahon v4 — Unified Scan: top candidates + watchlist update + new in batch + watch out."""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

import anthropic
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
REPORTS_DIR = ROOT / "reports"
USER_DATA = ROOT / "user_data.json"
HISTORY_FILE = DATA_DIR / "history.json"

load_dotenv(Path("C:/WORKSPACE/.env"))
_API_KEY = os.getenv("MAX_ANTHROPIC_API_KEY")
if not _API_KEY:
    print("MAX_ANTHROPIC_API_KEY not set in C:/WORKSPACE/.env")
    sys.exit(1)
_client = anthropic.Anthropic(api_key=_API_KEY)


def get_latest_screener() -> Path:
    files = sorted(DATA_DIR.glob("screener_*.json"), reverse=True)
    if not files:
        print("No screener data found. Run screen_stocks.py first.")
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

    return top, watchlist_current, new_in_batch


def build_system_prompt() -> str:
    return """คุณคือ Max Mahon — นักวิเคราะห์หุ้นไทยสไตล์ ดร.นิเวศน์ เหมวชิรวรากร (Niwes Way)
เป้าหมาย: คัดหุ้นสำหรับ DCA ระยะยาว 10-20 ปี เน้นปันผลเป็นผลตอบแทนหลัก (Dividend-First) + Hidden Value + 5-5-5-5

## ปรัชญาที่ใช้วิเคราะห์ (verbatim จาก ดร.นิเวศน์)

> "เน้นลงทุนแบบ Value Investing คือดูคุณภาพเปรียบเทียบกับราคา ถ้ามันคุ้มค่าเราก็ซื้อ"
> — ดร.นิเวศน์, Finnomena 2567

> "เลือกหุ้นที่ปัจจุบันจ่ายปันผลตอบแทนอย่างน้อย 5% ต่อปีขึ้นไป"
> "อีก 5 ปีข้างหน้า ปันผลที่จะได้รับนั้น ก็ยังไม่น้อยกว่า 5%"
> — ดร.นิเวศน์, สูตรหุ้นรอด 5-5-5-5, Share2Trade 27 พ.ค. 2568

> "นักลงทุนที่ดีก็คือจะต้องผ่านวิกฤติให้ได้ทุกครั้ง"
> — ดร.นิเวศน์, 30 ปีในตลาดหุ้น, Finnomena 14 ก.พ. 2560

> "ใครไม่เห็นแต่ผมเห็นก็พอ"
> — ดร.นิเวศน์ พูดถึง QH, อ้างใน Investerest

แก่นความคิด: ซื้อธุรกิจ (ไม่ใช่กระดาษ) + ปันผลคือคำตอบสุดท้าย + ถือยาว 5 ปี+ + Safety จาก PE/PBV ต่ำ + มองข้อเสียก่อนข้อดี + Hidden Value (asset stake ที่ตลาดไม่เห็น) + เลือกธุรกิจที่คนใช้ในชีวิตประจำวัน

## สิ่งที่ต้องสร้าง — รายงาน Markdown 4 sections

### 1. Top Picks (3-5 ตัวแรกจาก top_candidates)
วิเคราะห์แต่ละตัว 6 ด้าน Niwes-style + สรุป (น่าสะสม/ถือต่อ/ระวัง):

1. **Dividend Sustainability** — ปันผล ≥5%? streak กี่ปี? payout ratio ยั่งยืนไหม? จ่ายจาก cash จริงไม่ใช่หนี้?
2. **Hidden Value** — มี asset/stake ที่ตลาดไม่ได้คิดเข้าราคาไหม? (เช่น QH ถือ HMPRO, INTUCH ถือ ADVANC)
3. **Business Quality** — ขาดไม่ได้ของผู้บริโภค? อยู่ในชีวิตประจำวัน? ผ่านวิกฤติมาหลายรอบ?
4. **Valuation Discipline** — P/E ≤15 (bonus ≤8)? P/BV ≤1.5 (bonus ≤1.0)? เทียบ historical ของตัวเองถูก/แพง?
5. **DCA Suitability** — เหมาะสะสม 10-20 ปีไหม? (⭐⭐⭐ = ใช่เต็มที่ / ⭐⭐ = ใช่แต่มีเงื่อนไข / ⭐ = ไม่แนะนำ)
6. **Macro Risk** — sector concentration? structural Thai risk (เศรษฐกิจซบ ดอกเบี้ย ค่าเงิน)?

### 2. Watchlist Update (ตัวใน watchlist ของ user — ถ้า watchlist ว่าง = skip section)
แต่ละตัว: status (ผ่าน/หลุดรอบนี้) + เหตุผล · ถ้าผ่าน score เปลี่ยนยังไง · recommend: ถือต่อ / พิจารณาออก

### 3. New In Batch (ตัวที่ new_in_batch)
สั้นๆ ตัวละ 2-3 บรรทัด — ธุรกิจอะไร + จุดเด่น Niwes (yield/streak/PE) + ⭐ DCA rating

### 4. Watch Out (ตัวที่ signal น่ากังวล — เช่น DIVIDEND_TRAP, DATA_WARNING)
ตัวไหนระวัง + เหตุผลจากข้อมูลจริง

## กฎ
- เขียนภาษาไทย อ่านง่าย
- ใช้ตัวเลขจริงจากข้อมูลที่ให้ ห้ามแต่ง
- ถ้าข้อมูลไม่พอ บอกตรงๆ — ดร.นิเวศน์ ไม่กลัวบอกว่าไม่รู้
- ห้ามแนะนำซื้อขาย ให้วิเคราะห์ข้อมูลเท่านั้น
- ถ้ามี DATA_WARNING ต้องระบุชัดเจน
- เน้นดู TREND หลายปี — earnings กระโดด 100%+ ตรวจว่าเป็น base effect หรือ growth จริง
- มองข้อเสียก่อนข้อดี (Downside before Upside) — ระวังกับดัก confirmation bias
- ถ้า section ไหนไม่มีข้อมูล (เช่น watchlist ว่าง) = ใส่ "— ยังไม่มีหุ้นใน watchlist · เพิ่มจากหน้าหุ้น" แล้วข้าม
- ถ้าไม่มีตัวผ่าน Niwes filter ใน Top Picks = บอกตรงๆ ว่า "รอบนี้ไม่มีตัวผ่านเกณฑ์ 5-5-5-5" + อาจมี near-miss ให้ดูจาก data
"""


def build_user_prompt(
    date: str,
    scan_num: int,
    top_candidates: list,
    watchlist_current: list,
    new_in_batch: list,
    notes: dict,
) -> str:
    top_section = "\n\n".join(
        build_stock_section(c, notes.get(c["symbol"], "")) for c in top_candidates
    ) or "— ไม่มีตัวผ่านเกณฑ์รอบนี้"

    if watchlist_current:
        wl_parts = []
        for s in watchlist_current:
            note = notes.get(s["symbol"], "")
            if s.get("_status") == "PASSED":
                wl_parts.append(f"[PASSED]\n{build_stock_section(s, note)}")
            else:
                wl_parts.append(f"[FAILED]\n{build_filtered_section(s, note)}")
        watchlist_section = "\n\n".join(wl_parts)
    else:
        watchlist_section = "— ยังไม่มีหุ้นใน watchlist · เพิ่มจากหน้าหุ้น"

    new_section = "\n\n".join(
        build_stock_section(c, notes.get(c["symbol"], "")) for c in new_in_batch
    ) or "— ไม่มีตัวใหม่ในรอบนี้"

    return f"""วันที่วิเคราะห์: {date}
Scan #{scan_num}

## Top Candidates (เรียงตาม score, {len(top_candidates)} ตัว)
{top_section}

## Watchlist ของผู้ใช้ ({len(watchlist_current)} ตัว)
{watchlist_section}

## New In Batch ({len(new_in_batch)} ตัวที่เพิ่งผ่านเกณฑ์ครั้งแรก)
{new_section}
"""


def extract_summary(raw_text: str, top_candidates: list, new_in_batch: list) -> str:
    """สรุป 1 บรรทัด: symbols เด่น 3 ตัวแรก + จำนวนใหม่"""
    top_syms = [c["symbol"].replace(".BK", "") for c in top_candidates[:3]]
    top_str = ", ".join(top_syms) if top_syms else "ไม่มีตัวเด่น"
    new_count = len(new_in_batch)
    if new_count > 0:
        return f"{top_str} เด่น · +{new_count} ใหม่"
    return f"{top_str} เด่น"


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


def run_claude(system_prompt: str, user_prompt: str) -> str:
    print("Max Mahon v4 scanning with Claude (Opus 4.7 + prompt caching)...")

    try:
        response = _client.messages.create(
            model="claude-opus-4-7",
            max_tokens=16000,
            system=[{
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral"},
            }],
            messages=[{"role": "user", "content": user_prompt}],
            timeout=900.0,
        )
    except Exception as e:
        print(f"Anthropic SDK error: {e}")
        sys.exit(1)

    if not response.content or response.content[0].type != "text":
        print(f"Unexpected response shape: stop_reason={response.stop_reason}")
        sys.exit(1)

    return response.content[0].text.strip()


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

    top_candidates, watchlist_current, new_in_batch = classify_stocks(
        screener_data, watchlist, screener_path
    )

    print(
        f"Classified: top={len(top_candidates)} watchlist={len(watchlist_current)} new={len(new_in_batch)}"
    )

    history = load_history()
    scan_num = next_scan_num(history)
    today = datetime.now().strftime("%Y-%m-%d")
    scan_date = screener_data.get("date", today)

    system_prompt = build_system_prompt()
    user_prompt = build_user_prompt(
        scan_date, scan_num, top_candidates, watchlist_current, new_in_batch, notes
    )

    raw_text = run_claude(system_prompt, user_prompt)

    header = f"""---
agent: Max Mahon v4
date: {today}
type: scan
scan_num: {scan_num}
---

"""
    report_path = REPORTS_DIR / f"scan_{today}.md"
    report_path.write_text(header + raw_text, encoding="utf-8")
    print(f"Report saved -> {report_path}")

    summary = extract_summary(raw_text, top_candidates, new_in_batch)
    entry = {
        "num": scan_num,
        "date": datetime.now().isoformat(timespec="seconds"),
        "counts": {
            "scanned": screener_data.get("total_scanned", 0),
            "passed": screener_data.get("passed_filter", 0),
            "new": len(new_in_batch),
            "filtered": screener_data.get("filtered_out", 0),
        },
        "summary": summary,
        "report": report_path.name,
    }
    history["scans"].append(entry)
    HISTORY_FILE.write_text(
        json.dumps(history, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"History updated -> {HISTORY_FILE} (scan #{scan_num})")


if __name__ == "__main__":
    main()
