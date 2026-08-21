import {useMemo} from 'react'
import {useStockScoutData} from './data/StockScoutDataProvider'
import {useChartAlerts} from './ChartAlertsProvider'
import type {ChartAlertCondition,ChartAlertRule,ChartDrawing} from './deepvue/chartAlerts'

const CONDITION_LABEL:Record<ChartAlertCondition,string>={cross_above:'Cross ↑',cross_below:'Cross ↓',touch:'Touch'}
const fmt=(value:number|null|undefined,digits=2)=>typeof value==='number'&&Number.isFinite(value)?value.toFixed(digits):'—'

export default function ChartAlertsDock({open,onOpenChange}:{open:boolean;onOpenChange:(open:boolean)=>void}){
  const{selectedTicker}=useStockScoutData()
  const{snapshot,busy,error,tool,setTool,selectedDrawingId,selectDrawing,refresh,upsertRule,removeDrawing}=useChartAlerts()
  const ticker=selectedTicker.trim().toUpperCase()
  const drawings=useMemo(()=>snapshot.drawings.filter(drawing=>drawing.ticker===ticker),[snapshot.drawings,ticker])
  const ruleByDrawing=useMemo(()=>new Map(snapshot.rules.map(rule=>[rule.drawingId,rule])),[snapshot.rules])
  const statusByDrawing=useMemo(()=>new Map(snapshot.status.map(status=>[status.drawingId,status])),[snapshot.status])
  const events=useMemo(()=>snapshot.events.filter(event=>event.ticker===ticker).slice(0,10),[snapshot.events,ticker])

  if(!open)return null

  const saveCondition=async(drawing:ChartDrawing,value:string)=>{
    if(!drawing.id)return
    const existing=ruleByDrawing.get(drawing.id)
    if(value==='off'){
      if(existing)await upsertRule({...existing,enabled:false})
      return
    }
    const condition=value as ChartAlertCondition
    const rule:ChartAlertRule=existing?{
      ...existing,condition,source:condition==='touch'?'wick':'close',enabled:true,
    }:{
      drawingId:drawing.id,condition,source:condition==='touch'?'wick':'close',lifecycle:'rearm',enabled:true,notifyInApp:true,notifyTelegram:true,
    }
    await upsertRule(rule)
  }

  const toggleTelegram=async(drawing:ChartDrawing,checked:boolean)=>{
    if(!drawing.id)return
    const existing=ruleByDrawing.get(drawing.id)
    if(existing){await upsertRule({...existing,notifyTelegram:checked});return}
    await upsertRule({drawingId:drawing.id,condition:'touch',source:'wick',lifecycle:'rearm',enabled:false,notifyInApp:true,notifyTelegram:checked})
  }

  return <aside className="cad-dock cad-manager" aria-label="StockScout drawings and alerts">
    <header className="cad-head"><div><b>✏ DRAWINGS & ALERTS</b><span>{ticker||'No ticker selected'} · edit on main chart</span></div><button onClick={()=>onOpenChange(false)} aria-label="Close drawings and alerts">×</button></header>
    <div className="cad-controls cad-manager-tools"><div><button className={tool==='cursor'?'active':''} onClick={()=>setTool('cursor')}>↖ Cursor</button><button className={tool==='trendline'?'active':''} onClick={()=>setTool('trendline')}>↗ Trendline</button><button className={tool==='horizontal'?'active':''} onClick={()=>setTool('horizontal')}>— Horizontal</button></div><span>Use the visible D/W main Price chart. Drag a selected line or its handles to edit.</span></div>
    <section className="cad-list"><div className="cad-section-title"><b>LINES</b><span>{drawings.length} saved · {drawings.filter(drawing=>drawing.id&&ruleByDrawing.get(drawing.id)?.enabled).length} active</span></div>
      {drawings.length===0?<p className="cad-empty">No drawings for {ticker}. Choose Trendline or Horizontal, then draw directly on the main Price chart.</p>:drawings.map(drawing=>{
        if(!drawing.id)return null
        const rule=ruleByDrawing.get(drawing.id),status=statusByDrawing.get(drawing.id),selected=selectedDrawingId===drawing.id
        return <div className={`cad-row cad-manager-row ${selected?'selected':''}`} key={drawing.id} onClick={()=>selectDrawing(drawing.id||null)}>
          <div><b>{drawing.interval} · {drawing.kind==='horizontal'?`Horizontal $${fmt(drawing.points[0].price)}`:'Trendline'}</b><small>{drawing.points[0].time} → {drawing.points[1].time}{status?` · ${status.state.replace('_',' ')}`:''}</small></div>
          <select aria-label={`${ticker} alert condition`} disabled={busy} value={rule?.enabled?rule.condition:'off'} onClick={event=>event.stopPropagation()} onChange={event=>{event.stopPropagation();void saveCondition(drawing,event.target.value)}}><option value="off">Alert off</option><option value="cross_above">Cross ↑</option><option value="cross_below">Cross ↓</option><option value="touch">Touch</option></select>
          <label className="cad-telegram" onClick={event=>event.stopPropagation()}><input type="checkbox" checked={rule?.notifyTelegram??true} disabled={busy} onChange={event=>void toggleTelegram(drawing,event.target.checked)}/> Telegram</label>
          <button className="danger" disabled={busy} onClick={event=>{event.stopPropagation();if(window.confirm(`Delete ${ticker} drawing?`))void removeDrawing(drawing.id!)}}>Delete</button>
          <div className="cad-row-meta"><span>{rule?`${CONDITION_LABEL[rule.condition]} · ${rule.source} · ${rule.lifecycle==='one_shot'?'one shot':'re-arm'}`:'drawing only'}</span>{status?.state==='needs_review'&&<strong>{status.reviewReason||'needs review'}</strong>}{typeof status?.distancePct==='number'&&<em>{Math.abs(status.distancePct).toFixed(1)}% {status.distancePct>=0?'above':'below'} line</em>}</div>
        </div>
      })}
    </section>
    <section className="cad-events"><div className="cad-section-title"><b>RECENT TRIGGERS</b><button onClick={()=>void refresh()}>↻</button></div>{events.length===0?<p className="cad-empty">No triggered alerts for {ticker} yet.</p>:events.map(event=><article key={event.id}><b>🔔 {event.interval?`${event.interval} · `:''}{event.eventType==='break_up'?'Crossed above':event.eventType==='break_down'?'Crossed below':'Touched'} · {event.marketDate}</b><span>line {fmt(event.currentLinePrice)} · close {fmt(event.closePrice)}</span><small>Telegram: {event.telegramStatus.replace('_',' ')}</small></article>)}</section>
    {error&&<div className="cad-error">{error}</div>}
    <footer>Drawings and alert rules are private sidecar data. Evaluator uses the latest published StockScout chart bars; StockScout scoring and LEGACY remain untouched.</footer>
  </aside>
}
