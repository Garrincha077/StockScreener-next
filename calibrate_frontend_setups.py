#!/usr/bin/env python3
"""Calibrate transparent StockScout setup labels and emerging-leader discovery.

LEGACY remains untouched. This layer only consumes already-exported STOCKSCOUT
features. The main ranking is produced by `emerging_leader.py`; setup tags are
explanatory labels and no longer award arbitrary score bonuses.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

from emerging_leader import MODEL as EMERGING_MODEL, score_row as score_emerging_leader
from lateral_base import MODEL as LATERAL_BASE_MODEL, score_row as score_lateral_base

DATA = Path("frontend/public/data/latest.json")


def n(row, key, default=0.0):
    try:
        value = row.get(key, default)
        value = default if value is None else float(value)
        return value if math.isfinite(value) else float(default)
    except Exception:
        return float(default)


def calibrate(row: dict):
    """Assign transparent setup labels only; scoring happens after Lateral Base."""
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
        and prior9 <= 40
        and -5 <= ret3 <= 35
        and rs >= 60
        and accel > 0
        and -8 <= d10 <= 10
        and d30 <= 18
        and base_weeks >= 12
        and (stage == 1 or age <= 12)
        and not extended
    )
    transition = (
        stage in (1, 2)
        and (stage == 1 or age <= 6)
        and tt >= 5
        and rs >= 60
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
        and -6 <= breakout <= 5
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

    row.update({
        "setupTags": tags,
        "setupMatchCount": len(positive),
        "primarySetup": primary,
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
        row.update(score_lateral_base(row))
        row.update(score_emerging_leader(row))
        if row.get("emergingLeaderCandidate"):
            tags = list(row.get("setupTags") or [])
            if "Neglected → Emerging Leader" not in tags:
                tags.insert(0, "Neglected → Emerging Leader")
            row["setupTags"] = tags
            row["setupMatchCount"] = len([t for t in tags if not str(t).startswith("⚠")])
            row["primarySetup"] = "Neglected → Emerging Leader"

    market = payload.setdefault("market", {})
    emerging = [r for r in rows if r.get("emergingLeaderCandidate")]
    a_plus = [r for r in rows if r.get("aPlusEmergingSetup")]

    market["perfectSetups"] = len(a_plus)  # compatibility
    market["aPlusEmergingSetups"] = len(a_plus)
    market["emergingLeaderCandidates"] = len(emerging)
    market["neglectedLeaders"] = len(emerging)  # compatibility
    market["transitions"] = sum("S1→S2 Transition" in (r.get("setupTags") or []) for r in rows)
    market["freshBreakouts"] = sum("Fresh Breakout" in (r.get("setupTags") or []) for r in rows)
    market["highEvidence"] = sum(int(r.get("emergingEvidenceCount", 0) or 0) >= 4 for r in rows)
    market["highConfluence"] = market["highEvidence"]  # compatibility alias
    market["extendedCount"] = sum(bool(r.get("extended")) for r in rows)

    lateral_candidates = [r for r in rows if r.get("lateralBaseCandidate")]
    market["lateralBaseCandidates"] = len(lateral_candidates)
    market["lateralBaseAvgScore"] = round(sum(n(r, "lateralBaseScore") for r in rows) / max(1, len(rows)), 1)
    market["lateralBaseTop"] = [
        r.get("ticker") for r in sorted(
            lateral_candidates,
            key=lambda r: (n(r, "neglectedLaunchScore"), n(r, "launchReadiness"), n(r, "lateralBaseScore")),
            reverse=True,
        )[:10]
    ]
    market["emergingLeaderTop"] = [
        r.get("ticker") for r in sorted(
            emerging,
            key=lambda r: (n(r, "emergingLeaderScore"), n(r, "emergingEvidenceCount"), n(r, "rsRank")),
            reverse=True,
        )[:15]
    ]

    payload["calibrationModel"] = EMERGING_MODEL
    payload["featureModel"] = "data-first-v3-emerging-leader"
    payload["lateralBaseModel"] = LATERAL_BASE_MODEL
    payload["emergingLeaderModel"] = EMERGING_MODEL
    payload["version"] = max(8, int(payload.get("version", 1) or 1))

    DATA.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(
        f"Calibrated {len(rows):,} rows: emerging={len(emerging)}, A+={len(a_plus)}, "
        f"evidence4+={market['highEvidence']}, extended={market['extendedCount']}, "
        f"lateralBaseCandidates={market['lateralBaseCandidates']}"
    )


if __name__ == "__main__":
    main()
