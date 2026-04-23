"""Daily price refresh for watchlist + PASS candidates.

Scheduled 19:00 Asia/Bangkok (post SET close 17:00 + 2h buffer).

Collects symbols from user_data.json (watchlist) + latest screener_*.json
(candidates), batches price fetches through yahooquery (20 per chunk, 0.2s
sleep between chunks), and writes ``data/price_cache/{symbol}.json`` with
``{symbol, price, fetched_at}``. Errors on any single batch are logged and
do not stop the overall refresh.
"""
import json
import logging
import re
import time
from datetime import datetime
from pathlib import Path

from yahooquery import Ticker

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
USER_DATA = ROOT / "user_data.json"
CACHE_DIR = DATA_DIR / "price_cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

logger = logging.getLogger(__name__)

_SCREENER_RE = re.compile(r"^screener_\d{4}-\d{2}-\d{2}\.json$")


def _load_symbols() -> list[str]:
    """Collect deduped, sorted symbol list from watchlist + latest screener."""
    symbols: set[str] = set()

    if USER_DATA.exists():
        try:
            user = json.loads(USER_DATA.read_text(encoding="utf-8"))
            for sym in user.get("watchlist", []) or []:
                if sym:
                    symbols.add(sym)
        except (OSError, json.JSONDecodeError) as e:
            logger.warning(f"could not read user_data.json: {e}")

    # Latest screener candidate list (filter lexical sort to canonical dated files)
    screeners = [p for p in DATA_DIR.glob("screener_*.json") if _SCREENER_RE.match(p.name)]
    screeners.sort(reverse=True)
    if screeners:
        try:
            scr = json.loads(screeners[0].read_text(encoding="utf-8"))
            for c in scr.get("candidates", []) or []:
                sym = c.get("symbol")
                if sym:
                    symbols.add(sym)
        except (OSError, json.JSONDecodeError) as e:
            logger.warning(f"could not read {screeners[0].name}: {e}")

    return sorted(symbols)


def refresh_prices() -> dict:
    """Fetch current prices for watchlist + PASS candidates and cache to disk.

    Returns a dict {symbol: price} for symbols successfully fetched.
    """
    symbols = _load_symbols()
    logger.info(f"refreshing {len(symbols)} symbols")
    fetched: dict[str, float] = {}

    for i in range(0, len(symbols), 20):
        chunk = symbols[i:i + 20]
        try:
            tk = Ticker(chunk)
            prices = tk.price
            if not isinstance(prices, dict):
                logger.warning(f"batch {i} returned non-dict price payload: {type(prices).__name__}")
                time.sleep(0.2)
                continue
            for sym in chunk:
                info = prices.get(sym)
                if not isinstance(info, dict):
                    continue
                price = info.get("regularMarketPrice")
                if price is None:
                    continue
                payload = {
                    "symbol": sym,
                    "price": price,
                    "fetched_at": datetime.now().isoformat(timespec="seconds"),
                }
                (CACHE_DIR / f"{sym}.json").write_text(
                    json.dumps(payload, indent=2, ensure_ascii=False),
                    encoding="utf-8",
                )
                fetched[sym] = price
        except Exception as e:
            logger.warning(f"batch {i} failed: {e}")
        time.sleep(0.2)

    logger.info(f"refreshed {len(fetched)}/{len(symbols)} prices")
    return fetched


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    result = refresh_prices()
    print(f"OK — {len(result)} prices refreshed")
