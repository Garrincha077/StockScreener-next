import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source=readFileSync(new URL('../../../supabase/functions/stockscout-next-alerts/index.ts',import.meta.url),'utf8')
const v2Gateway=readFileSync(new URL('../../../supabase/functions/stockscout-next-alerts-v2/index.ts',import.meta.url),'utf8')
const syncGateway=readFileSync(new URL('../../../supabase/functions/stockscout-next-alert-sync/index.ts',import.meta.url),'utf8')
const a6Migration=readFileSync(new URL('../../../supabase/migrations/20260823003000_stockscout_next_alerts_v2_a6_event_read_state.sql',import.meta.url),'utf8')
const a7Migration=readFileSync(new URL('../../../supabase/migrations/20260823011500_stockscout_next_alerts_v2_a7_telegram_vault.sql',import.meta.url),'utf8')
const a8Migration=readFileSync(new URL('../../../supabase/migrations/20260823073000_stockscout_next_alerts_v2_a8_cross_device_sync.sql',import.meta.url),'utf8')
const a8RotateMigration=readFileSync(new URL('../../../supabase/migrations/20260823073500_stockscout_next_alerts_v2_a8_recovery_rotate.sql',import.meta.url),'utf8')
const client=readFileSync(new URL('./chartAlerts.ts',import.meta.url),'utf8')
const settingsPanel=readFileSync(new URL('../TelegramSettingsPanel.tsx',import.meta.url),'utf8')
const syncPanel=readFileSync(new URL('../AlertSyncSettingsPanel.tsx',import.meta.url),'utf8')

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
  const telegram=source.indexOf('await sendTelegram(alert.owner_key, message)')
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

test('A7 stores Telegram credentials owner-scoped in Vault and exposes only service-role RPCs',()=>{
  assert.match(a7Migration,/stockscout_next_telegram_connections/)
  assert.match(a7Migration,/vault\.create_secret/)
  assert.match(a7Migration,/vault\.update_secret/)
  assert.match(a7Migration,/next_chart_alert_telegram_credentials/)
  assert.match(a7Migration,/next_chart_alert_telegram_disconnect/)
  assert.match(a7Migration,/revoke all on table stockscout_private\.stockscout_next_telegram_connections from public, anon, authenticated/)
  assert.match(a7Migration,/revoke all on function[\s\S]*from public, anon, authenticated/)
  assert.match(a7Migration,/grant execute on function[\s\S]*to service_role/)
})

test('A7 gateway validates bot, supports status/save/test/disconnect and never restores the global Telegram secret path',()=>{
  assert.match(v2Gateway,/action==='telegram_status'/)
  assert.match(v2Gateway,/action==='telegram_save'/)
  assert.match(v2Gateway,/action==='telegram_test'/)
  assert.match(v2Gateway,/action==='telegram_disconnect'/)
  assert.match(v2Gateway,/\/getMe/)
  assert.match(v2Gateway,/StockScout Next Telegram alerts connected successfully\./)
  assert.match(source,/next_chart_alert_telegram_credentials/)
  assert.match(source,/sendTelegram\(alert\.owner_key, message\)/)
  assert.doesNotMatch(source,/STOCKSCOUT_NEXT_TELEGRAM_BOT_TOKEN/)
  assert.doesNotMatch(source,/next_chart_alert_secret/)
})

test('A7 browser keeps only capability identity in localStorage and never persists Telegram credentials',()=>{
  assert.match(client,/saveTelegramConnection/)
  assert.match(client,/sendTelegramTestMessage/)
  assert.match(client,/disconnectTelegram/)
  assert.doesNotMatch(client,/localStorage\.(?:setItem|getItem)\([^\n]*telegram/i)
  assert.match(settingsPanel,/type="password"/)
  assert.doesNotMatch(settingsPanel,/localStorage|sessionStorage/)
})

test('A8 stores only a recovery-key hash and keeps sync identity RPCs service-role-only',()=>{
  assert.match(a8Migration,/stockscout_next_alert_sync_profiles/)
  assert.match(a8Migration,/sync_hash text primary key/)
  assert.match(a8Migration,/stockscout_next_alert_device_links/)
  assert.match(a8Migration,/next_chart_alert_owner_resolve/)
  assert.match(a8Migration,/revoke all on table stockscout_private\.stockscout_next_alert_sync_profiles from public, anon, authenticated/)
  assert.match(a8Migration,/revoke all on table stockscout_private\.stockscout_next_alert_device_links from public, anon, authenticated/)
  assert.match(a8Migration,/grant execute on function[\s\S]*to service_role/)
  assert.doesNotMatch(a8Migration,/recovery_key\s+text/i)
})

test('A8 merge preserves every owner-scoped alert table and fails closed on Telegram conflicts',()=>{
  for(const table of [
    'stockscout_next_chart_alerts',
    'stockscout_next_drawings',
    'stockscout_next_alert_rules',
    'stockscout_next_alert_status',
    'stockscout_next_alert_events',
    'stockscout_next_telegram_connections',
  ])assert.match(a8Migration,new RegExp(`(?:update|from) stockscout_private\\.${table}`))
  assert.match(a8Migration,/both device profiles have Telegram configured; disconnect one before merging/)
  assert.match(a8Migration,/vault\.update_secret/)
})

test('A8 routes the alert API through canonical owner resolution and hashes recovery keys in the isolated sync gateway',()=>{
  assert.match(v2Gateway,/next_chart_alert_owner_resolve/)
  assert.match(v2Gateway,/p_device_owner_key:deviceOwnerKey/)
  assert.match(syncGateway,/RECOVERY_KEY/)
  assert.match(syncGateway,/const syncHash=await sha256\(key\)/)
  assert.match(syncGateway,/p_sync_hash:syncHash/)
  assert.match(syncGateway,/next_chart_alert_sync_create/)
  assert.match(syncGateway,/next_chart_alert_sync_join/)
  assert.match(syncGateway,/next_chart_alert_sync_unlink/)
  assert.match(syncGateway,/next_chart_alert_sync_rotate/)
})

test('A8 recovery key is one-time UI state, never browser storage, and can be rotated by the primary device',()=>{
  assert.match(client,/generateRecoveryKey/)
  assert.match(client,/createAlertSync/)
  assert.match(client,/joinAlertSync/)
  assert.match(client,/rotateAlertSyncRecoveryKey/)
  assert.match(a8RotateMigration,/only the primary sync device can rotate the recovery key/)
  assert.match(a8RotateMigration,/set sync_hash = p_sync_hash/)
  assert.doesNotMatch(syncPanel,/(?:localStorage|sessionStorage)\.(?:setItem|getItem)/)
  assert.match(syncPanel,/Save this recovery key now/)
  assert.match(syncPanel,/Existing local drawings were merged into the shared alert set/)
})
