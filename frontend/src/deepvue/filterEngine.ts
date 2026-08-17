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
  {id:'extended',label:'Extended',kind:'boolean',defaultOp:'false'},
  {id:'changedToday',label:'Changed today',kind:'boolean',defaultOp:'true'},
  {id:'stageChanged',label:'Stage changed',kind:'boolean',defaultOp:'true'},
  {id:'newSetupTags',label:'New setup today',kind:'text',defaultOp:'contains'},
  {id:'changeImpact',label:'Change impact',kind:'number',defaultOp:'>='},
  {id:'opportunityDelta',label:'Δ Opportunity',kind:'number',defaultOp:'>='},
  {id:'rsRankDelta',label:'Δ RS Rank',kind:'number',defaultOp:'>='},

  // Repository SOURCE methodology. These fields come directly from
  // src/screening/signal_engine.py / phase_indicators.py via enrich_original_engine.py.
  {id:'originalMarketQualifiedBuy',label:'ORIGINAL market-qualified BUY',kind:'boolean',defaultOp:'true'},
  {id:'originalBuyScore',label:'ORIGINAL Buy Score /125',kind:'number',defaultOp:'>='},
  {id:'originalRR',label:'ORIGINAL Risk/Reward',kind:'number',defaultOp:'>='},
  {id:'originalRiskPct',label:'ORIGINAL stop risk %',kind:'number',defaultOp:'<='},
  {id:'originalTTPasses',label:'ORIGINAL Minervini TT /8',kind:'number',defaultOp:'>='},
  {id:'originalTTScore',label:'ORIGINAL TT score /100',kind:'number',defaultOp:'>='},
  {id:'originalVcpQuality',label:'ORIGINAL VCP quality',kind:'number',defaultOp:'>='},
  {id:'originalAdVolumeRatio',label:'ORIGINAL A/D volume ratio',kind:'number',defaultOp:'>='},
  {id:'originalBreakoutVolumeConfirmed',label:'ORIGINAL breakout volume confirmed',kind:'boolean',defaultOp:'true'},
  {id:'originalBreakoutType',label:'ORIGINAL breakout type',kind:'text',defaultOp:'contains'},
  {id:'originalSell',label:'ORIGINAL sell signal',kind:'boolean',defaultOp:'true'},
  {id:'originalSellScore',label:'ORIGINAL Sell Score',kind:'number',defaultOp:'>='},
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
    return rule.op==='!='?left!==right:left===right
  }
  const left=asNumber(raw)
  if(!Number.isFinite(left))return false
  if(rule.op==='between'){
    const [a,b]=rule.value.split(',').map(x=>Number(x.trim()))
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
    name:'Original Engine — Source Rank',rootLogic:'ALL',recipe:'All',query:'',pageSize:100,visibility:{},
    sorting:[{id:'originalBuyScore',desc:true}],
    groups:[group('ALL',[rule('originalMarketQualifiedBuy','true')])],
  },
  {
    name:'Original Engine — Balanced Mix',rootLogic:'ALL',recipe:'All',query:'',pageSize:100,visibility:{},
    sorting:[{id:'originalBuyScore',desc:true},{id:'originalRR',desc:true},{id:'originalTTPasses',desc:true},{id:'originalVcpQuality',desc:true},{id:'originalAdVolumeRatio',desc:true}],
    groups:[group('ALL',[rule('originalMarketQualifiedBuy','true')])],
  },
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
    name:'What Changed Today',rootLogic:'ALL',recipe:'All',query:'',pageSize:100,visibility:{},
    sorting:[{id:'changeImpact',desc:true},{id:'rsRankDelta',desc:true},{id:'opportunityDelta',desc:true},{id:'rsRank',desc:true}],
    groups:[group('ALL',[rule('changedToday','true')])],
  },
]