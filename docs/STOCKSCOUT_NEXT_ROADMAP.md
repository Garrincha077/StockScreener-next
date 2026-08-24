# StockScout Next Roadmap

## Baseline

StockScout Next was created as a standalone import of `Garrincha077/stock-screener2` from the last known green production baseline.

- Baseline commit: `ff2484303d1954480265c348c7be74126409e338`
- Stable source repo: `Garrincha077/stock-screener2`
- Next repo: `Garrincha077/StockScreener-next`
- Stable Full Validation source SHA: `fa2739c5463739389c05a7479d859063729a328c`
- Stable Full Validation run: `32314809594`

`stock-screener2` remains the production/stable line. StockScout Next is the development line.

## Current development priority — nightly sync P0 before Phase 6 (2026-08-25)

The daily operating-quality UX cycle is closed. The first real self-authored production-candidate Next nightly produced a valid 2026-08-24 scan, but failed only in post-scan Git persistence because generated unstaged/untracked files made the rebase working tree dirty. The exact validated scan was recovered and published without rerunning production scanning; the permanent prevention remains isolated on `next-dev` until required Full Validation passes.

Current priority order:

1. **P0 — Merge the dirty-worktree-safe nightly sync fix**
   - the Next production-candidate schedule is enabled at **21:30 UTC Monday-Friday**;
   - source run `32781812700` passed scan/session/canonical/model/LEGACY/chart gates and failed only at canonical branch sync;
   - recovery run `32786432875` reused that exact scan artifact, reverified invariants, rebuilt missing chart projections read-only, passed frontend build/chart validation and successfully deployed Pages;
   - permanent `next-dev` sync plumbing must pass required non-publishing Full Validation before merge to `main`; do not treat the recovery workflow as a substitute for validating the permanent helper.
2. **P0 — Next scheduled nightly end-to-end acceptance**
   - after the permanent sync fix is merged, the next real scheduled run must prove completed market session, authoritative `scanId`, source repository/ref/workflow run/attempt/SHA, canonical SHA + `generatedAt`, chart coverage >=95%, persisted canonical outputs and successful Pages publication through the normal nightly path;
   - the recovered 2026-08-24 snapshot is accepted as valid data/publication evidence, but the normal nightly sync path is not operationally accepted until a scheduled run completes it end to end.
3. **P0 — Publication transition cleanup after the normal nightly is green**
   - reassess the code-change Pages fallback path so a later code-only `main` push cannot overwrite an authoritative Next nightly with a Stable fallback snapshot;
   - keep Stable as explicit fail-safe, not an accidental publication winner;
   - any scan/data/workflow change requires Full Validation before merge.
4. **P1 — Review UX/UI polish — COMPLETE for this cycle**
   - accepted daily path: Screener -> Today/New -> Start/Resume -> Rapid Review / Why -> Watchlist / Chart / Ticker Alerts -> Continue / Next;
   - reviewed-state accounting remains coherent through laptop Space navigation;
   - active screen/review/rule/sort/match context remains visible on desktop/tablet/mobile;
   - mobile detail/chart controls and zero-result states have explicit browser acceptance coverage;
   - do not add another review-state mechanism by default. New UX work should require a concrete observed regression or measurable friction point.
5. **P2 — Resume Phase 6 empirical validation**
   - once the normal production-candidate nightly is operationally accepted and any transition-publication risk is resolved, resume longitudinal cohort measurement;
   - keep LEGACY shadow-only unless empirical evidence later justifies a separately reviewed promotion.

This priority sequence changes development order only. It does not change Opportunity v2, Emerging Leader, MA Cluster, Group Leadership, Fundamentals, RS, Stage, chart mapping or the frozen LEGACY contract.

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
- Keep manual Full Validation available.
- Establish and validate a separate Next Pages/publication path.

Historical note: the automatic Next nightly was disabled during shadow/manual development. It was explicitly promoted to a production-candidate schedule in PR #18 on 2026-08-23; this does not by itself constitute final production cutover. The schedule was subsequently moved to 21:30 UTC; operational acceptance still requires the normal nightly path to complete after the sync P0 fix.

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

**Status 2026-08-23: accepted/closed for the current P1 operating-quality cycle.** PRs #19-#24 added Start/Resume progress, review actions and continuation, shared watchlist behavior, queue-safe keyboard navigation, visible active context and final mobile/empty-state polish. Browser and StockScout invariance gates passed on each accepted slice.

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

- Production-candidate nightly schedule is enabled in Next after explicit promotion approval; the 2026-08-24 scan was recovered and published successfully after a post-scan sync failure, but the normal nightly path still requires one clean scheduled end-to-end run after the permanent fix.
- Maintain the intended requirement for a sustained green validation history before final cutover.
- Compare Next against Stable on data coverage, charts, ranks and UI behavior.

Gate for final production candidacy: sustained green validation, no unexplained invariant drift, no data regression, and verified self-authored nightly publication behavior through the normal path.

## Phase 9 — Cutover

Preferred path:

- StockScout Next becomes production;
- `stock-screener2` remains frozen as a known-good fallback;
- avoid back-merging experimental complexity into Stable unless needed.
