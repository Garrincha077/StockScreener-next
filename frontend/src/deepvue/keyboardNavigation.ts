const NATIVE_SPACE_SELECTOR=[
  'input',
  'textarea',
  'select',
  'button',
  'a[href]',
  'summary',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="option"]',
  '[role="menuitem"]',
  '[role="tab"]',
].join(',')

const REVIEW_NEXT_SELECTOR='.p4-why .p4-next, .p4-queue-continuation [aria-label="Next review candidate from review bar"]'
const GRID_CARD_SELECTOR='.dv-chartgrid .dv-minicard'
const GRID_SENTINEL_SELECTOR='.dv-grid-sentinel'
const TABLE_ROW_SELECTOR='.dv-tablebox tbody tr'
const TABLE_NEXT_SELECTOR='.dv-tablebox footer button:last-of-type'
const INSTALL_KEY='__stockscoutSpaceTickerNavigationCleanup'

export type SpaceTargetDescriptor={
  tagName?:string|null
  contentEditable?:boolean
  role?:string|null
  hasHref?:boolean
}

export function isSpaceAdvanceKey(event:Pick<KeyboardEvent,'key'|'code'|'altKey'|'ctrlKey'|'metaKey'|'repeat'>){
  return (event.code==='Space'||event.key===' ')&&!event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.repeat
}

export function shouldIgnoreSpaceTarget(target:SpaceTargetDescriptor){
  const tag=(target.tagName||'').trim().toLowerCase()
  const role=(target.role||'').trim().toLowerCase()
  if(target.contentEditable)return true
  if(['input','textarea','select','button','summary'].includes(tag))return true
  if(tag==='a'&&target.hasHref)return true
  return ['textbox','combobox','slider','spinbutton','switch','checkbox','radio','option','menuitem','tab'].includes(role)
}

function descriptorFor(element:Element):SpaceTargetDescriptor{
  const html=element as HTMLElement
  return {
    tagName:element.tagName,
    contentEditable:html.isContentEditable,
    role:element.getAttribute('role'),
    hasHref:element instanceof HTMLAnchorElement&&Boolean(element.getAttribute('href')),
  }
}

function targetOwnsSpace(target:EventTarget|null){
  if(!(target instanceof Element))return false
  if(target.closest(NATIVE_SPACE_SELECTOR))return true
  return shouldIgnoreSpaceTarget(descriptorFor(target))
}

function activate(element:HTMLElement){
  element.click()
  element.scrollIntoView({block:'nearest',inline:'nearest'})
}

function elements(selector:string){
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(element=>element.getClientRects().length>0)
}

function selectedIndex(items:HTMLElement[]){
  return items.findIndex(item=>item.classList.contains('selected')||item.getAttribute('aria-selected')==='true')
}

function advanceReviewQueue():boolean{
  const next=elements(REVIEW_NEXT_SELECTOR).find(element=>{
    const button=element as HTMLButtonElement
    return !button.disabled&&button.getAttribute('aria-disabled')!=='true'
  })
  if(!next)return false
  activate(next)
  return true
}

function advanceGrid(retry=0):boolean{
  const cards=elements(GRID_CARD_SELECTOR)
  if(!cards.length)return false
  const current=selectedIndex(cards)
  if(current<0){activate(cards[0]);return true}
  if(current+1<cards.length){activate(cards[current+1]);return true}

  const sentinel=document.querySelector<HTMLElement>(GRID_SENTINEL_SELECTOR)
  if(!sentinel||retry>=6)return false
  sentinel.scrollIntoView({block:'nearest'})
  window.setTimeout(()=>advanceGrid(retry+1),60)
  return true
}

function advanceTable():boolean{
  const rows=elements(TABLE_ROW_SELECTOR)
  if(!rows.length)return false
  const current=selectedIndex(rows)
  if(current<0){activate(rows[0]);return true}
  if(current+1<rows.length){activate(rows[current+1]);return true}

  const next=document.querySelector<HTMLButtonElement>(TABLE_NEXT_SELECTOR)
  if(!next||next.disabled||next.getAttribute('aria-disabled')==='true')return false
  next.click()
  window.setTimeout(()=>{
    const nextRows=elements(TABLE_ROW_SELECTOR)
    if(nextRows.length)activate(nextRows[0])
  },0)
  return true
}

export function installSpaceTickerNavigation(){
  if(typeof window==='undefined'||typeof document==='undefined')return()=>{}
  const host=window as unknown as Window&Record<string,unknown>
  const previous=host[INSTALL_KEY]
  if(typeof previous==='function')previous()

  const onKeyDown=(event:KeyboardEvent)=>{
    if(event.defaultPrevented||!isSpaceAdvanceKey(event)||targetOwnsSpace(event.target))return
    const handled=advanceReviewQueue()||advanceGrid()||advanceTable()
    if(handled)event.preventDefault()
  }
  window.addEventListener('keydown',onKeyDown)
  const cleanup=()=>window.removeEventListener('keydown',onKeyDown)
  host[INSTALL_KEY]=cleanup
  return cleanup
}
