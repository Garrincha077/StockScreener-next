export type AlertInterval='D'|'W'
export type AlertCondition='cross_above'|'cross_below'|'touch'
export type AlertBasis='close'|'wick'
export type AlertLifecycle='one_shot'|'rearm'
export type AlertDrawingType='trendline'|'horizontal'
export type AlertLineExtension='ray_right'|'pane'
export type GeometryPoint={time:string;price:number}
export type GeometryBar={time:string;open:number;high:number;low:number;close:number}
export type GeometryRule={
  points:[GeometryPoint,GeometryPoint]
  interval:AlertInterval
  condition:AlertCondition
  basis:AlertBasis
}
export type GeometryEvaluation={
  valid:boolean
  fired:boolean
  reason?:'insufficient_bars'|'missing_anchor'|'unsupported_basis'
  prevLine:number|null
  line:number|null
  marketDate?:string
}

const isIsoDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(`${value}T00:00:00Z`))
const finiteBar=(bar:GeometryBar)=>isIsoDate(bar.time)&&[bar.open,bar.high,bar.low,bar.close].every(Number.isFinite)

function weekKey(iso:string){
  const date=new Date(`${iso}T00:00:00Z`)
  const day=(date.getUTCDay()+6)%7
  date.setUTCDate(date.getUTCDate()-day)
  return date.toISOString().slice(0,10)
}

export function barsForAlertInterval(rawBars:GeometryBar[],interval:AlertInterval):GeometryBar[]{
  const byDay=new Map<string,GeometryBar>()
  for(const bar of rawBars){if(finiteBar(bar))byDay.set(bar.time,{...bar})}
  const daily=[...byDay.values()].sort((a,b)=>a.time.localeCompare(b.time))
  if(interval==='D')return daily
  const weekly:GeometryBar[]=[]
  for(const bar of daily){
    const key=weekKey(bar.time)
    const last=weekly[weekly.length-1]
    if(!last||last.time!==key)weekly.push({...bar,time:key})
    else{
      last.high=Math.max(last.high,bar.high)
      last.low=Math.min(last.low,bar.low)
      last.close=bar.close
    }
  }
  return weekly
}

function projectInFrame(points:[GeometryPoint,GeometryPoint],frame:GeometryBar[],atTime:string){
  if(!points.every(point=>isIsoDate(point.time)&&Number.isFinite(point.price)&&point.price>0))return null
  const times=frame.map(bar=>bar.time)
  const a=times.indexOf(points[0].time),b=times.indexOf(points[1].time),at=times.indexOf(atTime)
  if(a<0||b<0||at<0)return null
  if(a===b)return Math.abs(points[0].price-points[1].price)<1e-9?points[1].price:null
  return points[0].price+((points[1].price-points[0].price)/(b-a))*(at-a)
}

export function projectAlertLineAtTime(points:[GeometryPoint,GeometryPoint],rawBars:GeometryBar[],interval:AlertInterval,atTime:string){
  return projectInFrame(points,barsForAlertInterval(rawBars,interval),atTime)
}

export function evaluateAlertGeometry(rule:GeometryRule,rawBars:GeometryBar[]):GeometryEvaluation{
  const frame=barsForAlertInterval(rawBars,rule.interval)
  if(frame.length<2)return{valid:false,fired:false,reason:'insufficient_bars',prevLine:null,line:null}
  const prev=frame[frame.length-2],last=frame[frame.length-1]
  const prevLine=projectInFrame(rule.points,frame,prev.time)
  const line=projectInFrame(rule.points,frame,last.time)
  if(prevLine==null||line==null)return{valid:false,fired:false,reason:'missing_anchor',prevLine,line,marketDate:last.time}
  if(rule.condition==='touch'&&rule.basis!=='wick')return{valid:false,fired:false,reason:'unsupported_basis',prevLine,line,marketDate:last.time}
  let fired=false
  if(rule.condition==='cross_above'){
    const prevValue=rule.basis==='wick'?prev.high:prev.close
    const lastValue=rule.basis==='wick'?last.high:last.close
    fired=prevValue<=prevLine&&lastValue>line
  }else if(rule.condition==='cross_below'){
    const prevValue=rule.basis==='wick'?prev.low:prev.close
    const lastValue=rule.basis==='wick'?last.low:last.close
    fired=prevValue>=prevLine&&lastValue<line
  }else fired=last.low<=line&&line<=last.high
  return{valid:true,fired,prevLine,line,marketDate:last.time}
}
