import {useSyncExternalStore} from 'react'

const WATCHLIST_KEY='stockscout-watchlist'

function readWatchlist():string[]{
  if(typeof localStorage==='undefined')return[]
  try{
    const value=JSON.parse(localStorage.getItem(WATCHLIST_KEY)||'[]')
    return Array.isArray(value)?value.filter((ticker):ticker is string=>typeof ticker==='string'):[]
  }catch{return[]}
}

let current=readWatchlist()
const listeners=new Set<()=>void>()

function emit(){for(const listener of listeners)listener()}
function subscribe(listener:()=>void){listeners.add(listener);return()=>listeners.delete(listener)}
function getSnapshot(){return current}
function getServerSnapshot(){return[] as string[]}
function replaceWatchlist(next:string[]){
  current=next
  try{localStorage.setItem(WATCHLIST_KEY,JSON.stringify(next))}catch{}
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
