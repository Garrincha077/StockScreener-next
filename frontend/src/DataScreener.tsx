import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  type VisibilityState,
  useReactTable,
} from '@tanstack/react-table'
import { CandlestickSeries, ColorType, HistogramSeries, LineSeries, createChart } from 'lightweight-charts'

type Bar = { time:string; open:number; high:number; low:number; close:number; volume:number; rs:number }
type RawBar = [string,number,number,number,number,number,number]
type Page = 'Screener'|'Watchlist'|'Chart Review'|'Market'
type Interval = 'D'|'W'
type Range = '3M'|'6M'|'1Y'|'2Y'|'5Y'
type ChartMode = 'Price'|'RS'|'Volume'

type Stock = {
  ticker:string; price:number; stage:number; stageName:string; setup?:string; score?:number
  primarySetup?:string; setupTags?:string[]; setupMatchCount?:number
  opportunityScore?:number; confluence?:number; structureScore?:number; rsScore?:number; baseScore?:number; triggerScore?:number; freshnessScore?:number; neglectedScore?:number
  rsRank?:number; rsSlope?:number; rsAcceleration?:number; rs3m?:number; rs6m?:number; rs12m?:number; rsFromHigh?:number; rsNewHigh?:boolean
  change20d?:number; return3m?:number; return6m?:number; return1y?:number; prior9mReturn?:number
  volumeRatio?:number; avgVolume20?:number; avgDollarVolume20?:number; volumeDryUp?:number
  vcpScore?:number; contraction?:number; atrPct?:number; atrCompression?:number; tightRange20?:number; tightRange60?:number
  distance50?:number; distance200?:number; distance10w?:number; distance30w?:number; extensionAbs?:number; from52wHigh?:number; from52wLow?:number
  slope50?:number; slope150?:number; slope200?:number; trendTemplatePasses?:number; stage2AgeWeeks?:number; baseWeeks?:number; baseDepthPct?:number
  breakoutPct?:number; breakout60?:boolean; extended?:boolean
  fundamentalSupport?:boolean|null; revenueYoY?:number|null; epsYoY?:number|null; grossMargin?:number|null; marginChange?:number|null
  reasons?:string[]
}
type Payload = { version:number; generatedAt:string; market:Record<string,any>; universe:Stock[]; chartShards?:Record<string,string>; featureModel?:string }

type Filters = { stage:string; minOpportunity:number; minRs:number; minConfluence:number; maxExtension:number; minDollarVolume:number; fundamentals:'All'|'Support'|'Available'; hideExtended:boolean }

const defaultFilters:Filters={stage:'All',minOpportunity:0,minRs:0,minConfluence:0,maxExtension:999,minDollarVolume:0,fundamentals:'All',hideExtended:false}
const recipeTabs=['All','Neglected → Leader','S1→S2 Transition','Fresh Breakout','Long Base Breakout','RS Before Price','Tight / VCP','10W Pullback','Volume Wake-Up','Fresh Stage 2']
const helper=createColumnHelper<Stock>()

const fmt=(v:any,d=1)=>typeof v==='number'&&Number.isFinite(v)?v.toFixed(d):'—'
const signed=(v:any,d=1)=>typeof v==='number'&&Number.isFinite(v)?`${v>0?'+':''}${v.toFixed(d)}%`:'—'
const compact=(v:any)=>typeof v==='number'&&Number.isFinite(v)?new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(v):'—'
const setupOf=(s:Stock)=>s.primarySetup||s.setup||s.stageName||'Other'
const tagsOf=(s:Stock)=>s.setupTags?.length?s.setupTags:[setupOf(s)]
const opp=(s:Stock)=>s.opportunityScore??s.score??0
const ext=(s:Stock)=>s.extensionAbs??Math.abs(s.distance10w??s.distance50??0)
const num=(v:any,f=0)=>typeof v==='number'&&Number.isFinite(v)?v:f

function loadLocal<T>(key:string,fallback:T):T{try{const x=JSON.parse(localStorage.getItem(key)||'null');return x??fallback}catch{return fallback}}

function aggregateWeekly(bars:Bar[]):Bar[]{
  const out:Bar[]=[]
  for(const b of bars){
    const d=new Date(`${b.time}T00:00:00Z`); const day=(d.getUTCDay()+6)%7; d.setUTCDate(d.getUTCDate()-day); const key=d.toISOString().slice(0,10)
    const last=out[out.length-1]
    if(!last||last.time!==key) out.push({...b,time:key})
    else {last.high=Math.max(last.high,b.high);last.low=Math.min(last.low,b.low);last.close=b.close;last.volume+=b.volume;last.rs=b.rs}
  }
  return out
}
function ma(values:number[],n:number){const out:(number|null)[]=[];let sum=0;for(let i=0;i<values.length;i++){sum+=values[i];if(i>=n)sum-=values[i-n];out.push(i+1>=n?sum/n:null)}return out}
function rangeCount(r:Range,i:Interval){return i==='W'?({'3M':13,'6M':26,'1Y':52,'2Y':104,'5Y':260} as any)[r]:({'3M':66,'6M':132,'1Y':252,'2Y':504,'5Y':1265} as any)[r]}

function Chart({bars,interval,range,mode}:{bars:Bar[];interval:Interval;range:Range;mode:ChartMode}){
  const ref=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    if(!ref.current||!bars.length)return
    const source=(interval==='W'?aggregateWeekly(bars):bars).slice(-rangeCount(range,interval))
    const chart=createChart(ref.current,{autoSize:true,layout:{background:{type:ColorType.Solid,color:'#08111d'},textColor:'#7f91a8',attributionLogo:true},grid:{vertLines:{color:'#142238'},horzLines:{color:'#142238'}},timeScale:{borderColor:'#243248',rightOffset:3},rightPriceScale:{borderColor:'#243248'}})
    if(mode==='Price'){
      const c=chart.addSeries(CandlestickSeries,{upColor:'#20d886',downColor:'#f05d6c',wickUpColor:'#20d886',wickDownColor:'#f05d6c',borderVisible:false})
      c.setData(source.map(b=>({time:b.time,open:b.open,high:b.high,low:b.low,close:b.close})) as any)
      const closes=source.map(b=>b.close)
      const specs=interval==='W'?[[10,'#f3c85b'],[30,'#4ca3ff']]:[[10,'#f3c85b'],[20,'#4ca3ff'],[50,'#a36cff'],[200,'#26c7b7']]
      for(const [n,color] of specs as [number,string][]){const vals=ma(closes,n);const line=chart.addSeries(LineSeries,{color,lineWidth:2,priceLineVisible:false,lastValueVisible:false});line.setData(source.map((b,i)=>vals[i]==null?null:{time:b.time,value:vals[i]}).filter(Boolean) as any)}
      const v=chart.addSeries(HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'',lastValueVisible:false,priceLineVisible:false});v.priceScale().applyOptions({scaleMargins:{top:.84,bottom:0}});v.setData(source.map(b=>({time:b.time,value:b.volume,color:b.close>=b.open?'rgba(32,216,134,.27)':'rgba(240,93,108,.27)'})) as any)
    }else if(mode==='RS'){
      const l=chart.addSeries(LineSeries,{color:'#54a6ff',lineWidth:3,priceLineVisible:false});l.setData(source.filter(b=>b.rs>0).map(b=>({time:b.time,value:b.rs})) as any)
    }else{
      const v=chart.addSeries(HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'',lastValueVisible:true,priceLineVisible:false});v.setData(source.map(b=>({time:b.time,value:b.volume,color:b.close>=b.open?'rgba(32,216,134,.7)':'rgba(240,93,108,.7)'})) as any)
    }
    chart.timeScale().fitContent();return()=>chart.remove()
  },[bars,interval,range,mode])
  return <div className="df-chart" ref={ref}/>
}

function DataScreener(){
  const [payload,setPayload]=useState<Payload|null>(null)
  const [error,setError]=useState('')
  const [page,setPage]=useState<Page>('Screener')
  const [recipe,setRecipe]=useState('All')
  const [query,setQuery]=useState('')
  const [sorting,setSorting]=useState<SortingState>(()=>loadLocal('df-sorts',[{id:'opportunityScore',desc:true},{id:'freshnessScore',desc:true},{id:'rsRank',desc:true}]))
  const [pagination,setPagination]=useState<PaginationState>({pageIndex:0,pageSize:100})
  const [filters,setFilters]=useState<Filters>(()=>loadLocal('df-filters',defaultFilters))
  const [filtersOpen,setFiltersOpen]=useState(false)
  const [columnsOpen,setColumnsOpen]=useState(false)
  const [visibility,setVisibility]=useState<VisibilityState>(()=>loadLocal('df-cols',{}))
  const [watchlist,setWatchlist]=useState<string[]>(()=>loadLocal('stockscout-watchlist',[]))
  const [selectedTicker,setSelectedTicker]=useState(location.hash.replace('#','').toUpperCase())
  const [bars,setBars]=useState<Bar[]>([])
  const [chartLoading,setChartLoading]=useState(false)
  const [interval,setInterval]=useState<Interval>('W')
  const [range,setRange]=useState<Range>('5Y')
  const [chartMode,setChartMode]=useState<ChartMode>('Price')
  const shardCache=useRef<Record<string,Record<string,RawBar[]>>>({})

  const load=()=>fetch(`./data/latest.json?t=${Date.now()}`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}).then((p:Payload)=>{if(!p.universe?.length)throw new Error('Dataset is empty');setPayload(p);setError('');if(!selectedTicker)setSelectedTicker(p.universe[0].ticker)}).catch(e=>setError(String(e)))
  useEffect(()=>{load()},[])
  useEffect(()=>localStorage.setItem('df-sorts',JSON.stringify(sorting)),[sorting])
  useEffect(()=>localStorage.setItem('df-filters',JSON.stringify(filters)),[filters])
  useEffect(()=>localStorage.setItem('df-cols',JSON.stringify(visibility)),[visibility])
  useEffect(()=>localStorage.setItem('stockscout-watchlist',JSON.stringify(watchlist)),[watchlist])
  useEffect(()=>{if(selectedTicker)history.replaceState(null,'',`${location.pathname}${location.search}#${selectedTicker}`)},[selectedTicker])

  const universe=payload?.universe||[]
  const selected=universe.find(s=>s.ticker===selectedTicker)||universe[0]
  useEffect(()=>{
    if(!payload||!selected)return
    const shard=payload.chartShards?.[selected.ticker]; if(!shard){setBars([]);return}
    const cached=shardCache.current[shard];if(cached?.[selected.ticker]){setBars(cached[selected.ticker].map(r=>({time:r[0],open:r[1],high:r[2],low:r[3],close:r[4],volume:r[5],rs:r[6]})));return}
    setChartLoading(true);fetch(`./data/charts/${shard}`).then(r=>r.json()).then((d:Record<string,RawBar[]>)=>{shardCache.current[shard]=d;const rows=d[selected.ticker]||[];setBars(rows.map(r=>({time:r[0],open:r[1],high:r[2],low:r[3],close:r[4],volume:r[5],rs:r[6]})))}).catch(()=>setBars([])).finally(()=>setChartLoading(false))
  },[payload,selectedTicker])

  const toggleWatch=(t:string)=>setWatchlist(w=>w.includes(t)?w.filter(x=>x!==t):[...w,t])
  const filtered=useMemo(()=>universe.filter(s=>{
    if(page==='Watchlist'&&!watchlist.includes(s.ticker))return false
    const q=query.trim().toUpperCase();if(q&&!s.ticker.includes(q)&&!tagsOf(s).join(' ').toUpperCase().includes(q))return false
    if(recipe!=='All'&&!tagsOf(s).includes(recipe))return false
    if(filters.stage!=='All'&&s.stage!==Number(filters.stage))return false
    if(opp(s)<filters.minOpportunity)return false
    if(num(s.rsRank)<filters.minRs)return false
    if(num(s.confluence)<filters.minConfluence)return false
    if(ext(s)>filters.maxExtension)return false
    if(num(s.avgDollarVolume20)<filters.minDollarVolume*1_000_000)return false
    if(filters.fundamentals==='Support'&&s.fundamentalSupport!==true)return false
    if(filters.fundamentals==='Available'&&s.fundamentalSupport==null)return false
    if(filters.hideExtended&&s.extended)return false
    return true
  }),[universe,page,watchlist,query,recipe,filters])
  useEffect(()=>setPagination(p=>({...p,pageIndex:0})),[recipe,query,filters,page])

  const columns=useMemo(()=>[
    helper.display({id:'watch',header:'',enableSorting:false,cell:({row})=><button className={`df-star ${watchlist.includes(row.original.ticker)?'on':''}`} onClick={e=>{e.stopPropagation();toggleWatch(row.original.ticker)}}>★</button>}),
    helper.accessor('ticker',{header:'Ticker',cell:i=><b className="df-ticker">{i.getValue()}</b>}),
    helper.accessor(s=>opp(s),{id:'opportunityScore',header:'Opportunity',cell:i=><b className="df-score">{fmt(i.getValue(),0)}</b>}),
    helper.accessor(s=>setupOf(s),{id:'primarySetup',header:'Primary setup',cell:i=><span className="df-primary">{i.getValue()}</span>}),
    helper.accessor('setupMatchCount',{header:'Tags',cell:i=>fmt(i.getValue(),0)}),
    helper.accessor('confluence',{header:'Confluence',cell:i=><span className={(i.getValue()??0)>=7?'df-good':''}>{fmt(i.getValue(),0)}</span>}),
    helper.accessor('freshnessScore',{header:'Fresh',cell:i=>fmt(i.getValue(),0)}),
    helper.accessor('rsRank',{header:'RS Rank',cell:i=><b className={(i.getValue()??0)>=90?'df-good':''}>{fmt(i.getValue(),0)}</b>}),
    helper.accessor('rsAcceleration',{header:'RS Δ',cell:i=><span className={(i.getValue()??0)>0?'df-good':'df-bad'}>{fmt(i.getValue(),2)}</span>}),
    helper.accessor('rsFromHigh',{header:'RS vs High',cell:i=>signed(i.getValue())}),
    helper.accessor('stage',{header:'Stage'}),
    helper.accessor('stage2AgeWeeks',{header:'S2 age w',cell:i=>fmt(i.getValue(),1)}),
    helper.accessor('trendTemplatePasses',{header:'TT /8',cell:i=><b>{fmt(i.getValue(),0)}/8</b>}),
    helper.accessor('return3m',{header:'3M',cell:i=><span className={(i.getValue()??0)>=0?'df-good':'df-bad'}>{signed(i.getValue())}</span>}),
    helper.accessor('prior9mReturn',{header:'Prior 9M',cell:i=>signed(i.getValue())}),
    helper.accessor('volumeRatio',{header:'Vol x',cell:i=><span className={(i.getValue()??0)>=1.5?'df-good':''}>{fmt(i.getValue(),2)}x</span>}),
    helper.accessor('volumeDryUp',{header:'Vol dry',cell:i=>fmt(i.getValue(),2)}),
    helper.accessor('breakoutPct',{header:'Breakout',cell:i=><span className={Math.abs(i.getValue()??99)<=2?'df-good':''}>{signed(i.getValue())}</span>}),
    helper.accessor('vcpScore',{header:'VCP',cell:i=>fmt(i.getValue(),0)}),
    helper.accessor('atrCompression',{header:'ATR comp',cell:i=>`${fmt(i.getValue(),0)}%`}),
    helper.accessor('tightRange20',{header:'20D range',cell:i=>`${fmt(i.getValue(),1)}%`}),
    helper.accessor('baseWeeks',{header:'Base w',cell:i=>fmt(i.getValue(),0)}),
    helper.accessor('distance10w',{header:'10W dist',cell:i=>signed(i.getValue())}),
    helper.accessor('distance30w',{header:'30W dist',cell:i=>signed(i.getValue())}),
    helper.accessor('from52wHigh',{header:'52W high',cell:i=>signed(i.getValue())}),
    helper.accessor('structureScore',{header:'Structure',cell:i=>fmt(i.getValue(),0)}),
    helper.accessor('baseScore',{header:'Base score',cell:i=>fmt(i.getValue(),0)}),
    helper.accessor('triggerScore',{header:'Trigger',cell:i=>fmt(i.getValue(),0)}),
    helper.accessor('neglectedScore',{header:'Neglected',cell:i=>fmt(i.getValue(),0)}),
    helper.accessor('avgDollarVolume20',{header:'$ Vol',cell:i=>compact(i.getValue())}),
    helper.accessor('fundamentalSupport',{header:'Fund',cell:i=>i.getValue()==null?'—':i.getValue()?'✓':'×'}),
  ],[watchlist])

  const table=useReactTable({data:filtered,columns,state:{sorting,pagination,columnVisibility:visibility},onSortingChange:setSorting,onPaginationChange:setPagination,onColumnVisibilityChange:setVisibility,getCoreRowModel:getCoreRowModel(),getSortedRowModel:getSortedRowModel(),getPaginationRowModel:getPaginationRowModel(),enableMultiSort:true})

  const cycleSort=(id:string)=>setSorting(prev=>{const idx=prev.findIndex(s=>s.id===id);if(idx<0)return[...prev,{id,desc:true}];if(prev[idx].desc)return prev.map((s,i)=>i===idx?{...s,desc:false}:s);return prev.filter((_,i)=>i!==idx)})
  const removeSort=(id:string)=>setSorting(s=>s.filter(x=>x.id!==id))
  const moveSort=(id:string,dir:-1|1)=>setSorting(s=>{const a=[...s],i=a.findIndex(x=>x.id===id),j=i+dir;if(i<0||j<0||j>=a.length)return s;[a[i],a[j]]=[a[j],a[i]];return a})
  const presets:Record<string,SortingState>={
    'Early Leaders':[{id:'freshnessScore',desc:true},{id:'rsRank',desc:true},{id:'opportunityScore',desc:true},{id:'stage2AgeWeeks',desc:false}],
    'Neglected→Leader':[{id:'neglectedScore',desc:true},{id:'rsAcceleration',desc:true},{id:'return3m',desc:true},{id:'volumeRatio',desc:true}],
    'Breakouts':[{id:'breakoutPct',desc:true},{id:'volumeRatio',desc:true},{id:'rsRank',desc:true},{id:'freshnessScore',desc:true}],
    'RS + Volume':[{id:'rsRank',desc:true},{id:'rsAcceleration',desc:true},{id:'volumeRatio',desc:true},{id:'opportunityScore',desc:true}],
    'Tight / VCP':[{id:'vcpScore',desc:true},{id:'atrCompression',desc:true},{id:'tightRange20',desc:false},{id:'volumeDryUp',desc:false}],
  }
  const exportCsv=()=>{const cols=table.getAllLeafColumns().filter(c=>c.id!=='watch'&&c.getIsVisible());const lines=[cols.map(c=>c.id).join(','),...table.getSortedRowModel().rows.map(r=>cols.map(c=>JSON.stringify((r.original as any)[c.id]??(c.id==='opportunityScore'?opp(r.original):c.id==='primarySetup'?setupOf(r.original):''))).join(','))];const u=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'}));const a=document.createElement('a');a.href=u;a.download=`stockscout-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(u)}

  useEffect(()=>{const fn=(e:KeyboardEvent)=>{const t=e.target as HTMLElement;if(['INPUT','SELECT','TEXTAREA'].includes(t?.tagName))return;const rows=table.getRowModel().rows;const i=rows.findIndex(r=>r.original.ticker===selected?.ticker);if((e.key==='j'||e.key==='ArrowDown')&&rows.length){e.preventDefault();setSelectedTicker(rows[Math.min(rows.length-1,Math.max(0,i)+1)].original.ticker)}if((e.key==='k'||e.key==='ArrowUp')&&rows.length){e.preventDefault();setSelectedTicker(rows[Math.max(0,i<0?0:i-1)].original.ticker)}};window.addEventListener('keydown',fn);return()=>window.removeEventListener('keydown',fn)})

  if(!payload)return <div className="df-loading">{error?`Unable to load live dataset: ${error}`:'Loading StockScout dataset…'}</div>
  const m=payload.market||{}
  const ageH=Math.max(0,Math.round((Date.now()-new Date(payload.generatedAt).getTime())/3600000))
  const topTags=recipeTabs.slice(1).map(tag=>[tag,universe.filter(s=>tagsOf(s).includes(tag)).length] as const)

  return <div className="df-app">
    <header className="df-top"><div className="df-brand">◉ <b>STOCKSCOUT</b><small>DATA TERMINAL</small></div><nav>{(['Screener','Watchlist','Chart Review','Market'] as Page[]).map(p=><button key={p} className={page===p?'active':''} onClick={()=>setPage(p)}>{p}</button>)}</nav><div className="df-live"><b>{m.regime||'UNKNOWN'}</b><span>{universe.length.toLocaleString()} stocks</span><span>{ageH}h old</span><button onClick={load}>↻</button></div></header>

    {page==='Market'?<Market universe={universe} market={m} topTags={topTags}/>:<>
      <section className="df-statbar"><Stat n={m.neglectedLeaders??topTags[0][1]} label="Neglected→Leader"/><Stat n={m.transitions??topTags[1][1]} label="S1→S2"/><Stat n={m.freshBreakouts??topTags[2][1]} label="Fresh Breakouts"/><Stat n={m.highConfluence??universe.filter(s=>num(s.confluence)>=7).length} label="Confluence 7+"/><Stat n={universe.filter(s=>num(s.rsRank)>=90).length} label="RS 90+"/><Stat n={m.featureCoverage??0} label="5Y feature coverage"/></section>

      <section className="df-recipes">{recipeTabs.map(t=><button key={t} className={recipe===t?'active':''} onClick={()=>setRecipe(t)}>{t}<small>{t==='All'?universe.length:universe.filter(s=>tagsOf(s).includes(t)).length}</small></button>)}</section>

      <section className="df-sortbar"><div className="df-presets"><span>SORT PRESET</span>{Object.entries(presets).map(([k,v])=><button key={k} onClick={()=>setSorting(v)}>{k}</button>)}<button onClick={()=>setSorting([])}>Clear</button></div><div className="df-sortstack"><span>MULTI-SORT</span>{sorting.length?sorting.map((s,i)=><div key={s.id} className="df-sortchip"><b>{i+1}</b><span>{table.getColumn(s.id)?.columnDef.header as string||s.id}</span><button onClick={()=>cycleSort(s.id)}>{s.desc?'↓':'↑'}</button><button disabled={i===0} onClick={()=>moveSort(s.id,-1)}>‹</button><button disabled={i===sorting.length-1} onClick={()=>moveSort(s.id,1)}>›</button><button onClick={()=>removeSort(s.id)}>×</button></div>):<em>Click any column header to build a priority stack</em>}</div></section>

      <section className="df-toolbar"><button className={filtersOpen?'active':''} onClick={()=>setFiltersOpen(v=>!v)}>⚙ Filters</button><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ticker or setup tag…"/><select value={pagination.pageSize} onChange={e=>setPagination({pageIndex:0,pageSize:Number(e.target.value)})}><option>50</option><option>100</option><option>250</option></select><button className={columnsOpen?'active':''} onClick={()=>setColumnsOpen(v=>!v)}>▦ Columns</button><button onClick={exportCsv}>⇩ CSV</button><strong>{filtered.length.toLocaleString()} matches</strong></section>
      {filtersOpen&&<div className="df-filtergrid"><label>Stage<select value={filters.stage} onChange={e=>setFilters(f=>({...f,stage:e.target.value}))}><option>All</option><option>1</option><option>2</option><option>3</option><option>4</option></select></label><label>Min opportunity<input type="number" value={filters.minOpportunity||''} onChange={e=>setFilters(f=>({...f,minOpportunity:Number(e.target.value)||0}))}/></label><label>Min RS rank<input type="number" value={filters.minRs||''} onChange={e=>setFilters(f=>({...f,minRs:Number(e.target.value)||0}))}/></label><label>Min confluence<input type="number" min="0" max="10" value={filters.minConfluence||''} onChange={e=>setFilters(f=>({...f,minConfluence:Number(e.target.value)||0}))}/></label><label>Max |10W ext|<input type="number" value={filters.maxExtension===999?'':filters.maxExtension} onChange={e=>setFilters(f=>({...f,maxExtension:e.target.value===''?999:Number(e.target.value)}))}/></label><label>Min $ volume (M)<input type="number" value={filters.minDollarVolume||''} onChange={e=>setFilters(f=>({...f,minDollarVolume:Number(e.target.value)||0}))}/></label><label>Fundamentals<select value={filters.fundamentals} onChange={e=>setFilters(f=>({...f,fundamentals:e.target.value as any}))}><option>All</option><option value="Support">Support only</option><option value="Available">Available</option></select></label><label className="df-check"><input type="checkbox" checked={filters.hideExtended} onChange={e=>setFilters(f=>({...f,hideExtended:e.target.checked}))}/> Hide extended</label><button onClick={()=>setFilters(defaultFilters)}>Reset</button></div>}
      {columnsOpen&&<div className="df-colpicker"><div><button onClick={()=>table.getAllLeafColumns().forEach(c=>c.toggleVisibility(true))}>Show all</button><button onClick={()=>setVisibility({structureScore:false,baseScore:false,triggerScore:false,neglectedScore:false,avgDollarVolume20:false,volumeDryUp:false,rsFromHigh:false,baseWeeks:false})}>Core columns</button></div>{table.getAllLeafColumns().filter(c=>c.id!=='watch').map(c=><label key={c.id}><input type="checkbox" checked={c.getIsVisible()} onChange={c.getToggleVisibilityHandler()}/>{String(c.columnDef.header||c.id)}</label>)}</div>}

      <main className={`df-work ${page==='Chart Review'?'chartonly':''}`}>
        {page!=='Chart Review'&&<div className="df-tablebox"><div className="df-tablewrap"><table><thead>{table.getHeaderGroups().map(hg=><tr key={hg.id}>{hg.headers.map(h=>{const si=sorting.findIndex(s=>s.id===h.column.id);const ss=si>=0?sorting[si]:null;return <th key={h.id} className={si>=0?'sorted':''} onClick={()=>h.column.getCanSort()&&cycleSort(h.column.id)}>{flexRender(h.column.columnDef.header,h.getContext())}{si>=0&&<><i>{si+1}</i><b>{ss?.desc?'↓':'↑'}</b></>}</th>})}</tr>)}</thead><tbody>{table.getRowModel().rows.map(r=><tr key={r.id} className={r.original.ticker===selected?.ticker?'selected':''} onClick={()=>setSelectedTicker(r.original.ticker)}>{r.getVisibleCells().map(c=><td key={c.id}>{flexRender(c.column.columnDef.cell,c.getContext())}</td>)}</tr>)}</tbody></table></div><footer><span>Click header: DESC → ASC → OFF · every new column joins the sort stack</span><div><button disabled={!table.getCanPreviousPage()} onClick={()=>table.previousPage()}>←</button><b>{pagination.pageIndex+1}/{Math.max(1,table.getPageCount())}</b><button disabled={!table.getCanNextPage()} onClick={()=>table.nextPage()}>→</button></div></footer></div>}
        {selected&&<Detail stock={selected} bars={bars} loading={chartLoading} interval={interval} setInterval={setInterval} range={range} setRange={setRange} mode={chartMode} setMode={setChartMode} watched={watchlist.includes(selected.ticker)} toggleWatch={()=>toggleWatch(selected.ticker)}/>} 
      </main>
    </>}
  </div>
}

function Detail({stock,bars,loading,interval,setInterval,range,setRange,mode,setMode,watched,toggleWatch}:{stock:Stock;bars:Bar[];loading:boolean;interval:Interval;setInterval:(v:Interval)=>void;range:Range;setRange:(v:Range)=>void;mode:ChartMode;setMode:(v:ChartMode)=>void;watched:boolean;toggleWatch:()=>void}){
  const dimensions=[['Structure',stock.structureScore],['RS',stock.rsScore],['Base',stock.baseScore],['Trigger',stock.triggerScore],['Freshness',stock.freshnessScore],['Neglected',stock.neglectedScore]] as [string,number|undefined][]
  return <aside className="df-detail"><div className="df-detailhead"><button className={`df-star big ${watched?'on':''}`} onClick={toggleWatch}>★</button><div><h1>{stock.ticker}</h1><span>Stage {stock.stage} · {stock.stageName}</span></div><div className="df-opp"><small>OPPORTUNITY</small><b>{opp(stock)}</b></div><div className="df-price"><b>${fmt(stock.price,2)}</b><span>{signed(stock.change20d)} 20D</span></div></div>
    <div className="df-tags">{tagsOf(stock).map(t=><span key={t} className={t.startsWith('⚠')?'warn':''}>{t}</span>)}</div>
    <div className="df-chartcontrols"><div>{(['Price','RS','Volume'] as ChartMode[]).map(x=><button className={mode===x?'active':''} onClick={()=>setMode(x)} key={x}>{x}</button>)}</div><div>{(['D','W'] as Interval[]).map(x=><button className={interval===x?'active':''} onClick={()=>setInterval(x)} key={x}>{x==='D'?'Daily':'Weekly'}</button>)}</div><div>{(['3M','6M','1Y','2Y','5Y'] as Range[]).map(x=><button className={range===x?'active':''} onClick={()=>setRange(x)} key={x}>{x}</button>)}</div></div>
    <div className="df-chartbox">{loading?<div className="df-chartmsg">Loading 5Y history…</div>:bars.length?<Chart bars={bars} interval={interval} range={range} mode={mode}/>:<div className="df-chartmsg">Chart unavailable</div>}</div>
    <div className="df-kpis"><K label="RS Rank" v={fmt(stock.rsRank,0)}/><K label="RS Δ" v={fmt(stock.rsAcceleration,2)}/><K label="TT" v={`${fmt(stock.trendTemplatePasses,0)}/8`}/><K label="S2 age" v={`${fmt(stock.stage2AgeWeeks,1)}w`}/><K label="Vol" v={`${fmt(stock.volumeRatio,2)}x`}/><K label="Breakout" v={signed(stock.breakoutPct)}/><K label="10W" v={signed(stock.distance10w)}/><K label="30W" v={signed(stock.distance30w)}/></div>
    <div className="df-dimensions"><div className="df-dimhead"><b>Signal matrix</b><span>Confluence {fmt(stock.confluence,0)}/10</span></div>{dimensions.map(([n,v])=><div key={n}><span>{n}</span><div><i style={{width:`${Math.max(0,Math.min(100,num(v)))}%`}}/></div><b>{fmt(v,0)}</b></div>)}</div>
    <div className="df-evidence"><div><h3>NEGLECTED → WAKE</h3><p>Prior 9M <b>{signed(stock.prior9mReturn)}</b></p><p>Recent 3M <b>{signed(stock.return3m)}</b></p><p>RS from high <b>{signed(stock.rsFromHigh)}</b></p></div><div><h3>BASE / TRIGGER</h3><p>Base age <b>{fmt(stock.baseWeeks,0)}w</b></p><p>20D range <b>{fmt(stock.tightRange20,1)}%</b></p><p>ATR compression <b>{fmt(stock.atrCompression,0)}%</b></p><p>Volume dry-up <b>{fmt(stock.volumeDryUp,2)}x</b></p></div><div><h3>FUNDAMENTALS</h3><p>Support <b>{stock.fundamentalSupport==null?'—':stock.fundamentalSupport?'✓':'×'}</b></p><p>Revenue YoY <b>{signed(stock.revenueYoY)}</b></p><p>EPS YoY <b>{signed(stock.epsYoY)}</b></p><p>Gross margin <b>{stock.grossMargin==null?'—':`${fmt(stock.grossMargin,1)}%`}</b></p></div></div>
  </aside>
}
function K({label,v}:{label:string;v:string}){return <span><small>{label}</small><b>{v}</b></span>}
function Stat({n,label}:{n:any;label:string}){return <div><b>{typeof n==='number'?n.toLocaleString():n}</b><span>{label}</span></div>}
function Market({universe,market,topTags}:{universe:Stock[];market:Record<string,any>;topTags:readonly(readonly[string,number])[]}){const stages=[1,2,3,4].map(s=>[s,universe.filter(x=>x.stage===s).length] as const);const leaders=[...universe].sort((a,b)=>opp(b)-opp(a)).slice(0,20);return <main className="df-market"><section><h2>Market structure</h2><div className="df-marketgrid">{stages.map(([s,n])=><Stat key={s} n={n} label={`Stage ${s}`}/>)}</div><p>Regime <b>{market.regime||'Unknown'}</b> · Stage 2 breadth <b>{market.stage2Pct??0}%</b></p></section><section><h2>Setup recipe coverage</h2>{topTags.map(([t,n])=><div className="df-marketrow" key={t}><span>{t}</span><i style={{width:`${Math.min(100,n/Math.max(1,universe.length)*500)}%`}}/><b>{n}</b></div>)}</section><section><h2>Top opportunity + confluence</h2>{leaders.map(s=><div className="df-leader" key={s.ticker}><b>{s.ticker}</b><span>{setupOf(s)}</span><em>RS {fmt(s.rsRank,0)}</em><strong>{opp(s)}</strong></div>)}</section></main>}

export default DataScreener
