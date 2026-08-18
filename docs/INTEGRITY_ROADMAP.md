# StockScout Integrity Roadmap

Status: ACTIVE
Owner: StockScout project
Principle: data integrity before scoring/model tuning.

## P0 — fix first

- [x] Frontend-only deploy is read-only toward canonical market data. UI/CSS commits rebuild chart shards without recalculating `latest.json` market fields.
- [x] Fix StockScout VCP field mapping: canonical source key is `vcp_quality`; regression coverage added.
- [x] Use one canonical adjusted OHLCV convention across the nightly scan, derived metrics and chart rendering/recovery paths.
- [x] Make scheduled scan reliably post-market year-round and validate completed US session before publishing.
- [x] Invalidate frontend chart-shard cache when canonical snapshot changes/reloads.
- [x] Keep selected ticker synchronized with the active filtered/screened result set, including empty-result behavior.

## P1 — correctness / reproducibility

- [x] Remove Vite build-time string patching of business logic. Balanced Mix and state guards now live in normal TypeScript source; Vite is presentation/build only.
- [x] Expand LEGACY freeze/verification from three core scoring files to the full upstream execution graph used by the reproduced runtime (11 protected files).
- [x] Add offline differential LEGACY tests: original vs fast path on identical fixtures for phase, VCP, fundamentals, RS, Minervini, BUY/SELL source outputs and market-gate determinism. First CI/nightly green run is still the operational verification gate.
- [x] Make `force_full_refresh` actually bypass fundamental cache freshness rules in scan scoring and full-universe hydration.
- [x] Remove the hidden `enrich_original_engine()` side effect from StockScout calibration and keep LEGACY enrichment in orchestration only.
- [x] Keep STOCKSCOUT built-in screens/filter fields separate from dedicated LEGACY terminal screens; no source-methodology screen is part of StockScout discovery presets.

## P2 — model/data usefulness

- [x] Fundamental Evidence v1: expose rich fundamentals as a transparent 0-100 evidence score with separate coverage/confidence, Growth/Margins/Inventory components, nightly audit, filters and a dedicated confirmation screen. Evidence does not alter Opportunity/Confluence.
- [x] Rename user-facing `Today Δ` semantics to `Since last scan`; underlying compatibility field names remain unchanged for stored snapshots.
- [ ] Confidence-weight behavioral sector/industry proxy leadership; later add true GICS metadata.
  - Implementation candidate `behavioral-proxy-v2-confidence` is now on `main`; rollback snapshot is preserved before the merge.
  - Proxy strength, recent/prior persistence, stability and usable-history coverage produce explicit confidence.
  - Low-confidence proxy ranks are pulled toward neutral 50; Group Rank / Group RS / Group Confidence are exposed separately.
  - `leadershipScore` is a separate bounded confirmation rank (about ±5 points around individual Opportunity); Opportunity/Confluence remain unchanged.
  - Mark complete only after one full post-market v2 canonical dataset passes the Group Leadership audit.
- [ ] Replace the loose long-base approximation with lateral-base/contraction logic.
  - Implementation candidate `lateral-base-v1-observational` is now on `main` behind the existing calibration pass.
  - Emits `lateralBaseScore`, `contractionQuality`, `launchReadiness`, `neglectedLaunchScore`, `lateralBaseCandidate` and transparent reason labels.
  - Uses existing transparent features: base duration/depth, 20D/60D tightness, ATR/VCP/contraction, volume dry-up, RS level/acceleration/new-high proximity, breakout proximity and MA position.
  - Extended stocks receive a strong launch penalty and cannot qualify as candidates.
  - This layer is observational only: it does not alter Opportunity, Confluence, Perfect Setup or LEGACY.
  - Regression tests and a canonical dataset audit are in place. Mark complete only after the first full post-market distribution/coverage audit is reviewed.

## P3 — guardrails / polish

- [x] Treat blank numeric/text filter values as inactive rules, never implicit zero/empty equality.
- [x] Add hard canonical dataset validation that fails publishing on stale/mismatched sessions, duplicate tickers, NaN/Inf, VCP mapping divergence, chart/data mismatch or insufficient layer/chart coverage.

## Operational verification gate

P0/P1 passed the first full production nightly. Fundamental Evidence v1 is implemented as an observational StockScout layer and must remain outside Opportunity/Confluence while we collect distribution/correlation evidence. Current P2 gate: validate Group Leadership v2 and Lateral Base v1 together on the next full post-market canonical snapshot. Only after both audits are healthy should we create the stricter Neglected → Emerging Leader screen and then reconsider Opportunity/setup calibration.
