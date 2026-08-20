import {useEffect,useState} from 'react'
import type {LegacyConfirmationSidecar,LegacyConfirmationStatus} from './deepvue/runtime'

type Manifest={generatedAt?:string|null;legacyConfirmationFile?:string|null}
type BadgeEntry={status:LegacyConfirmationStatus;available:boolean;reasons?:string[]}

function currentTicker(){return location.hash.replace('#','').trim().toUpperCase()}

export default function LegacyConfirmationBadge(){
  const[ticker,setTicker]=useState(currentTicker)
  const[entries,setEntries]=useState<Record<string,BadgeEntry>>({})
  const[ready,setReady]=useState(false)

  useEffect(()=>{
    let live=true
    const controller=new AbortController()
    const load=async()=>{
      try{
        const manifestResponse=await fetch(`./data/manifest.json?t=${Date.now()}`,{cache:'no-store',signal:controller.signal})
        if(!manifestResponse.ok)throw new Error(`manifest HTTP ${manifestResponse.status}`)
        const manifest=await manifestResponse.json() as Manifest
        const sidecarFile=manifest.legacyConfirmationFile||'shadow/legacy-confirmation.json'
        const sidecarResponse=await fetch(`./data/${sidecarFile}?t=${Date.now()}`,{cache:'no-store',signal:controller.signal})
        if(!sidecarResponse.ok)throw new Error(`LEGACY sidecar HTTP ${sidecarResponse.status}`)
        const sidecar=await sidecarResponse.json() as LegacyConfirmationSidecar
        if(sidecar.affectsStockScout!==false)throw new Error('LEGACY sidecar is not shadow-only')
        if(!manifest.generatedAt||sidecar.source?.generatedAt!==manifest.generatedAt)throw new Error('LEGACY sidecar snapshot mismatch')
        if(live){setEntries(sidecar.byTicker||{});setReady(true)}
      }catch(error){
        if(live&&!controller.signal.aborted){setEntries({});setReady(false)}
      }
    }
    load()
    return()=>{live=false;controller.abort()}
  },[])

  useEffect(()=>{
    const sync=()=>setTicker(currentTicker())
    sync()
    window.addEventListener('hashchange',sync)
    window.addEventListener('popstate',sync)
    const timer=window.setInterval(sync,500)
    return()=>{window.removeEventListener('hashchange',sync);window.removeEventListener('popstate',sync);window.clearInterval(timer)}
  },[])

  const entry=ticker?entries[ticker]:undefined
  if(!ready||!ticker||!entry)return null
  const reasons=(entry.reasons||[]).join(' · ')
  return <div className={`lc-shadow-badge lc-${entry.status.toLowerCase()}`} title={reasons||'Frozen LEGACY shadow confirmation'} aria-label={`LEGACY confirmation ${entry.status} for ${ticker}`}>
    <span>LEGACY</span><b>{entry.status}</b><small>{ticker}</small>
  </div>
}
