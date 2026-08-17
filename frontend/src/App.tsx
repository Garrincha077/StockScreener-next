import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
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
  ma10?: number | null
  ma20?: number | null
  ma50?: number | null
  ma200?: number | null
}

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
}

type Payload = {
  version: number
  generatedAt: string
  market: Market
  universe: Stock[]
  charts: Record<string, Bar[]>
}

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
  let last = price * .57
  for (let i = 180; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    if (d.getDay() === 0 || d.getDay() === 6) continue
    const drift = .003 + Math.sin(i / 11) * .004
    const next = Math.max(2, last * (1 + drift + Math.sin(i * 2.17) * .009))
    const hi = Math.max(last, next) * 1.015
    const lo = Math.min(last, next) * .986
    out.push({time:d.toISOString().slice(0,10),open:last,high:hi,low:lo,close:next,volume:800000 + ((i * 7919) % 1200000)})
    last = next
  }
  const scale = price / out[out.length - 1].close
  out.forEach((b, idx) => {
    b.open*=scale; b.high*=scale; b.low*=scale; b.close*=scale
    const closes = out.slice(Math.max(0, idx - 199), idx + 1).map(x => x.close)
    const ma = (n:number) => closes.length >= n ? closes.slice(-n).reduce((a,c)=>a+c,0)/n : null
    b.ma10=ma(10); b.ma20=ma(20); b.ma50=ma(50); b.ma200=ma(200)
  })
  return out
}

const demoPayload: Payload = {
  version: 1,
  generatedAt: new Date().toISOString(),
  market: {regime:'RISK ON',totalUniverse:3842,analyzed:3714,stage2Pct:72,earlyLeaders:37,perfectSetups:12,wakingUp:21,scanDate:'DEMO'},
  universe: demoStocks,
  charts: Object.fromEntries(demoStocks.map(s => [s.ticker, demoBars(s.price)])),
}

function fmt(n:number, digits=1){ return Number.isFinite(n) ? n.toFixed(digits) : '—' }
function signed(n:number, digits=1){ return `${n>0?'+':''}${fmt(n,digits)}%` }

function PriceChart({ bars, stock }:{bars:Bar[];stock:Stock}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current || !bars.length) return
    const chart = createChart(ref.current, {
      autoSize: true,
      layout:{background:{type:ColorType.Solid,color:'#0b1523'},textColor:'#7f91a8',attributionLogo:true},
      grid:{vertLines:{color:'#172334'},horzLines:{color:'#172334'}},
      rightPriceScale:{borderColor:'#243248'},
      timeScale:{borderColor:'#243248',timeVisible:false},
      crosshair:{vertLine:{color:'#42536c'},horzLine:{color:'#42536c'}},
    })
    const candles = chart.addSeries(CandlestickSeries, {upColor:'#16d47b',downColor:'#f05d6c',wickUpColor:'#16d47b',wickDownColor:'#f05d6c',borderVisible:false})
    candles.setData(bars.map(b=>({time:b.time,open:b.open,high:b.high,low:b.low,close:b.close})) as any)
    const colors = ['#f0c34f','#3d8bfd','#8f5bd7','#24b6ad']
    ;(['ma10','ma20','ma50','ma200'] as const).forEach((key,i)=>{
      const line=chart.addSeries(LineSeries,{color:colors[i],lineWidth:2,priceLineVisible:false,lastValueVisible:false})
      line.setData(bars.filter(b=>b[key]).map(b=>({time:b.time,value:b[key]})) as any)
    })
    const volume = chart.addSeries(HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'',lastValueVisible:false,priceLineVisible:false})
    volume.priceScale().applyOptions({scaleMargins:{top:.82,bottom:0}})
    volume.setData(bars.map(b=>({time:b.time,value:b.volume,color:b.close>=b.open?'rgba(22,212,123,.35)':'rgba(240,93,108,.35)'})) as any)
    chart.timeScale().fitContent()
    const ro = new ResizeObserver(()=>chart.applyOptions({width:ref.current?.clientWidth ?? 600,height:ref.current?.clientHeight ?? 390}))
    ro.observe(ref.current)
    return ()=>{ro.disconnect();chart.remove()}
  },[bars,stock.ticker])
  return <div className="chart" ref={ref}/>
}

const columnHelper = createColumnHelper<Stock>()

function App(){
  const [payload,setPayload]=useState<Payload>(demoPayload)
  const [isDemo,setIsDemo]=useState(true)
  const [selectedTicker,setSelectedTicker]=useState('IREN')
  const [mode,setMode]=useState('Perfect')
  const [query,setQuery]=useState('')
  const [sorting,setSorting]=useState<SortingState>([{id:'score',desc:true}])
  const [watchlist,setWatchlist]=useState<string[]>(()=>JSON.parse(localStorage.getItem('stockscout-watchlist')||'[]'))

  useEffect(()=>{
    fetch('./data/latest.json',{cache:'no-store'})
      .then(r=>{if(!r.ok) throw new Error('no scan'); return r.json()})
      .then((data:Payload)=>{setPayload(data);setIsDemo(false);if(data.universe.length)setSelectedTicker(data.universe[0].ticker)})
      .catch(()=>setIsDemo(true))
  },[])
  useEffect(()=>localStorage.setItem('stockscout-watchlist',JSON.stringify(watchlist)),[watchlist])

  const filtered = useMemo(()=>payload.universe.filter(s=>{
    const qok=!query||s.ticker.toLowerCase().includes(query.toLowerCase())||s.setup.toLowerCase().includes(query.toLowerCase())
    if(!qok)return false
    if(mode==='Perfect')return s.perfect
    if(mode==='Early Stage 2')return s.earlyStage2
    if(mode==='Waking Up')return s.wakingUp
    if(mode==='RS Leaders')return s.rsSlope>0
    if(mode==='Volume Breakouts')return s.volumeRatio>=1.5
    if(mode==='VCP / Compression')return s.vcpScore>=50||s.contraction>=50
    return true
  }),[payload,mode,query])

  const columns=useMemo(()=>[
    columnHelper.display({id:'watch',header:'',cell:({row})=><button className={`star ${watchlist.includes(row.original.ticker)?'on':''}`} onClick={(e)=>{e.stopPropagation();setWatchlist(w=>w.includes(row.original.ticker)?w.filter(x=>x!==row.original.ticker):[...w,row.original.ticker])}}>★</button>}),
    columnHelper.accessor('ticker',{header:'Ticker',cell:i=><strong>{i.getValue()}</strong>}),
    columnHelper.accessor('price',{header:'Price',cell:i=>`$${fmt(i.getValue(),2)}`}),
    columnHelper.accessor('change20d',{header:'20D',cell:i=><span className={i.getValue()>=0?'positive':'negative'}>{signed(i.getValue())}</span>}),
    columnHelper.accessor('stage',{header:'Stage',cell:i=><span className="stage">{i.getValue()===2?'2 Early':i.getValue()}</span>}),
    columnHelper.accessor('setup',{header:'Setup',cell:i=><span className={`setup ${i.getValue().toLowerCase().replaceAll(' ','-')}`}>{i.getValue()}</span>}),
    columnHelper.accessor('score',{header:'Score',cell:i=><span className="score">{i.getValue()}</span>}),
    columnHelper.accessor('rsSlope',{header:'RS slope',cell:i=><span className="positive">{i.getValue()>0?'↑':'↓'} {fmt(i.getValue(),2)}</span>}),
    columnHelper.accessor('rsAcceleration',{header:'RS Δ',cell:i=><span className={i.getValue()>0?'positive':'negative'}>{i.getValue()>0?'↑↑':'↓'} {fmt(i.getValue(),2)}</span>}),
    columnHelper.accessor('volumeRatio',{header:'Volume',cell:i=>`${fmt(i.getValue(),1)}x`}),
    columnHelper.accessor('vcpScore',{header:'VCP',cell:i=>fmt(i.getValue(),0)}),
    columnHelper.accessor('distance50',{header:'50DMA ext.',cell:i=><span className={Math.abs(i.getValue())<10?'positive':''}>{signed(i.getValue())}</span>}),
  ],[watchlist])

  const table=useReactTable({data:filtered,columns,state:{sorting},onSortingChange:setSorting,getCoreRowModel:getCoreRowModel(),getSortedRowModel:getSortedRowModel()})
  const selected=payload.universe.find(s=>s.ticker===selectedTicker)||payload.universe[0]||demoStocks[0]
  const bars=payload.charts[selected.ticker]||demoBars(selected.price)
  const m=payload.market
  const watchStocks=watchlist.map(t=>payload.universe.find(s=>s.ticker===t)).filter(Boolean) as Stock[]
  const modes=['Perfect','Early Stage 2','Waking Up','RS Leaders','Volume Breakouts','VCP / Compression','All']

  return <div className="app">
    <header className="topbar">
      <div className="brand"><span className="logo">◉</span><span>STOCKSCOUT</span></div>
      <nav><button className="active">Dashboard</button><button>Screener</button><button>Watchlist</button><button>Charts</button><button>Market</button><button>Reports</button></nav>
      <div className="topstatus"><span className="regime">MARKET: {m.regime||'UNKNOWN'}</span><span>{isDemo?'Demo preview':`Last scan: ${m.scanDate||payload.generatedAt.slice(0,10)}`}</span><span className="dot">●</span></div>
    </header>

    <main>
      <section className="metrics">
        <Metric title="Market regime" value={m.regime||'Unknown'} sub="Scan-confirmed environment" tone="green" />
        <Metric title="Stage 2 breadth" value={`${m.stage2Pct??0}%`} sub="Analyzed universe" tone="green" />
        <Metric title="Early leaders" value={String(m.earlyLeaders??0)} sub="Early Stage 2" tone="blue" />
        <Metric title="Perfect setups" value={String(m.perfectSetups??0)} sub="Neglected → waking" tone="purple" />
        <Metric title="Waking up" value={String(m.wakingUp??0)} sub="RS + volume acceleration" tone="yellow" />
        <Metric title="Total universe" value={(m.totalUniverse??m.analyzed??payload.universe.length).toLocaleString()} sub={`${m.analyzed??payload.universe.length} analyzed`} tone="white" />
      </section>

      <section className="workspace">
        <div className="leftpane">
          <div className="tabs">{modes.map(x=><button key={x} className={mode===x?'active':''} onClick={()=>setMode(x)}>{x==='Perfect'?'★ ':''}{x}</button>)}</div>
          <div className="filters"><div className="filterpill">⚙ Filters <b>5</b></div><div className="filterpill">Stage: 1→2, 2 Early</div><div className="filterpill">RS acceleration: &gt; 0</div><div className="filterpill">Volume: &gt; 1.5x</div><div className="filterpill">Extension: &lt; 10%</div><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search ticker…"/></div>
          <div className="tablewrap">
            <table>
              <thead>{table.getHeaderGroups().map(hg=><tr key={hg.id}>{hg.headers.map(h=><th key={h.id} onClick={h.column.getToggleSortingHandler()}>{flexRender(h.column.columnDef.header,h.getContext())}{h.column.getIsSorted()==='asc'?' ↑':h.column.getIsSorted()==='desc'?' ↓':''}</th>)}</tr>)}</thead>
              <tbody>{table.getRowModel().rows.slice(0,80).map(row=><tr key={row.id} className={row.original.ticker===selected.ticker?'selected':''} onClick={()=>setSelectedTicker(row.original.ticker)}>{row.getVisibleCells().map(cell=><td key={cell.id}>{flexRender(cell.column.columnDef.cell,cell.getContext())}</td>)}</tr>)}</tbody>
            </table>
            {!filtered.length&&<div className="empty">No stocks match this view.</div>}
          </div>
          <div className="tablefooter">Showing {Math.min(filtered.length,80)} of {filtered.length} results <span>Nightly dataset • full-universe scan</span></div>
        </div>

        <aside className="rightpane">
          <div className="tickerhead"><button className={`star large ${watchlist.includes(selected.ticker)?'on':''}`} onClick={()=>setWatchlist(w=>w.includes(selected.ticker)?w.filter(x=>x!==selected.ticker):[...w,selected.ticker])}>★</button><div><h1>{selected.ticker}</h1><small>{selected.stageName}</small></div><div className="tickerprice"><strong>${fmt(selected.price,2)}</strong><span className="positive">{signed(selected.change20d)}</span></div></div>
          <div className="charttabs"><button className="active">Price chart</button><button>RS vs SPY</button><button>Volume</button><span>1Y</span></div>
          <PriceChart bars={bars} stock={selected}/>
          <div className="chartstats"><span><small>50 DMA</small><b>{fmt(selected.sma50,2)}</b></span><span><small>150 DMA</small><b>{fmt(selected.sma150,2)}</b></span><span><small>200 DMA</small><b>{fmt(selected.sma200,2)}</b></span><span><small>VOL RATIO</small><b>{fmt(selected.volumeRatio,1)}x</b></span><span><small>RS SLOPE</small><b>{fmt(selected.rsSlope,2)}</b></span><span><small>52W HIGH</small><b>{signed(selected.from52wHigh)}</b></span></div>
          <div className="analysisgrid">
            <div className="scorecard"><small>PERFECT SETUP SCORE</small><strong>{selected.score}</strong><span>/100</span><b>{selected.score>=85?'PRIME':selected.score>=72?'EARLY':'WATCH'}</b></div>
            <div className="components">{Object.entries(selected.components).map(([k,v])=><div key={k}><span>{labelComponent(k)}</span><div className="bar"><i style={{width:`${Math.min(100,v/(k==='rsAcceleration'||k==='volumeAwakening'?15:k==='notExtended'?10:20)*100)}%`}}/></div><b>{fmt(v,0)}</b></div>)}</div>
            <div className="notes"><h3>Setup analysis</h3>{selected.reasons.slice(0,6).map((r,i)=><p key={i}>✓ {r}</p>)}<p>✓ RS acceleration {selected.rsAcceleration>0?'positive':'not yet positive'}</p><p>✓ 50DMA extension {signed(selected.distance50)}</p></div>
          </div>
        </aside>
      </section>

      <section className="bottomgrid">
        <div className="panel"><div className="panelhead"><b>TOP SETUPS</b><span>Nightly ranking</span></div><div className="minicards">{payload.universe.slice().sort((a,b)=>b.score-a.score).slice(0,6).map(s=><button key={s.ticker} onClick={()=>setSelectedTicker(s.ticker)}><span><b>{s.ticker}</b><strong>{s.score}</strong></span><div className="spark">{Array.from({length:24},(_,i)=><i key={i} style={{height:`${18+((i*17+s.score)%46)}%`}}/>)}</div><small>{s.setup}</small></button>)}</div></div>
        <div className="panel watch"><div className="panelhead"><b>MY WATCHLIST</b><span>{watchStocks.length} stocks</span></div>{watchStocks.length?watchStocks.slice(0,8).map(s=><div className="watchrow" key={s.ticker} onClick={()=>setSelectedTicker(s.ticker)}><b>{s.ticker}</b><span>${fmt(s.price,2)}</span><span className={s.change20d>=0?'positive':'negative'}>{signed(s.change20d)}</span><span>Stage {s.stage}</span><span>{s.setup}</span></div>):<div className="watch-empty">Click ★ on any stock to build your watchlist.</div>}</div>
      </section>
    </main>
    {isDemo&&<div className="demobadge">DEMO PREVIEW • switches to live nightly scan automatically</div>}
  </div>
}

function Metric({title,value,sub,tone}:{title:string;value:string;sub:string;tone:string}){return <div className={`metric ${tone}`}><small>{title}</small><strong>{value}</strong><span>{sub}</span><div className="metricline"/></div>}
function labelComponent(k:string){return ({neglectedHistory:'Neglected history',baseMaturity:'Base maturity',rsTurn:'RS turn',rsAcceleration:'RS acceleration',volumeAwakening:'Volume awakening',notExtended:'Not extended'} as Record<string,string>)[k]||k}

export default App
