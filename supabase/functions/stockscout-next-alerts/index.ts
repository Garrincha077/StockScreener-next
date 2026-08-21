import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,x-stockscout-device-key,x-stockscout-evaluator-key',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const PAGES_BASE = (Deno.env.get('STOCKSCOUT_NEXT_PAGES_BASE') ?? 'https://garrincha077.github.io/StockScreener-next/').replace(/\/?$/, '/')
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

type Point = { time: string; price: number }
type AlertRow = {
  id: string
  owner_key: string
  ticker: string
  points: Point[]
  mode: 'break_up' | 'break_down' | 'touch'
  enabled: boolean
  notify_telegram: boolean
  created_at: string
  updated_at: string
}
type Bar = { time: string; open: number; high: number; low: number; close: number }

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
    ticker,
    points,
    mode,
    enabled: Boolean(raw?.enabled),
    notify_telegram: raw?.notifyTelegram !== false,
    updated_at: new Date().toISOString(),
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

function dayValue(iso: string) {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86400000
}

function projectLine(points: Point[], atTime: string) {
  const [a, b] = points
  const t1 = dayValue(a.time), t2 = dayValue(b.time), at = dayValue(atTime)
  if (![t1, t2, at, a.price, b.price].every(Number.isFinite)) return null
  if (t1 === t2) return b.price
  return a.price + ((b.price - a.price) / (t2 - t1)) * (at - t1)
}

function evaluateAlert(alert: AlertRow, bars: Bar[]) {
  if (bars.length < 2) return null
  const prev = bars[bars.length - 2]
  const last = bars[bars.length - 1]
  const prevLine = projectLine(alert.points, prev.time)
  const line = projectLine(alert.points, last.time)
  if (prevLine == null || line == null) return null
  let fired = false
  if (alert.mode === 'break_up') fired = prev.close <= prevLine && last.close > line
  else if (alert.mode === 'break_down') fired = prev.close >= prevLine && last.close < line
  else fired = last.low <= line && line <= last.high
  if (!fired) return null
  const label = alert.mode === 'break_up' ? '📈 crossed above' : alert.mode === 'break_down' ? '📉 crossed below' : '🎯 touched'
  const message = `✏️ ${alert.ticker} ${label} your line ~${line.toFixed(2)} (close ${last.close.toFixed(2)}, ${last.time})\n${PAGES_BASE}#${alert.ticker}`
  return { line, last, message }
}

async function readSecret(name: string) {
  const envName=name==='stockscout_next_telegram_bot_token'?'STOCKSCOUT_NEXT_TELEGRAM_BOT_TOKEN':name==='stockscout_next_telegram_chat_id'?'STOCKSCOUT_NEXT_TELEGRAM_CHAT_ID':''
  if(envName){const direct=Deno.env.get(envName);if(direct)return direct}
  const { data, error } = await db.rpc('stockscout_next_secret', { secret_name: name })
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

async function evaluateAll(req: Request) {
  const evaluatorKey = req.headers.get('x-stockscout-evaluator-key') ?? ''
  const evaluatorHash = await sha256(evaluatorKey)
  const { data: config, error: authError } = await db.from('stockscout_next_runtime_config').select('value').eq('key','evaluator_key_sha256').maybeSingle()
  if (authError || !config || config.value !== evaluatorHash) return json({ error: 'Unauthorized evaluator' }, 401)

  const manifestResponse = await fetch(`${PAGES_BASE}data/manifest.json?alertEval=${Date.now()}`, { cache: 'no-store' })
  if (!manifestResponse.ok) return json({ error: `Manifest HTTP ${manifestResponse.status}` }, 502)
  const manifest = await manifestResponse.json()
  const coreAsset = manifest?.assets?.core
  const chartAsset = manifest?.assets?.charts
  if (!coreAsset?.path || !chartAsset?.path || !manifest?.generatedAt) return json({ error: 'Invalid Pages manifest' }, 502)

  const coreResponse = await fetch(`${PAGES_BASE}data/${coreAsset.path}?v=${encodeURIComponent(coreAsset.sha256 ?? manifest.generatedAt)}`, { cache: 'no-store' })
  if (!coreResponse.ok) return json({ error: `Core HTTP ${coreResponse.status}` }, 502)
  const core = await coreResponse.json()

  const { data: alerts, error: alertsError } = await db
    .from('stockscout_next_chart_alerts')
    .select('*')
    .eq('enabled', true)
    .order('updated_at', { ascending: true })
  if (alertsError) return json({ error: alertsError.message }, 500)
  if (!alerts?.length) return json({ ok: true, generatedAt: manifest.generatedAt, evaluated: 0, fired: 0 })

  const shardCache = new Map<string, any>()
  let fired = 0
  const failures: string[] = []
  for (const alert of alerts as AlertRow[]) {
    try {
      const shard = core?.chartShards?.[alert.ticker]
      if (!shard) { failures.push(`${alert.ticker}: no chart shard`); continue }
      let payload = shardCache.get(shard)
      if (!payload) {
        const response = await fetch(`${PAGES_BASE}data/${chartAsset.path}/${shard}?v=${encodeURIComponent(chartAsset.sha256 ?? manifest.generatedAt)}`, { cache: 'no-store' })
        if (!response.ok) { failures.push(`${alert.ticker}: chart HTTP ${response.status}`); continue }
        payload = await response.json()
        shardCache.set(shard, payload)
      }
      const bars = (Array.isArray(payload?.[alert.ticker]) ? payload[alert.ticker] : []).map(toBar).filter(Boolean) as Bar[]
      const hit = evaluateAlert(alert, bars)
      if (!hit) continue

      const event = {
        alert_id: alert.id,
        owner_key: alert.owner_key,
        ticker: alert.ticker,
        event_type: alert.mode,
        scan_generated_at: manifest.generatedAt,
        market_date: hit.last.time,
        line_price: Number(hit.line.toFixed(6)),
        close_price: hit.last.close,
        message: hit.message,
        telegram_status: alert.notify_telegram ? 'pending' : 'not_configured',
      }
      const { data: inserted, error: insertError } = await db
        .from('stockscout_next_alert_events')
        .upsert(event, { onConflict: 'alert_id,scan_generated_at', ignoreDuplicates: true })
        .select('id')
        .maybeSingle()
      if (insertError) { failures.push(`${alert.ticker}: ${insertError.message}`); continue }
      if (!inserted?.id) continue
      fired += 1

      if (alert.notify_telegram) {
        const telegram = await sendTelegram(hit.message)
        await db.from('stockscout_next_alert_events').update({
          telegram_status: telegram.status,
          telegram_sent_at: telegram.status === 'sent' ? new Date().toISOString() : null,
          telegram_error: telegram.error || null,
        }).eq('id', inserted.id)
      }
    } catch (error) {
      failures.push(`${alert.ticker}: ${String(error)}`)
    }
  }
  return json({ ok: true, generatedAt: manifest.generatedAt, evaluated: alerts.length, fired, failures: failures.slice(0, 20) })
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
      const [{ data: alerts, error: alertsError }, { data: events, error: eventsError }] = await Promise.all([
        db.from('stockscout_next_chart_alerts').select('*').eq('owner_key', ownerKey).order('updated_at', { ascending: false }),
        db.from('stockscout_next_alert_events').select('*').eq('owner_key', ownerKey).order('created_at', { ascending: false }).limit(50),
      ])
      if (alertsError || eventsError) return json({ error: alertsError?.message ?? eventsError?.message }, 500)
      return json({ alerts: (alerts as AlertRow[] ?? []).map(toClientAlert), events: events ?? [] })
    }

    if (action === 'upsert') {
      const alert = normalizeAlert(body?.alert)
      const id = typeof body?.alert?.id === 'string' ? body.alert.id : ''
      if (id) {
        const { data, error } = await db.from('stockscout_next_chart_alerts').update(alert).eq('id', id).eq('owner_key', ownerKey).select('*').maybeSingle()
        if (error) return json({ error: error.message }, 500)
        if (!data) return json({ error: 'Alert not found' }, 404)
        return json({ alert: toClientAlert(data as AlertRow) })
      }
      const { data, error } = await db.from('stockscout_next_chart_alerts').insert({ ...alert, owner_key: ownerKey }).select('*').single()
      if (error) return json({ error: error.message }, 500)
      return json({ alert: toClientAlert(data as AlertRow) }, 201)
    }

    if (action === 'delete') {
      const id = String(body?.id ?? '')
      if (!id) return json({ error: 'Missing alert id' }, 400)
      const { error } = await db.from('stockscout_next_chart_alerts').delete().eq('id', id).eq('owner_key', ownerKey)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (error) {
    return json({ error: String(error) }, 500)
  }
})
