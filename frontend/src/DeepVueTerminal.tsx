import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {createColumnHelper,flexRender,getCoreRowModel,getPaginationRowModel,type PaginationState,type SortingState,type VisibilityState,useReactTable} from '@tanstack/react-table'
import {CandlestickSeries,ColorType,HistogramSeries,LineSeries,createChart} from 'lightweight-charts'
import {builtInScreens,fieldDefs,makeGroup,makeRule,matchesGroups,opsByKind,type Logic,type RuleGroup,type ScreenState} from './deepvue/filterEngine'

type Bar={time:string;open:number;high:number;low:number;close:number;volume:number;rs:number}
type RawBar=[string,number,number,number,number,number,number]
type Page='Screener'|'Grid'|'Changes'|'Watchlist'|'Market'
type Interval='D'|'W'
type Range='3M'|'6M'|'1Y'|'2Y'|'5Y'
type ChartMode='Price'|'RS'|'Volume'
type Stock={
  ticker:string;price:number;stage:number;stageName:string;setup?:string;score?:number
  primarySetup?:string;setupTags?:string[];setupMatchCount?:number
  opportunityScore?:number;confluence?:number;structureScore?:number;rsScore?:number;baseScore?:number;triggerScore?:number;freshnessScore?:number;neglectedScore?:number
  rsRank?:number;rsSlope?:number;rsAcceleration?:number;rs3m?:number;rs6m?:number;rs12m?:number;rsFromHigh?:number;rsNewHigh?:boolean
  change20d?:number;return3m?:number;return6m?:number;return1y?:number;prior9mReturn?:number
  volumeRatio?:number;avgVolume20?:number;avgDollarVolume20?:number;volumeDryUp?:number
  vcpScore?:number;contraction?:number;atrPct?:number;atrCompression?:number;tightRange20?:number;tightRange60?:number
  distance50?:number;distance200?:number;distance10w?:number;distance30w?:number;extensionAbs?:number;from52wHigh?:number;from52wLow?:number
  slope50?:number;slope150?:number;slope200?:number;trendTemplatePasses?:number;stage2AgeWeeks?:number;baseWeeks?:number;baseDepthPct?:number
  breakoutPct?:number;breakout60?:boolean;extended?:boolean
  fundamentalSupport?:boolean|null;revenueYoY?:number|null;epsYoY?:number|null;grossMargin?:number|null;marginChange?:number|null
  changedToday?:boolean;newUniverseMember?:boolean;changeImpact?:number;opportunityDelta?:number;rsRankDelta?:number;confluenceDelta?:number;volumeRatioDelta?:number;freshnessDelta?:number
  stageFrom?:number|null;stageTo?:number|null;stageChanged?:boolean;newSetupTags?:string[];lostSetupTags?:string[];changeLabels?:string[]
  reasons?:string[]
}
type Payload={version:number;generatedAt:string;market:Record<string,any>;universe:Stock[];chartShards?:Record<string,string>;featureModel?:string}

const helper=createColumnHelper<Stock>()
const defaultVisibility:VisibilityState={rsFromHigh:false,volumeDryUp:false,baseWeeks:false,distance30w:false,structureScore:false,baseScore:false,triggerScore:false,neglectedScore:false,avgDollarVolume20:false,fundamentalSupport:false}
const recipeTabs=['All','Neglected → Leader','S1→S2 Transition','Fresh Breakout','Long Base Breakout','RS Before Price','Tight / VCP','10W Pullback','Volume Wake-Up','Fresh Stage 2']
const fmt=(v:any,d=1)=>typeof v==='number'&&Number.isFinite(v)?v.toFixed(d):'—'
const signed=(v:any,d=1)=>typeof v==='number'&&Number.isFinite(v)?`${v>0?'+':''}${v.toFixed(d)}%`:'—'
const compact=(v:any)=>typeof v==='number'&&Number.isFinite(v)?new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(v):'—'
const num=(v:any,f=0)=>typeof v==='number'&&Number.isFinite(v)?v:f
const setupOf=(s:Stock)=>s.primarySetup||s.setup||s.stageName||'Other'
const tagsOf=(s:Stock)=>s.setupTags?.length?s.setupTags:[setupOf(s)]
const opp=(s:Stock)=>s.opportunityScore??s.score??0
function loadLocal<T>(key:string,fallback:T):T{try{const x=JSON.parse(localStorage.getItem(key)||'null');return x??fallback}catch{return fallback}}
function sortValue(stock:Stock,id:string):any{if(id==='opportunityScore')return opp(stock);if(id==='primarySetup')return setupOf(stock);return(stock as any)[id]}
function compareValues(a:any,b:any):number{const am=a==null||(typeof a==='number'&&!Number.isFinite(a)),bm=b==null||(typeof b==='number'&&!Number.isFinite(b));if(am&&bm)return 0;if(am)return 1;if(bm)return-1;if(typeof a==='number'&&typeof b==='number')return a-b;if(typeof a==='boolean'&&typeof b==='boolean')return Number(a)-Number(b);return String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:'base'})}
function applyMultiSort(rows:Stock[],sorting:SortingState){if(!sorting.length)return rows;return rows.map((stock,index)=>({stock,index})).sort((a,b)=>{for(const s of sorting){const av=sortValue(a.stock,s.id),bv=sortValue(b.stock,s.id);const c=compareValues(av,bv);if(c!==0)return s.desc?-c:c}const t=a.stock.ticker.localeCompare(b.stock.ticker);return t||a.index-b.index}).map(x=>x.stock)}
function aggregateWeekly(bars:Bar[]){const out:Bar[]=[];for(const b of bars){const d=new Date(`${b.time}T00:00:00Z`),day=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-day);const key=d.toISOString().slice(0,10),last=out[out.length-1];if(!last||last.time!==key)out.push({...b,time:key});else{last.high=Math.max(last.high,b.high);last.low=Math.min(last.low,b.low);last.close=b.close;last.volume+=b.volume;last.rs=b.rs}}return out}
function ma(values:number[],n:number){const out:(number|null)[]=[];let sum=0;for(let i=0;i<values.length;i++){sum+=values[i];if(i>=n)sum-=values[i-n];out.push(i+1>=n?sum/n:null)}return out}
function rangeCount(r:Range,i:Interval){return i==='W'?({"3M":13,"6M":26,"1Y":52,"2Y":104,"5Y":260} as any)[r]:({"3M":66,"6M":132,"1Y":252,"2Y":504,"5Y":1265} as any)[r]}

function PriceChart({bars,interval='W',range='5Y',mode='Price',mini=false}:{bars:Bar[];interval?:Interval;range?:Range;mode?:ChartMode;mini?:boolean}){
  const ref=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    if(!ref.current||!bars.length)return
    const source=(interval==='W'?aggregateWeekly(bars):bars).slice(-rangeCount(range,interval))
    const chart=createChart(ref.current,{autoSize:true,layout:{background:{type:ColorType.Solid,color:'#08111d'},textColor:mini?'#63758d':'#8396ae',attributionLogo:false},grid:{vertLines:{color:mini?'transparent':'#142238'},horzLines:{color:mini?'#102033':'#142238'}},timeScale:{borderVisible:!mini,borderColor:'#243248',rightOffset:2,timeVisible:false},rightPriceScale:{borderVisible:!mini,borderColor:'#243248',scaleMargins:mini?{top:.08,bottom:.16}:undefined},handleScroll:!mini,handleScale:!mini})
    if(mode==='Price'){
      const c=chart.addSeries(CandlestickSeries,{upColor:'#20d886',downColor:'#f05d6c',wickUpColor:'#20d886',wickDownColor:'#f05d6c',borderVisible:false,priceLineVisible:!mini,lastValueVisible:!mini})
      c.setData(source.map(b=>({time:b.time,open:b.open,high:b.high,low:b.low,close:b.close})) as any)
      const closes=source.map(b=>b.close),specs=interval==='W'?[[10,'#f3c85b'],[30,'#4ca3ff']]:[[10,'#f3c85b'],[20,'#4ca3ff'],[50,'#a36cff'],[200,'#26c7b7']]
      for(const[n,color]of specs as[number,string][]){const vals=ma(closes,n),line=chart.addSeries(LineSeries,{color,lineWidth:mini?1:2,priceLineVisible:false,lastValueVisible:false});line.setData(source.map((b,i)=>vals[i]==null?null:{time:b.time,value:vals[i]}).filter(Boolean) as any)}
      const v=chart.addSeries(HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'',lastValueVisible:false,priceLineVisible:false});v.priceScale().applyOptions({scaleMargins:{top:.84,bottom:0}});v.setData(source.map(b=>({time:b.time,value:b.volume,color:b.close>=b.open?'rgba(32,216,134,.22)':'rgba(240,93,108,.22)'})) as any)
    }else if(mode==='RS'){
      const l=chart.addSeries(LineSeries,{color:'#54a6ff',lineWidth:2,priceLineVisible:false});l.setData(source.filter(b=>b.rs>0).map(b=>({time:b.time,value:b.rs})) as any)
    }else{
      const v=chart.addSeries(HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'',priceLineVisible:false});v.setData(source.map(b=>({time:b.time,value:b.volume,color:b.close>=b.open?'rgba(32,216,134,.72)':'rgba(240,93,108,.72)'})) as any)
    }
    chart.timeScale().fitContent();return()=>chart.remove()
  },[bars,interval,range,mode,mini])
  return <div className={mini?'dv-minichart':'dv-chart'} ref={ref}/>
}

function DeepVueTerminal(){
  const[payload,setPayload]=useState<Payload|null>(null),[error,setError]=useState('')
  const[page,setPage]=useState<Page>('Screener'),[recipe,setRecipe]=useState('All'),[query,setQuery]=useState('')
  const[sorting,setSorting]=useState<SortingState>(()=>loadLocal('dv-sorts-v1',[{id:'opportunityScore',desc:true},{id:'rsRank',desc:true}]))
  const[visibility,setVisibility]=useState<VisibilityState>(()=>loadLocal('dv-cols-v1',defaultVisibility))
  const[pagination,setPagination]=useState<PaginationState>({pageIndex:0,pageSize:100})
  const[rootLogic,setRootLogic]=useState<Logic>(()=>loadLocal('dv-root-logic','ALL'))
  const[groups,setGroups]=useState<RuleGroup[]>(()=>loadLocal('dv-groups-v1',[]))
  const[customScreens,setCustomScreens]=useState<ScreenState[]>(()=>loadLocal('dv-custom-screens-v1',[]))
  const[activeScreen,setActiveScreen]=useState('Custom'),[builderOpen,setBuilderOpen]=useState(false),[columnsOpen,setColumnsOpen]=useState(false)
  const[watchlist,setWatchlist]=useState<string[]>(()=>loadLocal('stockscout-watchlist',[]))
  const[selectedTicker,setSelectedTicker]=useState(location.hash.replace('#','').toUpperCase())
  const[selectedBars,setSelectedBars]=useState<Bar[]>([]),[chartLoading,setChartLoading]=useState(false)
  const[interval,setInterval]=useState<Interval>('W'),[range,setRange]=useState<Range>('5Y'),[chartMode,setChartMode]=useState<ChartMode>('Price')
  const[gridCount,setGridCount]=useState(16),[gridRange,setGridRange]=useState<Range>('2Y')
  const shardPromises=useRef<Record<string,Promise<Record<string,RawBar[]>>>>({})

  const load=useCallback(()=>fetch(`./data/latest.json?t=${Date.now()}`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}).then((p:Payload)=>{if(!p.universe?.length)throw new Error('Dataset empty');setPayload(p);setError('');setSelectedTicker(t=>t||p.universe[0].ticker)}).catch(e=>setError(String(e))),[])
  useEffect(()=>{load()},[load])
  useEffect(()=>localStorage.setItem('dv-sorts-v1',JSON.stringify(sorting)),[sorting])
  useEffect(()=>localStorage.setItem('dv-cols-v1',JSON.stringify(visibility)),[visibility])
  useEffect(()=>localStorage.setItem('dv-root-logic',JSON.stringify(rootLogic)),[rootLogic])
  useEffect(()=>localStorage.setItem('dv-groups-v1',JSON.stringify(groups)),[groups])
  useEffect(()=>localStorage.setItem('dv-custom-screens-v1',JSON.stringify(customScreens)),[customScreens])
  useEffect(()=>localStorage.setItem('stockscout-watchlist',JSON.stringify(watchlist)),[watchlist])
  useEffect(()=>{if(selectedTicker)history.replaceState(null,'',`${location.pathname}${location.search}#${selectedTicker}`)},[selectedTicker])

  const loadBars=useCallback(async(ticker:string):Promise<Bar[]>=>{
    if(!payload)return[];const shard=payload.chartShards?.[ticker];if(!shard)return[]
    if(!shardPromises.current[shard])shardPromises.current[shard]=fetch(`./data/charts/${shard}`).then(r=>{if(!r.ok)throw new Error(`chart ${r.status}`);return r.json()})
    try{const data=await shardPromises.current[shard],rows=data[ticker]||[];return rows.map(r=>({time:r[0],open:r[1],high:r[2],low:r[3],close:r[4],volume:r[5],rs:r[6]}))}catch{return[]}
  },[payload])

  const universe=payload?.universe||[],selected=universe.find(s=>s.ticker===selectedTicker)||universe[0]
  useEffect(()=>{let live=true;if(!selected){setSelectedBars([]);return}setChartLoading(true);loadBars(selected.ticker).then(x=>live&&setSelectedBars(x)).finally(()=>live&&setChartLoading(false));return()=>{live=false}},[selected?.ticker,loadBars])
  const toggleWatch=(ticker:string)=>setWatchlist(w=>w.includes(ticker)?w.filter(x=>x!==ticker):[...w,ticker])

  const filtered=useMemo(()=>universe.filter(s=>{
    if(page==='Watchlist'&&!watchlist.includes(s.ticker))return false
    if(page==='Changes'&&!s.changedToday)return false
    const q=query.trim().toUpperCase();if(q&&!s.ticker.includes(q)&&!tagsOf(s).join(' ').toUpperCase().includes(q)&&(s.changeLabels||[]).join(' ').toUpperCase().includes(q)===false)return false
    if(recipe!=='All'&&!tagsOf(s).includes(recipe))return false
    return matchesGroups(s,groups,rootLogic)
  }),[universe,page,watchlist,query,recipe,groups,rootLogic])
  const sortedData=useMemo(()=>applyMultiSort(filtered,sorting),[filtered,sorting])
  useEffect(()=>setPagination(p=>({...p,pageIndex:0})),[page,recipe,query,groups,rootLogic,sorting])

  const columns=useMemo(()=>[
    helper.display({id:'watch',header:'',enableSorting:false,cell:({row})=><button className={`dv-star ${watchlist.includes(row.original.ticker)?'on':''}`} onClick={e=>{e.stopPropagation();toggleWatch(row.original.ticker)}}>★</button>}),
    helper.accessor('ticker',{header:'Ticker',cell:i=><b className="dv-ticker">{i.getValue()}</b>}),
    helper.accessor(s=>opp(s),{id:'opportunityScore',header:'Opportunity',cell:i=><b className="dv-score">{fmt(i.getValue(),0)}</b>}),
    helper.accessor('changeImpact',{header:'Today Δ',cell:i=><b className={num(i.getValue())>0?'dv-good':num(i.getValue())<0?'dv-bad':''}>{num(i.getValue())?signed(i.getValue(),0):'—'}</b>}),
    helper.display({id:'todaySignals',header:'What changed',enableSorting:false,cell:({row})=><div className="dv-changechips">{(row.original.changeLabels||[]).slice(0,2).map(x=><span key={x}>{x}</span>)}</div>}),
    helper.accessor(s=>setupOf(s),{id:'primarySetup',header:'Primary setup',cell:i=><span className="dv-primary">{i.getValue()}</span>}),
    helper.accessor('confluence',{header:'Conf',cell:i=>fmt(i.getValue(),0)}),
    helper.accessor('freshnessScore',{header:'Fresh',cell:i=>fmt(i.getValue(),0)}),
    helper.accessor('rsRank',{header:'RS Rank',cell:i=><b className={num(i.getValue())>=90?'dv-good':''}>{fmt(i.getValue(),0)}</b>}),
    helper.accessor('rsRankDelta',{header:'Δ RS',cell:i=><span className={num(i.getValue())>0?'dv-good':num(i.getValue())<0?'dv-bad':''}>{num(i.getValue())?signed(i.getValue(),0):'—'}</span>}),
    helper.accessor('rsAcceleration',{header:'RS Accel',cell:i=><span className={num(i.getValue())>0?'dv-good':'dv-bad'}>{fmt(i.getValue(),2)}</span>}),
    helper.accessor('stage',{header:'Stage'}),helper.accessor('stage2AgeWeeks',{header:'S2 age',cell:i=>`${fmt(i.getValue(),1)}w`}),helper.accessor('trendTemplatePasses',{header:'TT',cell:i=>`${fmt(i.getValue(),0)}/8`}),
    helper.accessor('return3m',{header:'3M',cell:i=>signed(i.getValue())}),helper.accessor('prior9mReturn',{header:'Prior 9M',cell:i=>signed(i.getValue())}),
    helper.accessor('volumeRatio',{header:'Vol x',cell:i=><span className={num(i.getValue())>=1.5?'dv-good':''}>{fmt(i.getValue(),2)}x</span>}),helper.accessor('breakoutPct',{header:'Breakout',cell:i=>signed(i.getValue())}),
    helper.accessor('vcpScore',{header:'VCP',cell:i=>fmt(i.getValue(),0)}),helper.accessor('atrCompression',{header:'ATR comp',cell:i=>`${fmt(i.getValue(),0)}%`}),helper.accessor('tightRange20',{header:'20D range',cell:i=>`${fmt(i.getValue(),1)}%`}),
    helper.accessor('baseWeeks',{header:'Base w',cell:i=>fmt(i.getValue(),0)}),helper.accessor('distance10w',{header:'10W',cell:i=>signed(i.getValue())}),helper.accessor('distance30w',{header:'30W',cell:i=>signed(i.getValue())}),helper.accessor('rsFromHigh',{header:'RS vs High',cell:i=>signed(i.getValue())}),
    helper.accessor('structureScore',{header:'Structure',cell:i=>fmt(i.getValue(),0)}),helper.accessor('baseScore',{header:'Base',cell:i=>fmt(i.getValue(),0)}),helper.accessor('triggerScore',{header:'Trigger',cell:i=>fmt(i.getValue(),0)}),helper.accessor('neglectedScore',{header:'Neglected',cell:i=>fmt(i.getValue(),0)}),
    helper.accessor('avgDollarVolume20',{header:'$ Vol',cell:i=>compact(i.getValue())}),helper.accessor('fundamentalSupport',{header:'Fund',cell:i=>i.getValue()==null?'—':i.getValue()?'✓':'×'}),
  ],[watchlist])
  const table=useReactTable({data:sortedData,columns,state:{pagination,columnVisibility:visibility},onPaginationChange:setPagination,onColumnVisibilityChange:setVisibility,getCoreRowModel:getCoreRowModel(),getPaginationRowModel:getPaginationRowModel()})
  const cycleSort=(id:string)=>setSorting(prev=>{const i=prev.findIndex(x=>x.id===id);if(i<0)return[...prev,{id,desc:true}];if(prev[i].desc)return prev.map((x,n)=>n===i?{...x,desc:false}:x);return prev.filter((_,n)=>n!==i)})
  const moveSort=(id:string,dir:-1|1)=>setSorting(s=>{const a=[...s],i=a.findIndex(x=>x.id===id),j=i+dir;if(i<0||j<0||j>=a.length)return s;[a[i],a[j]]=[a[j],a[i]];return a})

  const allScreens=[...builtInScreens,...customScreens]
  const applyScreen=(screen:ScreenState)=>{setRootLogic(screen.rootLogic);setGroups(screen.groups);setSorting(screen.sorting);setVisibility(Object.keys(screen.visibility||{}).length?screen.visibility:defaultVisibility);setRecipe(screen.recipe||'All');setQuery(screen.query||'');setPagination({pageIndex:0,pageSize:screen.pageSize||100});setActiveScreen(screen.name)}
  const saveScreen=()=>{const name=window.prompt('Screen name',activeScreen==='Custom'?'My Screen':activeScreen);if(!name)return;const state:ScreenState={name,rootLogic,groups,sorting,visibility,recipe,query,pageSize:pagination.pageSize};setCustomScreens(old=>[...old.filter(s=>s.name!==name),state]);setActiveScreen(name)}
  const deleteScreen=()=>{if(builtInScreens.some(s=>s.name===activeScreen))return;setCustomScreens(x=>x.filter(s=>s.name!==activeScreen));setActiveScreen('Custom')}
  const addGroup=()=>setGroups(g=>[...g,makeGroup('ALL',[makeRule('rsRank')])])
  const updateGroup=(id:string,fn:(g:RuleGroup)=>RuleGroup)=>setGroups(gs=>gs.map(g=>g.id===id?fn(g):g))
  const removeGroup=(id:string)=>setGroups(gs=>gs.filter(g=>g.id!==id))
  const exportCsv=()=>{const cols=table.getAllLeafColumns().filter(c=>!['watch','todaySignals'].includes(c.id)&&c.getIsVisible());const lines=[cols.map(c=>c.id).join(','),...sortedData.map(s=>cols.map(c=>JSON.stringify((s as any)[c.id]??(c.id==='opportunityScore'?opp(s):c.id==='primarySetup'?setupOf(s):''))).join(','))];const u=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'})),a=document.createElement('a');a.href=u;a.download=`stockscout-${activeScreen.replace(/\W+/g,'-').toLowerCase()}-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(u)}

  if(!payload)return <div className="dv-loading">{error||'Loading StockScout…'}</div>
  const m=payload.market||{},daily=m.dailyChanges||{},ageH=Math.max(0,Math.round((Date.now()-new Date(payload.generatedAt).getTime())/3600000))
  return <div className="dv-app">
    <header className="dv-top"><div className="dv-brand">◉ <b>STOCKSCOUT</b><small>DEEP SCREEN</small></div><nav>{(['Screener','Grid','Changes','Watchlist','Market'] as Page[]).map(p=><button key={p} className={page===p?'active':''} onClick={()=>setPage(p)}>{p}{p==='Changes'&&daily.changed?` ${daily.changed}`:''}</button>)}</nav><div className="dv-live"><b>{m.regime||'UNKNOWN'}</b><span>{universe.length.toLocaleString()} stocks</span><span>{ageH}h old</span><button onClick={load}>↻</button></div></header>

    {page==='Market'?<Market universe={universe} market={m}/>:<>
      <section className="dv-screenbar"><div className="dv-screenpick"><span>SCREEN</span><select value={allScreens.some(s=>s.name===activeScreen)?activeScreen:''} onChange={e=>{const s=allScreens.find(x=>x.name===e.target.value);if(s)applyScreen(s)}}><option value="">Custom</option>{builtInScreens.map(s=><option key={s.name}>{s.name}</option>)}{customScreens.length>0&&<optgroup label="My screens">{customScreens.map(s=><option key={s.name}>{s.name}</option>)}</optgroup>}</select><button onClick={saveScreen}>Save as…</button>{customScreens.some(s=>s.name===activeScreen)&&<button className="danger" onClick={deleteScreen}>Delete</button>}</div><div className="dv-screenmeta"><b>{activeScreen}</b><span>{groups.reduce((n,g)=>n+g.rules.length,0)} rules</span><span>{sorting.length} sort levels</span><span>{filtered.length.toLocaleString()} matches</span></div></section>

      <section className="dv-recipes">{recipeTabs.map(t=><button key={t} className={recipe===t?'active':''} onClick={()=>setRecipe(t)}>{t}<small>{t==='All'?universe.length:universe.filter(s=>tagsOf(s).includes(t)).length}</small></button>)}</section>

      <section className="dv-sortbar"><span>MULTI-SORT</span>{sorting.length?sorting.map((s,i)=><div className="dv-sortchip" key={s.id}><b>{i+1}</b><em>{String(table.getColumn(s.id)?.columnDef.header||s.id)}</em><button onClick={()=>cycleSort(s.id)}>{s.desc?'↓':'↑'}</button><button disabled={i===0} onClick={()=>moveSort(s.id,-1)}>‹</button><button disabled={i===sorting.length-1} onClick={()=>moveSort(s.id,1)}>›</button><button onClick={()=>setSorting(x=>x.filter(y=>y.id!==s.id))}>×</button></div>):<i>Click headers to build #1 → #2 → #3 priorities</i>}<button className="dv-clear" onClick={()=>setSorting([])}>Clear</button></section>

      <section className="dv-toolbar"><button className={builderOpen?'active':''} onClick={()=>setBuilderOpen(x=>!x)}>⌁ ANY / ALL Builder <b>{groups.reduce((n,g)=>n+g.rules.length,0)}</b></button><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ticker, setup or today's change…"/><button className={columnsOpen?'active':''} onClick={()=>setColumnsOpen(x=>!x)}>▦ Columns</button><select value={pagination.pageSize} onChange={e=>setPagination({pageIndex:0,pageSize:Number(e.target.value)})}><option>50</option><option>100</option><option>250</option></select><button onClick={exportCsv}>⇩ CSV</button></section>

      {builderOpen&&<FilterBuilder rootLogic={rootLogic} setRootLogic={setRootLogic} groups={groups} setGroups={setGroups} addGroup={addGroup} updateGroup={updateGroup} removeGroup={removeGroup}/>} 
      {columnsOpen&&<ColumnPicker table={table} setVisibility={setVisibility}/>} 

      {page==='Grid'?<GridView stocks={sortedData} count={gridCount} setCount={setGridCount} range={gridRange} setRange={setGridRange} loadBars={loadBars} selected={selected?.ticker} onSelect={setSelectedTicker}/>:<main className="dv-work"><div className="dv-tablebox"><div className="dv-tablewrap"><table><thead>{table.getHeaderGroups().map(hg=><tr key={hg.id}>{hg.headers.map(h=>{const si=sorting.findIndex(s=>s.id===h.column.id),ss=si>=0?sorting[si]:null;return <th key={h.id} className={si>=0?'sorted':''} onClick={()=>h.column.getCanSort()&&cycleSort(h.column.id)}>{flexRender(h.column.columnDef.header,h.getContext())}{si>=0&&<><i>{si+1}</i><b>{ss?.desc?'↓':'↑'}</b></>}</th>})}</tr>)}</thead><tbody>{table.getRowModel().rows.map(r=><tr key={r.id} className={r.original.ticker===selected?.ticker?'selected':''} onClick={()=>setSelectedTicker(r.original.ticker)}>{r.getVisibleCells().map(c=><td key={c.id}>{flexRender(c.column.columnDef.cell,c.getContext())}</td>)}</tr>)}</tbody></table></div><footer><span>{page==='Changes'?'Only meaningful changes vs previous scan':'First clicked column is priority #1; next is #2'}</span><div><button disabled={!table.getCanPreviousPage()} onClick={()=>table.previousPage()}>←</button><b>{pagination.pageIndex+1}/{Math.max(1,table.getPageCount())}</b><button disabled={!table.getCanNextPage()} onClick={()=>table.nextPage()}>→</button></div></footer></div>{selected&&<Detail stock={selected} bars={selectedBars} loading={chartLoading} interval={interval} setInterval={setInterval} range={range} setRange={setRange} mode={chartMode} setMode={setChartMode} watched={watchlist.includes(selected.ticker)} toggleWatch={()=>toggleWatch(selected.ticker)}/>}</main>}
    </>}
  </div>
}

function FilterBuilder({rootLogic,setRootLogic,groups,setGroups,addGroup,updateGroup,removeGroup}:{rootLogic:Logic;setRootLogic:(v:Logic)=>void;groups:RuleGroup[];setGroups:(v:RuleGroup[])=>void;addGroup:()=>void;updateGroup:(id:string,fn:(g:RuleGroup)=>RuleGroup)=>void;removeGroup:(id:string)=>void}){
  return <section className="dv-builder"><div className="dv-builderhead"><div><b>GROUP JOIN</b><button className={rootLogic==='ALL'?'active':''} onClick={()=>setRootLogic('ALL')}>ALL groups</button><button className={rootLogic==='ANY'?'active':''} onClick={()=>setRootLogic('ANY')}>ANY group</button></div><div><button onClick={addGroup}>+ Group</button><button onClick={()=>setGroups([])}>Clear rules</button></div></div>{groups.length===0?<div className="dv-builderempty">No custom rules. Add a group or load a saved screen.</div>:groups.map((g,gi)=><div className="dv-rulegroup" key={g.id}><div className="dv-groupjoin"><b>GROUP {gi+1}</b><button className={g.logic==='ALL'?'active':''} onClick={()=>updateGroup(g.id,x=>({...x,logic:'ALL'}))}>ALL</button><button className={g.logic==='ANY'?'active':''} onClick={()=>updateGroup(g.id,x=>({...x,logic:'ANY'}))}>ANY</button><span>{g.logic==='ALL'?'Every rule must pass':'At least one rule must pass'}</span><button className="danger" onClick={()=>removeGroup(g.id)}>×</button></div>{g.rules.map(r=>{const def=fieldDefs.find(x=>x.id===r.field)||fieldDefs[0],ops=opsByKind[def.kind];return <div className="dv-rule" key={r.id}><select value={r.field} onChange={e=>{const d=fieldDefs.find(x=>x.id===e.target.value)||fieldDefs[0];updateGroup(g.id,x=>({...x,rules:x.rules.map(q=>q.id===r.id?{...q,field:d.id,op:d.defaultOp,value:''}:q)}))}}>{fieldDefs.map(f=><option value={f.id} key={f.id}>{f.label}</option>)}</select><select value={r.op} onChange={e=>updateGroup(g.id,x=>({...x,rules:x.rules.map(q=>q.id===r.id?{...q,op:e.target.value as any}:q)}))}>{ops.map(o=><option key={o}>{o}</option>)}</select>{!['true','false'].includes(r.op)&&<input value={r.value} placeholder={def.placeholder||'value'} onChange={e=>updateGroup(g.id,x=>({...x,rules:x.rules.map(q=>q.id===r.id?{...q,value:e.target.value}:q)}))}/>}<button onClick={()=>updateGroup(g.id,x=>({...x,rules:x.rules.filter(q=>q.id!==r.id)}))}>×</button></div>})}<button className="dv-addrule" onClick={()=>updateGroup(g.id,x=>({...x,rules:[...x.rules,makeRule('rsRank')]}))}>+ Rule</button></div>)}</section>
}

function ColumnPicker({table,setVisibility}:{table:any;setVisibility:(v:VisibilityState)=>void}){
  const sets:Record<string,VisibilityState>={Core:defaultVisibility,Early:{...defaultVisibility,prior9mReturn:true,stage2AgeWeeks:true,neglectedScore:true,atrCompression:false,vcpScore:false},Breakout:{...defaultVisibility,breakoutPct:true,volumeRatio:true,triggerScore:true,atrCompression:true},Base:{...defaultVisibility,vcpScore:true,atrCompression:true,tightRange20:true,baseWeeks:true,baseScore:true},Changes:{...defaultVisibility,changeImpact:true,opportunityDelta:true,rsRankDelta:true,todaySignals:true}}
  return <section className="dv-colpicker"><div className="dv-colsets">{Object.entries(sets).map(([name,v])=><button key={name} onClick={()=>setVisibility(v)}>{name}</button>)}<button onClick={()=>table.getAllLeafColumns().forEach((c:any)=>c.toggleVisibility(true))}>All</button></div>{table.getAllLeafColumns().filter((c:any)=>c.id!=='watch').map((c:any)=><label key={c.id}><input type="checkbox" checked={c.getIsVisible()} onChange={c.getToggleVisibilityHandler()}/>{String(c.columnDef.header||c.id)}</label>)}</section>
}

function GridView({stocks,count,setCount,range,setRange,loadBars,selected,onSelect}:{stocks:Stock[];count:number;setCount:(n:number)=>void;range:Range;setRange:(r:Range)=>void;loadBars:(t:string)=>Promise<Bar[]>;selected?:string;onSelect:(t:string)=>void}){
  return <main className="dv-gridview"><header><div><b>RAPID REVIEW</b><span>{Math.min(count,stocks.length)} of {stocks.length.toLocaleString()} current matches · same filter + multi-sort stack</span></div><div><select value={count} onChange={e=>setCount(Number(e.target.value))}><option>12</option><option>16</option><option>24</option><option>36</option><option>48</option></select>{(['6M','1Y','2Y','5Y'] as Range[]).map(r=><button className={range===r?'active':''} key={r} onClick={()=>setRange(r)}>{r}</button>)}</div></header><section className="dv-chartgrid">{stocks.slice(0,count).map(s=><MiniCard key={s.ticker} stock={s} range={range} loadBars={loadBars} selected={selected===s.ticker} onClick={()=>onSelect(s.ticker)}/>)}</section></main>
}
function MiniCard({stock,range,loadBars,selected,onClick}:{stock:Stock;range:Range;loadBars:(t:string)=>Promise<Bar[]>;selected:boolean;onClick:()=>void}){
  const[bars,setBars]=useState<Bar[]>([]);useEffect(()=>{let live=true;loadBars(stock.ticker).then(x=>live&&setBars(x));return()=>{live=false}},[stock.ticker,loadBars])
  return <article className={`dv-minicard ${selected?'selected':''}`} onClick={onClick}><header><div><b>{stock.ticker}</b><span>{setupOf(stock)}</span></div><strong>{opp(stock)}</strong></header><div className="dv-miniinfo"><span>RS <b>{fmt(stock.rsRank,0)}</b></span><span>Vol <b>{fmt(stock.volumeRatio,1)}x</b></span><span>10W <b>{signed(stock.distance10w)}</b></span>{stock.changeImpact!==undefined&&num(stock.changeImpact)!==0&&<span className={num(stock.changeImpact)>0?'dv-good':'dv-bad'}>Today <b>{signed(stock.changeImpact,0)}</b></span>}</div>{bars.length?<PriceChart bars={bars} interval="W" range={range} mini/>:<div className="dv-miniload">loading chart…</div>}<footer>{(stock.changeLabels||[]).slice(0,2).map(x=><span key={x}>{x}</span>)}</footer></article>
}

function Detail({stock,bars,loading,interval,setInterval,range,setRange,mode,setMode,watched,toggleWatch}:{stock:Stock;bars:Bar[];loading:boolean;interval:Interval;setInterval:(v:Interval)=>void;range:Range;setRange:(v:Range)=>void;mode:ChartMode;setMode:(v:ChartMode)=>void;watched:boolean;toggleWatch:()=>void}){
  const dims=[['Structure',stock.structureScore],['RS',stock.rsScore],['Base',stock.baseScore],['Trigger',stock.triggerScore],['Freshness',stock.freshnessScore],['Neglected',stock.neglectedScore]] as [string,number|undefined][]
  return <aside className="dv-detail"><div className="dv-detailhead"><button className={`dv-star big ${watched?'on':''}`} onClick={toggleWatch}>★</button><div><h1>{stock.ticker}</h1><span>Stage {stock.stage} · {stock.stageName}</span></div><div className="dv-opp"><small>OPPORTUNITY</small><b>{opp(stock)}</b>{num(stock.opportunityDelta)!==0&&<span className={num(stock.opportunityDelta)>0?'dv-good':'dv-bad'}>{signed(stock.opportunityDelta,0)}</span>}</div><div className="dv-price"><b>${fmt(stock.price,2)}</b><span>{signed(stock.change20d)} 20D</span></div></div>
    {(stock.changeLabels||[]).length>0&&<div className="dv-todaybox"><b>WHAT CHANGED</b>{stock.changeLabels!.map(x=><span key={x}>{x}</span>)}</div>}
    <div className="dv-tags">{tagsOf(stock).map(t=><span key={t} className={t.startsWith('⚠')?'warn':''}>{t}</span>)}</div>
    <div className="dv-chartcontrols"><div>{(['Price','RS','Volume'] as ChartMode[]).map(x=><button className={mode===x?'active':''} onClick={()=>setMode(x)} key={x}>{x}</button>)}</div><div>{(['D','W'] as Interval[]).map(x=><button className={interval===x?'active':''} onClick={()=>setInterval(x)} key={x}>{x==='D'?'Daily':'Weekly'}</button>)}</div><div>{(['3M','6M','1Y','2Y','5Y'] as Range[]).map(x=><button className={range===x?'active':''} onClick={()=>setRange(x)} key={x}>{x}</button>)}</div></div>
    <div className="dv-chartbox">{loading?<div className="dv-chartmsg">Loading 5Y history…</div>:bars.length?<PriceChart bars={bars} interval={interval} range={range} mode={mode}/>:<div className="dv-chartmsg">Chart unavailable</div>}</div>
    <div className="dv-kpis"><K l="RS Rank" v={fmt(stock.rsRank,0)} d={stock.rsRankDelta}/><K l="RS Δ" v={fmt(stock.rsAcceleration,2)}/><K l="TT" v={`${fmt(stock.trendTemplatePasses,0)}/8`}/><K l="S2 age" v={`${fmt(stock.stage2AgeWeeks,1)}w`}/><K l="Vol" v={`${fmt(stock.volumeRatio,2)}x`} d={stock.volumeRatioDelta}/><K l="Breakout" v={signed(stock.breakoutPct)}/><K l="10W" v={signed(stock.distance10w)}/><K l="30W" v={signed(stock.distance30w)}/></div>
    <div className="dv-dims">{dims.map(([n,v])=><div key={n}><span>{n}</span><i><b style={{width:`${Math.max(0,Math.min(100,num(v)))}%`}}/></i><strong>{fmt(v,0)}</strong></div>)}</div>
  </aside>
}
function K({l,v,d}:{l:string;v:string;d?:number}){return <span><small>{l}</small><b>{v}</b>{d!==undefined&&num(d)!==0&&<em className={num(d)>0?'dv-good':'dv-bad'}>{signed(d,0)}</em>}</span>}
function Market({universe,market}:{universe:Stock[];market:Record<string,any>}){const daily=market.dailyChanges||{},stages=[1,2,3,4].map(s=>[s,universe.filter(x=>x.stage===s).length] as const),leaders=[...universe].sort((a,b)=>opp(b)-opp(a)).slice(0,20),changes=[...universe].filter(x=>x.changedToday).sort((a,b)=>num(b.changeImpact)-num(a.changeImpact)).slice(0,20);return <main className="dv-market"><section><h2>Market structure</h2><div className="dv-marketgrid">{stages.map(([s,n])=><div key={s}><b>{n}</b><span>Stage {s}</span></div>)}</div><p>Regime <b>{market.regime||'Unknown'}</b> · Stage 2 breadth <b>{market.stage2Pct??0}%</b></p></section><section><h2>What changed today</h2><div className="dv-marketgrid"><div><b>{daily.changed??0}</b><span>Changed</span></div><div><b>{daily.newSetups??0}</b><span>New setups</span></div><div><b>{daily.stageChanges??0}</b><span>Stage changes</span></div><div><b>{daily.rsMovers??0}</b><span>RS movers</span></div></div>{changes.slice(0,8).map(s=><div className="dv-leader" key={s.ticker}><b>{s.ticker}</b><span>{(s.changeLabels||[])[0]||'Changed'}</span><strong className={num(s.changeImpact)>0?'dv-good':'dv-bad'}>{signed(s.changeImpact,0)}</strong></div>)}</section><section><h2>Top opportunity</h2>{leaders.slice(0,12).map(s=><div className="dv-leader" key={s.ticker}><b>{s.ticker}</b><span>{setupOf(s)}</span><em>RS {fmt(s.rsRank,0)}</em><strong>{opp(s)}</strong></div>)}</section></main>}

export default DeepVueTerminal
