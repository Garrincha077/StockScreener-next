#!/usr/bin/env python3
"""Export the latest full-market scan into web-terminal datasets.

The main screener dataset is derived from the existing scan progress, so scoring does
not run twice. Five-year chart history is downloaded in large yfinance batches and
written into 64 static shards. The shards are deployed with GitHub Pages but are not
committed to git, keeping the repository history small while allowing lazy chart loads.
"""

from __future__ import annotations

import json
import math
import pickle
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parent
PROGRESS = ROOT / "data" / "batch_results" / "batch_progress.pkl"
REPORT = ROOT / "data" / "daily_scans" / "latest_optimized_scan.txt"
OUT = ROOT / "frontend" / "public" / "data" / "latest.json"
CHART_DIR = ROOT / "frontend" / "public" / "data" / "charts"
SHARD_COUNT = 64


def finite(value, default=0.0):
    try:
        value = float(value)
        return value if math.isfinite(value) else default
    except Exception:
        return default


def slope_pct(series: pd.Series, periods: int = 15) -> float:
    s = series.dropna().tail(periods)
    if len(s) < 3:
        return 0.0
    x = np.arange(len(s), dtype=float)
    avg = float(s.mean())
    if avg == 0:
        return 0.0
    return finite(np.polyfit(x, s.to_numpy(dtype=float), 1)[0] / avg * 100)


def previous_slope_pct(series: pd.Series, periods: int = 15) -> float:
    s = series.dropna()
    if len(s) < periods * 2:
        return 0.0
    return slope_pct(s.iloc[-periods * 2 : -periods], periods)


def pct_change(series: pd.Series, periods: int) -> float:
    s = series.dropna()
    if len(s) <= periods or float(s.iloc[-periods - 1]) == 0:
        return 0.0
    return finite((float(s.iloc[-1]) / float(s.iloc[-periods - 1]) - 1) * 100)


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def score_row(analysis: dict) -> dict:
    ticker = analysis["ticker"]
    price_data = analysis["price_data"]
    close = price_data["Close"].astype(float)
    volume = price_data.get("Volume", pd.Series(index=close.index, dtype=float)).astype(float)
    rs = analysis.get("rs_series", pd.Series(index=close.index, dtype=float)).astype(float)
    phase = analysis.get("phase_info", {})
    vcp = analysis.get("vcp_data", {}) or {}

    price = finite(analysis.get("current_price"))
    rs_slope = slope_pct(rs, 15)
    rs_prev = previous_slope_pct(rs, 15)
    rs_accel = rs_slope - rs_prev
    avg20 = finite(volume.iloc[-21:-1].mean()) if len(volume) > 21 else finite(volume.mean())
    vol_ratio = finite(volume.iloc[-1] / avg20, 1.0) if avg20 > 0 and len(volume) else 1.0
    ret20 = pct_change(close, 20)
    ret126 = pct_change(close, min(126, max(1, len(close) - 2)))
    dist50 = finite(phase.get("distance_from_50sma"))
    dist200 = finite(phase.get("distance_from_200sma"))
    contraction = finite((phase.get("volatility_contraction") or {}).get("contraction_quality"))
    vcp_quality = finite(vcp.get("quality"))
    high52 = finite(phase.get("week_52_high"))
    from_high = finite((price / high52 - 1) * 100) if high52 > 0 else 0.0

    # Transparent Pareto heuristic for the user's neglected -> waking-up setup.
    neglected = 20 if ret126 <= 10 else 15 if ret126 <= 25 else 8 if ret126 <= 45 else 3
    base = clamp(contraction * 0.12 + vcp_quality * 0.08, 0, 20)
    rs_turn = clamp(10 + rs_slope * 22, 0, 20)
    rs_accel_score = clamp(7.5 + rs_accel * 24, 0, 15)
    volume_awake = clamp((vol_ratio - 0.8) * 12.5, 0, 15)
    not_extended = clamp(10 - max(0, dist50 - 3) * 0.8 - max(0, -dist50 - 8) * 0.4, 0, 10)
    setup_score = round(neglected + base + rs_turn + rs_accel_score + volume_awake + not_extended)

    phase_num = int(phase.get("phase", 0) or 0)
    early_stage2 = phase_num == 2 and dist50 <= 12 and finite(phase.get("slope_50")) > 0
    waking = phase_num in (1, 2) and rs_accel > 0 and vol_ratio >= 1.2 and ret20 > 0
    perfect = waking and -8 <= dist50 <= 10 and vol_ratio >= 1.5 and setup_score >= 72

    if perfect:
        setup = "Perfect"
    elif early_stage2 and waking:
        setup = "Wake-up"
    elif early_stage2:
        setup = "Early Stage 2"
    elif waking:
        setup = "Waking Up"
    elif rs_slope > 0:
        setup = "RS Leader"
    else:
        setup = phase.get("phase_name", "Other")

    return {
        "ticker": ticker,
        "price": round(price, 2),
        "change20d": round(ret20, 2),
        "return6m": round(ret126, 2),
        "stage": phase_num,
        "stageName": phase.get("phase_name", ""),
        "setup": setup,
        "score": int(clamp(setup_score, 0, 100)),
        "rsSlope": round(rs_slope, 4),
        "rsAcceleration": round(rs_accel, 4),
        "volumeRatio": round(vol_ratio, 2),
        "vcpScore": round(vcp_quality, 1),
        "contraction": round(contraction, 1),
        "distance50": round(dist50, 2),
        "distance200": round(dist200, 2),
        "from52wHigh": round(from_high, 2),
        "sma50": finite(phase.get("sma_50")),
        "sma150": finite(phase.get("sma_150")),
        "sma200": finite(phase.get("sma_200")),
        "perfect": perfect,
        "earlyStage2": early_stage2,
        "wakingUp": waking,
        "components": {
            "neglectedHistory": round(neglected, 1),
            "baseMaturity": round(base, 1),
            "rsTurn": round(rs_turn, 1),
            "rsAcceleration": round(rs_accel_score, 1),
            "volumeAwakening": round(volume_awake, 1),
            "notExtended": round(not_extended, 1),
        },
        "reasons": list(phase.get("reasons", []))[:5],
    }


def parse_report(text: str) -> dict:
    def grab(pattern, default=None, cast=str):
        m = re.search(pattern, text, re.I)
        if not m:
            return default
        try:
            return cast(m.group(1).replace(",", ""))
        except Exception:
            return default

    return {
        "scanDate": grab(r"Scan Date:\s*(.+)", ""),
        "analyzed": grab(r"Analyzed:\s*([\d,]+)", 0, int),
        "buyCount": grab(r"Buy Signals:\s*(\d+)", 0, int),
        "sellCount": grab(r"Sell Signals:\s*(\d+)", 0, int),
        "regime": grab(r"Market Regime:\s*(.+)", "Unknown"),
    }


def shard_for(ticker: str) -> str:
    value = sum((idx + 1) * ord(ch) for idx, ch in enumerate(ticker.upper())) % SHARD_COUNT
    return f"{value:02d}.json"


def extract_ticker_frame(download: pd.DataFrame, ticker: str, chunk_size: int) -> pd.DataFrame:
    if download.empty:
        return pd.DataFrame()
    if chunk_size == 1 and not isinstance(download.columns, pd.MultiIndex):
        return download
    if isinstance(download.columns, pd.MultiIndex):
        level0 = download.columns.get_level_values(0)
        level1 = download.columns.get_level_values(1)
        if ticker in level0:
            return download[ticker]
        if ticker in level1:
            return download.xs(ticker, axis=1, level=1)
    return pd.DataFrame()


def compact_bars(df: pd.DataFrame, spy_close: pd.Series) -> list[list]:
    if df.empty or "Close" not in df:
        return []
    df = df.dropna(subset=["Close"]).copy()
    if df.empty:
        return []
    idx = pd.DatetimeIndex(df.index)
    if idx.tz is not None:
        idx = idx.tz_localize(None)
    df.index = idx
    spy = spy_close.copy()
    if isinstance(spy.index, pd.DatetimeIndex) and spy.index.tz is not None:
        spy.index = spy.index.tz_localize(None)
    spy_aligned = spy.reindex(df.index, method="ffill")

    rows = []
    for ts, row in df.tail(1265).iterrows():
        close = finite(row.get("Close"))
        spy_value = finite(spy_aligned.get(ts))
        rs = finite(close / spy_value * 100) if spy_value > 0 else 0.0
        rows.append([
            ts.strftime("%Y-%m-%d"),
            round(finite(row.get("Open")), 4),
            round(finite(row.get("High")), 4),
            round(finite(row.get("Low")), 4),
            round(close, 4),
            int(finite(row.get("Volume"))),
            round(rs, 5),
        ])
    return rows


def build_five_year_chart_shards(tickers: list[str]) -> dict[str, str]:
    CHART_DIR.mkdir(parents=True, exist_ok=True)
    for old in CHART_DIR.glob("*.json"):
        old.unlink()

    print(f"Fetching 5Y chart history for {len(tickers):,} analyzed tickers in batches...")
    spy_df = yf.download("SPY", period="5y", interval="1d", auto_adjust=False, progress=False, threads=False)
    if isinstance(spy_df.columns, pd.MultiIndex):
        if "SPY" in spy_df.columns.get_level_values(0):
            spy_df = spy_df["SPY"]
        elif "SPY" in spy_df.columns.get_level_values(1):
            spy_df = spy_df.xs("SPY", axis=1, level=1)
    spy_close = spy_df["Close"].dropna() if "Close" in spy_df else pd.Series(dtype=float)

    shards: dict[str, dict[str, list[list]]] = {f"{i:02d}.json": {} for i in range(SHARD_COUNT)}
    mapping: dict[str, str] = {}
    chunk_size = 100

    for start in range(0, len(tickers), chunk_size):
        chunk = tickers[start : start + chunk_size]
        print(f"  charts {start + 1:,}-{min(start + len(chunk), len(tickers)):,}/{len(tickers):,}")
        try:
            download = yf.download(
                chunk,
                period="5y",
                interval="1d",
                group_by="ticker",
                auto_adjust=False,
                progress=False,
                threads=True,
            )
        except Exception as exc:
            print(f"  batch failed: {exc}")
            time.sleep(2)
            continue

        for ticker in chunk:
            frame = extract_ticker_frame(download, ticker, len(chunk))
            bars = compact_bars(frame, spy_close)
            if not bars:
                continue
            shard = shard_for(ticker)
            shards[shard][ticker] = bars
            mapping[ticker] = shard

    for name, payload in shards.items():
        if payload:
            (CHART_DIR / name).write_text(
                json.dumps(payload, separators=(",", ":"), ensure_ascii=False), encoding="utf-8"
            )

    size_mb = sum(p.stat().st_size for p in CHART_DIR.glob("*.json")) / 1024 / 1024
    print(f"5Y chart shards: {len(mapping):,} tickers, {size_mb:.1f} MB raw across {SHARD_COUNT} shards")
    return mapping


def main():
    if not PROGRESS.exists():
        raise SystemExit(f"Missing scan progress: {PROGRESS}")
    with PROGRESS.open("rb") as fh:
        progress = pickle.load(fh)
    analyses = progress.get("results", [])
    if not analyses:
        raise SystemExit("Scan progress contains no analyses")

    scored = [(score_row(a), a) for a in analyses]
    scored.sort(key=lambda pair: pair[0]["score"], reverse=True)
    universe = [row for row, _ in scored]
    tickers = [row["ticker"] for row in universe]
    chart_shards = build_five_year_chart_shards(tickers)

    stage_counts = {str(i): sum(1 for r in universe if r["stage"] == i) for i in range(1, 5)}
    market = parse_report(REPORT.read_text(encoding="utf-8", errors="ignore") if REPORT.exists() else "")
    market.update({
        "totalUniverse": len(progress.get("processed", [])),
        "stageCounts": stage_counts,
        "stage2Pct": round(stage_counts["2"] / max(1, len(universe)) * 100, 1),
        "earlyLeaders": sum(1 for r in universe if r["earlyStage2"]),
        "perfectSetups": sum(1 for r in universe if r["perfect"]),
        "wakingUp": sum(1 for r in universe if r["wakingUp"]),
        "fiveYearCharts": len(chart_shards),
    })

    payload = {
        "version": 2,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "market": market,
        "universe": universe,
        "chartShards": chart_shards,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(
        f"Frontend dataset: {OUT} ({OUT.stat().st_size / 1024 / 1024:.2f} MB, "
        f"{len(universe)} rows, {len(chart_shards)} 5Y charts)"
    )


if __name__ == "__main__":
    main()
