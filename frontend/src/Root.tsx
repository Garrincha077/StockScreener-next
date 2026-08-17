import {useRef,useState} from 'react'
import DeepVueTerminal from './DeepVueTerminal'
import GroupsPage from './GroupsPage'
import OriginalEngineDock from './OriginalEngineDock'
import {resetPanelSizes,useResizablePanels} from './useResizablePanels'
import './resizable-panels.css'

const ENGINE_WIDTH_KEY='stockscout-original-pane-width-v1'
const DEFAULT_ENGINE_WIDTH=420
const MIN_ENGINE_WIDTH=330
const MAX_ENGINE_WIDTH=650

function initialEngineWidth(){
  try{
    const value=Number(localStorage.getItem(ENGINE_WIDTH_KEY))
    return Number.isFinite(value)&&value>=MIN_ENGINE_WIDTH?value:DEFAULT_ENGINE_WIDTH
  }catch{return DEFAULT_ENGINE_WIDTH}
}
function clamp(value:number,min:number,max:number){return Math.max(min,Math.min(max,value))}

export default function Root(){
  const[view,setView]=useState<'terminal'|'groups'>('terminal')
  const[engineOpen,setEngineOpen]=useState(false)
  const[engineWidth,setEngineWidth]=useState(initialEngineWidth)
  const drag=useRef<{startX:number;startWidth:number;pointerId:number}|null>(null)
  useResizablePanels()

  const openTicker=(ticker:string)=>{location.hash=ticker;setView('terminal')}
  const maxEngineWidth=()=>Math.min(MAX_ENGINE_WIDTH,Math.max(MIN_ENGINE_WIDTH,window.innerWidth-700))
  const setAndPersistEngineWidth=(value:number)=>{
    const next=Math.round(clamp(value,MIN_ENGINE_WIDTH,maxEngineWidth()))
    setEngineWidth(next)
    try{localStorage.setItem(ENGINE_WIDTH_KEY,String(next))}catch{}
  }
  const startEngineResize=(event:React.PointerEvent<HTMLDivElement>)=>{
    if(window.innerWidth<=1200)return
    drag.current={startX:event.clientX,startWidth:engineWidth,pointerId:event.pointerId}
    event.currentTarget.setPointerCapture?.(event.pointerId)
    document.body.classList.add('oe-is-resizing')
    const move=(e:PointerEvent)=>{
      if(!drag.current)return
      const next=drag.current.startWidth+(drag.current.startX-e.clientX)
      setEngineWidth(Math.round(clamp(next,MIN_ENGINE_WIDTH,maxEngineWidth())))
    }
    const finish=()=>{
      if(drag.current)setAndPersistEngineWidth(engineWidth)
      drag.current=null
      document.body.classList.remove('oe-is-resizing')
      window.removeEventListener('pointermove',move)
      window.removeEventListener('pointerup',finish)
      window.removeEventListener('pointercancel',finish)
    }
    window.addEventListener('pointermove',move)
    window.addEventListener('pointerup',finish)
    window.addEventListener('pointercancel',finish)
    event.preventDefault()
  }
  const resizeWithKeyboard=(event:React.KeyboardEvent<HTMLDivElement>)=>{
    if(!['ArrowLeft','ArrowRight','Home'].includes(event.key))return
    event.preventDefault()
    if(event.key==='Home'){setAndPersistEngineWidth(DEFAULT_ENGINE_WIDTH);return}
    const step=event.shiftKey?80:30
    setAndPersistEngineWidth(engineWidth+(event.key==='ArrowLeft'?step:-step))
  }

  return <>
    {view==='groups'?<GroupsPage onBack={()=>setView('terminal')} onOpenTicker={openTicker}/>:<div className={`ss-root-shell ${engineOpen?'oe-open':''}`} style={{'--oe-pane-width':`${engineWidth}px`} as React.CSSProperties}>
      <div className="ss-terminal-host"><DeepVueTerminal/></div>
      {engineOpen&&<div className="oe-pane-splitter" role="separator" aria-label="Resize Original Engine panel" aria-orientation="vertical" tabIndex={0} onPointerDown={startEngineResize} onKeyDown={resizeWithKeyboard} onDoubleClick={()=>setAndPersistEngineWidth(DEFAULT_ENGINE_WIDTH)} title="Drag left/right to resize · double-click to reset"><span>↔</span></div>}
      <OriginalEngineDock open={engineOpen} onOpenChange={setEngineOpen} embedded={engineOpen}/>
      <button className="dv-groups-launch" onClick={()=>setView('groups')}>◎ Groups</button>
    </div>}
    <button className="ss-layout-reset" onClick={()=>{resetPanelSizes();setAndPersistEngineWidth(DEFAULT_ENGINE_WIDTH)}} title="Reset all resized panels to their default size">↺ Reset layout</button>
  </>
}
