# StockScout Next Regression Guardrails

## Purpose

StockScout Next is allowed to evolve aggressively at the UI / evidence layer while protecting the proven StockScout core. Every new LEGACY-derived feature starts in shadow mode.

## Protected Stable baseline

Imported baseline commit:

`ff2484303d1954480265c348c7be74126409e338`

The baseline was produced after a successful end-to-end Full Validation in the Stable repository.

## Core invariance contract

Before a shadow-only LEGACY change can be accepted, the same canonical input must preserve these existing StockScout outputs exactly unless the change explicitly targets one of them:

- `opportunityScore`
- `opportunityPotential`
- `opportunityTiming`
- `opportunityRank`
- `opportunityTier`
- `emergingLeaderScore`
- `maClusterScore`
- `maClusterPhase`
- `maClusterTier`
- `groupRank`
- `groupConfidence`
- `fundamentalEvidenceScore`
- `stage`
- `rsRank`
- `leadershipScore`
- chart shard mapping / chart coverage

For pure confirmation/UI changes, numerical drift is not permitted.

## Frozen LEGACY contract

The source methodology under the frozen LEGACY layer must remain reproducible from the pinned upstream baseline:

`2fce788b7c95e595bdbb012bd35d3a92fcc49e5a`

Do not modify original thresholds, scoring formulas or emission rules in place. New behavior must be implemented outside the frozen source, normally in a new adapter such as `compute_legacy_confirmation.py`.

## Append-only confirmation contract

A LEGACY confirmation step may:

- read StockScout and frozen LEGACY fields;
- add new `legacyConfirmation*` fields;
- add market-level confirmation summaries;
- expose those fields to UI, filters and explicit Multi Sort choices.

It must not:

- rewrite Opportunity fields;
- rewrite Emerging Leader fields;
- rewrite MA Cluster fields;
- rewrite Group Leadership fields;
- rewrite Fundamental Evidence fields;
- change Stage or RS values;
- silently alter default ranking.

## Failure isolation

The confirmation layer should be designed so a failure is diagnosable and does not corrupt the canonical core dataset.

Preferred pattern:

1. load canonical payload;
2. compute confirmation fields in memory;
3. validate confirmation schema;
4. write atomically;
5. run core-invariance audit;
6. build frontend.

Never partially write the canonical dataset before validation.

## Promotion rule

No LEGACY signal may influence default Opportunity v2 merely because it appears sensible.

Promotion requires:

1. shadow observation period;
2. cohort measurement;
3. incremental-value / ablation evidence;
4. explicit documented decision;
5. bounded effect;
6. fresh Full Validation.

Until then LEGACY is a second opinion, not an input to the default score.

## Required CI direction

Add automated checks in this order:

1. frozen LEGACY baseline verification;
2. existing StockScout unit/regression tests;
3. confirmation-layer unit tests;
4. core-invariance comparison;
5. canonical dataset audit;
6. frontend typecheck/build;
7. chart coverage validation;
8. manual Full Validation during development.

## Production promotion gate

Historical default: the automatic Next nightly scan stays disabled until the repository owner explicitly promotes Next to production-candidate operation.

### Explicit promotion decision — 2026-08-23

The repository owner explicitly promoted StockScout Next to production-candidate nightly operation and authorized re-enabling the automatic weekday post-market scan. That explicit decision satisfies the project-level disabled-nightly guardrail for this promotion.

The prior target of 10 consecutive green Full Validation runs remains useful evidence but is no longer a blocking prerequisite for this owner-approved promotion. The enabling change itself still requires a fresh green Full Validation before merge.

Nightly operation is permitted only while all of these controls remain true:

- schedule is after the completed US regular session;
- scheduled runs persist canonical outputs and deploy Pages only after canonical/model/LEGACY/chart gates pass;
- chart coverage is a hard publish gate at >=95%;
- reusable Full Validation scans remain non-persistent and non-deploying;
- canonical `latest.json` is never mutated by projection/provenance stamping;
- manifest provenance identifies the exact scan workflow run, canonical SHA and publication run;
- frozen LEGACY remains shadow-only and does not alter StockScout scoring;
- `Garrincha077/stock-screener2` remains the stable fallback and is not modified by Next promotion work.

If unexplained core drift appears, publication identity becomes inconsistent, or repeated nightly publication failures occur, disable the Next schedule and return to manual/read-only operation until the failure is understood and revalidated.
