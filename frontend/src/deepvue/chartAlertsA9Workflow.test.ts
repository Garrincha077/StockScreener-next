import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const workflow=readFileSync(new URL('../../../.github/workflows/frontend_pages.yml',import.meta.url),'utf8')
const preview=readFileSync(new URL('../../../.github/workflows/deploy_latest_stable_preview.yml',import.meta.url),'utf8')
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

test('A9 Pages keeps main-only deployment while caching charts by exact Stable snapshot and hydrator version',()=>{
  assert.match(workflow,/branches:\s*\[main\]/)
  assert.doesNotMatch(workflow,/branches:\s*\[[^\]]*next-dev/)
  assertSnapshotCache(workflow)
})

test('A9 scheduled Stable preview uses the same validated chart cache and remains a read-only preview',()=>{
  assert.match(preview,/branches:\s*\[main\]/)
  assert.match(preview,/without enabling a Next scan schedule/)
  assertSnapshotCache(preview)
  assert.match(preview,/Refresh chart descriptor and verify read-only preview state/)
  assert.match(preview,/python prepare_frontend_payloads\.py/)
  assert.match(preview,/test "\$BEFORE" = "\$FINAL"/)
  assert.match(preview,/Refuse a Stable snapshot that advanced during build/)
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

test('both Pages workflow changes remain Full Validation gated',()=>{
  assert.match(fullValidation,/\.github\/workflows\/frontend_pages\.yml/)
  assert.match(fullValidation,/\.github\/workflows\/deploy_latest_stable_preview\.yml/)
  assert.match(fullValidation,/full-scan:/)
  assert.match(fullValidation,/persist_outputs:\s*false/)
  assert.match(fullValidation,/deploy_pages:\s*false/)
})
