# StockScout Next — Chart Alerts v2 Roadmap

## Goal

Turn the current persistent chart-alert MVP into a reliable, TradingView-like alert workflow without touching StockScout Core scoring, frozen LEGACY logic, canonical scan methodology, or the disabled Next nightly scan.

Target experience:

1. Draw and edit lines directly on the main StockScout chart.
2. Attach explicit D/W alert rules to drawings.
3. Evaluate horizontal and sloped lines with the same geometry the user sees.
4. Manage the selected ticker's alerts in a right-side manager.
5. Review every alert and trigger across all tickers in a global Alerts Center.
6. Configure Telegram securely inside the app.
7. Keep all user alert state completely separate from StockScout scoring/canonical scan data.

## Current baseline and known gaps

Current PR #13 proves persistence and server-side evaluation, but it is intentionally an MVP.

Observed current architecture:

- `DeepVueTerminal.tsx` owns an internal `PriceChart` that creates/destroys its own Lightweight Charts instance and does not expose chart/candle APIs to an overlay.
- `ChartAlertsDock.tsx` therefore renders a second chart; this duplicates the main analysis surface and should be removed from the final UX.
- Current alert storage combines drawing geometry and alert rule in one row.
- Current schema does not persist `interval` (`D`/`W`), price source, lifecycle/re-arm behavior, or drawing-vs-rule state.
- Current Edge evaluator evaluates raw daily bars only.
- Current sloped-line evaluator projects by calendar days. This can disagree with chart geometry around weekends/holidays and must be replaced by trading-bar/logical-index projection.
- Current browser identity is capability-key based and browser-specific. Persistence works on one browser, but cross-device viewing is not yet solved.
- Telegram delivery is implemented server-side but credentials are not configured.

Useful prior art from the older `Garrincha077/StockScout` project:

- `web/src/components/ChartDrawingLayer.tsx` already implements hit testing, drag/edit of anchors and line body, two-click trendline drawing, smooth imperative SVG updates, and selection/context-menu behavior.
- `web/src/lib/useChartDrawings.ts` maps chart time to Lightweight Charts logical indexes, snaps pointers to bars, and re-projects drawings on pan/zoom/resize.
- Reuse those interaction ideas selectively rather than rebuilding them from scratch.

## Non-negotiable contracts

- No changes to Opportunity v2, Emerging Leader, MA Cluster, Group Leadership, Fundamentals, RS, Stage, chart mapping, default StockScout ranking, or frozen LEGACY scoring.
- Drawings, alert rules, alert status, Telegram settings, and trigger history are user-sidecar data only.
- No alert state may become a hidden score modifier.
- Stable `Garrincha077/stock-screener2` remains untouched.
- Next scheduled nightly scan remains disabled.
- Scan/data/workflow changes require Full Validation. Pure frontend/user-sidecar slices use the normal targeted tests + StockScout Validation/Frontend Compile gates.
- Never commit Telegram credentials or service-role secrets.

---

## Phase A0 — Freeze the MVP contract and add geometry regression vectors

### Purpose

Define the behavior before changing the UI so visual and server-side evaluation cannot silently diverge.

### Work

- Document exact line semantics:
  - drawing type: `trendline` or `horizontal`;
  - home interval: `D` or `W`;
  - extension: default `ray_right` for trendlines, horizontal across the active pane/future;
  - alert condition: `cross_above`, `cross_below`, `touch`;
  - trigger source: `close` for crossing by default, `wick`/bar range for touch;
  - lifecycle: `one_shot` or `rearm`.
- Add shared golden test vectors covering:
  - flat line;
  - rising/falling trendline;
  - weekend/holiday gaps;
  - daily and weekly bars;
  - true cross vs merely remaining above/below;
  - wick touch without close cross;
  - missing anchor/history failure.

### Gate

Frontend and evaluator implementations must pass the same expected geometry/trigger vectors before promotion.

---

## Phase A1 — Separate drawings from alert rules

### Purpose

A drawing should exist even when no alert is active. Alert configuration is a separate concern.

### Proposed model

### `stockscout_next_drawings`

- `id`
- owner identity/capability
- `ticker`
- `kind` = `trendline | horizontal`
- `interval` = `D | W`
- two anchor `{time, price}` points
- `extension` = `ray_right` initially
- optional label/style metadata
- `created_at`, `updated_at`, optional archived/deleted state

### `stockscout_next_alert_rules`

- `id`
- `drawing_id`
- owner identity/capability
- `condition` = `cross_above | cross_below | touch`
- `source` = `close | wick`
- `lifecycle` = `one_shot | rearm`
- `enabled`
- `notify_in_app`
- `notify_telegram`
- created/updated timestamps

### `stockscout_next_alert_status`

Transparent latest evaluation state, not a score:

- projected line price
- latest close/high/low
- distance %
- latest evaluated market bar/date
- `state` = `active | approaching | triggered | paused | needs_review`
- last error/review reason

### Event history

Extend existing event data with interval, source, previous/current line values, and explicit dedupe identity.

### Gate

Migration preserves current MVP drawings/alerts or provides a deterministic one-time adapter. Existing records cannot silently disappear.

---

## Phase A2 — Exact D/W trading-bar geometry engine

### Purpose

Make sloped-line behavior mathematically identical on screen and on the evaluator.

### Rule

Trendline slope is **price per trading bar**, not price per calendar day.

For anchors on logical indexes `i1`, `i2` with prices `p1`, `p2`:

`line(i) = p1 + ((p2 - p1) / (i2 - i1)) * (i - i1)`

Horizontal lines remain constant price.

### Daily

Use cleaned/sorted daily bars and map anchor dates to the matching logical index.

### Weekly

Aggregate the same adjusted daily OHLCV into the same Monday-keyed weekly bars used by the UI, then map weekly anchors to weekly logical indexes.

### Important behavior

- Evaluator fires only against realized bars; visual ray may extend beyond the last bar.
- A weekly alert is evaluated only on weekly semantics, not daily bars.
- If an anchor cannot be reconstructed from available history, mark `needs_review`; never guess.
- Keep adjusted-price convention consistent with chart shards.

### Corporate-action integrity

Because adjusted historical prices can change after splits/corporate actions, store enough anchor provenance to detect a material historical adjustment. If the old anchor basis no longer matches current adjusted history, either apply a clearly validated common adjustment factor or mark `needs_review`; never silently distort the line.

### Gate

Golden vectors pass for D and W; frontend projection and evaluator output agree for the same bars/anchors.

---

## Phase A3 — Main-chart drawing/editing integration

### Purpose

Remove the duplicate alert chart and make drawings part of normal StockScout chart analysis.

### Work

- Refactor the non-mini main `PriceChart` to expose a small chart API/bridge for overlays without changing mini-grid charts.
- Add `ChartDrawingLayer` on the main Price chart only.
- Reuse proven interaction patterns from old StockScout:
  - Cursor / Trendline / Horizontal tools;
  - two-click trendline;
  - draggable anchor A/B;
  - drag entire line body;
  - hit testing/select line;
  - smooth imperative SVG geometry during drag;
  - Esc cancel/deselect.
- Trendline visual:
  - solid between anchors;
  - right-side ray extension clearly visible to the future edge;
  - selected line shows handles.
- Small on-chart badge near the current projected line:
  - `W · Cross ↑ · 2.1% below`
  - or `drawing only` when no rule exists.
- Default chart pan/zoom remains usable when Cursor is active.

### Gate

Desktop and mobile browser tests prove draw, select, edit, pan/zoom, reload persistence, and no regression to existing chart controls.

---

## Phase A4 — Right-side Alert Manager for current ticker

### Purpose

Use the right pane for management, not another chart.

### UX

When a drawing is selected, the manager shows:

- ticker + drawing type
- interval D/W
- condition: Cross Above / Cross Below / Touch
- source: Close / Wick
- lifecycle: One shot / Auto re-arm
- current projected line
- latest close
- distance to line in % and optionally ATR distance
- status: Active / Approaching / Triggered / Paused / Needs review
- Telegram toggle
- Pause
- Delete alert rule
- Delete drawing

The pane should **dock/push** the content on larger screens instead of covering the chart. On mobile it may use a bottom sheet/drawer.

A drawing without an active rule remains visible and editable.

### Gate

Selecting a line on chart selects the same item in manager and vice versa.

---

## Phase A5 — Global Alerts Center

### Purpose

Provide one place to see every drawing/alert across all tickers.

### Entry point

Global `🔔 Alerts` control in StockScout UI with unread/trigger count.

### Views

1. **Active** — all enabled rules.
2. **Near Trigger** — active rules ranked only by transparent geometric distance, not a StockScout score.
3. **Triggered** — event inbox/history, with unread/read state.
4. **Paused** — preserved but not evaluated.
5. **All Drawings** — includes drawings without alert rules.

### Row example

`HEPS | W Trendline | Cross ↑ Close | line 3.84 | close 3.71 | 3.4% below | Active`

### Useful controls

- ticker search
- D/W filter
- condition filter
- active/paused filter
- sort by distance, newest, ticker, last trigger
- bulk pause/resume only if it stays simple and explicit

Clicking a row opens the ticker and focuses/highlights that exact drawing on the main chart, e.g. via `#HEPS?drawing=<uuid>` or equivalent application state.

### Near Trigger

Use explicit, visible thresholds such as `<1%`, `<2%`, `<1 ATR`; no opaque proximity score.

### Gate

Global center and current-ticker manager use the same server state and remain consistent after reload.

---

## Phase A6 — Reliable trigger lifecycle and notifications

### Cross semantics

`Cross Above` requires a true transition:

- previous source <= previous projected line
- current source > current projected line

`Cross Below` is the inverse.

`Touch` uses the relevant bar range; a wick-only contact can fire without a close cross.

### Lifecycle

- `one_shot`: disable rule after first successful trigger.
- `rearm`: do not fire again until price first returns to the opposite side, then a new true crossing occurs.
- Maintain per-bar/per-snapshot dedupe so rerunning evaluator cannot duplicate the same event.

### In-app

- Persist every trigger in Alert Events.
- Unread/read status in Alerts Center.
- Optional small toast while app is open.

### Evaluator cadence

- Keep evaluator independent from StockScout scoring and scanning.
- Evaluate the latest already-published snapshot.
- Hourly safety check is acceptable.
- Later, if desired, invoke evaluation after a successful publication event, but any publish/workflow wiring change must go through Full Validation.

### Gate

Replay the same snapshot twice: zero duplicate events/messages.

---

## Phase A7 — Telegram Settings inside the app

### User requirement

Telegram bot token and chat ID can be entered directly in StockScout rather than configured manually in Supabase Dashboard.

### UI

Inside `🔔 Alerts → Settings → Notifications`:

- Bot Token — password/masked input
- Chat ID — input
- `Save securely`
- `Send test message`
- status: `Connected as @botname` / `Not configured` / `Connection failed`
- `Replace credentials`
- `Disconnect Telegram`

After saving, the frontend must never be able to read the token back. It receives only connection metadata/status.

### Secure data flow

1. User enters credentials in the browser.
2. Browser sends them once over HTTPS directly to the existing Supabase Edge Function using the alert-owner authentication/capability.
3. Edge Function validates shape and, preferably, verifies the bot with Telegram `getMe` before accepting it.
4. Edge Function calls a tightly-scoped SECURITY DEFINER RPC that creates/updates an owner-scoped Supabase Vault secret using `vault.create_secret()` / `vault.update_secret()`.
5. Token and chat ID are encrypted at rest by Supabase Vault.
6. Edge Function returns only safe metadata/status, never decrypted credentials.
7. Evaluator retrieves credentials server-side only for the owner of the fired alert.

### Security rules

- Never put token/chat ID in localStorage/sessionStorage.
- Never commit credentials to GitHub.
- Never put decrypted token in logs, errors, event rows, telemetry or responses.
- Redact Telegram URL/error text if it could contain the bot token.
- Vault decrypted view remains callable only through a narrow service-role SECURITY DEFINER path.
- Secret names should be owner-scoped; do not keep one global Telegram credential if multiple alert owners are possible.
- `Disconnect` deletes or invalidates the owner's Vault secret references without exposing the old values.

### Controlled test

`Send test message` sends a clearly labeled non-trading message such as:

`StockScout Next Telegram alerts connected successfully.`

It must not generate a fake stock signal or event.

### Gate

Save -> page reload -> UI shows connected status without revealing token -> controlled test message arrives -> disconnect -> evaluator reports Telegram not configured.

---

## Phase A8 — Cross-device alert identity

### Current limitation

The current owner key is generated per browser, so desktop and mobile do not automatically share drawings/alerts.

### Preferred incremental path

Keep an identity abstraction from the start so data is not tied to UI implementation.

Two acceptable later options:

1. Supabase Auth magic-link account (cleaner long-term), or
2. a user-managed Alerts Sync/Recovery Key for this personal app.

Migration must preserve existing browser-owned drawings and Telegram Vault credentials.

### Gate

A line drawn on desktop appears on mobile, and both devices see the same Alerts Center/event history without exposing Telegram credentials.

---

## Phase A9 — UX polish and operational hardening

- Keyboard shortcuts and context menu only after core behavior is stable.
- Better hydration progress output in GitHub Actions (`batch N/M`) so preview builds do not appear frozen.
- Avoid rebuilding all 5Y chart shards for frontend-only previews when a validated reusable chart artifact can safely be used.
- Add `needs_review` reasons for missing chart history, anchor drift, corporate-action adjustment, malformed rules, or unavailable snapshot.
- Add last evaluated timestamp and evaluator health in Alerts Center.
- Keep all error states fail-safe: an uncertain alert does not fire.

---

## Suggested implementation order

Do not attempt the whole system in one PR-sized change. Continue PR #13 as a draft and evolve it in small reversible slices:

1. **A0 + A1:** geometry contract and data model split.
2. **A2:** exact D/W bar-index evaluator.
3. **A3:** main-chart drawing/edit layer; remove duplicate chart from dock.
4. **A4:** current-ticker Alert Manager.
5. **A5:** global Alerts Center.
6. **A6:** lifecycle/re-arm + in-app event inbox.
7. **A7:** secure Telegram settings inside app.
8. **A8:** cross-device identity/sync.
9. **A9:** operational/UX polish.

Each slice should be independently testable and revertible.

## Promotion checklist

Before PR #13 (or its successor) is considered ready for promotion:

- main-chart horizontal line persists after reload;
- main-chart sloped trendline persists and can be edited;
- ray extends visibly to the right;
- Daily and Weekly alerts evaluate on the correct bar series;
- frontend and evaluator agree on projected line value for golden vectors;
- true Cross Above/Below does not repeat while price remains on the same side;
- Touch behaves correctly on wick range;
- one-shot/re-arm behavior is verified;
- global Alerts Center shows all active/paused/triggered drawings and opens the correct ticker/line;
- Telegram credentials can be saved/tested/disconnected from the app without ever being readable back by the frontend;
- controlled Telegram test succeeds;
- desktop/mobile UX passes relevant browser smoke;
- StockScout Validation and Frontend Compile Smoke are actually green on the promotion head;
- Full Validation is run if any scan/data/publish workflow path was modified;
- StockScout Core and frozen LEGACY invariance remain intact;
- Stable is untouched and Next nightly remains disabled.
