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