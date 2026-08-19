#!/usr/bin/env python3
"""Fail a build when the terminal payload and lazy chart shards are inconsistent."""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

SHARD_COUNT = 128
MIN_COVERAGE = 0.95


def shard_for(ticker: str) -> str:
    ticker = ticker.strip().upper()
    value = sum((idx + 1) * ord(ch) for idx, ch in enumerate(ticker)) % SHARD_COUNT
    return f"{value:03d}.json"


def read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise SystemExit(f"Invalid JSON {path}: {exc}") from exc


def main() -> None:
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("frontend/public")
    data_dir = root / "data"
    payload_path = data_dir / "core.json"
    if not payload_path.exists():
        payload_path = data_dir / "latest.json"
    if not payload_path.exists():
        raise SystemExit(f"Missing frontend payload under {data_dir}")

    payload = read_json(payload_path)
    universe = payload.get("universe") or []
    tickers = [str(row.get("ticker", "")).strip().upper() for row in universe if row.get("ticker")]
    if not tickers:
        raise SystemExit(f"No universe in {payload_path}")

    mapping = {
        str(k).strip().upper(): str(v)
        for k, v in (payload.get("chartShards") or {}).items()
    }

    by_shard: dict[str, list[str]] = defaultdict(list)
    for ticker in tickers:
        shard = mapping.get(ticker) or shard_for(ticker)
        expected = shard_for(ticker)
        if shard != expected:
            raise SystemExit(f"Chart mapping mismatch for {ticker}: {shard} != {expected}")
        by_shard[shard].append(ticker)

    charts_dir = data_dir / "charts"
    if not charts_dir.is_dir():
        raise SystemExit(f"Missing chart directory: {charts_dir}")

    missing_files: list[str] = []
    missing_tickers: list[str] = []
    empty_series: list[str] = []
    verified = 0

    for shard, names in sorted(by_shard.items()):
        path = charts_dir / shard
        if not path.exists():
            missing_files.append(shard)
            continue
        shard_payload = read_json(path)
        if not isinstance(shard_payload, dict):
            raise SystemExit(f"Chart shard is not an object: {path}")
        for ticker in names:
            if ticker not in shard_payload:
                missing_tickers.append(f"{ticker}@{shard}")
                continue
            bars = shard_payload[ticker]
            if not isinstance(bars, list) or not bars:
                empty_series.append(f"{ticker}@{shard}")
                continue
            verified += 1

    coverage = verified / len(tickers)
    if coverage < MIN_COVERAGE:
        details = []
        if missing_files:
            details.append(f"missing shard files={len(missing_files)} ({', '.join(missing_files[:8])})")
        if missing_tickers:
            details.append(f"missing tickers={len(missing_tickers)} ({', '.join(missing_tickers[:8])})")
        if empty_series:
            details.append(f"empty series={len(empty_series)} ({', '.join(empty_series[:8])})")
        raise SystemExit(
            f"Chart coverage too low: {verified}/{len(tickers)} ({coverage:.1%}); "
            + "; ".join(details)
        )

    print(
        f"Chart integrity OK: {verified:,}/{len(tickers):,} tickers "
        f"({coverage:.1%}) across {len(by_shard)} deterministic shards under {root}"
    )


if __name__ == "__main__":
    main()
