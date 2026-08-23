import {useEffect,useRef,useState,type CSSProperties,type KeyboardEvent,type PointerEvent as ReactPointerEvent} from 'react'
import DeepVueTerminal from './DeepVueTerminal'
import LegacyTerminal from './LegacyTerminal'
import FactorRegimePage from './FactorRegimePage'
import GroupsPage from './GroupsPage'
import OriginalEngineDock from './OriginalEngineDock'
import LegacyConfirmationBadge from './LegacyConfirmationBadge'
import Phase4ReviewBar from './Phase4ReviewBar'
import ChartAlertsDock from './ChartAlertsDock'
import ChartAlertsCenter from './ChartAlertsCenter'
import {useChartAlerts} from './ChartAlertsProvider'
import type {ChartDrawing} from './deepvue/chartAlerts'
import {useStockScoutData} from './data/StockScoutDataProvider'
import {resetPanelSizes,useResizablePanels} from './useResizablePanels'
import './resizable-panels.css'
import './legacy-confirmation.css'
import './phase4-review.css'
import './chart-alerts.css'

const ENGINE_WIDTH_KEY='stockscout-original-pane-width-v1'
const LAYER_KEY='stockscout-active-layer-v1'
const DEFAULT_ENGINE_WIDTH=420
const MIN_ENGINE_WIDTH=330
const MAX_ENGINE_WIDTH=650

type Layer='stockscout'|'legacy'|'factors'

function initialEngineWidth(){
  try{
    const value=Number(localStorage.getItem(ENGINE_WIDTH_KEY))
    return Number.isFinite(value)&&value>=MIN_ENGINE_WIDTH?value:DEFAULT_ENGINE_WIDTH
  }catch{return DEFAULT_ENGINE_WIDTH}
}
function initialLayer():Layer{
  try{
    const value=localStorage.getItem(LAYER_KEY)
    return value==='legacy'||value==='factors'?value:'stockscout'
  }catch{return'stockscout'}
}
function clamp(value:number,min:number,max:number){return Math.max(min,Math.min(max,value))}
function clickButton(selector:string,label:string){
  const button=[...document.querySelectorAll<HTMLButtonElement>(selector)].find(item=>item.textContent?.trim()===label)
  button?.click()
}
function focusDrawingChart(drawing:ChartDrawing){
  clickButton('.dv-top nav button','Screener')
  requestAnimationFrame(()=>{
    clickButton('.dv-chartcontrols button','Price')
    clickButton('.dv-chartcontrols button',drawing.interval==='D'?'Daily':'Weekly')
  })
}

export default function Root(){
  const{selectTicker}=useStockScoutData()
  const{snapshot,selectDrawing}=useChartAlerts()
  const[view,setView]=useState<'terminal'|'groups'>('terminal')
  const[layer,setLayer]=useState<Layer>(initialLayer)
  const[engineOpen,setEngineOpen]=useState(false)
  const[alertsOpen,setAlertsOpen]=useState(false)
  const[alertsCenterOpen,setAlertsCenterOpen]=useState(false)
  const[engineWidth,setEngineWidth]=useState(initialEngineWidth)
  const drag=useRef<{startX:number;startWidth:number;currentWidth:number;pointerId:number}|null>(null)
  const unreadTriggerCount=snapshot.events.filter(event=>!event.readAt).length
  useResizablePanels()
  useEffect(()=>{try{localStorage.setItem(LAYER_KEY,layer)}catch{}},[layer])
  useEffect(()=>{
    const active=alertsOpen&&layer==='stockscout'&&view==='terminal'
    document.body.classList.toggle('cad-manager-open',active)
    return()=>document.body.classList.remove('cad-manager-open')
  },[alertsOpen,layer,view])

  const chooseLayer=(next:Layer)=>{
    setLayer(next)
    setView('terminal')
    if(next!=='stockscout'){
      setEngineOpen(false)
      setAlertsOpen(false)
      setAlertsCenterOpen(false)
    }
  }
  const openTicker=(ticker:string)=>{selectTicker(ticker);setLayer('stockscout');setView('terminal')}
  const openAlertDrawing=(drawing:ChartDrawing)=>{
    selectTicker(drawing.ticker);selectDrawing(drawing.id||null);setLayer('stockscout');setView('terminal');setEngineOpen(false);setAlertsCenterOpen(false);setAlertsOpen(true);focusDrawingChart(drawing)
  }
  const focusSelectedTickerChart=()=>{
    setLayer('stockscout');setView('terminal');setEngineOpen(false);setAlertsOpen(false);setAlertsCenterOpen(false)
    requestAnimationFrame(()=>{clickButton('.dv-top nav button','Screener');requestAnimationFrame(()=>clickButton('.dv-chartcontrols button','Price'))})
  }
  const openSelectedTickerAlerts=()=>{
    setLayer('stockscout');setView('terminal');setEngineOpen(false);setAlertsCenterOpen(false);setAlertsOpen(true)
    requestAnimationFrame(()=>clickButton('.dv-top nav button','Screener'))
  }
  const maxEngineWidth=()=>Math.min(MAX_ENGINE_WIDTH,Math.max(MIN_ENGINE_WIDTH,window.innerWidth-700))
  const normalizedEngineWidth=(value:number)=>Math.round(clamp(value,MIN_ENGINE_WIDTH,maxEngineWidth()))
  const setAndPersistEngineWidth=(value:number)=>{
    const next=normalizedEngineWidth(value)
    setEngineWidth(next)
    try{localStorage.setItem(ENGINE_WIDTH_KEY,String(next))}catch{}
  }
  const setEnginePaneOpen=(open:boolean)=>{setEngineOpen(open);if(open){setAlertsOpen(false);setAlertsCenterOpen(false)}}
  const toggleAlerts=()=>setAlertsOpen(current=>{const next=!current;if(next){setEngineOpen(false);setAlertsCenterOpen(false)}return next})
  const toggleAlertsCenter=()=>setAlertsCenterOpen(current=>{const next=!current;if(next){setEngineOpen(false);setAlertsOpen(false)}return next})
  const startEngineResize=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(window.innerWidth<=1200)return
    drag.current={startX:event.clientX,startWidth:engineWidth,currentWidth:engineWidth,pointerId:event.pointerId}
    event.currentTarget.setPointerCapture?.(event.pointerId)
    document.body.classList.add('oe-is-resizing')
    const move=(e:PointerEvent)=>{
      if(!drag.current)return
      const next=normalizedEngineWidth(drag.current.startWidth+(drag.current.startX-e.clientX))
      drag.current.currentWidth=next
      setEngineWidth(next)
    }
    const finish=()=>{
      const finalWidth=drag.current?.currentWidth
      drag.current=null
      document.body.classList.remove('oe-is-resizing')
      window.removeEventListener('pointermove',move)
      window.removeEventListener('pointerup',finish)
      window.removeEventListener('pointercancel',finish)
      if(finalWidth!=null)setAndPersistEngineWidth(finalWidth)
    }
    window.addEventListener('pointermove',move)
    window.addEventListener('pointerup',finish)
    window.addEventListener('pointercancel',finish)
    event.preventDefault()
  }
  const resizeWithKeyboard=(event:KeyboardEvent<HTMLDivElement>)=>{
    if(!['ArrowLeft','ArrowRight','Home'].includes(event.key))return
    event.preventDefault()
    if(event.key==='Home'){setAndPersistEngineWidth(DEFAULT_ENGINE_WIDTH);return}
    const step=event.shiftKey?80:30
    setAndPersistEngineWidth(engineWidth+(event.key==='ArrowLeft'?step:-step))
  }

  const stockscout=view==='groups'?<GroupsPage onBack={()=>setView('terminal')} onOpenTicker={openTicker}/>:<>
    <Phase4ReviewBar onOpenChart={focusSelectedTickerChart} onOpenTickerAlerts={openSelectedTickerAlerts}/>
    <div className={`ss-root-shell ${engineOpen?'oe-open':''} ${alertsOpen?'cad-open':''}`} style={{'--oe-pane-width':`${engineWidth}px`} as CSSProperties}>
      <div className="ss-terminal-host"><DeepVueTerminal/></div>
      {engineOpen&&<div className="oe-pane-splitter" role="separator" aria-label="Resize LEGACY source inspector" aria-orientation="vertical" tabIndex={0} onPointerDown={startEngineResize} onKeyDown={resizeWithKeyboard} onDoubleClick={()=>setAndPersistEngineWidth(DEFAULT_ENGINE_WIDTH)} title="Drag left/right to resize · double-click to reset"><span>↔</span></div>}
      <OriginalEngineDock open={engineOpen} onOpenChange={setEnginePaneOpen} embedded={engineOpen}/>
      <button className="dv-groups-launch" onClick={()=>{setAlertsOpen(false);setAlertsCenterOpen(false);setView('groups')}}>◎ Groups</button>
    </div>
  </>

  const content=layer==='legacy'?<LegacyTerminal/>:layer==='factors'?<FactorRegimePage/>:stockscout

  return <>
    <div className="ss-layer-switch" aria-label="Signal layer">
      <button className={layer==='stockscout'?'active':''} onClick={()=>chooseLayer('stockscout')}>STOCKSCOUT</button>
      <button className={`legacy ${layer==='legacy'?'active':''}`} onClick={()=>chooseLayer('legacy')}>LEGACY</button>
      <button className={`factors ${layer==='factors'?'active':''}`} onClick={()=>chooseLayer('factors')}>FACTORS</button>
    </div>
    {layer==='stockscout'&&view==='terminal'&&<LegacyConfirmationBadge/>}
    {content}
    {layer==='stockscout'&&view==='terminal'&&<>
      <button className={`ss-alert-center-launch ${alertsCenterOpen?'active':''}`} onClick={toggleAlertsCenter}>🔔 All Alerts{unreadTriggerCount?` · ${unreadTriggerCount}`:''}</button>
      <button className={`ss-alerts-launch ${alertsOpen?'active':''}`} onClick={toggleAlerts}>✏ Ticker Alerts</button>
      <ChartAlertsDock open={alertsOpen} onOpenChange={setAlertsOpen}/>
      <ChartAlertsCenter open={alertsCenterOpen} onOpenChange={setAlertsCenterOpen} onOpenDrawing={openAlertDrawing}/>
    </>}
    <button className="ss-layout-reset" onClick={()=>{resetPanelSizes();setAndPersistEngineWidth(DEFAULT_ENGINE_WIDTH)}} title="Reset all resized desktop panels to their default size">↺ Reset layout</button>
  </>
}
