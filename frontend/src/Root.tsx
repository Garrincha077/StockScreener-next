import {useEffect,useState} from 'react'
import DeepVueTerminal from './DeepVueTerminal'
import LegacyTerminal from './LegacyTerminal'
import FactorRegimePage from './FactorRegimePage'
import {StockScoutDataProvider,useStockScoutData} from './data/StockScoutDataProvider'
import DrawingAlertsPanel from './DrawingAlertsPanel'
import IndustryGroupsPanel from './IndustryGroupsPanel'
import './phase4-review.css'
import './user-alerts.css'

type Layer='stockscout'|'legacy'|'factors'

function App(){
  const{reload}=useStockScoutData()
  const[engineOpen,setEngineOpen]=useState(false)
  const[alertsOpen,setAlertsOpen]=useState(false)
  const[groupsOpen,setGroupsOpen]=useState(false)
  const[layer,setLayer]=useState<Layer>(()=>{
    const saved=sessionStorage.getItem('stockscout-signal-layer')
    return saved==='legacy'||saved==='factors'?saved:'stockscout'
  })
  useEffect(()=>{sessionStorage.setItem('stockscout-signal-layer',layer)},[layer])
  useEffect(()=>{(window as any).__stockscoutSetSignalLayer=(next:Layer)=>{if(next==='stockscout'||next==='legacy'||next==='factors'){setEngineOpen(false);setLayer(next)}};return()=>{delete (window as any).__stockscoutSetSignalLayer}},[])
  const content=layer==='legacy'?<LegacyTerminal/>:layer==='factors'?<FactorRegimePage/>:<DeepVueTerminal onOpenEngine={()=>setEngineOpen(true)}/>

  return <>
    {content}
    {layer==='stockscout'?<div className="ss-utility-switches">
      <button type="button" className={`ss-util-btn groups ${groupsOpen?'active':''}`} onClick={()=>setGroupsOpen(open=>!open)}>Groups</button>
      <button type="button" className={`ss-util-btn alerts ${alertsOpen?'active':''}`} onClick={()=>setAlertsOpen(open=>!open)}>Alerts</button>
    </div>:null}
    {groupsOpen&&layer==='stockscout'?<IndustryGroupsPanel onClose={()=>setGroupsOpen(false)}/>:null}
    {alertsOpen&&layer==='stockscout'?<DrawingAlertsPanel onClose={()=>setAlertsOpen(false)}/>:null}
    {engineOpen&&layer==='stockscout'?<div className="popup-overlay dv-engine-overlay" onClick={()=>setEngineOpen(false)}>
      <div className="popup dv-engine-popup" onClick={event=>event.stopPropagation()}>
        <button className="popup-close" onClick={()=>setEngineOpen(false)}>×</button>
        <LegacyTerminal/>
      </div>
    </div>:null}
    <div className="ss-layer-switch" role="group" aria-label="Signal model">
      <button className={layer==='stockscout'?'active':''} onClick={()=>{setEngineOpen(false);setLayer('stockscout')}}>STOCKSCOUT</button>
      <button className={`${layer==='legacy'?'active ':''}legacy`} onClick={()=>{setEngineOpen(false);setLayer('legacy')}}>LEGACY</button>
      <button className={`${layer==='factors'?'active ':''}factors`} onClick={()=>{setEngineOpen(false);setLayer('factors')}}>FACTORS</button>
    </div>
    {layer!=='factors'?<button className="ss-layout-reset" onClick={()=>{sessionStorage.removeItem('stockscout-signal-layer');location.hash='';setLayer('stockscout');reload()}} title="Reset layout/data cache">Reset</button>:null}
  </>
}

export default function Root(){return <StockScoutDataProvider><App/></StockScoutDataProvider>}
