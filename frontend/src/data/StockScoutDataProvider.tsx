import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from 'react'
import type {ReviewScope} from '../phase4Review'

export type AssetDescriptor={
  path:string
  sha256:string
  bytes:number
  coverage:number
  coveragePct:number
  pattern?:string
  shardCount?:number
}

export type StockScoutManifest={
  manifestVersion:2
  model:string
  generatedAt:string
  marketSession?:{date?:string|null;status?:string;timezone?:string}
  universe:number
  provenance:{
    source:{kind:string;path:string;sha256:string;bytes:number}
    publication:{kind:string;model:string;sourceSha256:string}
  }
  assets:{
    core:AssetDescriptor
    legacyIndex:AssetDescriptor
    legacyDetails:AssetDescriptor
    legacyConfirmation:AssetDescriptor
    charts:AssetDescriptor
  }
}

export type StockScoutRow={ticker:string;[key:string]:any}
export type StockScoutCore={
  generatedAt:string
  market:Record<string,any>
  universe:StockScoutRow[]
  chartShards?:Record<string,string>
  [key:string]:any
}
export type LegacyIndex={generatedAt:string;market:Record<string,any>;layers?:Record<string,any>;universe:StockScoutRow[];[key:string]:any}
export type ChartState=
  |{status:'ready';rows:any[]}
  |{status:'unavailable';rows:[]}
  |{status:'error';rows:[];error:string}

type LoadOptions={cache?:RequestCache;force?:boolean;cacheBust?:boolean}
type FetchLike=(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>

export class JsonPromiseCache{
  private pending=new Map<string,Promise<unknown>>()
  constructor(private fetcher:FetchLike=(input,init)=>fetch(input,init)){}

  load<T>(key:string,url:string,options:LoadOptions={}):Promise<T>{
    if(options.force)this.pending.delete(key)
    const existing=this.pending.get(key)
    if(existing)return existing as Promise<T>
    const requestUrl=options.cacheBust?`${url}${url.includes('?')?'&':'?'}retry=${Date.now()}`:url
    const request=this.fetcher(requestUrl,{cache:options.cache??'default'})
      .then(response=>{
        if(!response.ok)throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<T>
      })
      .catch(error=>{
        this.pending.delete(key)
        throw error
      })
    this.pending.set(key,request)
    return request
  }

  delete(key:string){this.pending.delete(key)}
  clear(){this.pending.clear()}
}

export const sharedDataCache=new JsonPromiseCache()

function dataUrl(path:string){return `./data/${path.replace(/^\.?\/?data\//,'').replace(/^\//,'')}`}
function versionedUrl(asset:AssetDescriptor,path=asset.path){
  return `${dataUrl(path)}?v=${encodeURIComponent(asset.sha256)}`
}
function normalizedTicker(){return location.hash.replace(/^#/,'').trim().toUpperCase()}
function detailShardFor(ticker:string,count=128){
  const normalized=ticker.trim().toUpperCase()
  let value=0
  for(let index=0;index<normalized.length;index++)value+=(index+1)*normalized.charCodeAt(index)
  return String(value%Math.max(1,Math.floor(count))).padStart(3,'0')
}
function expandCompactFundamentals(core:StockScoutCore):StockScoutCore{
  return {...core,universe:core.universe.map(row=>{
    const dims=row.fundamentalDims
    if(!Array.isArray(dims))return row
    return {...row,
      fundamentalGrowthScore:row.fundamentalGrowthScore??dims[0]??null,
      fundamentalMarginScore:row.fundamentalMarginScore??dims[1]??null,
      fundamentalInventoryScore:row.fundamentalInventoryScore??dims[2]??null,
    }
  })}
}

type DataContextValue={
  manifest:StockScoutManifest|null
  core:StockScoutCore|null
  loading:boolean
  error:string
  selectedTicker:string
  selectTicker:(ticker:string)=>void
  reviewScope:ReviewScope
  setReviewScope:(scope:ReviewScope)=>void
  reload:()=>void
  loadLegacyIndex:()=>Promise<LegacyIndex>
  loadLegacyDetail:(ticker:string,force?:boolean)=>Promise<StockScoutRow|null>
  loadChart:(ticker:string,retry?:boolean)=>Promise<ChartState>
  loadOptional:<T>(path:string)=>Promise<T|null>
}

const DataContext=createContext<DataContextValue|null>(null)

export function StockScoutDataProvider({children}:{children:ReactNode}){
  const[manifest,setManifest]=useState<StockScoutManifest|null>(null)
  const[core,setCore]=useState<StockScoutCore|null>(null)
  const[loading,setLoading]=useState(true)
  const[error,setError]=useState('')
  const[selectedTicker,setSelectedTicker]=useState(normalizedTicker)
  const[reviewScope,setReviewScope]=useState<ReviewScope>(null)
  const[revision,setRevision]=useState(0)

  useEffect(()=>{
    let live=true
    setLoading(true)
    ;(async()=>{
      const nextManifest=await sharedDataCache.load<StockScoutManifest>(
        'manifest','./data/manifest.json',{cache:'no-cache'},
      )
      if(nextManifest.manifestVersion!==2)throw new Error(`Unsupported manifest v${nextManifest.manifestVersion??'unknown'}`)
      const coreAsset=nextManifest.assets?.core
      if(!coreAsset?.path||!coreAsset.sha256)throw new Error('Manifest has no versioned core asset')
      const nextCore=await sharedDataCache.load<StockScoutCore>(
        `core:${coreAsset.sha256}`,versionedUrl(coreAsset),{cache:'default'},
      )
      if(!nextCore.universe?.length)throw new Error('Core dataset is empty')
      if(nextCore.generatedAt!==nextManifest.generatedAt||nextCore.universe.length!==nextManifest.universe){
        throw new Error('Core dataset does not match manifest')
      }
      const hydratedCore=expandCompactFundamentals(nextCore)
      if(live){
        setManifest(nextManifest);setCore(hydratedCore);setError('')
        setSelectedTicker(current=>current||hydratedCore.universe[0].ticker)
      }
    })().catch(nextError=>{if(live)setError(String(nextError))}).finally(()=>{if(live)setLoading(false)})
    return()=>{live=false}
  },[revision])

  useEffect(()=>{
    const sync=()=>setSelectedTicker(normalizedTicker())
    window.addEventListener('hashchange',sync)
    window.addEventListener('popstate',sync)
    return()=>{window.removeEventListener('hashchange',sync);window.removeEventListener('popstate',sync)}
  },[])

  const selectTicker=useCallback((ticker:string)=>{
    const next=ticker.trim().toUpperCase()
    if(!next)return
    setSelectedTicker(next)
    history.replaceState(null,'',`${location.pathname}${location.search}#${next}`)
  },[])

  const reload=useCallback(()=>{
    sharedDataCache.clear();setManifest(null);setCore(null);setError('');setRevision(value=>value+1)
  },[])

  const loadLegacyIndex=useCallback(async()=>{
    if(!manifest)throw new Error('Manifest is not ready')
    const asset=manifest.assets.legacyIndex
    return sharedDataCache.load<LegacyIndex>(`legacy-index:${asset.sha256}`,versionedUrl(asset),{cache:'default'})
  },[manifest])

  const loadLegacyDetail=useCallback(async(ticker:string,force=false)=>{
    if(!manifest)throw new Error('Manifest is not ready')
    const normalized=ticker.trim().toUpperCase()
    const asset=manifest.assets.legacyDetails
    const shard=detailShardFor(normalized,asset.shardCount)
    const key=`legacy-detail:${asset.sha256}:${shard}`
    const path=`${asset.path}/${shard}.json`
    const rows=await sharedDataCache.load<Record<string,StockScoutRow>>(
      key,versionedUrl(asset,path),{cache:force?'no-store':'default',force,cacheBust:force},
    )
    return rows[normalized]||null
  },[manifest])

  const loadChart=useCallback(async(ticker:string,retry=false):Promise<ChartState>=>{
    if(!manifest||!core)return{status:'error',rows:[],error:'Dataset is not ready'}
    const normalized=ticker.trim().toUpperCase()
    const shard=core.chartShards?.[normalized]
    if(!shard)return{status:'unavailable',rows:[]}
    const asset=manifest.assets.charts
    const key=`chart:${asset.sha256}:${shard}`
    try{
      const rows=await sharedDataCache.load<Record<string,any[]>>(
        key,versionedUrl(asset,`${asset.path}/${shard}`),
        {cache:retry?'no-store':'default',force:retry,cacheBust:retry},
      )
      return rows[normalized]?.length?{status:'ready',rows:rows[normalized]}:{status:'unavailable',rows:[]}
    }catch(nextError){return{status:'error',rows:[],error:String(nextError)}}
  },[manifest,core])

  const loadOptional=useCallback(async<T,>(path:string):Promise<T|null>=>{
    try{return await sharedDataCache.load<T>(`optional:${path}`,dataUrl(path),{cache:'no-cache'})}
    catch{return null}
  },[])

  const value=useMemo<DataContextValue>(()=>({
    manifest,core,loading,error,selectedTicker,selectTicker,reviewScope,setReviewScope,reload,
    loadLegacyIndex,loadLegacyDetail,loadChart,loadOptional,
  }),[manifest,core,loading,error,selectedTicker,selectTicker,reviewScope,reload,loadLegacyIndex,loadLegacyDetail,loadChart,loadOptional])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useStockScoutData(){
  const value=useContext(DataContext)
  if(!value)throw new Error('useStockScoutData must be used within StockScoutDataProvider')
  return value
}
