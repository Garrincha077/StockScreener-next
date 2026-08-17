import {useEffect} from 'react'

type ResizeMode='both'|'vertical'
type Size={width?:number;height?:number}
type Spec={selector:string;prefix:string;mode:ResizeMode;label?:boolean}

const STORAGE_KEY='stockscout-panel-sizes-v1'
const RESET_EVENT='stockscout:reset-panel-sizes'

const specs:Spec[]=[
  {selector:'.dv-builder',prefix:'filter-builder',mode:'vertical'},
  {selector:'.dv-colpicker',prefix:'column-picker',mode:'vertical'},
  {selector:'.dv-tablebox',prefix:'stock-table',mode:'vertical'},
  {selector:'.dv-detail',prefix:'stock-detail',mode:'both'},
  {selector:'.dv-chartbox',prefix:'stock-chart',mode:'vertical'},
  {selector:'.dv-gridview',prefix:'rapid-review',mode:'both'},
  {selector:'.dv-market > section',prefix:'market-card',mode:'both',label:true},
  {selector:'.grp-hero > div',prefix:'group-summary',mode:'both',label:true},
  {selector:'.grp-note',prefix:'group-note',mode:'vertical'},
  {selector:'.grp-board',prefix:'group-board',mode:'vertical'},
  {selector:'.grp-leaders',prefix:'group-leaders',mode:'both'},
]

function readSizes():Record<string,Size>{
  try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')||{}}catch{return{}}
}
function cleanLabel(value:string){return value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)}
function panelId(spec:Spec,el:HTMLElement,index:number){
  if(spec.label){
    const text=el.querySelector('h1,h2,h3,small,b')?.textContent||''
    const slug=cleanLabel(text)
    if(slug)return `${spec.prefix}-${slug}`
  }
  return index?`${spec.prefix}-${index+1}`:spec.prefix
}
function nearResizeHandle(event:PointerEvent,el:HTMLElement,mode:ResizeMode){
  const rect=el.getBoundingClientRect(),bottom=rect.bottom-event.clientY<=24&&rect.bottom-event.clientY>=-4
  if(mode==='vertical')return bottom
  const right=rect.right-event.clientX<=24&&rect.right-event.clientX>=-4
  return bottom&&right
}

export function resetPanelSizes(){window.dispatchEvent(new Event(RESET_EVENT))}

export function useResizablePanels(){
  useEffect(()=>{
    let sizes=readSizes(),active:HTMLElement|null=null
    const bound=new Set<HTMLElement>()

    const apply=(el:HTMLElement,spec:Spec,index:number)=>{
      if(bound.has(el))return
      bound.add(el)
      const id=panelId(spec,el,index)
      el.dataset.panelId=id
      el.dataset.resizeMode=spec.mode
      el.classList.add('ss-resizable',spec.mode==='both'?'ss-resize-both':'ss-resize-vertical')
      const saved=sizes[id]
      if(saved&&window.innerWidth>1050){
        if(spec.mode==='both'&&saved.width)el.style.width=`${Math.round(saved.width)}px`
        if(saved.height)el.style.height=`${Math.round(saved.height)}px`
      }
    }
    const bindAll=()=>specs.forEach(spec=>document.querySelectorAll<HTMLElement>(spec.selector).forEach((el,index)=>apply(el,spec,index)))
    bindAll()
    const mutations=new MutationObserver(bindAll)
    mutations.observe(document.body,{childList:true,subtree:true})

    const onPointerDown=(event:PointerEvent)=>{
      if(window.innerWidth<=1050)return
      const target=event.target instanceof Element?event.target.closest<HTMLElement>('.ss-resizable'):null
      if(!target)return
      const mode=(target.dataset.resizeMode||'both') as ResizeMode
      if(nearResizeHandle(event,target,mode))active=target
    }
    const persist=()=>{
      if(!active)return
      const id=active.dataset.panelId,mode=(active.dataset.resizeMode||'both') as ResizeMode
      if(id){
        const rect=active.getBoundingClientRect(),next:Size={height:Math.round(rect.height)}
        if(mode==='both')next.width=Math.round(rect.width)
        sizes={...sizes,[id]:next}
        localStorage.setItem(STORAGE_KEY,JSON.stringify(sizes))
      }
      active=null
    }
    const onDoubleClick=(event:MouseEvent)=>{
      if(window.innerWidth<=1050)return
      const target=event.target instanceof Element?event.target.closest<HTMLElement>('.ss-resizable'):null
      if(!target)return
      const mode=(target.dataset.resizeMode||'both') as ResizeMode
      if(!nearResizeHandle(event as unknown as PointerEvent,target,mode))return
      const id=target.dataset.panelId
      if(id){delete sizes[id];localStorage.setItem(STORAGE_KEY,JSON.stringify(sizes))}
      target.style.removeProperty('width');target.style.removeProperty('height')
    }
    const reset=()=>{
      sizes={};localStorage.removeItem(STORAGE_KEY)
      document.querySelectorAll<HTMLElement>('.ss-resizable').forEach(el=>{el.style.removeProperty('width');el.style.removeProperty('height')})
    }

    document.addEventListener('pointerdown',onPointerDown,true)
    document.addEventListener('pointerup',persist,true)
    document.addEventListener('pointercancel',persist,true)
    document.addEventListener('dblclick',onDoubleClick,true)
    window.addEventListener(RESET_EVENT,reset)
    return()=>{
      mutations.disconnect()
      document.removeEventListener('pointerdown',onPointerDown,true)
      document.removeEventListener('pointerup',persist,true)
      document.removeEventListener('pointercancel',persist,true)
      document.removeEventListener('dblclick',onDoubleClick,true)
      window.removeEventListener(RESET_EVENT,reset)
    }
  },[])
}
