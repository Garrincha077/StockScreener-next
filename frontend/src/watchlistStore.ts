import {useSyncExternalStore} from 'react'

export const WATCHLIST_KEY='stockscout-watchlist'
const EMPTY_WATCHLIST:string[]=[]

export function normalizeWatchlist(value:unknown):string[]{
  if(!Array.isArray(value))return EMPTY_WATCHLIST
  const seen=new Set<string>()
  const normalized:string[]=[]
  for(const item of value){
    if(typeof item!=='string')continue
    const ticker=item.trim().toUpperCase()
    if(!ticker||seen.has(ticker))continue
    seen.add(ticker)
    normalized.push(ticker)
  }
  return normalized
}

function readWatchlist():string[]{
  if(typeof localStorage==='undefined')return EMPTY_WATCHLIST
  try{return normalizeWatchlist(JSON.parse(localStorage.getItem(WATCHLIST_KEY)||'[]'))}
  catch{return EMPTY_WATCHLIST}
}

let current=readWatchlist()
const listeners=new Set<()=>void>()

function emit(){for(const listener of listeners)listener()}
function subscribe(listener:()=>void){listeners.add(listener);return()=>listeners.delete(listener)}
function getSnapshot(){return current}
function getServerSnapshot(){return EMPTY_WATCHLIST}
function replaceWatchlist(next:string[]){
  current=normalizeWatchlist(next)
  try{localStorage.setItem(WATCHLIST_KEY,JSON.stringify(current))}catch{}
  emit()
}

export function toggleWatchlistTicker(ticker:string){
  const normalized=ticker.trim().toUpperCase()
  if(!normalized)return
  replaceWatchlist(current.includes(normalized)?current.filter(item=>item!==normalized):[...current,normalized])
}

export function useStockScoutWatchlist(){
  const watchlist=useSyncExternalStore(subscribe,getSnapshot,getServerSnapshot)
  return{watchlist,toggleWatch:toggleWatchlistTicker,isWatched:(ticker:string)=>watchlist.includes(ticker.trim().toUpperCase())}
}

if(typeof window!=='undefined'){
  window.addEventListener('storage',event=>{
    if(event.key!==WATCHLIST_KEY)return
    const next=readWatchlist()
    if(JSON.stringify(next)===JSON.stringify(current))return
    current=next
    emit()
  })
}
