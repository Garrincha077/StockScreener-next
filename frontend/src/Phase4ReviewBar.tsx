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
  const[queueMode,setQueueMode]=useState<InboxMode>(null)
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
    const syncHash=()=>{
      const next=location.hash.replace('#','').toUpperCase()
      setSelectedTicker(current=>current===next?current:next)
    }
    syncHash()
    window.addEventListener('hashchange',syncHash)
    // DeepVueTerminal uses history.replaceState for normal row/grid selection,
    // which does not emit hashchange. Keep the review surface synchronized
    // without coupling the terminal to Phase 4 state.
    const timer=window.setInterval(syncHash,250)
    return()=>{
      window.removeEventListener('hashchange',syncHash)
      window.clearInterval(timer)
    }
  },[])

  const inbox=useMemo(()=>buildReviewInbox(payload?.universe||[]),[payload])
  const selected=useMemo(()=>payload?.universe.find(stock=>stock.ticker===selectedTicker)||null,[payload,selectedTicker])
  const why=useMemo(()=>selected?explainStock(selected):[],[selected])
  const health=useMemo(()=>dataHealth(payload,manifest,validation),[payload,manifest,validation])
  const rows=inboxMode==='today'?inbox.today:inboxMode==='new'?inbox.newSinceLastScan:[]
  const queueRows=queueMode==='today'?inbox.today:queueMode==='new'?inbox.newSinceLastScan:[]
  const queueIndex=queueRows.findIndex(stock=>stock.ticker===selectedTicker)

  useEffect(()=>{
    if(queueMode&&selectedTicker&&queueRows.length&&queueIndex<0)setQueueMode(null)
  },[queueMode,selectedTicker,queueRows.length,queueIndex])

  const openTicker=(ticker:string,mode:InboxMode=null)=>{
    location.hash=ticker
    setSelectedTicker(ticker)
    setInboxMode(null)
    setQueueMode(mode)
    setWhyOpen(true)
  }
  const moveQueue=(delta:-1|1)=>{
    if(!queueMode||queueIndex<0)return
    const nextIndex=queueIndex+delta
    if(nextIndex<0||nextIndex>=queueRows.length)return
    openTicker(queueRows[nextIndex].ticker,queueMode)
  }
  const closeWhy=()=>{setWhyOpen(false);setQueueMode(null)}

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
        <button className={whyOpen?'active':''} disabled={!selected} onClick={()=>{setWhyOpen(open=>!open);if(whyOpen)setQueueMode(null)}}><b>Why this stock?</b><span>{selected?.ticker||'—'}</span></button>
      </div>
      <div className="p4-rapid-note"><b>Rapid Review</b><span>Grid now favors continuous mobile review; scroll to keep loading matches.</span></div>
    </div>

    {inboxMode&&<div className="p4-inbox-drawer"><header><div><b>{inboxMode==='today'?'Today / changed':'New since last scan'}</b><span>{rows.length} candidates · click to start a review queue</span></div><button aria-label="Close review inbox" onClick={()=>setInboxMode(null)}>×</button></header><div className="p4-inbox-list">{rows.slice(0,24).map(stock=><button key={stock.ticker} onClick={()=>openTicker(stock.ticker,inboxMode)}><b>{stock.ticker}</b><span>{stock.primarySetup||stock.setup||stock.stageName||'Setup'}</span><em>{stock.changeLabels?.[0]||stock.opportunityTier||''}</em><strong>{Math.round(stock.opportunityScore??0)}</strong></button>)}{!rows.length&&<p>No candidates in this snapshot.</p>}</div>{rows.length>24&&<footer>Showing the first 24 of {rows.length}; queue navigation can continue through the full inbox.</footer>}</div>}

    {whyOpen&&selected&&<aside className="p4-why"><header><div><b>WHY {selected.ticker}?</b><span>transparent decomposition · no new score{queueMode&&queueIndex>=0?` · Review ${queueIndex+1} / ${queueRows.length}`:''}</span></div><div className="p4-why-actions">{queueMode&&queueIndex>=0&&<><button className="p4-prev" aria-label="Previous review candidate" disabled={queueIndex===0} onClick={()=>moveQueue(-1)}>←</button><button className="p4-next" aria-label="Next review candidate" disabled={queueIndex===queueRows.length-1} onClick={()=>moveQueue(1)}>→</button></>}<button aria-label="Close why panel" onClick={closeWhy}>×</button></div></header><ol>{why.map((line,index)=><li key={`${line}-${index}`}>{line}</li>)}</ol></aside>}
  </section>
}