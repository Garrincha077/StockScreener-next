# StockScout Next — GMLI Context Contract

## Purpose

Expose GMLI macro/liquidity context inside StockScout Next without duplicating or modifying the GMLI methodology and without changing StockScout scoring.

## Canonical source

- GMLI methodology, promotion state and workflow remain canonical in `Garrincha077/NUEVO`.
- StockScout consumes the verified `gh-pages` GMLI outputs only.
- `refresh_gmli_context.py` is a projection/validation adapter, not a GMLI calculator.

## Consumer contract

The published StockScout sidecar is `frontend/public/data/gmli/gmli-context.json`.

It must always state:

- `mode = READ_ONLY_SIDECAR`;
- `reconstructsGmli = false`;
- `mutatesStockScoutScoring = false`;
- `stockScoutImpact = none; read-only independent macro context`.

The GMLI layer may display:

- Money Core regime/level and promoted Money metadata;
- Funding and Fiscal overlay state;
- completed-month market confirmation;
- signal-role taxonomy;
- Money Historical Extremes z-scores/percentiles;
- availability-filtered GMLI history.

## Failure isolation

A GMLI upstream outage or invalid bundle must not fail StockScout nightly scanning, mutate canonical stock data or silently publish a partial new GMLI snapshot.

Refresh behavior:

1. fetch all required GMLI outputs;
2. validate schema, vintage consistency and read-only contracts;
3. project one complete sidecar in memory;
4. replace the sidecar atomically only after validation;
5. otherwise preserve the checked-in last-good sidecar.

The UI must make fallback/staleness visible when available.

## StockScout invariance

GMLI may not alter by default:

- Opportunity v2;
- Emerging Leader;
- MA Cluster;
- Group Leadership;
- Fundamental Evidence;
- RS;
- Stage;
- chart mapping;
- default ranking or screens;
- LEGACY runtime/confirmation behavior.

The stable repository `Garrincha077/stock-screener2` is not modified by this integration.

## Empirical promotion boundary

Future nightly cohort research may persist the contemporaneous GMLI regime beside StockScout outcomes and compare 5D/20D/MFE/MAE/hit-rate behavior by regime.

No GMLI-derived stock-score modifier is allowed merely because the macro context appears economically sensible. Any scoring influence requires the existing Phase 6/7 process: longitudinal sample, incremental-value/ablation evidence, explicit documented promotion and a bounded modifier with fresh Full Validation.

## CI

- `GMLI Context Update` validates and refreshes the sidecar independently.
- Code/workflow contract changes are included in StockScout Full Validation.
- Routine data-only GMLI refresh commits do not trigger an expensive full stock rescan because they cannot mutate stock scoring or canonical scan generation.
