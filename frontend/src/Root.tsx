import {useState} from 'react'
import DeepVueTerminal from './DeepVueTerminal'
import GroupsPage from './GroupsPage'

export default function Root(){
  const[view,setView]=useState<'terminal'|'groups'>('terminal')
  const openTicker=(ticker:string)=>{location.hash=ticker;setView('terminal')}
  if(view==='groups')return <GroupsPage onBack={()=>setView('terminal')} onOpenTicker={openTicker}/>
  return <><DeepVueTerminal/><button className="dv-groups-launch" onClick={()=>setView('groups')}>◎ Groups</button></>
}
