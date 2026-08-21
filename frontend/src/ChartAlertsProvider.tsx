import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from 'react'
import {
  deleteChartAlertRule,deleteChartDrawing,loadChartAlertsV2,saveChartAlertRule,saveChartDrawing,
  type ChartAlertRule,type ChartAlertsV2Snapshot,type ChartDrawing,
} from './deepvue/chartAlerts'

export type ChartDrawTool='cursor'|'trendline'|'horizontal'

type ChartAlertsContextValue={
  snapshot:ChartAlertsV2Snapshot
  loading:boolean
  busy:boolean
  error:string
  tool:ChartDrawTool
  selectedDrawingId:string|null
  setTool:(tool:ChartDrawTool)=>void
  selectDrawing:(id:string|null)=>void
  refresh:()=>Promise<void>
  upsertDrawing:(drawing:ChartDrawing)=>Promise<ChartDrawing>
  removeDrawing:(id:string)=>Promise<void>
  upsertRule:(rule:ChartAlertRule)=>Promise<ChartAlertRule>
  removeRule:(id:string)=>Promise<void>
}

const EMPTY:ChartAlertsV2Snapshot={drawings:[],rules:[],status:[],events:[]}
const Context=createContext<ChartAlertsContextValue|null>(null)

export function ChartAlertsProvider({children}:{children:ReactNode}){
  const[snapshot,setSnapshot]=useState<ChartAlertsV2Snapshot>(EMPTY)
  const[loading,setLoading]=useState(true)
  const[busy,setBusy]=useState(false)
  const[error,setError]=useState('')
  const[tool,setToolState]=useState<ChartDrawTool>('cursor')
  const[selectedDrawingId,setSelectedDrawingId]=useState<string|null>(null)

  const refresh=useCallback(async()=>{
    try{const next=await loadChartAlertsV2();setSnapshot(next);setError('')}
    catch(nextError){setError(String(nextError))}
    finally{setLoading(false)}
  },[])

  useEffect(()=>{
    refresh()
    const timer=window.setInterval(refresh,60_000)
    return()=>window.clearInterval(timer)
  },[refresh])

  const setTool=useCallback((next:ChartDrawTool)=>{setToolState(next);if(next!=='cursor')setSelectedDrawingId(null)},[])
  const selectDrawing=useCallback((id:string|null)=>{setSelectedDrawingId(id);if(id)setToolState('cursor')},[])

  const upsertDrawing=useCallback(async(drawing:ChartDrawing)=>{
    setBusy(true)
    try{
      const saved=await saveChartDrawing(drawing)
      setSnapshot(current=>({...current,drawings:[saved,...current.drawings.filter(item=>item.id!==saved.id)]}))
      setSelectedDrawingId(saved.id||null);setError('')
      return saved
    }catch(nextError){setError(String(nextError));throw nextError}
    finally{setBusy(false)}
  },[])

  const removeDrawing=useCallback(async(id:string)=>{
    setBusy(true)
    try{
      await deleteChartDrawing(id)
      setSnapshot(current=>({
        drawings:current.drawings.filter(item=>item.id!==id),
        rules:current.rules.filter(item=>item.drawingId!==id),
        status:current.status.filter(item=>item.drawingId!==id),
        events:current.events,
      }))
      setSelectedDrawingId(current=>current===id?null:current);setError('')
    }catch(nextError){setError(String(nextError));throw nextError}
    finally{setBusy(false)}
  },[])

  const upsertRule=useCallback(async(rule:ChartAlertRule)=>{
    setBusy(true)
    try{
      const saved=await saveChartAlertRule(rule)
      setSnapshot(current=>({...current,rules:[saved,...current.rules.filter(item=>item.id!==saved.id&&item.drawingId!==saved.drawingId)]}))
      setError('');return saved
    }catch(nextError){setError(String(nextError));throw nextError}
    finally{setBusy(false)}
  },[])

  const removeRule=useCallback(async(id:string)=>{
    setBusy(true)
    try{
      const drawingId=snapshot.rules.find(item=>item.id===id)?.drawingId
      await deleteChartAlertRule(id)
      setSnapshot(current=>({
        ...current,
        rules:current.rules.filter(item=>item.id!==id),
        status:current.status.map(item=>item.drawingId===drawingId?{...item,ruleId:null,state:'paused' as const}:item),
      }))
      setError('')
    }catch(nextError){setError(String(nextError));throw nextError}
    finally{setBusy(false)}
  },[snapshot.rules])

  const value=useMemo<ChartAlertsContextValue>(()=>({
    snapshot,loading,busy,error,tool,selectedDrawingId,setTool,selectDrawing,refresh,upsertDrawing,removeDrawing,upsertRule,removeRule,
  }),[snapshot,loading,busy,error,tool,selectedDrawingId,setTool,selectDrawing,refresh,upsertDrawing,removeDrawing,upsertRule,removeRule])

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useChartAlerts(){
  const value=useContext(Context)
  if(!value)throw new Error('useChartAlerts must be used within ChartAlertsProvider')
  return value
}
