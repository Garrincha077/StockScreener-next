import {useEffect,useMemo,useState} from 'react'
import {buildReviewInbox,explainStock,reviewScopeLabel,type ReviewPayload,type ReviewScope,type ValidationStatus} from './phase4Review'
import {useStockScoutData} from './data/StockScoutDataProvider'
import ScanDataHealthPanel from './ScanDataHealthPanel'

type InboxMode=Exclude<ReviewScope,null>
type ReviewBarProps={onOpenChart?:()=>void;onOpenTickerAlerts?:()=>void}

export default function Phase4ReviewBar({onOpenChart,onOpenTickerAlerts}:ReviewBarProps){
  const{core,manifest:selectedManifest,selectedTicker,selectTicker,reviewScope,setReviewScope,loadOptional}=useStockScoutData()
  const payload=core as ReviewPayload|null
  const[validation,setValidation]=useState<ValidationStatus|null>(null)
  const[inboxMode,setInboxMode]=useState<InboxMode|null>(null)
  const[queueMode,setQueueMode]=useState<InboxMode|null>(null)
  const[whyOpen,setWhyOpen]=useState(false)
  const[reviewed,setReviewed]=useState<string[]>([])

  useEffect(()=>{
    let live=true
    loadOptional<ValidationStatus>('validation-status.json').then(next=>{if(live)setValidation(next)})
    return()=>{live=false}
  },[loadOptional])

  const reviewedStorageKey=payload?.generatedAt?`stockscout-phase4-reviewed:${payload.generatedAt}`:null
  useEffect(()=>{
    if(!reviewedStorageKey){setReviewed([]);return}
    try{
      const stored=JSON.parse(sessionStorage.getItem(reviewedStorageKey)||'[]')
      setReviewed(Array.isArray(stored)?stored.filter(value=>typeof value==='string'):[])
    }catch{setReviewed([])}
  },[reviewedStorageKey])

  const inbox=useMemo(()=>buildReviewInbox(payload?.universe||[]),[payload])
  const selected=useMemo(()=>payload?.universe.find(stock=>stock.ticker===selectedTicker)||null,[payload,selectedTicker])
  const why=useMemo(()=>selected?explainStock(selected):[],[selected])
  const reviewedSet=useMemo(()=>new Set(reviewed),[reviewed])
  const rows=inboxMode==='today'?inbox.today:inboxMode==='new'?inbox.newSinceLastScan:[]
  const queueRows=queueMode==='today'?inbox.today:queueMode==='new'?inbox.newSinceLastScan:[]
  const scopeRows=reviewScope==='today'?inbox.today:reviewScope==='new'?inbox.newSinceLastScan:[]
  const queueIndex=queueRows.findIndex(stock=>stock.ticker===selectedTicker)
  const todayUnseen=inbox.today.filter(stock=>!reviewedSet.has(stock.ticker)).length
  const newUnseen=inbox.newSinceLastScan.filter(stock=>!reviewedSet.has(stock.ticker)).length
  const scopeReviewed=scopeRows.filter(stock=>reviewedSet.has(stock.ticker)).length
  const scopeUnseen=Math.max(0,scopeRows.length-scopeReviewed)
  const scopeProgress=scopeRows.length?Math.round(scopeReviewed/scopeRows.length*100):0

  useEffect(()=>{
    if(queueMode&&selectedTicker&&queueRows.length&&queueIndex<0)setQueueMode(null)
  },[queueMode,selectedTicker,queueRows.length,queueIndex])

  const markReviewed=(ticker:string)=>{
    if(!reviewedStorageKey)return
    setReviewed(current=>{
      if(current.includes(ticker))return current
      const next=[...current,ticker]
      try{sessionStorage.setItem(reviewedStorageKey,JSON.stringify(next))}catch{}
      return next
    })
  }
  const openTicker=(ticker:string,mode:InboxMode|null=null)=>{
    selectTicker(ticker)
    setInboxMode(null)
    setQueueMode(mode)
    setWhyOpen(true)
    if(mode)markReviewed(ticker)
  }
  const moveQueue=(delta:-1|1)=>{
    if(!queueMode||queueIndex<0)return
    const nextIndex=queueIndex+delta
    if(nextIndex<0||nextIndex>=queueRows.length)return
    openTicker(queueRows[nextIndex].ticker,queueMode)
  }
  const closeWhy=()=>{setWhyOpen(false);setQueueMode(null)}
  const runTickerAction=(action?:()=>void)=>{
    if(!selected||!action)return
    setWhyOpen(false)
    action()
  }
  const unseenLabel=(count:number)=>count===0?'all seen':`${count} unseen`
  const toggleScope=(scope:InboxMode)=>{
    const next=reviewScope===scope?null:scope
    setReviewScope(next)
    setInboxMode(null)
    setQueueMode(null)
    setWhyOpen(false)
  }
  const clearScope=()=>{
    setReviewScope(null)
    setInboxMode(null)
    setQueueMode(null)
  }
  const startReview=(scope:InboxMode)=>{
    const candidates=scope==='today'?inbox.today:inbox.newSinceLastScan
    if(!candidates.length)return
    if(reviewScope!==scope)setReviewScope(scope)
    const next=candidates.find(stock=>!reviewedSet.has(stock.ticker))||candidates[0]
    openTicker(next.ticker,scope)
  }
  const startLabel=scopeUnseen===0?'Review again':scopeReviewed>0?'Resume review':'Start review'

  return <section className={`p4-review${whyOpen?' why-open':''}`} aria-label="Phase 4 review workflow">
    <div className="p4-review-main">
      <ScanDataHealthPanel core={core} manifest={selectedManifest} validation={validation}/>
      <div className="p4-inbox-actions">
        <button className={reviewScope==='today'?'active':''} onClick={()=>toggleScope('today')} aria-pressed={reviewScope==='today'}><b>Today</b><span>{inbox.today.length}<small>{unseenLabel(todayUnseen)}</small></span></button>
        <button className={reviewScope==='new'?'active':''} onClick={()=>toggleScope('new')} aria-pressed={reviewScope==='new'}><b>New since last scan</b><span>{inbox.newSinceLastScan.length}<small>{unseenLabel(newUnseen)}</small></span></button>
        <button className={whyOpen?'active':''} disabled={!selected} onClick={()=>{setWhyOpen(open=>!open);if(whyOpen)setQueueMode(null)}}><b>Why this stock?</b><span>{selected?.ticker||'—'}</span></button>
      </div>
      <div className="p4-rapid-note"><b>Rapid Review</b><span>Space = next ticker · scope stays visible · cards load continuously.</span></div>
      {reviewScope&&<div className="p4-review-scope" role="status">
        <div className="p4-scope-copy">
          <div className="p4-scope-text"><b>Review scope · {reviewScopeLabel(reviewScope)}</b><span>{scopeRows.length.toLocaleString()} candidates · {scopeReviewed} / {scopeRows.length} reviewed · saved-screen membership paused · sort preserved</span></div>
          <div className="p4-review-progress" aria-label={`Review progress ${scopeReviewed} of ${scopeRows.length}`}><span style={{width:`${scopeProgress}%`}}/></div>
        </div>
        <div className="p4-scope-actions"><button className="primary" disabled={!scopeRows.length} onClick={()=>startReview(reviewScope)}>{startLabel}</button><button onClick={()=>setInboxMode(reviewScope)}>List</button><button className="clear" aria-label="Clear review scope" onClick={clearScope}>×</button></div>
      </div>}
    </div>

    {inboxMode&&<div className="p4-inbox-drawer"><header><div><b>{reviewScopeLabel(inboxMode)}</b><span>{rows.length} candidates · {unseenLabel(inboxMode==='today'?todayUnseen:newUnseen)} · click to start a review queue</span></div><button aria-label="Close review inbox" onClick={()=>setInboxMode(null)}>×</button></header><div className="p4-inbox-list">{rows.slice(0,24).map(stock=><button className={reviewedSet.has(stock.ticker)?'reviewed':''} key={stock.ticker} onClick={()=>openTicker(stock.ticker,inboxMode)}><b>{stock.ticker}</b><span>{stock.primarySetup||stock.setup||stock.stageName||'Setup'}</span><em>{reviewedSet.has(stock.ticker)?'✓ reviewed · ':''}{stock.changeLabels?.[0]||stock.opportunityTier||''}</em><strong>{Math.round(stock.opportunityScore??0)}</strong></button>)}{!rows.length&&<p>No candidates in this snapshot.</p>}</div>{rows.length>24&&<footer>Showing the first 24 of {rows.length}; queue navigation can continue through the full inbox.</footer>}</div>}

    {whyOpen&&selected&&<aside className="p4-why"><header><div><b>WHY {selected.ticker}?</b><span>transparent decomposition · no new score{queueMode&&queueIndex>=0?` · Review ${queueIndex+1} / ${queueRows.length}`:''}</span></div><div className="p4-why-actions">{queueMode&&queueIndex>=0&&<><button className="p4-prev" aria-label="Previous review candidate" disabled={queueIndex===0} onClick={()=>moveQueue(-1)}>←</button><button className="p4-next" aria-label="Next review candidate" disabled={queueIndex===queueRows.length-1} onClick={()=>moveQueue(1)}>→</button></>}<button aria-label="Close why panel" onClick={closeWhy}>×</button></div></header><div className="p4-why-shortcuts"><button aria-label={`Open ${selected.ticker} chart`} disabled={!onOpenChart} onClick={()=>runTickerAction(onOpenChart)}>▣ Chart</button><button aria-label={`Open ${selected.ticker} ticker alerts`} disabled={!onOpenTickerAlerts} onClick={()=>runTickerAction(onOpenTickerAlerts)}>✏ Ticker alerts</button><span>Review queue stays active</span></div><ol>{why.map((line,index)=><li key={`${line}-${index}`}>{line}</li>)}</ol></aside>}
  </section>
}
