"""Max Mahon — fetch Thai stock fundamental data from yfinance."""

import json
import sys
from datetime import datetime
from pathlib import Path

import yfinance as yf

ROOT = Path(__file__).resolve().parent.parent
WATCHLIST = ROOT / "watchlist.json"
DATA_DIR = ROOT / "data"


def fetch_stock(symbol: str) -> dict:
    """Fetch fundamental data for a single stock."""
    tk = yf.Ticker(symbol)
    info = tk.info or {}

    dividends = tk.dividends
    recent_divs = dividends.tail(8).tolist() if len(dividends) > 0 else []

    return {
        "symbol": symbol,
        "name": info.get("shortName", symbol),
        "sector": info.get("sector", "N/A"),
        "industry": info.get("industry", "N/A"),
        "currency": info.get("currency", "THB"),
        "price": info.get("currentPrice") or info.get("regularMarketPrice"),
        "market_cap": info.get("marketCap"),
        "pe_ratio": info.get("trailingPE"),
        "forward_pe": info.get("forwardPE"),
        "pb_ratio": info.get("priceToBook"),
        "dividend_yield": info.get("dividendYield"),
        "dividend_rate": info.get("dividendRate"),
        "payout_ratio": info.get("payoutRatio"),
        "five_year_avg_yield": info.get("fiveYearAvgDividendYield"),
        "eps_trailing": info.get("trailingEps"),
        "eps_forward": info.get("forwardEps"),
        "revenue": info.get("totalRevenue"),
        "revenue_growth": info.get("revenueGrowth"),
        "earnings_growth": info.get("earningsGrowth"),
        "profit_margin": info.get("profitMargins"),
        "roe": info.get("returnOnEquity"),
        "debt_to_equity": info.get("debtToEquity"),
        "free_cashflow": info.get("freeCashflow"),
        "recent_dividends": recent_divs,
        "52w_high": info.get("fiftyTwoWeekHigh"),
        "52w_low": info.get("fiftyTwoWeekLow"),
        "50d_avg": info.get("fiftyDayAverage"),
        "200d_avg": info.get("twoHundredDayAverage"),
        "fetched_at": datetime.now().isoformat(),
    }


def main():
    watchlist = json.loads(WATCHLIST.read_text(encoding="utf-8"))
    symbols = [s["symbol"] for s in watchlist["stocks"]]

    print(f"Max Mahon fetching {len(symbols)} stocks...")
    results = []
    for sym in symbols:
        try:
            print(f"  → {sym}", end=" ")
            data = fetch_stock(sym)
            results.append(data)
            price = data.get("price") or "N/A"
            dy = data.get("dividend_yield")
            dy_str = f"{dy:.1f}%" if dy else "N/A"
            print(f"฿{price} yield={dy_str}")
        except Exception as e:
            print(f"ERROR: {e}")
            results.append({"symbol": sym, "error": str(e)})

    today = datetime.now().strftime("%Y-%m-%d")
    out_path = DATA_DIR / f"snapshot_{today}.json"
    out_path.write_text(
        json.dumps(
            {"date": today, "agent": "Max Mahon", "stocks": results},
            ensure_ascii=False,
            indent=2,
            default=str,
        ),
        encoding="utf-8",
    )
    print(f"\nSaved → {out_path}")
    return out_path


if __name__ == "__main__":
    main()
