# StockScout Next — Persistent Project Log

This file is the current durable handoff for `Garrincha077/StockScreener-next`. Historical entries through 2026-08-22 are preserved byte-for-byte in [`PROJECT_LOG_ARCHIVE_THROUGH_2026-08-22.md`](./PROJECT_LOG_ARCHIVE_THROUGH_2026-08-22.md).

Keep this file concise and factual. Update it after every meaningful code/workflow change.

## 2026-08-23 — Chart Alerts v2 A7 secure Telegram Settings

**Branch / PR / key commits**
- Branch: `next-dev`; draft PR #13 (`next-dev` -> `main`) remains open, draft, clean/mergeable and unmerged.
- A7 Vault migration: `87e4aab880ac22cf2286b8aa69df45098ac940c9`.
- Owner-scoped evaluator cutover: `165df61836eb93e2e935a7f6120724062bf297aa`.
- V2 Telegram settings gateway: `818c5dd58f522f7b965d26d91544aa77678fd813`.
- Client/API integration: `8cb19ef7af2c3e7aacd0eb0df0cfc8a6fd930dc8`.
- Settings UI/styles: `f8a423b6aefa8cf5bbe185cab445e290a8d07260`, `eb5243fcf31d70abfc654060f37392078e2d0e48`, `16d643720302eb2ced2271e3837d3a668bfff038`, `bb21eb4861fd7832f113502432152c4fdb7aa359`.
- Browser/security tests: `b0c16af293f62673842b379a580ae3dd10cea6d2`, verified code head `f30e79afb5732ecde8b2ca01420843a841fe2ae8`.
- Durable A7 checkpoint: `d1379d974e94049f02c5f10620ac0bdafd9d99f3`.
- One-shot A7 Pages trigger: `1c51c79ed1f6e5f60e51762a4d7ad6b382ec48a5`; immediate main-only safety restore/final workflow head: `520831a1a8d3aebba644a1c18cfda5364e2bcdcf`.

**What changed / why**
- Added `Alerts -> Settings -> Telegram Notifications` with masked Bot Token, Chat ID, `Save securely`, `Send test message`, `Replace credentials`, and `Disconnect Telegram`.
- Browser sends credentials once over HTTPS to the existing capability-authenticated V2 Edge Function. Saved token/chat ID are never returned to the browser and are never stored in localStorage/sessionStorage.
- V2 gateway validates token/chat shape and calls Telegram `getMe` before storing credentials. The controlled test message is fixed text: `StockScout Next Telegram alerts connected successfully.` It does not create a stock alert event.
- Added private owner-scoped Telegram connection metadata plus two owner-scoped Supabase Vault secrets (bot token + chat ID). Only safe connection metadata (`configured`, bot id/username, timestamps) is available to the UI.
- Added service-role-only RPCs for status, store/update, decrypted credential retrieval and disconnect. Direct private-table access and RPC execution are revoked from `public`, `anon` and `authenticated`.
- Evaluator no longer reads the previous global Telegram env/Vault secret path. On a newly inserted deduped alert event it resolves credentials using that alert row's `owner_key`, then sends server-side only. Telegram request failures are reduced to safe status text; token-bearing URLs are not copied into event errors.
- `Disconnect Telegram` removes the owner's connection row and Vault secrets/references. No global Telegram credential fallback remains in the evaluator.
- For the real-use A7 gate, Pages was staged exactly once by temporarily allowing `next-dev` in `frontend_pages.yml`; the very next commit restored the workflow byte-for-byte to `main`-only. Future experimental pushes therefore do not auto-deploy Pages.

**Affected components**
- `supabase/migrations/20260823011500_stockscout_next_alerts_v2_a7_telegram_vault.sql`.
- `supabase/functions/stockscout-next-alerts-v2/index.ts`.
- `supabase/functions/stockscout-next-alerts/index.ts`.
- `frontend/src/deepvue/chartAlerts.ts`.
- `frontend/src/TelegramSettingsPanel.tsx`.
- `frontend/src/ChartAlertsCenter.tsx`.
- `frontend/src/telegram-settings.css` and `frontend/src/main.tsx`.
- `frontend/e2e/chart-alerts-center.spec.ts`.
- `frontend/src/deepvue/chartAlertEvaluatorCutover.test.ts`.
- `.github/workflows/frontend_pages.yml` was only temporarily broadened for the one-shot A7 test deploy and then restored to its original main-only content.

**Live sidecar state**
- Supabase project: `jekidjsifihbbuzxrbse`.
- Applied live migration version `20260822230618`, name `stockscout_next_alerts_v2_a7_telegram_vault`.
- `stockscout-next-alerts-v2` deployed as **v3 ACTIVE**, `verify_jwt=false` because it retains the existing explicit `x-stockscout-device-key` capability authentication.
- `stockscout-next-alerts` evaluator deployed as **v5 ACTIVE**, `verify_jwt=false` because it retains the existing evaluator-key/device-key custom authentication paths.
- Transactional fake-data smoke completed and rolled back. Follow-up verification showed `0` dummy connection rows and `0` dummy Vault secrets; dummy owner status returned `configured:false`.
- Permission smoke: `anon` and `authenticated` have no execute privilege on Telegram status or decrypted-credentials RPCs; `service_role` does.
- No real Telegram credential or real test message was used by the agent. A7 real-use gate still requires the user to save their own bot/chat and receive the controlled test message.

**Tests / CI**
- Verified code head `f30e79afb5732ecde8b2ca01420843a841fe2ae8`: **Frontend Compile Smoke #166 / run `32604480681` SUCCESS** and **StockScout Validation #284 / run `32604480678` SUCCESS**.
- Verified final workflow head `520831a1a8d3aebba644a1c18cfda5364e2bcdcf`: **Frontend Compile Smoke #169 / run `32604647149` SUCCESS** and **StockScout Validation #287 / run `32604647163` SUCCESS**. The frontend run included runtime tests, TypeScript/Vite build and mobile Playwright; StockScout Validation included frozen LEGACY graph/invariance, regression/integration, model compatibility, MA Cluster, Scout Tier and frontend checks.
- Browser E2E mocks full Telegram flow and asserts saved token/chat are absent from rendered UI after connection.
- Source-level security tests assert owner-scoped Vault functions, service-role-only credential path, no global Telegram evaluator secret path and no browser Telegram local/session storage.
- Full Validation was not run: this slice changes only the isolated alert sidecar/API/UI/evaluator notification routing plus the reversible Pages branch-filter trigger; it does not change scan generation, canonical scan data or the production-style scan/publish workflow behavior.

**Scoring / guardrails**
- No Opportunity v2, Emerging Leader, MA Cluster, Group Leadership, Fundamentals, RS, Stage, chart mapping, default rank or other StockScout Core behavior changed.
- Frozen LEGACY remains unchanged and shadow-only.
- Stable `Garrincha077/stock-screener2` was not modified.
- Next scheduled nightly scan remains disabled.

**Risk / next step**
- User reported the prior Pages A5/A6 drawing/alert test appeared to work, but the agent still does not claim an independently observed real trigger replay/dedupe event.
- A7 code/backend/security gates are green. Perform the A7 real-use test on the Pages surface: Save -> reload -> connected status without secret reveal -> controlled test message arrives -> Disconnect -> status becomes not configured.
- If that passes, close A7 and continue to roadmap A8 cross-device alert identity/sync. Keep PR13 draft until the remaining real-use gates are accepted.

## 2026-08-23 — Earlier one-shot GitHub Pages test deployment preparation

- Commit `a0ce736759ce69d72c748fab2eaeec430901ec6d` temporarily allowed `next-dev` in `.github/workflows/frontend_pages.yml` solely to trigger one Pages test build.
- Commit `c1d40cd68787b218540e894c92cabc2f7b8b8eb1` immediately restored the workflow byte-for-byte to `main`-only, so later experimental pushes do not auto-deploy Pages.
- The test surface is the `StockScreener-next` GitHub Pages site only; Stable is untouched. The Pages pipeline still reads the latest Stable canonical snapshot read-only, builds the Next projection/LEGACY shadow, hydrates chart shards best-effort, runs frontend checks and then deploys.
- User subsequently reported the Pages chart drawing/alert workflow appeared to work. Treat this as a useful manual smoke, not proof of a real trigger replay/dedupe gate.

## 2026-08-23 — Chart Alerts v2 A5/A6 closeout and PR13 reconciliation

- A5 Global Alerts Center exposes Active, Near Trigger, Triggered, Paused and All Drawings; Near Trigger is an explicit `<=2%` geometric-distance view, not a score.
- A6 added persisted event `read_at`, owner-scoped read/unread RPC/API/UI, unread `New` labels and unread count on the global Alerts launcher.
- Existing true-cross D/W geometry, one-shot/re-arm mechanics and event dedupe were preserved. Telegram send remains gated behind a newly inserted event id, so a deduped replay cannot resend the same event.
- PR13 ancestry was reconciled with already-promoted PR14 Factor Regime via `7d7e426e026fba7c276bb084efe32981cc7b07fa`; Factor files/workflow are no longer accidental PR13 diff noise.
- Verified A5/A6 code head `e6980ee122594582bbaf71e7a06c60d24afdb448`: Frontend Compile Smoke #152 SUCCESS and StockScout Validation #264 SUCCESS. Subsequent docs head also passed #153/#265.
- A6 live migration `20260822223233` is applied and V2 Edge read/unread support is live. At that verification point there were no real alert events, so the agent did not claim a real trigger/read/replay gate.
