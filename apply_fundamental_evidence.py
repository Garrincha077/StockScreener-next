#!/usr/bin/env python3
"""Attach StockScout Fundamental Evidence v1 to the canonical frontend dataset.

Runs after rich-layer enrichment. This script is intentionally non-invasive:
it never changes Opportunity, Confluence, setup tags, LEGACY outputs, or technical
scores. It only adds evidence fields derived from already-hydrated fundamentals.
"""
from __future__ import annotations

import json
from pathlib import Path

from fundamental_evidence import MODEL, score_fundamentals

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "frontend" / "public" / "data" / "latest.json"


def main() -> None:
    if not OUT.exists():
        raise SystemExit(f"Missing canonical dataset: {OUT}")

    payload = json.loads(OUT.read_text(encoding="utf-8"))
    universe = payload.get("universe") or []
    if not universe:
        raise SystemExit("Canonical dataset has no universe rows")

    scored = high_conf = strong = supportive = mixed = weak = 0
    for row in universe:
        before_opp = row.get("opportunityScore")
        before_conf = row.get("confluence")

        rich = row.get("richData") if isinstance(row.get("richData"), dict) else {}
        fundamentals = rich.get("fundamentals") if isinstance(rich.get("fundamentals"), dict) else {}
        age = rich.get("fundamentalsAgeDays")
        try:
            age = int(age) if age is not None else None
        except Exception:
            age = None

        evidence = score_fundamentals(fundamentals, age)
        rich["fundamentalEvidence"] = evidence
        row["richData"] = rich

        stockscout = row.get("stockscout") if isinstance(row.get("stockscout"), dict) else {}
        stockscout["fundamentalEvidence"] = {
            "model": evidence["model"],
            "score": evidence["score"],
            "label": evidence["label"],
            "coveragePct": evidence["coveragePct"],
            "confidencePct": evidence["confidencePct"],
            "confidence": evidence["confidence"],
            "groupScores": evidence["groupScores"],
            "affectsOpportunity": False,
        }
        row["stockscout"] = stockscout

        groups = evidence.get("groupScores") or {}
        row["fundamentalEvidenceScore"] = evidence["score"]
        row["fundamentalEvidenceCoverage"] = evidence["coveragePct"]
        row["fundamentalEvidenceConfidence"] = evidence["confidencePct"]
        row["fundamentalEvidenceLabel"] = evidence["label"]
        row["fundamentalGrowthScore"] = groups.get("growth")
        row["fundamentalMarginScore"] = groups.get("margins")
        row["fundamentalInventoryScore"] = groups.get("inventory")

        if evidence["score"] is not None:
            scored += 1
            label = evidence["label"].lower()
            if label == "strong": strong += 1
            elif label == "supportive": supportive += 1
            elif label == "mixed": mixed += 1
            elif label == "weak": weak += 1
        if evidence["confidencePct"] >= 70:
            high_conf += 1

        if row.get("opportunityScore") != before_opp or row.get("confluence") != before_conf:
            raise RuntimeError(f"Evidence model mutated ranking fields for {row.get('ticker')}")

    payload["fundamentalEvidenceModel"] = MODEL
    market = payload.setdefault("market", {})
    market["fundamentalEvidence"] = {
        "model": MODEL,
        "rows": len(universe),
        "scored": scored,
        "coveragePct": round(scored / len(universe) * 100.0, 1) if universe else 0,
        "highConfidence": high_conf,
        "labels": {"strong": strong, "supportive": supportive, "mixed": mixed, "weak": weak},
        "affectsOpportunity": False,
    }

    tmp = OUT.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    tmp.replace(OUT)
    print(
        f"Fundamental Evidence ready: scored={scored:,}/{len(universe):,}; "
        f"high-confidence={high_conf:,}; strong={strong:,}; supportive={supportive:,}; "
        f"mixed={mixed:,}; weak={weak:,}; Opportunity unchanged"
    )


if __name__ == "__main__":
    main()
