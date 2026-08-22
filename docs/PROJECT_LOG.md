# StockScout Next — Persistent Project Log

This file is the current durable handoff for StockScreener-next. Historical entries through 2026-08-22 are preserved byte-for-byte in [`PROJECT_LOG_ARCHIVE_THROUGH_2026-08-22.md`](./PROJECT_LOG_ARCHIVE_THROUGH_2026-08-22.md). Read that archive when older decisions or validation history are relevant.

Keep this file concise and factual. Update it after every meaningful code/workflow change.

## 2026-08-23 — Chart Alerts v2 A5 gate repair + A6 unread trigger lifecycle

**Branch / PR / commits**
- Branch: `next-dev`; draft PR #13 (`next-dev` -> `main`) remains open, draft and unmerged.
- A5 viewport-gate repair: `728211d5060cd767dfc62e0c2e7aead11f3deac8`.
- A6 implementation sequence: `c9599605d4f3ceb51bfef0e73ea9046342ba66b6`, `70a16d17c695adb360571abcc7afd85391715156`, `b2546641e24014458eb9b2343b982067fc902807`, `8692715abb1eb60e8df3757bfda635b92fa57d1a`, `d4a6ce5a5e56e095a696c859339665d6b4df6a63`, `4c3500e85dccff8cb4590b6435ae4473b4bd6817`, `97e2bcf524c186f820e7e24a4c7bc4cf451362e6`, `53e550cde862e6d04d4410bb07cccdca463377bc`.
- A5 transparent Near Trigger threshold: `702f4cde912e488feedcb91b9b2f39a9696065b8`.
- Final code head before this documentation-only commit: `702f4cde912e488feedcb91b9b2f39a9696065b8`.

**What changed / why**
- Audited the Chart Alerts v2 roadmap against the actual branch. A5 Global Alerts Center was already implemented but had not been formally closed in the durable log. It already exposes Active, Near Trigger, Triggered, Paused and All Drawings views, ticker filtering and exact drawing focus.
- The previous A5 Frontend Compile Smoke failure was isolated to viewport-specific Playwright selectors: the test attempted to click desktop-only `Grid` on Pixel 5 and used an ambiguous `RAPID REVIEW` text locator. The test now enters through the global `All Alerts` control and is viewport-agnostic.
- A5 Near Trigger now uses an explicit visible `<=2%` absolute geometric-distance threshold and sorts nearest-first. It remains a transparent distance view, not a StockScout score.
- A6 audit confirmed that true cross semantics, D/W geometry, one-shot handling, re-arm behavior, per-snapshot event dedupe and server-side Telegram sending already existed in the A2 evaluator path. Those mechanics were preserved instead of duplicated.
- Added the missing A6 in-app read/unread lifecycle: persisted alert events now have `read_at`; a narrow owner-scoped service RPC can mark one event read/unread; the V2 Edge gateway exposes only that capability; the client normalizes `readAt`, updates state optimistically, and refreshes on failure.
- Global Alerts Center now shows unread count, labels unread trigger events as `New`, and marks a trigger read when opened. The floating `All Alerts` badge now counts unread trigger events rather than active rules.
- Telegram credential management was intentionally not folded into A6. Secure in-app Telegram setup remains roadmap A7.

**Affected files / components**
- `supabase/migrations/20260823003000_stockscout_next_alerts_v2_a6_event_read_state.sql`.
- `supabase/functions/stockscout-next-alerts-v2/index.ts`.
- `frontend/src/deepvue/chartAlerts.ts`.
- `frontend/src/ChartAlertsProvider.tsx`.
- `frontend/src/ChartAlertsCenter.tsx`.
- `frontend/src/Root.tsx`.
- `frontend/e2e/chart-alerts-center.spec.ts`.
- `frontend/src/deepvue/chartAlertEvaluatorCutover.test.ts`.
- No scanner, canonical scan-data builder, StockScout scoring/model file or frozen LEGACY implementation changed.

**Backend / live sidecar state**
- Supabase project: `jekidjsifihbbuzxrbse`.
- Applied live migration version `20260822223233`, name `stockscout_next_alerts_v2_a6_event_read_state`; the repository migration filename uses the local timestamp `20260823003000` but represents the same SQL contract.
- Deployed `stockscout-next-alerts-v2` as version **2 ACTIVE**. `verify_jwt=false` remains deliberate because this existing function uses its capability-style `x-stockscout-device-key` authentication and hashes the device key to the owner key server-side.
- Live database smoke confirmed `read_at` exists and an owner-scoped read request for a nonexistent event returns `false` rather than touching another owner. At verification time the live alert-event table contained `0` events, so no real trigger read/unread transition can yet be claimed end-to-end.

**Scoring / behavior impact**
- No Opportunity v2, Emerging Leader, MA Cluster, Group Leadership, Fundamentals, RS, Stage, chart mapping, default rank or any other StockScout Core score changed.
- Frozen LEGACY remains unchanged and shadow-only.
- Alert drawing/rule/status/event/read state remains an isolated private sidecar and cannot influence candidate scoring.
- Stable `Garrincha077/stock-screener2` was not modified.
- Next scheduled nightly scan remains disabled.

**Tests / audits / CI**
- Historical A5 head `a7173c25...`: StockScout Validation run `32534114068` was **success**. Frontend Compile Smoke run `32534114414` failed only in the two A5 Playwright selectors described above; its 43 runtime tests and TypeScript/Vite build passed.
- A5 test repair and A6 now add explicit browser coverage for global-center views, transparent Near Trigger distance, unread badge/header state, `New` trigger display, owner API `event_read`, opening the exact ticker/drawing, correct Price/Daily focus and persisted drawing rendering.
- A6 source-level tests additionally lock the dedupe/Telegram ordering: Telegram send remains gated behind a newly inserted event ID, so replaying a deduped snapshot cannot resend the same message.
- Current head GitHub PR workflow runs were not available after these commits; recent branch runs had `action_required`/no jobs. Therefore current CI is **not claimed green**.
- No local clone-based test run is claimed from this session because the execution environment could not resolve GitHub for a fresh clone.
- Full Validation was not run because this slice changes only the isolated alert sidecar/UI/API and does not alter StockScout scan generation, canonical scan data or the normal scan/publish workflow path.

**Risk / decision**
- PR #13 is currently reported non-mergeable and the branch is topologically diverged from current `main` after separate Factor Regime promotion work. Do not merge the draft PR until branch topology/conflicts are deliberately reconciled and current checks are verified.
- A6 live read/unread behavior is schema/API-deployed but still lacks a real trigger event for an end-to-end manual test.
- Existing Telegram send logic must not be called end-to-end configured until A7 securely stores owner-scoped credentials and a controlled test message succeeds.
- Keep the V1 compatibility mirror until the remaining v2 lifecycle/cross-device cleanup is deliberately validated.

**Next logical step**
- First get the A5/A6 Frontend Compile Smoke and StockScout Validation checks to actually run and pass on the reconciled `next-dev` head; do not infer green from older runs.
- Then create or use one controlled real drawing/rule, verify persistence across reload, generate one deliberate trigger, confirm `New` -> read state survives reload, and confirm replay produces no duplicate event/message.
- After A6 real-use validation, continue to roadmap A7: owner-scoped secure Telegram Settings in the app using Supabase Vault, masked write-only credentials, `getMe`/test message, replace/disconnect and no secret exposure to browser storage/logs.
- Keep Stable untouched and keep the Next scheduled nightly scan disabled.
