# StockScout Next — Persistent Project Log

This file is the current durable handoff for StockScreener-next. Historical entries through 2026-08-22 are preserved byte-for-byte in [`PROJECT_LOG_ARCHIVE_THROUGH_2026-08-22.md`](./PROJECT_LOG_ARCHIVE_THROUGH_2026-08-22.md). Read that archive when older decisions or validation history are relevant.

Keep this file concise and factual. Update it after every meaningful code/workflow change.

## 2026-08-23 — Chart Alerts v2 A5/A6 closeout and PR13 reconciliation

**Branch / PR / commits**
- Branch: `next-dev`; draft PR #13 (`next-dev` -> `main`) remains open, draft and unmerged.
- A5 viewport-gate repair: `728211d5060cd767dfc62e0c2e7aead11f3deac8`.
- A6 implementation sequence: `c9599605d4f3ceb51bfef0e73ea9046342ba66b6`, `70a16d17c695adb360571abcc7afd85391715156`, `b2546641e24014458eb9b2343b982067fc902807`, `8692715abb1eb60e8df3757bfda635b92fa57d1a`, `d4a6ce5a5e56e095a696c859339665d6b4df6a63`, `4c3500e85dccff8cb4590b6435ae4473b4bd6817`, `97e2bcf524c186f820e7e24a4c7bc4cf451362e6`, `53e550cde862e6d04d4410bb07cccdca463377bc`.
- A5 explicit Near Trigger threshold: `702f4cde912e488feedcb91b9b2f39a9696065b8`.
- First durable log checkpoint: `22a34e4794e26a5b8ba2f4d02f2416543be327aa`.
- Factor workflow aligned to the already-promoted `main` version: `b76be5f82d4eedf8302d144b5f7c31523cffb98f`.
- Ancestry-only reconciliation with current `main`: merge commit `7d7e426e026fba7c276bb084efe32981cc7b07fa`; this kept the existing `next-dev` tree while adding `main` as the second parent.
- Final viewport-neutral A5/A6 browser-test fixes: `f0db1202c26aa95473950e621967f432bac197ff`, then **verified code head** `e6980ee122594582bbaf71e7a06c60d24afdb448`.

**What changed / why**
- Audited the Chart Alerts v2 roadmap against the actual branch. A5 Global Alerts Center was already implemented but had not been formally closed in the durable log. It exposes Active, Near Trigger, Triggered, Paused and All Drawings views, ticker filtering and exact drawing focus.
- A5 Near Trigger now uses an explicit visible `<=2%` absolute geometric-distance threshold and sorts nearest-first. It remains a transparent geometric distance view, not a StockScout score.
- The original A5 browser failures were test-only viewport assumptions. The final E2E flow now enters through `All Alerts`, avoids desktop-only top-nav assumptions, verifies Price/Daily chart focus through viewport-neutral DOM selectors, opens the exact saved ticker/drawing, then verifies unread state after the mobile manager is closed.
- A6 audit confirmed true cross semantics, exact D/W geometry, one-shot handling, re-arm behavior, per-snapshot event dedupe and server-side Telegram sending already existed in the evaluator path. Those mechanics were preserved rather than duplicated.
- Added the missing A6 in-app read/unread lifecycle: persisted alert events now have `read_at`; a narrow owner-scoped service RPC can mark one event read/unread; the V2 Edge gateway exposes only that capability; the client normalizes `readAt`, updates state optimistically, and refreshes on failure.
- Global Alerts Center now shows unread count, labels unread trigger events as `New`, and marks a trigger read when opened. The floating `All Alerts` badge counts unread trigger events rather than active rules.
- Telegram credential management was intentionally not folded into A6. Secure owner-scoped in-app Telegram setup remains roadmap A7.
- PR13 had become non-mergeable only because PR14 Factor Regime had been promoted independently from a separate branch directly into `main`. Factor page/builder/CSS/tests/published artifact were already equivalent or superseded on `next-dev`; the only relevant mismatch was the older broad Factor workflow. That workflow was aligned to the clean PR14/main version and `main` was then reconciled as a second parent. GitHub now reports PR13 `mergeable=true`, `mergeable_state=clean`.
- After reconciliation, Factor builder/page/CSS/tests/artifact/workflow no longer appear in PR13 changed filenames; the PR diff is again Chart Alerts plus its direct frontend integration/docs.

**Affected files / components**
- `supabase/migrations/20260823003000_stockscout_next_alerts_v2_a6_event_read_state.sql`.
- `supabase/functions/stockscout-next-alerts-v2/index.ts`.
- `frontend/src/deepvue/chartAlerts.ts`.
- `frontend/src/ChartAlertsProvider.tsx`.
- `frontend/src/ChartAlertsCenter.tsx`.
- `frontend/src/Root.tsx`.
- `frontend/e2e/chart-alerts-center.spec.ts`.
- `frontend/src/deepvue/chartAlertEvaluatorCutover.test.ts`.
- `.github/workflows/factor_regime_update.yml` was only aligned back to the already-promoted `main` implementation during branch reconciliation; no Factor model/data behavior was newly introduced here.
- No scanner, canonical scan-data builder, StockScout scoring/model file or frozen LEGACY implementation changed.

**Backend / live sidecar state**
- Supabase project: `jekidjsifihbbuzxrbse`.
- Applied live migration version `20260822223233`, name `stockscout_next_alerts_v2_a6_event_read_state`; the repository migration filename uses local timestamp `20260823003000` but represents the same SQL contract.
- Deployed `stockscout-next-alerts-v2` as version **2 ACTIVE**. `verify_jwt=false` remains deliberate because the existing function uses capability-style `x-stockscout-device-key` authentication and hashes the device key to the owner key server-side.
- Live database smoke confirmed `read_at` exists and an owner-scoped read request for a nonexistent event returns `false` rather than touching another owner. At verification time the live alert-event table contained `0` events, so a real trigger read/unread transition is not yet claimed end-to-end.

**Scoring / behavior impact**
- No Opportunity v2, Emerging Leader, MA Cluster, Group Leadership, Fundamentals, RS, Stage, chart mapping, default rank or any other StockScout Core score changed.
- Frozen LEGACY remains unchanged and shadow-only.
- Alert drawing/rule/status/event/read state remains an isolated private sidecar and cannot influence candidate scoring.
- Stable `Garrincha077/stock-screener2` was not modified.
- Next scheduled nightly scan remains disabled.

**Tests / audits / CI**
- Historical A5 head `a7173c25...`: StockScout Validation run `32534114068` succeeded. Frontend Compile Smoke run `32534114414` failed only on two viewport-specific Playwright selectors; 43 runtime tests and TypeScript/Vite build passed.
- Reconciled head `7d7e426...`: Frontend Compile Smoke #150 reproduced one remaining mobile-only test assumption after all runtime/build steps passed.
- Head `f0db120...`: Frontend Compile Smoke #151 exposed one final desktop-only `Screener` selector on Pixel 5; again 45 runtime tests and TypeScript/Vite build passed.
- **Verified code head `e6980ee122594582bbaf71e7a06c60d24afdb448`: Frontend Compile Smoke #152 completed SUCCESS, including runtime tests, TypeScript/Vite build and all 12 Playwright E2E tests.**
- **Verified code head `e6980ee122594582bbaf71e7a06c60d24afdb448`: StockScout Validation #264 completed SUCCESS**, including frozen LEGACY execution graph/invariance, regression/integration tests, current model application, integrated compatibility audit, MA Cluster audit, Scout Tier audit and frontend runtime/build.
- A6 source-level tests lock dedupe/Telegram ordering: Telegram send remains gated behind a newly inserted event ID, so replaying a deduped snapshot cannot resend the same message.
- Full Validation was not run because this slice changes only the isolated alert sidecar/UI/API and a branch-reconciliation copy of the already-promoted Factor workflow; it does not alter StockScout scan generation, canonical scan data or the normal scan/publish workflow path.

**Risk / decision**
- PR13 is clean/mergeable but remains draft intentionally; do not merge it into `main` until a controlled real alert persistence/trigger test is completed and A6 is accepted.
- A6 live read/unread schema/API is deployed but still lacks a real trigger event for an end-to-end manual persistence test.
- Existing Telegram send logic must not be called end-to-end configured until A7 securely stores owner-scoped credentials and a controlled test message succeeds.
- Keep the V1 compatibility mirror until the remaining v2 lifecycle/cross-device cleanup is deliberately validated.

**Next logical step**
- Perform one controlled real-use A6 validation: create a saved D or W line/rule, reload to prove persistence, deliberately trigger one event, confirm `New` -> read survives reload, then replay the same snapshot and confirm zero duplicate event/message.
- If that passes, treat A5/A6 as closed and continue to roadmap A7: owner-scoped secure Telegram Settings using Supabase Vault, masked write-only credentials, `getMe`/test message, replace/disconnect and no secret exposure to browser storage/logs.
- Keep Stable untouched and keep the Next scheduled nightly scan disabled.
