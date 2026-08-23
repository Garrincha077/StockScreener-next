import {useMemo,useState} from 'react'
import {useChartAlerts} from './ChartAlertsProvider'
import AlertSyncSettingsPanel from './AlertSyncSettingsPanel'
import TelegramSettingsPanel from './TelegramSettingsPanel'
import type {ChartAlertRule,ChartAlertStatus,ChartAlertV2Event,ChartDrawing} from './deepvue/chartAlerts'

type View='active'|'near'|'triggered'|'paused'|'all'|'settings'
const CONDITION={cross_above:'Cross Above',cross_below:'Cross Below',touch:'Touch'} as const
const STATE:Record<string,string>={active:'Active',approaching:'Approaching',triggered:'Triggered',paused:'Paused',needs_review:'Needs review'}
const HEALTH:Record<string,string>={idle:'Idle',waiting:'Waiting for evaluation',stale:'Stale',attention:'Attention',healthy:'Healthy'}
const REVIEW_REASON:Record<string,string>={
  chart_shard_missing:'Chart history missing',
  insufficient_bars:'Insufficient chart history',
  missing_anchor:'Anchor is outside available chart history',
  unsupported_basis:'Malformed rule/source combination',
  geometry_unavailable:'Drawing geometry unavailable',
  legacy_interval_not_persisted:'Legacy drawing interval must be confirmed',
  corporate_action_adjustment:'Corporate-action adjustment needs review',
  corporate_action_adjustment_review:'Corporate-action adjustment needs review',
  snapshot_unavailable:'Published chart snapshot unavailable',
}
const NEAR_TRIGGER_PCT=2
const fmt=(value:number|null|undefined,digits=2)=>typeof value==='number'&&Number.isFinite(value)?value.toFixed(digits):'—'
const distance=(value:number|null|undefined)=>typeof value==='number'&&Number.isFinite(value)?`${Math.abs(value).toFixed(1)}% ${value>=0?'above':'below'}`:'—'
const absDistance=(status?:ChartAlertStatus)=>typeof status?.distancePct==='number'&&Number.isFinite(status.distancePct)?Math.abs(status.distancePct):Number.POSITIVE_INFINITY
const evaluatedAt=(value:string|null|undefined)=>{
  if(!value)return'not yet'
  const parsed=new Date(value)
  return Number.isFinite(parsed.getTime())?parsed.toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):value
}
const reviewReason=(reason:string|null|undefined)=>{
  if(!reason)return'Needs review'
  if(REVIEW_REASON[reason])return REVIEW_REASON[reason]
  if(/^chart_http_\d+$/.test(reason))return`Published chart snapshot unavailable (HTTP ${reason.slice('chart_http_'.length)})`
  return reason.replaceAll('_',' ')
}

export default function ChartAlertsCenter({open,onOpenChange,onOpenDrawing}:{open:boolean;onOpenChange:(open:boolean)=>void;onOpenDrawing:(drawing:ChartDrawing)=>void}){
  const{snapshot,refresh,markEventRead}=useChartAlerts()
  const[view,setView]=useState<View>('active')
  const[query,setQuery]=useState('')
  const[identityVersion,setIdentityVersion]=useState(0)
  const ruleByDrawing=useMemo(()=>new Map(snapshot.rules.map(rule=>[rule.drawingId,rule])),[snapshot.rules])
  const statusByDrawing=useMemo(()=>new Map(snapshot.status.map(status=>[status.drawingId,status])),[snapshot.status])
  const drawingById=useMemo(()=>new Map(snapshot.drawings.filter(drawing=>drawing.id).map(drawing=>[drawing.id!,drawing])),[snapshot.drawings])
  const unreadCount=useMemo(()=>snapshot.events.filter(event=>!event.readAt).length,[snapshot.events])
  const q=query.trim().toUpperCase()

  const active=useMemo(()=>snapshot.drawings.filter(drawing=>drawing.id&&ruleByDrawing.get(drawing.id)?.enabled),[snapshot.drawings,ruleByDrawing])
  const near=useMemo(()=>active.filter(drawing=>{
    if(!drawing.id)return false
    const status=statusByDrawing.get(drawing.id)
    const gap=absDistance(status)
    return status?.state!=='needs_review'&&Number.isFinite(gap)&&gap<=NEAR_TRIGGER_PCT
  }).sort((a,b)=>absDistance(statusByDrawing.get(a.id!))-absDistance(statusByDrawing.get(b.id!))),[active,statusByDrawing])
  const paused=useMemo(()=>snapshot.drawings.filter(drawing=>drawing.id&&ruleByDrawing.has(drawing.id)&&!ruleByDrawing.get(drawing.id)?.enabled),[snapshot.drawings,ruleByDrawing])
  const all=useMemo(()=>[...snapshot.drawings].sort((a,b)=>a.ticker.localeCompare(b.ticker)||a.interval.localeCompare(b.interval)),[snapshot.drawings])
  const triggered=useMemo(()=>snapshot.events.filter(event=>!q||event.ticker.includes(q)),[snapshot.events,q])
  const rows=(view==='active'?active:view==='near'?near:view==='paused'?paused:all).filter(drawing=>!q||drawing.ticker.includes(q))
  const health=snapshot.evaluatorHealth

  if(!open)return null

  const openEvent=(event:ChartAlertV2Event)=>{
    if(!event.readAt)void markEventRead(event.id,true)
    const drawing=event.drawingId?drawingById.get(event.drawingId):undefined
    if(drawing)onOpenDrawing(drawing)
  }
  const ruleText=(rule?:ChartAlertRule)=>rule?`${CONDITION[rule.condition]} · ${rule.source==='close'?'Close':'Wick'} · ${rule.lifecycle==='rearm'?'Re-arm':'One shot'}`:'Drawing only'
  const identityChanged=()=>{
    setIdentityVersion(version=>version+1)
    void refresh()
  }

  return <aside className="cad-center" aria-label="Global alerts center">
    <header className="cad-center-head"><div><b>🔔 GLOBAL ALERTS CENTER</b><span>{snapshot.drawings.length} drawings · {active.length} active · {unreadCount} unread · {snapshot.events.length} trigger events</span></div><div><button onClick={()=>void refresh()} aria-label="Refresh global alerts">↻</button><button onClick={()=>onOpenChange(false)} aria-label="Close global alerts center">×</button></div></header>
    <div className="cad-center-toolbar"><nav aria-label="Alert center views">
      <button className={view==='active'?'active':''} onClick={()=>setView('active')}>Active <span>{active.length}</span></button>
      <button className={view==='near'?'active':''} onClick={()=>setView('near')}>Near Trigger <span>{near.length}</span></button>
      <button className={view==='triggered'?'active':''} onClick={()=>setView('triggered')}>Triggered <span>{snapshot.events.length}</span></button>
      <button className={view==='paused'?'active':''} onClick={()=>setView('paused')}>Paused <span>{paused.length}</span></button>
      <button className={view==='all'?'active':''} onClick={()=>setView('all')}>All Drawings <span>{all.length}</span></button>
      <button className={view==='settings'?'active':''} onClick={()=>setView('settings')}>Settings</button>
    </nav>{view!=='settings'&&<input value={query} onChange={event=>setQuery(event.target.value.toUpperCase())} placeholder="Ticker…" aria-label="Filter global alerts by ticker"/>}</div>

    <div className="cad-center-body">
      {view==='settings'?<div className="cad-settings-stack"><AlertSyncSettingsPanel onIdentityChanged={identityChanged}/><TelegramSettingsPanel key={identityVersion}/></div>:<>
        <div className={`cad-center-note cad-evaluator-health cad-evaluator-${health.state}`} role="status">
          <b>Evaluator {HEALTH[health.state]||health.state}</b> · last evaluated {evaluatedAt(health.lastEvaluatedAt)} · {health.evaluatedRules}/{health.activeRules} active rules evaluated{health.needsReview?` · ${health.needsReview} need review`:''}{health.staleRules?` · ${health.staleRules} stale`:''}
        </div>
        {view==='near'&&<div className="cad-center-note">Near Trigger means ≤{NEAR_TRIGGER_PCT}% absolute geometric distance to the projected line, nearest first. This is not a StockScout score.</div>}
        {view==='triggered'?<div className="cad-center-events">
          {triggered.length===0?<p className="cad-empty">No trigger events match this view.</p>:triggered.map(event=>{
            const canOpen=Boolean(event.drawingId&&drawingById.has(event.drawingId))
            return <button type="button" key={event.id} className={`cad-center-event ${event.readAt?'':'unread'}`} onClick={()=>openEvent(event)} title={canOpen?'Open this drawing and mark event read':'Mark event read'}>
              <span className="cad-center-ticker"><b>{event.ticker}</b><small>{event.interval||'—'} · {event.marketDate}</small></span>
              <span><b>{event.eventType==='break_up'?'Crossed above':event.eventType==='break_down'?'Crossed below':'Touched'}</b><small>line ${fmt(event.currentLinePrice)} · close ${fmt(event.closePrice)}</small></span>
              <span className="cad-center-telegram">{event.readAt?'':'New · '}Telegram · {event.telegramStatus.replaceAll('_',' ')}</span>
            </button>
          })}
        </div>:<div className="cad-center-rows">
          {rows.length===0?<p className="cad-empty">No drawings match this view.</p>:rows.map(drawing=>{
            if(!drawing.id)return null
            const rule=ruleByDrawing.get(drawing.id),status=statusByDrawing.get(drawing.id)
            const state=status?STATE[status.state]||status.state:rule?.enabled?'Active':rule?'Paused':'Drawing only'
            return <button type="button" key={drawing.id} className="cad-center-row" data-drawing-id={drawing.id} onClick={()=>onOpenDrawing(drawing)}>
              <span className="cad-center-ticker"><b>{drawing.ticker}</b><small>{drawing.interval} · {drawing.kind==='horizontal'?'Level':'Trend'}</small></span>
              <span className="cad-center-condition"><b>{ruleText(rule)}</b><small>{drawing.kind==='horizontal'?`$${fmt(drawing.points[0].price)}`:`${drawing.points[0].time} → ${drawing.points[1].time}`}</small></span>
              <span><b>${fmt(status?.projectedLinePrice)}</b><small>projected line</small></span>
              <span><b>${fmt(status?.latestClose)}</b><small>latest close</small></span>
              <span className="cad-center-distance"><b>{status?.state==='needs_review'?'Review':distance(status?.distancePct)}</b><small>{status?.state==='needs_review'?reviewReason(status.reviewReason):'distance'}</small></span>
              <span className={`cad-state cad-state-${status?.state||'paused'}`}>{state}</span>
            </button>
          })}
        </div>}
      </>}
    </div>
    <footer>Global alert state is a private sidecar. Evaluator health is derived from actual rule evaluation timestamps; Near Trigger is transparent line distance only and never changes StockScout or LEGACY scoring.</footer>
  </aside>
}