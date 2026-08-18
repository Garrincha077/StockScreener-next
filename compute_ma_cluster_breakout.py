#!/usr/bin/env python3
"""Compute the user's weekly 10W/30W MA-cluster entry signal.

Definition:
- setup: 10W and 30W weekly SMAs are compressed and no longer meaningfully falling;
- ready: price is close to that cluster, before a breakout;
- entry: price crosses above the upper MA in the cluster on confirming volume,
  without already being materially extended.

The calculation uses the existing adjusted-OHLCV 5Y chart shards. It does not
change LEGACY, fundamentals, or group leadership.
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "frontend" / "public" / "data" / "latest.json"
CHART_DIR = ROOT / "frontend" / "public" / "data" / "charts"
MODEL = "weekly-ma-cluster-breakout-v1"


def finite(v, default=0.0):
    try:
        x = float(v)
        return x if math.isfinite(x) else float(default)
    except Exception:
        return float(default)


def clamp(v, lo=0.0, hi=100.0):
    return max(lo, min(hi, float(v)))


def pct(now, old):
    now, old = finite(now), finite(old)
    return (now / old - 1.0) * 100.0 if old else 0.0


def sma(values, n):
    if len(values) < n:
        return None
    return sum(values[-n:]) / n


def rolling_sma(values, n):
    out = []
    total = 0.0
    for i, v in enumerate(values):
        total += v
        if i >= n:
            total -= values[i - n]
        out.append(total / n if i + 1 >= n else None)
    return out


def aggregate_weekly(bars):
    """Aggregate daily [date,o,h,l,c,volume,rs] bars into Monday-keyed weeks."""
    weeks = []
    current = None
    for raw in bars:
        if len(raw) < 6:
            continue
        try:
            d = datetime.fromisoformat(str(raw[0])[:10])
        except Exception:
            continue
        monday = (d - timedelta(days=d.weekday())).date().isoformat()
        o, h, l, c, v = map(finite, raw[1:6])
        if current is None or current["week"] != monday:
            current = {
                "week": monday,
                "open": o,
                "high": h,
                "low": l,
                "close": c,
                "volume": v,
                "days": 1,
            }
            weeks.append(current)
        else:
            current["high"] = max(current["high"], h)
            current["low"] = min(current["low"], l)
            current["close"] = c
            current["volume"] += v
            current["days"] += 1
    return weeks


def score_bars(bars):
    weeks = aggregate_weekly(bars)
    if len(weeks) < 35:
        return {
            "maClusterReady": False,
            "maClusterEntrySignal": False,
            "maClusterScore": 0.0,
            "maClusterReasons": ["Insufficient weekly history"],
        }

    closes = [finite(w["close"]) for w in weeks]
    ma10s = rolling_sma(closes, 10)
    ma30s = rolling_sma(closes, 30)
    i = len(weeks) - 1
    if ma10s[i] is None or ma30s[i] is None:
        return {
            "maClusterReady": False,
            "maClusterEntrySignal": False,
            "maClusterScore": 0.0,
            "maClusterReasons": ["Insufficient weekly MA history"],
        }

    ma10 = finite(ma10s[i])
    ma30 = finite(ma30s[i])
    cluster_mid = (ma10 + ma30) / 2.0 if ma10 and ma30 else 0.0
    cluster_top = max(ma10, ma30)
    spread_pct = abs(ma10 - ma30) / cluster_mid * 100.0 if cluster_mid else 100.0

    def ma_slope(series, lookback=4):
        now = series[i]
        old_idx = max(0, i - lookback)
        old = series[old_idx]
        if now is None or old is None:
            return 0.0
        return pct(now, old)

    slope10_4w = ma_slope(ma10s, 4)
    slope30_4w = ma_slope(ma30s, 4)
    turn_count = int(slope10_4w >= 0) + int(slope30_4w >= 0)

    price = closes[-1]
    price_vs_top = pct(price, cluster_top)

    prev_i = i - 1
    prev_close = closes[prev_i]
    prev_ma10 = finite(ma10s[prev_i]) if ma10s[prev_i] is not None else ma10
    prev_ma30 = finite(ma30s[prev_i]) if ma30s[prev_i] is not None else ma30
    prev_top = max(prev_ma10, prev_ma30)

    # Normalize the current partial week to a 5-session pace so Tuesday/Wednesday
    # scans are not unfairly penalized relative to completed historical weeks.
    current_week = weeks[-1]
    daily_pace = current_week["volume"] / max(1, current_week["days"])
    prior_weeks = weeks[-11:-1]
    prior_daily = [w["volume"] / max(1, w["days"]) for w in prior_weeks]
    avg_prior_daily = sum(prior_daily) / len(prior_daily) if prior_daily else 0.0
    volume_pace = daily_pace / avg_prior_daily if avg_prior_daily else 1.0

    tight = spread_pct <= 3.5
    very_tight = spread_pct <= 2.0
    flattening = slope10_4w >= -1.0 and slope30_4w >= -1.0 and turn_count >= 1
    above_cluster = price > cluster_top
    crossed_now = above_cluster and prev_close <= prev_top * 1.02
    not_chased = -1.0 <= price_vs_top <= 8.0
    volume_confirmed = volume_pace >= 1.40

    ready = bool(
        tight
        and flattening
        and -6.0 <= price_vs_top <= 2.5
    )
    entry = bool(
        tight
        and flattening
        and crossed_now
        and not_chased
        and volume_confirmed
    )

    tightness_score = clamp((4.5 - spread_pct) / 4.0 * 100.0)
    turn_score = clamp(
        40.0
        + max(-1.0, min(2.0, slope10_4w)) * 15.0
        + max(-1.0, min(2.0, slope30_4w)) * 15.0
        + turn_count * 10.0
    )
    trigger_score = 100.0 if entry else clamp((8.0 - abs(price_vs_top)) / 8.0 * 100.0)
    volume_score = clamp((volume_pace - 0.8) / 1.2 * 100.0)
    score = clamp(0.35 * tightness_score + 0.20 * turn_score + 0.25 * trigger_score + 0.20 * volume_score)

    reasons = []
    reasons.append(f"10W/30W spread {spread_pct:.1f}%")
    reasons.append(f"10W slope4w {slope10_4w:+.1f}%")
    reasons.append(f"30W slope4w {slope30_4w:+.1f}%")
    reasons.append(f"Price vs cluster {price_vs_top:+.1f}%")
    reasons.append(f"Volume pace {volume_pace:.2f}x")
    if entry:
        reasons.insert(0, "ENTRY: broke above 10W/30W cluster on volume")
    elif ready:
        reasons.insert(0, "READY: compressed 10W/30W cluster near price")

    return {
        "ma10w": round(ma10, 4),
        "ma30w": round(ma30, 4),
        "maClusterSpreadPct": round(spread_pct, 2),
        "ma10wSlope4w": round(slope10_4w, 3),
        "ma30wSlope4w": round(slope30_4w, 3),
        "maClusterTurnCount": int(turn_count),
        "maClusterTop": round(cluster_top, 4),
        "maClusterPricePct": round(price_vs_top, 2),
        "maClusterVolumePace": round(volume_pace, 2),
        "maClusterTight": bool(tight),
        "maClusterVeryTight": bool(very_tight),
        "maClusterReady": ready,
        "maClusterEntrySignal": entry,
        "maClusterScore": round(score, 1),
        "maClusterReasons": reasons[:6],
    }


def apply_to_payload(payload):
    rows = payload.get("universe") or []
    row_map = {str(r.get("ticker") or "").upper(): r for r in rows}
    shards = payload.get("chartShards") or {}
    cache = {}
    covered = 0

    for ticker, row in row_map.items():
        shard_name = shards.get(ticker)
        if not shard_name:
            row.update(score_bars([]))
            continue
        path = CHART_DIR / shard_name
        try:
            if shard_name not in cache:
                cache[shard_name] = json.loads(path.read_text(encoding="utf-8"))
            bars = cache[shard_name].get(ticker) or []
            result = score_bars(bars)
            if result.get("ma10w") is not None:
                covered += 1
            row.update(result)
        except Exception as exc:
            row.update(score_bars([]))
            row["maClusterReasons"] = [f"Cluster data error: {type(exc).__name__}"]

    market = payload.setdefault("market", {})
    market["maClusterModel"] = MODEL
    market["maClusterCoverage"] = covered
    market["maClusterReadyCount"] = sum(bool(r.get("maClusterReady")) for r in rows)
    market["maClusterEntryCount"] = sum(bool(r.get("maClusterEntrySignal")) for r in rows)
    market["maClusterTop"] = [
        r.get("ticker")
        for r in sorted(
            rows,
            key=lambda r: (
                bool(r.get("maClusterEntrySignal")),
                bool(r.get("maClusterReady")),
                finite(r.get("maClusterScore")),
                finite(r.get("rsRank")),
            ),
            reverse=True,
        )[:15]
    ]
    payload["maClusterModel"] = MODEL
    return payload


def main():
    if not DATA.exists():
        print("MA cluster computation skipped: latest.json missing")
        return
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    apply_to_payload(payload)
    DATA.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    market = payload.get("market") or {}
    print(
        f"MA Cluster: coverage={market.get('maClusterCoverage',0)} "
        f"ready={market.get('maClusterReadyCount',0)} entry={market.get('maClusterEntryCount',0)}"
    )


if __name__ == "__main__":
    main()
