import {useState} from 'react'
import DeepVueTerminal from './DeepVueTerminal'
import GroupsPage from './GroupsPage'
import {resetPanelSizes,useResizablePanels} from './useResizablePanels'
import './resizable-panels.css'

export default function Root(){
  const[view,setView]=useState<'terminal'|'groups'>('terminal')
  useResizablePanels()
  const openTicker=(ticker:string)=>{location.hash=ticker;setView('terminal')}
  return <>
    {view==='groups'?<GroupsPage onBack={()=>setView('terminal')} onOpenTicker={openTicker}/>:<><DeepVueTerminal/><button className="dv-groups-launch" onClick={()=>setView('groups')}>◎ Groups</button></>}
    <button className="ss-layout-reset" onClick={resetPanelSizes} title="Reset all resized panels to their default size">↺ Reset layout</button>
  </>
}
