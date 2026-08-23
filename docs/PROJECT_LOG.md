# StockScout Next — Persistent Project Log

This file is the current durable handoff for `Garrincha077/StockScreener-next`. Historical entries through 2026-08-22 are preserved byte-for-byte in [`PROJECT_LOG_ARCHIVE_THROUGH_2026-08-22.md`](./PROJECT_LOG_ARCHIVE_THROUGH_2026-08-22.md).

Keep this file concise and factual. Update it after every meaningful code/workflow change.

## 2026-08-23 — Chart Alerts PR #13 merged and closed

- PR #13 (`next-dev` -> `main`) was promoted out of draft and squash-merged after the validated Chart Alerts scope was frozen. Merge commit on Next `main`: `9ab658b24a775ccc5ab2a32391200c97d708dc11`.
- Final PR head before merge: `a0931393a6367d96d8fd709a0ac4fdd321fbd130`. **Frontend Compile Smoke #200 / run `32633130995` SUCCESS** and **StockScout Validation #332 / run `32633130992` SUCCESS**. Validation #332 completed the frozen LEGACY execution check, regression/integration tests, model compatibility audit, MA Cluster and Scout Tier audits, exact LEGACY invariance/client-artifact checks, and frontend runtime/TypeScript/Vite build. PR review threads were empty.
- The A9-triggered **StockScout Full Validation** gate was already accepted from the successful GitHub Actions run visually confirmed by the user. The stale `data/daily_scans/full_validation_status.json` recorder was intentionally not repaired inside this promotion cycle because changing workflow plumbing would have needlessly retriggered the expensive gate.
- Chart Alerts is now considered **feature-complete and closed for PR #13**. Final scope includes persistent horizontal/trendline drawings, D/W-consistent Cross Above / Cross Below / Touch rules, owner-scoped Supabase persistence/events, one-shot/dedupe evaluator behavior, secure Telegram Vault settings and delivery, recovery-key two-device sync, global Alerts Center health/review UX, and deterministic chart hydration/cache publish hardening.
- Behavior impact: Chart Alerts functionality is now part of the controlled StockScout Next `main` baseline. No Opportunity v2, Emerging Leader, MA Cluster, Group Leadership, Fundamentals, RS, Stage, chart mapping, default ranking or other StockScout Core scoring behavior changed. Frozen LEGACY remains shadow-only.
- Stable `Garrincha077/stock-screener2` remains untouched. The Next scheduled nightly scan remains disabled and was not re-enabled by the merge. This merge does **not** promote Next to the Phase 8 production-candidate state.

**Next logical step**
- Do not add more Chart Alerts features to PR #13. Any future alert enhancement should start in a separate, narrowly scoped PR. Continue StockScout Next from the roadmap/guardrails with `main` as the new validated Chart Alerts baseline and `next-dev` for the next experimental unit of work.

## 2026-08-23 — A9 Full Validation accepted; promotion audit

- User visually confirmed the latest A9-triggered **StockScout Full Validation** run is green in the GitHub Actions UI on 2026-08-23. Treat the A9 workflow-level gate as accepted. The GitHub connector available in this session cannot enumerate push-triggered Full Validation runs, and the existing `data/daily_scans/full_validation_status.json` recorder is stale at the older 2026-08-20 run, so the exact new run id/SHA is intentionally not guessed or fabricated.
- Current PR #13 promotion head before this documentation-only closeout was `c60b31dc9eb73cddc4e2bfb0c68db090dfb29975`: **Frontend Compile Smoke #199 / run `32630694597` SUCCESS** and **StockScout Validation #331 / run `32630694612` SUCCESS**.
- Promotion audit on PR #13: open, draft, unmerged and mergeable; chart-alert diff is confined to alert sidecar/frontend/workflow/docs files and does not include protected StockScout Core scoring/model files. Shared golden-vector tests enforce frontend/evaluator D/W geometry parity; browser smoke covers main-chart trend/horizontal draw, right-ray projection, edit, reload persistence, manager navigation, global Alerts Center, Telegram secure save/test/disconnect and recovery-key browser-storage isolation. Evaluator cutover tests lock v2 geometry, one-shot disable, deduped-event Telegram gating, owner-scoped read state, secure Telegram Vault paths, A8 canonical-owner sync and A9 fail-safe health/review semantics.
- User already accepted A7 secure Telegram and A8 two-device sync in real use. A9 operational/UX hardening is therefore considered **closed**. The older “Full Validation pending” checkpoint below is superseded by this closeout entry.
- No Opportunity v2, Emerging Leader, MA Cluster, Group Leadership, Fundamentals, RS, Stage, chart mapping or default-ranking behavior was changed. Frozen LEGACY remains shadow-only. Stable `Garrincha077/stock-screener2` remains untouched and the Next scheduled nightly scan remains disabled.
- PR #13 remains **draft** until the explicit promotion decision. Do not change workflow plumbing merely to repair the stale Full Validation status recorder before promotion; that would unnecessarily retrigger the expensive gate. Repair the recorder separately after this promotion cycle.

**Next logical step**
- Perform only the final controlled real-use smoke needed for promotion confidence, then make an explicit decision to move PR #13 out of draft and merge it into Next `main`. Do not re-enable the Next nightly scan as part of that merge.

## 2026-08-23 — A8 real-use accepted; A9 operational/UX hardening

**Branch / PR / acceptance**
- Branch: `next-dev`; draft PR #13 (`next-dev` -> `main`) remains open and unmerged.
- User confirmed the two-device A8 Pages gate with `Sync radi`. Treat A8 cross-device identity/sync as accepted for real use.
- Live verification after the user test independently confirmed `1` sync profile and `2` linked devices sharing one owner-scoped alert sidecar. The shared state contained `6` drawings, `3` rules and `1` Telegram connection. No recovery key or Telegram credential was exposed or recorded in chat/logs.

**A9 evaluator health / explanations**
- A9 evaluator-health migration repo commit: `4b1cc3d458239b3d1f1c1860537030d903c9bbde`; live Supabase migration version `20260823090711`, name `stockscout_next_alerts_v2_a9_evaluator_health`.
- Client/provider/UI commits: `9ff9b65e960371578b27bd1a9cfaddcadf5bb5ed`, `8faae221a952b5c99fa14483ec64531cb949bc79`, `67c8f05347c8cebe8ea54ff39b7067f2c38b0fd9`; tests `dd90b1b43539a57ec5aafb07541afed8193b85f7`, `60c79c1f5d4bfa5bfe7d474e2f44b2e0c4f36c`.
- `evaluatorHealth` is derived from actual enabled-rule `evaluated_at` state, not a synthetic score. It exposes `idle`, `waiting`, `stale`, `attention` or `healthy`, active/evaluated/needs-review/stale counts and last-evaluated timestamp. Missing health fails safe to `waiting` rather than claiming green.
- Alerts Center now translates known `needs_review` codes into explicit explanations for missing chart history, missing anchor, malformed source/rule geometry, unavailable published chart snapshot and legacy interval review. Corporate-action review labels are supported, but no new heuristic corporate-action detector was introduced.
- Live hourly evaluator at `2026-08-23T09:15:03Z` evaluated `3/3` active rules with `0` stale. Health correctly returned `attention` because `1` rule is fail-safe `needs_review`; the live reason is `missing_anchor`. That rule remains non-firing until its geometry is reviewable.
- Verified health code head `60c79c1f5d4bfa5bfe7d474e2f44b2e0c4f36c`: Frontend Compile Smoke #193 / run `32630101080` SUCCESS and StockScout Validation #323 / run `32630101076` SUCCESS.

**A9 Pages / chart hydration hardening**
- Hydration progress commit `c368042997df85d263851157334058c143e626ff` now reports bounded main and retry batch progress (`N/M`) while retaining the existing `>=95%` coverage gate and byte-for-byte canonical `latest.json` invariance check.
- Main Pages workflow cache commit `bc84768ede225b8392098e7c91fba62cd9d6cd68` restores/saves validated `frontend/public/data/charts` by exact Stable canonical SHA plus hydrator code hash. Hydration runs only on cache miss; cache is saved only after the hydrator succeeds. A new Stable snapshot or hydrator change therefore forces a fresh hydration.
- Scheduled read-only Stable preview workflow commit `070de1118ccfae9d81e3685b0b4a6470bd174d93` now uses the same exact-snapshot cache and, importantly, reruns `prepare_frontend_payloads.py` after cache/hydration so its versioned chart descriptor matches the actual shards before build/deploy.
- Workflow guardrail test `f4db7cffae1c4c620e34ecb3b97fb0cf5a9867b4` locks both workflows to the exact-snapshot cache contract, cache-save-after-success rule, canonical hash checks and Full Validation gating.
- Main Pages push deployment remains `branches: [main]`; `next-dev` automatic Pages deploy was not enabled. Scheduled preview remains read-only and does not schedule a Next scan.
- Final A9 code/test head `f4db7cffae1c4c620e34ecb3b97fb0cf5a9867b4`: **Frontend Compile Smoke #198 / run `32630590998` SUCCESS** and **StockScout Validation #330 / run `32630590980` SUCCESS**, including mobile Playwright, frozen LEGACY invariance and frontend runtime/build.
- Because A9 changes Pages/publish workflow plumbing, `stockscout_full_validation.yml` is intentionally triggered by both modified Pages workflow paths. Full Validation is still pending at this checkpoint; do not call that gate green until the status recorder or direct run confirms the new workflow-change run succeeded.

**Scoring / guardrails / risk**
- No Opportunity v2, Emerging Leader, MA Cluster, Group Leadership, Fundamentals, RS, Stage, chart mapping, default ranking or other StockScout Core behavior changed.
- Frozen LEGACY remains unchanged and shadow-only. Stable `Garrincha077/stock-screener2` was not modified. Next scheduled nightly scan remains disabled.
- Chart cache reuse is intentionally conservative: exact Stable snapshot SHA + hydrator code hash, and save only after successful hydration. It does not reuse a failed/partial hydration as validated.
- A9 intentionally does not add new context-menu/delete shortcuts. Existing Escape behavior is retained; operational observability and deterministic publish behavior were prioritized over extra interaction complexity.

**Next logical step**
- Wait only for the already-triggered A9 Full Validation workflow-level gate to finish and record its result. If green, record the run id/SHA here and treat A9 core hardening as closed.
- Then stage the validated A9 frontend to the reversible Next Pages test surface only when a controlled preview is needed; keep `main` controlled, Stable untouched and Next nightly disabled.

## 2026-08-23 — A8 Pages staging checkpoint

- A8 one-shot Pages trigger commit: `448549238be66a198e39c718ce6a26f1309565da` temporarily allowed `next-dev` in `.github/workflows/frontend_pages.yml` solely to stage the already-green A8 frontend on the StockScreener-next Pages test surface.
- Immediate safety restore: `ed906d5ee1340de2dccad4765a9e01fd5a43346b` restored the Pages workflow byte-for-byte to `main`-only. Future experimental `next-dev` pushes therefore do not auto-deploy Pages.
- Final workflow restore head `ed906d5ee1340de2dccad4765a9e01fd5a43346b`: **Frontend Compile Smoke #186 / run `32626436528` SUCCESS** and **StockScout Validation #311 / run `32626436517` SUCCESS**.
- This staging change did not alter scan generation, canonical data, StockScout Core, frozen LEGACY, Stable, or the disabled Next nightly schedule. The newer A8 acceptance/A9 section above supersedes the historical note that A8 was still waiting for its real-use gate.

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
- Test-only false-positive repair: `414b50423a7db3ece870ac8fcc77ca46e01d0aae`; the original assertion rejected the explanatory UI words `localStorage/sessionStorage`, not actual storage API use. It now rejects real `setItem/getItem` calls instead.

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

**Next logical step / A8 historical gate**
- The A8 gate described below has now passed; the newer A8 acceptance/A9 section above is authoritative.
- A8 was staged once to the reversible StockScreener-next Pages test surface and the workflow trigger was restored to `main`-only.
- The real-use gate required both devices to show the same drawings/rules/Telegram metadata and a new drawing to propagate after refresh. The user confirmed this with `Sync radi`.

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
