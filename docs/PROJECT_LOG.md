# StockScout Next — Persistent Project Log

This file is the durable handoff for future agents. Keep entries concise and factual. GitHub state plus this log is authoritative when chat history differs.

## 2026-08-20 — Baseline and governance

- Repository: `Garrincha077/StockScreener-next`; Stable fallback: `Garrincha077/stock-screener2`.
- Imported Stable baseline: `ff2484303d1954480265c348c7be74126409e338`; Stable Full Validation source SHA `fa2739c5463739389c05a7479d859063729a328c`, run `32314809594`.
- Next automatic nightly schedule was disabled; manual/reusable validation remains available.
- `next-dev` is the experimental branch; `main` is the controlled Next baseline.
- Protected StockScout Core: Opportunity v2, Emerging Leader, MA Cluster, Group Leadership, Fundamentals, RS, Stage and chart mapping.
- Frozen LEGACY remains immutable and shadow/read-only; it may observe/classify but may not mutate StockScout scoring.
- Added `AGENTS.md`, roadmap, guardrails and core-invariance auditing.

## 2026-08-20 — Phase 3 LEGACY shadow confirmation

- Added read-only confirmation adapter, compact sidecar and client projection from already-captured frozen LEGACY outputs.
- Approved statuses: `CONFIRMED`, `EARLY`, `NEUTRAL`, `CONFLICT`, `RISK`; missing data remains `UNAVAILABLE`.
- Added `audit_legacy_confirmation_shadow.py`; protected StockScout fields and chart mapping are exact-invariance gated.
- Client exposes only compact confirmation status/reasons; detailed evidence remains in existing frozen `originalEngine` data.
- Clean validated Phase 3 SHA: `ac7e66f6babf35de8616a1928ebabc4ffaf62a9a`.
- Full Validation `32355696983`: **success**.
- Validated 2,013-row shadow distribution: CONFIRMED 620, EARLY 236, NEUTRAL 984, RISK 173; 0 Core invariance errors.
- Full Validation was hardened to use `persist_outputs: false`, `deploy_pages: false`; status recorder was branch-isolated so non-main validation cannot mutate `main`.
- Stable was not modified; Next nightly remained disabled.

## 2026-08-20 — Phase 4 Review UX v2

- Added Today / New Since Last Scan review inbox, transparent `Why this stock?`, data/snapshot health strip, Prev/Next review queue, active-ticker sync, reviewed/unseen session progress, Rapid Review improvements, and mobile + desktop browser coverage.
- No scoring, ranking, scanner, data writer or frozen LEGACY behavior changed.
- Final Phase 4 validated code SHA: `45ae494ebce282d6e73d592d7345a3d1381646e9`.
- Frontend Compile Smoke `32363419613`: **success**, Pixel 5 + Desktop Chrome passed.
- StockScout Validation `32363419707`: **success**.
- No new Full Validation because Phase 4 was frontend/test-only.

## 2026-08-20 — Phase 5 built-in discovery cohorts

- Added five transparent built-in screens rather than a new blended score:
  - `Early Leaders`: existing strong StockScout rules + LEGACY EARLY/NEUTRAL/CONFLICT.
  - `Confirmed Leaders`: existing strong StockScout rules + LEGACY CONFIRMED.
  - `Ahead of Minervini`: `emergingLeaderCandidate=true`, original TT passes `<7`, not extended, excluding RISK.
  - `Breakout Confirmed`: existing strong StockScout rules + original volume-confirmed breakout.
  - `Watchlist Risk`: original emitted SELL observation.
- Existing strong StockScout definition reused exactly: Opportunity >=80, Opportunity Rank >=90, `extended=false`.
- No LEGACY field entered default Opportunity v2 or default ranking.
- Native Node TypeScript import issue was repaired without semantic changes.
- Final Phase 5 head before promotion: `28946abf4f880cf3a7c081de9f96cf5c7abbc5bf`.
- Frontend Compile Smoke `32369432855`: **success**.
- StockScout Validation `32369432770`: **success**.
- PR #1 merged to Next `main` as `d104726cd56f7d0f100b2bbd6a75857e20a2f7e2`; documentation promotion commit `29cd76e01ae2332ea02b123ffdcaa0f40231ac5c`.
- `main` subsequently recorded Full Validation status at `e956e11c8db4e5439f9437ebecbcc9761719da3a`.
- Stable remained untouched; Next nightly remained disabled.

## 2026-08-21 — Fresh-data gap identified

- Stable produced a newer post-market scan commit `8c7d3cefc2029b448ce4e6ec49c735090832dff6`, workflow `32422201734`.
- Stable scan metadata: `2026-08-20T22:12:33.512222+00:00`; canonical payload `generatedAt=2026-08-20T22:09:11.073071+00:00`.
- Next `main` still carried the prior snapshot (`generatedAt=2026-08-19T23:57:38.758884+00:00`).
- Root cause: `frontend_pages.yml` deploys the canonical snapshot already committed in Next `main`; it does not import the latest Stable snapshot.
- Decision: do **not** re-enable Next nightly scanning. First validate a one-way read-only Stable -> Next data bridge.

## 2026-08-21 — Read-only Stable snapshot bridge validation

**Branch / PR / commits**
- `next-dev` was fast-forwarded from its old Phase 5 head to current validated `main`; before the fast-forward it was 0 commits ahead and 8 behind, so no unpromoted Codex work was overwritten.
- Added validation workflow: `f4e84a72bfa9d04cc92d66fff0e937d1060ef850`.
- Full Validation trigger wiring: `4d4b7064da0a6c19e46b850ddc51c20c1b099fd9`.
- PR-trigger visibility for the bridge: `0f05b427895ae9a4cefeb1144b0c9f99e4fb965c`.
- Draft PR #4: `next-dev` -> `main`; intentionally unmerged.

**What changed / why**
- Added `.github/workflows/validate_stable_snapshot_sync.yml`.
- The workflow downloads Stable `latest.json` + scan metadata using GET requests only, swaps the canonical file only inside a disposable Actions workspace, runs LEGACY/Core invariance, rebuilds Next client/shadow payloads, and runs frontend tests/typecheck/build.
- Workflow token permissions are `contents: read`; it contains no commit/push step and cannot write Stable or Next `main`.
- `.github/workflows/stockscout_full_validation.yml` now treats this bridge workflow as a Full Validation trigger because it is a data/workflow-path change.

**Behavior / scoring impact**
- No scanner, StockScout model, Opportunity score, ranking, Stage, RS, chart mapping or frozen LEGACY code changed.
- No canonical snapshot was committed by the bridge.
- No Pages deployment changed.
- Stable `stock-screener2` remained read-only and unmodified.
- Next scheduled nightly scan remains disabled.

**Validation result**
- `Validate Stable Snapshot Sync` PR run `32452561269`: **success**.
- It consumed Stable workflow `32422201734`, `generatedAt=2026-08-20T22:09:11.073071+00:00`, universe 2,011.
- LEGACY shadow audit on the fresh snapshot: PASS; 0 Core invariance errors; chart shards identical.
- Fresh shadow distribution: CONFIRMED 575, EARLY 182, NEUTRAL 1,031, RISK 223; all 2,011 rows available.
- Client projection preserved the downloaded canonical SHA and built successfully; frontend Node suite reported 19/19 tests passing, TypeScript/Vite build succeeded.
- StockScout Validation PR run `32452561337`: **success**, including Stable snapshot restore, frozen LEGACY graph, regression/integration, current model stack, compatibility, MA Cluster, Scout Tier, exact shadow/Core invariance and frontend build.
- A Full Validation was triggered by the workflow-path change, but its new completion/status record had not yet appeared when this entry was written; **do not claim the new Full Validation green until its run/status is explicitly verified**.

**Risk / decision**
- Keep PR #4 draft and unmerged until the triggered Full Validation is explicitly verified.
- The validated bridge proves compatibility only; it does not yet make public Next Pages automatically current.
- Do not add write access to Stable and do not turn on Next nightly scanning to solve freshness.

**Next logical step**
- Verify the triggered Full Validation result. If green, design the smallest reversible promotion that refreshes Next public data from Stable while retaining one-way read-only Stable access, then begin Phase 6 cohort outcome tracking on those fresh snapshots.
