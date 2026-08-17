#!/usr/bin/env python3
"""Frontend export that reuses the fast scanner's 5Y price cache.

Falls back to the existing Yahoo batch downloader if the cache is unavailable,
so this remains safe for manual/recovery runs made with the legacy scanner.
"""
from __future__ import annotations

import json
import pickle
import time
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

    # Rare fallback: if an analyzed stock used the legacy per-ticker path because
    # Yahoo omitted it from the initial batch, fetch ONLY those missing histories
    # and merge them into the already-built shards. Never destroy the cache-backed
    # shard set by invoking the original full rebuild on only the missing subset.
    if missing:
        print(f"Fetching only {len(missing):,} missing chart histories from Yahoo")
        still_missing: list[str] = []
        for start in range(0, len(missing), 20):
            chunk = missing[start:start + 20]
            batch = base.download_batch(chunk, spy_close, threads=True)
            for ticker in chunk:
                bars = batch.get(ticker)
                if not bars:
                    still_missing.append(ticker)
                    continue
                shard = base.shard_for(ticker)
                shards[shard][ticker] = bars
                mapping[ticker] = shard
            time.sleep(0.15)
        if still_missing:
            print(f"Charts unavailable after targeted fallback: {len(still_missing):,}")

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
    return mapping


if not hasattr(base, "_ORIGINAL_BUILD_FIVE_YEAR_CHART_SHARDS"):
    base._ORIGINAL_BUILD_FIVE_YEAR_CHART_SHARDS = base.build_five_year_chart_shards
base.build_five_year_chart_shards = build_from_scan_cache

if __name__ == "__main__":
    base.main()
