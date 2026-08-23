import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const workflow=readFileSync(new URL('../../../.github/workflows/frontend_pages.yml',import.meta.url),'utf8')
const fullValidation=readFileSync(new URL('../../../.github/workflows/stockscout_full_validation.yml',import.meta.url),'utf8')
const hydrator=readFileSync(new URL('../../../hydrate_frontend_charts_readonly.py',import.meta.url),'utf8')

test('A9 Pages keeps main-only deployment while caching charts by exact Stable snapshot and hydrator version',()=>{
  assert.match(workflow,/branches:\s*\[main\]/)
  assert.doesNotMatch(workflow,/branches:\s*\[[^\]]*next-dev/)
  assert.match(workflow,/actions\/cache\/restore@v4/)
  assert.match(workflow,/stockscout-next-charts-v2-\$\{\{ runner\.os \}\}-\$\{\{ steps\.stable\.outputs\.sha \}\}/)
  assert.match(workflow,/hashFiles\('hydrate_frontend_charts_readonly\.py'\)/)
  assert.match(workflow,/if: steps\.chart-cache\.outputs\.cache-hit != 'true'/)
})

test('A9 saves chart cache only after hydrator success and preserves canonical latest.json checks',()=>{
  assert.match(workflow,/actions\/cache\/save@v4/)
  assert.match(workflow,/steps\.chart-hydrate\.outputs\.hydrated == 'true'/)
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

test('Pages workflow changes remain Full Validation gated',()=>{
  assert.match(fullValidation,/\.github\/workflows\/frontend_pages\.yml/)
  assert.match(fullValidation,/full-scan:/)
  assert.match(fullValidation,/persist_outputs:\s*false/)
  assert.match(fullValidation,/deploy_pages:\s*false/)
})
