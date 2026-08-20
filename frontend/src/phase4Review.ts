export type ReviewStock={
  ticker:string
  stage?:number
  stageName?:string
  primarySetup?:string
  setup?:string
  setupTags?:string[]
  opportunityScore?:number
  opportunityTier?:string
  opportunityRank?:number
  opportunityPotential?:number
  opportunityTiming?:number
  emergingLeaderScore?:number
  rsRank?:number
  groupRank?:number
  fundamentalEvidenceScore?:number|null
  volumeRatio?:number
  vcpScore?:number
  distance10w?:number
  changedToday?:boolean
  newUniverseMember?:boolean
  changeImpact?:number
  changeLabels?:string[]
  reasons?:string[]
}

export type ReviewPayload={generatedAt:string;universe:ReviewStock[]}
export type ReviewManifest={generatedAt?:string;universe?:number}
export type ValidationStatus={conclusion?:string;run_id?:number;head_sha?:string;updated_at?:string;run_url?:string}

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)
const rounded=(value:number)=>Math.round(value)
const setupOf=(stock:ReviewStock)=>stock.primarySetup||stock.setup||stock.setupTags?.[0]||stock.stageName||'Unclassified setup'

export function buildReviewInbox(universe:ReviewStock[]){
  const today=universe.filter(stock=>stock.changedToday).sort((a,b)=>(b.changeImpact??0)-(a.changeImpact??0)||a.ticker.localeCompare(b.ticker))
  const newSinceLastScan=universe.filter(stock=>stock.newUniverseMember).sort((a,b)=>(b.opportunityScore??0)-(a.opportunityScore??0)||a.ticker.localeCompare(b.ticker))
  return{today,newSinceLastScan}
}

export function explainStock(stock:ReviewStock):string[]{
  const lines:string[]=[]
  const stage=finite(stock.stage)?` · Stage ${stock.stage}`:''
  lines.push(`${setupOf(stock)}${stage}`)

  const opportunity=[finite(stock.opportunityScore)?`Opportunity ${rounded(stock.opportunityScore)}`:null,stock.opportunityTier||null,finite(stock.opportunityRank)?`rank ${rounded(stock.opportunityRank)}`:null].filter(Boolean).join(' · ')
  if(opportunity)lines.push(opportunity)

  const timing=[finite(stock.opportunityPotential)?`potential ${rounded(stock.opportunityPotential)}`:null,finite(stock.opportunityTiming)?`timing ${rounded(stock.opportunityTiming)}`:null,finite(stock.emergingLeaderScore)?`emerging ${rounded(stock.emergingLeaderScore)}`:null].filter(Boolean).join(' · ')
  if(timing)lines.push(timing)

  const leadership=[finite(stock.rsRank)?`RS ${rounded(stock.rsRank)}`:null,finite(stock.groupRank)?`group ${rounded(stock.groupRank)}`:null,finite(stock.fundamentalEvidenceScore)?`fundamentals ${rounded(stock.fundamentalEvidenceScore)}`:null,finite(stock.volumeRatio)?`volume ${stock.volumeRatio.toFixed(1)}x`:null].filter(Boolean).join(' · ')
  if(leadership)lines.push(leadership)

  if(stock.changeLabels?.length)lines.push(`Since last scan: ${stock.changeLabels.slice(0,2).join(' · ')}`)
  else if(stock.reasons?.length)lines.push(stock.reasons.slice(0,2).join(' · '))

  return lines.slice(0,5)
}

export function dataHealth(payload:ReviewPayload|null,manifest:ReviewManifest|null,validation:ValidationStatus|null,nowMs=Date.now()){
  if(!payload)return{level:'unknown' as const,label:'Data unavailable',ageHours:null,detail:'Core dataset could not be loaded.'}
  const generatedMs=Date.parse(payload.generatedAt)
  const ageHours=Number.isFinite(generatedMs)?Math.max(0,(nowMs-generatedMs)/3600000):null
  const manifestMatch=!manifest?.generatedAt||manifest.generatedAt===payload.generatedAt
  const universeMatch=!manifest?.universe||manifest.universe===payload.universe.length
  const validationGreen=validation?.conclusion==='success'
  const validationKnown=Boolean(validation?.conclusion)

  if(!manifestMatch||!universeMatch)return{level:'warn' as const,label:'Snapshot mismatch',ageHours,detail:'Core and manifest do not describe the same snapshot.'}
  if(ageHours!==null&&ageHours>36)return{level:'warn' as const,label:'Snapshot stale',ageHours,detail:`Dataset is ${Math.round(ageHours)}h old.`}
  if(validationKnown&&!validationGreen)return{level:'warn' as const,label:'Validation not green',ageHours,detail:`Last published validation: ${validation?.conclusion}.`}
  if(validationGreen)return{level:'ok' as const,label:'Healthy',ageHours,detail:`Snapshot aligned · validation #${validation?.run_id??'—'} green.`}
  return{level:'ok' as const,label:'Data healthy',ageHours,detail:'Snapshot aligned · validation status is not published in the client build.'}
}
