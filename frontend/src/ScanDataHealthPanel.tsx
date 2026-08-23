import {useMemo,useState} from 'react'
import type {StockScoutCore,StockScoutManifest} from './data/StockScoutDataProvider'
import type {ValidationStatus} from './phase4Review'
import {scanDataHealth,scanIdentity} from './scanDataHealth'
import './scan-data-health.css'

const shortSha=(value:string|null)=>value?value.slice(0,12):'unknown'
const fmtTime=(value:string|null)=>{
  if(!value)return'unknown'
  const date=new Date(value)
  return Number.isFinite(date.getTime())?date.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):value
}
const refText=(repo:string|null,ref:string|null)=>repo?`${repo}${ref?`@${ref}`:''}`:'repository not published'

export default function ScanDataHealthPanel({core,manifest,validation}:{core:StockScoutCore|null;manifest:StockScoutManifest|null;validation:ValidationStatus|null}){
  const[open,setOpen]=useState(false)
  const health=useMemo(()=>scanDataHealth(core,manifest,validation),[core,manifest,validation])
  const identity=useMemo(()=>scanIdentity(manifest),[manifest])
  const age=health.ageHours===null?'age unknown':`${Math.round(health.ageHours)}h old`
  const validationText=validation?.conclusion?`${validation.conclusion}${validation.run_id?` #${validation.run_id}`:''}`:'not published'

  return <div className={`p4-health sdh ${health.level}`} data-status={health.status}>
    <button className="sdh-trigger" type="button" onClick={()=>setOpen(value=>!value)} aria-expanded={open} aria-controls="stockscout-scan-provenance" title={health.detail}>
      <span className="sdh-dot"/>
      <strong>{health.status}</strong>
      <b>Scan {identity.session||'unknown'}</b>
      <small>{age}</small>
      <span>{manifest?.universe?.toLocaleString()||core?.universe.length.toLocaleString()||'—'} stocks</span>
      <span>SHA {shortSha(identity.sourceSha)}</span>
      {identity.sourceRunId&&<span>Source #{identity.sourceRunId}</span>}
      <i>{open?'▴':'▾'}</i>
    </button>
    {open&&<section className="sdh-panel" id="stockscout-scan-provenance" aria-label="Scan provenance and data health">
      <header><div><small>AUTHORITATIVE DATA IDENTITY</small><b>{identity.id}</b></div><span className={`sdh-status ${health.status.toLowerCase()}`}>{health.status}</span></header>
      <div className="sdh-identity-grid">
        <div><small>Market session</small><b>{identity.session||'unknown'}</b><span>{manifest?.marketSession?.status||'status unknown'} · {manifest?.marketSession?.timezone||'timezone unknown'}</span></div>
        <div><small>Source generatedAt</small><b>{fmtTime(identity.generatedAt)}</b><span>{identity.generatedAt||'not published'}</span></div>
        <div><small>Canonical source SHA</small><b>{shortSha(identity.sourceSha)}</b><span title={identity.sourceSha||''}>{identity.sourceSha||'not published'}</span></div>
        <div><small>Source workflow</small><b>{identity.sourceRunId?`#${identity.sourceRunId}`:'not embedded'}</b><span>{identity.sourceRunId?`${refText(identity.sourceRepository,identity.sourceRef)}${identity.sourceCommit?` · ${shortSha(identity.sourceCommit)}`:''}`:'run id is not carried in this manifest'}</span></div>
        <div><small>Validation</small><b>{validationText}</b><span>{validation?.head_sha?`head ${validation.head_sha.slice(0,12)}`:'validation head not published'}</span></div>
        <div><small>Publication model</small><b>{manifest?.provenance?.publication?.kind||'unknown'}</b><span>{manifest?.provenance?.publication?.model||manifest?.model||'model unknown'}</span></div>
        <div><small>Publication workflow</small><b>{identity.publicationRunId?`#${identity.publicationRunId}`:'not embedded'}</b><span>{identity.publicationRunId?`${refText(identity.publicationRepository,identity.publicationRef)}${identity.publicationCommitSha?` · ${shortSha(identity.publicationCommitSha)}`:''}`:'publication run is not carried in this manifest'}</span></div>
      </div>
      <div className="sdh-coverage" aria-label="Dataset coverage">
        {health.coverage.map(row=><div className={row.healthy?'healthy':'partial'} key={row.key}><span><b>{row.label}</b><small>minimum {row.minimumPct}%</small></span><strong>{row.coveragePct.toFixed(1)}%</strong><em>{row.coverage.toLocaleString()} rows</em></div>)}
      </div>
      <footer><b>{health.status}</b><span>{health.detail}</span></footer>
    </section>}
  </div>
}
