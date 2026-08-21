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

## 2026-08-20 — Phase 4 first-slice CI closure

**Branch / commits / PR**
- Branch: `next-dev`.
- Dependency repair: `2486acf8b55210cd195c955c45c4d45326be812d`.
- Draft PR #1 renamed to `Next: LEGACY shadow + Phase 4 Review UX v2`; it remains draft/unmerged.

**What happened / fix**
- Initial Phase 4 StockScout Validation runs `32360678250` / `32360832466` reached the frontend build after all backend/model/shadow audits passed, then failed because `@vitejs/plugin-react` had accidentally been omitted from `frontend/package.json` while extending the test script.
- Restored the pre-existing `@vitejs/plugin-react` `6.0.4` dev dependency only. No application logic, scanner, workflow, data artifact or model code changed in the repair.

**Tests / audits / CI**
- StockScout Validation run `32360966564` (#38) on `2486acf8...`: **success**.
- The successful run includes 73 regression/integration Python tests, frozen LEGACY baseline verification, Opportunity/model compatibility, MA Cluster, Scout Tier, exact LEGACY shadow/Core invariance, frontend Node tests, TypeScript and Vite build.
- Frontend Compile Smoke run `32360966434` (#26) on `2486acf8...`: **success**.
- Compile smoke passed client payload + shadow snapshot checks, runtime tests, TypeScript/Vite build, browser setup and the Phase 4 mobile Playwright smoke covering Today inbox, `Why this stock?` and progressive Rapid Review 16 -> 50 rendering.
- Full Validation was not run for this Phase 4 slice because neither the UX work nor the dependency repair changes scan/data/workflow behavior.

**Scoring / behavior impact**
- No StockScout scoring/ranking/model behavior changed.
- LEGACY remains frozen and shadow-only; exact invariance audit passed with zero Core drift.
- Stable `Garrincha077/stock-screener2` was not modified; Next scheduled nightly scan remains disabled.

**Next logical step**
- Continue Phase 4 in small frontend-only increments: refine the mobile review density/navigation from real use, then consider a separate live validation-status client artifact only if its extra workflow/data complexity is worth it; that separate change would require Full Validation.

## 2026-08-20 — Phase 4 review queue + active-ticker sync

**Branch / commits**
- Branch: `next-dev`.
- Review queue / ticker sync: `6fcec036d1993ca294e26fe0e5b42a417d74e1b6`.
- Queue/mobile controls: `56d4bc558d28c83ec8b3340c6b26d1ce5cf3918d`.
- Browser regression coverage: `5685714ba0ac029ba99e024be96e7b26c83f700c`.

**What changed / why**
- Added sequential Prev/Next navigation after opening a candidate from Today or New Since Last Scan, with visible review position (`Review N / total`). This turns the inbox into a lightweight review queue without adding another screener state or score.
- Fixed a Phase 4 selection-sync gap: normal Screener/Grid selection updates the URL through `history.replaceState`, which does not emit `hashchange`; the review bar now observes the hash at a low-frequency 250 ms interval in addition to `hashchange`, so `Why this stock?` follows the active StockScout ticker without coupling DeepVueTerminal to Phase 4 state.
- Closing the Why panel exits queue mode; selecting a ticker outside the current queue also drops queue navigation instead of presenting misleading Prev/Next context.
- Tightened mobile Why-header controls and kept them sticky inside the bottom review panel.

**Affected files / components**
- `frontend/src/Phase4ReviewBar.tsx`.
- `frontend/src/phase4-review.css`.
- `frontend/e2e/mobile-rapid-review.spec.ts`.
- No scanner, canonical writer, workflow, StockScout model, filter engine, saved-screen state or frozen LEGACY source changed.

**Scoring / behavior impact**
- None. Opportunity v2, Emerging Leader, MA Cluster, Group Leadership, Fundamentals, Stage, RS, chart mapping and default ranking are unchanged.
- LEGACY remains frozen/shadow-only and has no scoring path.
- Existing screener filters are not cleared or rewritten when the review queue is used.
- Stable `Garrincha077/stock-screener2` was not modified; Next scheduled nightly scan remains disabled.

**Tests / audits / CI**
- Frontend Compile Smoke run `32362506757` (#30) on `5685714...`: **success**. Client payload/shadow checks, runtime tests, TypeScript/Vite build and mobile Playwright all passed.
- Mobile Playwright now covers Today queue start, `Review 1 / 3` -> Next -> `Review 2 / 3`, normal Grid selection via `history.replaceState` synchronizing `Why this stock?` to `T004`, and progressive Rapid Review 16 -> 50 rendering.
- StockScout Validation run `32362506816` (#44) on `5685714...`: **success**. Frozen LEGACY baseline, regression/integration tests, model compatibility, MA Cluster, Scout Tier, exact LEGACY/Core invariance, frontend runtime tests and build all passed.
- Full Validation was not run because this slice is frontend-only and does not alter scan/data/workflow behavior.

**Risk / decision**
- The 250 ms hash observer is intentionally local to the Phase 4 review bar and avoids modifying the existing terminal selection contract. If review state later becomes first-class shared application state, replace polling with an explicit selection event/store rather than widening this workaround.
- Do not deepen Today/New into default scoring or ranking; the value here is faster human review.

**Next logical step**
- Continue Phase 4 with one more frontend-only usability slice: add a compact reviewed/progress state for Today/New (local/session only) so the user can distinguish unseen vs reviewed candidates during a session, without writing scan data or changing StockScout scores. Defer live validation-status artifact wiring unless its operational value justifies a separate data/workflow change and Full Validation.

## 2026-08-20 — Phase 4 reviewed progress + mobile/desktop gate closed

**Branch / commits**
- Branch: `next-dev`.
- Snapshot-scoped reviewed state: `74f4442edbc995b62eb3f98bd929a26174cca17e`.
- Reviewed/unseen styling: `0ea6303ff4f3a82012db68734067a71c79414bc7`.
- Reviewed-progress browser coverage: `36e44ca2e17309428706e16b431765bc9742723d`.
- Mobile + desktop Playwright projects: `facf798a5b647c2419f151a881026b770a7459e2`.
- Desktop stacking fix: `6cbf49b459682d5b13362d8d145947b2e0dd40e9`.
- Viewport-aware Rapid Review test: `45ae494ebce282d6e73d592d7345a3d1381646e9`.

**What changed / why**
- Today/New now shows `N unseen` / `all seen`; opening a queue candidate marks it reviewed, reviewed rows are visibly marked, and Prev/Next navigation advances review progress.
- Reviewed state is stored only in `sessionStorage`, under a key scoped to the current `generatedAt` snapshot. A new scan snapshot therefore starts with clean review progress automatically; nothing is written to canonical scan data, ranking, saved screens or server state.
- Playwright now runs the same Phase 4 review workflow in both `mobile-pixel-5` and `desktop-chrome` projects. This was added because the Phase 4 roadmap gate explicitly requires mobile + desktop review behavior, while prior browser coverage was mobile-only.
- The first desktop browser run exposed a real stacking bug: the Why-panel Next button was under the sticky terminal header, so the terminal `3h old` element intercepted pointer events. Raising the Phase 4 review stacking context from z-index 44 to 60 fixed the actual UI instead of forcing the test click.
- After that fix, desktop progressed through the queue correctly but the test still assumed an initial 16-card grid. A large desktop viewport legitimately places the IntersectionObserver sentinel in range and can advance the lazy loader to 32 immediately. The final test therefore keeps the strict initial `16` assertion for Pixel 5, while desktop asserts that the displayed count matches the actual rendered card count; both projects must still end at all 50 matches.

**Affected files / components**
- `frontend/src/Phase4ReviewBar.tsx`.
- `frontend/src/phase4-review.css`.
- `frontend/e2e/mobile-rapid-review.spec.ts`.
- `frontend/playwright.config.ts`.
- No scanner, canonical writer, GitHub Actions workflow, StockScout model, scoring field, filter engine or frozen LEGACY source changed.

**Scoring / behavior impact**
- None. Opportunity v2, Emerging Leader, MA Cluster, Group Leadership, Fundamentals, Stage, RS, chart mapping and default ranking remain unchanged.
- LEGACY remains frozen/shadow-only and cannot affect StockScout scoring.
- Reviewed/unseen state is transient human-review state only and resets by browser session / new `generatedAt` snapshot.
- Stable `Garrincha077/stock-screener2` was not modified; Next scheduled nightly scan remains disabled.

**Tests / audits / CI**
- Reviewed/unseen slice: Frontend Compile Smoke `32362909506` (#34) **success** and StockScout Validation `32362909656` (#50) **success** on `36e44ca...`. The browser test verified `3 unseen -> 2 unseen -> 1 unseen`, two reviewed row markers, queue navigation, active ticker sync and full Rapid Review rendering.
- Initial dual-viewport Compile Smoke `32363099208` (#35) failed only in `desktop-chrome` because the real Why-panel stacking bug caused the terminal header to intercept the Next click; `mobile-pixel-5` passed.
- Compile Smoke `32363306754` (#36) after the stacking fix reached and passed the queue interaction on desktop, then failed only because the test expected `16 of 50` while desktop had legitimately auto-advanced to `32 of 50` through IntersectionObserver.
- Final Frontend Compile Smoke `32363419613` (#37) on `45ae494...`: **success**. The job log explicitly reports `Running 2 tests using 2 workers` and `2 passed`; Pixel 5 and Desktop Chrome both complete Today/reviewed/Why/queue/ticker-sync/Rapid Review behavior.
- Final StockScout Validation `32363419707` (#54) on `45ae494...`: **success**. Frozen LEGACY baseline, regression/integration suite, current model stack, Opportunity/model compatibility, MA Cluster, Scout Tier, exact LEGACY/Core invariance, frontend Node tests and TypeScript/Vite build all passed.
- Full Validation was not run because these changes are frontend/test-configuration only and do not alter scan/data/workflow behavior.

**Risk / decision**
- Phase 4 Review UX v2 functional gate is now closed: Today/New inbox, transparent Why explanation, health banner, LEGACY shadow confirmation, Rapid Review, reviewed progress, and mobile + desktop review are all represented and browser-validated.
- Keep live validation-status publishing deferred. The health banner must continue to say client validation status is unavailable rather than presenting a stale/frozen green claim. If live status is later published through data/workflow, treat it as a separate change and run Full Validation.
- Keep the 250 ms hash observer local to the Phase 4 review bar until/unless application-wide selected-ticker state is intentionally centralized.
- PR #1 remains draft/unmerged; closing the Phase 4 functional gate is not a promotion decision.

**Next logical step**
- Phase 4 is ready for real-use feedback on `next-dev`. Continue to the next roadmap phase only with the same rule: preserve StockScout Core and LEGACY shadow-only behavior, use small reversible changes, and require Full Validation for any scan/data/workflow modification.

## 2026-08-20 — Phase 5 built-in discovery cohorts + Next main promotion

**Branch / commits / promotion**
- Development branch: `next-dev`.
- Cohort definitions: `5155a3a6b4de196dd336c24cb6fd90b543e9f4c8`.
- Client registration: `e2cf2bf7c18791efe6d17bc31b171ef97d6beca2`.
- Unit coverage: `175a9c3224b0e7725d76c55cddd7fc78149ce38b` and package wiring `98d9c44e9a1a7444269eedf45d99576b99713609`.
- Browser coverage: `df9388d2ad09f9343ded7657426a245f120b69cc`.
- Native Node TypeScript import repair: `7f50efda288c71e73efcc37d5cf2b0f14a406e64`, `cfbd969bb1a26e1b8c0484ebbee2a34d37f4e9e1`, `28946abf4f880cf3a7c081de9f96cf5c7abbc5bf`.
- PR #1 promoted to ready and merged into StockScreener-next `main` as merge commit `d104726cd56f7d0f100b2bbd6a75857e20a2f7e2` after explicit user approval to publish/merge for review.

**What changed / why**
- Added five built-in discovery screens from the roadmap: `Early Leaders`, `Confirmed Leaders`, `Ahead of Minervini`, `Breakout Confirmed`, and `Watchlist Risk`.
- `Early Leaders`, `Confirmed Leaders`, and `Breakout Confirmed` reuse the existing `Prime / Ready Opportunities` StockScout definition (`Opportunity >=80`, `Opportunity Rank >=90`, `extended=false`) rather than inventing a second strong-candidate threshold.
- `Early Leaders` then explicitly selects non-confirmed shadow states (`EARLY`, `NEUTRAL`, `CONFLICT`); `Confirmed Leaders` requires `CONFIRMED`.
- `Ahead of Minervini` uses existing `emergingLeaderCandidate`, original Trend Template passes `<7`, `extended=false`, and excludes LEGACY `RISK`.
- `Breakout Confirmed` adds the already-captured boolean `originalBreakoutVolumeConfirmed=true`.
- `Watchlist Risk` is a direct read-only screen over `originalRunSellSignal=true`.
- Added only the three missing transparent Filter Builder field registrations needed by these screens; default screen and default ranking remain unchanged.

**Affected files / components**
- `frontend/src/deepvue/phase5Cohorts.ts`.
- `frontend/src/deepvue/phase5Cohorts.test.ts`.
- `frontend/src/deepvue/legacyConfirmationUi.ts`.
- `frontend/src/main.tsx`.
- `frontend/package.json`.
- `frontend/tsconfig.json`.
- Phase 5 browser coverage under `frontend/e2e/`.
- No scanner, canonical writer, scoring/model module, daily-scan workflow or frozen LEGACY implementation was changed by Phase 5.

**Scoring / behavior impact**
- No Opportunity v2, Emerging Leader, MA Cluster, Group Leadership, Fundamentals, RS, Stage, chart mapping or default ranking change.
- No new composite score or hidden LEGACY modifier was introduced.
- LEGACY remains shadow-only; these screens affect results only when a user explicitly selects them.
- Stable `Garrincha077/stock-screener2` was not modified and its Vercel `frontend` project remains attached to Stable.
- Next scheduled nightly scan remains disabled.

**Tests / audits / CI**
- Initial Phase 5 Frontend Compile Smoke `32364338931` (#43) and StockScout Validation `32364338997` (#63) failed before browser/build completion because native Node TypeScript tests could not resolve the extensionless `./filterEngine` import from `phase5Cohorts.ts`.
- The repair made only TypeScript module-resolution compatibility changes: explicit `.ts` imports in the tested modules plus `allowImportingTsExtensions` with `noEmit`; cohort rules and application semantics did not change.
- Final Frontend Compile Smoke `32369432855` (#46) on `28946ab...`: **success**, including client/shadow snapshot checks, Node tests, TypeScript/Vite build and Playwright browser smoke.
- Final StockScout Validation `32369432770` (#68) on `28946ab...`: **success**, including Stable snapshot restore, frozen LEGACY baseline, regression/integration suite, current model stack, compatibility audits, MA Cluster, Scout Tier, exact LEGACY/Core invariance and frontend build.
- Phase 4/5 promotion did not require another Full Validation because all changes after the already-clean Phase 3 Full Validation were frontend/test-only and did not alter scan/data/workflow behavior.

**Risk / decision**
- Promotion is to StockScreener-next `main` only so GitHub Pages can expose the validated UI for human review; this is not a production cutover and does not re-enable nightly scanning.
- Keep `next-dev` as the experimental branch for future roadmap work; `main` is now the controlled review baseline containing validated Phase 3-5 behavior.
- Do not merge any of this work into Stable `stock-screener2` unless separately and explicitly requested.

**Next logical step**
- Verify the `Deploy StockScout Terminal` Pages run from merge commit `d104726...` and use the public Next Pages URL for real-use review. Continue subsequent roadmap work on `next-dev`; use Full Validation for any future scan/data/workflow changes.

## 2026-08-21 — Read-only Stable snapshot bridge validation

**Branch / PR / commits**
- `next-dev` was first fast-forwarded to current validated `main`; it had been 0 commits ahead and 8 behind, so no unpromoted Codex work was overwritten.
- Added validator: `f4e84a72bfa9d04cc92d66fff0e937d1060ef850`.
- Added Full Validation path gate: `4d4b7064da0a6c19e46b850ddc51c20c1b099fd9`.
- Added PR trigger for explicit bridge visibility: `0f05b427895ae9a4cefeb1144b0c9f99e4fb965c`.
- Draft PR #4 (`next-dev` -> `main`) opened; intentionally unmerged.

**What changed / why**
- Added `.github/workflows/validate_stable_snapshot_sync.yml` as a read-only compatibility bridge.
- The workflow downloads Stable `frontend/public/data/latest.json` and scan metadata by GET only, substitutes the snapshot only inside a disposable Actions workspace, runs LEGACY/Core invariance, rebuilds Next client/shadow payloads, and runs frontend tests/typecheck/build.
- Workflow permissions are `contents: read`; it has no commit/push step and no Stable write path.
- `stockscout_full_validation.yml` now treats this bridge workflow as a Full Validation trigger because it changes the data/workflow path.
- This work identifies the safe architecture for keeping Next fresh without re-enabling its nightly scanner; it does not yet publish or persist the imported snapshot.

**Behavior / scoring impact**
- No scanner/model code, Opportunity v2, Emerging Leader, MA Cluster, Group Leadership, Fundamentals, Stage, RS, chart mapping, default rank or frozen LEGACY implementation changed.
- No canonical dataset was committed by the bridge and no Pages deployment changed.
- Stable `stock-screener2` remained read-only and untouched.
- Next scheduled nightly scan remains disabled.

**Validation**
- `Validate Stable Snapshot Sync` PR run `32452561269`: **success**.
- It consumed Stable scan workflow `32422201734`, canonical `generatedAt=2026-08-20T22:09:11.073071+00:00`, universe 2,011.
- Fresh-snapshot LEGACY shadow audit: PASS; 0 Core invariance errors; chart shard mapping identical; 2,011/2,011 available.
- Fresh shadow counts: CONFIRMED 575, EARLY 182, NEUTRAL 1,031, RISK 223.
- Client projection preserved the downloaded canonical SHA; frontend Node suite passed 19/19 tests and TypeScript/Vite build succeeded.
- StockScout Validation PR run `32452561337`: **success**, including Stable snapshot restore, frozen LEGACY graph, regression/integration, current model stack, compatibility, MA Cluster, Scout Tier, exact LEGACY/Core invariance and frontend build.
- A Full Validation was triggered by this workflow-path change, but its new status record was not yet available when this entry was written. Do **not** claim that new Full Validation green until explicitly verified.

**Risk / decision**
- Keep PR #4 draft and unmerged until the triggered Full Validation is explicitly verified.
- The bridge proves compatibility only; public Next still uses its checked-in older snapshot until a separate promotion decision changes the publish path.
- Do not solve freshness by granting Stable write access or re-enabling Next nightly scanning.

**Next logical step**
- Verify the triggered Full Validation. If green, promote only the smallest reversible one-way Stable -> Next refresh mechanism, then use the fresh snapshots as the input journal for Phase 6 empirical cohort tracking.

## 2026-08-21 — Phase 4 review-scope Grid UX

**Branch / PR / commits**
- Branch: `feature/review-scope-grid`, based on reconciled app/data hardening branch `integration/hardening-app-data-current-main` (PR #6).
- Draft PR: #8, retargeted to PR #6 after validation so the final diff remains small.
- Review-scope semantics/provider/UI/tests: `f1aa812...`, `acef1fb...`, `873bc02...`, `0165d70...`, `49bda6f...`, `cd51dcf...`, `bbe096b...`.
- Desktop overlap repair / final validated code head: `a8fd115fc43b5e0de58e987138a8be49f37ea79e`.

**What changed / why**
- `Today` and `New since last scan` are now persistent temporary Review Scope controls. Selecting either automatically opens Grid and limits membership to the same transparent `changedToday` or `newUniverseMember` flags already used by the Phase 4 inbox.
- Only one scope may be active. Switching Today -> New replaces the scope; clearing the visible `Review scope ... ×` chip restores the normal saved-screen/recipe/builder membership logic.
- Scope intentionally pauses membership rules rather than intersecting with them, but preserves the existing Multi Sort state. Text query remains available as an additional narrowing layer inside the active scope.
- Added a `List` action to the scope chip so the existing inbox, review queue, reviewed/unseen state and Why flow remain available without making the large Today/New cards double-purpose controls.
- The initial desktop browser run exposed a real overlap: fixed `.ss-layer-switch` (`STOCKSCOUT / LEGACY`) intercepted the New button. The fix reserves a dedicated 48px desktop lane for that fixed switch; no forced Playwright click and no z-index masking workaround was used.

**Affected files / components**
- `frontend/src/phase4Review.ts`.
- `frontend/src/data/StockScoutDataProvider.tsx`.
- `frontend/src/Phase4ReviewBar.tsx`.
- `frontend/src/DeepVueTerminal.tsx`.
- `frontend/src/phase4-review.css`.
- `frontend/src/phase4Review.test.ts`.
- `frontend/e2e/mobile-rapid-review.spec.ts`.

**Scoring / behavior impact**
- Frontend-only review/navigation behavior. No Opportunity v2, Emerging Leader, MA Cluster, Group Leadership, Fundamentals, RS, Stage, chart mapping, default scoring or frozen LEGACY rule changed.
- Scope state is transient UI state and does not write scan/canonical data or alter saved-screen definitions.
- Stable `stock-screener2` was not modified. Next scheduled nightly scan remains disabled.

**Tests / audits / CI**
- Initial Frontend Compile Smoke `32465860063` (#51): Python/client and Node tests plus TypeScript/Vite build passed; Pixel 5 passed, but desktop Playwright failed because the fixed signal-layer switch physically intercepted the New button. This was treated as a real UI bug rather than bypassed.
- Final Frontend Compile Smoke `32466218700` (#52) on `a8fd115...`: **success**, including unit/runtime tests, TypeScript/Vite build and browser smoke after the layout repair.
- StockScout Validation `32466218562` (#91): **success**, including frozen LEGACY execution, model compatibility, MA Cluster, Scout Tier, exact LEGACY/Core invariance and frontend build.
- Validate Stable Snapshot Sync `32466218613` (#10): **success** against the fresh read-only Stable snapshot path.
- No new Full Validation was required for this feature because it changes frontend-only review state and tests; no scan/data/workflow path was changed.

**Risk / decision**
- Do not implement Review Scope as a new score, saved screen, or hidden filter mutation. It is explicitly a reversible view-level membership override.
- Preserve the dedicated desktop lane for the fixed signal-layer switch; simply raising the review z-index would make one control hide/intercept the other.
- PR #8 must remain stacked on/behind PR #6 until the reconciled app/data provider is promoted; do not merge the temporary stacked-to-main form.

**Next logical step**
- After PR #6 is safely promoted, land/rebase PR #8 as the small frontend-only UX change and verify it in the public Next app with a real Today/New snapshot. Then return to Phase 6 empirical cohort tracking.

## 2026-08-21 — Codex hardening / Review Scope promotion + Phase 6 observer

**Branch / PR / commits**
- PR #6 app/data hardening was promoted to Next `main` as merge commit `57dc6fc8ed281e7a641fc3f86cede4f98e58ac6c` after its current validation checks were verified.
- PR #8 Review Scope UX was retargeted to the new `main` and promoted as merge commit `d2640e61c428831a4037c5d1819554e6a39b5bb4`.
- Before further development, `next-dev` was fast-forwarded only after verifying that it had 0 commits ahead of `main`.
- Phase 6 PR #9 final validated head: `5c9f18e85d00164595a326abaec85bf8bb379814`; merged to Next `main` as `d7c959d6803d465db328cf71be08153b99fe045b`.
- Phase 6 implementation sequence: `b5be1475cb7766682258b5f522a9507bfa5aa5fd`, `65ae0ee1350beba836cb69ee5fdd66934acb8e5d`, `004f5894eebc6ab107c3d8a4f202b85fb8dae26`, `1eaa3a015e17e5a2d595493311bdc777fb8dae26`, `5c9f18e85d00164595a326abaec85bf8bb379814`.

**What changed / why**
- #6 promoted the already-reconciled application/data-provider hardening without changing StockScout scoring/model methodology.
- #8 promoted the validated Today/New temporary Review Scope UX, preserving Multi Sort/query/review behavior and keeping scope as a reversible view-level membership override.
- Phase 6 now has an observation-only empirical cohort projection. It does not yet persist a journal or calculate forward performance.
- Cohort 1 = strong StockScout + LEGACY `CONFIRMED`; cohort 2 = strong StockScout + LEGACY `EARLY`; cohort 3 = captured original-run LEGACY BUY + low StockScout Opportunity; cohort 4 = strong StockScout + LEGACY `RISK`.
- “Strong StockScout” reuses the existing Phase 5 Prime / Ready Opportunities contract exactly: `opportunityScore >= 80`, `opportunityRank >= 90`, `extended=false`.
- Roadmap “low StockScout Opportunity” is explicitly mapped to the existing canonical Opportunity v2 `PASS` tier (`score <55`) rather than creating a new threshold or score.
- Canonical LEGACY status is obtained from the existing read-only confirmation sidecar adapter over the frozen capture. An already-projected client status is only a fail-open fallback; no LEGACY rule is reconstructed or modified.

**Affected files / components**
- Phase 6: `phase6_empirical_cohorts.py`.
- Phase 6 tests: `tests/test_phase6_empirical_cohorts.py` and a CI-executed integration smoke in `tests/test_build_legacy_confirmation_sidecar.py`.
- #6 and #8 retain their own PR/history-level frontend/provider file lists; this log entry records promotion rather than duplicating their full diffs.

**Scoring / behavior impact**
- No Opportunity v2, Emerging Leader, MA Cluster, Group Leadership, Fundamentals, RS, Stage, chart mapping or default ranking changed.
- Frozen LEGACY remains read-only/shadow-only and cannot alter StockScout scoring; `affectsStockScout: false` remains the contract.
- Phase 6 observer is not invoked by the scanner, data publish path or GitHub workflow and does not write canonical data.
- Stable `Garrincha077/stock-screener2` remained untouched/read-only.
- Next scheduled nightly scan remains disabled.

**Tests / audits / CI**
- PR #6 verified checks before promotion: Validate Stable Snapshot Sync `32463989968` **success**, Frontend Compile Smoke `32463989972` **success**, StockScout Validation `32463989993` **success**.
- PR #8 final checks: Frontend Compile Smoke `32466218700` **success**, StockScout Validation `32466218562` **success**, Validate Stable Snapshot Sync `32466218613` **success**.
- Phase 6 PR #9 final head `5c9f18e...`: Frontend Compile Smoke `32468222917` (#55) **success** and StockScout Validation `32468222944` (#99) **success**.
- Phase 6 StockScout Validation passed Stable snapshot restore, frozen LEGACY verification, regression/integration tests including the Phase 6 canonical observer smoke, current model-stack application, model compatibility, MA Cluster audit, Scout Tier audit, exact LEGACY/Core invariance and frontend TypeScript/Vite build.
- Full Validation was not required for PR #9 because the observer/test slice is not wired into scan/data/workflow runtime. Any later automatic journal/publish wiring is a data/workflow change and must use Full Validation.

**Risk / decision**
- Do not wire Phase 6 journal persistence into scanner/publish automation until its retention/provenance format is separately reviewed and Full Validation is run.
- Keep `PASS` as the explicit, transparent current interpretation of roadmap “low Opportunity”; revisit only from empirical evidence rather than through an opaque threshold change.
- PR #7 workflow hardening remains draft/unmerged. Do not promote it until its required current checks and Full Validation are explicitly verified.
- No Phase 6 performance conclusion exists yet. Cohort membership is now defined, but 5D/20D returns, MFE, MAE, breakout success/failure, drawdown and hit rate require a longitudinal observation journal and future-session prices.

**Next logical step**
- Synchronize `next-dev` to this logged controlled `main` baseline.
- Continue Phase 6 with the smallest reversible journal/forward-price slice: define append-only observation retention and derive future-session pricing from existing validated data/charts before considering automatic capture.
- If that journal is wired into Stable snapshot sync, scan, publish or workflow persistence, run Full Validation before promotion.

## 2026-08-21 — Mobile Rapid Review overlap fix

**Branch / PR / commits**
- Fix branch: `fix/mobile-rapid-review-overlap`, created from synchronized `main` / `next-dev` baseline `a1d7fca296d8fc495894705cd805f905c7e2b42e`.
- PR #10 validated head: `810883800047c17b375dddbcb05e02852f6ebdcd`.
- Promoted to Next `main` as merge commit `5989983c8aab191fb51aa2b8b618a6ab41653873`.

**What changed / why**
- Real mobile use exposed that the Rapid Review Grid header remained `position: sticky` at phone widths, so stock cards scrolled underneath and the header visually overlaid the first card.
- At `max-width: 680px`, `.dv-gridview > header` now uses normal document flow (`position: static; top: auto`). Desktop/tablet sticky behavior is unchanged.
- Added a Playwright regression assertion that the mobile Pixel 5 project resolves the Rapid Review header to `position: static`.

**Affected files / components**
- `frontend/src/phase4-review.css`.
- `frontend/e2e/mobile-rapid-review.spec.ts`.

**Scoring / behavior impact**
- UI-only mobile layout repair. No StockScout Core field, Opportunity v2, Emerging Leader, MA Cluster, Group Leadership, Fundamentals, RS, Stage, chart mapping, default ranking, canonical scan data or frozen LEGACY behavior changed.
- Stable `Garrincha077/stock-screener2` was not modified. Next scheduled nightly scan remains disabled.

**Tests / audits / CI**
- Frontend Compile Smoke `32471044938` (#57): **success**, including runtime tests, TypeScript/Vite build and mobile/desktop Playwright smoke.
- StockScout Validation `32471045095` (#103): **success**, including Stable snapshot restore, frozen LEGACY verification, regression/integration suite, model compatibility, MA Cluster, Scout Tier, exact LEGACY/Core invariance and frontend build.
- Full Validation was not run because this repair is frontend/test-only and does not alter scan/data/workflow behavior.

**Risk / decision**
- Prefer non-sticky Rapid Review controls on small phones to avoid covering candidate cards. Keep the existing sticky behavior at larger viewports where there is enough vertical space.
- GitHub Pages deployment is triggered by the `main` frontend change; deployment result should be verified before claiming the public app is updated.

**Next logical step**
- Verify the `Deploy StockScout Terminal` Pages deployment for merge `5989983...`, then fast-forward `next-dev` to the logged `main` baseline before continuing workflow hardening or Phase 6 journal work.

## 2026-08-21 — Persistent chart drawings + post-scan alerts

**Branch / PR / commits**
- Branch: `next-dev`.
- Draft PR: #13 (`next-dev` -> `main`), titled `Next: persistent chart drawings and post-scan alerts`; intentionally remains draft pending real-use validation.
- Validated feature head before this log-only commit: `0527114c750a00cbebba994c73e4340b9597a8a8`.
- Key implementation commits in this slice include `75cf478ca70f1ad231ea77b322f591667c7886f4`, `96b23dd64b4e957fd8671bf5fbd76d99277b04b7`, `6d91b53c14dd30a706132b709d54ffc75129c426`, `b8ee495c5253630a7545aaf471ed9f884c49ff34`, `f72a70f1d8f97335ff3f2bdccd8d72a993074539`, `37d0034cd98e0a29f0361d6687ea8bcc32492a26`, `9f6254b393df12997b8e40b43b4d099bedac425e`, `3fde39a21afd397fc05f765ddb7a269eb277d43f`, `df015c7e0a8335eb7f117a32010c1c50bf3d442f`, `9b976c75d27a1ebb7830fd3881c1d91623d368f9`, `bbb152bc9d528c95fee551825b5e75bfaeb70c50`, and `0527114c750a00cbebba994c73e4340b9597a8a8`.

**What changed / why**
- Reused the proven user-alert concept from the older `Garrincha077/StockScout` implementation rather than inventing a separate methodology. The Next implementation preserves the useful pattern—persistent chart geometry, post-scan evaluation and Telegram delivery—but adapts it to GitHub Pages + Supabase.
- Added a standalone `Drawings & Alerts` dock for the currently selected ticker rather than making a broad invasive rewrite of `DeepVueTerminal`.
- User drawings support a two-point trendline and a one-click horizontal line, with explicit alert modes `Cross Above`, `Cross Below`, `Touch`, or alert disabled.
- Alert geometry and trigger events persist outside canonical scan data. Drawings therefore survive a new scan and can be re-projected to the new market date.
- `break_up` / `break_down` semantics require a true transition across the projected line using previous close vs previous projected line and new close vs new projected line; this avoids repeated hits merely because price remains on one side. `touch` requires the projected line price to lie inside the latest bar high/low range.
- Per-scan dedupe is enforced by unique `(alert_id, scan_generated_at)` event identity so the same alert cannot repeatedly fire for the same published snapshot.
- The evaluator runs hourly as an independent Supabase sidecar check. It reads only the latest already-published Next Pages `manifest.json`/core/chart shards; it does not start or re-enable a Next scan.

**Affected files / components**
- Frontend alert/drawing client and dock under `frontend/src/`, including the Root-level dock wiring and dedicated styling.
- Supabase migrations under `supabase/migrations/` for Next chart alerts, runtime/evaluator configuration and the service gateway.
- Edge Function source: `supabase/functions/stockscout-next-alerts/index.ts`.
- Supabase runtime architecture uses private persistence plus explicit service RPCs: alert/event data is stored in `stockscout_private`, while only narrow service-role functions are exposed through existing `stockscout_api`.
- The Edge Function is deployed as `stockscout-next-alerts`; frontend device isolation uses a capability-style device key hashed before persistence.

**Scoring / behavior impact**
- No Opportunity v2, Emerging Leader, MA Cluster, Group Leadership, Fundamentals, RS, Stage, chart mapping, default ranking or other StockScout Core field/score changed.
- Frozen LEGACY remains unchanged and shadow-only; alert evaluation is independent of LEGACY scoring and cannot alter StockScout candidate scores.
- No canonical scan payload, scanner methodology or normal publication behavior is modified by the alert layer.
- Stable `Garrincha077/stock-screener2` was not modified.
- Next scheduled nightly scan remains disabled.

**Backend / security validation**
- Initial implementation exposed a real integration issue: this older Supabase project's Data API does not expose the `public` schema used by the first draft. The design was corrected rather than widening database exposure: persistence moved behind the existing `stockscout_private` + `stockscout_api` service-RPC pattern already used by StockScout.
- Real browser-style backend list test after the gateway repair returned HTTP `200` with empty `alerts/events`.
- Real CRUD smoke: create returned HTTP `201`, the created test alert was readable, delete/cleanup succeeded, and the database was returned to `0` test alerts / `0` test events.
- Real evaluator request returned HTTP `200` against the currently published Next snapshot `generatedAt=2026-08-20T22:09:11.073071+00:00`; with no active user alerts it correctly reported `evaluated: 0`, `fired: 0`.
- Supabase security advisor reported no new critical issue. The RLS-with-no-policy INFO notices on the alert tables were intentional in the first closed-table iteration because direct anon/auth access was not used; the final service gateway keeps user data behind service-role RPCs. The `pg_net` public-schema warning is an extension placement limitation/pre-existing project-level advisory rather than an exposed alert-data policy.
- Telegram send support is implemented server-side only. Current status is intentionally `not_configured` because `stockscout_next_telegram_bot_token` and `stockscout_next_telegram_chat_id` have not yet been placed in Supabase Vault/runtime secrets; no token or chat ID was committed to GitHub or sent to the browser.

**Tests / audits / CI**
- Frontend Compile Smoke #71 / run `32503304465` on feature head `0527114c...`: **success**.
- StockScout Validation #136 / run `32503304544` on feature head `0527114c...`: **success**.
- These gates cover existing client/runtime tests, TypeScript/Vite build and StockScout regression/invariance checks; no Core or LEGACY drift was detected.
- Full Validation was not run for this slice because the alert system is a separate user-sidecar layer and does not change the StockScout scanner, canonical scan-data generation or normal scan/publish workflow path. Do not infer a Full Validation result from the green PR checks.

**Risk / decision**
- Keep the drawing/alert feature isolated from candidate scoring and canonical scan data. Do not turn alert state, line geometry or trigger history into a StockScout composite score.
- Keep browser access capability-scoped and database access behind the narrow service gateway; do not expose service-role credentials or Telegram credentials to the frontend.
- Hourly evaluation is acceptable because it evaluates the latest published snapshot only; it must not become a hidden replacement for or trigger of the disabled Next nightly scanner.
- PR #13 should remain draft until a real ticker drawing persists across reload/new snapshot and a real alert path is manually verified. Telegram delivery cannot be considered end-to-end verified until its Vault secrets are configured and one controlled test message succeeds.

**Next logical step**
- Configure the existing Telegram bot token and chat ID as Supabase Vault/runtime secrets without committing them to GitHub.
- Use a real ticker in the Next UI to verify drawing persistence after reload and then across the next published snapshot.
- Trigger one controlled `Touch` or crossing case and verify the event appears in `Recent Triggers`; once Telegram credentials are configured, verify the same event is delivered to the intended Telegram chat.
- Only after that manual end-to-end check should PR #13 be considered for promotion from draft; keep Stable untouched and keep the Next scheduled nightly scan disabled.
