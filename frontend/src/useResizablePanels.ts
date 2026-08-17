import {useEffect} from 'react'

type ResizeMode='both'|'vertical'
type Size={width?:number;height?:number}
type Spec={selector:string;prefix:string;mode:ResizeMode;label?:boolean}

const STORAGE_KEY='stockscout-panel-sizes-v1'
const RESET_EVENT='stockscout:reset-panel-sizes'
const TERMINAL_SPLIT_ID='terminal-detail-pane'
const DETAIL_MIN=360
const TABLE_MIN=430

const specs:Spec[]=[
  {selector:'.dv-builder',prefix:'filter-builder',mode:'vertical'},
  {selector:'.dv-colpicker',prefix:'column-picker',mode:'vertical'},
  {selector:'.dv-tablebox',prefix:'stock-table',mode:'vertical'},
  // Horizontal sizing is handled by the true pane splitter; native resize is height-only.
  {selector:'.dv-detail',prefix:'stock-detail',mode:'vertical'},
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
function clamp(value:number,min:number,max:number){return Math.max(min,Math.min(max,value))}

export function resetPanelSizes(){window.dispatchEvent(new Event(RESET_EVENT))}

export function useResizablePanels(){
  useEffect(()=>{
    let sizes=readSizes(),active:HTMLElement|null=null
    let splitDrag:null|{host:HTMLElement;startX:number;startWidth:number}=null
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
    const ensureTerminalSplitter=()=>{
      const host=document.querySelector<HTMLElement>('.dv-work')
      if(!host)return
      const table=host.querySelector<HTMLElement>(':scope > .dv-tablebox')
      const detail=host.querySelector<HTMLElement>(':scope > .dv-detail')
      if(!table||!detail)return
      let splitter=host.querySelector<HTMLElement>(':scope > .ss-pane-splitter')
      if(!splitter){
        splitter=document.createElement('div')
        splitter.className='ss-pane-splitter'
        splitter.setAttribute('role','separator')
        splitter.setAttribute('aria-orientation','vertical')
        splitter.setAttribute('aria-label','Resize table and chart panes')
        splitter.tabIndex=0
        splitter.title='Drag left/right to resize table and chart · double-click to reset'
        host.insertBefore(splitter,detail)
      }
      const saved=sizes[TERMINAL_SPLIT_ID]?.width
      if(saved&&window.innerWidth>1050)host.style.setProperty('--ss-detail-pane',`${Math.round(saved)}px`)
    }
    const bindAll=()=>{specs.forEach(spec=>document.querySelectorAll<HTMLElement>(spec.selector).forEach((el,index)=>apply(el,spec,index)));ensureTerminalSplitter()}
    bindAll()
    const mutations=new MutationObserver(bindAll)
    mutations.observe(document.body,{childList:true,subtree:true})

    const setDetailWidth=(host:HTMLElement,width:number,persist=false)=>{
      const max=Math.max(DETAIL_MIN,host.clientWidth-TABLE_MIN-12)
      const next=Math.round(clamp(width,DETAIL_MIN,max))
      host.style.setProperty('--ss-detail-pane',`${next}px`)
      if(persist){sizes={...sizes,[TERMINAL_SPLIT_ID]:{width:next}};localStorage.setItem(STORAGE_KEY,JSON.stringify(sizes))}
      return next
    }
    const onPointerDown=(event:PointerEvent)=>{
      if(window.innerWidth<=1050)return
      const element=event.target instanceof Element?event.target:null
      const splitter=element?.closest<HTMLElement>('.ss-pane-splitter')
      if(splitter){
        const host=splitter.parentElement as HTMLElement|null
        const detail=host?.querySelector<HTMLElement>(':scope > .dv-detail')
        if(!host||!detail)return
        splitDrag={host,startX:event.clientX,startWidth:detail.getBoundingClientRect().width}
        document.body.classList.add('ss-is-splitting')
        splitter.classList.add('active')
        event.preventDefault()
        return
      }
      const target=element?.closest<HTMLElement>('.ss-resizable')||null
      if(!target)return
      const mode=(target.dataset.resizeMode||'both') as ResizeMode
      if(nearResizeHandle(event,target,mode))active=target
    }
    const onPointerMove=(event:PointerEvent)=>{
      if(!splitDrag)return
      // Moving divider left increases the chart/detail pane; moving right increases the table.
      setDetailWidth(splitDrag.host,splitDrag.startWidth-(event.clientX-splitDrag.startX),false)
      event.preventDefault()
    }
    const persist=()=>{
      if(splitDrag){
        const detail=splitDrag.host.querySelector<HTMLElement>(':scope > .dv-detail')
        if(detail)setDetailWidth(splitDrag.host,detail.getBoundingClientRect().width,true)
        splitDrag.host.querySelector<HTMLElement>(':scope > .ss-pane-splitter')?.classList.remove('active')
        document.body.classList.remove('ss-is-splitting')
        splitDrag=null
      }
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
    const resetTerminalSplit=(host:HTMLElement)=>{
      delete sizes[TERMINAL_SPLIT_ID]
      localStorage.setItem(STORAGE_KEY,JSON.stringify(sizes))
      host.style.removeProperty('--ss-detail-pane')
    }
    const onDoubleClick=(event:MouseEvent)=>{
      if(window.innerWidth<=1050)return
      const element=event.target instanceof Element?event.target:null
      const splitter=element?.closest<HTMLElement>('.ss-pane-splitter')
      if(splitter){resetTerminalSplit(splitter.parentElement as HTMLElement);return}
      const target=element?.closest<HTMLElement>('.ss-resizable')||null
      if(!target)return
      const mode=(target.dataset.resizeMode||'both') as ResizeMode
      if(!nearResizeHandle(event as unknown as PointerEvent,target,mode))return
      const id=target.dataset.panelId
      if(id){delete sizes[id];localStorage.setItem(STORAGE_KEY,JSON.stringify(sizes))}
      target.style.removeProperty('width');target.style.removeProperty('height')
    }
    const onKeyDown=(event:KeyboardEvent)=>{
      if(window.innerWidth<=1050||!(event.target instanceof HTMLElement)||!event.target.classList.contains('ss-pane-splitter'))return
      if(!['ArrowLeft','ArrowRight','Home'].includes(event.key))return
      const host=event.target.parentElement as HTMLElement
      const detail=host.querySelector<HTMLElement>(':scope > .dv-detail')
      if(!detail)return
      event.preventDefault()
      if(event.key==='Home'){resetTerminalSplit(host);return}
      const delta=event.shiftKey?100:32
      const current=detail.getBoundingClientRect().width
      setDetailWidth(host,current+(event.key==='ArrowLeft'?delta:-delta),true)
    }
    const reset=()=>{
      sizes={};localStorage.removeItem(STORAGE_KEY)
      document.querySelectorAll<HTMLElement>('.ss-resizable').forEach(el=>{el.style.removeProperty('width');el.style.removeProperty('height')})
      document.querySelectorAll<HTMLElement>('.dv-work').forEach(el=>el.style.removeProperty('--ss-detail-pane'))
    }

    document.addEventListener('pointerdown',onPointerDown,true)
    document.addEventListener('pointermove',onPointerMove,true)
    document.addEventListener('pointerup',persist,true)
    document.addEventListener('pointercancel',persist,true)
    document.addEventListener('dblclick',onDoubleClick,true)
    document.addEventListener('keydown',onKeyDown,true)
    window.addEventListener(RESET_EVENT,reset)
    return()=>{
      mutations.disconnect()
      document.removeEventListener('pointerdown',onPointerDown,true)
      document.removeEventListener('pointermove',onPointerMove,true)
      document.removeEventListener('pointerup',persist,true)
      document.removeEventListener('pointercancel',persist,true)
      document.removeEventListener('dblclick',onDoubleClick,true)
      document.removeEventListener('keydown',onKeyDown,true)
      window.removeEventListener(RESET_EVENT,reset)
      document.body.classList.remove('ss-is-splitting')
    }
  },[])
}
