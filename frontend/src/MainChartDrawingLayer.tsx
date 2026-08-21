import {useCallback,useEffect,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react'
import {useChartAlerts} from './ChartAlertsProvider'
import {barsForAlertInterval,type GeometryBar} from './deepvue/chartAlertGeometryContract'
import type {ChartAlertPoint,ChartAlertRule,ChartDrawing} from './deepvue/chartAlerts'

export type MainChartBridge={chart:any;series:any;container:HTMLDivElement}
type Bar=GeometryBar&{volume?:number;rs?:number}
type DragKind='a'|'b'|'body'
type DragCtx={
  drawing:ChartDrawing
  kind:DragKind
  startClient:{x:number;y:number}
  startLogical:number
  startPrice:number
  anchorIndexes:[number,number]
  moved:boolean
}
type LineGeom={
  paneW:number;paneH:number
  segment?:{x1:number;y1:number;x2:number;y2:number}
  ray?:{x1:number;y1:number;x2:number;y2:number}
  full:{x1:number;y1:number;x2:number;y2:number}
  a?:{x:number;y:number}
  b?:{x:number;y:number}
  badge?:{x:number;y:number;line:number}
}

const HIT_WIDTH=14
const CLICK_PX=4
const COLOR_BY_CONDITION={cross_above:'#20d886',cross_below:'#f05d6c',touch:'#f3c85b'} as const
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value))
const conditionLabel=(rule:ChartAlertRule)=>rule.condition==='cross_above'?'Cross ↑':rule.condition==='cross_below'?'Cross ↓':'Touch'

export default function MainChartDrawingLayer({bridge,ticker,bars,source,interval}:{bridge:MainChartBridge;ticker:string;bars:Bar[];source:Bar[];interval:'D'|'W'}){
  const{snapshot,busy,error,tool,setTool,selectedDrawingId,selectDrawing,upsertDrawing}=useChartAlerts()
  const[firstPoint,setFirstPoint]=useState<ChartAlertPoint|null>(null)
  const[hoverPoint,setHoverPoint]=useState<ChartAlertPoint|null>(null)
  const[editing,setEditing]=useState<ChartDrawing|null>(null)
  const editingRef=useRef<ChartDrawing|null>(null)
  const[,setViewportRevision]=useState(0)
  const dragRef=useRef<DragCtx|null>(null)
  const windowHandlers=useRef<{move:(event:PointerEvent)=>void;up:(event:PointerEvent)=>void}|null>(null)

  const frame=useMemo(()=>barsForAlertInterval(bars,interval) as Bar[],[bars,interval])
  const currentSource=useMemo(()=>source.length?source:frame,[source,frame])
  const sourceStart=useMemo(()=>currentSource.length?frame.findIndex(bar=>bar.time===currentSource[0].time):-1,[frame,currentSource])
  const frameTimes=useMemo(()=>frame.map(bar=>bar.time),[frame])
  const drawings=useMemo(()=>snapshot.drawings.filter(item=>item.ticker===ticker&&item.interval===interval),[snapshot.drawings,ticker,interval])
  const ruleByDrawing=useMemo(()=>new Map(snapshot.rules.map(rule=>[rule.drawingId,rule])),[snapshot.rules])
  const statusByDrawing=useMemo(()=>new Map(snapshot.status.map(status=>[status.drawingId,status])),[snapshot.status])

  const clearEditing=useCallback(()=>{editingRef.current=null;setEditing(null)},[])
  const showEditing=useCallback((drawing:ChartDrawing)=>{editingRef.current=drawing;setEditing(drawing)},[])

  useEffect(()=>{
    let raf=0
    const refresh=()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;setViewportRevision(value=>value+1)})}
    bridge.chart.timeScale().subscribeVisibleLogicalRangeChange(refresh)
    const observer=new ResizeObserver(refresh);observer.observe(bridge.container)
    return()=>{bridge.chart.timeScale().unsubscribeVisibleLogicalRangeChange(refresh);observer.disconnect();if(raf)cancelAnimationFrame(raf)}
  },[bridge])

  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if(event.key!=='Escape')return
      if(tool!=='cursor'){setTool('cursor');setFirstPoint(null);setHoverPoint(null)}
      else if(editing)clearEditing()
      else selectDrawing(null)
    }
    window.addEventListener('keydown',onKey)
    return()=>window.removeEventListener('keydown',onKey)
  },[tool,setTool,editing,clearEditing,selectDrawing])

  useEffect(()=>{
    const clear=()=>{if(tool==='cursor'&&!dragRef.current)selectDrawing(null)}
    bridge.chart.subscribeClick(clear)
    return()=>bridge.chart.unsubscribeClick(clear)
  },[bridge,tool,selectDrawing])

  const priceAtFrameIndex=useCallback((points:[ChartAlertPoint,ChartAlertPoint],index:number)=>{
    const a=frameTimes.indexOf(points[0].time),b=frameTimes.indexOf(points[1].time)
    if(a<0||b<0)return null
    if(a===b)return Math.abs(points[0].price-points[1].price)<1e-9?points[0].price:null
    return points[0].price+((points[1].price-points[0].price)/(b-a))*(index-a)
  },[frameTimes])

  const pointFromClient=useCallback((clientX:number,clientY:number):ChartAlertPoint|null=>{
    if(sourceStart<0||!currentSource.length)return null
    const rect=bridge.container.getBoundingClientRect()
    const x=clientX-rect.left,y=clientY-rect.top
    const logical=bridge.chart.timeScale().coordinateToLogical(x)
    const price=bridge.series.coordinateToPrice(y)
    if(logical==null||price==null||!Number.isFinite(Number(price)))return null
    const localIndex=clamp(Math.round(Number(logical)),0,currentSource.length-1)
    return{time:currentSource[localIndex].time,price:Number(price)}
  },[bridge,currentSource,sourceStart])

  const logicalAndPriceFromClient=useCallback((clientX:number,clientY:number)=>{
    if(sourceStart<0)return null
    const rect=bridge.container.getBoundingClientRect()
    const localLogical=bridge.chart.timeScale().coordinateToLogical(clientX-rect.left)
    const price=bridge.series.coordinateToPrice(clientY-rect.top)
    if(localLogical==null||price==null)return null
    return{logical:sourceStart+Number(localLogical),price:Number(price)}
  },[bridge,sourceStart])

  const geometry=useCallback((drawing:ChartDrawing):LineGeom|null=>{
    if(sourceStart<0||frame.length<1||currentSource.length<1)return null
    const aIndex=frameTimes.indexOf(drawing.points[0].time),bIndex=frameTimes.indexOf(drawing.points[1].time)
    if(aIndex<0||bIndex<0)return null
    const paneW=Number(bridge.chart.timeScale().width?.()??bridge.container.clientWidth)
    const paneH=Math.max(0,bridge.container.clientHeight-Number(bridge.chart.timeScale().height?.()??0))
    if(!paneW||!paneH)return null
    const visible=bridge.chart.timeScale().getVisibleLogicalRange?.()||{from:0,to:Math.max(0,currentSource.length-1)}
    const from=Number(visible.from),to=Number(visible.to)
    const xFor=(local:number)=>bridge.chart.timeScale().logicalToCoordinate(local)
    const yFor=(price:number)=>bridge.series.priceToCoordinate(price)
    const lineAtLocal=(local:number)=>priceAtFrameIndex(drawing.points,sourceStart+local)
    const makeLine=(left:number,right:number)=>{
      const p1=lineAtLocal(left),p2=lineAtLocal(right),x1=xFor(left),x2=xFor(right)
      if(p1==null||p2==null||x1==null||x2==null)return null
      const y1=yFor(p1),y2=yFor(p2)
      return y1==null||y2==null?null:{x1:Number(x1),y1:Number(y1),x2:Number(x2),y2:Number(y2)}
    }
    const full=makeLine(from,to)
    if(!full)return null
    const localA=aIndex-sourceStart,localB=bIndex-sourceStart
    const anchor=(local:number,price:number)=>{const x=xFor(local),y=yFor(price);return x==null||y==null?undefined:{x:Number(x),y:Number(y)}}
    const a=anchor(localA,drawing.points[0].price),b=anchor(localB,drawing.points[1].price)
    let segment:LineGeom['segment'],ray:LineGeom['ray']
    if(drawing.kind==='horizontal')segment=full
    else{
      const leftAnchor=Math.min(localA,localB),rightAnchor=Math.max(localA,localB)
      const segLeft=Math.max(from,leftAnchor),segRight=Math.min(to,rightAnchor)
      if(segRight>=segLeft)segment=makeLine(segLeft,segRight)||undefined
      if(to>=rightAnchor){const rayLeft=Math.max(from,rightAnchor);ray=makeLine(rayLeft,to)||undefined}
    }
    const latestLine=priceAtFrameIndex(drawing.points,frame.length-1)
    const badgeY=latestLine==null?null:yFor(latestLine)
    const badge=latestLine==null||badgeY==null?undefined:{x:Math.max(8,paneW-176),y:clamp(Number(badgeY)-10,6,Math.max(6,paneH-24)),line:latestLine}
    return{paneW,paneH,segment,ray,full,a,b,badge}
  },[bridge,currentSource,frame.length,frameTimes,priceAtFrameIndex,sourceStart])

  const stopWindowDrag=useCallback(()=>{
    const handlers=windowHandlers.current
    if(!handlers)return
    window.removeEventListener('pointermove',handlers.move,true)
    window.removeEventListener('pointerup',handlers.up,true)
    window.removeEventListener('pointercancel',handlers.up,true)
    windowHandlers.current=null
  },[])

  useEffect(()=>()=>stopWindowDrag(),[stopWindowDrag])

  const beginDrag=useCallback((event:ReactPointerEvent<SVGElement>,drawing:ChartDrawing,kind:DragKind)=>{
    if(tool!=='cursor'||busy)return
    const start=logicalAndPriceFromClient(event.clientX,event.clientY)
    const indexes:[number,number]=[frameTimes.indexOf(drawing.points[0].time),frameTimes.indexOf(drawing.points[1].time)]
    if(!start||indexes.some(index=>index<0))return
    event.preventDefault();event.stopPropagation();selectDrawing(drawing.id||null)
    dragRef.current={drawing,kind,startClient:{x:event.clientX,y:event.clientY},startLogical:start.logical,startPrice:start.price,anchorIndexes:indexes,moved:false}
    showEditing(drawing)
    const move=(pointer:PointerEvent)=>{
      const ctx=dragRef.current
      if(!ctx)return
      if(Math.hypot(pointer.clientX-ctx.startClient.x,pointer.clientY-ctx.startClient.y)>CLICK_PX)ctx.moved=true
      let nextPoints:ChartDrawing['points']=ctx.drawing.points
      if(ctx.kind==='a'||ctx.kind==='b'){
        const point=pointFromClient(pointer.clientX,pointer.clientY)
        if(!point)return
        if(ctx.drawing.kind==='horizontal')nextPoints=[{...ctx.drawing.points[0],price:point.price},{...ctx.drawing.points[1],price:point.price}]
        else nextPoints=ctx.kind==='a'?[point,ctx.drawing.points[1]]:[ctx.drawing.points[0],point]
      }else{
        const current=logicalAndPriceFromClient(pointer.clientX,pointer.clientY)
        if(!current)return
        const priceDelta=current.price-ctx.startPrice
        let barDelta=ctx.drawing.kind==='horizontal'?0:Math.round(current.logical-ctx.startLogical)
        const minIndex=Math.min(...ctx.anchorIndexes),maxIndex=Math.max(...ctx.anchorIndexes)
        barDelta=clamp(barDelta,-minIndex,frame.length-1-maxIndex)
        nextPoints=ctx.drawing.points.map((point,index)=>({
          time:ctx.drawing.kind==='horizontal'?point.time:frame[ctx.anchorIndexes[index]+barDelta].time,
          price:point.price+priceDelta,
        })) as ChartDrawing['points']
      }
      showEditing({...ctx.drawing,points:nextPoints})
    }
    const up=async()=>{
      const ctx=dragRef.current
      const next=editingRef.current
      dragRef.current=null;stopWindowDrag()
      if(ctx?.moved&&next){try{await upsertDrawing(next)}finally{clearEditing()}}
      else clearEditing()
    }
    windowHandlers.current={move,up}
    window.addEventListener('pointermove',move,true)
    window.addEventListener('pointerup',up,true)
    window.addEventListener('pointercancel',up,true)
  },[tool,busy,logicalAndPriceFromClient,frameTimes,selectDrawing,showEditing,pointFromClient,frame,stopWindowDrag,upsertDrawing,clearEditing])

  const chooseTool=useCallback((next:'cursor'|'trendline'|'horizontal')=>{
    setTool(next);setFirstPoint(null);setHoverPoint(null);clearEditing()
  },[setTool,clearEditing])

  const capturePoint=useCallback(async(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(tool==='cursor'||busy)return
    event.preventDefault();event.stopPropagation()
    const point=pointFromClient(event.clientX,event.clientY)
    if(!point)return
    if(tool==='horizontal'){
      const saved=await upsertDrawing({ticker,kind:'horizontal',interval,points:[point,point],extension:'pane',style:{}})
      selectDrawing(saved.id||null);chooseTool('cursor');return
    }
    if(!firstPoint){setFirstPoint(point);setHoverPoint(point);return}
    if(firstPoint.time===point.time)return
    const saved=await upsertDrawing({ticker,kind:'trendline',interval,points:[firstPoint,point],extension:'ray_right',style:{}})
    selectDrawing(saved.id||null);chooseTool('cursor')
  },[tool,busy,pointFromClient,upsertDrawing,ticker,interval,selectDrawing,chooseTool,firstPoint])

  const captureMove=useCallback((event:ReactPointerEvent<HTMLDivElement>)=>{
    if(tool!=='trendline'||!firstPoint)return
    const point=pointFromClient(event.clientX,event.clientY)
    if(point)setHoverPoint(point)
  },[tool,firstPoint,pointFromClient])

  const renderDrawings=drawings.map(drawing=>editing?.id===drawing.id?editing:drawing)
  const draft=tool==='trendline'&&firstPoint&&hoverPoint?{ticker,kind:'trendline',interval,points:[firstPoint,hoverPoint],extension:'ray_right'} as ChartDrawing:null

  const badgeText=(drawing:ChartDrawing)=>{
    const rule=drawing.id?ruleByDrawing.get(drawing.id):undefined
    const status=drawing.id?statusByDrawing.get(drawing.id):undefined
    if(status?.state==='needs_review')return `${interval} · needs review`
    if(!rule)return `${interval} · drawing only`
    if(!rule.enabled)return `${interval} · ${conditionLabel(rule)} · paused`
    const g=geometry(drawing),latest=frame[frame.length-1]
    const distance=status?.distancePct??(g?.badge&&latest?((latest.close-g.badge.line)/g.badge.line)*100:null)
    const suffix=typeof distance==='number'&&Number.isFinite(distance)?` · price ${Math.abs(distance).toFixed(1)}% ${distance>=0?'above':'below'}`:''
    return `${interval} · ${conditionLabel(rule)}${suffix}`
  }

  return <div className="cad-main-layer" data-tool={tool}>
    <div className="cad-main-tools" role="toolbar" aria-label="Chart drawing tools">
      <button aria-label="Chart cursor tool" className={tool==='cursor'?'active':''} onClick={()=>chooseTool('cursor')}>↖</button>
      <button aria-label="Draw trendline" className={tool==='trendline'?'active':''} onClick={()=>chooseTool('trendline')}>↗ Trend</button>
      <button aria-label="Draw horizontal line" className={tool==='horizontal'?'active':''} onClick={()=>chooseTool('horizontal')}>— Level</button>
    </div>
    {tool!=='cursor'&&<div className="cad-main-hint">{tool==='trendline'?(firstPoint?'Choose anchor B':'Choose anchor A'):'Choose price level'} · Esc cancels</div>}
    <svg className="cad-main-svg" aria-label={`${ticker} saved chart drawings`}>
      {renderDrawings.map(drawing=>{
        if(!drawing.id)return null
        const g=geometry(drawing);if(!g)return null
        const rule=ruleByDrawing.get(drawing.id),selected=selectedDrawingId===drawing.id
        const color=selected?'#dcecff':rule?.enabled?COLOR_BY_CONDITION[rule.condition]:'#7c8595'
        return <g key={drawing.id} className={selected?'selected':''} data-drawing-id={drawing.id}>
          {g.segment&&<line className="cad-main-line" x1={g.segment.x1} y1={g.segment.y1} x2={g.segment.x2} y2={g.segment.y2} stroke={color} strokeWidth={selected?2.4:1.8}/>} 
          {g.ray&&<line className="cad-main-ray" x1={g.ray.x1} y1={g.ray.y1} x2={g.ray.x2} y2={g.ray.y2} stroke={color} strokeWidth={selected?2.1:1.6} strokeDasharray="7 4"/>}
          <line className="cad-main-hit" x1={g.full.x1} y1={g.full.y1} x2={g.full.x2} y2={g.full.y2} stroke="transparent" strokeWidth={HIT_WIDTH} onPointerDown={event=>beginDrag(event,drawing,'body')}/>
          {selected&&g.a&&<circle className="cad-main-handle" cx={g.a.x} cy={g.a.y} r="5.5" onPointerDown={event=>beginDrag(event,drawing,'a')}/>} 
          {selected&&drawing.kind==='trendline'&&g.b&&<circle className="cad-main-handle" cx={g.b.x} cy={g.b.y} r="5.5" onPointerDown={event=>beginDrag(event,drawing,'b')}/>} 
          {g.badge&&<foreignObject className="cad-main-badge-fo" x={g.badge.x} y={g.badge.y} width="168" height="24"><button className={`cad-main-badge ${selected?'selected':''}`} onPointerDown={event=>{event.stopPropagation();selectDrawing(drawing.id||null)}}>{badgeText(drawing)}</button></foreignObject>}
        </g>
      })}
      {draft&&(()=>{const g=geometry(draft);return g?.segment?<line className="cad-main-draft" x1={g.segment.x1} y1={g.segment.y1} x2={g.segment.x2} y2={g.segment.y2}/>:null})()}
    </svg>
    {tool!=='cursor'&&<div className="cad-main-capture" onPointerDown={capturePoint} onPointerMove={captureMove}/>} 
    {error&&<div className="cad-main-error">drawings offline</div>}
  </div>
}
