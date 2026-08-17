#!/usr/bin/env python3
"""Frontend export that reuses the fast scanner's 5Y price cache.

Falls back to the existing Yahoo batch downloader if the cache is unavailable,
so this remains safe for manual/recovery runs made with the legacy scanner.
"""
from __future__ import annotations

import json
import pickle
from pathlib import Path

import pandas as pd

import export_frontend_data as base

PRICE_CACHE = Path("data/batch_results/price_history_5y.pkl")


def build_from_scan_cache(tickers: list[str]) -> dict[str, str]:
    if not PRICE_CACHE.exists():
        print("Reusable 5Y price cache not found; falling back to Yahoo chart hydration")
        return base._ORIGINAL_BUILD_FIVE_YEAR_CHART_SHARDS(tickers)

    try:
        with PRICE_CACHE.open("rb") as fh:
            price_history: dict[str, pd.DataFrame] = pickle.load(fh)
    except Exception as exc:
        print(f"Unable to load reusable 5Y price cache ({exc}); falling back to Yahoo")
        return base._ORIGINAL_BUILD_FIVE_YEAR_CHART_SHARDS(tickers)

    spy = price_history.get("SPY")
    if spy is None or spy.empty or "Close" not in spy:
        print("SPY missing from reusable cache; falling back to Yahoo chart hydration")
        return base._ORIGINAL_BUILD_FIVE_YEAR_CHART_SHARDS(tickers)

    base.CHART_DIR.mkdir(parents=True, exist_ok=True)
    for old in base.CHART_DIR.glob("*.json"):
        old.unlink()

    spy_close = spy["Close"].astype(float).dropna()
    shards: dict[str, dict[str, list[list]]] = {f"{i:03d}.json": {} for i in range(base.SHARD_COUNT)}
    mapping: dict[str, str] = {}
    missing: list[str] = []

    for ticker in tickers:
        frame = price_history.get(ticker)
        if frame is None or frame.empty:
            missing.append(ticker)
            continue
        bars = base.compact_bars(frame, spy_close)
        if not bars:
            missing.append(ticker)
            continue
        shard = base.shard_for(ticker)
        shards[shard][ticker] = bars
        mapping[ticker] = shard

    for name, payload in shards.items():
        if payload:
            (base.CHART_DIR / name).write_text(
                json.dumps(payload, separators=(",", ":"), ensure_ascii=False), encoding="utf-8"
            )

    size_mb = sum(p.stat().st_size for p in base.CHART_DIR.glob("*.json")) / 1024 / 1024
    print(
        f"Reused scan 5Y cache for {len(mapping):,}/{len(tickers):,} frontend charts "
        f"({size_mb:.1f} MB across {len([p for p in base.CHART_DIR.glob('*.json')])} shards)"
    )

    # A small number of legacy/fallback analyses may not exist in the fast cache.
    # Download only those missing symbols rather than re-fetching the whole universe.
    if missing:
        print(f"Fetching only {len(missing):,} missing chart histories from Yahoo")
        try:
            extra_mapping = base._ORIGINAL_BUILD_FIVE_YEAR_CHART_SHARDS(missing)
            # The original function recreates the chart directory, so if this rare
            # path is used it is safer to return its complete result. In normal fast
            # runs the cache should cover every analyzed ticker and this branch is not used.
            return extra_mapping
        except Exception as exc:
            print(f"Missing-chart fallback failed: {exc}")

    return mapping


if not hasattr(base, "_ORIGINAL_BUILD_FIVE_YEAR_CHART_SHARDS"):
    base._ORIGINAL_BUILD_FIVE_YEAR_CHART_SHARDS = base.build_five_year_chart_shards
base.build_five_year_chart_shards = build_from_scan_cache

if __name__ == "__main__":
    base.main()
