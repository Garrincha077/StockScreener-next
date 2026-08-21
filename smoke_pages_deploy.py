#!/usr/bin/env python3
"""Post-deploy smoke for manifest, core, one LEGACY detail and one chart shard."""
from __future__ import annotations

import argparse
import json
import time
from urllib.parse import urljoin
from urllib.request import Request, urlopen


def fetch_json(url: str):
    request = Request(url, headers={"User-Agent": "stockscout-pages-smoke/1"})
    with urlopen(request, timeout=30) as response:
        if response.status != 200:
            raise RuntimeError(f"HTTP {response.status}: {url}")
        return json.loads(response.read().decode("utf-8"))


def shard_for(ticker: str, count: int) -> str:
    value = sum((index + 1) * ord(char) for index, char in enumerate(ticker.upper()))
    return f"{value % max(1, count):03d}.json"


def smoke_once(base_url: str) -> None:
    base = base_url.rstrip("/") + "/"
    manifest = fetch_json(urljoin(base, "data/manifest.json"))
    if manifest.get("manifestVersion") != 2:
        raise RuntimeError("Live site does not expose manifest v2")
    assets = manifest.get("assets") or {}
    core_asset = assets.get("core") or {}
    core = fetch_json(urljoin(base, f"data/{core_asset.get('path', 'core.json')}"))
    rows = core.get("universe") or []
    if not rows:
        raise RuntimeError("Live core has no universe")

    ticker = str(rows[0].get("ticker") or "").upper()
    detail_asset = assets.get("legacyDetails") or {}
    detail_shard = shard_for(ticker, int(detail_asset.get("shardCount") or 128))
    details = fetch_json(urljoin(base, f"data/{detail_asset.get('path', 'legacy/details')}/{detail_shard}"))
    if ticker not in details:
        raise RuntimeError(f"Live LEGACY detail shard does not contain {ticker}")

    mapping = {str(key).upper(): str(value) for key, value in (core.get("chartShards") or {}).items()}
    universe = {str(row.get("ticker") or "").upper() for row in rows}
    chart_ticker = ""
    shard_cache = {}
    for candidate, shard in mapping.items():
        if candidate not in universe:
            continue
        if shard not in shard_cache:
            chart_asset = assets.get("charts") or {}
            shard_cache[shard] = fetch_json(urljoin(base, f"data/{chart_asset.get('path', 'charts')}/{shard}"))
        bars = shard_cache[shard].get(candidate)
        if isinstance(bars, list) and bars:
            chart_ticker = candidate
            break
    if not chart_ticker:
        raise RuntimeError("Live site has no usable mapped chart series")
    print(f"PAGES SMOKE PASS: manifest/core/detail({ticker})/chart({chart_ticker})")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("base_url")
    parser.add_argument("--attempts", type=int, default=8)
    parser.add_argument("--delay", type=float, default=5.0)
    args = parser.parse_args()
    last_error: Exception | None = None
    for attempt in range(1, max(1, args.attempts) + 1):
        try:
            smoke_once(args.base_url)
            return
        except Exception as exc:
            last_error = exc
            print(f"Pages smoke attempt {attempt}/{args.attempts} failed: {exc}")
            if attempt < args.attempts:
                time.sleep(max(0, args.delay))
    raise SystemExit(f"PAGES SMOKE FAILED: {last_error}")


if __name__ == "__main__":
    main()
