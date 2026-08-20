# StockScout Next — Persistent Project Log

This file is the durable handoff for future agents. Update it after every meaningful code/workflow change. Keep entries concise and factual.

## 2026-08-20 — Project bootstrap

**Baseline**
- New standalone repo imported from `Garrincha077/stock-screener2`.
- Imported `main` matched stable production commit `ff2484303d1954480265c348c7be74126409e338`, which followed the successful Full Validation run and fresh post-market scan.
- `StockScreener-next` is development; `stock-screener2` remains production/stable fallback.

**Workflow isolation**
- Commit `fc0ead00d69c0be46c54702c19586d2646e68ed1` removed only the scheduled cron trigger from `.github/workflows/daily_screening_git_storage.yml`.
- Manual `workflow_dispatch` and reusable `workflow_call` remain available.
- No scan/scoring steps were changed by this isolation change.

**Governance / roadmap**
- Added `docs/STOCKSCOUT_NEXT_ROADMAP.md`.
- Added `docs/STOCKSCOUT_NEXT_GUARDRAILS.md`.
- Added executable core-invariance audit `audit_next_core_invariance.py` and tests for append-only/shadow development.
- Created `next-dev` for experimental work.

**Architecture decision**
- StockScout Core stays authoritative for Opportunity v2 / Emerging / MA Cluster / Groups / Fundamentals / RS / Stage.
- Original/LEGACY remains frozen.
- First major Next feature should be a read-only `legacyConfirmation` shadow adapter. It must not change Opportunity or other core scores.

**Next logical step**
- Implement the LEGACY Confirmation shadow layer on `next-dev`, with explicit invariance tests before UI integration.

## 2026-08-20 — LEGACY shadow adapter foundation

**Branch / commits**
- Branch: `next-dev`.
- Adapter: `7b93210bf50ada5156251f5a267521cb18b46800`.
- Tests: `c99346586728cdaffec1f36908425c255d5910b2`.

**What changed / why**
- Added `compute_legacy_confirmation.py` as a pure read-only adapter for already-observed frozen LEGACY output.
- The adapter normalizes only the approved shadow statuses `CONFIRMED`, `EARLY`, `NEUTRAL`, `CONFLICT`, `RISK`; missing or unknown status stays `UNAVAILABLE` rather than being reconstructed.
- Added explicit `observed` / `unavailable` provenance and append-only `legacyConfirmation` attachment to a deep-copied StockScout candidate.

**Affected files / components**
- `compute_legacy_confirmation.py`.
- `tests/test_compute_legacy_confirmation.py`.
- No scanner, canonical data writer, workflow, frontend, scoring module or frozen LEGACY source was wired or modified.

**Scoring / behavior impact**
- No StockScout Core scoring, ranking, buckets, Stage, RS or chart mapping changed.
- No runtime scan behavior changed; this is an isolated foundation for shadow-mode integration.

**Tests / audits / CI**
- Targeted local pytest against the committed adapter/test logic: `5 passed`.
- Coverage includes unavailable LEGACY, observed normalization, no status invention, no candidate mutation and compatibility with `compare_payloads()` core-invariance contract.
- Full Validation not run because this change does not touch scan/data/workflow runtime paths.
- No GitHub Actions run was available for commit `c99346586728cdaffec1f36908425c255d5910b2`; CI therefore is not claimed green.

**Risk / decision**
- The adapter intentionally does not infer LEGACY status from raw evidence yet; doing so before mapping the frozen observed fields would risk silently creating a new methodology.
- `stock-screener2` was not modified and Next nightly scheduling remains disabled.

**Next logical step**
- Map the actual already-captured frozen LEGACY fields into this adapter, then run the adapter against a canonical payload in shadow mode and verify exact before/after core invariance before any UI badge/filter wiring.

## 2026-08-20 — Captured LEGACY mapping + canonical shadow invariance gate

**Branch / commits**
- Branch: `next-dev`.
- Captured-output classifier: `ddd29e5429dc44cb7df119113f8e5e1bfa38604d`.
- Expanded regression tests: `56b3df25938f845ed33b6fe5b74369c856f006a1`.
- Read-only canonical audit: `2c33403783e16bc6add7efc940c2e2afee6fdb91`.
- Compact persistence refactor: `8990ae9d84d960badb13f203111e670e1f24078e`.

**What changed / why**
- Mapped the confirmation layer to already-captured frozen outputs under `originalEngine` and the flat `original*` fields; no frozen LEGACY function or threshold was modified.
- Added deterministic non-numeric status precedence: emitted original SELL -> `RISK`; emitted original BUY -> `CONFIRMED`; raw original BUY/SELL not emitted -> `CONFLICT`; frozen Trend Template/VCP/breakout booleans -> `EARLY`; otherwise captured rows -> `NEUTRAL`; missing capture -> `UNAVAILABLE`.
- Detailed in-memory evidence exposes original market gate, Minervini TT, VCP contraction anatomy, A/D volume, breakout, original R/R/risk and SELL/failed-breakout evidence.
- Persistable `legacyConfirmation` is intentionally compact and points back to `market.originalSignalGate` / `originalEngine` instead of duplicating the full evidence tree.
- Added `audit_legacy_confirmation_shadow.py`, which enriches only in memory and fails on any protected StockScout or chart-mapping drift.

**Affected files / components**
- `compute_legacy_confirmation.py`.
- `tests/test_compute_legacy_confirmation.py`.
- `audit_legacy_confirmation_shadow.py`.
- No scanner, canonical writer, frontend, workflow or frozen LEGACY source was changed.

**Scoring / behavior impact**
- `legacyConfirmation` remains shadow-only and explicitly carries `affectsStockScout: false`.
- No Opportunity v2, Emerging Leader, MA Cluster, Group Leadership, Fundamentals, Stage, RS, default rank or chart mapping was changed.
- Canonical `frontend/public/data/latest.json` was not written or committed by this work.

**Tests / audits / CI**
- Targeted local pytest after captured-field mapping: `15 passed`.
- Read-only audit was run against the real GitHub Pages snapshot produced by successful Stable Full Validation run `32314809594` (head SHA `fa2739c5463739389c05a7479d859063729a328c`, generatedAt `2026-08-19T23:57:38.758884+00:00`).
- Snapshot: 2,013 universe rows; frozen LEGACY complete-source coverage 2,013/2,013; capture errors 0; original-run BUY 620; original-run SELL 173.
- Shadow result: `CONFIRMED 620`, `EARLY 236`, `NEUTRAL 984`, `RISK 173`, `CONFLICT 0`, `UNAVAILABLE 0`.
- Core-invariance errors: `0`; chart shard mapping identical; source payload remained unchanged in memory.
- Compact append-only serialization estimate: +0.884 MB (~2.14%) versus +3.48 MB for duplicated detailed evidence.
- This was not a fresh Full Validation run of the new adapter code; CI is therefore not claimed green.

**Risk / decision**
- Do not persist duplicated detailed evidence into the already-large canonical payload; reuse existing `originalEngine` as the drill-down source.
- Keep confirmation classification boolean/emission-based. No new composite score or threshold calibration was introduced.
- Stable was only read via its successful Pages artifact; `stock-screener2` was not modified. Next nightly scheduling remains disabled.

**Next logical step**
- Materialize the compact confirmation as a separate reversible shadow artifact/sidecar (preferred over inflating canonical `latest.json`), validate it against the same canonical input, then wire one read-only badge/filter in the frontend before broader Phase 4 UX work.

## 2026-08-20 — Compact LEGACY confirmation sidecar foundation

**Branch / commits**
- Branch: `next-dev`.
- Sidecar builder: `ef672ebeb023c844e0a2167dba827541542beadc`.
- Sidecar tests: `7917efaa3c883b5fd6ba0dd2dd0dfab73cf1aefb`.

**What changed / why**
- Added `build_legacy_confirmation_sidecar.py` to build a separate compact shadow artifact from the canonical payload without modifying it.
- Sidecar stores only ticker -> `status`, `available`, `reasons`, plus source metadata and market-gate state; detailed evidence remains in canonical `originalEngine`.
- Atomic writer is available for later pipeline wiring, but no generated sidecar data was committed and no workflow invokes it yet.

**Affected files / components**
- `build_legacy_confirmation_sidecar.py`.
- `tests/test_legacy_confirmation_sidecar.py`.
- No scanner, canonical dataset, frontend or GitHub Actions workflow changed.

**Scoring / behavior impact**
- None. Sidecar is read-only shadow metadata with `affectsStockScout: false` and has no ranking/scoring path.

**Tests / audits / CI**
- Combined targeted local suite: `17 passed`.
- Built the sidecar locally from the same real 2,013-row Full Validation snapshot used by the canonical shadow audit.
- Result size: `166,859 bytes` (~163 KB), with counts `CONFIRMED 620`, `EARLY 236`, `NEUTRAL 984`, `RISK 173`.
- Source canonical payload remained unchanged; no generated sidecar file was committed.
- No fresh Full Validation and no GitHub Actions CI run of these new files is claimed.

**Risk / decision**
- Prefer sidecar delivery over adding ~0.884 MB of repeated confirmation metadata to the already-large canonical `latest.json`.
- Keep drill-down sourced from existing `originalEngine`; do not duplicate evidence in the sidecar.
- Stable remains untouched and Next scheduled nightly scan remains disabled.

**Next logical step**
- Wire sidecar generation into the Next-only deploy/validation path and add a single read-only LEGACY confirmation badge/filter in the frontend. Because this touches workflow/frontend behavior, require a fresh Full Validation before treating the integration as validated.

## 2026-08-20 — LEGACY shadow badge/filter + client/deploy integration

**Branch / PR / key commits**
- Branch: `next-dev`.
- Draft validation PR: `#1` (`next-dev` -> `main`); intentionally not merged.
- Client projection + sidecar publish: `60be29fdce4a6dbe43eeb88d19fce50b12bf1ad2`; tests: `c0b7be9812ae9029d0334c56cc4dc5531c9a1941`.
- Filter field registration: `301e99a982d6e5da7d7467fdc078251f98607a8a`.
- Snapshot-safe badge: `e6f59079cdcab4d34707c06e8f920f37c1794a1a`; Root/UI wiring through `c9bb529e070a0c672aa40c2bad618bbe3b17612c` and `6bd4d201df03da791ad45ff7e7c985ceee4e6007`.
- Pages/compile/StockScout validation wiring: `7bb46b1aa83e85ef14010e75e0ecf5e060770562`, `3450b93fa67f936fde679502aa5a72f5a9c635a8`, `d8aaffbe1a311104225427b6df48db4937a477c8`.
- Validation workflow source fix: `7d24d28d1eb4cf56de2c5c34c8fbc30aba4822cc`.
- Final Full Validation trigger head before this log entry: `27c9c84bbf042e8f302e25e8c7bc549e116e1c12`.

**What changed / why**
- `prepare_frontend_payloads.py` now derives `core.json`, `manifest.json` and compact `shadow/legacy-confirmation.json` from the exact same canonical `latest.json` snapshot; canonical bytes are checked before/after and never rewritten.
- `core.json` receives only `legacyConfirmationStatus` + `legacyConfirmationReasons`; detailed evidence remains in existing frozen `originalEngine` and the sidecar stays a small shadow artifact.
- Added Filter Builder fields for confirmation status/reason without changing default screen, sorting or ranking.
- Added one fail-open badge for the active StockScout ticker. It renders only when manifest and sidecar `generatedAt` match and `affectsStockScout` is false; missing/stale sidecar hides the badge rather than changing screener behavior.
- Pages/frontend validation checks now require canonical hash invariance plus core/manifest/sidecar generatedAt and cardinality consistency.
- Fixed a pre-existing StockScout Validation artifact-source mismatch so the run resolves and downloads the Stable `stock-screener2` Pages snapshot from the same repository.

**Scoring / behavior impact**
- No Opportunity v2, Emerging Leader, MA Cluster, Group Leadership, Fundamentals, Stage, RS, chart mapping or default ranking change.
- No frozen LEGACY implementation or threshold changed.
- `legacyConfirmation` remains read-only (`affectsStockScout: false`).
- Next scheduled nightly scan remains disabled; Stable was read only and not modified.

**Tests / audits / CI**
- Frontend Compile Smoke run `32351893382`: **success** on current PR head; shadow Python/client projection tests, runtime tests, TypeScript/Vite build and mobile Playwright smoke all passed.
- StockScout Validation run `32351893384`: **success** on current PR head; Stable snapshot restore, frozen LEGACY baseline, regression/integration tests, compatibility audits, MA Cluster audit, Scout Tier audit, exact LEGACY shadow invariance/client-artifact audit and frontend `npm run check` all passed.
- The real-snapshot shadow distribution remains `CONFIRMED 620`, `EARLY 236`, `NEUTRAL 984`, `RISK 173`, with 0 Core invariance errors from the canonical gate established above.
- First Full Validation attempt `32351174577` on head `4d1f6b1...` failed before the full scan because the workflow referenced a not-yet-renamed sidecar test file; full-scan job was skipped. The filename mismatch was corrected without changing test logic.
- A final Full Validation was retriggered at head `27c9c84...`; its conclusion was not yet available when this log entry was written, so Full Validation is **not yet claimed green**.

**Risk / governance note**
- Existing `full_validation_status.yml` records any completed Full Validation into Next `main`, even when the source run is `next-dev`. The first failed attempt therefore created a status-only `ci: record full validation status` commit on `main`. This is a pre-existing workflow behavior discovered during validation; no scoring/data methodology was changed by that metadata commit.
- Do not merge draft PR #1 until the final Full Validation result is explicitly verified and the status-recorder branch-isolation behavior is addressed.

**Next logical step**
- Verify the final Full Validation run conclusion; then isolate `full_validation_status.yml` so non-main validation cannot mutate `main`. If green, Phase 3 can be considered validated and work can proceed to Phase 4 review UX without promoting LEGACY into StockScout scoring.

## 2026-08-20 — Phase 3 clean Full Validation gate closed

**Branch / PR / validated SHA**
- Development branch: `next-dev`; clean validation branch: `phase3-clean-validation`.
- Draft PR: `#1` remains open/draft and unmerged.
- Clean validated feature SHA: `ac7e66f6babf35de8616a1928ebabc4ffaf62a9a`.
- Full Validation run `32355696983`: **success**, run number 5, source branch `phase3-clean-validation`, exact head SHA `ac7e66f6babf35de8616a1928ebabc4ffaf62a9a`.

**Workflow hardening / cleanup**
- Full Validation now calls the reusable full scan with `persist_outputs: false` and `deploy_pages: false`, so validation computes/audits/builds without committing generated scan data or publishing Pages.
- `full_validation_status.yml` is branch-isolated: the recorder targets `workflow_run.head_branch` with a same-repository guard instead of hardcoding Next `main`.
- A prior validation-generated data commit was removed from the feature branch history; the clean PR diff no longer includes canonical scan snapshots, scan metadata or fundamentals-cache artifacts.
- Next `main` received only CI-governance/status cleanup (`23e0048...`, then baseline status restore `9b8b2f9...`); no product scoring/data methodology was promoted.

**Scoring / behavior impact**
- No Opportunity v2, Emerging Leader, MA Cluster, Group Leadership, Fundamentals, Stage, RS, chart mapping or default StockScout ranking changed.
- Frozen LEGACY remains unchanged and shadow-only; `affectsStockScout: false` remains enforced.
- Next scheduled nightly scan remains disabled.
- Stable `Garrincha077/stock-screener2` was not modified; its `main` remained at `ff2484303d1954480265c348c7be74126409e338` during this work.

**Tests / audits / CI**
- Clean Full Validation `32355696983`: **success** from `2026-08-20T09:47:45Z` to `2026-08-20T09:58:28Z`.
- `legacy-shadow-unit`: success.
- `full-scan / screen-stocks`: success.
- Passed: frozen LEGACY baseline verification, fast-engine regression tests, completed-session guard, optimized full scan, rich fundamentals hydration, rich LEGACY + STOCKSCOUT export, canonical dataset invariants, Opportunity v2/model compatibility audit, Fundamental Evidence audit, post-enrichment frozen LEGACY verification, lightweight client + LEGACY sidecar build, chart coverage, frontend runtime/tests/TypeScript/Vite build, built Pages chart validation and recovery-artifact generation.
- Validation-side persistence/publish steps were intentionally skipped: `Commit cache and canonical outputs`, `Sync persistent outputs to source branch`, `Upload Pages artifact`, and the entire `deploy-pages` job.
- PR-level checks on the same clean SHA were also green: StockScout Validation `32355798584` and Frontend Compile Smoke `32355798992`.
- Earlier read-only Full Validation `32354799196` on `72e6234...` was also success; the relevant workflow/test blobs were verified identical to the clean `ac7e66f...` versions. The clean rerun is the authoritative Phase 3 gate because it excludes accidental generated-data history.

**Risk / decision**
- Phase 3 validation gate is closed. Do not promote LEGACY into StockScout scoring; keep confirmation as transparent shadow evidence only.
- Keep PR #1 unmerged until an explicit promotion/merge decision; validation is sufficient to continue experimental work on `next-dev`.
- Full Validation is now a read-only validation gate by default for the Phase 3 caller; normal manual scan behavior retains persistence/deploy defaults unless explicitly disabled.

**Next logical step**
- Begin Phase 4 Review UX v2 on `next-dev`: prioritize Today/New Since Last Scan inbox, Rapid Review usability, a concise `Why this stock?` explanation, one LEGACY confirmation badge and a data/scan health banner. Avoid introducing new opaque composite scores.

## 2026-08-20 — Phase 4 Review UX v2 first slice

**Branch / commits**
- Branch: `next-dev`.
- Review derivations: `f3672ff21887de05760b7c73ae2a646b96bb4f41`.
- Review bar: `da2164c658d3bbf715e734a6c22f3792f141eaec`.
- Responsive/Rapid Review CSS: `0118d53b34cc347e41de744996ec47851fc46e77`.
- Root wiring: `278cb757efad790a262f825391949fdff83e76dd`.
- Unit-test registration: `8f677c75f1400cb4de91618690849f6431fbbe19`, `1f73da3589b1c185d247435a501cdd4781405fef`.
- Mobile review E2E: `d3c078bd1385a4213e1bc70c747c9cd850d2230b`.

**What changed / why**
- Added a compact Phase 4 review strip above the StockScout terminal with `Today`, `New since last scan`, `Why this stock?`, data-health and Rapid Review context.
- Today/New inboxes are derived only from existing `changedToday`, `newUniverseMember`, `changeImpact`, `changeLabels` and existing Opportunity fields; no new signal or score is created.
- `Why this stock?` is a transparent textual decomposition of existing setup, Stage, Opportunity, Potential/Timing, RS, Group, Fundamentals, volume and recent-change fields. It explicitly labels itself as `no new score`.
- Health logic checks `core.json` vs `manifest.json` snapshot/cardinality consistency and snapshot age. Validation status is optional/fail-open; the UI explicitly reports `validation status: client unavailable` instead of claiming green when no client-side validation artifact exists.
- Existing Rapid Review lazy loading is preserved. CSS now makes the review header sticky, increases mobile chart/card height, keeps continuous scroll loading, and uses `content-visibility` to reduce rendering pressure on large candidate sets.

**Affected files / components**
- `frontend/src/phase4Review.ts`.
- `frontend/src/Phase4ReviewBar.tsx`.
- `frontend/src/phase4-review.css`.
- `frontend/src/Root.tsx`.
- `frontend/src/phase4Review.test.ts`.
- `frontend/package.json`.
- `frontend/e2e/mobile-rapid-review.spec.ts`.
- No scanner, canonical writer, workflow, StockScout model module or frozen LEGACY source was modified.

**Scoring / behavior impact**
- No Opportunity v2, Emerging Leader, MA Cluster, Group Leadership, Fundamentals, Stage, RS, chart mapping or default sorting/ranking change.
- LEGACY remains shadow-only and its existing badge/source inspector behavior is unchanged.
- The Phase 4 strip reads `core.json`/`manifest.json` only and does not write or mutate candidate data.
- `stock-screener2` remains untouched; Next scheduled nightly scan remains disabled.

**Tests / audits / CI**
- Added targeted Node tests for inbox derivation, explanation transparency, snapshot mismatch handling and fail-open validation status.
- Expanded the mobile Playwright smoke to cover Phase 4 review bar visibility, Today count/list, `Why this stock?`, and the existing 16 -> 50 progressive Rapid Review render path.
- GitHub Actions were triggered automatically for the current PR head: StockScout Validation run `32360678250` and Frontend Compile Smoke run `32360678238`.
- At the time of this log entry both current runs were still in progress/pending, so CI is **not yet claimed green**.
- Full Validation was not triggered because this slice is frontend-only and does not change scan/data/workflow behavior.

**Risk / decision**
- Do not publish a static/frozen validation claim into the frontend. Until the validation status is intentionally exposed as a client artifact, the health bar must distinguish `data healthy` from `validation status unavailable`.
- Keep Today/New as a read-only review inbox first; integrate it deeper into terminal filtering only if usability warrants it, rather than introducing another stateful screen model prematurely.
- Preserve the existing Rapid Review progressive loader; Phase 4 should optimize the review surface before replacing its data flow.

**Next logical step**
- Verify the current PR checks. If green, tighten mobile layout based on the Playwright result and then decide whether to wire a live validation-status client artifact in a separate scan/data change requiring Full Validation.
