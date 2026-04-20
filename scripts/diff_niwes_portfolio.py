"""
diff_niwes_portfolio.py — Compare news headlines/snippets against baseline
Niwes portfolio (11-current-portfolio.md) and detect implied changes.

Uses Anthropic SDK (claude-haiku-4-5 — fast + cheap) with prompt caching
on the baseline portfolio (the baseline is static; caching saves tokens
on every subsequent news batch).

Output per news item (if anything implied): {
  change_type: 'add_position' | 'reduce' | 'exit' | 'thesis_change' | 'view_change' | 'none',
  symbol: 'XXX',
  evidence: <url>,
  confidence: 0..100,
  reasoning: '<short why>'
}

Findings are appended to data/niwes_diff_history.json for trend analysis.
High-confidence findings (confidence >= 70) are written to
data/niwes_diff_latest.json for the alert script to pick up.

Usage:
  py scripts/diff_niwes_portfolio.py                 # use latest niwes_news_*.json
  py scripts/diff_niwes_portfolio.py --news <path>   # specific news JSON
  py scripts/diff_niwes_portfolio.py --mock          # inject 1 mock news item
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

# Local imports
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _niwes_cache import append_diff_history  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)
DIFF_HISTORY = DATA_DIR / "niwes_diff_history.json"
DIFF_LATEST = DATA_DIR / "niwes_diff_latest.json"
BASELINE = ROOT / "docs" / "niwes" / "11-current-portfolio.md"

MODEL = "claude-haiku-4-5-20251001"
MAX_TOKENS = 2000
CONFIDENCE_TRIGGER = 70

load_dotenv(Path("C:/WORKSPACE/.env"))
_API_KEY = os.getenv("MAX_ANTHROPIC_API_KEY")


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------


def load_latest_news() -> dict[str, Any]:
    """Pick the most recent niwes_news_*.json."""
    files = sorted(DATA_DIR.glob("niwes_news_*.json"), reverse=True)
    if not files:
        print("[error] no niwes_news_*.json found — run monitor_niwes_news.py first")
        sys.exit(1)
    return json.loads(files[0].read_text(encoding="utf-8"))


def build_news_section(items: list[dict[str, Any]]) -> str:
    lines = []
    for i, it in enumerate(items, 1):
        lines.append(
            f"[{i}] TITLE: {it.get('title','')}\n"
            f"    URL: {it.get('url','')}\n"
            f"    DATE: {it.get('date','')}\n"
            f"    SNIPPET: {it.get('snippet','')[:300]}\n"
            f"    SOURCE: {it.get('source','')}"
        )
    return "\n\n".join(lines)


SYSTEM_PROMPT_TEMPLATE = """You are an analyst monitoring ดร.นิเวศน์ เหมวชิรวรากร (Thai dividend-VI investor).

Your job: given news headlines + snippets, detect if any imply a change to
ดร.นิเวศน์'s published portfolio or investment thesis.

=== BASELINE PORTFOLIO (as of Dec 2025) ===
{baseline}

=== CHANGE TYPES ===
- add_position  : new stock entering his portfolio or being accumulated
- reduce        : partial reduction of existing position
- exit          : full exit of position in baseline
- thesis_change : he changed his view on existing holding (e.g., "I'm worried about X")
- view_change   : macro / sector / allocation view change (e.g., shifted US 30% -> 40%)
- none          : article mentions him but no portfolio implication

=== RULES ===
- Only flag changes backed by EXPLICIT evidence in title or snippet.
- If title is generic ("5 เซียนหุ้นแนะนำ") without his specific quote -> "none".
- If news is older than baseline (Dec 2025) -> "none" (it's already reflected).
- Symbol must be from baseline (CPALL, TCAP, QH, BCP, MC, FPT, MWG, ACV, VRE, REE) OR a new one he's adding.
- Confidence 0-100: how sure are you this news implies that change?
  - 90+  = explicit quote "I sold X" / "I bought Y"
  - 70-89 = strong implication, not direct quote
  - 40-69 = possible but speculative
  - <40  = mostly rumor/ambiguous

Output STRICT JSON, nothing else. Schema:
{{
  "findings": [
    {{
      "news_index": <int>,
      "change_type": "add_position"|"reduce"|"exit"|"thesis_change"|"view_change"|"none",
      "symbol": "<SYMBOL or empty for view_change>",
      "evidence": "<URL from news item>",
      "confidence": <0-100 int>,
      "reasoning": "<one sentence why>"
    }}
  ]
}}"""


def analyze_with_claude(news_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not _API_KEY:
        print("[error] MAX_ANTHROPIC_API_KEY not set in C:/WORKSPACE/.env")
        print("[error] cannot call Claude — exiting")
        sys.exit(2)

    import anthropic

    client = anthropic.Anthropic(api_key=_API_KEY)

    baseline_text = BASELINE.read_text(encoding="utf-8")
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(baseline=baseline_text)
    user_prompt = (
        f"Today: {datetime.now().strftime('%Y-%m-%d')}\n\n"
        f"Analyze these {len(news_items)} news items:\n\n"
        f"{build_news_section(news_items)}\n\n"
        "Return the JSON findings."
    )

    print(f"[info] calling {MODEL} with {len(news_items)} news items ...")
    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=[
                {
                    "type": "text",
                    "text": system_prompt,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": user_prompt}],
        )
    except Exception as e:  # noqa: BLE001
        print(f"[error] Claude call failed: {e}")
        sys.exit(3)

    text = "".join(
        block.text for block in response.content if getattr(block, "type", "") == "text"
    ).strip()

    usage = response.usage
    cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
    cache_write = getattr(usage, "cache_creation_input_tokens", 0) or 0
    print(
        f"[info] tokens: in={usage.input_tokens} out={usage.output_tokens} "
        f"cache_read={cache_read} cache_write={cache_write}"
    )

    # Strip markdown fencing if model wraps JSON
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.lstrip().startswith("json"):
            text = text.lstrip()[4:].lstrip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        print(f"[error] failed to parse JSON from Claude: {e}")
        print(f"[debug] raw: {text[:500]}")
        sys.exit(4)

    findings = parsed.get("findings", [])
    # Enrich each finding with the actual news item for downstream use
    for f in findings:
        idx = f.get("news_index")
        if isinstance(idx, int) and 1 <= idx <= len(news_items):
            src = news_items[idx - 1]
            f.setdefault("evidence", src.get("url", ""))
            f["_news_title"] = src.get("title", "")
            f["_news_source"] = src.get("source", "")
    return findings


# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--news", type=Path, help="path to niwes_news_*.json")
    ap.add_argument("--mock", action="store_true", help="inject 1 mock news item")
    args = ap.parse_args()

    if args.mock:
        news_items = [
            {
                "url": "https://example.com/mock-niwes-exit-qh",
                "title": "ดร.นิเวศน์ ขาย QH ทั้งหมด หันซื้อหุ้นเวียดนามเพิ่ม",
                "date": "2026-04-20",
                "snippet": (
                    "ดร.นิเวศน์ เหมวชิรวรากร เปิดเผยว่าได้ขายหุ้น QH "
                    "ออกจากพอร์ตทั้งหมดเมื่อสัปดาห์ที่แล้ว ด้วยเหตุผลว่าอสังหาไทยเผชิญปัจจัยลบ"
                ),
                "source": "mock",
            }
        ]
    elif args.news:
        news_items = json.loads(args.news.read_text(encoding="utf-8")).get("all_items", [])
    else:
        news_items = load_latest_news().get("all_items", [])

    if not news_items:
        print("[info] no news items to analyze")
        DIFF_LATEST.write_text(
            json.dumps(
                {"date": datetime.now().strftime("%Y-%m-%d"), "findings": []},
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        return 0

    findings = analyze_with_claude(news_items)
    high_conf = [
        f for f in findings
        if f.get("confidence", 0) >= CONFIDENCE_TRIGGER and f.get("change_type") != "none"
    ]

    print()
    print(f"[done] total findings: {len(findings)}")
    print(f"[done] high-confidence (>={CONFIDENCE_TRIGGER}): {len(high_conf)}")
    for f in high_conf:
        print(
            f"  - [{f.get('confidence')}%] {f.get('change_type')} "
            f"{f.get('symbol')}: {f.get('reasoning','')[:80]}"
        )

    today = datetime.now().strftime("%Y-%m-%d")

    append_diff_history(
        DIFF_HISTORY,
        {
            "date": today,
            "news_count": len(news_items),
            "findings": findings,
        },
    )

    DIFF_LATEST.write_text(
        json.dumps(
            {"date": today, "findings": high_conf},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"[done] history: {DIFF_HISTORY}")
    print(f"[done] latest (for alert): {DIFF_LATEST}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
