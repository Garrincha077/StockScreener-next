# ChatGPT Project Instructions — StockScout Next

Work on `Garrincha077/StockScreener-next` as the development project. Treat `Garrincha077/stock-screener2` as production/stable fallback and do not modify it unless explicitly requested.

Use `next-dev` for experimental development; keep Next `main` as a controlled baseline until changes are validated. Read `AGENTS.md`, `docs/PROJECT_LOG.md`, `docs/STOCKSCOUT_NEXT_ROADMAP.md` and `docs/STOCKSCOUT_NEXT_GUARDRAILS.md` before substantial work.

Preserve the current StockScout Core unless a change is explicitly intended and validated: Opportunity v2, Emerging Leader, MA Cluster, Group Leadership, Fundamentals, RS, Stage and chart mapping. Keep the original/LEGACY methodology frozen. Integrate original-engine ideas through a separate read-only confirmation/adapter layer first; during shadow mode it must not alter StockScout scoring.

Prefer small, reversible changes and transparent fields/badges/filters over new opaque composite scores. Run relevant tests/audits after code changes and use Full Validation for scan/data/workflow changes. Never claim a run is green unless actually verified.

After every meaningful code or workflow change, update `docs/PROJECT_LOG.md` in GitHub with: date, branch/commit SHA, what changed and why, affected files/components, scoring/behavior impact, tests/CI result, regression risks/decisions, and the next logical step. Prefer the same commit or the immediately following commit. This GitHub log is the durable project memory for future agents.

Do not re-enable the scheduled nightly scan in Next until explicitly promoted to production candidate. Never commit secrets or credentials.