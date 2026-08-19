export const GRID_STEP=16

export function nextGridCount(current:number,total:number,step=GRID_STEP){
  const safeTotal=Math.max(0,Math.floor(total))
  const safeCurrent=Math.max(0,Math.floor(current))
  const safeStep=Math.max(1,Math.floor(step))
  return Math.min(safeTotal,safeCurrent+safeStep)
}

type FetchLike=(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>
type SleepLike=(ms:number)=>Promise<void>

type RetryOptions={
  attempts?:number
  baseDelayMs?:number
  cache?:RequestCache
}

const sleep:SleepLike=(ms)=>new Promise(resolve=>setTimeout(resolve,ms))

export async function fetchJsonWithRetry<T>(
  url:string,
  options:RetryOptions={},
  fetcher:FetchLike=fetch,
  sleeper:SleepLike=sleep,
):Promise<T>{
  const attempts=Math.max(1,Math.floor(options.attempts??3))
  const baseDelayMs=Math.max(0,Math.floor(options.baseDelayMs??250))
  let lastError:unknown=new Error('request failed')
  for(let attempt=1;attempt<=attempts;attempt++){
    try{
      const response=await fetcher(url,{cache:options.cache??'force-cache'})
      if(!response.ok)throw new Error(`HTTP ${response.status}`)
      return await response.json() as T
    }catch(error){
      lastError=error
      if(attempt<attempts&&baseDelayMs>0)await sleeper(baseDelayMs*attempt)
    }
  }
  throw lastError
}

export class RetryJsonCache<T>{
  private pending=new Map<string,Promise<T>>()
  constructor(
    private fetcher:FetchLike=fetch,
    private sleeper:SleepLike=sleep,
    private options:RetryOptions={attempts:3,baseDelayMs:250,cache:'force-cache'},
  ){}

  load(key:string,url:string):Promise<T>{
    const existing=this.pending.get(key)
    if(existing)return existing
    const request=fetchJsonWithRetry<T>(url,this.options,this.fetcher,this.sleeper).catch(error=>{
      this.pending.delete(key)
      throw error
    })
    this.pending.set(key,request)
    return request
  }

  clear(){this.pending.clear()}
  delete(key:string){this.pending.delete(key)}
}
