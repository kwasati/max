"""Update SET universe using thaifin stock list."""
from thaifin import Stocks
from datetime import datetime
import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def update_universe():
    ss = Stocks()

    # Get all SET + mai stocks
    set_stocks = ss.filter_by_market("SET")
    mai_stocks = ss.filter_by_market("mai")

    # Combine, add .BK suffix for yfinance compatibility
    all_symbols = sorted(
        set([s + ".BK" for s in set_stocks] + [s + ".BK" for s in mai_stocks])
    )

    universe = {
        "source": "thaifin",
        "updated": datetime.now().strftime("%Y-%m-%d"),
        "total": len(all_symbols),
        "set_count": len(set_stocks),
        "mai_count": len(mai_stocks),
        "symbols": all_symbols,
    }

    out = DATA_DIR / "set_universe.json"
    out.write_text(json.dumps(universe, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Universe updated: {len(all_symbols)} symbols -> {out}")
    return out


if __name__ == "__main__":
    update_universe()
