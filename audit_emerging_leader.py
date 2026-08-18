#!/usr/bin/env python3
"""Audit canonical Neglected → Emerging Leader score invariants."""
from __future__ import annotations

import json
import math
from pathlib import Path

DATA = Path("frontend/public/data/latest.json")
MODEL = "neglected-emerging-leader-v1"
REQUIRED = (
    "emergingLeaderScore",
    "resetScore",
    "rsTurnScore",
    "neglectHistoryScore",
    "triggerReadinessScore",
    "stageFreshnessScore",
    "emergingEvidenceCount",
    "emergingLeaderCandidate",
    "aPlusEmergingSetup",
    "emergingReasons",
)


def finite(value):
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except Exception:
        return None


def main():
    if not DATA.exists():
        print(f"Missing {DATA}")
        return 1

    payload = json.loads(DATA.read_text(encoding="utf-8"))
    rows = payload.get("universe") or []
    if payload.get("emergingLeaderModel") != MODEL:
        print(f"Emerging Leader model mismatch: {payload.get('emergingLeaderModel')}")
        return 1
    if not rows:
        print("No universe rows")
        return 1

    errors = []
    present = 0
    for row in rows:
        ticker = str(row.get("ticker") or "?")
        if all(key in row for key in REQUIRED):
            present += 1
        else:
            missing = [key for key in REQUIRED if key not in row]
            errors.append(f"{ticker}: missing {missing}")
            continue

        score = finite(row.get("emergingLeaderScore"))
        opp = finite(row.get("opportunityScore"))
        evidence = finite(row.get("emergingEvidenceCount"))
        confluence = finite(row.get("confluence"))
        pillars = [
            finite(row.get("resetScore")),
            finite(row.get("rsTurnScore")),
            finite(row.get("neglectHistoryScore")),
            finite(row.get("triggerReadinessScore")),
            finite(row.get("stageFreshnessScore")),
        ]
        if score is None or not 0 <= score <= 100:
            errors.append(f"{ticker}: invalid emerging score {score}")
            continue
        if any(v is None or not 0 <= v <= 100 for v in pillars):
            errors.append(f"{ticker}: invalid pillar(s) {pillars}")
        if opp is None or abs(score - opp) > 1e-9:
            errors.append(f"{ticker}: opportunity compatibility alias diverged ({opp} vs {score})")
        if evidence is None or evidence < 0 or evidence > 5 or int(evidence) != evidence:
            errors.append(f"{ticker}: invalid evidence count {evidence}")
        if confluence is None or evidence is None or confluence != evidence:
            errors.append(f"{ticker}: legacy confluence alias diverged ({confluence} vs {evidence})")

        extended = bool(row.get("extended"))
        base_weeks = finite(row.get("baseWeeks")) or 0.0
        accel = finite(row.get("rsAcceleration")) or 0.0
        rs = finite(row.get("rsRank")) or 0.0
        stage = int(finite(row.get("stage")) or 0)
        age = finite(row.get("stage2AgeWeeks")) or 0.0
        reset = finite(row.get("resetScore")) or 0.0
        trigger = finite(row.get("triggerReadinessScore")) or 0.0

        if extended and score > 35.01:
            errors.append(f"{ticker}: extended score cap violated ({score})")
        if base_weeks < 8 and score > 50.01:
            errors.append(f"{ticker}: young-base score cap violated ({score})")
        if accel <= -0.25 and score > 55.01:
            errors.append(f"{ticker}: negative-RS-acceleration cap violated ({score})")
        if stage not in (1, 2) and score > 30.01:
            errors.append(f"{ticker}: off-regime score cap violated ({score})")

        candidate = bool(row.get("emergingLeaderCandidate"))
        if candidate:
            gate_ok = (
                score >= 60
                and evidence is not None and evidence >= 4
                and stage in (1, 2)
                and not extended
                and base_weeks >= 12
                and rs >= 60
                and accel > 0
                and reset >= 45
                and trigger >= 55
            )
            if not gate_ok:
                errors.append(f"{ticker}: candidate violates gate")

        a_plus = bool(row.get("aPlusEmergingSetup"))
        if a_plus and not (candidate and score >= 68 and evidence == 5):
            errors.append(f"{ticker}: A+ setup violates gate")
        if stage == 2 and age > 12 and bool((row.get("emergingEvidenceFlags") or {}).get("Fresh stage")):
            errors.append(f"{ticker}: mature Stage 2 marked fresh")

    coverage = present / len(rows) * 100.0
    if coverage < 95:
        errors.append(f"Required-field coverage too low: {coverage:.1f}%")

    market = payload.get("market") or {}
    candidate_count = sum(bool(r.get("emergingLeaderCandidate")) for r in rows)
    a_plus_count = sum(bool(r.get("aPlusEmergingSetup")) for r in rows)
    if int(market.get("emergingLeaderCandidates", -1)) != candidate_count:
        errors.append("Market emergingLeaderCandidates count mismatch")
    if int(market.get("aPlusEmergingSetups", -1)) != a_plus_count:
        errors.append("Market aPlusEmergingSetups count mismatch")

    print(
        f"Emerging Leader audit: rows={len(rows)} coverage={coverage:.1f}% "
        f"candidates={candidate_count} A+={a_plus_count} errors={len(errors)}"
    )
    for error in errors[:30]:
        print(f"  ERROR {error}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
