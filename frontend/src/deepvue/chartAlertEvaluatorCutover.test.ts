import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source=readFileSync(new URL('../../../supabase/functions/stockscout-next-alerts/index.ts',import.meta.url),'utf8')
const v2Gateway=readFileSync(new URL('../../../supabase/functions/stockscout-next-alerts-v2/index.ts',import.meta.url),'utf8')
const a6Migration=readFileSync(new URL('../../../supabase/migrations/20260823003000_stockscout_next_alerts_v2_a6_event_read_state.sql',import.meta.url),'utf8')

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

test('A6 gates Telegram delivery behind a newly inserted deduped event',()=>{
  const insert=source.indexOf("next_chart_alert_v2_event_insert")
  const newEventGate=source.indexOf("if (typeof eventId === 'string' && eventId)")
  const telegram=source.indexOf('await sendTelegram(message)')
  assert.ok(insert>=0)
  assert.ok(newEventGate>insert)
  assert.ok(telegram>newEventGate)
})

test('A6 adds owner-scoped read state without exposing direct table access',()=>{
  assert.match(a6Migration,/add column if not exists read_at timestamptz/)
  assert.match(a6Migration,/next_chart_alert_event_set_read/)
  assert.match(a6Migration,/owner_key = p_owner_key/)
  assert.match(a6Migration,/revoke all on function[\s\S]*from public, anon, authenticated/)
  assert.match(v2Gateway,/action==='event_read'/)
  assert.match(v2Gateway,/next_chart_alert_event_set_read/)
})
