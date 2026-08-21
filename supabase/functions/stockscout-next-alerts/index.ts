import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  barsForAlertInterval,
  evaluateAlertGeometry,
  type AlertBasis,
  type AlertCondition,
  type AlertInterval,
  type AlertLifecycle,
  type GeometryBar as Bar,
  type GeometryPoint as Point,
} from './chartAlertGeometryContract.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,x-stockscout-device-key,x-stockscout-evaluator-key',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const PAGES_BASE = (Deno.env.get('STOCKSCOUT_NEXT_PAGES_BASE') ?? 'https://garrincha077.github.io/StockScreener-next/').replace(/\/?$/, '/')
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
const api = db.schema('stockscout_api')

type AlertRow = {
  id: string
  owner_key: string
  ticker: string
  points: [Point, Point]
  mode: 'break_up' | 'break_down' | 'touch'
  enabled: boolean
  notify_telegram: boolean
  created_at: string
  updated_at: string
}

type EvaluatorRow = {
  rule_id: string
  drawing_id: string
  legacy_alert_id: string | null
  owner_key: string
  ticker: string
  kind: 'trendline' | 'horizontal'
  interval: AlertInterval
  points: [Point, Point]
  extension: 'ray_right' | 'pane'
  metadata?: Record<string, unknown>
  condition: AlertCondition
  source: AlertBasis
  lifecycle: AlertLifecycle
  enabled: boolean
  notify_in_app: boolean
  notify_telegram: boolean
  updated_at: string
}

type Snapshot = { alerts?: AlertRow[]; events?: unknown[] }

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function validPoint(raw: unknown): raw is Point {
  if (!raw || typeof raw !== 'object') return false
  const point = raw as Record<string, unknown>
  return typeof point.time === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(point.time) && typeof point.price === 'number' && Number.isFinite(point.price) && point.price > 0
}

function normalizeAlert(raw: any) {
  const ticker = String(raw?.ticker ?? '').trim().toUpperCase()
  const points = Array.isArray(raw?.points) ? raw.points : []
  const mode = ['break_up', 'break_down', 'touch'].includes(raw?.mode) ? raw.mode : 'touch'
  if (!/^[A-Z0-9.\-]{1,16}$/.test(ticker) || points.length !== 2 || !points.every(validPoint)) throw new Error('Invalid alert geometry')
  return {
    ...(typeof raw?.id === 'string' && raw.id ? { id: raw.id } : {}),
    ticker,
    points,
    mode,
    enabled: Boolean(raw?.enabled),
    notifyTelegram: raw?.notifyTelegram !== false,
  }
}

function toClientAlert(row: AlertRow) {
  return {
    id: row.id,
    ticker: row.ticker,
    points: row.points,
    mode: row.mode,
    enabled: row.enabled,
    notifyTelegram: row.notify_telegram,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toBar(raw: any): Bar | null {
  if (Array.isArray(raw) && raw.length >= 5) {
    const [time, open, high, low, close] = raw
    if (typeof time !== 'string') return null
    const nums = [open, high, low, close].map(Number)
    if (!nums.every(Number.isFinite)) return null
    return { time: time.slice(0, 10), open: nums[0], high: nums[1], low: nums[2], close: nums[3] }
  }
  if (raw && typeof raw === 'object') {
    const nums = [raw.open, raw.high, raw.low, raw.close].map(Number)
    if (typeof raw.time !== 'string' || !nums.every(Number.isFinite)) return null
    return { time: raw.time.slice(0, 10), open: nums[0], high: nums[1], low: nums[2], close: nums[3] }
  }
  return null
}

async function readSecret(name: string) {
  const envName = name === 'stockscout_next_telegram_bot_token'
    ? 'STOCKSCOUT_NEXT_TELEGRAM_BOT_TOKEN'
    : name === 'stockscout_next_telegram_chat_id'
      ? 'STOCKSCOUT_NEXT_TELEGRAM_CHAT_ID'
      : ''
  if (envName) {
    const direct = Deno.env.get(envName)
    if (direct) return direct
  }
  const { data, error } = await api.rpc('next_chart_alert_secret', { p_name: name })
  if (error) return ''
  return typeof data === 'string' ? data : ''
}

async function sendTelegram(text: string) {
  const token = await readSecret('stockscout_next_telegram_bot_token')
  const chatId = await readSecret('stockscout_next_telegram_chat_id')
  if (!token || !chatId) return { status: 'not_configured' as const, error: '' }
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    })
    if (!response.ok) return { status: 'error' as const, error: `Telegram HTTP ${response.status}` }
    return { status: 'sent' as const, error: '' }
  } catch (error) {
    return { status: 'error' as const, error: String(error) }
  }
}

function triggerLabel(condition: AlertCondition) {
  return condition === 'cross_above' ? '📈 crossed above' : condition === 'cross_below' ? '📉 crossed below' : '🎯 touched'
}

function reviewReason(alert: EvaluatorRow, geometryReason?: string) {
  if (alert.kind === 'trendline' && alert.metadata?.legacyIntervalUnknown === true) return 'legacy_interval_not_persisted'
  return geometryReason ?? 'geometry_unavailable'
}

async function updateStatus(alert: EvaluatorRow, values: {
  state: 'active' | 'triggered' | 'needs_review'
  reason?: string | null
  line?: number | null
  latest?: Bar | null
  distancePct?: number | null
}) {
  return api.rpc('next_chart_alert_status_update', {
    p_rule_id: alert.rule_id,
    p_state: values.state,
    p_review_reason: values.reason ?? null,
    p_projected_line_price: values.line ?? null,
    p_latest_close: values.latest?.close ?? null,
    p_latest_high: values.latest?.high ?? null,
    p_latest_low: values.latest?.low ?? null,
    p_distance_pct: values.distancePct ?? null,
    p_latest_market_date: values.latest?.time ?? null,
    p_evaluated_at: new Date().toISOString(),
  })
}

async function evaluateAll(req: Request) {
  const evaluatorKey = req.headers.get('x-stockscout-evaluator-key') ?? ''
  const evaluatorHash = await sha256(evaluatorKey)
  const { data: allowed, error: authError } = await api.rpc('next_chart_alert_evaluator_authorized', { p_hash: evaluatorHash })
  if (authError || allowed !== true) return json({ error: 'Unauthorized evaluator' }, 401)

  const manifestResponse = await fetch(`${PAGES_BASE}data/manifest.json?alertEval=${Date.now()}`, { cache: 'no-store' })
  if (!manifestResponse.ok) return json({ error: `Manifest HTTP ${manifestResponse.status}` }, 502)
  const manifest = await manifestResponse.json()
  const coreAsset = manifest?.assets?.core
  const chartAsset = manifest?.assets?.charts
  if (!coreAsset?.path || !chartAsset?.path || !manifest?.generatedAt) return json({ error: 'Invalid Pages manifest' }, 502)

  const coreResponse = await fetch(`${PAGES_BASE}data/${coreAsset.path}?v=${encodeURIComponent(coreAsset.sha256 ?? manifest.generatedAt)}`, { cache: 'no-store' })
  if (!coreResponse.ok) return json({ error: `Core HTTP ${coreResponse.status}` }, 502)
  const core = await coreResponse.json()

  const { data: enabledRows, error: alertsError } = await api.rpc('next_chart_alert_v2_enabled')
  if (alertsError) return json({ error: alertsError.message }, 500)
  const alerts = Array.isArray(enabledRows) ? enabledRows as EvaluatorRow[] : []
  if (!alerts.length) return json({ ok: true, engine: 'v2-trading-bars', generatedAt: manifest.generatedAt, evaluated: 0, fired: 0, needsReview: 0 })

  const shardCache = new Map<string, any>()
  let fired = 0
  let needsReview = 0
  const failures: string[] = []

  for (const alert of alerts) {
    try {
      const shard = core?.chartShards?.[alert.ticker]
      if (!shard) {
        needsReview += 1
        await updateStatus(alert, { state: 'needs_review', reason: 'chart_shard_missing' })
        failures.push(`${alert.ticker}: no chart shard`)
        continue
      }

      let payload = shardCache.get(shard)
      if (!payload) {
        const response = await fetch(`${PAGES_BASE}data/${chartAsset.path}/${shard}?v=${encodeURIComponent(chartAsset.sha256 ?? manifest.generatedAt)}`, { cache: 'no-store' })
        if (!response.ok) {
          needsReview += 1
          await updateStatus(alert, { state: 'needs_review', reason: `chart_http_${response.status}` })
          failures.push(`${alert.ticker}: chart HTTP ${response.status}`)
          continue
        }
        payload = await response.json()
        shardCache.set(shard, payload)
      }

      const bars = (Array.isArray(payload?.[alert.ticker]) ? payload[alert.ticker] : []).map(toBar).filter(Boolean) as Bar[]
      const frame = barsForAlertInterval(bars, alert.interval)
      const latest = frame.length ? frame[frame.length - 1] : null

      if (alert.kind === 'trendline' && alert.metadata?.legacyIntervalUnknown === true) {
        needsReview += 1
        await updateStatus(alert, { state: 'needs_review', reason: 'legacy_interval_not_persisted', latest })
        continue
      }

      const geometry = evaluateAlertGeometry({
        points: alert.points,
        interval: alert.interval,
        condition: alert.condition,
        basis: alert.source,
      }, bars)

      if (!geometry.valid || !latest || geometry.line == null) {
        needsReview += 1
        await updateStatus(alert, {
          state: 'needs_review',
          reason: reviewReason(alert, geometry.reason),
          line: geometry.line,
          latest,
        })
        continue
      }

      const distancePct = geometry.line !== 0 ? ((latest.close - geometry.line) / geometry.line) * 100 : null
      await updateStatus(alert, {
        state: geometry.fired ? 'triggered' : 'active',
        reason: null,
        line: geometry.line,
        latest,
        distancePct,
      })
      if (!geometry.fired) continue

      const message = `✏️ ${alert.ticker} ${alert.interval} ${triggerLabel(alert.condition)} your ${alert.kind} ~${geometry.line.toFixed(2)} (${alert.source}; close ${latest.close.toFixed(2)}, ${latest.time})\n${PAGES_BASE}#${alert.ticker}`
      const initialTelegramStatus = alert.notify_telegram ? 'pending' : 'not_configured'
      const { data: eventId, error: insertError } = await api.rpc('next_chart_alert_v2_event_insert', {
        p_rule_id: alert.rule_id,
        p_scan_generated_at: manifest.generatedAt,
        p_market_date: latest.time,
        p_prev_line_price: geometry.prevLine == null ? null : Number(geometry.prevLine.toFixed(6)),
        p_current_line_price: Number(geometry.line.toFixed(6)),
        p_close_price: latest.close,
        p_message: message,
        p_telegram_status: initialTelegramStatus,
      })
      if (insertError) {
        failures.push(`${alert.ticker}: ${insertError.message}`)
        continue
      }

      if (typeof eventId === 'string' && eventId) {
        fired += 1
        if (alert.notify_telegram) {
          const telegram = await sendTelegram(message)
          const { error: updateError } = await api.rpc('next_chart_alert_event_telegram_update', {
            p_id: eventId,
            p_status: telegram.status,
            p_error: telegram.error || null,
            p_sent_at: telegram.status === 'sent' ? new Date().toISOString() : null,
          })
          if (updateError) failures.push(`${alert.ticker}: telegram status update ${updateError.message}`)
        }
      }

      if (alert.lifecycle === 'one_shot') {
        const { error: disableError } = await api.rpc('next_chart_alert_rule_disable_after_fire', { p_rule_id: alert.rule_id })
        if (disableError) failures.push(`${alert.ticker}: one-shot disable ${disableError.message}`)
      }
    } catch (error) {
      failures.push(`${alert.ticker}: ${String(error)}`)
    }
  }

  return json({
    ok: true,
    engine: 'v2-trading-bars',
    generatedAt: manifest.generatedAt,
    evaluated: alerts.length,
    fired,
    needsReview,
    failures: failures.slice(0, 20),
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = req.method === 'GET' ? {} : await req.json().catch(() => ({}))
    const action = req.method === 'GET' ? 'list' : String(body?.action ?? '')
    if (action === 'evaluate') return evaluateAll(req)

    const deviceKey = req.headers.get('x-stockscout-device-key') ?? ''
    if (deviceKey.length < 32 || deviceKey.length > 256) return json({ error: 'Missing device key' }, 401)
    const ownerKey = await sha256(deviceKey)

    if (action === 'list') {
      const { data, error } = await api.rpc('next_chart_alert_snapshot', { p_owner_key: ownerKey })
      if (error) return json({ error: error.message }, 500)
      const snapshot = (data && typeof data === 'object' ? data : {}) as Snapshot
      return json({ alerts: (snapshot.alerts ?? []).map(toClientAlert), events: snapshot.events ?? [] })
    }

    if (action === 'upsert') {
      const alert = normalizeAlert(body?.alert)
      const { data, error } = await api.rpc('next_chart_alert_upsert', { p_owner_key: ownerKey, p_alert: alert })
      if (error) return json({ error: error.message }, error.code === 'P0002' ? 404 : 500)
      if (!data || typeof data !== 'object') return json({ error: 'Alert upsert returned no row' }, 500)
      return json({ alert: toClientAlert(data as AlertRow) }, alert.id ? 200 : 201)
    }

    if (action === 'delete') {
      const id = String(body?.id ?? '')
      if (!id) return json({ error: 'Missing alert id' }, 400)
      const { data, error } = await api.rpc('next_chart_alert_delete', { p_owner_key: ownerKey, p_id: id })
      if (error) return json({ error: error.message }, 500)
      return json({ ok: data === true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (error) {
    return json({ error: String(error) }, 500)
  }
})
