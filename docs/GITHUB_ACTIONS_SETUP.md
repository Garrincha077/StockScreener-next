# StockScout Next GitHub Actions operating guide

## Safety model

- There is deliberately no `schedule:` trigger. Cron remains disabled until a separate decision after ten consecutive green production-style Full Validation runs on completed market sessions.
- Scan workflows never commit or push generated data to `main`.
- Feature branches can run scans and retain recovery artifacts, but cannot publish `validated-scan-snapshot` or deploy Pages.
- Pages is deployed only through `.github/workflows/pages_deploy.yml` and the `stockscout-pages-deploy` concurrency group.
- Every deployment revalidates the canonical SHA-256, manifest and asset hashes, frontend source commit, ticker projections and at least 98% chart coverage before upload.

## Manual daily/post-market run

Open **Actions → Daily Stock Screening (Post-Market) → Run workflow**.

Inputs:

- `force_full_refresh`: ignore the restored fundamentals cache.
- `allow_prior_session_backfill`: explicitly allow the latest prior completed session before 16:30 ET. Leave false for an ordinary daily run.
- `publish_snapshot`: on `main`, upload the immutable `validated-scan-snapshot` artifact with 90-day retention.
- `deploy_pages`: on `main`, deploy the exact verified snapshot. This also requires `publish_snapshot`.

Normal pre-close runs fail closed. A prior-session exception is never inferred from a workflow name or event type.

## Full Validation

Open **Actions → StockScout Full Validation → Run workflow**.

For an explicit pre-close validation of yesterday's completed session, set `allow_prior_session_backfill=true`. Publication and deployment inputs are honored only on `main`; feature-branch validation still produces a recovery artifact.

The final result is written to the source commit as the GitHub commit status `stockscout/full-validation`. No status file or bot commit is created.

## Snapshot and frontend-only deployment

The daily workflow restores the latest successful main snapshot when available, runs the complete scan/audit/test/build chain, and uploads:

- `validated-scan-snapshot`: data, exact built site, metadata, cache and reports; only after all gates pass.
- `scan-recovery-*`: logs and partial state, even when a later gate fails.

`Build terminal from validated snapshot` never rehydrates Yahoo charts. It downloads the latest successful `validated-scan-snapshot`, fails on a missing/corrupt/incomplete artifact, builds the current frontend against those exact data bytes, and sends the resulting immutable artifact to the same reusable deploy job.

After deployment, the reusable job checks the live manifest, core, one LEGACY detail shard and one chart shard.

## Dependencies and repository protection

- Frontend jobs use `frontend/package-lock.json` with `npm ci`.
- Python jobs use `requirements-ci.lock` with `pip --require-hashes`.
- Dependabot covers GitHub Actions, npm and pip weekly.
- `.github/rulesets/main.json` requires PRs, zero approvals, resolved conversations, `Frontend validation` and `StockScout validation`, and blocks deletion/force-push.

The ruleset must be activated only after the workflow hardening PR is merged:

```bash
GH_TOKEN=... python apply_main_ruleset.py --apply
```

The script refuses activation while the hardened no-push workflows are absent from the default branch.
