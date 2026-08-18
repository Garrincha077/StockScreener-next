#!/usr/bin/env python3
"""Print a compact calibration audit for the canonical StockScout dataset."""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path
from statistics import median

from audit_group_leadership import main as audit_group_leadership

DATA = Path("frontend/public/data/latest.json")


def num(row, key, default=0.0):
    try:
        value = row.get(key, default)
        return float(default if value is None else value)
    except Exception:
        return float(default)


def q(values, p):
    vals = sorted(float(v) for v in values)
    if not vals:
        return 0.0
    idx = int(round((len(vals) - 1) * p))
    return vals[max(0, min(len(vals) - 1, idx))]


def fmt(values):
    vals = list(values)
    if not vals:
        return "n=0"
    return f"n={len(vals)} med={median(vals):.1f} p25={q(vals,.25):.1f} p75={q(vals,.75):.1f}"


def main():
    if not DATA.exists():
        raise SystemExit(f"Missing {DATA}")

    payload = json.loads(DATA.read_text(encoding="utf-8"))
    rows = payload.get("universe") or []
    print(f"ROWS {len(rows)}")
    print(f"FEATURE_MODEL {payload.get('featureModel')}")

    primary = Counter(str(r.get("primarySetup") or r.get("setup") or "Unknown") for r in rows)
    tags = Counter(t for r in rows for t in (r.get("setupTags") or []))
    print("\nPRIMARY SETUPS")
    for name, count in primary.most_common():
        print(f"  {name}: {count}")

    print("\nTAGS")
    for name, count in tags.most_common():
        print(f"  {name}: {count}")

    scored = [r for r in rows if "opportunityScore" in r]
    opp = [num(r, "opportunityScore") for r in scored]
    print("\nOPPORTUNITY", fmt(opp))
    print(f"  >=80: {sum(v >= 80 for v in opp)}")
    print(f"  >=70: {sum(v >= 70 for v in opp)}")
    print(f"  >=60: {sum(v >= 60 for v in opp)}")

    ranked = sorted(scored, key=lambda r: (num(r, "opportunityScore"), num(r, "confluence")), reverse=True)
    for n in (25, 50, 100):
        top = ranked[:n]
        if not top:
            continue
        extended = sum(bool(r.get("extended")) for r in top)
        too_far = sum(num(r, "distance10w") > 12 for r in top)
        weak_rs = sum(num(r, "rsRank") < 70 for r in top)
        mature_s2 = sum(int(num(r, "stage")) == 2 and num(r, "stage2AgeWeeks") > 12 for r in top)
        no_accel = sum(num(r, "rsAcceleration") <= 0 for r in top)
        print(
            f"TOP{n} quality: extended={extended}/{n} dist10w>12={too_far}/{n} "
            f"RS<70={weak_rs}/{n} matureS2={mature_s2}/{n} RSaccel<=0={no_accel}/{n}"
        )

    grouped = defaultdict(list)
    for row in scored:
        for tag in row.get("setupTags") or [row.get("primarySetup") or "Unknown"]:
            if str(tag).startswith("⚠"):
                continue
            grouped[str(tag)].append(row)

    print("\nSETUP DIAGNOSTICS")
    for name in sorted(grouped):
        group = grouped[name]
        ext = [abs(num(r, "distance10w")) for r in group]
        rsrank = [num(r, "rsRank") for r in group]
        accel = [num(r, "rsAcceleration") for r in group]
        volume = [num(r, "volumeRatio", 1) for r in group]
        prior = [num(r, "prior9mReturn") for r in group]
        opps = [num(r, "opportunityScore") for r in group]
        extended = sum(bool(r.get("extended")) for r in group)
        print(
            f"  {name}: n={len(group)} oppMed={median(opps):.0f} "
            f"RSmed={median(rsrank):.0f} accelMed={median(accel):.3f} "
            f"volMed={median(volume):.2f} |10W|med={median(ext):.1f}% "
            f"prior9mMed={median(prior):.1f}% extended={extended}"
        )

    print("\nEARLY-LEADER PROFILE")
    early = [
        r for r in scored
        if int(num(r, "stage")) in (1, 2)
        and num(r, "rsRank") >= 70
        and num(r, "rsAcceleration") > 0
        and -8 <= num(r, "distance10w") <= 10
        and num(r, "volumeRatio", 1) >= 1.2
        and not bool(r.get("extended"))
        and (int(num(r, "stage")) == 1 or num(r, "stage2AgeWeeks") <= 12)
    ]
    early.sort(key=lambda r: (num(r, "opportunityScore"), num(r, "confluence")), reverse=True)
    print(f"  count={len(early)}")
    for r in early[:20]:
        print(
            f"  {r.get('ticker'):5s} opp={num(r,'opportunityScore'):3.0f} "
            f"S{int(num(r,'stage'))} age={num(r,'stage2AgeWeeks'):4.1f}w "
            f"RS={num(r,'rsRank'):2.0f} accel={num(r,'rsAcceleration'):+.3f} "
            f"vol={num(r,'volumeRatio',1):.2f} d10w={num(r,'distance10w'):+.1f}% "
            f"prior9={num(r,'prior9mReturn'):+.1f}% {r.get('primarySetup')}"
        )

    print("\nGROUP LEADERSHIP V2 GUARDRAIL")
    group_status = audit_group_leadership()
    if group_status:
        raise SystemExit(group_status)


if __name__ == "__main__":
    main()
