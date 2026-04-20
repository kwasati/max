"""
monitor_niwes_news.py — Scrape news mentioning ดร.นิเวศน์ เหมวชิรวรากร

Sources (search by query "นิเวศน์ เหมวชิรวรากร"):
  1. kaohoon.com
  2. prachachat.net
  3. thestandard.co
  4. longtunman.com
  5. finnomena.com

Scope: title + URL + snippet + date + source only (no full article body — fair use).
Rate limit: 2s delay between requests.
Output: data/niwes_news_{YYYY-MM-DD}.json + updates data/niwes_news_seen.json dedup cache.

Usage:
  py scripts/monitor_niwes_news.py
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus

import requests
from bs4 import BeautifulSoup

# Local import — sibling module (script dir added to sys.path below).
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _niwes_cache import load_seen_urls, save_seen_urls  # noqa: E402

# -----------------------------------------------------------------------------
# Config
# -----------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)

SEEN_CACHE = DATA_DIR / "niwes_news_seen.json"
REQUEST_DELAY_SEC = 2.0
REQUEST_TIMEOUT = 15
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
HEADERS = {"User-Agent": USER_AGENT, "Accept-Language": "th,en;q=0.8"}

# Search query — Thai spelling of Dr.Niwes' full name
QUERY_TH = "นิเวศน์ เหมวชิรวรากร"

# -----------------------------------------------------------------------------
# Site scraper definitions
# -----------------------------------------------------------------------------
# Each site: name, search URL template, CSS selectors.
# TODO: verify selectors when site layout changes — flagged per block.


def _fetch(url: str) -> str | None:
    try:
        r = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
        if r.status_code == 200:
            return r.text
        print(f"  [warn] HTTP {r.status_code} on {url}", file=sys.stderr)
    except requests.RequestException as e:
        print(f"  [warn] request failed {url}: {e}", file=sys.stderr)
    return None


def _text(node) -> str:
    return node.get_text(" ", strip=True) if node else ""


def scrape_kaohoon(query: str) -> list[dict[str, Any]]:
    # TODO: verify selector — kaohoon search page layout
    url = f"https://www.kaohoon.com/?s={quote_plus(query)}"
    html = _fetch(url)
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    items: list[dict[str, Any]] = []
    for art in soup.select("article"):
        link = art.select_one("a[href]")
        if not link:
            continue
        href = link.get("href", "")
        if not href or "kaohoon.com" not in href:
            continue
        title = _text(art.select_one("h2, h3")) or _text(link)
        snippet = _text(art.select_one("p, .entry-summary, .excerpt"))
        date = _text(art.select_one("time")) or ""
        if title and href:
            items.append(
                {
                    "url": href,
                    "title": title,
                    "date": date,
                    "snippet": snippet[:500],
                    "source": "kaohoon.com",
                }
            )
    return items


def scrape_prachachat(query: str) -> list[dict[str, Any]]:
    # TODO: verify selector — prachachat search page layout
    url = f"https://www.prachachat.net/?s={quote_plus(query)}"
    html = _fetch(url)
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    items: list[dict[str, Any]] = []
    for art in soup.select("article, .post, .td_module_flex"):
        link = art.select_one("a[href]")
        if not link:
            continue
        href = link.get("href", "")
        if not href or "prachachat.net" not in href:
            continue
        title = _text(art.select_one("h2, h3, .entry-title")) or _text(link)
        snippet = _text(art.select_one("p, .td-excerpt, .entry-summary"))
        date = _text(art.select_one("time")) or ""
        if title and href:
            items.append(
                {
                    "url": href,
                    "title": title,
                    "date": date,
                    "snippet": snippet[:500],
                    "source": "prachachat.net",
                }
            )
    return items


def scrape_thestandard(query: str) -> list[dict[str, Any]]:
    # TODO: verify selector — thestandard search page layout
    url = f"https://thestandard.co/?s={quote_plus(query)}"
    html = _fetch(url)
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    items: list[dict[str, Any]] = []
    for art in soup.select("article, .post, .listing__item"):
        link = art.select_one("a[href]")
        if not link:
            continue
        href = link.get("href", "")
        if not href or "thestandard.co" not in href:
            continue
        title = _text(art.select_one("h2, h3, .listing__title")) or _text(link)
        snippet = _text(art.select_one("p, .listing__excerpt"))
        date = _text(art.select_one("time, .listing__date")) or ""
        if title and href:
            items.append(
                {
                    "url": href,
                    "title": title,
                    "date": date,
                    "snippet": snippet[:500],
                    "source": "thestandard.co",
                }
            )
    return items


def scrape_longtunman(query: str) -> list[dict[str, Any]]:
    # TODO: verify selector — longtunman search page layout
    url = f"https://www.longtunman.com/?s={quote_plus(query)}"
    html = _fetch(url)
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    items: list[dict[str, Any]] = []
    for art in soup.select("article, .post"):
        link = art.select_one("a[href]")
        if not link:
            continue
        href = link.get("href", "")
        if not href or "longtunman.com" not in href:
            continue
        title = _text(art.select_one("h2, h3, .entry-title")) or _text(link)
        snippet = _text(art.select_one("p, .entry-summary"))
        date = _text(art.select_one("time")) or ""
        if title and href:
            items.append(
                {
                    "url": href,
                    "title": title,
                    "date": date,
                    "snippet": snippet[:500],
                    "source": "longtunman.com",
                }
            )
    return items


def scrape_finnomena(query: str) -> list[dict[str, Any]]:
    # TODO: verify selector — finnomena search page layout
    url = f"https://www.finnomena.com/?s={quote_plus(query)}"
    html = _fetch(url)
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    items: list[dict[str, Any]] = []
    for art in soup.select("article, .post, .card"):
        link = art.select_one("a[href]")
        if not link:
            continue
        href = link.get("href", "")
        if not href or "finnomena.com" not in href:
            continue
        title = _text(art.select_one("h2, h3, .title")) or _text(link)
        snippet = _text(art.select_one("p, .excerpt"))
        date = _text(art.select_one("time")) or ""
        if title and href:
            items.append(
                {
                    "url": href,
                    "title": title,
                    "date": date,
                    "snippet": snippet[:500],
                    "source": "finnomena.com",
                }
            )
    return items


SCRAPERS = [
    ("kaohoon.com", scrape_kaohoon),
    ("prachachat.net", scrape_prachachat),
    ("thestandard.co", scrape_thestandard),
    ("longtunman.com", scrape_longtunman),
    ("finnomena.com", scrape_finnomena),
]


# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------


def main() -> int:
    seen = load_seen_urls(SEEN_CACHE)
    print(f"[info] seen cache: {len(seen)} URLs")

    all_items: list[dict[str, Any]] = []
    new_items: list[dict[str, Any]] = []

    for site_name, scraper in SCRAPERS:
        print(f"[scrape] {site_name} ...")
        try:
            items = scraper(QUERY_TH)
        except Exception as e:  # noqa: BLE001
            print(f"  [error] {site_name}: {e}", file=sys.stderr)
            items = []
        print(f"  found {len(items)} items")
        for it in items:
            all_items.append(it)
            if it["url"] not in seen:
                new_items.append(it)
                seen.add(it["url"])
        time.sleep(REQUEST_DELAY_SEC)

    today = datetime.now().strftime("%Y-%m-%d")
    out_path = DATA_DIR / f"niwes_news_{today}.json"
    out_path.write_text(
        json.dumps(
            {
                "query": QUERY_TH,
                "date": today,
                "total_found": len(all_items),
                "new_items_count": len(new_items),
                "all_items": all_items,
                "new_items": new_items,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    save_seen(seen)

    print()
    print(f"[done] total found: {len(all_items)}")
    print(f"[done] new items (not in cache): {len(new_items)}")
    print(f"[done] output: {out_path}")

    if len(all_items) < 10:
        print(
            f"[note] found < 10 items — sites may have blocked scraping "
            "or selectors need updating (see # TODO comments)",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
