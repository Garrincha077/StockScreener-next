#!/usr/bin/env python3
"""Transparent neglected-to-emerging leader score for StockScout.

The model is deliberately stock-specific. Group leadership and fundamentals remain
separate confirmation layers so they are not double-counted inside the core score.

Pillars (0-100):
- resetScore: 30% — lateral base + contraction quality
- rsTurnScore: 25% — RS rank, acceleration and proximity to RS high
- neglectHistoryScore: 20% — multi-year/prior-period lack of sustained leadership
- triggerReadinessScore: 15% — price near a trigger without being extended
- stageFreshnessScore: 10% — Stage 1 / very early Stage 2 preference

`opportunityScore` remains a compatibility alias in the dataset/UI, but from this
model onward it is the same value as `emergingLeaderScore`.
"""
from __future__ import annotations

import math

MODEL = "neglected-emerging-leader-v1"


def finite(value, default=0.0):
    try:
        value = float(value)
        return value if math.isfinite(value) else float(default)
    except Exception:
        return float(default)


def optional_finite(value):
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except Exception:
        return None


def clamp(value, lo=0.0, hi=100.0):
    return max(lo, min(hi, float(value)))


def ramp(value, low, high):
    value = finite(value)
    if high <= low:
        return 0.0
    return clamp((value - low) / (high - low) * 100.0)


def inverse_ramp(value, good, bad):
    value = finite(value, bad)
    if bad <= good:
        return 0.0
    return clamp((bad - value) / (bad - good) * 100.0)


def band_score(value, lo, sweet_lo, sweet_hi, hi):
    value = finite(value, lo)
    if sweet_lo <= value <= sweet_hi:
        return 100.0
    if value < sweet_lo:
        return clamp((value - lo) / max(1e-9, sweet_lo - lo) * 100.0)
    return clamp((hi - value) / max(1e-9, hi - sweet_hi) * 100.0)


def weighted_available(items, default=50.0):
    usable = [(value, weight) for value, weight in items if value is not None]
    if not usable:
        return float(default)
    total = sum(weight for _, weight in usable)
    return sum(value * weight for value, weight in usable) / total


def neglect_component(value, good, bad):
    value = optional_finite(value)
    if value is None:
        return None
    return inverse_ramp(value, good, bad)


def score_row(row: dict) -> dict:
    stage = int(finite(row.get("stage")))
    stage2_age = finite(row.get("stage2AgeWeeks"))
    base_weeks = finite(row.get("baseWeeks"))
    lateral = finite(row.get("lateralBaseScore"))
    contraction = finite(row.get("contractionQuality"))
    rs_rank = finite(row.get("rsRank"))
    rs_accel = finite(row.get("rsAcceleration"))
    rs_from_high = finite(row.get("rsFromHigh"), -100.0)
    breakout = finite(row.get("breakoutPct"), -100.0)
    d10 = finite(row.get("distance10w"), finite(row.get("distance50")))
    d30 = finite(row.get("distance30w"))
    volume_ratio = finite(row.get("volumeRatio"), 1.0)
    extended = bool(row.get("extended")) or d10 > 12 or d30 > 22

    # Pillar 1 — a real reset/base is mandatory for this style.  Lateral Base v1
    # already combines duration/depth/tightness; contraction is intentionally kept
    # separate and blended here rather than rewarded again via setup tags.
    reset_score = 0.60 * lateral + 0.40 * contraction

    # Pillar 2 — prefer RS that is turning up now, not merely a high historical rank.
    rs_turn_score = (
        0.45 * ramp(rs_rank, 55, 95)
        + 0.40 * ramp(rs_accel, -0.15, 0.90)
        + 0.15 * ramp(rs_from_high, -18, -2)
    )

    # Pillar 3 — neglect is measured across several horizons. Missing long-history
    # observations are simply omitted rather than treated as either good or bad.
    neglect_history_score = weighted_available(
        [
            (neglect_component(row.get("return5y"), 50, 250), 0.35),
            (neglect_component(row.get("return3y"), 30, 150), 0.30),
            (neglect_component(row.get("return2y"), 20, 100), 0.20),
            (neglect_component(row.get("prior9mReturn"), 20, 80), 0.15),
        ]
    )

    # Pillar 4 — close enough to launch that the setup is actionable, but not chased.
    trigger_readiness_score = (
        0.45 * band_score(breakout, -15, -6, 4, 10)
        + 0.30 * band_score(d10, -10, -4, 8, 14)
        + 0.15 * ramp(volume_ratio, 0.60, 2.00)
        + 0.10 * band_score(d30, -15, -5, 15, 24)
    )

    # Pillar 5 — Stage 1 and the first ~12 weeks of Stage 2 are the intended hunting
    # ground. Mature Stage 2 can still score but should not dominate discovery.
    if stage == 1:
        stage_freshness_score = 100.0
    elif stage == 2 and stage2_age <= 12:
        stage_freshness_score = 100.0
    elif stage == 2 and stage2_age <= 24:
        stage_freshness_score = 55.0
    elif stage == 2:
        stage_freshness_score = 15.0
    else:
        stage_freshness_score = 0.0

    score = (
        0.30 * reset_score
        + 0.25 * rs_turn_score
        + 0.20 * neglect_history_score
        + 0.15 * trigger_readiness_score
        + 0.10 * stage_freshness_score
    )

    # Hard guardrails are more important than cosmetic bonuses.  They stop a single
    # explosive RS/volume burst from outranking a stock that actually has a base.
    if base_weeks < 8:
        score = min(score - 12, 50)
    elif base_weeks < 12:
        score -= 5
    if rs_rank < 50:
        score = min(score - 10, 45)
    elif rs_rank < 55:
        score -= 10
    if rs_accel <= -0.25:
        score = min(score - 15, 55)
    elif rs_accel <= 0:
        score -= 15
    if d10 < -12:
        score = min(score - 8, 50)
    if breakout < -25:
        score = min(score, 50)
    if stage == 2 and stage2_age > 24:
        score -= 10
    if stage not in (1, 2):
        score = min(score, 30)
    if extended:
        score = min(score - 20, 35)
    score = round(clamp(score), 1)

    evidence_flags = {
        "Base reset": bool(base_weeks >= 16 and reset_score >= 55),
        "RS waking": bool(rs_rank >= 65 and rs_accel > 0),
        "Near trigger": bool(trigger_readiness_score >= 65),
        "Neglected history": bool(neglect_history_score >= 65),
        "Fresh stage": bool(stage == 1 or (stage == 2 and stage2_age <= 12)),
    }
    evidence_count = sum(evidence_flags.values())

    candidate = bool(
        score >= 60
        and evidence_count >= 4
        and stage in (1, 2)
        and not extended
        and base_weeks >= 12
        and rs_rank >= 60
        and rs_accel > 0
        and reset_score >= 45
        and trigger_readiness_score >= 55
    )
    a_plus = bool(candidate and score >= 68 and evidence_count == 5)

    reasons = []
    if evidence_flags["Base reset"]:
        reasons.append(f"Reset/base {reset_score:.0f}")
    if evidence_flags["RS waking"]:
        reasons.append(f"RS {rs_rank:.0f} accelerating")
    if evidence_flags["Neglected history"]:
        reasons.append(f"Neglect history {neglect_history_score:.0f}")
    if evidence_flags["Near trigger"]:
        reasons.append(f"Trigger readiness {trigger_readiness_score:.0f}")
    if evidence_flags["Fresh stage"]:
        reasons.append("Fresh Stage 1/2")
    if extended:
        reasons.append("Extended cap")
    elif base_weeks < 8:
        reasons.append("Base too young")
    elif rs_accel <= 0:
        reasons.append("RS not accelerating")

    return {
        "emergingLeaderScore": score,
        "opportunityScore": score,  # compatibility alias used by existing UI/sorts
        "resetScore": round(clamp(reset_score), 1),
        "rsTurnScore": round(clamp(rs_turn_score), 1),
        "neglectHistoryScore": round(clamp(neglect_history_score), 1),
        "triggerReadinessScore": round(clamp(trigger_readiness_score), 1),
        "stageFreshnessScore": round(clamp(stage_freshness_score), 1),
        "emergingEvidenceCount": int(evidence_count),
        "emergingEvidenceFlags": evidence_flags,
        "emergingLeaderCandidate": candidate,
        "aPlusEmergingSetup": a_plus,
        "emergingReasons": reasons[:6],
        # Backward compatibility only. UI should call this Evidence, not Confluence.
        "confluence": int(evidence_count),
        "perfect": a_plus,
    }
