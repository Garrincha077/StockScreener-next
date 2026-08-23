# StockScout Next — Persistent Project Log

This file is the current durable handoff for `Garrincha077/StockScreener-next`. Historical entries through 2026-08-22 are preserved byte-for-byte in [`PROJECT_LOG_ARCHIVE_THROUGH_2026-08-22.md`](./PROJECT_LOG_ARCHIVE_THROUGH_2026-08-22.md).

Keep this file concise and factual. Update it after every meaningful code/workflow change.

## 2026-08-23 — A8 Pages staging checkpoint

- A8 one-shot Pages trigger commit: `448549238be66a198e39c718ce6a26f1309565da` temporarily allowed `next-dev` in `.github/workflows/frontend_pages.yml` solely to stage the already-green A8 frontend on the StockScreener-next Pages test surface.
- Immediate safety restore: `ed906d5ee1340de2dccad4765a9e01fd5a43346b` restored the Pages workflow byte-for-byte to `main`-only. Future experimental `next-dev` pushes therefore do not auto-deploy Pages.
- Final workflow restore head `ed906d5ee1340de2dccad4765a9e01fd5a43346b`: **Frontend Compile Smoke #186 / run `32626436528` SUCCESS** and **StockScout Validation #311 / run `32626436517` SUCCESS**.
- This staging change did not alter scan generation, canonical data, StockScout Core, frozen LEGACY, Stable, or the disabled Next nightly schedule. A8 now waits only for the real two-device Pages gate described below.

## 2026-08-23 — Chart Alerts v2 A8 cross-device recovery-key sync

**Branch / PR / key commits**
- Branch: `next-dev`; draft PR #13 (`next-dev` -> `main`) remains open and unmerged.
- User confirmed the A7 real-use gate works on Pages before A8 work began: Telegram save/reload/connected state/test-message flow was accepted by the user. No credential was shared in chat.
- A8 sync profile/device-link migration: `8b1ea1ef9fa8a30aa59537a30104289f9a5b37bc`.
- Canonical-owner resolution in the existing V2 alert gateway: `8fe43453806afcb864b07898a3e5a79d222b0e8d`.
- Isolated recovery-key sync Edge gateway: `89ff3f729fad64336ed5f0c2e618313899f5f06d`, then rotate support `a978066075db2f2cd5a35e9ec0515619980c1f09`.
- Recovery-key rotation RPC: `9f84243ff9903378155118af3913bded7914c439`.
- Frontend client/UI integration: `0734ad2ff8f5fc1957fddfb3adf7bd8f315444a4`, `4aaefec5221ca08a0f9473ec9b322c18a241502a`, `d953e59d0aae8dd4ebc3d23ab7436c5929b56204`, `4a25ed7ed861b4d94bca7d83359f003279352828`, `edce85f84a10339a4ff0de9b27af23fcb379a22d`.
- A8 security/browser tests: `227298e62a0eec1d496fc6a5b2d2c2ae2238e293`, `f842bdc26d3f8c1faa8bf4bd27f27911171aeba9`.
- Test-only false-positive repair: `414b50423a7db3ece870ac8fcc77ca46e01d0aae`; the original assertion rejected the explanatory words `localStorage/sessionStorage`, not actual storage API use. It now rejects real `setItem/getItem` calls instead.

**Architecture / behavior**
- A8 uses a user-managed Alerts Recovery/Sync Key rather than adding account/email auth. This keeps the personal app incremental and preserves the existing capability-key identity abstraction.
- The first device that enables sync becomes the canonical alert owner. Additional devices authenticate with their existing browser device capability, present the recovery key once, and are mapped server-side to that canonical owner.
- Recovery keys are 128-bit client-generated values formatted `SSN2-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`. The raw key is sent only to the isolated sync Edge Function, hashed with SHA-256 there, and only the hash is persisted. The raw key is never stored in Postgres, localStorage or sessionStorage.
- The primary device may rotate the recovery key. Rotation changes only the stored hash: already-linked devices remain connected while old keys can no longer add devices.
- Existing secondary-browser state is preserved. Joining transactionally re-owners the current alert sidecar rows to the canonical owner while UUID relationships remain unchanged: compatibility chart alerts, drawings, alert rules, alert status and trigger events are all moved together.
- Existing Telegram Vault credentials are preserved. If only the joining owner has Telegram configured, its connection row and Vault secret names are moved to the canonical owner without decrypting/exposing credentials. If both owners independently have Telegram configured, the join fails closed and requires one configuration to be disconnected first; no credential is overwritten.
- The normal V2 alert gateway now resolves each browser-device owner to its canonical owner before snapshot/drawing/rule/event/Telegram operations. Unlinked browsers resolve to themselves, so A8 is backward-compatible until sync is explicitly enabled.
- Sync operations live in a separate `stockscout-next-alert-sync` Edge Function rather than expanding the Telegram/alert gateway with recovery-key operations.

**Affected components**
- `supabase/migrations/20260823073000_stockscout_next_alerts_v2_a8_cross_device_sync.sql`.
- `supabase/migrations/20260823073500_stockscout_next_alerts_v2_a8_recovery_rotate.sql`.
- `supabase/functions/stockscout-next-alerts-v2/index.ts`.
- `supabase/functions/stockscout-next-alert-sync/index.ts`.
- `frontend/src/deepvue/chartAlerts.ts`.
- `frontend/src/AlertSyncSettingsPanel.tsx`.
- `frontend/src/alert-sync-settings.css`.
- `frontend/src/ChartAlertsCenter.tsx` and `frontend/src/main.tsx`.
- `frontend/src/deepvue/chartAlertEvaluatorCutover.test.ts`.
- `frontend/e2e/chart-alerts-center.spec.ts`.

**Live sidecar state / migrations**
- Supabase project: `jekidjsifihbbuzxrbse`.
- Applied live migration `20260823073834`, name `stockscout_next_alerts_v2_a8_cross_device_sync`.
- Applied live migration `20260823073844`, name `stockscout_next_alerts_v2_a8_recovery_rotate`.
- `stockscout-next-alerts-v2` is **v4 ACTIVE**, with existing explicit device-key capability authentication (`verify_jwt=false`) plus canonical-owner resolution.
- New isolated `stockscout-next-alert-sync` is **v1 ACTIVE**, `verify_jwt=false` because it implements the same explicit device-key capability authentication before any sync RPC.
- Before any user A8 activation, live state remained exactly `5` drawings, `2` rules, `0` trigger events and `1` Telegram connection; there were `0` sync profiles and `0` device links. Therefore deployment itself did not merge or mutate either existing browser owner.
- Permission smoke: `anon` and `authenticated` cannot execute the sync-status/owner-resolver RPCs; `service_role` can. Direct sync tables are revoked from `public`, `anon` and `authenticated`.
- Supabase security advisor reported no new A8-specific warning; existing project notices remain the previously known private-table RLS-without-policy informational notices plus unrelated `pg_net`/Auth advisories.

**Live transactional validation**
- Dummy primary owner created a sync profile; dummy secondary owner created an actual drawing + rule through existing RPCs, then joined the primary profile.
- After join, secondary owner resolved to the primary owner, the drawing/rule existed under the primary owner, and no secondary-owned drawing remained.
- Both primary and secondary sync status reported enabled/linked with `deviceCount=2`; primary-device flags were correct.
- Recovery-hash rotation succeeded while both device links stayed intact.
- Separate transaction created two dummy Telegram connection rows; sync join failed with the intended `both device profiles have Telegram configured` conflict instead of overwriting either connection.
- All dummy tests were rolled back. Follow-up verification showed `0` dummy sync profiles, `0` dummy device links and `0` dummy drawings.

**Tests / CI**
- Initial A8 head `f842bdc26d3f8c1faa8bf4bd27f27911171aeba9` failed Frontend #182 / StockScout #306 only because one source-level assertion matched the explanatory UI words `localStorage/sessionStorage`; 51/52 runtime tests passed and the failure occurred before build/browser execution.
- Corrected A8 code head `414b50423a7db3ece870ac8fcc77ca46e01d0aae`: **Frontend Compile Smoke #183 / run `32626289513` SUCCESS**, including runtime tests, TypeScript/Vite build and mobile Playwright.
- Same corrected head: **StockScout Validation #308 / run `32626289565` SUCCESS**, including frozen LEGACY execution graph, regression/integration tests, current model application, compatibility audit, MA Cluster audit, Scout Tier audit, exact LEGACY invariance/client artifact checks and frontend runtime/build.
- Browser E2E verifies the one-time recovery key format, confirms the raw key is absent from localStorage/sessionStorage, hides it after `I saved it`, rotates to a different key, and preserves the existing A7 Telegram and Alerts Center flows.
- Full Validation was not run because A8 changes only the private alert sidecar identity/API/UI. Scan generation, canonical scan data and publish workflow are unchanged.

**Scoring / guardrails**
- No Opportunity v2, Emerging Leader, MA Cluster, Group Leadership, Fundamentals, RS, Stage, chart mapping, default ranking or other StockScout Core behavior changed.
- Frozen LEGACY remains unchanged and shadow-only.
- Stable `Garrincha077/stock-screener2` was not modified.
- Next scheduled nightly scan remains disabled.

**Next logical step / A8 real-use gate**
- A8 has been staged once to the reversible StockScreener-next Pages test surface and the workflow trigger is back to `main`-only.
- On the device that should keep the current Telegram connection/canonical alert set, enable sync and save the one-time recovery key privately.
- On the second device, enter that key and link. Existing drawings on the second browser should merge rather than disappear. Because live state currently has only one Telegram connection, the expected join path has no credential conflict.
- Verify both devices show the same drawings/rules/Telegram connection metadata; create one new drawing on either device and refresh the other to prove cross-device propagation.
- Do not paste the recovery key into chat. If the real-use gate passes, close A8 and continue A9 operational/UX hardening. Keep PR13 draft until the remaining promotion gates are explicitly accepted.

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

**Live / real-use acceptance**
- User confirmed on 2026-08-23 that the A7 Pages flow works. Treat A7 as accepted for real use: the secure settings flow and controlled Telegram test were reported successful by the user.
- The user did not share any Telegram token/chat credential in the conversation.

**Tests / CI / guardrails**
- Verified code head `f30e79afb5732ecde8b2ca01420843a841fe2ae8`: Frontend Compile Smoke #166 / `32604480681` SUCCESS and StockScout Validation #284 / `32604480678` SUCCESS.
- Verified workflow head `520831a1a8d3aebba644a1c18cfda5364e2bcdcf`: Frontend Compile Smoke #169 / `32604647149` SUCCESS and StockScout Validation #287 / `32604647163` SUCCESS.
- A7 did not change StockScout Core, frozen LEGACY, Stable, canonical scan data or the disabled Next nightly schedule.

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
