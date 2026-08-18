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
- [x] Keep selected ticker synchronized with the active filtered/screened result set.

## P1 — correctness / reproducibility

- [ ] Remove Vite build-time string patching of business logic; move Balanced Mix, source columns and temporary state fixes into normal TypeScript source.
- [x] Expand LEGACY freeze/verification from three core scoring files to the full upstream execution graph used by the reproduced runtime (11 protected files).
- [ ] Add real differential LEGACY tests: original vs fast path on identical fixtures for phase, VCP, Minervini, BUY, SELL and market gating.
- [x] Make `force_full_refresh` actually bypass fundamental cache freshness rules in scan scoring and full-universe hydration.
- [x] Remove the hidden `enrich_original_engine()` side effect from StockScout calibration and keep LEGACY enrichment in orchestration only.

## P2 — model/data usefulness

- [ ] Expose rich fundamentals as a transparent evidence score before deciding whether they should affect Opportunity ranking.
- [ ] Rename `Today Δ` to `Since last scan` unless snapshots are verified consecutive US sessions.
- [ ] Confidence-weight behavioral sector/industry proxy leadership; later add true GICS metadata.
- [ ] Replace the loose long-base approximation with lateral-base/contraction logic.

## P3 — guardrails / polish

- [ ] Treat blank numeric filter values as inactive rules, never implicit zero.
- [x] Add hard canonical dataset validation that fails publishing on stale/mismatched sessions, duplicate tickers, NaN/Inf, VCP mapping divergence, chart/data mismatch or insufficient layer/chart coverage.

## Rule for future work

P0 integrity is now closed in code. Do not materially retune Opportunity weights, setup thresholds or ranking calibration until the remaining P1 reproducibility work is complete. Every completed item should get a regression/invariant test where practical.
