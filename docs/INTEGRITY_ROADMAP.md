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

- [ ] Expose rich fundamentals as a transparent evidence score before deciding whether they should affect Opportunity ranking.
- [x] Rename user-facing `Today Δ` semantics to `Since last scan`; underlying compatibility field names remain unchanged for stored snapshots.
- [ ] Confidence-weight behavioral sector/industry proxy leadership; later add true GICS metadata.
- [ ] Replace the loose long-base approximation with lateral-base/contraction logic.

## P3 — guardrails / polish

- [x] Treat blank numeric/text filter values as inactive rules, never implicit zero/empty equality.
- [x] Add hard canonical dataset validation that fails publishing on stale/mismatched sessions, duplicate tickers, NaN/Inf, VCP mapping divergence, chart/data mismatch or insufficient layer/chart coverage.

## Operational verification gate

Code-level P0/P1 integrity work is complete. Do not materially retune Opportunity weights, setup thresholds or ranking calibration until the first validation/nightly run confirms the new VCP mapping, differential tests, canonical invariants and frontend build together. After that gate, continue P2 in this order: (1) transparent fundamental evidence score, (2) confidence-weight group leadership, (3) real lateral-base model.
