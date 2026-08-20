import {useEffect,useMemo,useState} from 'react'
import {buildReviewInbox,dataHealth,explainStock,type ReviewManifest,type ReviewPayload,type ValidationStatus} from './phase4Review'

type InboxMode='today'|'new'|null

async function readJson<T>(url:string):Promise<T|null>{
  try{
    const response=await fetch(`${url}${url.includes('?')?'&':'?'}t=${Date.now()}`,{cache:'no-store'})
    if(!response.ok)return null
    return await response.json() as T
  }catch{return null}
}

export default function Phase4ReviewBar(){
  const[payload,setPayload]=useState<ReviewPayload|null>(null)
  const[manifest,setManifest]=useState<ReviewManifest|null>(null)
  const[validation,setValidation]=useState<ValidationStatus|null>(null)
  const[selectedTicker,setSelectedTicker]=useState(()=>location.hash.replace('#','').toUpperCase())
  const[inboxMode,setInboxMode]=useState<InboxMode>(null)
  const[whyOpen,setWhyOpen]=useState(false)

  useEffect(()=>{
    let live=true
    Promise.all([
      readJson<ReviewPayload>('./data/core.json'),
      readJson<ReviewManifest>('./data/manifest.json'),
      readJson<ValidationStatus>('./data/validation-status.json'),
    ]).then(([core,nextManifest,nextValidation])=>{
      if(!live)return
      setPayload(core);setManifest(nextManifest);setValidation(nextValidation)
    })
    return()=>{live=false}
  },[])

  useEffect(()=>{
    const onHash=()=>setSelectedTicker(location.hash.replace('#','').toUpperCase())
    window.addEventListener('hashchange',onHash)
    return()=>window.removeEventListener('hashchange',onHash)
  },[])

  const inbox=useMemo(()=>buildReviewInbox(payload?.universe||[]),[payload])
  const selected=useMemo(()=>payload?.universe.find(stock=>stock.ticker===selectedTicker)||null,[payload,selectedTicker])
  const why=useMemo(()=>selected?explainStock(selected):[],[selected])
  const health=useMemo(()=>dataHealth(payload,manifest,validation),[payload,manifest,validation])
  const rows=inboxMode==='today'?inbox.today:inboxMode==='new'?inbox.newSinceLastScan:[]

  const openTicker=(ticker:string)=>{
    location.hash=ticker
    setSelectedTicker(ticker)
    setInboxMode(null)
    setWhyOpen(true)
  }

  return <section className="p4-review" aria-label="Phase 4 review workflow">
    <div className="p4-review-main">
      <div className={`p4-health ${health.level}`} title={health.detail}>
        <span className="p4-health-dot"/>
        <b>{health.label}</b>
        {health.ageHours!==null&&<small>{Math.round(health.ageHours)}h snapshot</small>}
        <span>{validation?.conclusion==='success'?`validation #${validation.run_id??'—'}`:'validation status: client unavailable'}</span>
      </div>
      <div className="p4-inbox-actions">
        <button className={inboxMode==='today'?'active':''} onClick={()=>setInboxMode(mode=>mode==='today'?null:'today')}><b>Today</b><span>{inbox.today.length}</span></button>
        <button className={inboxMode==='new'?'active':''} onClick={()=>setInboxMode(mode=>mode==='new'?null:'new')}><b>New since last scan</b><span>{inbox.newSinceLastScan.length}</span></button>
        <button className={whyOpen?'active':''} disabled={!selected} onClick={()=>setWhyOpen(open=>!open)}><b>Why this stock?</b><span>{selected?.ticker||'—'}</span></button>
      </div>
      <div className="p4-rapid-note"><b>Rapid Review</b><span>Grid now favors continuous mobile review; scroll to keep loading matches.</span></div>
    </div>

    {inboxMode&&<div className="p4-inbox-drawer"><header><div><b>{inboxMode==='today'?'Today / changed':'New since last scan'}</b><span>{rows.length} candidates · click to open in StockScout</span></div><button onClick={()=>setInboxMode(null)}>×</button></header><div className="p4-inbox-list">{rows.slice(0,24).map(stock=><button key={stock.ticker} onClick={()=>openTicker(stock.ticker)}><b>{stock.ticker}</b><span>{stock.primarySetup||stock.setup||stock.stageName||'Setup'}</span><em>{stock.changeLabels?.[0]||stock.opportunityTier||''}</em><strong>{Math.round(stock.opportunityScore??0)}</strong></button>)}{!rows.length&&<p>No candidates in this snapshot.</p>}</div>{rows.length>24&&<footer>Showing the first 24 of {rows.length}; use the screener/grid for the full set.</footer>}</div>}

    {whyOpen&&selected&&<aside className="p4-why"><header><div><b>WHY {selected.ticker}?</b><span>transparent decomposition · no new score</span></div><button onClick={()=>setWhyOpen(false)}>×</button></header><ol>{why.map((line,index)=><li key={`${line}-${index}`}>{line}</li>)}</ol></aside>}
  </section>
}
