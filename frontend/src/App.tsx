import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  createChart,
} from 'lightweight-charts'

type Components = {
  neglectedHistory: number
  baseMaturity: number
  rsTurn: number
  rsAcceleration: number
  volumeAwakening: number
  notExtended: number
}

type Stock = {
  ticker: string
  price: number
  change20d: number
  return6m: number
  return1y?: number
  stage: number
  stageName: string
  setup: string
  score: number
  rsRank?: number
  rsComposite?: number
  rsSlope: number
  rsAcceleration: number
  rs3m?: number
  rs6m?: number
  rs12m?: number
  volumeRatio: number
  avgVolume20?: number
  avgDollarVolume20?: number
  vcpScore: number
  contraction: number
  distance50: number
  distance200: number
  from52wHigh: number
  sma50: number
  sma150: number
  sma200: number
  perfect: boolean
  earlyStage2: boolean
  wakingUp: boolean
  fundamentalSupport?: boolean | null
  revenueYoY?: number | null
  epsYoY?: number | null
  grossMargin?: number | null
  marginChange?: number | null
  fundamentalPenalty?: number
  components: Components
  reasons: string[]
}

type Bar = {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  rs?: number
  ma10?: number | null
  ma20?: number | null
  ma30?: number | null
  ma50?: number | null
  ma200?: number | null
}

type RawBar = [string, number, number, number, number, number, number]

type Market = {
  scanDate?: string
  analyzed?: number
  buyCount?: number
  sellCount?: number
  regime?: string
  totalUniverse?: number
  stageCounts?: Record<string, number>
  stage2Pct?: number
  earlyLeaders?: number
  perfectSetups?: number
  wakingUp?: number
  fiveYearCharts?: number
  rs90Plus?: number
  fundamentalSupportCount?: number
}

type Payload = {
  version: number
  generatedAt: string
  market: Market
  universe: Stock[]
  chartShards?: Record<string, string>
  chartShardCount?: number
  charts?: Record<string, Bar[]>
}

type Page = 'Dashboard' | 'Screener' | 'Watchlist' | 'Charts' | 'Market' | 'Reports'
type ChartMode = 'Price' | 'RS vs SPY' | 'Volume'
type ChartRange = '3M' | '6M' | '1Y' | '2Y' | '5Y'
type ChartInterval = 'D' | 'W'
type FundamentalFilter = 'All' | 'Support' | 'Available'

type FilterState = {
  stage: string
  minScore: number
  minRsRank: number
  minVolume: number
  minRsAccel: number
  maxExtension: number
  maxFromHigh: number
  fundamentals: FundamentalFilter
}

type ScanState = {
  status: 'idle' | 'queued' | 'in_progress' | 'completed' | 'unknown'
  conclusion?: string | null
  runId?: number
}

const DEFAULT_FILTERS: FilterState = {
  stage: 'All',
  minScore: 0,
  minRsRank: 0,
  minVolume: 0,
  minRsAccel: -99,
  maxExtension: 999,
  maxFromHigh: 999,
  fundamentals: 'All',
}

const demoBase: Omit<Stock, 'ticker' | 'price' | 'score' | 'setup'> = {
  change20d: 5.2, return6m: 12, return1y: 8, stage: 2, stageName: 'Uptrend/Breakout',
  rsRank: 93, rsComposite: 12, rsSlope: .31, rsAcceleration: .19, rs3m: 8, rs6m: 11, rs12m: 15,
  volumeRatio: 2.1, avgVolume20: 1_800_000, avgDollarVolume20: 72_000_000,
  vcpScore: 74, contraction: 61, distance50: 4.1, distance200: 31, from52wHigh: -6.2,
  sma50: 40, sma150: 33, sma200: 29, perfect: true, earlyStage2: true, wakingUp: true,
  fundamentalSupport: true, revenueYoY: 28, epsYoY: 34, grossMargin: 54, marginChange: 1.4, fundamentalPenalty: 0,
  components: { neglectedHistory: 18, baseMaturity: 17, rsTurn: 19, rsAcceleration: 14, volumeAwakening: 13, notExtended: 9 },
  reasons: ['RS accelerating versus SPY', 'Volume expanding above 20D average', 'Price remains close to 50DMA', 'Base/volatility contraction improving'],
}

const demoStocks: Stock[] = [
  { ...demoBase, ticker: 'IREN', price: 17.24, score: 94, setup: 'Perfect', sma50: 16.67, sma150: 13.21, sma200: 9.72 },
  { ...demoBase, ticker: 'PLTR', price: 182.40, score: 91, setup: 'Perfect', rsRank: 96, return6m: 33, sma50: 177.6, sma150: 151.1, sma200: 112.9 },
  { ...demoBase, ticker: 'GEV', price: 612.10, score: 90, setup: 'Perfect', rsRank: 91, return6m: 28, sma50: 588, sma150: 531, sma200: 412 },
  { ...demoBase, ticker: 'HUBS', price: 640.12, score: 87, setup: 'Wake-up', perfect: false, rsRank: 84, volumeRatio: 1.9, return6m: 9 },
  { ...demoBase, ticker: 'APP', price: 273.35, score: 86, setup: 'Wake-up', perfect: false, rsRank: 88, volumeRatio: 2.0, return6m: 21 },
  { ...demoBase, ticker: 'ABNB', price: 145.80, score: 83, setup: 'Waking Up', stage: 1, stageName: 'Base Building', perfect: false, earlyStage2: false, rsRank: 76, return6m: -4 },
  { ...demoBase, ticker: 'CRWD', price: 322.50, score: 82, setup: 'Early Stage 2', perfect: false, wakingUp: false, rsRank: 81, volumeRatio: 1.8 },
  { ...demoBase, ticker: 'SMCI', price: 88.12, score: 81, setup: 'Perfect', stage: 1, stageName: 'Base Building', earlyStage2: false, rsRank: 72, return6m: -8 },
  { ...demoBase, ticker: 'DDOG', price: 117.86, score: 80, setup: 'Wake-up', perfect: false, rsRank: 78, volumeRatio: 1.7 },
  { ...demoBase, ticker: 'OKLO', price: 124.40, score: 79, setup: 'Perfect', rsRank: 89, volumeRatio: 2.4 },
]

function demoBars(price: number): Bar[] {
  const out: Bar[] = []
  const now = new Date()
  let last = price * .25
  for (let i = 1825; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    if (d.getDay() === 0 || d.getDay() === 6) continue
    const drift = .00125 + Math.sin(i / 29) * .003
    const next = Math.max(2, last * (1 + drift + Math.sin(i * 2.17) * .008))
    const hi = Math.max(last, next) * 1.014
    const lo = Math.min(last, next) * .987
    out.push({
      time: d.toISOString().slice(0, 10), open: last, high: hi, low: lo, close: next,
      volume: 800000 + ((i * 7919) % 1200000), rs: 70 + Math.sin(i / 31) * 9 + i / 200,
    })
    last = next
  }
  const scale = price / out[out.length - 1].close
  out.forEach((b) => { b.open *= scale; b.high *= scale; b.low *= scale; b.close *= scale })
  return out
}

const demoPayload: Payload = {
  version: 3,
  generatedAt: new Date().toISOString(),
  market: {
    regime: 'RISK ON', totalUniverse: 3842, analyzed: 3714, stage2Pct: 72, earlyLeaders: 37,
    perfectSetups: 12, wakingUp: 21, fiveYearCharts: 3714, rs90Plus: 184, fundamentalSupportCount: 420, scanDate: 'DEMO',
  },
  universe: demoStocks,
}

const columnHelper = createColumnHelper<Stock>()
const REPO = 'Garrincha077/stock-screener2'
const ACTIONS_URL = `https://github.com/${REPO}/actions`
const REPORT_URL = `https://github.com/${REPO}/blob/main/data/daily_scans/latest_optimized_scan.txt`

function fmt(n: number | undefined | null, digits = 1) {
  return typeof n === 'number' && Number.isFinite(n) ? n.toFixed(digits) : '—'
}
function signed(n: number | undefined | null, digits = 1) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`
}
function compactNumber(n: number | undefined | null) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)) }
function setupClass(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-') }

function safeWatchlist(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem('stockscout-watchlist') || '[]')
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch { return [] }
}

function safeFilters(): FilterState {
  try {
    const parsed = JSON.parse(localStorage.getItem('stockscout-filters') || '{}') as Partial<FilterState>
    return { ...DEFAULT_FILTERS, ...parsed }
  } catch { return DEFAULT_FILTERS }
}

function movingAverage(values: number[], idx: number, length: number) {
  if (idx + 1 < length) return null
  let sum = 0
  for (let i = idx + 1 - length; i <= idx; i++) sum += values[i]
  return sum / length
}

function enrichMovingAverages(input: Bar[], interval: ChartInterval): Bar[] {
  const out = input.map((b) => ({ ...b }))
  const closes = out.map((b) => b.close)
  out.forEach((b, i) => {
    if (interval === 'D') {
      b.ma10 = movingAverage(closes, i, 10)
      b.ma20 = movingAverage(closes, i, 20)
      b.ma50 = movingAverage(closes, i, 50)
      b.ma200 = movingAverage(closes, i, 200)
    } else {
      b.ma10 = movingAverage(closes, i, 10)
      b.ma30 = movingAverage(closes, i, 30)
    }
  })
  return out
}

function weekKey(time: string) {
  const d = new Date(`${time}T00:00:00Z`)
  const day = d.getUTCDay()
  const back = (day + 6) % 7
  d.setUTCDate(d.getUTCDate() - back)
  return d.toISOString().slice(0, 10)
}

function aggregateWeekly(input: Bar[]): Bar[] {
  const groups = new Map<string, Bar>()
  for (const b of input) {
    const key = weekKey(b.time)
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, { ...b, time: key })
    } else {
      existing.high = Math.max(existing.high, b.high)
      existing.low = Math.min(existing.low, b.low)
      existing.close = b.close
      existing.volume += b.volume
      existing.rs = b.rs
    }
  }
  return Array.from(groups.values())
}

function decodeBars(rows: RawBar[]): Bar[] {
  return rows.map((r) => ({ time: r[0], open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5], rs: r[6] }))
}

function rangeCount(range: ChartRange, interval: ChartInterval) {
  if (interval === 'W') return ({ '3M': 13, '6M': 26, '1Y': 52, '2Y': 104, '5Y': 260 } as Record<ChartRange, number>)[range]
  return ({ '3M': 66, '6M': 132, '1Y': 252, '2Y': 504, '5Y': 1265 } as Record<ChartRange, number>)[range]
}

function ageLabel(iso: string) {
  const age = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(age)) return 'unknown age'
  const hours = Math.max(0, Math.round(age / 3_600_000))
  if (hours < 1) return 'fresh'
  if (hours < 48) return `${hours}h old`
  return `${Math.round(hours / 24)}d old`
}

function TradingChart({ bars, stock, mode, range, interval }: {
  bars: Bar[]
  stock: Stock
  mode: ChartMode
  range: ChartRange
  interval: ChartInterval
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current || !bars.length) return
    const intervalBars = interval === 'W' ? aggregateWeekly(bars) : bars
    const enriched = enrichMovingAverages(intervalBars, interval)
    const visible = enriched.slice(-rangeCount(range, interval))
    if (!visible.length) return

    const chart = createChart(ref.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: '#08111d' }, textColor: '#8193aa', attributionLogo: true },
      grid: { vertLines: { color: '#142238' }, horzLines: { color: '#142238' } },
      rightPriceScale: { borderColor: '#243248' },
      timeScale: { borderColor: '#243248', timeVisible: false, rightOffset: 3 },
      crosshair: { vertLine: { color: '#52657f' }, horzLine: { color: '#52657f' } },
    })

    if (mode === 'Price') {
      const candles = chart.addSeries(CandlestickSeries, {
        upColor: '#20d886', downColor: '#f05d6c', wickUpColor: '#20d886', wickDownColor: '#f05d6c', borderVisible: false,
      })
      candles.setData(visible.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })) as any)

      const configs: [keyof Bar, string][] = interval === 'D'
        ? [['ma10', '#f4c95d'], ['ma20', '#4ba3ff'], ['ma50', '#a36cff'], ['ma200', '#26c7b7']]
        : [['ma10', '#f4c95d'], ['ma30', '#4ba3ff']]
      configs.forEach(([key, color]) => {
        const line = chart.addSeries(LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
        line.setData(visible.filter((b) => typeof b[key] === 'number').map((b) => ({ time: b.time, value: b[key] as number })) as any)
      })

      const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '', lastValueVisible: false, priceLineVisible: false })
      volume.priceScale().applyOptions({ scaleMargins: { top: .83, bottom: 0 } })
      volume.setData(visible.map((b) => ({
        time: b.time, value: b.volume, color: b.close >= b.open ? 'rgba(32,216,134,.28)' : 'rgba(240,93,108,.28)',
      })) as any)
    } else if (mode === 'RS vs SPY') {
      const line = chart.addSeries(LineSeries, { color: '#54a6ff', lineWidth: 3, priceLineVisible: false, lastValueVisible: true })
      line.setData(visible.filter((b) => typeof b.rs === 'number' && (b.rs ?? 0) > 0).map((b) => ({ time: b.time, value: b.rs as number })) as any)
    } else {
      const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '', lastValueVisible: true, priceLineVisible: false })
      volume.setData(visible.map((b) => ({
        time: b.time, value: b.volume, color: b.close >= b.open ? 'rgba(32,216,134,.68)' : 'rgba(240,93,108,.68)',
      })) as any)
    }

    chart.timeScale().fitContent()
    const ro = new ResizeObserver(() => chart.applyOptions({ width: ref.current?.clientWidth ?? 700, height: ref.current?.clientHeight ?? 470 }))
    ro.observe(ref.current)
    return () => { ro.disconnect(); chart.remove() }
  }, [bars, stock.ticker, mode, range, interval])
  return <div className="chart" ref={ref} />
}

function App() {
  const [payload, setPayload] = useState<Payload>(demoPayload)
  const [isDemo, setIsDemo] = useState(true)
  const [dataError, setDataError] = useState('')
  const initialTicker = location.hash.replace('#', '').toUpperCase()
  const [selectedTicker, setSelectedTicker] = useState(initialTicker || 'IREN')
  const [setupMode, setSetupMode] = useState('Perfect')
  const [page, setPage] = useState<Page>('Dashboard')
  const [query, setQuery] = useState('')
  const [sorting, setSorting] = useState<SortingState>([{ id: 'score', desc: true }])
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 100 })
  const [watchlist, setWatchlist] = useState<string[]>(safeWatchlist)
  const [filters, setFilters] = useState<FilterState>(safeFilters)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [chartMode, setChartMode] = useState<ChartMode>('Price')
  const [chartRange, setChartRange] = useState<ChartRange>('5Y')
  const [chartInterval, setChartInterval] = useState<ChartInterval>('W')
  const [bars, setBars] = useState<Bar[]>(demoBars(demoStocks[0].price))
  const [chartLoading, setChartLoading] = useState(false)
  const [chartError, setChartError] = useState('')
  const [scanState, setScanState] = useState<ScanState>({ status: 'unknown' })
  const searchRef = useRef<HTMLInputElement>(null)
  const shardCache = useRef<Record<string, Record<string, RawBar[]>>>({})

  const loadLatest = () => {
    setDataError('')
    fetch(`./data/latest.json?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(`dataset HTTP ${r.status}`); return r.json() })
      .then((data: Payload) => {
        if (!Array.isArray(data.universe) || !data.universe.length) throw new Error('dataset has no universe')
        setPayload(data)
        setIsDemo(false)
        const hashTicker = location.hash.replace('#', '').toUpperCase()
        const first = data.universe.find((s) => s.ticker === hashTicker)?.ticker || data.universe[0]?.ticker
        if (first) setSelectedTicker(first)
      })
      .catch((e) => { setIsDemo(true); setDataError(String(e?.message || e)) })
  }

  useEffect(loadLatest, [])
  useEffect(() => localStorage.setItem('stockscout-watchlist', JSON.stringify(watchlist)), [watchlist])
  useEffect(() => localStorage.setItem('stockscout-filters', JSON.stringify(filters)), [filters])
  useEffect(() => { if (selectedTicker) history.replaceState(null, '', `${location.pathname}${location.search}#${selectedTicker}`) }, [selectedTicker])

  useEffect(() => {
    const check = () => fetch(`https://api.github.com/repos/${REPO}/actions/workflows/daily_screening_git_storage.yml/runs?per_page=1`, { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d) => {
        const run = d.workflow_runs?.[0]
        if (!run) return setScanState({ status: 'idle' })
        setScanState({ status: run.status || 'unknown', conclusion: run.conclusion, runId: run.id })
      })
      .catch(() => setScanState((s) => s.status === 'unknown' ? s : { status: 'unknown' }))
    check()
    const timer = window.setInterval(check, 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const selected = payload.universe.find((s) => s.ticker === selectedTicker)
    if (!selected) return
    setChartError('')
    if (isDemo) { setBars(demoBars(selected.price)); return }

    const inline = payload.charts?.[selectedTicker]
    if (inline?.length) { setBars(inline.map((b) => ({ ...b }))); return }

    const shard = payload.chartShards?.[selectedTicker]
    if (!shard) { setBars([]); setChartError('No chart shard for this ticker'); return }
    const cached = shardCache.current[shard]
    if (cached?.[selectedTicker]) { setBars(decodeBars(cached[selectedTicker])); return }

    setChartLoading(true)
    fetch(`./data/charts/${shard}`, { cache: 'force-cache' })
      .then((r) => { if (!r.ok) throw new Error(`chart HTTP ${r.status}`); return r.json() })
      .then((data: Record<string, RawBar[]>) => {
        shardCache.current[shard] = data
        const rows = data[selectedTicker]
        if (!rows?.length) throw new Error('ticker missing from chart shard')
        setBars(decodeBars(rows))
      })
      .catch((e) => { setBars([]); setChartError(String(e?.message || e)) })
      .finally(() => setChartLoading(false))
  }, [selectedTicker, payload, isDemo])

  const activeUniverse = useMemo(
    () => page === 'Watchlist' ? payload.universe.filter((s) => watchlist.includes(s.ticker)) : payload.universe,
    [payload, page, watchlist],
  )

  const filtered = useMemo(() => activeUniverse.filter((s) => {
    const q = query.trim().toLowerCase()
    if (q && !s.ticker.toLowerCase().includes(q) && !s.setup.toLowerCase().includes(q) && !s.stageName.toLowerCase().includes(q)) return false
    if (setupMode === 'Perfect' && !s.perfect) return false
    if (setupMode === 'Early Stage 2' && !s.earlyStage2) return false
    if (setupMode === 'Waking Up' && !s.wakingUp) return false
    if (setupMode === 'RS Leaders' && (s.rsRank ?? 0) < 80) return false
    if (setupMode === 'Volume Breakouts' && s.volumeRatio < 1.5) return false
    if (setupMode === 'VCP / Compression' && s.vcpScore < 50 && s.contraction < 50) return false
    if (filters.stage !== 'All' && s.stage !== Number(filters.stage)) return false
    if (s.score < filters.minScore) return false
    if ((s.rsRank ?? 0) < filters.minRsRank) return false
    if (s.volumeRatio < filters.minVolume) return false
    if (s.rsAcceleration < filters.minRsAccel) return false
    if (Math.abs(s.distance50) > filters.maxExtension) return false
    if (Math.abs(Math.min(0, s.from52wHigh)) > filters.maxFromHigh) return false
    if (filters.fundamentals === 'Support' && s.fundamentalSupport !== true) return false
    if (filters.fundamentals === 'Available' && s.fundamentalSupport == null) return false
    return true
  }), [activeUniverse, setupMode, query, filters])

  useEffect(() => setPagination((p) => ({ ...p, pageIndex: 0 })), [setupMode, query, filters, page])

  const toggleWatch = (ticker: string) => setWatchlist((w) => w.includes(ticker) ? w.filter((x) => x !== ticker) : [...w, ticker])

  const columns = useMemo(() => [
    columnHelper.display({ id: 'watch', header: '', cell: ({ row }) => <button aria-label="Toggle watchlist" className={`star ${watchlist.includes(row.original.ticker) ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); toggleWatch(row.original.ticker) }}>★</button> }),
    columnHelper.accessor('ticker', { header: 'Ticker', cell: (i) => <strong>{i.getValue()}</strong> }),
    columnHelper.accessor('price', { header: 'Price', cell: (i) => `$${fmt(i.getValue(), 2)}` }),
    columnHelper.accessor('score', { header: 'Setup', cell: (i) => <span className="score">{i.getValue()}</span> }),
    columnHelper.accessor('rsRank', { header: 'RS Rank', cell: (i) => <span className={`rank ${(i.getValue() ?? 0) >= 90 ? 'elite' : ''}`}>{i.getValue() ?? '—'}</span> }),
    columnHelper.accessor('rsAcceleration', { header: 'RS Δ', cell: (i) => <span className={i.getValue() > 0 ? 'positive' : 'negative'}>{i.getValue() > 0 ? '↑' : '↓'} {fmt(i.getValue(), 2)}</span> }),
    columnHelper.accessor('stage', { header: 'Stage', cell: (i) => <span className="stage">{i.getValue()}</span> }),
    columnHelper.accessor('setup', { header: 'Pattern', cell: (i) => <span className={`setup ${setupClass(i.getValue())}`}>{i.getValue()}</span> }),
    columnHelper.accessor('change20d', { header: '20D', cell: (i) => <span className={i.getValue() >= 0 ? 'positive' : 'negative'}>{signed(i.getValue())}</span> }),
    columnHelper.accessor('return6m', { header: '6M', cell: (i) => <span className={i.getValue() >= 0 ? 'positive' : 'negative'}>{signed(i.getValue())}</span> }),
    columnHelper.accessor('volumeRatio', { header: 'Vol', cell: (i) => <span className={i.getValue() >= 1.5 ? 'positive' : ''}>{fmt(i.getValue(), 1)}x</span> }),
    columnHelper.accessor('vcpScore', { header: 'VCP', cell: (i) => fmt(i.getValue(), 0) }),
    columnHelper.accessor('distance50', { header: '50D ext', cell: (i) => <span className={Math.abs(i.getValue()) <= 10 ? 'positive' : 'warn'}>{signed(i.getValue())}</span> }),
    columnHelper.accessor('from52wHigh', { header: '52W high', cell: (i) => signed(i.getValue()) }),
    columnHelper.accessor('fundamentalSupport', { header: 'Fund', cell: (i) => i.getValue() == null ? <span className="muted">—</span> : <span className={i.getValue() ? 'positive' : 'negative'}>{i.getValue() ? '✓' : '×'}</span> }),
  ], [watchlist])

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const selected = payload.universe.find((s) => s.ticker === selectedTicker) || payload.universe[0] || demoStocks[0]
  const currentRows = table.getRowModel().rows
  const currentIndex = currentRows.findIndex((r) => r.original.ticker === selected.ticker)
  const selectOffset = (offset: number) => {
    if (!currentRows.length) return
    const base = currentIndex >= 0 ? currentIndex : 0
    const next = clamp(base + offset, 0, currentRows.length - 1)
    setSelectedTicker(currentRows[next].original.ticker)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        if (e.key === 'Escape') (target as HTMLInputElement).blur()
        return
      }
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); return }
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); selectOffset(1); return }
      if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); selectOffset(-1); return }
      if (e.key.toLowerCase() === 'f') { toggleWatch(selected.ticker); return }
      if (e.key.toLowerCase() === 'd') { setChartInterval('D'); return }
      if (e.key.toLowerCase() === 'w') { setChartInterval('W'); return }
      if (e.key === '1') setChartMode('Price')
      if (e.key === '2') setChartMode('RS vs SPY')
      if (e.key === '3') setChartMode('Volume')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const m = payload.market
  const watchStocks = watchlist.map((t) => payload.universe.find((s) => s.ticker === t)).filter(Boolean) as Stock[]
  const modes = ['Perfect', 'Early Stage 2', 'Waking Up', 'RS Leaders', 'Volume Breakouts', 'VCP / Compression', 'All']
  const pages: Page[] = ['Dashboard', 'Screener', 'Watchlist', 'Charts', 'Market', 'Reports']
  const activeFilterCount = [
    filters.stage !== 'All', filters.minScore > 0, filters.minRsRank > 0, filters.minVolume > 0,
    filters.minRsAccel > -99, filters.maxExtension < 999, filters.maxFromHigh < 999, filters.fundamentals !== 'All',
  ].filter(Boolean).length

  const exportCsv = () => {
    const headers = ['ticker', 'price', 'score', 'rsRank', 'rsAcceleration', 'stage', 'setup', 'change20d', 'return6m', 'return1y', 'volumeRatio', 'vcpScore', 'contraction', 'distance50', 'from52wHigh', 'revenueYoY', 'epsYoY', 'fundamentalSupport']
    const rows = filtered.map((s) => headers.map((k) => JSON.stringify((s as unknown as Record<string, unknown>)[k] ?? '')).join(','))
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `stockscout-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const renderMetrics = () => <section className="metrics">
    <Metric title="Market regime" value={m.regime || 'Unknown'} sub="Scan-confirmed environment" tone="green" />
    <Metric title="Stage 2 breadth" value={`${m.stage2Pct ?? 0}%`} sub="Analyzed universe" tone="green" />
    <Metric title="Perfect setups" value={String(m.perfectSetups ?? 0)} sub="Neglected → waking" tone="purple" />
    <Metric title="Early leaders" value={String(m.earlyLeaders ?? 0)} sub="Early Stage 2" tone="blue" />
    <Metric title="RS 90+" value={String(m.rs90Plus ?? payload.universe.filter((s) => (s.rsRank ?? 0) >= 90).length)} sub="Top relative strength" tone="yellow" />
    <Metric title="5Y chart coverage" value={(m.fiveYearCharts ?? (isDemo ? m.analyzed : 0) ?? 0).toLocaleString()} sub={`${m.analyzed ?? payload.universe.length} analyzed`} tone="white" />
  </section>

  const detailPane = <DetailPane
    selected={selected} bars={bars} loading={chartLoading} chartError={chartError}
    watchlisted={watchlist.includes(selected.ticker)} onWatch={() => toggleWatch(selected.ticker)}
    chartMode={chartMode} setChartMode={setChartMode} chartRange={chartRange} setChartRange={setChartRange}
    chartInterval={chartInterval} setChartInterval={setChartInterval}
    onPrev={() => selectOffset(-1)} onNext={() => selectOffset(1)}
  />

  const screener = <section className={`workspace ${page === 'Screener' || page === 'Watchlist' ? 'focus' : ''}`}>
    <div className="leftpane">
      <div className="tabs">{modes.map((x) => <button key={x} className={setupMode === x ? 'active' : ''} onClick={() => setSetupMode(x)}>{x === 'Perfect' ? '★ ' : ''}{x}</button>)}</div>
      <div className="filters">
        <button className={`filtertoggle ${filtersOpen ? 'active' : ''}`} onClick={() => setFiltersOpen((v) => !v)}>⚙ Filters {activeFilterCount > 0 && <b>{activeFilterCount}</b>}</button>
        <input ref={searchRef} className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ticker or setup…   /" />
        <select className="pagesize" value={pagination.pageSize} onChange={(e) => setPagination({ pageIndex: 0, pageSize: Number(e.target.value) })}>
          <option value={50}>50 rows</option><option value={100}>100 rows</option><option value={250}>250 rows</option>
        </select>
        <button className="ghost" onClick={exportCsv}>Export CSV</button>
      </div>
      {filtersOpen && <div className="filterdrawer">
        <label>Stage<select value={filters.stage} onChange={(e) => setFilters((f) => ({ ...f, stage: e.target.value }))}><option>All</option><option>1</option><option>2</option><option>3</option><option>4</option></select></label>
        <label>Min setup<input type="number" min="0" max="100" value={filters.minScore || ''} placeholder="Any" onChange={(e) => setFilters((f) => ({ ...f, minScore: Number(e.target.value) || 0 }))} /></label>
        <label>Min RS Rank<input type="number" min="0" max="99" value={filters.minRsRank || ''} placeholder="Any" onChange={(e) => setFilters((f) => ({ ...f, minRsRank: Number(e.target.value) || 0 }))} /></label>
        <label>Min volume x<input type="number" min="0" step="0.1" value={filters.minVolume || ''} placeholder="Any" onChange={(e) => setFilters((f) => ({ ...f, minVolume: Number(e.target.value) || 0 }))} /></label>
        <label>Min RS Δ<input type="number" step="0.05" value={filters.minRsAccel === -99 ? '' : filters.minRsAccel} placeholder="Any" onChange={(e) => setFilters((f) => ({ ...f, minRsAccel: e.target.value === '' ? -99 : Number(e.target.value) }))} /></label>
        <label>Max |50D ext|<input type="number" min="0" value={filters.maxExtension === 999 ? '' : filters.maxExtension} placeholder="Any" onChange={(e) => setFilters((f) => ({ ...f, maxExtension: e.target.value === '' ? 999 : Number(e.target.value) }))} /></label>
        <label>Within 52W high %<input type="number" min="0" value={filters.maxFromHigh === 999 ? '' : filters.maxFromHigh} placeholder="Any" onChange={(e) => setFilters((f) => ({ ...f, maxFromHigh: e.target.value === '' ? 999 : Number(e.target.value) }))} /></label>
        <label>Fundamentals<select value={filters.fundamentals} onChange={(e) => setFilters((f) => ({ ...f, fundamentals: e.target.value as FundamentalFilter }))}><option value="All">All</option><option value="Support">Supports breakout</option><option value="Available">Data available</option></select></label>
        <button className="reset" onClick={() => setFilters(DEFAULT_FILTERS)}>Reset filters</button>
      </div>}
      <div className="tablewrap">
        <table>
          <thead>{table.getHeaderGroups().map((hg) => <tr key={hg.id}>{hg.headers.map((h) => <th key={h.id} onClick={h.column.getToggleSortingHandler()}>{flexRender(h.column.columnDef.header, h.getContext())}{h.column.getIsSorted() === 'asc' ? ' ↑' : h.column.getIsSorted() === 'desc' ? ' ↓' : ''}</th>)}</tr>)}</thead>
          <tbody>{table.getRowModel().rows.map((row) => <tr key={row.id} className={row.original.ticker === selected.ticker ? 'selected' : ''} onClick={() => setSelectedTicker(row.original.ticker)}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
        </table>
        {!filtered.length && <div className="empty">{page === 'Watchlist' && !watchlist.length ? 'Your watchlist is empty. Click ★ on any stock.' : 'No stocks match these filters.'}</div>}
      </div>
      <div className="tablefooter">
        <span>{filtered.length.toLocaleString()} results · page {table.getState().pagination.pageIndex + 1}/{Math.max(1, table.getPageCount())}</span>
        <span className="shortcuts">J/K review · F favorite · D/W timeframe · 1/2/3 chart</span>
        <div className="pager"><button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>←</button><button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>→</button></div>
      </div>
    </div>
    {detailPane}
  </section>

  const topCandidates = payload.universe.slice().sort((a, b) => b.score - a.score).slice(0, 8)
  const dataAge = ageLabel(payload.generatedAt)
  const scanActive = scanState.status === 'in_progress' || scanState.status === 'queued'

  return <div className="app">
    <header className="topbar">
      <button className="brand" onClick={() => setPage('Dashboard')}><span className="logo">◉</span><span>STOCKSCOUT</span></button>
      <nav>{pages.map((p) => <button key={p} className={page === p ? 'active' : ''} onClick={() => { setPage(p); if (p === 'Screener') setSetupMode('All') }}>{p}</button>)}</nav>
      <div className="topstatus">
        {scanActive && <a className="scanbadge" href={ACTIONS_URL} target="_blank" rel="noreferrer"><i /> SCAN {scanState.status === 'queued' ? 'QUEUED' : 'RUNNING'}</a>}
        <span className="regime">{m.regime || 'UNKNOWN'}</span>
        <span className={isDemo ? 'statusdemo' : ''}>{isDemo ? 'Demo preview' : `${m.scanDate || payload.generatedAt.slice(0, 10)} · ${dataAge}`}</span>
        <button className="refresh" onClick={loadLatest} title="Refresh dataset">↻</button>
        <span className={`dot ${dataError ? 'bad' : ''}`}>●</span>
      </div>
    </header>

    <main>
      {(page === 'Dashboard' || page === 'Market' || page === 'Reports') && renderMetrics()}
      {(page === 'Dashboard' || page === 'Screener' || page === 'Watchlist') && screener}
      {page === 'Charts' && <section className="chartsview">
        <div className="chartpicker">
          <div className="panelhead"><b>CHART REVIEW</b><span>{chartInterval} · {chartRange}</span></div>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find ticker…" />
          {payload.universe.filter((s) => !query || s.ticker.includes(query.toUpperCase())).slice(0, 150).map((s) => <button className={s.ticker === selected.ticker ? 'active' : ''} key={s.ticker} onClick={() => setSelectedTicker(s.ticker)}><b>{s.ticker}</b><span>{s.setup}</span><em>RS {s.rsRank ?? '—'}</em><strong>{s.score}</strong></button>)}
        </div>
        {detailPane}
      </section>}
      {page === 'Market' && <MarketView market={m} universe={payload.universe} />}
      {page === 'Reports' && <ReportsView payload={payload} isDemo={isDemo} dataError={dataError} scanState={scanState} onExport={exportCsv} />}
      {page === 'Dashboard' && <section className="bottomgrid">
        <div className="panel candidates">
          <div className="panelhead"><b>TOP SETUPS</b><span>Decision-first ranking</span></div>
          <div className="candidatecards">{topCandidates.map((s) => <button key={s.ticker} className={s.ticker === selected.ticker ? 'active' : ''} onClick={() => setSelectedTicker(s.ticker)}>
            <div className="candidatehead"><b>{s.ticker}</b><span className={`setup ${setupClass(s.setup)}`}>{s.setup}</span><strong>{s.score}</strong></div>
            <div className="candidatebar"><i style={{ width: `${s.score}%` }} /></div>
            <div className="candidatefacts"><span>RS <b>{s.rsRank ?? '—'}</b></span><span>Vol <b>{fmt(s.volumeRatio, 1)}x</b></span><span>50D <b>{signed(s.distance50)}</b></span><span>52W <b>{signed(s.from52wHigh)}</b></span></div>
          </button>)}</div>
        </div>
        <div className="panel watch">
          <div className="panelhead"><b>MY WATCHLIST</b><button onClick={() => setPage('Watchlist')}>Manage</button></div>
          {watchStocks.length ? watchStocks.slice(0, 10).map((s) => <div className="watchrow" key={s.ticker} onClick={() => setSelectedTicker(s.ticker)}><b>{s.ticker}</b><span>${fmt(s.price, 2)}</span><span className={s.change20d >= 0 ? 'positive' : 'negative'}>{signed(s.change20d)}</span><span>RS {s.rsRank ?? '—'}</span><span>{s.setup}</span></div>) : <div className="watch-empty">Click ★ on any stock to build your watchlist.</div>}
        </div>
      </section>}
    </main>
    {isDemo && <div className="demobadge">DEMO PREVIEW · waiting for first published scan dataset</div>}
  </div>
}

function DetailPane({ selected, bars, loading, chartError, watchlisted, onWatch, chartMode, setChartMode, chartRange, setChartRange, chartInterval, setChartInterval, onPrev, onNext }: {
  selected: Stock
  bars: Bar[]
  loading: boolean
  chartError: string
  watchlisted: boolean
  onWatch: () => void
  chartMode: ChartMode
  setChartMode: (v: ChartMode) => void
  chartRange: ChartRange
  setChartRange: (v: ChartRange) => void
  chartInterval: ChartInterval
  setChartInterval: (v: ChartInterval) => void
  onPrev: () => void
  onNext: () => void
}) {
  const modes: ChartMode[] = ['Price', 'RS vs SPY', 'Volume']
  const ranges: ChartRange[] = ['3M', '6M', '1Y', '2Y', '5Y']
  const fundState = selected.fundamentalSupport == null ? 'No fundamental snapshot' : selected.fundamentalSupport ? 'Supports breakout' : 'Does not confirm breakout'
  return <aside className="rightpane">
    <div className="tickerhead">
      <button className={`star large ${watchlisted ? 'on' : ''}`} onClick={onWatch}>★</button>
      <div className="tickeridentity"><div><h1>{selected.ticker}</h1><span className={`setup ${setupClass(selected.setup)}`}>{selected.setup}</span></div><small>Stage {selected.stage} · {selected.stageName}</small></div>
      <div className="tickeractions"><button onClick={onPrev} title="Previous candidate (K)">←</button><button onClick={onNext} title="Next candidate (J)">→</button><button onClick={() => navigator.clipboard?.writeText(location.href)}>Link</button><button onClick={() => window.open(`https://www.tradingview.com/chart/?symbol=${selected.ticker}`, '_blank')}>TV ↗</button></div>
      <div className="tickerprice"><strong>${fmt(selected.price, 2)}</strong><span className={selected.change20d >= 0 ? 'positive' : 'negative'}>{signed(selected.change20d)} 20D</span></div>
    </div>

    <div className="charttabs">
      <div>{modes.map((m) => <button key={m} className={chartMode === m ? 'active' : ''} onClick={() => setChartMode(m)}>{m}</button>)}</div>
      <div className="intervals"><button className={chartInterval === 'D' ? 'active' : ''} onClick={() => setChartInterval('D')}>Daily</button><button className={chartInterval === 'W' ? 'active' : ''} onClick={() => setChartInterval('W')}>Weekly</button></div>
      <div className="ranges">{ranges.map((r) => <button key={r} className={chartRange === r ? 'active' : ''} onClick={() => setChartRange(r)}>{r}</button>)}</div>
    </div>
    <div className="chartlegend">{chartMode === 'Price' && (chartInterval === 'D' ? <><span className="ma10">10D</span><span className="ma20">20D</span><span className="ma50">50D</span><span className="ma200">200D</span></> : <><span className="ma10">10W</span><span className="ma20">30W</span></>)}</div>
    <div className="chartbox">
      {loading && <div className="chartloading"><i /> Loading 5-year history…</div>}
      {!loading && !bars.length && <div className="chartloading error">Chart unavailable{chartError ? ` · ${chartError}` : ''}</div>}
      {bars.length > 0 && <TradingChart bars={bars} stock={selected} mode={chartMode} range={chartRange} interval={chartInterval} />}
    </div>

    <div className="chartstats">
      <span><small>RS RANK</small><b className={(selected.rsRank ?? 0) >= 90 ? 'positive' : ''}>{selected.rsRank ?? '—'}</b></span>
      <span><small>RS Δ</small><b className={selected.rsAcceleration > 0 ? 'positive' : 'negative'}>{fmt(selected.rsAcceleration, 2)}</b></span>
      <span><small>VOL RATIO</small><b>{fmt(selected.volumeRatio, 1)}x</b></span>
      <span><small>50D EXT</small><b>{signed(selected.distance50)}</b></span>
      <span><small>52W HIGH</small><b>{signed(selected.from52wHigh)}</b></span>
      <span><small>AVG $ VOL</small><b>{compactNumber(selected.avgDollarVolume20)}</b></span>
    </div>

    <div className="analysisgrid">
      <div className="scorecard"><small>PERFECT SETUP SCORE</small><strong>{selected.score}</strong><span>/100</span><b>{selected.score >= 85 ? 'PRIME' : selected.score >= 72 ? 'EARLY' : 'WATCH'}</b></div>
      <div className="components">{Object.entries(selected.components).map(([k, v]) => <div key={k}><span>{labelComponent(k)}</span><div className="bar"><i style={{ width: `${Math.min(100, v / (k === 'rsAcceleration' || k === 'volumeAwakening' ? 15 : k === 'notExtended' ? 10 : 20) * 100)}%` }} /></div><b>{fmt(v, 0)}</b></div>)}</div>
      <div className="notes"><h3>Setup evidence</h3>{selected.reasons.slice(0, 5).map((r, i) => <p key={i}>✓ {r}</p>)}<p className={selected.rsAcceleration > 0 ? 'positive' : 'negative'}>RS acceleration {selected.rsAcceleration > 0 ? 'positive' : 'not positive'} ({fmt(selected.rsAcceleration, 2)})</p><p>50DMA extension {signed(selected.distance50)}</p></div>
    </div>

    <div className="fundamentals">
      <div className="fundhead"><b>FUNDAMENTAL CHECK</b><span className={selected.fundamentalSupport == null ? 'muted' : selected.fundamentalSupport ? 'positive' : 'negative'}>{fundState}</span></div>
      <div className="fundgrid">
        <span><small>Revenue YoY</small><b className={(selected.revenueYoY ?? 0) > 0 ? 'positive' : selected.revenueYoY == null ? '' : 'negative'}>{signed(selected.revenueYoY)}</b></span>
        <span><small>EPS YoY</small><b className={(selected.epsYoY ?? 0) > 0 ? 'positive' : selected.epsYoY == null ? '' : 'negative'}>{signed(selected.epsYoY)}</b></span>
        <span><small>Gross margin</small><b>{selected.grossMargin == null ? '—' : `${fmt(selected.grossMargin, 1)}%`}</b></span>
        <span><small>Margin Δ</small><b>{selected.marginChange == null ? '—' : `${selected.marginChange > 0 ? '+' : ''}${fmt(selected.marginChange, 1)}pp`}</b></span>
      </div>
    </div>
  </aside>
}

function MarketView({ market, universe }: { market: Market; universe: Stock[] }) {
  const total = Math.max(1, universe.length)
  const counts = market.stageCounts || Object.fromEntries([1, 2, 3, 4].map((i) => [String(i), universe.filter((s) => s.stage === i).length]))
  const elite = universe.filter((s) => (s.rsRank ?? 0) >= 90).sort((a, b) => (b.rsRank ?? 0) - (a.rsRank ?? 0)).slice(0, 12)
  return <section className="marketview">
    <div className="panel marketcard"><div className="panelhead"><b>STAGE DISTRIBUTION</b><span>{total.toLocaleString()} analyzed</span></div>{[1, 2, 3, 4].map((i) => { const c = Number(counts[String(i)] || 0); const pct = c / total * 100; return <div className="stagebar" key={i}><span>Stage {i}</span><div><i style={{ width: `${clamp(pct, 0, 100)}%` }} /></div><b>{c.toLocaleString()} · {fmt(pct, 1)}%</b></div> })}</div>
    <div className="panel marketcard"><div className="panelhead"><b>REGIME SNAPSHOT</b><span>{market.scanDate || 'Latest'}</span></div><div className="bigregime">{market.regime || 'Unknown'}</div><p>Stage 2 breadth <b>{market.stage2Pct ?? 0}%</b></p><p>Perfect setups <b>{market.perfectSetups ?? 0}</b></p><p>Early leaders <b>{market.earlyLeaders ?? 0}</b></p><p>RS Rank 90+ <b>{market.rs90Plus ?? elite.length}</b></p></div>
    <div className="panel marketcard leaders"><div className="panelhead"><b>TOP RS LEADERS</b><span>Percentile rank</span></div>{elite.map((s) => <div className="leaderrow" key={s.ticker}><b>{s.ticker}</b><span>{s.setup}</span><strong>{s.rsRank}</strong><em>{s.score}</em></div>)}</div>
  </section>
}

function ReportsView({ payload, isDemo, dataError, scanState, onExport }: { payload: Payload; isDemo: boolean; dataError: string; scanState: ScanState; onExport: () => void }) {
  const m = payload.market
  return <section className="reportsview">
    <div className="panel reportcard"><div className="panelhead"><b>DATA STATUS</b><span>{isDemo ? 'DEMO' : 'LIVE'}</span></div><h2>{isDemo ? 'Demo dataset' : 'Nightly scan loaded'}</h2><p>Generated <b>{new Date(payload.generatedAt).toLocaleString()}</b></p><p>Age <b>{ageLabel(payload.generatedAt)}</b></p><p>Analyzed <b>{(m.analyzed ?? payload.universe.length).toLocaleString()}</b></p><p>5Y charts <b>{(m.fiveYearCharts ?? 0).toLocaleString()}</b></p>{dataError && <p className="negative">{dataError}</p>}</div>
    <div className="panel reportcard"><div className="panelhead"><b>SIGNALS</b><span>Latest</span></div><div className="reportnumbers"><span><small>BUY</small><b className="positive">{m.buyCount ?? 0}</b></span><span><small>SELL</small><b className="negative">{m.sellCount ?? 0}</b></span><span><small>PERFECT</small><b>{m.perfectSetups ?? 0}</b></span><span><small>RS 90+</small><b>{m.rs90Plus ?? 0}</b></span></div></div>
    <div className="panel reportcard"><div className="panelhead"><b>WORKFLOW</b><span>{scanState.status}</span></div><p>Latest scan status <b>{scanState.status}</b></p><p>Conclusion <b>{scanState.conclusion || '—'}</b></p><a className="primaryaction" href={ACTIONS_URL} target="_blank" rel="noreferrer">Open GitHub Actions ↗</a><a className="secondaryaction" href={REPORT_URL} target="_blank" rel="noreferrer">Open full text report ↗</a></div>
    <div className="panel reportcard"><div className="panelhead"><b>EXPORTS</b><span>Local download</span></div><button className="primaryaction" onClick={onExport}>Download current screener CSV</button><a className="secondaryaction" href="./data/latest.json" download>Download raw latest.json</a></div>
  </section>
}

function Metric({ title, value, sub, tone }: { title: string; value: string; sub: string; tone: string }) {
  return <div className={`metric ${tone}`}><small>{title}</small><strong>{value}</strong><span>{sub}</span><div className="metricline" /></div>
}

function labelComponent(k: string) {
  return ({ neglectedHistory: 'Neglected history', baseMaturity: 'Base maturity', rsTurn: 'RS turn', rsAcceleration: 'RS acceleration', volumeAwakening: 'Volume awakening', notExtended: 'Not extended' } as Record<string, string>)[k] || k
}

export default App
