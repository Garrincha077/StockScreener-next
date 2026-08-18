# StockScout Integrity Roadmap

Status: ACTIVE
Owner: StockScout project
Principle: data integrity before scoring/model tuning.

## P0 — fix first

- [ ] Frontend-only deploy must be read-only toward canonical market data. UI/CSS commits must never recalculate `latest.json` market fields.
- [ ] Fix StockScout VCP field mapping: canonical source key is `vcp_quality`; add regression coverage.
- [ ] Use one canonical adjusted OHLCV convention across scan, derived metrics and chart rendering.
- [ ] Make scheduled scan reliably post-market year-round and validate completed US session before publishing.
- [ ] Invalidate frontend chart-shard cache when canonical snapshot changes/reloads.
- [ ] Keep selected ticker synchronized with the active filtered/screened result set.

## P1 — correctness / reproducibility

- [ ] Remove Vite build-time string patching of business logic; move Balanced Mix and extra columns into normal TypeScript source.
- [ ] Expand LEGACY freeze/verification from three core scoring files to the full upstream execution graph used by the reproduced runtime.
- [ ] Add real differential LEGACY tests: original vs fast path on identical fixtures for phase, VCP, Minervini, BUY, SELL and market gating.
- [ ] Make `force_full_refresh` actually bypass fundamental cache freshness rules.
- [ ] Remove the hidden `enrich_original_engine()` side effect from StockScout calibration and keep LEGACY enrichment in orchestration only.

## P2 — model/data usefulness

- [ ] Expose rich fundamentals as a transparent evidence score before deciding whether they should affect Opportunity ranking.
- [ ] Rename `Today Δ` to `Since last scan` unless snapshots are verified consecutive US sessions.
- [ ] Confidence-weight behavioral sector/industry proxy leadership; later add true GICS metadata.
- [ ] Replace the loose long-base approximation with lateral-base/contraction logic.

## P3 — guardrails / polish

- [ ] Treat blank numeric filter values as inactive rules, never implicit zero.
- [ ] Add hard canonical dataset validation that fails publishing on stale/mismatched sessions, duplicate tickers, NaN/Inf, implausible VCP coverage, chart/data mismatch, insufficient layer coverage, or inconsistent snapshot metadata.

## Rule for future work

Do not tune Opportunity weights, setup thresholds or ranking calibration while any P0 integrity item remains open. Every completed item should get a regression/invariant test where practical.
