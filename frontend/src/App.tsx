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
  stage: number
  stageName: string
  setup: string
  score: number
  rsSlope: number
  rsAcceleration: number
  volumeRatio: number
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
}

type Payload = {
  version: number
  generatedAt: string
  market: Market
  universe: Stock[]
  chartShards?: Record<string, string>
}

type Page = 'Dashboard' | 'Screener' | 'Watchlist' | 'Charts' | 'Market' | 'Reports'
type ChartMode = 'Price' | 'RS vs SPY' | 'Volume'
type ChartRange = '3M' | '6M' | '1Y' | '2Y' | '5Y'

type FilterState = {
  stage: string
  minScore: number
  minVolume: number
  minRsAccel: number
  maxExtension: number
}

const DEFAULT_FILTERS: FilterState = { stage: 'All', minScore: 0, minVolume: 0, minRsAccel: -99, maxExtension: 999 }

const demoStocks: Stock[] = [
  ['IREN',17.24,6.32,18,2,'Uptrend/Breakout','Perfect',94,.41,.28,2.8,82,68,3.4,44,-6.2,16.67,13.21,9.72,true,true,true],
  ['PLTR',182.4,4.18,33,2,'Uptrend/Breakout','Perfect',91,.37,.25,2.1,78,61,2.7,58,-4.8,177.6,151.1,112.9,true,true,true],
  ['GEV',612.1,3.91,28,2,'Uptrend/Breakout','Perfect',90,.34,.22,2.3,75,56,4.2,63,-5.5,588,531,412,true,true,true],
  ['HUBS',640.12,2.45,9,2,'Uptrend/Breakout','Wake-up',87,.29,.19,1.9,71,52,5.2,39,-8.1,608,590,552,false,true,true],
  ['APP',273.35,5.22,21,2,'Uptrend/Breakout','Wake-up',86,.31,.16,2.0,69,48,6.8,52,-7.4,256,231,205,false,true,true],
  ['ABNB',145.8,3.72,-4,1,'Base Building','Waking Up',83,.21,.18,2.2,65,62,2.4,18,-11.2,142,139,134,false,false,true],
  ['CRWD',322.5,1.93,12,2,'Uptrend/Breakout','Early Stage 2',82,.19,.11,1.8,63,47,4.3,31,-9.4,309,296,281,false,true,false],
  ['SMCI',88.12,4.66,-8,1,'Base Building','Perfect',81,.26,.24,2.6,73,71,3.9,-4,-14.3,84.8,82.1,77.4,true,false,true],
  ['DDOG',117.86,2.11,7,2,'Uptrend/Breakout','Wake-up',80,.17,.12,1.7,62,44,6,20,-10.1,111,105,98,false,true,true],
  ['OKLO',124.4,6.85,14,2,'Uptrend/Breakout','Perfect',79,.22,.17,2.4,70,59,2.8,35,-6.8,121,112,96,true,true,true],
].map((r) => ({
  ticker:r[0] as string, price:r[1] as number, change20d:r[2] as number, return6m:r[3] as number,
  stage:r[4] as number, stageName:r[5] as string, setup:r[6] as string, score:r[7] as number,
  rsSlope:r[8] as number, rsAcceleration:r[9] as number, volumeRatio:r[10] as number,
  vcpScore:r[11] as number, contraction:r[12] as number, distance50:r[13] as number,
  distance200:r[14] as number, from52wHigh:r[15] as number, sma50:r[16] as number,
  sma150:r[17] as number, sma200:r[18] as number, perfect:r[19] as boolean,
  earlyStage2:r[20] as boolean, wakingUp:r[21] as boolean,
  components:{neglectedHistory:18,baseMaturity:17,rsTurn:19,rsAcceleration:14,volumeAwakening:13,notExtended:9},
  reasons:['RS accelerating versus SPY','Volume expanding above 20D average','Price remains close to 50DMA','Base/volatility contraction improving'],
}))

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
    out.push({time:d.toISOString().slice(0,10),open:last,high:hi,low:lo,close:next,volume:800000 + ((i * 7919) % 1200000),rs:70 + Math.sin(i/31)*9 + i/200})
    last = next
  }
  const scale = price / out[out.length - 1].close
  out.forEach((b) => { b.open*=scale; b.high*=scale; b.low*=scale; b.close*=scale })
  return addMovingAverages(out)
}

const demoPayload: Payload = {
  version: 2,
  generatedAt: new Date().toISOString(),
  market: {regime:'RISK ON',totalUniverse:3842,analyzed:3714,stage2Pct:72,earlyLeaders:37,perfectSetups:12,wakingUp:21,fiveYearCharts:3714,scanDate:'DEMO'},
  universe: demoStocks,
}

function fmt(n:number, digits=1){ return Number.isFinite(n) ? n.toFixed(digits) : '—' }
function signed(n:number, digits=1){ return `${n>0?'+':''}${fmt(n,digits)}%` }
function clamp(n:number, lo:number, hi:number){ return Math.max(lo,Math.min(hi,n)) }

function safeWatchlist(): string[] {
  try { return JSON.parse(localStorage.getItem('stockscout-watchlist') || '[]') } catch { return [] }
}

function addMovingAverages(input: Bar[]): Bar[] {
  const bars = input.map(b => ({...b}))
  const closes = bars.map(b => b.close)
  const avg = (idx:number,n:number) => idx + 1 >= n ? closes.slice(idx + 1 - n, idx + 1).reduce((a,b)=>a+b,0) / n : null
  bars.forEach((b,i)=>{ b.ma10=avg(i,10); b.ma20=avg(i,20); b.ma50=avg(i,50); b.ma200=avg(i,200) })
  return bars
}

function rangeCount(range: ChartRange){ return ({'3M':66,'6M':132,'1Y':252,'2Y':504,'5Y':1300} as Record<ChartRange,number>)[range] }

function decodeBars(rows: RawBar[]): Bar[] {
  return addMovingAverages(rows.map(r=>({time:r[0],open:r[1],high:r[2],low:r[3],close:r[4],volume:r[5],rs:r[6]})))
}

function PriceChart({ bars, stock, mode, range }:{bars:Bar[];stock:Stock;mode:ChartMode;range:ChartRange}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current || !bars.length) return
    const visible = bars.slice(-rangeCount(range))
    const chart = createChart(ref.current, {
      autoSize: true,
      layout:{background:{type:ColorType.Solid,color:'#09131f'},textColor:'#7f91a8',attributionLogo:true},
      grid:{vertLines:{color:'#162438'},horzLines:{color:'#162438'}},
      rightPriceScale:{borderColor:'#243248'},
      timeScale:{borderColor:'#243248',timeVisible:false},
      crosshair:{vertLine:{color:'#42536c'},horzLine:{color:'#42536c'}},
    })

    if (mode === 'Price') {
      const candles = chart.addSeries(CandlestickSeries, {upColor:'#18d47d',downColor:'#f05d6c',wickUpColor:'#18d47d',wickDownColor:'#f05d6c',borderVisible:false})
      candles.setData(visible.map(b=>({time:b.time,open:b.open,high:b.high,low:b.low,close:b.close})) as any)
      const configs:[keyof Bar,string][] = [['ma10','#f0c34f'],['ma20','#3d8bfd'],['ma50','#8f5bd7'],['ma200','#24b6ad']]
      configs.forEach(([key,color])=>{
        const line=chart.addSeries(LineSeries,{color,lineWidth:2,priceLineVisible:false,lastValueVisible:false})
        line.setData(visible.filter(b=>typeof b[key]==='number').map(b=>({time:b.time,value:b[key] as number})) as any)
      })
      const volume = chart.addSeries(HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'',lastValueVisible:false,priceLineVisible:false})
      volume.priceScale().applyOptions({scaleMargins:{top:.82,bottom:0}})
      volume.setData(visible.map(b=>({time:b.time,value:b.volume,color:b.close>=b.open?'rgba(24,212,125,.32)':'rgba(240,93,108,.32)'})) as any)
    } else if (mode === 'RS vs SPY') {
      const rsLine = chart.addSeries(LineSeries,{color:'#54a6ff',lineWidth:3,priceLineVisible:false,lastValueVisible:true})
      const normalized = visible.map((b,i)=>({time:b.time,value:b.rs && b.rs>0 ? b.rs : (b.close / visible[0].close) * 100 + i * 0}))
      rsLine.setData(normalized as any)
    } else {
      const volume = chart.addSeries(HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'',lastValueVisible:true,priceLineVisible:false})
      volume.setData(visible.map(b=>({time:b.time,value:b.volume,color:b.close>=b.open?'rgba(24,212,125,.65)':'rgba(240,93,108,.65)'})) as any)
    }

    chart.timeScale().fitContent()
    const ro = new ResizeObserver(()=>chart.applyOptions({width:ref.current?.clientWidth ?? 600,height:ref.current?.clientHeight ?? 390}))
    ro.observe(ref.current)
    return ()=>{ro.disconnect();chart.remove()}
  },[bars,stock.ticker,mode,range])
  return <div className="chart" ref={ref}/>
}

const columnHelper = createColumnHelper<Stock>()

function App(){
  const [payload,setPayload]=useState<Payload>(demoPayload)
  const [isDemo,setIsDemo]=useState(true)
  const [dataError,setDataError]=useState('')
  const initialTicker = location.hash.replace('#','').toUpperCase()
  const [selectedTicker,setSelectedTicker]=useState(initialTicker || 'IREN')
  const [setupMode,setSetupMode]=useState('Perfect')
  const [page,setPage]=useState<Page>('Dashboard')
  const [query,setQuery]=useState('')
  const [sorting,setSorting]=useState<SortingState>([{id:'score',desc:true}])
  const [pagination,setPagination]=useState<PaginationState>({pageIndex:0,pageSize:100})
  const [watchlist,setWatchlist]=useState<string[]>(safeWatchlist)
  const [filters,setFilters]=useState<FilterState>(DEFAULT_FILTERS)
  const [filtersOpen,setFiltersOpen]=useState(false)
  const [chartMode,setChartMode]=useState<ChartMode>('Price')
  const [chartRange,setChartRange]=useState<ChartRange>('5Y')
  const [bars,setBars]=useState<Bar[]>(demoBars(demoStocks[0].price))
  const [chartLoading,setChartLoading]=useState(false)
  const shardCache=useRef<Record<string,Record<string,RawBar[]>>>({})

  const loadLatest=()=>{
    setDataError('')
    fetch('./data/latest.json',{cache:'no-store'})
      .then(r=>{if(!r.ok) throw new Error(`dataset HTTP ${r.status}`); return r.json()})
      .then((data:Payload)=>{
        setPayload(data);setIsDemo(false)
        const hashTicker=location.hash.replace('#','').toUpperCase()
        const first=data.universe.find(s=>s.ticker===hashTicker)?.ticker||data.universe[0]?.ticker
        if(first)setSelectedTicker(first)
      })
      .catch((e)=>{setIsDemo(true);setDataError(String(e?.message||e))})
  }

  useEffect(loadLatest,[])
  useEffect(()=>localStorage.setItem('stockscout-watchlist',JSON.stringify(watchlist)),[watchlist])
  useEffect(()=>{ if(selectedTicker) history.replaceState(null,'',`${location.pathname}${location.search}#${selectedTicker}`) },[selectedTicker])

  useEffect(()=>{
    const selected=payload.universe.find(s=>s.ticker===selectedTicker)
    if(!selected)return
    if(isDemo){setBars(demoBars(selected.price));return}
    const shard=payload.chartShards?.[selectedTicker]
    if(!shard){setBars([]);return}
    const cached=shardCache.current[shard]
    if(cached?.[selectedTicker]){setBars(decodeBars(cached[selectedTicker]));return}
    setChartLoading(true)
    fetch(`./data/charts/${shard}`,{cache:'force-cache'})
      .then(r=>{if(!r.ok)throw new Error(`chart HTTP ${r.status}`);return r.json()})
      .then((data:Record<string,RawBar[]>)=>{shardCache.current[shard]=data;setBars(data[selectedTicker]?decodeBars(data[selectedTicker]):[])})
      .catch(()=>setBars([]))
      .finally(()=>setChartLoading(false))
  },[selectedTicker,payload,isDemo])

  const activeUniverse=useMemo(()=>page==='Watchlist'?payload.universe.filter(s=>watchlist.includes(s.ticker)):payload.universe,[payload,page,watchlist])

  const filtered = useMemo(()=>activeUniverse.filter(s=>{
    const q=query.trim().toLowerCase()
    if(q && !s.ticker.toLowerCase().includes(q) && !s.setup.toLowerCase().includes(q) && !s.stageName.toLowerCase().includes(q))return false
    if(setupMode==='Perfect'&&!s.perfect)return false
    if(setupMode==='Early Stage 2'&&!s.earlyStage2)return false
    if(setupMode==='Waking Up'&&!s.wakingUp)return false
    if(setupMode==='RS Leaders'&&s.rsSlope<=0)return false
    if(setupMode==='Volume Breakouts'&&s.volumeRatio<1.5)return false
    if(setupMode==='VCP / Compression'&&s.vcpScore<50&&s.contraction<50)return false
    if(filters.stage!=='All'&&s.stage!==Number(filters.stage))return false
    if(s.score<filters.minScore)return false
    if(s.volumeRatio<filters.minVolume)return false
    if(s.rsAcceleration<filters.minRsAccel)return false
    if(Math.abs(s.distance50)>filters.maxExtension)return false
    return true
  }),[activeUniverse,setupMode,query,filters])

  useEffect(()=>setPagination(p=>({...p,pageIndex:0})),[setupMode,query,filters,page])

  const toggleWatch=(ticker:string)=>setWatchlist(w=>w.includes(ticker)?w.filter(x=>x!==ticker):[...w,ticker])

  const columns=useMemo(()=>[
    columnHelper.display({id:'watch',header:'',cell:({row})=><button aria-label="Toggle watchlist" className={`star ${watchlist.includes(row.original.ticker)?'on':''}`} onClick={(e)=>{e.stopPropagation();toggleWatch(row.original.ticker)}}>★</button>}),
    columnHelper.accessor('ticker',{header:'Ticker',cell:i=><strong>{i.getValue()}</strong>}),
    columnHelper.accessor('price',{header:'Price',cell:i=>`$${fmt(i.getValue(),2)}`}),
    columnHelper.accessor('change20d',{header:'20D',cell:i=><span className={i.getValue()>=0?'positive':'negative'}>{signed(i.getValue())}</span>}),
    columnHelper.accessor('return6m',{header:'6M',cell:i=><span className={i.getValue()>=0?'positive':'negative'}>{signed(i.getValue())}</span>}),
    columnHelper.accessor('stage',{header:'Stage',cell:i=><span className="stage">{i.getValue()===2?'2 Early':i.getValue()}</span>}),
    columnHelper.accessor('setup',{header:'Setup',cell:i=><span className={`setup ${i.getValue().toLowerCase().replaceAll(' ','-')}`}>{i.getValue()}</span>}),
    columnHelper.accessor('score',{header:'Score',cell:i=><span className="score">{i.getValue()}</span>}),
    columnHelper.accessor('rsSlope',{header:'RS slope',cell:i=><span className={i.getValue()>=0?'positive':'negative'}>{i.getValue()>0?'↑':'↓'} {fmt(i.getValue(),2)}</span>}),
    columnHelper.accessor('rsAcceleration',{header:'RS Δ',cell:i=><span className={i.getValue()>0?'positive':'negative'}>{i.getValue()>0?'↑↑':'↓'} {fmt(i.getValue(),2)}</span>}),
    columnHelper.accessor('volumeRatio',{header:'Volume',cell:i=>`${fmt(i.getValue(),1)}x`}),
    columnHelper.accessor('vcpScore',{header:'VCP',cell:i=>fmt(i.getValue(),0)}),
    columnHelper.accessor('distance50',{header:'50DMA ext.',cell:i=><span className={Math.abs(i.getValue())<10?'positive':''}>{signed(i.getValue())}</span>}),
  ],[watchlist])

  const table=useReactTable({
    data:filtered,columns,
    state:{sorting,pagination},onSortingChange:setSorting,onPaginationChange:setPagination,
    getCoreRowModel:getCoreRowModel(),getSortedRowModel:getSortedRowModel(),getPaginationRowModel:getPaginationRowModel(),
  })

  const selected=payload.universe.find(s=>s.ticker===selectedTicker)||payload.universe[0]||demoStocks[0]
  const m=payload.market
  const watchStocks=watchlist.map(t=>payload.universe.find(s=>s.ticker===t)).filter(Boolean) as Stock[]
  const modes=['Perfect','Early Stage 2','Waking Up','RS Leaders','Volume Breakouts','VCP / Compression','All']
  const pages:Page[]=['Dashboard','Screener','Watchlist','Charts','Market','Reports']
  const activeFilterCount=[filters.stage!=='All',filters.minScore>0,filters.minVolume>0,filters.minRsAccel>-99,filters.maxExtension<999].filter(Boolean).length

  const exportCsv=()=>{
    const headers=['ticker','price','change20d','return6m','stage','setup','score','rsSlope','rsAcceleration','volumeRatio','vcpScore','distance50']
    const rows=filtered.map(s=>headers.map(k=>JSON.stringify((s as any)[k]??'')).join(','))
    const blob=new Blob([[headers.join(','),...rows].join('\n')],{type:'text/csv'})
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`stockscout-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url)
  }

  const renderMetrics=()=> <section className="metrics">
    <Metric title="Market regime" value={m.regime||'Unknown'} sub="Scan-confirmed environment" tone="green" />
    <Metric title="Stage 2 breadth" value={`${m.stage2Pct??0}%`} sub="Analyzed universe" tone="green" />
    <Metric title="Early leaders" value={String(m.earlyLeaders??0)} sub="Early Stage 2" tone="blue" />
    <Metric title="Perfect setups" value={String(m.perfectSetups??0)} sub="Neglected → waking" tone="purple" />
    <Metric title="Waking up" value={String(m.wakingUp??0)} sub="RS + volume acceleration" tone="yellow" />
    <Metric title="5Y charts" value={(m.fiveYearCharts??(isDemo?m.analyzed:0)??0).toLocaleString()} sub={`${m.analyzed??payload.universe.length} analyzed`} tone="white" />
  </section>

  const detailPane=<DetailPane selected={selected} bars={bars} loading={chartLoading} watchlisted={watchlist.includes(selected.ticker)} onWatch={()=>toggleWatch(selected.ticker)} chartMode={chartMode} setChartMode={setChartMode} chartRange={chartRange} setChartRange={setChartRange}/>

  const screener=<section className={`workspace ${page==='Screener'||page==='Watchlist'?'focus':''}`}>
    <div className="leftpane">
      <div className="tabs">{modes.map(x=><button key={x} className={setupMode===x?'active':''} onClick={()=>setSetupMode(x)}>{x==='Perfect'?'★ ':''}{x}</button>)}</div>
      <div className="filters">
        <button className={`filtertoggle ${filtersOpen?'active':''}`} onClick={()=>setFiltersOpen(v=>!v)}>⚙ Filters {activeFilterCount>0&&<b>{activeFilterCount}</b>}</button>
        <input className="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search ticker or setup…"/>
        <button className="ghost" onClick={exportCsv}>Export CSV</button>
      </div>
      {filtersOpen&&<div className="filterdrawer">
        <label>Stage<select value={filters.stage} onChange={e=>setFilters(f=>({...f,stage:e.target.value}))}><option>All</option><option>1</option><option>2</option><option>3</option><option>4</option></select></label>
        <label>Min score<input type="number" min="0" max="100" value={filters.minScore} onChange={e=>setFilters(f=>({...f,minScore:Number(e.target.value)}))}/></label>
        <label>Min volume<input type="number" min="0" step="0.1" value={filters.minVolume} onChange={e=>setFilters(f=>({...f,minVolume:Number(e.target.value)}))}/></label>
        <label>Min RS Δ<input type="number" step="0.05" value={filters.minRsAccel===-99?'':filters.minRsAccel} placeholder="Any" onChange={e=>setFilters(f=>({...f,minRsAccel:e.target.value===''?-99:Number(e.target.value)}))}/></label>
        <label>Max |50D ext|<input type="number" min="0" value={filters.maxExtension===999?'':filters.maxExtension} placeholder="Any" onChange={e=>setFilters(f=>({...f,maxExtension:e.target.value===''?999:Number(e.target.value)}))}/></label>
        <button className="reset" onClick={()=>setFilters(DEFAULT_FILTERS)}>Reset filters</button>
      </div>}
      <div className="tablewrap">
        <table>
          <thead>{table.getHeaderGroups().map(hg=><tr key={hg.id}>{hg.headers.map(h=><th key={h.id} onClick={h.column.getToggleSortingHandler()}>{flexRender(h.column.columnDef.header,h.getContext())}{h.column.getIsSorted()==='asc'?' ↑':h.column.getIsSorted()==='desc'?' ↓':''}</th>)}</tr>)}</thead>
          <tbody>{table.getRowModel().rows.map(row=><tr key={row.id} className={row.original.ticker===selected.ticker?'selected':''} onClick={()=>setSelectedTicker(row.original.ticker)}>{row.getVisibleCells().map(cell=><td key={cell.id}>{flexRender(cell.column.columnDef.cell,cell.getContext())}</td>)}</tr>)}</tbody>
        </table>
        {!filtered.length&&<div className="empty">{page==='Watchlist'&&!watchlist.length?'Your watchlist is empty. Click ★ on any stock.':'No stocks match these filters.'}</div>}
      </div>
      <div className="tablefooter"><span>{filtered.length.toLocaleString()} results • page {table.getState().pagination.pageIndex+1}/{Math.max(1,table.getPageCount())}</span><div className="pager"><button onClick={()=>table.previousPage()} disabled={!table.getCanPreviousPage()}>←</button><button onClick={()=>table.nextPage()} disabled={!table.getCanNextPage()}>→</button></div></div>
    </div>
    {detailPane}
  </section>

  return <div className="app">
    <header className="topbar">
      <button className="brand" onClick={()=>setPage('Dashboard')}><span className="logo">◉</span><span>STOCKSCOUT</span></button>
      <nav>{pages.map(p=><button key={p} className={page===p?'active':''} onClick={()=>{setPage(p);if(p==='Screener')setSetupMode('All')}}>{p}</button>)}</nav>
      <div className="topstatus"><span className="regime">MARKET: {m.regime||'UNKNOWN'}</span><span>{isDemo?'Demo preview':`Last scan: ${m.scanDate||payload.generatedAt.slice(0,10)}`}</span><button className="refresh" onClick={loadLatest} title="Refresh dataset">↻</button><span className={`dot ${dataError?'bad':''}`}>●</span></div>
    </header>

    <main>
      {(page==='Dashboard'||page==='Market'||page==='Reports')&&renderMetrics()}
      {(page==='Dashboard'||page==='Screener'||page==='Watchlist')&&screener}
      {page==='Charts'&&<section className="chartsview"><div className="chartpicker"><div className="panelhead"><b>CHART BROWSER</b><span>{chartRange} history</span></div><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find ticker…"/>{payload.universe.filter(s=>!query||s.ticker.includes(query.toUpperCase())).slice(0,100).map(s=><button className={s.ticker===selected.ticker?'active':''} key={s.ticker} onClick={()=>setSelectedTicker(s.ticker)}><b>{s.ticker}</b><span>{s.setup}</span><strong>{s.score}</strong></button>)}</div>{detailPane}</section>}
      {page==='Market'&&<MarketView market={m} universe={payload.universe}/>} 
      {page==='Reports'&&<ReportsView payload={payload} isDemo={isDemo} dataError={dataError} onExport={exportCsv}/>} 
      {page==='Dashboard'&&<section className="bottomgrid">
        <div className="panel"><div className="panelhead"><b>TOP SETUPS</b><span>Nightly ranking</span></div><div className="minicards">{payload.universe.slice().sort((a,b)=>b.score-a.score).slice(0,6).map(s=><button key={s.ticker} onClick={()=>setSelectedTicker(s.ticker)}><span><b>{s.ticker}</b><strong>{s.score}</strong></span><div className="spark">{Array.from({length:24},(_,i)=><i key={i} style={{height:`${18+((i*17+s.score)%46)}%`}}/>)}</div><small>{s.setup}</small></button>)}</div></div>
        <div className="panel watch"><div className="panelhead"><b>MY WATCHLIST</b><button onClick={()=>setPage('Watchlist')}>Manage</button></div>{watchStocks.length?watchStocks.slice(0,8).map(s=><div className="watchrow" key={s.ticker} onClick={()=>setSelectedTicker(s.ticker)}><b>{s.ticker}</b><span>${fmt(s.price,2)}</span><span className={s.change20d>=0?'positive':'negative'}>{signed(s.change20d)}</span><span>Stage {s.stage}</span><span>{s.setup}</span></div>):<div className="watch-empty">Click ★ on any stock to build your watchlist.</div>}</div>
      </section>}
    </main>
    {isDemo&&<div className="demobadge">DEMO PREVIEW • live data arrives after the 22:30 scan</div>}
  </div>
}

function DetailPane({selected,bars,loading,watchlisted,onWatch,chartMode,setChartMode,chartRange,setChartRange}:{selected:Stock;bars:Bar[];loading:boolean;watchlisted:boolean;onWatch:()=>void;chartMode:ChartMode;setChartMode:(v:ChartMode)=>void;chartRange:ChartRange;setChartRange:(v:ChartRange)=>void}){
  const modes:ChartMode[]=['Price','RS vs SPY','Volume'];const ranges:ChartRange[]=['3M','6M','1Y','2Y','5Y']
  return <aside className="rightpane">
    <div className="tickerhead"><button className={`star large ${watchlisted?'on':''}`} onClick={onWatch}>★</button><div><h1>{selected.ticker}</h1><small>{selected.stageName}</small></div><div className="tickeractions"><button onClick={()=>navigator.clipboard?.writeText(location.href)}>Copy link</button><button onClick={()=>window.open(`https://www.tradingview.com/chart/?symbol=${selected.ticker}`,'_blank')}>TradingView ↗</button></div><div className="tickerprice"><strong>${fmt(selected.price,2)}</strong><span className={selected.change20d>=0?'positive':'negative'}>{signed(selected.change20d)}</span></div></div>
    <div className="charttabs"><div>{modes.map(m=><button key={m} className={chartMode===m?'active':''} onClick={()=>setChartMode(m)}>{m}</button>)}</div><div className="ranges">{ranges.map(r=><button key={r} className={chartRange===r?'active':''} onClick={()=>setChartRange(r)}>{r}</button>)}</div></div>
    <div className="chartbox">{loading&&<div className="chartloading">Loading 5-year chart…</div>}{!loading&&!bars.length&&<div className="chartloading">5-year chart unavailable for this ticker.</div>}{bars.length>0&&<PriceChart bars={bars} stock={selected} mode={chartMode} range={chartRange}/>}</div>
    <div className="chartstats"><span><small>50 DMA</small><b>{fmt(selected.sma50,2)}</b></span><span><small>150 DMA</small><b>{fmt(selected.sma150,2)}</b></span><span><small>200 DMA</small><b>{fmt(selected.sma200,2)}</b></span><span><small>VOL RATIO</small><b>{fmt(selected.volumeRatio,1)}x</b></span><span><small>RS SLOPE</small><b>{fmt(selected.rsSlope,2)}</b></span><span><small>52W HIGH</small><b>{signed(selected.from52wHigh)}</b></span></div>
    <div className="analysisgrid"><div className="scorecard"><small>PERFECT SETUP SCORE</small><strong>{selected.score}</strong><span>/100</span><b>{selected.score>=85?'PRIME':selected.score>=72?'EARLY':'WATCH'}</b></div><div className="components">{Object.entries(selected.components).map(([k,v])=><div key={k}><span>{labelComponent(k)}</span><div className="bar"><i style={{width:`${Math.min(100,v/(k==='rsAcceleration'||k==='volumeAwakening'?15:k==='notExtended'?10:20)*100)}%`}}/></div><b>{fmt(v,0)}</b></div>)}</div><div className="notes"><h3>Setup analysis</h3>{selected.reasons.slice(0,6).map((r,i)=><p key={i}>✓ {r}</p>)}<p className={selected.rsAcceleration>0?'positive':'negative'}>RS acceleration {selected.rsAcceleration>0?'positive':'not yet positive'} ({fmt(selected.rsAcceleration,2)})</p><p>50DMA extension {signed(selected.distance50)}</p></div></div>
  </aside>
}

function MarketView({market,universe}:{market:Market;universe:Stock[]}){
  const total=Math.max(1,universe.length);const counts=market.stageCounts||Object.fromEntries([1,2,3,4].map(i=>[String(i),universe.filter(s=>s.stage===i).length]))
  return <section className="marketview"><div className="panel marketcard"><div className="panelhead"><b>STAGE DISTRIBUTION</b><span>{total.toLocaleString()} analyzed</span></div>{[1,2,3,4].map(i=>{const c=Number(counts[String(i)]||0);const pct=c/total*100;return <div className="stagebar" key={i}><span>Stage {i}</span><div><i style={{width:`${clamp(pct,0,100)}%`}}/></div><b>{c.toLocaleString()} · {fmt(pct,1)}%</b></div>})}</div><div className="panel marketcard"><div className="panelhead"><b>REGIME SNAPSHOT</b><span>{market.scanDate||'Latest'}</span></div><div className="bigregime">{market.regime||'Unknown'}</div><p>Stage 2 breadth: <b>{market.stage2Pct??0}%</b></p><p>Early leaders: <b>{market.earlyLeaders??0}</b></p><p>Perfect setups: <b>{market.perfectSetups??0}</b></p><p>Waking up: <b>{market.wakingUp??0}</b></p></div></section>
}

function ReportsView({payload,isDemo,dataError,onExport}:{payload:Payload;isDemo:boolean;dataError:string;onExport:()=>void}){
  const m=payload.market
  return <section className="reportsview"><div className="panel reportcard"><div className="panelhead"><b>DATA STATUS</b><span>{isDemo?'DEMO':'LIVE'}</span></div><h2>{isDemo?'Demo dataset':'Nightly scan loaded'}</h2><p>Generated: {new Date(payload.generatedAt).toLocaleString()}</p><p>Scan date: {m.scanDate||'—'}</p><p>Analyzed: {(m.analyzed??payload.universe.length).toLocaleString()}</p><p>5Y charts: {(m.fiveYearCharts??0).toLocaleString()}</p>{dataError&&<p className="negative">{dataError}</p>}</div><div className="panel reportcard"><div className="panelhead"><b>SIGNALS</b><span>Latest</span></div><div className="reportnumbers"><span><small>BUY</small><b className="positive">{m.buyCount??0}</b></span><span><small>SELL</small><b className="negative">{m.sellCount??0}</b></span><span><small>PERFECT</small><b>{m.perfectSetups??0}</b></span></div></div><div className="panel reportcard"><div className="panelhead"><b>EXPORTS</b><span>Browser</span></div><button className="primaryaction" onClick={onExport}>Download current screener CSV</button><a className="secondaryaction" href="./data/latest.json" download>Download raw latest.json</a></div></section>
}

function Metric({title,value,sub,tone}:{title:string;value:string;sub:string;tone:string}){return <div className={`metric ${tone}`}><small>{title}</small><strong>{value}</strong><span>{sub}</span><div className="metricline"/></div>}
function labelComponent(k:string){return ({neglectedHistory:'Neglected history',baseMaturity:'Base maturity',rsTurn:'RS turn',rsAcceleration:'RS acceleration',volumeAwakening:'Volume awakening',notExtended:'Not extended'} as Record<string,string>)[k]||k}

export default App
