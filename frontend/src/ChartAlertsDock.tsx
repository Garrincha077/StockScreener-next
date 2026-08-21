import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {CandlestickSeries,ColorType,createChart} from 'lightweight-charts'
import {useStockScoutData} from './data/StockScoutDataProvider'
import {deleteChartAlert,isHorizontalAlert,linePriceAt,loadChartAlerts,saveChartAlert,type ChartAlert,type ChartAlertEvent,type ChartAlertMode,type ChartAlertPoint} from './deepvue/chartAlerts'

type RawBar=[string,number,number,number,number,number,number]
type Bar={time:string;open:number;high:number;low:number;close:number;volume:number;rs:number}
type Interval='D'|'W'
type Range='1Y'|'2Y'|'5Y'
type DrawTool='cursor'|'trendline'|'horizontal'
type Bridge={chart:any;series:any;container:HTMLDivElement}

const RANGE_COUNT:Record<Range,Record<Interval,number>>={
  '1Y':{D:252,W:52},'2Y':{D:504,W:104},'5Y':{D:1265,W:260},
}
const MODE_LABEL:Record<ChartAlertMode,string>={break_up:'Cross ↑',break_down:'Cross ↓',touch:'Touch'}
const MODE_COLOR:Record<ChartAlertMode,string>={break_up:'#20d886',break_down:'#f05d6c',touch:'#f3c85b'}

function aggregateWeekly(bars:Bar[]){
  const out:Bar[]=[]
  for(const bar of bars){
    const d=new Date(`${bar.time}T00:00:00Z`),day=(d.getUTCDay()+6)%7
    d.setUTCDate(d.getUTCDate()-day)
    const key=d.toISOString().slice(0,10),last=out[out.length-1]
    if(!last||last.time!==key)out.push({...bar,time:key})
    else{last.high=Math.max(last.high,bar.high);last.low=Math.min(last.low,bar.low);last.close=bar.close;last.volume+=bar.volume;last.rs=bar.rs}
  }
  return out
}
function clamp(value:number,min:number,max:number){return Math.max(min,Math.min(max,value))}
function fmtPrice(value:number|null|undefined){return typeof value==='number'&&Number.isFinite(value)?value.toFixed(2):'—'}

export default function ChartAlertsDock({open,onOpenChange}:{open:boolean;onOpenChange:(open:boolean)=>void}){
  const{selectedTicker,loadChart}=useStockScoutData()
  const chartRef=useRef<HTMLDivElement>(null)
  const[allBars,setAllBars]=useState<Bar[]>([])
  const[chartStatus,setChartStatus]=useState<'idle'|'loading'|'ready'|'error'|'unavailable'>('idle')
  const[interval,setInterval]=useState<Interval>('W')
  const[range,setRange]=useState<Range>('5Y')
  const[bridge,setBridge]=useState<Bridge|null>(null)
  const[alerts,setAlerts]=useState<ChartAlert[]>([])
  const[events,setEvents]=useState<ChartAlertEvent[]>([])
  const[serviceError,setServiceError]=useState('')
  const[busy,setBusy]=useState(false)
  const[tool,setTool]=useState<DrawTool>('cursor')
  const[firstPoint,setFirstPoint]=useState<ChartAlertPoint|null>(null)
  const[hoverPoint,setHoverPoint]=useState<ChartAlertPoint|null>(null)
  const[,setViewportRevision]=useState(0)

  const ticker=selectedTicker.trim().toUpperCase()
  const tickerAlerts=useMemo(()=>alerts.filter(alert=>alert.ticker===ticker),[alerts,ticker])
  const tickerEvents=useMemo(()=>events.filter(event=>event.ticker===ticker).slice(0,8),[events,ticker])
  const source=useMemo(()=>{
    const bars=interval==='W'?aggregateWeekly(allBars):allBars
    return bars.slice(-RANGE_COUNT[range][interval])
  },[allBars,interval,range])

  const refreshAlerts=useCallback(async()=>{
    try{
      const snapshot=await loadChartAlerts()
      setAlerts(snapshot.alerts||[]);setEvents(snapshot.events||[]);setServiceError('')
    }catch(error){setServiceError(String(error))}
  },[])

  useEffect(()=>{
    if(!open||!ticker)return
    let live=true
    setChartStatus('loading');setAllBars([]);setTool('cursor');setFirstPoint(null);setHoverPoint(null)
    loadChart(ticker).then(result=>{
      if(!live)return
      if(result.status==='ready'){
        const bars=(result.rows as RawBar[]).map(row=>({time:row[0],open:Number(row[1]),high:Number(row[2]),low:Number(row[3]),close:Number(row[4]),volume:Number(row[5]),rs:Number(row[6])})).filter(bar=>Number.isFinite(bar.close))
        setAllBars(bars);setChartStatus(bars.length?'ready':'unavailable')
      }else setChartStatus(result.status==='unavailable'?'unavailable':'error')
    }).catch(()=>{if(live)setChartStatus('error')})
    refreshAlerts()
    const timer=window.setInterval(refreshAlerts,60000)
    return()=>{live=false;window.clearInterval(timer)}
  },[open,ticker,loadChart,refreshAlerts])

  useEffect(()=>{
    if(!open||chartStatus!=='ready'||!chartRef.current||!source.length)return
    const container=chartRef.current
    const chart=createChart(container,{autoSize:true,layout:{background:{type:ColorType.Solid,color:'#08111d'},textColor:'#8396ae',attributionLogo:false},grid:{vertLines:{color:'#142238'},horzLines:{color:'#142238'}},timeScale:{borderColor:'#243248',rightOffset:5,timeVisible:false},rightPriceScale:{borderColor:'#243248'},handleScroll:true,handleScale:true})
    const series=chart.addSeries(CandlestickSeries,{upColor:'#20d886',downColor:'#f05d6c',wickUpColor:'#20d886',wickDownColor:'#f05d6c',borderVisible:false,priceLineVisible:true,lastValueVisible:true})
    series.setData(source.map(bar=>({time:bar.time,open:bar.open,high:bar.high,low:bar.low,close:bar.close})) as any)
    chart.timeScale().fitContent()
    setBridge({chart,series,container})
    return()=>{setBridge(null);chart.remove()}
  },[open,chartStatus,source])

  useEffect(()=>{
    if(!bridge)return
    let raf=0
    const refresh=()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;setViewportRevision(value=>value+1)})}
    bridge.chart.timeScale().subscribeVisibleLogicalRangeChange(refresh)
    const observer=new ResizeObserver(refresh);observer.observe(bridge.container)
    return()=>{bridge.chart.timeScale().unsubscribeVisibleLogicalRangeChange(refresh);observer.disconnect();if(raf)cancelAnimationFrame(raf)}
  },[bridge])

  useEffect(()=>{
    if(!open)return
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){if(tool!=='cursor'){setTool('cursor');setFirstPoint(null);setHoverPoint(null)}else onOpenChange(false)}}
    window.addEventListener('keydown',onKey)
    return()=>window.removeEventListener('keydown',onKey)
  },[open,tool,onOpenChange])

  const pointFromPointer=useCallback((clientX:number,clientY:number):ChartAlertPoint|null=>{
    if(!bridge||!source.length)return null
    const rect=bridge.container.getBoundingClientRect()
    const x=clientX-rect.left,y=clientY-rect.top
    const logical=bridge.chart.timeScale().coordinateToLogical(x)
    const price=bridge.series.coordinateToPrice(y)
    if(price==null)return null
    const index=clamp(Math.round(logical==null?source.length-1:Number(logical)),0,source.length-1)
    return{time:source[index].time,price:Number(price)}
  },[bridge,source])

  const persist=useCallback(async(alert:ChartAlert)=>{
    setBusy(true)
    try{await saveChartAlert(alert);await refreshAlerts();setServiceError('')}
    catch(error){setServiceError(String(error))}
    finally{setBusy(false)}
  },[refreshAlerts])

  const onDrawClick=useCallback(async(event:React.MouseEvent<HTMLDivElement>)=>{
    if(tool==='cursor'||!source.length)return
    const point=pointFromPointer(event.clientX,event.clientY)
    if(!point)return
    if(tool==='horizontal'){
      const start=source[0]?.time||point.time,end=source[source.length-1]?.time||point.time
      await persist({ticker,points:[{time:start,price:point.price},{time:end,price:point.price}],mode:'touch',enabled:false,notifyTelegram:true})
      setTool('cursor');setFirstPoint(null);setHoverPoint(null);return
    }
    if(!firstPoint){setFirstPoint(point);setHoverPoint(point);return}
    if(firstPoint.time===point.time&&Math.abs(firstPoint.price-point.price)<1e-9)return
    await persist({ticker,points:[firstPoint,point],mode:'touch',enabled:false,notifyTelegram:true})
    setTool('cursor');setFirstPoint(null);setHoverPoint(null)
  },[tool,source,pointFromPointer,persist,ticker,firstPoint])

  const onDrawMove=useCallback((event:React.MouseEvent<HTMLDivElement>)=>{
    if(tool!=='trendline'||!firstPoint)return
    const point=pointFromPointer(event.clientX,event.clientY)
    if(point)setHoverPoint(point)
  },[tool,firstPoint,pointFromPointer])

  const geometry=useCallback((points:[ChartAlertPoint,ChartAlertPoint])=>{
    if(!bridge||source.length<2)return null
    const first=source[0],last=source[source.length-1]
    const p0=linePriceAt(points,first.time),p1=linePriceAt(points,last.time)
    if(p0==null||p1==null)return null
    const x0=bridge.chart.timeScale().logicalToCoordinate(0),x1=bridge.chart.timeScale().logicalToCoordinate(source.length-1)
    const y0=bridge.series.priceToCoordinate(p0),y1=bridge.series.priceToCoordinate(p1)
    if(x0==null||x1==null||y0==null||y1==null)return null
    return{x0:Number(x0),y0:Number(y0),x1:Number(x1),y1:Number(y1)}
  },[bridge,source])

  const updateMode=async(alert:ChartAlert,value:string)=>{
    if(value==='off')return persist({...alert,enabled:false})
    return persist({...alert,mode:value as ChartAlertMode,enabled:true})
  }
  const remove=async(alert:ChartAlert)=>{
    if(!alert.id)return
    setBusy(true)
    try{await deleteChartAlert(alert.id);await refreshAlerts();setServiceError('')}
    catch(error){setServiceError(String(error))}
    finally{setBusy(false)}
  }

  if(!open)return null
  const draft=firstPoint&&hoverPoint?geometry([firstPoint,hoverPoint]):null
  return <aside className="cad-dock" aria-label="StockScout drawings and alerts">
    <header className="cad-head"><div><b>✏ DRAWINGS & ALERTS</b><span>{ticker||'No ticker selected'} · Supabase persistent</span></div><button onClick={()=>onOpenChange(false)} aria-label="Close drawings and alerts">×</button></header>
    <div className="cad-controls"><div><button className={tool==='cursor'?'active':''} onClick={()=>{setTool('cursor');setFirstPoint(null);setHoverPoint(null)}}>↖ Cursor</button><button className={tool==='trendline'?'active':''} onClick={()=>{setTool('trendline');setFirstPoint(null);setHoverPoint(null)}}>↗ Trendline</button><button className={tool==='horizontal'?'active':''} onClick={()=>{setTool('horizontal');setFirstPoint(null);setHoverPoint(null)}}>— Horizontal</button></div><div>{(['D','W'] as Interval[]).map(value=><button className={interval===value?'active':''} onClick={()=>setInterval(value)} key={value}>{value}</button>)}{(['1Y','2Y','5Y'] as Range[]).map(value=><button className={range===value?'active':''} onClick={()=>setRange(value)} key={value}>{value}</button>)}</div></div>
    {tool!=='cursor'&&<div className="cad-hint">{tool==='horizontal'?'Click the price level.':'Click anchor 1, then anchor 2.'} · Esc cancels</div>}
    <div className="cad-chart-stage">
      {chartStatus==='loading'&&<div className="cad-chart-message">Loading chart…</div>}
      {chartStatus==='unavailable'&&<div className="cad-chart-message">Chart unavailable for {ticker}</div>}
      {chartStatus==='error'&&<div className="cad-chart-message">Chart load failed</div>}
      <div className="cad-chart" ref={chartRef}/>
      {bridge&&<svg className="cad-lines" aria-hidden="true">{tickerAlerts.map(alert=>{const g=geometry(alert.points);if(!g)return null;const color=alert.enabled?MODE_COLOR[alert.mode]:'#7c8595';return <line key={alert.id||`${alert.ticker}-${alert.points[0].time}`} x1={g.x0} y1={g.y0} x2={g.x1} y2={g.y1} stroke={color} strokeWidth={alert.enabled?2:1.5} strokeDasharray={alert.enabled?undefined:'6 5'}/>})}{draft&&<line x1={draft.x0} y1={draft.y0} x2={draft.x1} y2={draft.y1} stroke="#aab5c4" strokeWidth="1.5" strokeDasharray="5 4"/>}</svg>}
      {tool!=='cursor'&&bridge&&<div className="cad-capture" onClick={onDrawClick} onMouseMove={onDrawMove}/>} 
    </div>
    <section className="cad-list"><div className="cad-section-title"><b>LINES</b><span>{tickerAlerts.length} saved · {tickerAlerts.filter(alert=>alert.enabled).length} active</span></div>{tickerAlerts.length===0?<p className="cad-empty">Draw a trendline or horizontal level. New drawings are saved immediately; the alert starts only after you choose a trigger.</p>:tickerAlerts.map(alert=><div className="cad-row" key={alert.id}><div><b>{isHorizontalAlert(alert)?`Horizontal $${fmtPrice(alert.points[0].price)}`:'Trendline'}</b><small>{alert.points[0].time} → {alert.points[1].time}</small></div><select disabled={busy} value={alert.enabled?alert.mode:'off'} onChange={event=>updateMode(alert,event.target.value)}><option value="off">Alert off</option><option value="break_up">Cross ↑</option><option value="break_down">Cross ↓</option><option value="touch">Touch</option></select><label className="cad-telegram"><input type="checkbox" checked={alert.notifyTelegram} disabled={busy} onChange={event=>persist({...alert,notifyTelegram:event.target.checked})}/> Telegram</label><button className="danger" disabled={busy} onClick={()=>remove(alert)}>Delete</button></div>)}</section>
    <section className="cad-events"><div className="cad-section-title"><b>RECENT TRIGGERS</b><button onClick={refreshAlerts}>↻</button></div>{tickerEvents.length===0?<p className="cad-empty">No triggered alerts for {ticker} yet.</p>:tickerEvents.map(event=><article key={event.id}><b>🔔 {event.event_type==='break_up'?'Crossed above':event.event_type==='break_down'?'Crossed below':'Touched'} · {event.market_date}</b><span>line {fmtPrice(event.line_price)} · close {fmtPrice(event.close_price)}</span><small>Telegram: {event.telegram_status.replace('_',' ')}</small></article>)}</section>
    {serviceError&&<div className="cad-error">{serviceError}</div>}
    <footer>Alerts are evaluated against the latest published StockScout scan. This browser keeps the private device identity; StockScout scoring is untouched.</footer>
  </aside>
}
