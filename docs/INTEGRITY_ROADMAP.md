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
  - Implementation candidate: `behavioral-proxy-v2-confidence` on `agent/group-leadership-v2`.
  - Proxy strength, recent/prior persistence, stability and usable-history coverage produce explicit confidence.
  - Low-confidence proxy ranks are pulled toward neutral 50; Group Rank / Group RS / Group Confidence are exposed separately.
  - `leadershipScore` is a separate bounded confirmation rank (about ±5 points around individual Opportunity); Opportunity/Confluence remain unchanged.
  - Mark complete only after regression/frontend validation and one full post-market dataset audit pass.
- [ ] Replace the loose long-base approximation with lateral-base/contraction logic.

## P3 — guardrails / polish

- [x] Treat blank numeric/text filter values as inactive rules, never implicit zero/empty equality.
- [x] Add hard canonical dataset validation that fails publishing on stale/mismatched sessions, duplicate tickers, NaN/Inf, VCP mapping divergence, chart/data mismatch or insufficient layer/chart coverage.

## Operational verification gate

P0/P1 passed the first full production nightly. Fundamental Evidence v1 is implemented as an observational StockScout layer and must remain outside Opportunity/Confluence while we collect distribution/correlation evidence. Continue P2 in this order: (1) validate Fundamental Evidence behavior on live snapshots, (2) confidence-weight group leadership, (3) real lateral-base model, then reconsider Opportunity/setup calibration.
