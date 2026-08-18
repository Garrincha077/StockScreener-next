export type Logic='ALL'|'ANY'
export type RuleOp='>'|'>='|'<'|'<='|'='|'!='|'between'|'contains'|'true'|'false'
export type Rule={id:string;field:string;op:RuleOp;value:string}
export type RuleGroup={id:string;logic:Logic;rules:Rule[]}
export type ScreenState={
  name:string
  rootLogic:Logic
  groups:RuleGroup[]
  sorting:{id:string;desc:boolean}[]
  visibility:Record<string,boolean>
  recipe:string
  query:string
  pageSize:number
}
export type FieldDef={id:string;label:string;kind:'number'|'text'|'boolean';defaultOp:RuleOp;placeholder?:string}

export const fieldDefs:FieldDef[]=[
  {id:'stage',label:'Stage',kind:'number',defaultOp:'='},
  {id:'opportunityScore',label:'Opportunity',kind:'number',defaultOp:'>='},
  {id:'leadershipScore',label:'Leadership-adjusted score',kind:'number',defaultOp:'>='},
  {id:'groupLeadership',label:'Group leadership',kind:'number',defaultOp:'>='},
  {id:'sectorRank',label:'Sector proxy rank',kind:'number',defaultOp:'>='},
  {id:'industryRank',label:'Industry proxy rank',kind:'number',defaultOp:'>='},
  {id:'sectorProxy',label:'Sector proxy',kind:'text',defaultOp:'contains'},
  {id:'industryProxy',label:'Industry proxy',kind:'text',defaultOp:'contains'},
  {id:'rsRank',label:'RS Rank',kind:'number',defaultOp:'>='},
  {id:'rsAcceleration',label:'RS Δ',kind:'number',defaultOp:'>'},
  {id:'confluence',label:'Confluence',kind:'number',defaultOp:'>='},
  {id:'freshnessScore',label:'Freshness',kind:'number',defaultOp:'>='},
  {id:'neglectedScore',label:'Neglected',kind:'number',defaultOp:'>='},
  {id:'volumeRatio',label:'Volume x',kind:'number',defaultOp:'>='},
  {id:'breakoutPct',label:'Breakout %',kind:'number',defaultOp:'>='},
  {id:'distance10w',label:'10W distance %',kind:'number',defaultOp:'between',placeholder:'-3,8'},
  {id:'distance30w',label:'30W distance %',kind:'number',defaultOp:'between',placeholder:'-5,15'},
  {id:'trendTemplatePasses',label:'Trend Template /8',kind:'number',defaultOp:'>='},
  {id:'stage2AgeWeeks',label:'Stage 2 age weeks',kind:'number',defaultOp:'<='},
  {id:'baseWeeks',label:'Base weeks',kind:'number',defaultOp:'>='},
  {id:'tightRange20',label:'20D range %',kind:'number',defaultOp:'<='},
  {id:'atrCompression',label:'ATR compression %',kind:'number',defaultOp:'>='},
  {id:'prior9mReturn',label:'Prior 9M %',kind:'number',defaultOp:'<='},
  {id:'return3m',label:'Recent 3M %',kind:'number',defaultOp:'>='},
  {id:'avgDollarVolume20',label:'Avg $ Volume',kind:'number',defaultOp:'>='},
  {id:'setupTags',label:'Setup tag',kind:'text',defaultOp:'contains'},
  {id:'fundamentalSupport',label:'Fundamental support',kind:'boolean',defaultOp:'true'},
  {id:'fundamentalEvidenceScore',label:'Fundamental Evidence 0-100',kind:'number',defaultOp:'>='},
  {id:'fundamentalEvidenceConfidence',label:'Fundamental confidence %',kind:'number',defaultOp:'>='},
  {id:'fundamentalEvidenceCoverage',label:'Fundamental coverage %',kind:'number',defaultOp:'>='},
  {id:'extended',label:'Extended',kind:'boolean',defaultOp:'false'},
  {id:'changedToday',label:'Changed since last scan',kind:'boolean',defaultOp:'true'},
  {id:'stageChanged',label:'Stage changed',kind:'boolean',defaultOp:'true'},
  {id:'newSetupTags',label:'New setup since last scan',kind:'text',defaultOp:'contains'},
  {id:'changeImpact',label:'Change impact',kind:'number',defaultOp:'>='},
  {id:'opportunityDelta',label:'Δ Opportunity',kind:'number',defaultOp:'>='},
  {id:'rsRankDelta',label:'Δ RS Rank',kind:'number',defaultOp:'>='},

  // Rich shared evidence generated after the nightly scan from the same 5Y cache.
  {id:'return1w',label:'RICH return 1W %',kind:'number',defaultOp:'>='},
  {id:'return1m',label:'RICH return 1M %',kind:'number',defaultOp:'>='},
  {id:'return2y',label:'RICH return 2Y %',kind:'number',defaultOp:'>='},
  {id:'return3y',label:'RICH return 3Y %',kind:'number',defaultOp:'>='},
  {id:'return5y',label:'RICH return 5Y %',kind:'number',defaultOp:'>='},
  {id:'distance20',label:'RICH distance 20DMA %',kind:'number',defaultOp:'between',placeholder:'-5,10'},
  {id:'distance100',label:'RICH distance 100DMA %',kind:'number',defaultOp:'between',placeholder:'-10,20'},
  {id:'distance150',label:'RICH distance 150DMA %',kind:'number',defaultOp:'between',placeholder:'-10,25'},
  {id:'atr14Pct',label:'RICH ATR14 %',kind:'number',defaultOp:'<='},
  {id:'realizedVol20',label:'RICH realized vol 20D %',kind:'number',defaultOp:'<='},
  {id:'realizedVol60',label:'RICH realized vol 60D %',kind:'number',defaultOp:'<='},
  {id:'avgDollarVolume50',label:'RICH avg $ volume 50D',kind:'number',defaultOp:'>='},
  {id:'upDownVolume20',label:'RICH up/down volume 20D',kind:'number',defaultOp:'>='},
  {id:'upDownVolume50',label:'RICH up/down volume 50D',kind:'number',defaultOp:'>='},
  {id:'rs1m',label:'RICH relative strength 1M %',kind:'number',defaultOp:'>='},
  {id:'richRs3m',label:'RICH relative strength 3M %',kind:'number',defaultOp:'>='},
  {id:'richRs6m',label:'RICH relative strength 6M %',kind:'number',defaultOp:'>='},
  {id:'richRs12m',label:'RICH relative strength 12M %',kind:'number',defaultOp:'>='},
  {id:'distance2yHigh',label:'RICH distance 2Y high %',kind:'number',defaultOp:'>='},
  {id:'maxDrawdown1y',label:'RICH max drawdown 1Y %',kind:'number',defaultOp:'>='},
  {id:'revenueQoQ',label:'RICH revenue QoQ %',kind:'number',defaultOp:'>='},
  {id:'epsQoQ',label:'RICH EPS QoQ %',kind:'number',defaultOp:'>='},
  {id:'operatingMargin',label:'RICH operating margin %',kind:'number',defaultOp:'>='},
  {id:'inventoryQoQ',label:'RICH inventory QoQ %',kind:'number',defaultOp:'<='},
  {id:'inventoryToSales',label:'RICH inventory / sales',kind:'number',defaultOp:'<='},
  {id:'fundamentalsAgeDays',label:'RICH fundamentals age days',kind:'number',defaultOp:'<='},
]

export const opsByKind={
  number:['>','>=','<','<=','=','!=','between'] as RuleOp[],
  text:['contains','=','!='] as RuleOp[],
  boolean:['true','false'] as RuleOp[],
}

export const uid=()=>Math.random().toString(36).slice(2,9)
export const makeRule=(field='rsRank'):Rule=>{
  const def=fieldDefs.find(x=>x.id===field)||fieldDefs[0]
  return {id:uid(),field:def.id,op:def.defaultOp,value:''}
}
export const makeGroup=(logic:Logic='ALL',rules:Rule[]=[makeRule()]):RuleGroup=>({id:uid(),logic,rules})

const scalar=(stock:any,field:string)=>{
  if(field==='opportunityScore')return stock.opportunityScore??stock.score
  return stock[field]
}
const textValue=(value:any)=>Array.isArray(value)?value.join(' | '):String(value??'')
const asNumber=(value:any)=>{const n=Number(value);return Number.isFinite(n)?n:NaN}

export function matchesRule(stock:any,rule:Rule):boolean{
  const raw=scalar(stock,rule.field)
  if(rule.op==='true')return raw===true
  if(rule.op==='false')return raw===false
  if(rule.op==='contains')return textValue(raw).toLowerCase().includes(rule.value.trim().toLowerCase())
  const def=fieldDefs.find(x=>x.id===rule.field)
  if(def?.kind==='text'){
    const left=textValue(raw).toLowerCase(),right=rule.value.trim().toLowerCase()
    if(!right)return true
    return rule.op==='!='?left!==right:left===right
  }
  if(def?.kind==='number'&&!rule.value.trim())return true
  const left=asNumber(raw)
  if(!Number.isFinite(left))return false
  if(rule.op==='between'){
    const parts=rule.value.split(',').map(x=>x.trim())
    if(parts.length!==2||parts.some(x=>!x))return true
    const [a,b]=parts.map(Number)
    if(!Number.isFinite(a)||!Number.isFinite(b))return true
    return left>=Math.min(a,b)&&left<=Math.max(a,b)
  }
  const right=Number(rule.value)
  if(!Number.isFinite(right))return true
  if(rule.op==='>')return left>right
  if(rule.op==='>=')return left>=right
  if(rule.op==='<')return left<right
  if(rule.op==='<=')return left<=right
  if(rule.op==='!=')return left!==right
  return left===right
}

export function matchesGroups(stock:any,groups:RuleGroup[],rootLogic:Logic):boolean{
  const active=groups.filter(g=>g.rules.length)
  if(!active.length)return true
  const groupMatch=(g:RuleGroup)=>g.logic==='ALL'?g.rules.every(r=>matchesRule(stock,r)):g.rules.some(r=>matchesRule(stock,r))
  return rootLogic==='ALL'?active.every(groupMatch):active.some(groupMatch)
}

const rule=(field:string,op:RuleOp,value=''):Rule=>({id:uid(),field,op,value})
const group=(logic:Logic,rules:Rule[]):RuleGroup=>({id:uid(),logic,rules})

export const builtInScreens:ScreenState[]=[
  {
    name:'Perfect Setup',rootLogic:'ALL',recipe:'All',query:'',pageSize:100,visibility:{},
    sorting:[{id:'confluence',desc:true},{id:'freshnessScore',desc:true},{id:'rsRank',desc:true},{id:'opportunityScore',desc:true}],
    groups:[
      group('ANY',[rule('stage','=','1'),rule('stage','=','2')]),
      group('ALL',[rule('rsRank','>=','75'),rule('confluence','>=','7'),rule('distance10w','between','-5,10'),rule('extended','false')]),
    ],
  },
  {
    name:'Early Leaders',rootLogic:'ALL',recipe:'All',query:'',pageSize:100,visibility:{},
    sorting:[{id:'freshnessScore',desc:true},{id:'rsRank',desc:true},{id:'rsAcceleration',desc:true},{id:'stage2AgeWeeks',desc:false}],
    groups:[
      group('ANY',[rule('stage','=','1'),rule('stage','=','2')]),
      group('ALL',[rule('rsRank','>=','70'),rule('rsAcceleration','>','0'),rule('stage2AgeWeeks','<=','12'),rule('distance10w','between','-8,10'),rule('extended','false')]),
    ],
  },
  {
    name:'Fundamental Confirmed Leaders',rootLogic:'ALL',recipe:'All',query:'',pageSize:100,visibility:{fundamentalEvidenceScore:true,fundamentalEvidenceConfidence:true},
    sorting:[{id:'fundamentalEvidenceScore',desc:true},{id:'fundamentalEvidenceConfidence',desc:true},{id:'rsRank',desc:true},{id:'freshnessScore',desc:true}],
    groups:[
      group('ANY',[rule('stage','=','1'),rule('stage','=','2')]),
      group('ALL',[rule('fundamentalEvidenceScore','>=','65'),rule('fundamentalEvidenceConfidence','>=','50'),rule('rsRank','>=','70'),rule('extended','false')]),
    ],
  },
  {
    name:'Group-confirmed Early Leaders',rootLogic:'ALL',recipe:'All',query:'',pageSize:100,visibility:{},
    sorting:[{id:'leadershipScore',desc:true},{id:'groupLeadership',desc:true},{id:'rsRank',desc:true},{id:'freshnessScore',desc:true}],
    groups:[
      group('ANY',[rule('stage','=','1'),rule('stage','=','2')]),
      group('ALL',[rule('rsRank','>=','70'),rule('rsAcceleration','>','0'),rule('distance10w','between','-8,10'),rule('groupLeadership','>=','65'),rule('extended','false')]),
    ],
  },
  {
    name:'Neglected → Leader',rootLogic:'ALL',recipe:'All',query:'',pageSize:100,visibility:{},
    sorting:[{id:'neglectedScore',desc:true},{id:'rsAcceleration',desc:true},{id:'return3m',desc:true},{id:'volumeRatio',desc:true}],
    groups:[group('ALL',[rule('prior9mReturn','<=','15'),rule('return3m','>=','3'),rule('return3m','<=','30'),rule('rsRank','>=','70'),rule('rsAcceleration','>','0'),rule('distance10w','between','-8,10'),rule('extended','false')])],
  },
  {
    name:'Fresh Breakouts',rootLogic:'ALL',recipe:'All',query:'',pageSize:100,visibility:{},
    sorting:[{id:'volumeRatio',desc:true},{id:'rsRank',desc:true},{id:'freshnessScore',desc:true},{id:'breakoutPct',desc:true}],
    groups:[group('ALL',[rule('breakoutPct','between','-1.5,5'),rule('volumeRatio','>=','1.5'),rule('rsRank','>=','70'),rule('rsAcceleration','>','0'),rule('extended','false')])],
  },
  {
    name:'Tight Bases',rootLogic:'ALL',recipe:'All',query:'',pageSize:100,visibility:{},
    sorting:[{id:'atrCompression',desc:true},{id:'tightRange20',desc:false},{id:'baseWeeks',desc:true},{id:'rsRank',desc:true}],
    groups:[group('ALL',[rule('tightRange20','<=','12'),rule('atrCompression','>=','20'),rule('baseWeeks','>=','6'),rule('extended','false')])],
  },
  {
    name:'Since Last Scan',rootLogic:'ALL',recipe:'All',query:'',pageSize:100,visibility:{},
    sorting:[{id:'changeImpact',desc:true},{id:'rsRankDelta',desc:true},{id:'opportunityDelta',desc:true},{id:'rsRank',desc:true}],
    groups:[group('ALL',[rule('changedToday','true')])],
  },
]
