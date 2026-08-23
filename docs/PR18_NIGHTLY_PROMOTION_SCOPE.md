# PR #18 nightly promotion scope

Date: 2026-08-23

The repository owner explicitly promoted StockScout Next to production-candidate nightly operation.

This promotion authorizes enabling the automatic weekday post-market schedule in Next. It does not authorize StockScout scoring/model changes or any modification to `Garrincha077/stock-screener2`.

Required implementation gates before merge:

- scheduled Next scans run after the completed US regular session;
- scheduled mode persists canonical outputs and deploys Pages only after validation gates pass;
- reusable Full Validation scans remain non-persistent and non-deploying;
- canonical `latest.json` remains immutable during projection/stamping;
- scan/source/publication identity is embedded in `manifest.json`;
- chart coverage is a hard publish gate at >=95%;
- frozen LEGACY remains shadow-only and StockScout Core invariance remains exact;
- Frontend Compile Smoke, StockScout Validation and StockScout Full Validation must be green on the final code head.

This temporary scope note must be folded into `docs/PROJECT_LOG.md` and removed before final promotion/merge.
