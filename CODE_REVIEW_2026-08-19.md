# StockScout code review — 2026-08-19

Branch: `review/code-audit-2026-08-19`

Scope: current GitHub Pages frontend, Rapid Review/mobile behavior, chart/data loading, Pages deployment, nightly scan publication, filter UX, and frontend regression coverage. `main` was not modified.

## Executive summary

The app is functional, but several recent fixes are layered around the React application rather than implemented in the React state model itself. The biggest operational risks are (1) two independent workflows deploying the same GitHub Pages site, (2) deployment continuing even if the canonical scan cannot be pushed to `main`, (3) a ~33.6 MB canonical JSON that is force-refetched without cache, and (4) chart failures becoming sticky until a full reload.

The mobile Rapid Review issue is not fundamentally solved in the React component: React still starts at 16 cards and only offers 12/16/24/36/48. A separate script mutates the React-controlled `<select>` and parses rendered text to progressively increase the count. That should be replaced with first-class React state + IntersectionObserver.

## Findings

### P1 — Rapid Review mobile infinite-scroll is a DOM hack outside React

Files:
- `frontend/src/DeepVueTerminal.tsx`
- `frontend/public/mobile-grid-autoload.js`
- `frontend/index.html`

`GridView` still renders `stocks.slice(0, count)`, starts with `gridCount = 16`, and declares only fixed React options 12/16/24/36/48. `mobile-grid-autoload.js` then:

- parses `"16 of 123"` presentation text from the DOM as application state;
- creates `<option>` elements manually inside a React-controlled `<select>`;
- changes the DOM value and dispatches a synthetic `change` event;
- increments the count by 16 outside React;
- watches the entire document subtree with a MutationObserver.

This can desynchronize from React reconciliation, break if header copy changes, and creates a fragile dependency between rendered text and application behavior.

**Fix:** implement progressive card count inside `GridView` with React state. Add a sentinel after the grid and use `IntersectionObserver` to increase `visibleCount`. Keep an explicit `All` option if desired. Delete `mobile-grid-autoload.js` after the React implementation is proven.

### P1 — Two workflows can race to deploy the same GitHub Pages site

Files:
- `.github/workflows/daily_screening_git_storage.yml`
- `.github/workflows/frontend_pages.yml`

The nightly workflow builds and deploys Pages itself. It also commits `frontend/public/data/latest.json` to `main`. That push triggers `frontend_pages.yml`, which independently rebuilds chart shards and deploys Pages again. Their concurrency groups are different (`daily-stock-screening` vs `frontend-pages`), so they do not serialize the shared Pages deployment.

Consequences:
- duplicate expensive builds and full chart hydration;
- last-finishing deployment wins, not necessarily the logically newest one;
- harder debugging of stale/changed data;
- a frontend-only deployment may overwrite the nightly artifact.

**Fix:** choose one deployment owner. Preferred: nightly scan validates and commits the canonical outputs; `frontend_pages.yml` is the only workflow that builds/deploys Pages. Use one shared deployment concurrency group.

### P1 — Pages deployment may publish a scan that was never persisted to `main`

File: `.github/workflows/daily_screening_git_storage.yml`

The sync/push step has `continue-on-error: true`. If push fails after retries, the workflow exits that step with an error but continues to build and deploy Pages from the runner's uncommitted fresh working tree.

The live site can therefore show data that does not exist on `main`. A later Pages rebuild from `main` can then revert the site to the older canonical dataset.

**Fix:** deployment must depend on successful canonical persistence. Either fail the job when push fails, or build Pages only from the successfully pushed commit SHA.

### P1 — Canonical frontend payload is ~33.6 MB and cache is explicitly bypassed

Files:
- `frontend/public/data/latest.json`
- `frontend/src/DeepVueTerminal.tsx`

Current `latest.json` is 33,634,585 bytes. The frontend loads it with both a timestamp query parameter and `cache: 'no-store'`:

```ts
fetch(`./data/latest.json?t=${Date.now()}`, {cache: 'no-store'})
```

This forces a full download and JSON parse on each page load/manual refresh. On mobile this is a substantial latency, memory, bandwidth and battery cost.

**Fix:** split data into:
1. a small `manifest/latest.json` containing version/generatedAt and URLs;
2. a compact screener universe needed for the table/grid;
3. lazy-loaded detail/layer payloads by ticker or shard.

Version immutable files by scan id/hash and allow normal browser caching. Only the tiny manifest needs revalidation.

### P1 — One transient chart request failure poisons the shard cache until full reload

File: `frontend/src/DeepVueTerminal.tsx`

`loadBars` caches the fetch Promise before awaiting it. On rejection, the same rejected Promise remains in `shardPromises.current[cacheKey]`. Every later attempt reuses that rejection and immediately returns an empty array. The cache is cleared only when the whole payload is reloaded.

`MiniCard` also displays `loading chart…` whenever `bars.length === 0`, so a failed/unavailable chart is indistinguishable from an in-progress request.

**Fix:** on fetch rejection, delete the failed cache key and expose `loading | ready | error | unavailable` states. Add a bounded retry/backoff and a visible retry action for the selected chart.

### P2 — Chart artifacts are not reproducible from the repository alone

Files:
- `frontend/public/data/`
- `hydrate_frontend_charts_readonly.py`
- `.github/workflows/frontend_pages.yml`

Only `latest.json` is committed under `frontend/public/data`; chart shards are generated during deployment from Yahoo Finance. A source commit therefore does not uniquely identify the chart artifact that was deployed.

Furthermore, a frontend-only deploy downloads fresh 5Y prices for the whole universe. Those charts may be retrieved at a different time from the scan metrics stored in `latest.json`.

**Fix:** make chart shards deterministic scan artifacts, keyed by scan id. Either persist them in release/artifact storage or generate them once in the scan workflow and deploy that exact artifact. If charts are intentionally fresher than scan metrics, label their timestamp separately in the UI.

### P2 — Two global MutationObservers can amplify mobile work

Files:
- `frontend/public/mobile-grid-autoload.js`
- `frontend/src/useResizablePanels.ts`

`mobile-grid-autoload.js` observes `document.documentElement` recursively. `useResizablePanels` separately observes `document.body` recursively and rescans multiple selectors on mutations. Lightweight chart creation and React card rendering create many DOM mutations.

This risks repeated whole-document queries exactly when dozens of mini charts are mounting.

**Fix:** remove DOM observation for React-owned UI. Use component state/refs. Use `IntersectionObserver` for progressive grid loading and narrowly scoped `ResizeObserver` where resizing requires it.

### P2 — Mobile behavior uses inconsistent breakpoints

Files:
- `frontend/public/mobile-grid-autoload.js`
- `frontend/src/mobile-grid-scroll.css`

Autoload treats mobile as `max-width: 768px`; the dedicated grid-scroll CSS activates only at `max-width: 700px`. Devices from 701–768 px run the autoload behavior without the matching single-column/overflow overrides.

**Fix:** define one mobile breakpoint and use it consistently. Prefer solving autoload in React so the behavior does not depend on a separate JS media query.

### P2 — Invalid numeric filter input silently becomes “match all”

File: `frontend/src/deepvue/filterEngine.ts`

For numeric rules, empty values return `true`; malformed `between` values return `true`; non-numeric right-hand values also return `true`. A visually present filter can therefore have no filtering effect without warning the user.

**Fix:** validate rule input in the builder. Invalid rules should show an error and be excluded/disabled explicitly; they should not silently pass every stock.

### P2 — Two chart/export conventions remain in code and are selected by monkey-patching

Files:
- `export_frontend_data.py`
- `export_frontend_data_fast.py`

The base exporter uses Yahoo with `auto_adjust=False`; the fast exporter wraps the base module, switches chart recovery to `auto_adjust=True`, and monkey-patches `base.score_row` and `base.build_five_year_chart_shards` at import time.

The nightly path currently uses the fast exporter, but running the base entrypoint directly produces a different price convention. This is a maintainability/correctness trap.

**Fix:** make price convention explicit in one exporter and remove monkey-patching. Retire or hard-fail the legacy entrypoint if it is no longer valid for production.

### P2 — Frontend CI verifies compilation, not behavior

Files:
- `frontend/package.json`
- `.github/workflows/frontend_compile_smoke.yml`

The frontend has no test script. CI only installs packages and runs the TypeScript/Vite build. It therefore cannot detect regressions such as “Rapid Review remains at 16”, failed shard retry, invalid filter behavior, or mobile scrolling.

**Fix:** add a small high-value behavioral suite. Minimum Playwright/Vitest coverage:
- mobile viewport with >100 Rapid Review matches progressively reaches all matches;
- chart shard first request fails then retry succeeds;
- filter invalid input is visibly rejected;
- Pages base path loads dataset and a chart shard;
- saved sort/filter state survives reload without corrupting the screen.

### P3 — Multi-sort mutates payload stock objects

File: `frontend/src/DeepVueTerminal.tsx`

`applyMultiSort` deletes and writes `__mixScore` / `__mixAverage` directly onto `Stock` objects that originate from the loaded payload. This mutates state-derived objects during memoized derivation and couples sorting internals to the shared dataset.

**Fix:** keep mix scores in a local `Map<ticker, score>` or sort wrapper objects without mutating `Stock`.

## Recommended fix order

1. Make exactly one workflow responsible for Pages deploy, and block deploy unless canonical scan persistence succeeded.
2. Move mobile progressive loading into React; remove `mobile-grid-autoload.js` and its global MutationObserver.
3. Fix rejected chart Promise eviction/error state/retry.
4. Split/version/cache the 33.6 MB frontend payload.
5. Make chart artifacts deterministic per scan.
6. Add minimal mobile/data-loading behavior tests.
7. Clean up filter validation, exporter duplication, and state mutation.

## Overall assessment

The core screener logic is not the main weakness found in this pass. The highest-risk area is the boundary between scan output, static deployment, and frontend presentation. Several recent symptoms (stale Pages data, missing charts, Rapid Review stuck at a small number of cards) are consistent with that boundary being implemented through duplicate deployment paths and DOM-level patches rather than one canonical data/deploy/UI flow.
