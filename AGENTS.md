# StockScout Next — Agent Rules

Repository: `Garrincha077/StockScreener-next`
Production/stable fallback: `Garrincha077/stock-screener2`
Development branch: `next-dev`

## Working rules

1. Treat `stock-screener2` as production. Do not modify it unless the user explicitly asks.
2. Do experimental development in `StockScreener-next`, normally on `next-dev`. Keep `main` as the controlled Next baseline until a change is validated.
3. Preserve the existing StockScout Core unless a change is explicitly intended and validated: Opportunity v2, Emerging Leader, MA Cluster, Group Leadership, Fundamentals, RS, Stage and chart mapping.
4. Keep the original/LEGACY methodology frozen. New LEGACY-derived features belong in an adapter/confirmation layer, not by modifying the original engine.
5. During shadow-mode development, LEGACY may observe and classify StockScout candidates but must not mutate StockScout scoring.
6. Prefer small, reversible changes. Avoid adding another opaque mega-score when a transparent field, badge, filter or explanation is enough.
7. Run the relevant tests/audits after code changes. Use Full Validation for changes that affect the production-style scan/data/workflow path. Never report CI as green unless it was actually verified.
8. Do not re-enable the scheduled nightly scan in Next until the project is explicitly promoted to production candidate.

## Mandatory project memory in GitHub

After every meaningful code or workflow change, update `docs/PROJECT_LOG.md` so another agent can continue without relying on chat history.

Record at minimum:
- date/time or date;
- branch and commit SHA;
- what changed and why;
- files/components affected;
- behavior/model impact, especially whether scoring changed;
- tests/audits/CI run and their result;
- important decision or regression risk;
- logical next step.

Prefer updating the log in the same commit as the code change. If that is impractical, use the immediately following commit. Do not record secrets, tokens or credentials.

Before starting substantial work, read:
- `AGENTS.md`
- `docs/PROJECT_LOG.md`
- `docs/STOCKSCOUT_NEXT_ROADMAP.md`
- `docs/STOCKSCOUT_NEXT_GUARDRAILS.md`

If chat context conflicts with the repository, verify the current GitHub state before acting.