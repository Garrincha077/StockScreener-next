# PR17 scope — Scan provenance + resizable desktop workspace

This is a temporary PR-scope note for the P0 operating-quality slice.

- authoritative scan identity/data health in UI from the existing manifest contract;
- explicit HEALTHY / PARTIAL / STALE / MISMATCH / ERROR semantics;
- transparent source SHA, generatedAt/session, validation and per-asset coverage;
- source Stable workflow run is displayed only when embedded; current artifact truthfully says `not embedded`;
- extend the existing persistent desktop resize engine to the main review/alert/LEGACY/factor workspace panels;
- preserve mobile layout and existing StockScout table/detail splitter;
- no scan generation, publication workflow, scoring, model, chart mapping or frozen LEGACY changes;
- Stable repo untouched; Next nightly remains disabled.

Remove or fold this note into PROJECT_LOG before promotion.
