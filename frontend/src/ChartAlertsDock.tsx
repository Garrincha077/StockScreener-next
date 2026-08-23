import {useMemo} from 'react'
import {useStockScoutData} from './data/StockScoutDataProvider'
import {useChartAlerts} from './ChartAlertsProvider'
import type {ChartAlertCondition,ChartAlertLifecycle,ChartAlertRule,ChartAlertSource,ChartDrawing} from './deepvue/chartAlerts'

const CONDITION_LABEL:Record<ChartAlertCondition,string>={cross_above:'Cross Above',cross_below:'Cross Below',touch:'Touch'}
const STATE_LABEL:Record<string,string>={active:'Active',approaching:'Approaching',triggered:'Triggered',paused:'Paused',needs_review:'Needs review'}
const fmt=(value:number|null|undefined,digits=2)=>typeof value==='number'&&Number.isFinite(value)?value.toFixed(digits):'—'
const distanceText=(value:number|null|undefined)=>typeof value==='number'&&Number.isFinite(value)?`${Math.abs(value).toFixed(1)}% ${value>=0?'above':'below'}`:'—'

export default function ChartAlertsDock({open,onOpenChange}:{open:boolean;onOpenChange:(open:boolean)=>void}){
  const{selectedTicker}=useStockScoutData()
  const{snapshot,busy,error,tool,setTool,selectedDrawingId,selectDrawing,refresh,upsertRule,removeRule,removeDrawing}=useChartAlerts()
  const ticker=selectedTicker.trim().toUpperCase()
  const drawings=useMemo(()=>snapshot.drawings.filter(drawing=>drawing.ticker===ticker),[snapshot.drawings,ticker])
  const ruleByDrawing=useMemo(()=>new Map(snapshot.rules.map(rule=>[rule.drawingId,rule])),[snapshot.rules])
  const statusByDrawing=useMemo(()=>new Map(snapshot.status.map(status=>[status.drawingId,status])),[snapshot.status])
  const events=useMemo(()=>snapshot.events.filter(event=>event.ticker===ticker).slice(0,10),[snapshot.events,ticker])
  const selectedDrawing=drawings.find(drawing=>drawing.id===selectedDrawingId)||null
  const selectedRule=selectedDrawing?.id?ruleByDrawing.get(selectedDrawing.id):undefined
  const selectedStatus=selectedDrawing?.id?statusByDrawing.get(selectedDrawing.id):undefined
  const activeCount=drawings.filter(drawing=>drawing.id&&ruleByDrawing.get(drawing.id)?.enabled).length

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
      ...existing,condition,source:condition==='touch'?'wick':existing.source,enabled:true,
    }:{
      drawingId:drawing.id,condition,source:condition==='touch'?'wick':'close',lifecycle:'rearm',enabled:true,notifyInApp:true,notifyTelegram:true,
    }
    await upsertRule(rule)
  }

  const patchRule=async(rule:ChartAlertRule,patch:Partial<Pick<ChartAlertRule,'source'|'lifecycle'|'enabled'|'notifyInApp'|'notifyTelegram'>>)=>{
    await upsertRule({...rule,...patch})
  }

  const deleteRule=async(rule:ChartAlertRule)=>{
    if(!rule.id)return
    if(window.confirm(`Delete alert rule for ${ticker}? The drawing will stay on the chart.`))await removeRule(rule.id)
  }

  const deleteDrawing=async(drawing:ChartDrawing)=>{
    if(!drawing.id)return
    if(window.confirm(`Delete ${ticker} ${drawing.kind==='horizontal'?'level':'trendline'} and its alert rule?`))await removeDrawing(drawing.id)
  }

  return <aside className="cad-dock cad-manager" aria-label="StockScout drawings and alerts">
    <header className="cad-head"><div><b>✏ ALERT MANAGER</b><span>{ticker||'No ticker selected'} · {drawings.length} drawings · {activeCount} active</span></div><button onClick={()=>onOpenChange(false)} aria-label="Close drawings and alerts">×</button></header>

    <div className="cad-controls cad-manager-tools"><div><button className={tool==='cursor'?'active':''} onClick={()=>setTool('cursor')}>↖ Cursor</button><button className={tool==='trendline'?'active':''} onClick={()=>setTool('trendline')}>↗ Trend</button><button className={tool==='horizontal'?'active':''} onClick={()=>setTool('horizontal')}>— Level</button></div><span>Draw and drag on the main D/W Price chart. This panel manages rules and status.</span></div>

    <section className="cad-list cad-manager-lines"><div className="cad-section-title"><b>{ticker} DRAWINGS</b><span>{drawings.length} saved</span></div>
      {drawings.length===0?<p className="cad-empty">No drawings for {ticker}. Choose Trend or Level and draw directly on the main Price chart.</p>:drawings.map(drawing=>{
        if(!drawing.id)return null
        const rule=ruleByDrawing.get(drawing.id),status=statusByDrawing.get(drawing.id),selected=selectedDrawingId===drawing.id
        return <button type="button" className={`cad-manager-row ${selected?'selected':''}`} key={drawing.id} onClick={()=>selectDrawing(drawing.id||null)}>
          <span className="cad-line-identity"><b>{drawing.interval} · {drawing.kind==='horizontal'?`Level $${fmt(drawing.points[0].price)}`:'Trend'}</b><small>{drawing.points[0].time} → {drawing.points[1].time}</small></span>
          <span className={`cad-state cad-state-${status?.state||'paused'}`}>{status?STATE_LABEL[status.state]||status.state:rule?.enabled?'Active':'Drawing only'}</span>
          <span className="cad-line-rule">{rule?`${CONDITION_LABEL[rule.condition]} · ${rule.source==='close'?'Close':'Wick'}`:'No alert rule'}</span>
          <span className="cad-line-distance">{status?.state==='needs_review'?(status.reviewReason||'review required'):distanceText(status?.distancePct)}</span>
        </button>
      })}
    </section>

    <section className="cad-selected" aria-label="Selected drawing alert settings">
      <div className="cad-section-title"><b>SELECTED DRAWING</b>{selectedDrawing&&<span>{selectedDrawing.interval} · {selectedDrawing.kind==='horizontal'?'Level':'Trend'}</span>}</div>
      {!selectedDrawing?<p className="cad-empty">Select a line on the chart or from the list above to manage its alert.</p>:<>
        <div className="cad-status-grid">
          <div><small>Status</small><strong className={`cad-state-text cad-state-${selectedStatus?.state||'paused'}`}>{selectedStatus?STATE_LABEL[selectedStatus.state]||selectedStatus.state:selectedRule?.enabled?'Waiting':'Drawing only'}</strong></div>
          <div><small>Projected line</small><strong>${fmt(selectedStatus?.projectedLinePrice)}</strong></div>
          <div><small>Latest close</small><strong>${fmt(selectedStatus?.latestClose)}</strong></div>
          <div><small>Distance</small><strong>{distanceText(selectedStatus?.distancePct)}</strong></div>
        </div>
        {selectedStatus?.latestMarketDate&&<div className="cad-evaluated">Last evaluated market bar: <b>{selectedStatus.latestMarketDate}</b>{selectedStatus.evaluatedAt?` · ${new Date(selectedStatus.evaluatedAt).toLocaleString()}`:''}</div>}
        {selectedStatus?.state==='needs_review'&&<div className="cad-review-reason">⚠ {selectedStatus.reviewReason||'Drawing needs review before reliable evaluation.'}</div>}

        <div className="cad-rule-grid">
          <label>Condition<select aria-label={`${ticker} alert condition`} disabled={busy} value={selectedRule?.enabled?selectedRule.condition:'off'} onChange={event=>void saveCondition(selectedDrawing,event.target.value)}><option value="off">Alert off</option><option value="cross_above">Cross Above</option><option value="cross_below">Cross Below</option><option value="touch">Touch</option></select></label>
          <label>Price source<select aria-label={`${ticker} alert source`} disabled={busy||!selectedRule} value={selectedRule?.source||'close'} onChange={event=>selectedRule&&void patchRule(selectedRule,{source:event.target.value as ChartAlertSource})}><option value="close" disabled={selectedRule?.condition==='touch'}>Close</option><option value="wick">Wick / High-Low</option></select></label>
          <label>Lifecycle<select aria-label={`${ticker} alert lifecycle`} disabled={busy||!selectedRule} value={selectedRule?.lifecycle||'rearm'} onChange={event=>selectedRule&&void patchRule(selectedRule,{lifecycle:event.target.value as ChartAlertLifecycle})}><option value="rearm">Auto re-arm</option><option value="one_shot">One shot</option></select></label>
        </div>

        <div className="cad-rule-toggles">
          <label><input type="checkbox" checked={selectedRule?.enabled??false} disabled={busy||!selectedRule} onChange={event=>selectedRule&&void patchRule(selectedRule,{enabled:event.target.checked})}/> Active</label>
          <label><input type="checkbox" checked={selectedRule?.notifyInApp??true} disabled={busy||!selectedRule} onChange={event=>selectedRule&&void patchRule(selectedRule,{notifyInApp:event.target.checked})}/> In-app</label>
          <label><input type="checkbox" checked={selectedRule?.notifyTelegram??true} disabled={busy||!selectedRule} onChange={event=>selectedRule&&void patchRule(selectedRule,{notifyTelegram:event.target.checked})}/> Telegram</label>
        </div>

        <div className="cad-selected-actions">
          {selectedRule?.id&&<button disabled={busy} onClick={()=>void deleteRule(selectedRule)}>Delete alert rule</button>}
          <button className="danger" disabled={busy} onClick={()=>void deleteDrawing(selectedDrawing)}>Delete drawing</button>
        </div>
        <small className="cad-selected-note">Deleting an alert rule keeps the line. Deleting the drawing removes the line and its attached rule.</small>
      </>}
    </section>

    <section className="cad-events"><div className="cad-section-title"><b>RECENT TRIGGERS · {ticker}</b><button onClick={()=>void refresh()}>↻</button></div>{events.length===0?<p className="cad-empty">No triggered alerts for {ticker} yet.</p>:events.map(event=><article key={event.id}><b>🔔 {event.interval?`${event.interval} · `:''}{event.eventType==='break_up'?'Crossed above':event.eventType==='break_down'?'Crossed below':'Touched'} · {event.marketDate}</b><span>line {fmt(event.currentLinePrice)} · close {fmt(event.closePrice)}</span><small>Telegram: {event.telegramStatus.replace('_',' ')}</small></article>)}</section>
    {error&&<div className="cad-error">{error}</div>}
    <footer>Private sidecar only. The evaluator uses published D/W chart bars; StockScout scoring and frozen LEGACY remain untouched.</footer>
  </aside>
}
