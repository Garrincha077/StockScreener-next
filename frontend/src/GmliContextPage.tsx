import {useEffect,useMemo,useState} from 'react'
import './gmli-context.css'

type ScoreRegime={score:number|null;regime:string|null}
type GmliContext={
  schemaVersion:number
  status:string
  generatedAt:string|null
  stockScoutImpact:string
  source:{repository:string;ref:string;reportSchema:string;upstreamRefreshStatus:string;upstreamRefreshPolicy?:string|null}
  consumerContract:{mode:string;reconstructsGmli:boolean;mutatesStockScoutScoring:boolean;lastGoodFallbackAllowed:boolean}
  dataHealth?:{status?:string}
  regime:{
    label:string|null
    tilt:string|null
    provisional?:boolean|null
    money:{version:string;observationMonth:string;availableDate:string;freshness?:string;usdYoYPct:number|null;usdScore:number|null;usdRegime:string|null;fxNeutralYoYPct:number|null;fxNeutralScore:number|null;fxNeutralRegime:string|null;agreement?:string|null}
    funding:{version:string;role:string;observationMonth:string;availableDate:string;score:number|null;regime:string|null;structuralSupportScore?:number|null;observedConditionsScore?:number|null}
    fiscal:{version:string;role:string;observationMonth:string;availableDate:string;score:number|null;regime:string|null;deficitPctGdp?:number|null;fiscalImpulsePp?:number|null;automaticGlobalConvictionWeight?:number|null}
    market:{role:string;month:string;positive:number|null;total:number|null;score0To2:number|null;assetsPositive?:Record<string,boolean>}
  }
  signalRoles?:Record<string,unknown>
  moneyExtremes:{
    version:string
    evidenceTier:string
    scoringEffect:string
    latest:{
      month:string
      available_date:string
      usd_level:{value_pct:number;z:number;percentile:number;band:string}
      fx_neutral_level:{value_pct:number;z:number;percentile:number;band:string}
      usd_accel3:{value_pp:number;z:number;percentile:number;band:string}
      fx_neutral_accel3:{value_pp:number;z:number;percentile:number;band:string}
    }
    rows:Array<Record<string,number|string|null>>
  }
  history:{
    windowMonths:number
    funding:Array<{observation_month:string;available_date:string;score:number;regime:string;structural_support_score?:number;observed_conditions_score?:number}>
    fiscal:Array<{observation_month:string;available_date:string;score:number;regime:string;deficit_pct_gdp?:number;fiscal_impulse_pp?:number}>
    market:Array<{month:string;positive:number;total:number;score_0_2:number;assets_positive?:Record<string,boolean>}>
  }
}

type Point={label:string;value:number}
type Series={label:string;points:Point[];className:string}
const DATA_URL='./data/gmli/gmli-context.json'
const FULL_GMLI_URL='https://garrincha077.github.io/NUEVO/'
const fmt=(value:number|null|undefined,digits=1)=>value==null||!Number.isFinite(value)?'—':value.toFixed(digits)
const signed=(value:number|null|undefined,digits=2)=>value==null||!Number.isFinite(value)?'—':`${value>=0?'+':''}${value.toFixed(digits)}`
const pctile=(value:number|null|undefined)=>value==null||!Number.isFinite(value)?'—':`${Math.round(value)}th`
const monthLabel=(value:string|null|undefined)=>value?`${value.slice(5)}/${value.slice(0,4)}`:'—'
const dateLabel=(value:string|null|undefined)=>{
  if(!value)return '—'
  const date=new Date(value)
  return Number.isNaN(date.getTime())?value:date.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})
}

function scoreTone({score}:ScoreRegime){
  if(score==null)return 'neutral'
  if(score>=60)return 'good'
  if(score<40)return 'bad'
  return 'neutral'
}

function MiniLineChart({series,min,max,zeroLines=[]}:{series:Series[];min:number;max:number;zeroLines?:number[]}){
  const width=900, height=220, left=44, right=18, top=16, bottom=28
  const all=series.flatMap(item=>item.points)
  if(!all.length)return <div className="gmli-empty">History will appear after the first successful GMLI sidecar refresh.</div>
  const count=Math.max(...series.map(item=>item.points.length),1)
  const x=(index:number)=>left+(index/Math.max(1,count-1))*(width-left-right)
  const y=(value:number)=>top+(1-(value-min)/Math.max(.0001,max-min))*(height-top-bottom)
  const path=(points:Point[])=>points.map((point,index)=>`${index?'L':'M'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ')
  const first=all[0]?.label
  const last=all[all.length-1]?.label
  return <div className="gmli-chart-wrap">
    <svg className="gmli-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img">
      {zeroLines.map(value=><g key={value}><line className="gmli-guide" x1={left} x2={width-right} y1={y(value)} y2={y(value)}/><text className="gmli-axis" x={left-7} y={y(value)+4} textAnchor="end">{value}</text></g>)}
      <text className="gmli-axis" x={left-7} y={y(max)+4} textAnchor="end">{max}</text>
      <text className="gmli-axis" x={left-7} y={y(min)+4} textAnchor="end">{min}</text>
      {series.map(item=><path key={item.label} className={`gmli-line ${item.className}`} d={path(item.points)}/>)}
      <text className="gmli-axis" x={left} y={height-7}>{monthLabel(first)}</text>
      <text className="gmli-axis" x={width-right} y={height-7} textAnchor="end">{monthLabel(last)}</text>
    </svg>
  </div>
}

function ExtremeCard({label,value,z,percentile}:{label:string;value:string;z:number|null|undefined;percentile:number|null|undefined}){
  const extreme=Math.abs(z??0)>=2
  return <article className={`gmli-extreme ${extreme?'extreme':''}`}>
    <small>{label}</small><strong>{value}</strong><span>Z {signed(z)} · {pctile(percentile)} percentile</span>
  </article>
}

export default function GmliContextPage(){
  const[payload,setPayload]=useState<GmliContext|null>(null)
  const[loading,setLoading]=useState(true)
  const[error,setError]=useState('')
  const[nonce,setNonce]=useState(0)

  useEffect(()=>{
    let cancelled=false
    setLoading(true);setError('')
    fetch(`${DATA_URL}?v=${nonce}`,{cache:nonce?'no-store':'default'})
      .then(response=>{if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.json() as Promise<GmliContext>})
      .then(data=>{if(!cancelled)setPayload(data)})
      .catch(reason=>{if(!cancelled)setError(reason instanceof Error?reason.message:String(reason))})
      .finally(()=>{if(!cancelled)setLoading(false)})
    return()=>{cancelled=true}
  },[nonce])

  const charts=useMemo(()=>{
    if(!payload)return null
    const moneyRows=(payload.moneyExtremes.rows??[]).slice(-60)
    const fundingRows=(payload.history.funding??[]).slice(-60)
    const fiscalRows=(payload.history.fiscal??[]).slice(-60)
    const marketRows=(payload.history.market??[]).slice(-60)
    return {
      money:[
        {label:'USD level Z',className:'money-usd',points:moneyRows.filter(row=>typeof row.usd_level_z==='number').map(row=>({label:String(row.month),value:Number(row.usd_level_z)}))},
        {label:'USD accel3 Z',className:'money-accel',points:moneyRows.filter(row=>typeof row.usd_accel3_z==='number').map(row=>({label:String(row.month),value:Number(row.usd_accel3_z)}))},
      ],
      overlays:[
        {label:'Funding',className:'funding',points:fundingRows.map(row=>({label:row.observation_month,value:row.score}))},
        {label:'Fiscal',className:'fiscal',points:fiscalRows.map(row=>({label:row.observation_month,value:row.score}))},
      ],
      market:[{label:'Positive assets',className:'market',points:marketRows.map(row=>({label:row.month,value:row.positive}))}],
    }
  },[payload])

  if(loading&&!payload)return <main className="gmli-app"><div className="gmli-state">Loading GMLI context…</div></main>
  if(error&&!payload)return <main className="gmli-app"><div className="gmli-state error"><b>GMLI sidecar unavailable</b><span>{error}</span><button onClick={()=>setNonce(value=>value+1)}>Retry</button></div></main>
  if(!payload)return null

  const r=payload.regime
  const x=payload.moneyExtremes.latest
  const fallback=payload.status!=='OK'||payload.source.upstreamRefreshStatus==='PASS_WITH_LAST_GOOD_FALLBACK'
  const assets=Object.entries(r.market.assetsPositive??{}).map(([asset,positive])=>`${asset} ${positive?'✓':'×'}`).join(' · ')

  return <main className="gmli-app">
    <section className="gmli-hero">
      <div><small>GARRINCHA077/NUEVO · READ-ONLY MACRO CONTEXT</small><h1>GMLI Context</h1><p>Canonical GMLI results embedded as a StockScout sidecar. Selection stays in StockScout; this layer is regime, liquidity and sizing context only.</p></div>
      <div className="gmli-meta"><span><small>GMLI built</small><b>{dateLabel(payload.generatedAt)}</b></span><span><small>Source refresh</small><b>{payload.source.upstreamRefreshStatus}</b></span><a href={FULL_GMLI_URL} target="_blank" rel="noreferrer" style={{border:'1px solid #365a73',background:'#0d1c28',color:'#dceaf4',borderRadius:10,padding:'9px 12px',textDecoration:'none',fontSize:12,fontWeight:700,whiteSpace:'nowrap'}}>↗ Full GMLI</a><button onClick={()=>setNonce(value=>value+1)} disabled={loading}>{loading?'Loading…':'↻ Reload'}</button></div>
    </section>

    {fallback&&<div className="gmli-warning">Last-good GMLI context is being shown. StockScout scoring and nightly operation are not affected.</div>}
    {error&&<div className="gmli-warning">Reload failed: {error}. Preserving the already loaded sidecar.</div>}

    <section className="gmli-summary">
      <article className="wide"><small>GMLI REGIME</small><strong>{r.label??'—'}</strong><span>{r.tilt??'—'} · data health {payload.dataHealth?.status??'—'}</span></article>
      <article><small>MONEY · USD</small><strong>{fmt(r.money.usdScore)}</strong><span>{fmt(r.money.usdYoYPct,2)}% YoY · {r.money.usdRegime}</span></article>
      <article><small>MONEY · FX-NEUTRAL</small><strong>{fmt(r.money.fxNeutralScore)}</strong><span>{fmt(r.money.fxNeutralYoYPct,2)}% YoY · {r.money.fxNeutralRegime}</span></article>
      <article className={scoreTone(r.funding)}><small>FUNDING</small><strong>{fmt(r.funding.score)}</strong><span>{r.funding.regime} · {r.funding.role}</span></article>
      <article className={scoreTone(r.fiscal)}><small>FISCAL</small><strong>{fmt(r.fiscal.score)}</strong><span>{r.fiscal.regime} · weight {fmt(r.fiscal.automaticGlobalConvictionWeight,0)}</span></article>
      <article><small>MARKET CONFIRMATION</small><strong>{r.market.positive??'—'}/{r.market.total??'—'}</strong><span>{monthLabel(r.market.month)} · {assets||'—'}</span></article>
    </section>

    <section className="gmli-section">
      <header><div><small>RESEARCH DIAGNOSTIC · ZERO STOCKSCOUT SCORE EFFECT</small><h2>Money Historical Extremes</h2></div><span>120M rolling context · no look-ahead</span></header>
      <div className="gmli-extremes-grid">
        <ExtremeCard label="USD LEVEL" value={`${fmt(x.usd_level.value_pct,2)}% YoY`} z={x.usd_level.z} percentile={x.usd_level.percentile}/>
        <ExtremeCard label="FX-NEUTRAL LEVEL" value={`${fmt(x.fx_neutral_level.value_pct,2)}% YoY`} z={x.fx_neutral_level.z} percentile={x.fx_neutral_level.percentile}/>
        <ExtremeCard label="USD ACCEL3" value={`${signed(x.usd_accel3.value_pp,2)} pp`} z={x.usd_accel3.z} percentile={x.usd_accel3.percentile}/>
        <ExtremeCard label="FX-NEUTRAL ACCEL3" value={`${signed(x.fx_neutral_accel3.value_pp,2)} pp`} z={x.fx_neutral_accel3.z} percentile={x.fx_neutral_accel3.percentile}/>
      </div>
    </section>

    <section className="gmli-section gmli-chart-grid">
      <article><header><div><small>LAST 5 YEARS</small><h2>Money Z-scores</h2></div><div className="gmli-legend"><span className="money-usd">USD level</span><span className="money-accel">USD accel3</span></div></header><MiniLineChart series={charts?.money??[]} min={-3} max={3} zeroLines={[-2,-1,0,1,2]}/></article>
      <article><header><div><small>LAST 5 YEARS</small><h2>Funding + Fiscal</h2></div><div className="gmli-legend"><span className="funding">Funding</span><span className="fiscal">Fiscal</span></div></header><MiniLineChart series={charts?.overlays??[]} min={0} max={100} zeroLines={[40,60]}/></article>
      <article className="wide"><header><div><small>LAST 5 YEARS</small><h2>Completed-month Market Confirmation</h2></div><div className="gmli-legend"><span className="market">Positive SPY/QQQ/GLD/DBC</span></div></header><MiniLineChart series={charts?.market??[]} min={0} max={4} zeroLines={[1,2,3]}/></article>
    </section>

    <section className="gmli-section gmli-guide">
      <h2>How to use this with StockScout</h2>
      <div className="gmli-guide-grid">
        <div><b>1 · Selection</b><span>Opportunity, RS, Stage, Fundamentals and chart structure remain the stock-selection engine.</span></div>
        <div><b>2 · Money</b><span>Use GMLI Money as the upstream 3–12M liquidity backdrop, not as a single-stock entry trigger.</span></div>
        <div><b>3 · Funding / Fiscal</b><span>Funding is reactive confirmation; Fiscal is mixed policy context. Neither may override StockScout ranking here.</span></div>
        <div><b>4 · Market confirmation</b><span>Use cross-asset confirmation to judge whether price action agrees with or diverges from the macro backdrop.</span></div>
        <div><b>5 · Extremes</b><span>Z-scores and percentiles show how unusual Money level or acceleration is; extremes are context, not automatic contrarian trades.</span></div>
        <div><b>6 · Future validation</b><span>Nightly cohort research can later test whether StockScout outcomes differ by GMLI regime before any bounded modifier is considered.</span></div>
      </div>
      <div className="gmli-contract"><b>Guardrail:</b> {payload.stockScoutImpact}. Canonical methodology stays in <b>{payload.source.repository}</b>; StockScreener-next does not reconstruct it.</div>
    </section>
  </main>
}
