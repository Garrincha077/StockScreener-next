# StockScout2 — Developer & AI Agent Handoff

> **Canonical context file for future development.**
>
> Repository: `Garrincha077/stock-screener2`
>
> Production target: GitHub Pages — `https://garrincha077.github.io/stock-screener2/`
>
> If a developer or AI agent starts in a fresh chat/session, **read this file before changing code**. The purpose is to preserve architectural decisions, UI behavior, deployment rules, known failure modes, and current development intent so the project does not regress when conversational context is lost.

---

## 1. What this project is

StockScout2 is a stock screener / rapid-review web application built to scan a large equity universe and surface **early, non-extended leaders** and stocks transitioning from neglected/quiet states into stronger trends.

The application combines:

- systematic scan output,
- stage/trend information,
- relative strength,
- setup classification,
- breakout/base/volume metrics,
- fundamental evidence,
- moving-average structure,
- daily-vs-weekly chart review,
- multi-column / balanced sorting,
- watchlist and rapid visual review.

The UI goal is closer to a **DeepVue-style research terminal** than a generic CRUD dashboard: dense information, fast filtering/sorting, large-universe review, and mobile usability matter more than decorative UI.

### Primary research intent

Prefer candidates that are:

- starting a new durable trend,
- not already heavily extended,
- emerging from long bases / neglect,
- improving in relative strength,
- waking up on volume,
- entering or confirming Stage 2,
- showing fresh structural/moving-average improvement.

Do not optimize the app solely for already-obvious high-RS extended leaders.

---

## 2. Repository and production conventions

### Repository

`Garrincha077/stock-screener2`

Default branch:

`main`

### Preferred production host

GitHub Pages is the preferred user-facing deployment:

`https://garrincha077.github.io/stock-screener2/`

Vercel may still appear in repository statuses/history, but it is **not the canonical production target** for this fork.

### Critical deployment rule

**A commit is not proof of deployment.**

Always distinguish:

1. **Source commit exists on `main`**
2. **GitHub Pages workflow successfully built/deployed it**
3. **Live Pages is actually serving the expected version**

When reporting completion, say exactly which of those three levels has been verified.

Do not say “deployed” when only level 1 is known.

---

## 3. Important GitHub Actions gotcha

A workflow that commits/pushes changes using the repository `GITHUB_TOKEN` generally does **not** trigger another workflow from that bot-generated push.

This has already caused confusion in this project:

- one workflow patched source,
- source on `main` was correct,
- the normal Pages workflow did not necessarily start,
- live Pages remained stale.

### Consequence

Avoid architectures like:

`workflow A -> bot commit -> expect workflow B to deploy`

unless workflow A itself performs the deployment or a different triggering mechanism is explicitly used.

### Preferred pattern

For ordinary code edits performed directly through GitHub:

`direct source commit to main -> frontend Pages workflow -> verify Pages deployment`

For CI-generated source edits, either:

- build and deploy in the same workflow, or
- use an explicitly supported trigger/token strategy.

---

## 4. Frontend architecture

Main frontend lives in:

`frontend/`

Important files:

- `frontend/src/App.tsx`
- `frontend/src/Root.tsx`
- `frontend/src/DeepVueTerminal.tsx`
- `frontend/src/deepvue/filterEngine.ts`
- `frontend/src/deepvue/runtime.ts`
- `frontend/src/deepvue.css`
- `frontend/src/grid-watchlist.css`
- `frontend/vite.config.ts`

### Root rendering

`App.tsx` delegates to `Root`.

The StockScout layer renders `DeepVueTerminal`.

There is also a legacy layer. If a user reports that a new StockScout feature is missing, verify they are viewing the **STOCKSCOUT** layer before concluding the source change failed — but check deployment evidence first.

### Vite base

`vite.config.ts` uses:

```ts
base: './'
```

This is intentional for GitHub Pages relative-path compatibility.

---

## 5. Main UI structure

`DeepVueTerminal.tsx` is currently the central screen implementation.

Primary top-level pages:

- `Screener`
- `Grid`
- `Changes`
- `Watchlist`
- `Market`

The application supports:

- saved/custom screens,
- ANY / ALL rule groups,
- column visibility presets,
- multi-sort / balanced mix,
- CSV export,
- watchlist persistence,
- selected-stock detail chart,
- grid/rapid-review charts,
- mobile scrolling through many results.

---

## 6. Screener table: moving-average columns

Two promoted columns near the ticker/opportunity fields are important:

- `EMA 10/20`
- `SMA 10/20`

Current intended order begins approximately:

`★ | Ticker | Opportunity | EMA 10/20 | SMA 10/20 | Tier | ...`

### EMA 10/20

Represents daily EMA 10 vs daily EMA 20.

Spread formula conceptually:

`(EMA10 / EMA20 - 1) * 100`

Typical display:

`BULL +0.42% · 2d`

Meaning:

- `BULL`: EMA10 is above EMA20
- `+0.42%`: EMA10 is 0.42% above EMA20
- `2d`: most recent recorded EMA10/20 crossover occurred 2 trading days ago

### SMA 10/20

Represents weekly SMA 10 vs weekly SMA 20.

Typical display:

`BULL +1.15% · 3w`

Meaning:

- `BULL`: SMA10W is above SMA20W
- spread is positive,
- most recent weekly crossover was 3 weeks ago.

---

## 7. MA calculation engine

Main calculation script:

`compute_ma_crosses.py`

Model identifier:

`ma-cross-v1-daily-ema10-20-weekly-sma10-20`

Price-history source:

`data/batch_results/price_history_5y.pkl`

The engine is designed to calculate these values without requiring another market-data request.

### Daily EMA fields

- `ema10d`
- `ema20d`
- `ema10d20dSpreadPct`
- `ema10d20dState`
- `ema10d20dCross`
- `ema10d20dCrossAge`

### Weekly SMA fields

- `sma10w`
- `sma20w`
- `sma10w20wSpreadPct`
- `sma10w20wState`
- `sma10w20wCross`
- `sma10w20wCrossAge`

`prepare_frontend_payloads.py` should preserve these fields in the lightweight client payload.

---

## 8. MA sorting behavior

EMA 10/20 and SMA 10/20 support a special three-mode sort cycle plus Off:

1. `↓ Strength`
2. `↑ Strength`
3. `✨ Fresh`
4. Off

### Strength modes

Sort by spread magnitude.

### Fresh mode

Fresh mode sorts by crossover recency:

- EMA freshness uses `ema10d20dCrossAge` in days
- SMA freshness uses `sma10w20wCrossAge` in weeks
- lower age = fresher
- if two crosses are equally fresh, BULL is ranked ahead of BEAR

Internal synthetic sort IDs:

- `ema10d20dFresh`
- `sma10w20wFresh`

Important helpers in `DeepVueTerminal.tsx` include:

- `isFreshMaSort`
- `maBaseSortId`
- `maFreshSortId`

Do not replace this with ordinary TanStack sorting without preserving the custom behavior.

---

## 9. Balanced Mix / multi-sort behavior

The app does not treat all multiple sorts as simple lexicographic sorting.

With a single sort:

- direct column priority is used.

With 2+ numeric sorts:

- values are converted into percentile-style rankings,
- criteria receive mildly decreasing weights by sort position,
- a geometric-style mixed score and arithmetic fallback are used,
- the first criterion retains mild extra influence.

Relevant functions:

- `sortValue`
- `compareValues`
- `prioritySort`
- `applyMultiSort`

Be careful when modifying synthetic sort IDs or non-numeric columns: Balanced Mix expects numeric values for percentile construction.

---

## 10. Grid / Rapid Review behavior

The Grid page is the fast visual-review surface for many tickers.

Important goals:

- handle 100+ results,
- remain usable on mobile,
- progressively reveal/load more cards,
- avoid being artificially capped at 16 results,
- allow watchlisting directly from cards,
- use a sensible chart interval for the selected lookback.

### Progressive rendering

Grid starts with a limited number of visible cards but uses an `IntersectionObserver` sentinel to increase the count as the user scrolls.

Relevant utility:

`nextGridCount`

Common preset counts include:

- 12
- 16
- 24
- 36
- 48
- All

Do not reintroduce a hard 16-card limit.

---

## 11. Grid chart interval rule

The Grid automatically chooses Daily or Weekly depending on range.

Current intended mapping:

| Grid range | Interval | Moving averages |
|---|---|---|
| 6M | Daily | EMA 10, EMA 20 (+ current daily longer MAs if configured) |
| 1Y | Daily | EMA 10, EMA 20 (+ current daily longer MAs if configured) |
| 2Y | Weekly | SMA 10W, SMA 20W |
| 5Y | Weekly | SMA 10W, SMA 20W |

Current logic in `MiniCard`:

```ts
const interval:Interval = range==='6M' || range==='1Y' ? 'D' : 'W'
```

Then:

```tsx
<PriceChart bars={bars} interval={interval} range={range} mini />
```

### Why

Shorter windows are used for timing and fresh setup inspection, where daily bars and daily EMAs are more useful.

Longer windows are used for structural review, where weekly bars reduce noise and improve mobile rendering performance.

---

## 12. `PriceChart` MA behavior

`PriceChart` receives an explicit `interval`.

Current behavior:

### Weekly

Daily raw bars are aggregated with `aggregateWeekly()`.

Weekly MA configuration currently uses:

- SMA 10W
- SMA 20W

### Daily

Daily bars are used directly.

Current daily MA configuration includes:

- EMA 10
- EMA 20
- SMA 50
- SMA 200

This is intentional in the current source and is compatible with Grid 6M/1Y using daily charts.

If changing chart MAs later, make sure table indicator semantics and chart semantics do not become misleadingly inconsistent.

---

## 13. Detail chart behavior

The selected-stock detail panel supports manual controls for:

- Price / RS / Volume
- Daily / Weekly
- 3M / 6M / 1Y / 2Y / 5Y

Unlike Grid, detail charts allow an explicit Daily/Weekly choice.

Grid interval logic should not accidentally override the detail panel interval state.

---

## 14. Chart data architecture

Frontend payload type includes:

```ts
type Payload = {
  version:number
  generatedAt:string
  market:Record<string,any>
  universe:Stock[]
  chartShards?:Record<string,string>
  featureModel?:string
}
```

Primary dataset loading attempts:

1. `./data/core.json`
2. fallback `./data/latest.json`

using `cache:'no-store'` and timestamp cache-busting.

Chart histories are loaded from shards:

`./data/charts/<shard>.json`

Shard mapping uses `chartShardFor(ticker)` when an explicit map is not present.

Runtime helper:

`frontend/src/deepvue/runtime.ts`

Important cache class:

`RetryJsonCache`

The cache should not permanently remember a failed chart-shard fetch. Previous work specifically hardened recovery from stale/failed chart requests.

---

## 15. Chart deployment problem to remember

Chart availability has historically been one of the most fragile parts of this project.

Chart shards may be generated during workflows but not committed to the repository. GitHub Pages deploys an atomic artifact.

This creates a dangerous scenario:

1. a healthy Pages deployment contains charts,
2. a later frontend-only deployment builds without chart shards,
3. the new Pages artifact replaces the old one,
4. UI works but charts disappear.

### Design principle

**UI deployment should not be unnecessarily blocked by chart hydration failure**, but chartless deploys should also not casually overwrite a known-good chart payload.

Preferred long-term architecture:

- preserve/reuse the last known-good chart artifact when fresh hydration fails,
- while still allowing new UI code to deploy.

Possible future approaches:

1. reuse last successful chart artifact — preferred
2. dedicated chart-data branch/storage fallback
3. compact embedded fallback history in canonical payload

Do not assume “workflow succeeded” means “all chart shards are present.”

---

## 16. Watchlist behavior

Persistent watchlist key:

`stockscout-watchlist`

Grid cards include a visible heart control:

- `♡` add
- `♥` remove

The Grid heart must remain directly tappable on mobile and must stop event propagation so tapping the heart does not accidentally open/select the stock card.

Relevant CSS:

`frontend/src/grid-watchlist.css`

It is imported after `deepvue.css` so it can reliably override card styles.

---

## 17. Important localStorage keys

These keys preserve user state and should not be casually renamed because doing so resets existing users’ configuration:

- `dv-sorts-v1`
- `dv-cols-v5`
- `dv-root-logic`
- `dv-groups-v1`
- `dv-custom-screens-v1`
- `stockscout-watchlist`

The column visibility key was intentionally advanced to `dv-cols-v5` when promoted MA columns were introduced, to avoid stale old column-visibility state hiding them.

---

## 18. Column presets

The Columns UI provides multiple visibility presets, including a `Crosses` preset.

The Crosses preset should expose MA-related fields such as:

- EMA 10D
- EMA 20D
- daily EMA cross age
- daily EMA spread
- SMA 10W
- SMA 20W
- weekly SMA cross age
- weekly SMA spread

The promoted EMA/SMA 10/20 summary columns should remain easy to access in the default/core experience.

---

## 19. Scan and frontend pipeline

Important scripts/workflows include:

- `prepare_frontend_payloads.py`
- `hydrate_frontend_charts_readonly.py`
- `validate_frontend_charts.py`
- `compute_ma_crosses.py`
- `.github/workflows/daily_screening_git_storage.yml`
- `.github/workflows/frontend_pages.yml`
- `.github/workflows/rebuild_pages_now.yml`

### Daily scan schedule

Historically configured cron:

`45 21 * * 1-5`

That is 21:45 UTC on weekdays (23:45 CEST during Croatian summer time).

Always re-check the workflow before quoting the current schedule because cron configuration can change.

---

## 20. Frontend Pages workflow

Canonical frontend deployment workflow:

`.github/workflows/frontend_pages.yml`

Core responsibilities:

1. checkout source
2. validate canonical `latest.json`
3. build lightweight payload
4. attempt read-only chart hydration
5. validate chart coverage
6. install frontend dependencies
7. run frontend checks/build
8. upload Pages artifact
9. verify scan snapshot is not stale
10. deploy via GitHub Pages

The workflow has stale-data protection so an old frontend artifact should not deploy after canonical scan data advances during a build.

When modifying workflow concurrency, remember that long-running chart hydration can cause later UI work to wait behind deploy locks.

---

## 21. Frontend verification commands

Preferred frontend verification:

```bash
cd frontend
npm ci
npm run check
```

`npm run check` should remain the primary frontend gate before deployment.

When changing chart/data behavior also run the relevant Python validators where possible.

Never treat a successful text replacement or commit as equivalent to a successful TypeScript/Vite build.

---

## 22. Deployment verification checklist

After a meaningful frontend change, verify in this order:

### A. Source

Confirm the expected code exists on `main`.

### B. Build / workflow

Confirm `Deploy StockScout Terminal` (or the intentional direct Pages workflow) is green.

If possible verify both:

- build job
- `deploy-pages` job

### C. Artifact/live behavior

Confirm the live GitHub Pages instance actually exhibits the feature.

For features that are visually obvious, functional verification is stronger than commit inspection.

Example for Grid auto interval:

- 1Y should visibly show much denser daily candles than 2Y weekly
- 6M/1Y should use daily EMA behavior
- 2Y/5Y should use weekly SMA behavior

### Reporting rule

Use wording such as:

- “Committed to main”
- “Pages workflow passed”
- “Verified live”

Do not collapse these into one statement unless all are true.

---

## 23. Known important historical commits

These SHAs are useful landmarks, not permanent API contracts. Later commits may supersede them.

### MA columns and sorting

- `10cf8488aac3fa1ce98714ba5062ad0f7bbd46a3` — surface EMA/SMA 10/20 columns near ticker
- `1b1a6188445b62a0f7436a8b1e20936df635ea60` — add MA freshness sorting and cross age display

### Grid daily/weekly behavior

- `d0b7487e44f93d04c3d7e0b3664d9b04c7a96d49` — auto-switch Grid charts Daily/Weekly by selected range

### Grid / chart resilience

- `df83cfdf51fd2de124166e3b33fbbfdb7b4237e6` — chart/grid resilience and scrolling improvements
- `c0aaad7296144c57f6cb31ba544ca87cd2218955` — bypass stale cached chart-shard failures
- `900ab99628a9102f34ceb03e44685b0cbe9d9fb5` — regression guard for stale chart caching

### Watchlist heart

Relevant historical work includes:

- `6b7f07204e34ee1b3de3f9f33d99a85ad30d0a29`
- `cba1e7e0c821d80f7dd010347849ed4073d8e6e3`
- `cae363faea46b7ce52cae80ec2cbb16cf9558cce`
- `2a07dfdfc1b0800be4c59d30052d6ebedb89d8e2`

When debugging an apparent regression, compare against current `main`, not just these historical snapshots.

---

## 24. Current UX priorities

When choosing between technically elegant but complex solutions and a simple robust implementation, prefer the robust implementation.

Current product priorities:

1. Screener data must be understandable and sortable.
2. Grid/Rapid Review must work well on mobile.
3. 100+ results must be scrollable/reviewable.
4. Charts should load reliably, but a temporary chart issue should not necessarily block the whole UI.
5. Watchlisting must be fast.
6. Short-term chart windows should help with timing.
7. Long-term windows should emphasize structural trend.
8. Avoid clutter and redundant controls where automatic behavior is intuitive.
9. Preserve saved screens/local state across releases where possible.
10. GitHub Pages is the canonical production surface.

---

## 25. Product philosophy for new screeners/features

When adding ranking/screening logic, ask:

- Does this find an early leader or merely reward an already extended winner?
- Does this separate structural quality from short-term timing?
- Can the user visually validate the signal quickly in Grid?
- Can it be sorted/filtered without adding excessive UI complexity?
- Does it work across the full universe, not just a hand-picked watchlist?
- Is the signal interpretable enough that the user can understand why the stock ranked highly?

Prefer a small number of high-value metrics over dozens of weakly differentiated ones.

---

## 26. Safe-change procedure for AI agents

When an AI agent is asked to modify this project:

1. **Read this file first.**
2. Fetch current `main` versions of the files you will modify.
3. Do not assume old chat snippets still match current source.
4. Make the smallest coherent change.
5. Preserve existing localStorage keys and important UI behavior unless migration is intentional.
6. Run or trigger the appropriate checks.
7. Commit directly to `main` only when that is the intended workflow for the task.
8. Verify Pages separately.
9. Report source/deploy/live status separately.
10. Update this handoff file if the architecture or an important behavior changes.

### Especially avoid

- creating one-off workflow files for trivial source patches when a direct source commit is available,
- leaving temporary patch workflows behind,
- reporting Pages as deployed based only on a commit SHA,
- reintroducing a 16-card Grid cap,
- breaking the watchlist heart on mobile,
- silently changing Daily/Weekly semantics,
- dropping MA fields from frontend payload projection,
- allowing stale failed chart fetches to poison the cache permanently,
- assuming chart hydration succeeded just because UI build succeeded.

---

## 27. How to resume in a fresh ChatGPT/Codex session

Recommended user instruction:

> Open `STOCKSCOUT2_DEVELOPER_HANDOFF.md` in `Garrincha077/stock-screener2`, read it first, inspect current `main`, then continue the requested StockScout2 work without rebuilding context from scratch.

Recommended agent behavior:

1. read this handoff,
2. inspect latest commits relevant to the requested feature,
3. fetch current source,
4. implement,
5. verify build,
6. verify GitHub Pages deployment when applicable.

This file should be treated as **living documentation**. Update it whenever a change materially affects architecture, deployment, data flow, screen behavior, or development conventions.

---

## 28. Current state at handoff update

Handoff updated: **2026-08-19**.

At this point the source on `main` includes:

- promoted EMA 10/20 and SMA 10/20 table columns,
- MA crossover age display,
- Strength descending / ascending / Fresh sort cycle,
- Grid progressive scrolling,
- Grid watchlist heart,
- Grid automatic interval mapping:
  - 6M / 1Y -> Daily
  - 2Y / 5Y -> Weekly
- corresponding Daily/Weekly MA behavior in `PriceChart`.

Important: deployment status must always be verified independently of this state description because Pages may lag source after a failed/queued workflow.
