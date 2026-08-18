#!/usr/bin/env python3
"""Calibrate StockScout setup recipes toward early, non-extended leadership.

The raw feature engine remains untouched. This pass only turns transparent
StockScout fields into stricter setup labels and an early-opportunity ranking.
It must never call, mutate or depend on the frozen LEGACY source layer; LEGACY
enrichment is orchestrated separately by the nightly workflow.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

DATA = Path("frontend/public/data/latest.json")


def n(row, key, default=0.0):
    try:
        value = row.get(key, default)
        value = default if value is None else float(value)
        return value if math.isfinite(value) else float(default)
    except Exception:
        return float(default)


def clamp(value, lo=0.0, hi=100.0):
    return max(lo, min(hi, value))


def calibrate(row: dict):
    stage = int(n(row, "stage"))
    age = n(row, "stage2AgeWeeks")
    rs = n(row, "rsRank")
    accel = n(row, "rsAcceleration")
    vol = n(row, "volumeRatio", 1.0)
    d10 = n(row, "distance10w", n(row, "distance50"))
    d30 = n(row, "distance30w")
    ret3 = n(row, "return3m")
    prior9 = n(row, "prior9mReturn")
    tt = n(row, "trendTemplatePasses")
    breakout = n(row, "breakoutPct")
    rs_from_high = n(row, "rsFromHigh")
    price_from_high = n(row, "from52wHigh")
    vcp = n(row, "vcpScore")
    contraction = n(row, "contraction")
    atr_comp = n(row, "atrCompression")
    range20 = n(row, "tightRange20", 100)
    volume_dry = n(row, "volumeDryUp", 1)
    slope150 = n(row, "slope150")
    base_weeks = n(row, "baseWeeks")

    extended = d10 > 12 or d30 > 22
    row["extended"] = bool(extended)

    tags: list[str] = []
    neglected = (
        stage in (1, 2)
        and prior9 <= 15
        and 3 <= ret3 <= 30
        and rs >= 70
        and accel > 0
        and vol >= 0.8
        and -8 <= d10 <= 10
        and d30 <= 18
        and (stage == 1 or age <= 12)
        and not extended
    )
    transition = (
        stage in (1, 2)
        and (stage == 1 or age <= 6)
        and tt >= 5
        and rs >= 65
        and accel > 0
        and -8 <= d10 <= 10
        and d30 <= 18
        and not extended
    )
    fresh_stage2 = (
        stage == 2
        and age <= 10
        and tt >= 6
        and rs >= 65
        and -8 <= d10 <= 10
        and not extended
        and (accel > 0 or (rs >= 85 and rs_from_high >= -3))
    )
    fresh_breakout = (
        stage in (1, 2)
        and -1.5 <= breakout <= 5
        and vol >= 1.5
        and rs >= 70
        and accel > 0
        and not extended
    )
    rs_before_price = (
        stage in (1, 2)
        and rs >= 85
        and rs_from_high >= -2
        and price_from_high <= -5
        and -8 <= d10 <= 10
        and not extended
    )
    tight_vcp = (
        stage in (1, 2)
        and max(vcp, contraction, atr_comp) >= 40
        and range20 <= 12
        and volume_dry <= 1.05
        and rs >= 55
        and accel >= -0.2
        and not extended
    )
    volume_wakeup = (
        stage in (1, 2)
        and vol >= 1.8
        and rs >= 65
        and accel > 0
        and ret3 > 0
        and d10 <= 12
        and breakout <= 8
        and not extended
    )
    pullback_10w = (
        stage == 2
        and -3 <= d10 <= 5
        and rs >= 70
        and slope150 > 0
        and age <= 20
        and rs_from_high >= -8
        and not extended
    )
    long_base = (
        stage in (1, 2)
        and base_weeks >= 20
        and -2 <= breakout <= 5
        and vol >= 1.3
        and rs >= 60
        and accel > 0
        and not extended
    )

    if neglected:
        tags.append("Neglected → Leader")
    if transition:
        tags.append("S1→S2 Transition")
    if long_base:
        tags.append("Long Base Breakout")
    if fresh_breakout:
        tags.append("Fresh Breakout")
    if rs_before_price:
        tags.append("RS Before Price")
    if tight_vcp:
        tags.append("Tight / VCP")
    if pullback_10w:
        tags.append("10W Pullback")
    if fresh_stage2:
        tags.append("Fresh Stage 2")
    if volume_wakeup:
        tags.append("Volume Wake-Up")

    positive = list(tags)
    if extended:
        tags.append("⚠ Extended")

    order = [
        "Neglected → Leader",
        "S1→S2 Transition",
        "Long Base Breakout",
        "Fresh Breakout",
        "RS Before Price",
        "Tight / VCP",
        "10W Pullback",
        "Fresh Stage 2",
        "Volume Wake-Up",
    ]
    primary = next((x for x in order if x in positive), None)
    if not primary:
        if stage == 2 and extended:
            primary = "Extended Stage 2"
        elif stage == 2 and rs >= 80:
            primary = "Trend Leader"
        elif stage == 2:
            primary = "Stage 2"
        elif stage == 1:
            primary = "Base Building"
        else:
            primary = str(row.get("stageName") or row.get("setup") or "Other")
        if not tags:
            tags.append(primary)

    structure = n(row, "structureScore")
    rs_score = n(row, "rsScore")
    base_score = n(row, "baseScore")
    trigger = n(row, "triggerScore")
    freshness = n(row, "freshnessScore")

    opportunity = structure * 0.18 + rs_score * 0.24 + base_score * 0.18 + trigger * 0.16 + freshness * 0.24
    bonuses = {
        "Neglected → Leader": 8,
        "S1→S2 Transition": 6,
        "Long Base Breakout": 5,
        "Fresh Breakout": 5,
        "RS Before Price": 3,
        "Volume Wake-Up": 3,
        "Tight / VCP": 2,
        "10W Pullback": 2,
        "Fresh Stage 2": 2,
    }
    opportunity += max((bonuses.get(tag, 0) for tag in positive), default=0)
    if extended:
        opportunity -= 28
        if d10 > 20:
            opportunity -= 10
    if rs < 60:
        opportunity -= 6
    if accel <= 0 and primary not in ("10W Pullback", "Tight / VCP"):
        opportunity -= 5
    if stage == 2 and age > 20:
        opportunity -= 8
    if stage not in (1, 2):
        opportunity -= 10
    opportunity = int(round(clamp(opportunity)))

    confluence_checks = [
        stage in (1, 2),
        tt >= 6,
        rs >= 70,
        accel > 0,
        vol >= 1.0,
        max(vcp, contraction, atr_comp) >= 40,
        -8 <= d10 <= 10,
        -5 <= breakout <= 8,
        rs_from_high >= -8,
        not extended,
    ]
    if row.get("fundamentalSupport") is True:
        confluence_checks.append(True)
    confluence = sum(bool(x) for x in confluence_checks)

    early_primary = primary in {
        "Neglected → Leader", "S1→S2 Transition", "Long Base Breakout",
        "Fresh Breakout", "RS Before Price", "Fresh Stage 2", "Volume Wake-Up",
    }
    early_stage = stage == 1 or (stage == 2 and age <= 12)
    perfect = early_primary and early_stage and opportunity >= 62 and confluence >= 7 and rs >= 75 and not extended

    row.update({
        "setupTags": tags,
        "setupMatchCount": len(positive),
        "primarySetup": primary,
        "opportunityScore": opportunity,
        "confluence": confluence,
        "perfect": bool(perfect),
        "earlyStage2": bool(stage == 2 and age <= 10 and rs >= 65 and not extended),
        "wakingUp": bool(stage in (1, 2) and accel > 0 and vol >= 1.2 and ret3 > 0 and not extended),
    })


def main():
    if not DATA.exists():
        print("Setup calibration skipped: latest.json missing")
        return
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    rows = payload.get("universe") or []
    for row in rows:
        calibrate(row)
    market = payload.setdefault("market", {})
    market["perfectSetups"] = sum(bool(r.get("perfect")) for r in rows)
    market["neglectedLeaders"] = sum("Neglected → Leader" in (r.get("setupTags") or []) for r in rows)
    market["transitions"] = sum("S1→S2 Transition" in (r.get("setupTags") or []) for r in rows)
    market["freshBreakouts"] = sum("Fresh Breakout" in (r.get("setupTags") or []) for r in rows)
    market["highConfluence"] = sum(int(r.get("confluence", 0) or 0) >= 7 for r in rows)
    market["extendedCount"] = sum(bool(r.get("extended")) for r in rows)
    payload["calibrationModel"] = "early-leader-v2"
    payload["featureModel"] = "data-first-v2-early-leader"
    payload["version"] = max(5, int(payload.get("version", 1) or 1))
    DATA.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(
        f"Calibrated {len(rows):,} rows: perfect={market['perfectSetups']}, "
        f"neglected={market['neglectedLeaders']}, transitions={market['transitions']}, "
        f"freshBreakouts={market['freshBreakouts']}, extended={market['extendedCount']}"
    )


if __name__ == "__main__":
    main()
