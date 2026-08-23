import type {StockScoutCore,StockScoutManifest,AssetDescriptor} from './data/StockScoutDataProvider'
import {dataHealth,type ReviewManifest,type ReviewPayload,type ValidationStatus} from './phase4Review.ts'

export type ScanHealthStatus='HEALTHY'|'PARTIAL'|'STALE'|'MISMATCH'|'ERROR'
export type CoverageRow={key:string;label:string;coverage:number;coveragePct:number;minimumPct:number;healthy:boolean}

const minimumByAsset:Record<string,number>={
  core:100,
  legacyIndex:100,
  legacyDetails:100,
  legacyConfirmation:100,
  charts:95,
}
const labels:Record<string,string>={
  core:'Core',legacyIndex:'LEGACY index',legacyDetails:'LEGACY detail',legacyConfirmation:'LEGACY confirmation',charts:'Charts',
}

export function scanCoverageRows(manifest:StockScoutManifest|null):CoverageRow[]{
  if(!manifest?.assets)return[]
  return Object.entries(minimumByAsset).map(([key,minimumPct])=>{
    const asset=(manifest.assets as unknown as Record<string,AssetDescriptor>)[key]
    const coverage=Number(asset?.coverage??0)
    const coveragePct=Number(asset?.coveragePct??0)
    return{key,label:labels[key]||key,coverage,coveragePct,minimumPct,healthy:Number.isFinite(coveragePct)&&coveragePct>=minimumPct}
  })
}

export function scanDataHealth(core:StockScoutCore|null,manifest:StockScoutManifest|null,validation:ValidationStatus|null,nowMs=Date.now()){
  const base=dataHealth(core as ReviewPayload|null,manifest as ReviewManifest|null,validation,nowMs)
  const coverage=scanCoverageRows(manifest)
  const coverageIssues=coverage.filter(row=>!row.healthy)
  let status:ScanHealthStatus
  if(!core||base.label==='Data unavailable')status='ERROR'
  else if(base.label==='Snapshot mismatch')status='MISMATCH'
  else if(base.label==='Session stale')status='STALE'
  else if(base.label==='Validation not green')status='ERROR'
  else if(coverageIssues.length)status='PARTIAL'
  else if(base.level==='ok')status='HEALTHY'
  else status='PARTIAL'

  const detail=coverageIssues.length
    ?`${base.detail} Coverage attention: ${coverageIssues.map(row=>`${row.label} ${row.coveragePct.toFixed(1)}%`).join(' · ')}.`
    :base.detail
  return{...base,status,coverage,coverageIssues,detail}
}

export function scanIdentity(manifest:StockScoutManifest|null){
  const session=manifest?.marketSession?.date||null
  const generatedAt=manifest?.generatedAt||null
  const sourceSha=manifest?.provenance?.source?.sha256||null
  const sourceRunId=(manifest?.provenance?.source as unknown as {workflowRunId?:string|number})?.workflowRunId??null
  const publicationRunId=(manifest?.provenance?.publication as unknown as {workflowRunId?:string|number})?.workflowRunId??null
  const id=session&&sourceSha?`${session}:${sourceSha.slice(0,12)}`:generatedAt&&sourceSha?`${generatedAt}:${sourceSha.slice(0,12)}`:generatedAt||sourceSha||'unknown'
  return{id,session,generatedAt,sourceSha,sourceRunId,publicationRunId}
}
