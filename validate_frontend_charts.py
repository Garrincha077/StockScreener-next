#!/usr/bin/env python3
"""Report terminal chart-shard integrity without blocking a Pages deploy.

Chart availability is best-effort presentation data. Missing/partial shards must
never prevent the rest of StockScout from being published. This command exits
successfully for chart-data problems and emits GitHub Actions warnings instead.
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

SHARD_COUNT = 128


def shard_for(ticker: str) -> str:
    ticker = ticker.strip().upper()
    value = sum((idx + 1) * ord(ch) for idx, ch in enumerate(ticker)) % SHARD_COUNT
    return f"{value:03d}.json"


def warn(message: str) -> None:
    print(f"::warning::{message}")


def read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        warn(f"Invalid chart JSON {path}: {exc}")
        return None


def main() -> None:
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("frontend/public")
    data_dir = root / "data"
    payload_path = data_dir / "core.json"
    if not payload_path.exists():
        payload_path = data_dir / "latest.json"
    if not payload_path.exists():
        warn(f"No frontend payload found under {data_dir}; skipping chart diagnostics")
        return

    payload = read_json(payload_path)
    if not isinstance(payload, dict):
        return

    universe = payload.get("universe") or []
    tickers = [str(row.get("ticker", "")).strip().upper() for row in universe if isinstance(row, dict) and row.get("ticker")]
    if not tickers:
        warn(f"No tickers in {payload_path}; skipping chart diagnostics")
        return

    mapping = {
        str(k).strip().upper(): str(v)
        for k, v in (payload.get("chartShards") or {}).items()
    }

    by_shard: dict[str, list[str]] = defaultdict(list)
    mapping_mismatches: list[str] = []
    for ticker in tickers:
        expected = shard_for(ticker)
        shard = mapping.get(ticker) or expected
        if shard != expected:
            mapping_mismatches.append(f"{ticker}:{shard}!={expected}")
            shard = expected
        by_shard[shard].append(ticker)

    charts_dir = data_dir / "charts"
    if not charts_dir.is_dir():
        warn(f"Chart directory missing: {charts_dir}. Deploy continues without charts.")
        print(f"Chart coverage: 0/{len(tickers)} (0.0%) under {root}")
        return

    missing_files: list[str] = []
    missing_tickers: list[str] = []
    empty_series: list[str] = []
    invalid_shards: list[str] = []
    verified = 0

    for shard, names in sorted(by_shard.items()):
        path = charts_dir / shard
        if not path.exists():
            missing_files.append(shard)
            continue
        shard_payload = read_json(path)
        if not isinstance(shard_payload, dict):
            invalid_shards.append(shard)
            continue
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
    details = []
    if mapping_mismatches:
        details.append(f"mapping mismatches={len(mapping_mismatches)} ({', '.join(mapping_mismatches[:5])})")
    if missing_files:
        details.append(f"missing shard files={len(missing_files)} ({', '.join(missing_files[:8])})")
    if invalid_shards:
        details.append(f"invalid shards={len(invalid_shards)} ({', '.join(invalid_shards[:8])})")
    if missing_tickers:
        details.append(f"missing tickers={len(missing_tickers)} ({', '.join(missing_tickers[:8])})")
    if empty_series:
        details.append(f"empty series={len(empty_series)} ({', '.join(empty_series[:8])})")

    print(
        f"Chart coverage: {verified:,}/{len(tickers):,} tickers "
        f"({coverage:.1%}) across {len(by_shard)} deterministic shards under {root}"
    )
    if details:
        warn("Partial chart coverage; deploy continues. " + "; ".join(details))


if __name__ == "__main__":
    main()
