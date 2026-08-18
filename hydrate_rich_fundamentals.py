#!/usr/bin/env python3
"""Hydrate fundamental cache for the entire analyzed post-market universe.

The fast screening engine intentionally fetches fundamentals only for Stage 1/2
because those values participate in its buy-side scoring.  The terminal, however,
benefits from having the same evidence available for Stage 3/4 and for custom
research filters.  This post-market pass fills that gap without changing LEGACY
scoring rules.

Policy:
- inspect every ticker present in batch_progress.pkl analyses;
- reuse a cache file while it is <= MAX_AGE_DAYS old;
- otherwise fetch the repository's existing quarterly fundamental dataset;
- never delete a good old cache if a refresh fails;
- rate-limit fresh requests conservatively.

MAX_AGE_DAYS defaults to 7 because this job runs after market and runtime is less
important than evidence freshness. Override with RICH_FUNDAMENTALS_MAX_AGE_DAYS.
"""
from __future__ import annotations

import json
import os
import pickle
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from src.data.fundamentals_fetcher import fetch_quarterly_financials
from src.data.git_storage_fetcher import GitStorageFetcher

ROOT = Path(__file__).resolve().parent
PROGRESS = ROOT / "data" / "batch_results" / "batch_progress.pkl"
FUND_DIR = ROOT / "data" / "fundamentals_cache"
MAX_AGE_DAYS = max(1, int(os.getenv("RICH_FUNDAMENTALS_MAX_AGE_DAYS", "7")))
REQUEST_DELAY = max(0.0, float(os.getenv("RICH_FUNDAMENTALS_REQUEST_DELAY", "0.35")))


def cache_age_days(path: Path) -> int | None:
    if not path.exists():
        return None
    try:
        wrapper = json.loads(path.read_text(encoding="utf-8"))
        stamp = wrapper.get("fetched_at")
        if not stamp:
            return None
        return max(0, (datetime.now() - datetime.fromisoformat(stamp)).days)
    except Exception:
        return None


def save_cache(fetcher: GitStorageFetcher, ticker: str, data: dict[str, Any]) -> None:
    path = FUND_DIR / f"{ticker}_fundamentals.json"
    payload = {
        "data": fetcher._clean_for_json(data),
        "fetched_at": datetime.now().isoformat(),
    }
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    tmp.replace(path)
    fetcher._update_metadata(ticker)


def main() -> None:
    if not PROGRESS.exists():
        raise SystemExit(f"Missing completed scan progress: {PROGRESS}")

    with PROGRESS.open("rb") as fh:
        progress = pickle.load(fh)
    analyses = progress.get("results") or progress.get("analyses") or []
    tickers = sorted({str(a.get("ticker", "")).upper() for a in analyses if a.get("ticker")})
    if not tickers:
        raise SystemExit("No analyzed tickers found in batch_progress.pkl")

    FUND_DIR.mkdir(parents=True, exist_ok=True)
    fetcher = GitStorageFetcher(str(FUND_DIR))
    reused = refreshed = missing = failed = 0

    print(
        f"Rich fundamentals hydration: {len(tickers):,} analyzed tickers; "
        f"max cache age={MAX_AGE_DAYS}d"
    )

    for idx, ticker in enumerate(tickers, 1):
        path = FUND_DIR / f"{ticker}_fundamentals.json"
        age = cache_age_days(path)
        if age is not None and age <= MAX_AGE_DAYS:
            reused += 1
        else:
            if path.exists():
                refreshed += 1
            else:
                missing += 1
            try:
                data = fetch_quarterly_financials(ticker)
                if data:
                    save_cache(fetcher, ticker, data)
                else:
                    failed += 1
                    print(f"  {ticker}: no fundamental data returned; preserving old cache if present")
            except Exception as exc:
                failed += 1
                print(f"  {ticker}: refresh failed ({type(exc).__name__}: {exc}); preserving old cache")
            time.sleep(REQUEST_DELAY)

        if idx % 250 == 0 or idx == len(tickers):
            print(
                f"  {idx:,}/{len(tickers):,}: reused={reused:,}, "
                f"refresh_candidates={refreshed:,}, missing_candidates={missing:,}, failures={failed:,}"
            )

    available = sum(1 for ticker in tickers if (FUND_DIR / f"{ticker}_fundamentals.json").exists())
    print(
        f"Rich fundamentals ready: {available:,}/{len(tickers):,} cached; "
        f"reused={reused:,}; refreshed candidates={refreshed:,}; "
        f"new candidates={missing:,}; refresh failures={failed:,}"
    )


if __name__ == "__main__":
    main()
