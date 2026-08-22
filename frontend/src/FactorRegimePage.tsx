import {useEffect,useMemo,useState} from 'react'
import './factor-regime.css'

type Regime='STRONG'|'DETERIORATING'|'RECOVERY'|'DEEPENING_DROUGHT'
type FactorPoint={month:string;premiumPct:number}
type Drought={active:boolean;startMonth:string|null;endMonth:string|null;months:number;duration:string;ongoing:boolean}
type FactorLatest={
  month:string
  premiumPct:number
  delta1mPp:number|null
  delta6mPp:number|null
  delta12mPp:number|null
  slope12mPpPerMonth:number|null
  recent12mPremiumPct:number|null
  historicalPercentile:number|null
  regime:Regime
}
type Factor={
  id:string
  sourceCode:string
  label:string
  latest:FactorLatest
  currentDrought:Drought
  longestDrought:Drought
  series:FactorPoint[]
}
type FactorPayload={
  schemaVersion:number
  generatedAt:string|null
  status?:string
  source:{provider:string;ff5Url?:string;momentumUrl?:string}
  method:{windowMonths:number;annualization:string;droughtDefinition:string;deltaDefinition:string;stockScoutImpact:string}
  range:{firstMonth:string;lastMonth:string;rollingFirstMonth:string;alignedMonths:number}|null
  commonScale:{minPct:number;maxPct:number}|null
  summary:{mostImproving12m:string[];activeDroughts:number}|null
  factors:Factor[]
}

const DATA_URL='./data/factors/factor-regime.json'
const fmt=(value:number|null|undefined,digits=2)=>value==null||!Number.isFinite(value)?'—':value.toFixed(digits)
const signed=(value:number|null|undefined,digits=2)=>value==null||!Number.isFinite(value)?'—':`${value>=0?'+':''}${value.toFixed(digits)}`
const monthIndex=(month:string)=>{const[year,value]=month.split('-').map(Number);return year*12+(value-1)}
const monthYear=(month:string|null)=>month?`${month.slice(5)}/${month.slice(0,4)}`:'—'
const regimeLabel:Record<Regime,string>={
  STRONG:'Strong',
  DETERIORATING:'Deteriorating',
  RECOVERY:'Recovery',
  DEEPENING_DROUGHT:'Deepening drought',
}

function formatGenerated(value:string|null){
  if(!value)return 'not built yet'
  const date=new Date(value)
  return Number.isNaN(date.getTime())?value:date.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})
}

function linePath(points:FactorPoint[],x:(month:string)=>number,y:(value:number)=>number){
  return points.map((point,index)=>`${index?'L':'M'}${x(point.month).toFixed(2)},${y(point.premiumPct).toFixed(2)}`).join(' ')
}

function FactorDroughtChart({payload}:{payload:FactorPayload}){
  const factors=payload.factors
  if(!factors.length)return null
  const width=1180
  const left=180
  const right=34
  const top=24
  const panelHeight=108
  const bottom=42
  const height=top+factors.length*panelHeight+bottom
  const allPoints=factors.flatMap(factor=>factor.series)
  const xMin=Math.min(...allPoints.map(point=>monthIndex(point.month)))
  const xMax=Math.max(...allPoints.map(point=>monthIndex(point.month)))
  const observed=allPoints.map(point=>point.premiumPct)
  const rawMin=payload.commonScale?.minPct??Math.min(...observed)
  const rawMax=payload.commonScale?.maxPct??Math.max(...observed)
  const yMin=Math.min(rawMin,-0.25)
  const yMax=Math.max(rawMax,0.25)
  const x=(month:string)=>left+((monthIndex(month)-xMin)/Math.max(1,xMax-xMin))*(width-left-right)
  const firstYear=Math.floor(xMin/12)
  const lastYear=Math.floor(xMax/12)
  const firstTick=Math.ceil(firstYear/10)*10
  const ticks:number[]=[]
  for(let year=firstTick;year<=lastYear;year+=10)ticks.push(year)

  return <div className="fr-chart-scroll">
    <svg className="fr-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trailing ten-year annualised factor premiums with longest droughts shaded">
      {factors.map((factor,index)=>{
        const panelTop=top+index*panelHeight
        const innerTop=panelTop+10
        const innerBottom=panelTop+panelHeight-18
        const y=(value:number)=>innerBottom-((value-yMin)/Math.max(.0001,yMax-yMin))*(innerBottom-innerTop)
        const zeroY=y(0)
        const longest=factor.longestDrought
        const shadeStart=longest.startMonth?x(longest.startMonth):null
        const shadeEnd=longest.endMonth?x(longest.endMonth):null
        const latest=factor.series[factor.series.length-1]
        return <g key={factor.id}>
          <text className="fr-chart-label" x={12} y={panelTop+31}>{factor.label}</text>
          <text className="fr-chart-code" x={12} y={panelTop+49}>{factor.sourceCode}</text>
          <line className="fr-panel-divider" x1={left} x2={width-right} y1={panelTop+panelHeight-1} y2={panelTop+panelHeight-1}/>
          {shadeStart!=null&&shadeEnd!=null&&<>
            <rect className="fr-drought-shade" x={shadeStart} y={innerTop} width={Math.max(5,shadeEnd-shadeStart)} height={innerBottom-innerTop}/>
            <text className="fr-drought-note" x={Math.min(width-right-90,shadeStart+6)} y={innerBottom-7}>{longest.duration}{longest.ongoing?' below zero · ongoing':' below zero'}</text>
          </>}
          <line className="fr-zero" x1={left} x2={width-right} y1={zeroY} y2={zeroY}/>
          <text className="fr-zero-label" x={left-8} y={zeroY+3}>0%</text>
          <path className={`fr-factor-line ${factor.latest.premiumPct<0?'negative':''}`} d={linePath(factor.series,x,y)}/>
          {latest&&<circle className={`fr-latest-dot ${latest.premiumPct<0?'negative':''}`} cx={x(latest.month)} cy={y(latest.premiumPct)} r={3.4}/>} 
          <text className="fr-panel-value" x={width-right} y={panelTop+22} textAnchor="end">{signed(factor.latest.premiumPct)}%</text>
        </g>
      })}
      {ticks.map(year=>{
        const tickX=left+((year*12-xMin)/Math.max(1,xMax-xMin))*(width-left-right)
        return <g key={year}>
          <line className="fr-year-grid" x1={tickX} x2={tickX} y1={top} y2={height-bottom+4}/>
          <text className="fr-year-label" x={tickX} y={height-15} textAnchor="middle">{year}</text>
        </g>
      })}
    </svg>
  </div>
}

function RegimeCard({factor}:{factor:Factor}){
  const improving=(factor.latest.delta12mPp??0)>0
  return <article className={`fr-factor-card ${factor.latest.regime.toLowerCase()}`}>
    <header>
      <div><small>{factor.sourceCode}</small><h3>{factor.label}</h3></div>
      <span className={`fr-regime ${factor.latest.regime.toLowerCase()}`}>{regimeLabel[factor.latest.regime]}</span>
    </header>
    <div className="fr-premium">
      <strong>{signed(factor.latest.premiumPct)}%</strong>
      <span>10Y annualised premium</span>
    </div>
    <div className="fr-change-row">
      <span><small>Δ 1M</small><b className={(factor.latest.delta1mPp??0)>=0?'up':'down'}>{signed(factor.latest.delta1mPp)} pp</b></span>
      <span><small>Δ 6M</small><b className={(factor.latest.delta6mPp??0)>=0?'up':'down'}>{signed(factor.latest.delta6mPp)} pp</b></span>
      <span><small>Δ 12M</small><b className={improving?'up':'down'}>{signed(factor.latest.delta12mPp)} pp</b></span>
    </div>
    <div className="fr-drought-grid">
      <span><small>Current drought</small><b>{factor.currentDrought.active?factor.currentDrought.duration:'None'}</b><em>{factor.currentDrought.active?`since ${monthYear(factor.currentDrought.startMonth)}`:'premium ≥ 0%'}</em></span>
      <span><small>Historical max</small><b>{factor.longestDrought.duration}</b><em>{monthYear(factor.longestDrought.startMonth)} → {factor.longestDrought.ongoing?'now':monthYear(factor.longestDrought.endMonth)}</em></span>
    </div>
    <footer>
      <span>Recent 12M factor <b>{signed(factor.latest.recent12mPremiumPct)}%</b></span>
      <span>Historical pctile <b>{fmt(factor.latest.historicalPercentile,0)}</b></span>
    </footer>
  </article>
}

export default function FactorRegimePage(){
  const[payload,setPayload]=useState<FactorPayload|null>(null)
  const[loading,setLoading]=useState(true)
  const[error,setError]=useState('')
  const[nonce,setNonce]=useState(0)

  useEffect(()=>{
    let cancelled=false
    setLoading(true)
    setError('')
    fetch(`${DATA_URL}?v=${nonce}`,{cache:nonce?'no-store':'default'})
      .then(response=>{if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.json() as Promise<FactorPayload>})
      .then(data=>{if(!cancelled)setPayload(data)})
      .catch(reason=>{if(!cancelled)setError(reason instanceof Error?reason.message:String(reason))})
      .finally(()=>{if(!cancelled)setLoading(false)})
    return()=>{cancelled=true}
  },[nonce])

  const factorById=useMemo(()=>new Map((payload?.factors??[]).map(factor=>[factor.id,factor])),[payload])
  const improving=payload?.summary?.mostImproving12m.map(id=>factorById.get(id)).filter((factor):factor is Factor=>Boolean(factor))??[]
  const ready=Boolean(payload?.factors?.length&&payload.range)

  return <main className="fr-app">
    <section className="fr-hero">
      <div>
        <small>KENNETH R. FRENCH · SIX FACTORS · READ-ONLY</small>
        <h1>Factor Regime</h1>
        <p>Trailing 10-year factor premiums, drought duration and the direction of change — on one common scale.</p>
      </div>
      <div className="fr-meta">
        <span><small>Data through</small><b>{payload?.range?.lastMonth??'—'}</b></span>
        <span><small>Built</small><b>{formatGenerated(payload?.generatedAt??null)}</b></span>
        <button onClick={()=>setNonce(value=>value+1)} disabled={loading}>{loading?'Loading…':'↻ Refresh'}</button>
      </div>
    </section>

    {error&&<section className="fr-state error"><b>Factor data unavailable</b><span>{error}</span><button onClick={()=>setNonce(value=>value+1)}>Retry</button></section>}
    {!error&&!loading&&!ready&&<section className="fr-state"><b>Factor engine is installed; first dataset build is pending.</b><span>The Factor Regime Update workflow will replace this bootstrap artifact with current French factor history.</span></section>}
    {loading&&!payload&&<section className="fr-state"><b>Loading factor history…</b></section>}

    {ready&&payload&&<>
      <section className="fr-summary">
        <article><small>Active droughts</small><strong>{payload.summary?.activeDroughts??0}<em>/6</em></strong><span>10Y premium below zero</span></article>
        <article className="wide"><small>Most improving · Δ12M</small><strong>{improving.map(factor=>factor.sourceCode).join(' · ')||'—'}</strong><span>{improving.map(factor=>`${factor.sourceCode} ${signed(factor.latest.delta12mPp)}pp`).join('  |  ')}</span></article>
        <article><small>Window</small><strong>{payload.method.windowMonths/12}Y</strong><span>{payload.method.annualization}</span></article>
      </section>

      <section className="fr-chart-card">
        <header>
          <div><small>SAME SCALE ON EVERY PANEL</small><h2>How long a factor drought lasts</h2></div>
          <span>Shaded area = longest continuous period with trailing 10Y premium below 0%</span>
        </header>
        <FactorDroughtChart payload={payload}/>
      </section>

      <section className="fr-factor-grid">
        {payload.factors.map(factor=><RegimeCard factor={factor} key={factor.id}/>) }
      </section>

      <section className="fr-method">
        <div><small>Definition</small><b>{payload.method.droughtDefinition}</b></div>
        <div><small>Change</small><b>{payload.method.deltaDefinition}</b></div>
        <div><small>Source</small><b>{payload.source.provider}</b></div>
        <div><small>StockScout impact</small><b>None — independent evidence layer</b></div>
      </section>
    </>}
  </main>
}
