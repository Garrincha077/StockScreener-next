import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source=readFileSync(new URL('../../../supabase/functions/stockscout-next-alerts/index.ts',import.meta.url),'utf8')

test('edge evaluator uses v2 drawing/rule model and shared trading-bar geometry',()=>{
  assert.match(source,/next_chart_alert_v2_enabled/)
  assert.match(source,/evaluateAlertGeometry/)
  assert.match(source,/barsForAlertInterval/)
  assert.match(source,/engine:\s*'v2-trading-bars'/)
  assert.doesNotMatch(source,/api\.rpc\('next_chart_alert_enabled'/)
  assert.doesNotMatch(source,/function\s+projectLine\s*\(/)
})

test('edge evaluator persists v2 provenance/status and one-shot handling',()=>{
  assert.match(source,/next_chart_alert_status_update/)
  assert.match(source,/next_chart_alert_v2_event_insert/)
  assert.match(source,/next_chart_alert_rule_disable_after_fire/)
  assert.match(source,/legacy_interval_not_persisted/)
})
