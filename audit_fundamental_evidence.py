#!/usr/bin/env python3
"""Report Fundamental Evidence coverage/distribution and simple relationships.

This is descriptive only. It does not tune thresholds or alter any ranking.
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "frontend" / "public" / "data" / "latest.json"


def main() -> None:
    payload = json.loads(OUT.read_text(encoding="utf-8"))
    rows = payload.get("universe") or []
    records = []
    for row in rows:
        score = row.get("fundamentalEvidenceScore")
        if score is None:
            continue
        records.append({
            "ticker": row.get("ticker"),
            "fund": score,
            "confidence": row.get("fundamentalEvidenceConfidence"),
            "coverage": row.get("fundamentalEvidenceCoverage"),
            "opportunity": row.get("opportunityScore"),
            "rsRank": row.get("rsRank"),
            "stage": row.get("stage"),
            "label": row.get("fundamentalEvidenceLabel"),
        })

    df = pd.DataFrame(records)
    print("=== Fundamental Evidence audit ===")
    print(f"Scored: {len(df):,}/{len(rows):,} ({(len(df)/len(rows)*100 if rows else 0):.1f}%)")
    if df.empty:
        return
    print("Score quantiles:", df["fund"].quantile([0, .1, .25, .5, .75, .9, 1]).round(1).to_dict())
    print("Confidence quantiles:", df["confidence"].dropna().quantile([0, .25, .5, .75, 1]).round(1).to_dict())
    print("Labels:", df["label"].value_counts(dropna=False).to_dict())
    for other in ("opportunity", "rsRank"):
        pair = df[["fund", other]].dropna()
        corr = pair["fund"].corr(pair[other], method="spearman") if len(pair) >= 10 else None
        print(f"Spearman fund vs {other}: {corr:.3f}" if corr is not None else f"Spearman fund vs {other}: n/a")
    print("Top evidence (score, confidence):")
    top = df.sort_values(["fund", "confidence"], ascending=False).head(20)
    for _, row in top.iterrows():
        print(f"  {row['ticker']}: {row['fund']:.1f} / conf {row['confidence']:.1f}% / stage {row['stage']} / opp {row['opportunity']}")


if __name__ == "__main__":
    main()
