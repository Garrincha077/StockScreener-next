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
