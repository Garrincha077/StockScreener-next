import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const workflow=readFileSync(new URL('../../../.github/workflows/frontend_pages.yml',import.meta.url),'utf8')
const preview=readFileSync(new URL('../../../.github/workflows/deploy_latest_stable_preview.yml',import.meta.url),'utf8')
const nightly=readFileSync(new URL('../../../.github/workflows/daily_screening_git_storage.yml',import.meta.url),'utf8')
const fullValidation=readFileSync(new URL('../../../.github/workflows/stockscout_full_validation.yml',import.meta.url),'utf8')
const hydrator=readFileSync(new URL('../../../hydrate_frontend_charts_readonly.py',import.meta.url),'utf8')

const assertSnapshotCache=(source:string)=>{
  assert.match(source,/actions\/cache\/restore@v4/)
  assert.match(source,/stockscout-next-charts-v2-\$\{\{ runner\.os \}\}-\$\{\{ steps\.stable\.outputs\.sha \}\}/)
  assert.match(source,/hashFiles\('hydrate_frontend_charts_readonly\.py'\)/)
  assert.match(source,/if: steps\.chart-cache\.outputs\.cache-hit != 'true'/)
  assert.match(source,/actions\/cache\/save@v4/)
  assert.match(source,/steps\.chart-hydrate\.outputs\.hydrated == 'true'/)
}

const assertPublicationContract=(source:string)=>{
  assert.match(source,/meta\.get\('generated_at_utc'\) != generated/)
  assert.match(source,/python stamp_frontend_manifest\.py/)
  assert.match(source,/--verify-only/)
  assert.match(source,/validate_frontend_charts\.py frontend\/public --strict --minimum-coverage 0\.95/)
  assert.match(source,/workflowRunId/)
  assert.match(source,/scanId/)
  assert.match(source,/test "\$BEFORE" = "\$FINAL"/)
}

test('A9 Pages keeps main-only deployment while caching charts by exact Stable snapshot and hydrator version',()=>{
  assert.match(workflow,/branches:\s*\[main\]/)
  assert.doesNotMatch(workflow,/branches:\s*\[[^\]]*next-dev/)
  assertSnapshotCache(workflow)
  assertPublicationContract(workflow)
})

test('A9 scheduled Stable preview uses the same validated chart cache and remains a read-only preview',()=>{
  assert.match(preview,/branches:\s*\[main\]/)
  assert.match(preview,/without enabling a Next scan schedule/)
  assertSnapshotCache(preview)
  assert.match(preview,/Refresh chart descriptor and enforce preview data quality/)
  assert.match(preview,/python prepare_frontend_payloads\.py/)
  assertPublicationContract(preview)
  assert.match(preview,/Refuse a Stable snapshot that advanced during build/)
})

test('production-candidate Next nightly is post-close, persistent, strict and validation-isolated',()=>{
  assert.match(nightly,/schedule:/)
  assert.match(nightly,/cron: '45 21 \* \* 1-5'/)
  assert.match(nightly,/github\.event_name == 'schedule' \|\| inputs\.persist_outputs/)
  assert.match(nightly,/github\.event_name == 'schedule' \|\| inputs\.deploy_pages/)
  assert.match(nightly,/stockscout-validation-scan/)
  assert.match(nightly,/inputs\.persist_outputs == false/)
  assert.match(nightly,/stamp_frontend_manifest\.py/)
  assert.match(nightly,/--source-repository "\$GITHUB_REPOSITORY"/)
  assert.match(nightly,/--source-ref "\$GITHUB_REF_NAME"/)
  assert.match(nightly,/validate_frontend_charts\.py frontend\/public --strict --minimum-coverage 0\.95/)
  assert.match(nightly,/validate_frontend_charts\.py frontend\/dist --strict --minimum-coverage 0\.95/)
  assert.match(nightly,/generated_at_utc": generated_at/)
})

test('A9 saves chart cache only after hydrator success and preserves canonical latest.json checks',()=>{
  assert.match(workflow,/test "\$BEFORE" = "\$AFTER"/)
  assert.match(workflow,/test "\$BEFORE" = "\$FINAL"/)
  assert.match(workflow,/Refuse a Stable snapshot that advanced during build/)
})

test('A9 hydration logs bounded batch progress without changing coverage gate',()=>{
  assert.match(hydrator,/Chart hydration batch \{batch_index\}\/\{total_batches\}/)
  assert.match(hydrator,/Chart hydration retry \{batch_index\}\/\{retry_batches\}/)
  assert.match(hydrator,/MIN_COVERAGE = 0\.95/)
  assert.match(hydrator,/Invariant violation: read-only chart hydration modified latest\.json/)
})

test('Pages and nightly workflow changes remain Full Validation gated on push and PR',()=>{
  assert.match(fullValidation,/push:/)
  assert.match(fullValidation,/pull_request:/)
  assert.match(fullValidation,/branches:\s*\[main\]/)
  assert.match(fullValidation,/\.github\/workflows\/daily_screening_git_storage\.yml/)
  assert.match(fullValidation,/\.github\/workflows\/frontend_pages\.yml/)
  assert.match(fullValidation,/\.github\/workflows\/deploy_latest_stable_preview\.yml/)
  assert.match(fullValidation,/stamp_frontend_manifest\.py/)
  assert.match(fullValidation,/validate_frontend_charts\.py/)
  assert.match(fullValidation,/full-scan:/)
  assert.match(fullValidation,/persist_outputs:\s*false/)
  assert.match(fullValidation,/deploy_pages:\s*false/)
})
