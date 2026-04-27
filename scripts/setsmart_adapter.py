"""SETSMART API adapter — primary source of truth for MaxMahon aggregate data.

API key from .env: SETSMART_API_KEY
Header: api-key
Method: GET
Base URL: https://www.setsmart.com/api/listed-company-api/

4 endpoints:
  - eod-price-by-symbol
  - eod-price-by-security-type
  - financial-data-and-ratio-by-symbol
  - financial-data-and-ratio
"""

import json
import logging
import os
import time
from pathlib import Path
from typing import Any

import requests

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = ROOT / "data" / "setsmart_cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

BASE_URL = "https://www.setsmart.com/api/listed-company-api"


def _load_api_key() -> str:
    p = ROOT.parent.parent
    env_file = p / ".env"
    if not env_file.exists():
        raise RuntimeError(f"SETSMART_API_KEY: .env not found at {env_file}")
    for line in env_file.read_text(encoding="utf-8").splitlines():
        if line.startswith("SETSMART_API_KEY="):
            key = line.split("=", 1)[1].strip().strip("'\"")
            if key:
                return key
    raise RuntimeError("SETSMART_API_KEY not found in .env")


_API_KEY = None


def _api_key() -> str:
    global _API_KEY
    if _API_KEY is None:
        _API_KEY = _load_api_key()
    return _API_KEY


def _request(path: str, params: dict, timeout: int = 30, retries: int = 3) -> list[dict]:
    url = f"{BASE_URL}/{path}"
    headers = {"api-key": _api_key()}
    for attempt in range(retries):
        try:
            r = requests.get(url, params=params, headers=headers, timeout=timeout)
            if r.status_code == 200:
                return r.json()
            if r.status_code in (429, 503) and attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
            r.raise_for_status()
        except requests.exceptions.Timeout:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
            raise
    return []


def fetch_eod_by_symbol(symbol: str, start_date: str, end_date: str | None = None,
                         adjusted: str = "Y") -> list[dict]:
    params = {"symbol": symbol, "startDate": start_date, "adjustedPriceFlag": adjusted}
    if end_date:
        params["endDate"] = end_date
    return _request("eod-price-by-symbol", params)


def fetch_eod_all(date: str, security_type: str = "CS", adjusted: str = "Y") -> list[dict]:
    return _request("eod-price-by-security-type",
                    {"securityType": security_type, "date": date, "adjustedPriceFlag": adjusted})


def fetch_financial_by_symbol(symbol: str, start_year: str, start_quarter: str,
                               end_year: str | None = None, end_quarter: str | None = None) -> list[dict]:
    params = {"symbol": symbol, "startYear": start_year, "startQuarter": start_quarter}
    if end_year and end_quarter:
        params["endYear"] = end_year
        params["endQuarter"] = end_quarter
    return _request("financial-data-and-ratio-by-symbol", params)


def fetch_financial_all(year: str, quarter: str, account_period: str = "C") -> list[dict]:
    return _request("financial-data-and-ratio",
                    {"accountPeriod": account_period, "year": year, "quarter": quarter})


def cached_eod_bulk(date: str, security_type: str = "CS") -> list[dict]:
    cache_file = CACHE_DIR / f"eod_{date}.json"
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))
    data = fetch_eod_all(date, security_type=security_type)
    cache_file.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def cached_financial_bulk(year: str, quarter: str, account_period: str = "C") -> list[dict]:
    cache_file = CACHE_DIR / f"financial_{year}_q{quarter}.json"
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))
    data = fetch_financial_all(year, quarter, account_period=account_period)
    cache_file.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def cached_eod_history(symbol: str, start_date: str, end_date: str) -> list[dict]:
    cache_file = CACHE_DIR / f"eod_by_symbol_{symbol}_{start_date}_{end_date}.json"
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))
    data = fetch_eod_by_symbol(symbol, start_date, end_date)
    cache_file.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


if __name__ == "__main__":
    from datetime import datetime, timedelta

    print("[smoke 1/5] fetch_eod_by_symbol BBL 2024-01-01..2024-01-15")
    bbl = fetch_eod_by_symbol("BBL", "2024-01-01", "2024-01-15")
    print(f"  rows: {len(bbl)}, first: {bbl[0] if bbl else 'EMPTY'}")
    assert len(bbl) > 0, "BBL EOD fetch returned empty"

    print("[smoke 2/5] fetch_eod_all on most recent trading day")
    test_date = None
    eod_all = []
    for delta in range(1, 8):
        d = (datetime.now() - timedelta(days=delta)).strftime("%Y-%m-%d")
        eod_all = fetch_eod_all(d)
        if len(eod_all) > 0:
            test_date = d
            break
    types_sample = set(x.get('securityType') for x in eod_all[:50]) if eod_all else set()
    print(f"  date: {test_date}, rows: {len(eod_all)}, types: {types_sample}")
    assert test_date is not None, "fetch_eod_all returned empty for last 7 days"

    print("[smoke 3/5] fetch_financial_all 2023 Q4")
    fin = fetch_financial_all("2023", "4")
    print(f"  rows: {len(fin)}, first: {fin[0].get('symbol') if fin else 'EMPTY'}")
    assert len(fin) > 0, "fetch_financial_all returned empty"

    print("[smoke 4/5] discover package history coverage (BBL)")
    # SETSMART API returns HTTP 500 (not empty list) for out-of-coverage date ranges,
    # so we treat 500 as "not covered" and continue walking forward.
    def _safe_eod(sym, start, end):
        try:
            return fetch_eod_by_symbol(sym, start, end)
        except requests.exceptions.HTTPError as e:
            if e.response is not None and e.response.status_code == 500:
                return []
            raise

    early = _safe_eod("BBL", "2010-01-01", "2010-12-31")
    if len(early) > 0:
        print(f"  BBL 2010 rows: {len(early)} — package COVERS 2010")
    else:
        for try_year in (2015, 2018, 2020, 2022):
            r = _safe_eod("BBL", f"{try_year}-01-01", f"{try_year}-01-31")
            if len(r) > 0:
                print(f"  BBL {try_year}: {len(r)} rows — earliest covered >= {try_year}")
                break
        else:
            print("  WARN: no BBL data found 2010-2022 — investigate")

    print("[smoke 5/5] cache layer test")
    d = cached_eod_bulk(test_date)
    print(f"  cache rows: {len(d)}")
    cache_file = CACHE_DIR / f"eod_{test_date}.json"
    assert cache_file.exists(), f"cache file not created: {cache_file}"

    print()
    print("ALL SMOKE TESTS PASSED")
