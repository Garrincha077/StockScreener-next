import {useEffect,useMemo,useState} from 'react'
import './original-engine.css'

type EngineRow={
  ticker:string
  price?:number
  originalBuyScore?:number
  originalRR?:number
  originalStopLoss?:number
  originalRiskPct?:number
  originalRewardTarget?:number
  originalEntryQuality?:string
  originalTTScore?:number
  originalTTPasses?:number
  originalVcpQuality?:number
  originalAdVolumeRatio?:number
  originalBreakoutType?:string|null
  originalBreakoutLevel?:number|null
  originalBreakoutVolumeConfirmed?:boolean
  originalSellScore?:number
  originalSell?:boolean
  originalSellSeverity?:string
  phaseConfidence?:number
  originalEngine?:any
}
type Payload={market?:any;universe?:EngineRow[];originalEngineModel?:string}
type Props={open:boolean;onOpenChange:(open:boolean)=>void;embedded?:boolean}

const fmt=(v:any,d=1)=>typeof v==='number'&&Number.isFinite(v)?v.toFixed(d):'—'
const money=(v:any)=>typeof v==='number'&&Number.isFinite(v)?`$${v.toFixed(2)}`:'—'
const pct=(v:any)=>typeof v==='number'&&Number.isFinite(v)?`${v.toFixed(1)}%`:'—'

const criteriaLabels:Record<string,string>={
  price_above_150_200:'Price > 150 & 200 DMA',
  sma_150_above_200:'150 DMA > 200 DMA',
  sma_200_rising:'200 DMA rising',
  sma_50_above_150:'50 DMA > 150 DMA',
  price_above_50:'Price > 50 DMA',
  price_30pct_above_52w_low:'≥30% above 52W low',
  price_near_52w_high:'Within 25% of 52W high',
  confirmed_stage_2:'Confirmed Stage 2',
}

export default function OriginalEngineDock({open,onOpenChange,embedded=false}:Props){
  const[payload,setPayload]=useState<Payload|null>(null)
  const[loading,setLoading]=useState(false)
  const[loadError,setLoadError]=useState('')
  const[ticker,setTicker]=useState(()=>location.hash.replace('#','').toUpperCase())

  useEffect(()=>{
    if(!open||payload||loading)return
    let live=true
    setLoading(true)
    setLoadError('')
    fetch(`./data/latest.json?t=${Date.now()}`,{cache:'no-store'})
      .then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()})
      .then((data:Payload)=>{if(live)setPayload(data)})
      .catch(error=>{if(live)setLoadError(String(error))})
      .finally(()=>{if(live)setLoading(false)})
    return()=>{live=false}
  },[open,payload,loading])
  useEffect(()=>{
    let last=location.hash
    const timer=window.setInterval(()=>{
      if(location.hash!==last){last=location.hash;setTicker(location.hash.replace('#','').toUpperCase())}
    },250)
    return()=>window.clearInterval(timer)
  },[])

  const row=useMemo(()=>payload?.universe?.find(x=>x.ticker===ticker)||payload?.universe?.[0],[payload,ticker])
  const e=row?.originalEngine
  const gate=payload?.market?.originalSignalGate?.gate
  const criteria=e?.minervini?.criteria||{}
  const components=e?.buy?.components||{}
  const contractions=e?.vcp?.contractions||[]
  const qualified=Boolean(e?.buy?.marketQualified)

  return <>
    {!open&&<button className={`oe-launch ${qualified?'qualified':''}`} onClick={()=>onOpenChange(true)} title="Open repository source signal engine" aria-expanded={false}>ORIGINAL {row?.originalBuyScore!=null?fmt(row.originalBuyScore,0):''}</button>}
    {open&&<aside className={`oe-dock ${embedded?'embedded':''}`}>
      <header><div><small>SOURCE METHODOLOGY</small><b>ORIGINAL ENGINE · {row?.ticker||ticker||'—'}</b></div><button onClick={()=>onOpenChange(false)} aria-label="Close Original Engine">×</button></header>
      {loading?<div className="oe-empty">Loading complete source payload…</div>:loadError?<div className="oe-empty">Unable to load source payload. <button onClick={()=>{setLoadError('');setPayload(null)}}>Retry</button></div>:!e?<div className="oe-empty">Original-engine fields are not present in this dataset yet.</div>:<div className="oe-body">
        <section className="oe-summary">
          <div><small>BUY SCORE</small><strong>{fmt(e.buy?.score,0)}<em>/125</em></strong></div>
          <div><small>MARKET GATE</small><strong className={gate?.should_generate_buys?'good':'warn'}>{gate?.should_generate_buys?'ON':'OFF'}</strong></div>
          <div><small>TT</small><strong className={e.minervini?.passes?'good':''}>{fmt(e.minervini?.passed,0)}/8</strong></div>
          <div><small>VCP</small><strong>{fmt(e.vcp?.quality,0)}</strong></div>
          <div><small>R/R</small><strong className={(e.buy?.riskReward||0)>=2?'good':'warn'}>{fmt(e.buy?.riskReward,1)}:1</strong></div>
          <div><small>PHASE CONF</small><strong>{pct(e.phaseConfidence)}</strong></div>
        </section>

        <section><h4>Original trade qualification</h4><div className="oe-trade-grid">
          <span>Entry quality <b>{e.buy?.entryQuality||'—'}</b></span>
          <span>Stop <b>{money(e.buy?.stopLoss)}</b></span>
          <span>Risk <b>{pct(e.buy?.riskPct)}</b></span>
          <span>Target <b>{money(e.buy?.rewardTarget)}</b></span>
          <span>Breakout <b>{e.breakout?.breakout_type||'—'}</b></span>
          <span>Level <b>{money(e.breakout?.breakout_level)}</b></span>
          <span>Breakout vol <b className={e.breakout?.volume_confirmed?'good':''}>{e.breakout?.volume_confirmed?'CONFIRMED':'not confirmed'}</b></span>
          <span>A/D vol <b>{e.buy?.adVolumeRatio?`${fmt(e.buy.adVolumeRatio,2)}x`:'—'}</b></span>
        </div></section>

        <section><h4>Score anatomy · source engine</h4><div className="oe-components">
          <span>Trend <b>{fmt(components.trend,1)}/40</b></span>
          <span>Fundamental <b>{fmt(components.fundamental,1)}/40</b></span>
          <span>R/R <b>{fmt(components.riskReward,1)}/15</b></span>
          <span>RS <b>{fmt(components.relativeStrength,1)}/10</b></span>
          <span>Volume <b>{fmt(components.volume,1)}/10</b></span>
          <span>Entry <b>{fmt(components.entry,1)}/5</b></span>
          <span>VCP bonus <b>{fmt(components.vcpBonus,1)}/5</b></span>
        </div></section>

        <section><h4>Minervini Trend Template</h4><div className="oe-checklist">
          {Object.entries(criteriaLabels).map(([key,label])=><span key={key} className={criteria[key]?'pass':'fail'}><i>{criteria[key]?'✓':'×'}</i>{label}</span>)}
        </div></section>

        <section><h4>VCP anatomy · original detector</h4>
          <div className="oe-vcpmeta"><span>{e.vcp?.contractionCount||0} contractions</span><span>tightening {fmt(e.vcp?.contractionQuality,0)}%</span><span>volume quality {fmt(e.vcp?.volumeQuality,0)}%</span><span>base {fmt(e.vcp?.baseLengthWeeks,1)}w</span></div>
          {e.vcp?.pattern&&<p className="oe-pattern">{e.vcp.pattern}</p>}
          {contractions.length>0&&<div className="oe-contractions">{contractions.map((c:any,i:number)=><div key={i}><b>C{i+1}</b><span>{pct(c.drawdownPct)}</span><small>vol {fmt(c.volumeRatio,2)}x · {c.durationDays||0}d</small></div>)}</div>}
        </section>

        <section><h4>Original engine reasons</h4><ul>{(e.buy?.reasons||[]).slice(0,8).map((r:string,i:number)=><li key={i}>{r}</li>)}</ul></section>

        {(e.sell?.score||0)>0&&<section className={`oe-sell ${e.sell?.isSell?'active':''}`}><h4>Sell / risk engine</h4><div><b>{fmt(e.sell?.score,0)}</b><span>{String(e.sell?.severity||'none').toUpperCase()}</span></div><ul>{(e.sell?.reasons||[]).slice(0,5).map((r:string,i:number)=><li key={i}>{r}</li>)}</ul></section>}

        <footer>Model: {e.model} · Discovery Opportunity remains separate.</footer>
      </div>}
    </aside>}
  </>
}
