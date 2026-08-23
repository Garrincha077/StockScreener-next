# StockScout Next Roadmap

## Baseline

StockScout Next was created as a standalone import of `Garrincha077/stock-screener2` from the last known green production baseline.

- Baseline commit: `ff2484303d1954480265c348c7be74126409e338`
- Stable source repo: `Garrincha077/stock-screener2`
- Next repo: `Garrincha077/StockScreener-next`
- Stable Full Validation source SHA: `fa2739c5463739389c05a7479d859063729a328c`
- Stable Full Validation run: `32314809594`

`stock-screener2` remains the production/stable line. StockScout Next is the development line.

## Product goal

Build a cleaner review-first StockScout without destabilizing the proven core. Reuse the best parts of the frozen original engine as independent confirmation evidence rather than blending them directly into Opportunity v2.

## Current development priority — daily operating reliability (2026-08-23)

The phase structure below remains valid, but Phase 6 empirical work is intentionally deprioritized until the daily StockScout Next operating workflow is trustworthy, transparent and polished in real use.

Current priority order:

1. **P0 — Workflow reliability**
   - harden the end-to-end path from Stable scan -> canonical snapshot -> Next projection -> LEGACY shadow -> charts -> validation -> Pages artifact -> deploy;
   - define explicit hard-failure vs warning behavior at each step;
   - never allow an older or mismatched dataset to look healthy merely because the UI loaded successfully.
2. **P0 — Scan provenance and data quality**
   - make the exact source scan authoritative and visible in the product, not only in GitHub Actions;
   - expose scan/session date, source `generatedAt`, Stable workflow run id, canonical source SHA and publication identity where available;
   - surface core/chart/LEGACY and other relevant coverage with explicit `HEALTHY`, `PARTIAL`, `STALE`, `MISMATCH` or `ERROR` semantics;
   - every major user-facing surface must be able to answer: **"Which scan are these data from?"** without guesswork.
3. **P1 — Review UX/UI polish**
   - optimize the daily desktop and mobile path: Screener -> Today/New -> Rapid Review -> chart -> watchlist/alert -> next ticker;
   - minimize clicks, preserve clear active scope/filter/sort state, remove overlaps and dead ends, and make loading/error/empty states deliberate;
   - support efficient keyboard review on laptop where it improves throughput without breaking native/editing controls.
4. **P2 — Resume Phase 6 empirical validation**
   - continue cohort measurement only after workflow, provenance/data-health and core review UX are sufficiently trustworthy for longitudinal observation.

This reprioritization does not change StockScout scoring or the frozen LEGACY contract. It changes development sequencing only. The Next automatic nightly scan remains disabled until the existing production-candidate gate is explicitly satisfied.

## Non-negotiable architecture rule

> LEGACY may observe StockScout candidates, but LEGACY must not mutate StockScout scoring unless separately validated and explicitly promoted.

The frozen original runtime remains immutable. New interpretation belongs in adapters / confirmation layers.

## Phase 0 — Freeze Stable v1

- Keep `stock-screener2` as production.
- Only bug fixes and operational repairs go back to Stable.
- Record the current green baseline SHA and production contracts.

Gate: current Stable Full Validation remains green.

## Phase 1 — Next bootstrap

- Keep the imported baseline behavior identical to Stable.
- Disable the automatic nightly production schedule in Next while development is in shadow/manual mode.
- Keep manual Full Validation available.
- Establish a separate Pages deployment only after the Next baseline is validated.

Gate: core outputs match Stable on the same canonical dataset.

## Phase 2 — Architecture cleanup

Refactor without behavioral changes:

- split the oversized frontend terminal into focused components/hooks;
- separate StockScout core, frozen LEGACY, confirmation adapter and UI concerns;
- centralize canonical field contracts;
- preserve existing saved screens / multisort behavior.

Gate: build, tests and invariant checks remain green; no score changes.

## Phase 3 — LEGACY shadow confirmation

Add a new append-only `legacyConfirmation` projection built from already captured frozen fields:

- original market gate;
- Minervini Trend Template;
- VCP quality / contraction anatomy;
- directional A/D volume;
- breakout type / level / volume confirmation;
- original R/R and risk;
- original SELL / failed-breakout risk.

Suggested statuses:

- `CONFIRMED`
- `EARLY`
- `NEUTRAL`
- `CONFLICT`
- `RISK`

The layer must not alter Opportunity, Emerging, MA Cluster, Group Leadership, Fundamentals, Stage or RS.

Gate: exact StockScout invariance before/after shadow enrichment.

## Phase 4 — Review UX v2

Prioritize workflow utility over new scoring models:

- Today / New Since Last Scan inbox;
- improved Rapid Review for mobile and large candidate sets;
- concise `Why this stock?` decomposition;
- one LEGACY confirmation badge with drill-down;
- scan / validation health banner.

Gate: mobile + desktop review works without losing current functionality.

## Phase 5 — Built-in discovery cohorts

Add screens rather than new blended scores:

- `Early Leaders` — StockScout strong, LEGACY not yet fully confirmed;
- `Confirmed Leaders` — StockScout strong + LEGACY confirmation;
- `Ahead of Minervini` — early StockScout structure before 7/8 TT confirmation;
- `Breakout Confirmed` — strong setup + original volume-confirmed breakout;
- `Watchlist Risk` — original SELL / failed-breakout warnings.

LEGACY fields may be selectable in Filter Builder and Multi Sort because the user explicitly chooses their influence. They do not enter default Opportunity v2.

## Phase 6 — Empirical validation

Track cohorts over time rather than deciding by intuition.

Primary cohorts:

1. StockScout PRIME/READY + LEGACY CONFIRMED
2. StockScout PRIME/READY + LEGACY EARLY
3. LEGACY BUY + low StockScout Opportunity
4. StockScout PRIME/READY + LEGACY RISK

Measure at minimum:

- 5D and 20D forward return;
- maximum favorable excursion;
- maximum adverse excursion;
- breakout success / failure;
- drawdown;
- cohort hit rate.

Gate: sufficient sample size and reproducible uplift.

## Phase 7 — Selective promotion

Only evidence with demonstrated incremental value may enter scoring.

If promoted:

- keep modifiers small and bounded;
- prefer independent information over duplicated evidence;
- document calibration and ablation results;
- preserve a shadow/raw field for auditability.

Default maximum proposed modifier: approximately +/-2 to +/-3 points until stronger evidence exists.

## Phase 8 — Production candidate

- Re-enable nightly schedule in Next only after shadow phases are stable.
- Require 10 consecutive green Full Validation runs.
- Compare Next against Stable on data coverage, charts, ranks and UI behavior.

Gate: 10/10 green, no unexplained invariant drift, no data regression.

## Phase 9 — Cutover

Preferred path:

- StockScout Next becomes production;
- `stock-screener2` remains frozen as a known-good fallback;
- avoid back-merging experimental complexity into Stable unless needed.

## Development priority order

The dated **Current development priority** section above takes precedence while the reliability/provenance/UX hardening cycle is active. The long-term architectural order remains:

1. Baseline protection
2. Shadow confirmation layer
3. Review UX
4. Cohort measurement
5. Only then model changes

Do not add new composite scores while a simpler screen, badge or explanatory field can express the same information.
