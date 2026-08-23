export type ChartAlertMode='break_up'|'break_down'|'touch'
export type ChartAlertPoint={time:string;price:number}
export type ChartAlert={
  id?:string
  ticker:string
  points:[ChartAlertPoint,ChartAlertPoint]
  mode:ChartAlertMode
  enabled:boolean
  notifyTelegram:boolean
  createdAt?:string
  updatedAt?:string
}
export type ChartAlertEvent={
  id:string
  alert_id:string
  ticker:string
  event_type:ChartAlertMode
  scan_generated_at:string
  market_date:string
  line_price:number|null
  close_price:number|null
  message:string
  telegram_status:'not_configured'|'pending'|'sent'|'error'
  telegram_sent_at?:string|null
  telegram_error?:string|null
  created_at:string
}
export type ChartAlertsSnapshot={alerts:ChartAlert[];events:ChartAlertEvent[]}

export type ChartAlertInterval='D'|'W'
export type ChartDrawingKind='trendline'|'horizontal'
export type ChartDrawingExtension='ray_right'|'pane'
export type ChartAlertCondition='cross_above'|'cross_below'|'touch'
export type ChartAlertSource='close'|'wick'
export type ChartAlertLifecycle='one_shot'|'rearm'
export type ChartDrawing={
  id?:string
  ticker:string
  kind:ChartDrawingKind
  interval:ChartAlertInterval
  points:[ChartAlertPoint,ChartAlertPoint]
  extension:ChartDrawingExtension
  label?:string|null
  style?:Record<string,unknown>
  metadata?:Record<string,unknown>
  createdAt?:string
  updatedAt?:string
}
export type ChartAlertRule={
  id?:string
  drawingId:string
  condition:ChartAlertCondition
  source:ChartAlertSource
  lifecycle:ChartAlertLifecycle
  enabled:boolean
  notifyInApp:boolean
  notifyTelegram:boolean
  createdAt?:string
  updatedAt?:string
}
export type ChartAlertStatus={
  drawingId:string
  ruleId?:string|null
  projectedLinePrice?:number|null
  latestClose?:number|null
  latestHigh?:number|null
  latestLow?:number|null
  distancePct?:number|null
  latestMarketDate?:string|null
  state:'active'|'approaching'|'triggered'|'paused'|'needs_review'
  reviewReason?:string|null
  evaluatedAt?:string|null
  updatedAt?:string
}
export type ChartAlertV2Event={
  id:string
  drawingId?:string|null
  ruleId?:string|null
  ticker:string
  eventType:ChartAlertMode
  interval?:ChartAlertInterval|null
  source?:ChartAlertSource|null
  scanGeneratedAt:string
  marketDate:string
  prevLinePrice?:number|null
  currentLinePrice?:number|null
  closePrice?:number|null
  message:string
  telegramStatus:'not_configured'|'pending'|'sent'|'error'
  telegramSentAt?:string|null
  telegramError?:string|null
  readAt?:string|null
  createdAt:string
}
export type ChartAlertEvaluatorHealth={
  state:'idle'|'waiting'|'stale'|'attention'|'healthy'
  activeRules:number
  evaluatedRules:number
  needsReview:number
  staleRules:number
  lastEvaluatedAt?:string|null
  staleAfterMinutes:number
}
export type ChartAlertsV2Snapshot={drawings:ChartDrawing[];rules:ChartAlertRule[];status:ChartAlertStatus[];events:ChartAlertV2Event[];evaluatorHealth:ChartAlertEvaluatorHealth}
export type TelegramConnection={
  configured:boolean
  botId?:string|null
  botUsername?:string|null
  connectedAt?:string|null
  updatedAt?:string|null
}
export type AlertSyncStatus={
  enabled:boolean
  linked:boolean
  primaryDevice:boolean
  deviceCount:number
  createdAt?:string|null
  updatedAt?:string|null
}

const ENDPOINT='https://jekidjsifihbbuzxrbse.supabase.co/functions/v1/stockscout-next-alerts'
const V2_ENDPOINT='https://jekidjsifihbbuzxrbse.supabase.co/functions/v1/stockscout-next-alerts-v2'
const SYNC_ENDPOINT='https://jekidjsifihbbuzxrbse.supabase.co/functions/v1/stockscout-next-alert-sync'
const DEVICE_KEY='stockscout-next-alert-device-key-v1'

export function isHorizontalAlert(alert:Pick<ChartAlert,'points'>){
  return alert.points.length===2&&Math.abs(alert.points[0].price-alert.points[1].price)<1e-9
}

export function linePriceAt(points:[ChartAlertPoint,ChartAlertPoint],atTime:string){
  const day=(iso:string)=>Date.parse(`${iso.slice(0,10)}T00:00:00Z`)/86400000
  const t1=day(points[0].time),t2=day(points[1].time),at=day(atTime)
  if(![t1,t2,at,points[0].price,points[1].price].every(Number.isFinite))return null
  if(t1===t2)return points[1].price
  return points[0].price+((points[1].price-points[0].price)/(t2-t1))*(at-t1)
}

function browserDeviceKey(){
  let existing=''
  try{existing=localStorage.getItem(DEVICE_KEY)||''}catch{}
  if(existing.length>=32)return existing
  const bytes=new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const created=Array.from(bytes).map(value=>value.toString(16).padStart(2,'0')).join('')
  try{localStorage.setItem(DEVICE_KEY,created)}catch{}
  return created
}

async function requestAt<T>(endpoint:string,body?:Record<string,unknown>,method='POST'):Promise<T>{
  const response=await fetch(endpoint,{
    method,
    cache:'no-store',
    headers:{'Content-Type':'application/json','x-stockscout-device-key':browserDeviceKey()},
    body:method==='GET'?undefined:JSON.stringify(body||{}),
  })
  const data=await response.json().catch(()=>({}))
  if(!response.ok)throw new Error(String(data?.error||`Alert service HTTP ${response.status}`))
  return data as T
}
const request=<T>(body?:Record<string,unknown>,method='POST')=>requestAt<T>(ENDPOINT,body,method)
const requestV2=<T>(body?:Record<string,unknown>)=>requestAt<T>(V2_ENDPOINT,body,'POST')
const requestSync=<T>(body?:Record<string,unknown>)=>requestAt<T>(SYNC_ENDPOINT,body,'POST')

const maybeNumber=(value:unknown)=>value==null?null:Number.isFinite(Number(value))?Number(value):null
function drawingFromRow(row:any):ChartDrawing{
  return{
    id:String(row?.id||''),ticker:String(row?.ticker||'').toUpperCase(),kind:row?.kind==='horizontal'?'horizontal':'trendline',
    interval:row?.interval==='W'?'W':'D',points:row?.points,extension:row?.extension==='pane'?'pane':'ray_right',
    label:row?.label??null,style:row?.style||{},metadata:row?.metadata||{},createdAt:row?.created_at,updatedAt:row?.updated_at,
  }
}
function ruleFromRow(row:any):ChartAlertRule{
  return{
    id:String(row?.id||''),drawingId:String(row?.drawing_id||row?.drawingId||''),
    condition:['cross_above','cross_below','touch'].includes(row?.condition)?row.condition:'touch',
    source:row?.source==='wick'?'wick':'close',lifecycle:row?.lifecycle==='one_shot'?'one_shot':'rearm',
    enabled:Boolean(row?.enabled),notifyInApp:row?.notify_in_app!==false,notifyTelegram:row?.notify_telegram!==false,
    createdAt:row?.created_at,updatedAt:row?.updated_at,
  }
}
function statusFromRow(row:any):ChartAlertStatus{
  const state=['active','approaching','triggered','paused','needs_review'].includes(row?.state)?row.state:'paused'
  return{
    drawingId:String(row?.drawing_id||''),ruleId:row?.rule_id?String(row.rule_id):null,
    projectedLinePrice:maybeNumber(row?.projected_line_price),latestClose:maybeNumber(row?.latest_close),latestHigh:maybeNumber(row?.latest_high),latestLow:maybeNumber(row?.latest_low),distancePct:maybeNumber(row?.distance_pct),
    latestMarketDate:row?.latest_market_date??null,state,reviewReason:row?.review_reason??null,evaluatedAt:row?.evaluated_at??null,updatedAt:row?.updated_at,
  }
}
function eventFromRow(row:any):ChartAlertV2Event{
  return{
    id:String(row?.id||''),drawingId:row?.drawing_id?String(row.drawing_id):null,ruleId:row?.rule_id?String(row.rule_id):null,ticker:String(row?.ticker||'').toUpperCase(),
    eventType:['break_up','break_down','touch'].includes(row?.event_type)?row.event_type:'touch',interval:row?.interval==='W'?'W':row?.interval==='D'?'D':null,source:row?.source==='wick'?'wick':row?.source==='close'?'close':null,
    scanGeneratedAt:String(row?.scan_generated_at||''),marketDate:String(row?.market_date||''),prevLinePrice:maybeNumber(row?.prev_line_price),currentLinePrice:maybeNumber(row?.current_line_price??row?.line_price),closePrice:maybeNumber(row?.close_price),
    message:String(row?.message||''),telegramStatus:['pending','sent','error'].includes(row?.telegram_status)?row.telegram_status:'not_configured',telegramSentAt:row?.telegram_sent_at??null,telegramError:row?.telegram_error??null,readAt:row?.read_at??null,createdAt:String(row?.created_at||''),
  }
}
function evaluatorHealthFromRaw(raw:any):ChartAlertEvaluatorHealth{
  const state=['idle','waiting','stale','attention','healthy'].includes(raw?.state)?raw.state:'waiting'
  return{
    state,
    activeRules:Number.isFinite(Number(raw?.activeRules))?Math.max(0,Number(raw.activeRules)):0,
    evaluatedRules:Number.isFinite(Number(raw?.evaluatedRules))?Math.max(0,Number(raw.evaluatedRules)):0,
    needsReview:Number.isFinite(Number(raw?.needsReview))?Math.max(0,Number(raw.needsReview)):0,
    staleRules:Number.isFinite(Number(raw?.staleRules))?Math.max(0,Number(raw.staleRules)):0,
    lastEvaluatedAt:raw?.lastEvaluatedAt==null?null:String(raw.lastEvaluatedAt),
    staleAfterMinutes:Number.isFinite(Number(raw?.staleAfterMinutes))?Math.max(1,Number(raw.staleAfterMinutes)):150,
  }
}
function telegramFromRaw(raw:any):TelegramConnection{
  return{
    configured:raw?.configured===true,
    botId:raw?.botId==null?null:String(raw.botId),
    botUsername:raw?.botUsername==null?null:String(raw.botUsername),
    connectedAt:raw?.connectedAt==null?null:String(raw.connectedAt),
    updatedAt:raw?.updatedAt==null?null:String(raw.updatedAt),
  }
}
function syncFromRaw(raw:any):AlertSyncStatus{
  return{
    enabled:raw?.enabled===true,
    linked:raw?.linked===true,
    primaryDevice:raw?.primaryDevice===true,
    deviceCount:Number.isFinite(Number(raw?.deviceCount))?Math.max(0,Number(raw.deviceCount)):0,
    createdAt:raw?.createdAt==null?null:String(raw.createdAt),
    updatedAt:raw?.updatedAt==null?null:String(raw.updatedAt),
  }
}
function generateRecoveryKey(){
  const bytes=new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const hex=Array.from(bytes).map(value=>value.toString(16).padStart(2,'0')).join('').toUpperCase()
  return `SSN2-${hex.match(/.{4}/g)!.join('-')}`
}

export function normalizeChartAlertsV2Snapshot(raw:any):ChartAlertsV2Snapshot{
  return{
    drawings:(Array.isArray(raw?.drawings)?raw.drawings:[]).map(drawingFromRow),
    rules:(Array.isArray(raw?.rules)?raw.rules:[]).map(ruleFromRow),
    status:(Array.isArray(raw?.status)?raw.status:[]).map(statusFromRow),
    events:(Array.isArray(raw?.events)?raw.events:[]).map(eventFromRow),
    evaluatorHealth:evaluatorHealthFromRaw(raw?.evaluatorHealth),
  }
}

export async function loadChartAlerts():Promise<ChartAlertsSnapshot>{
  return request<ChartAlertsSnapshot>(undefined,'GET')
}

export async function saveChartAlert(alert:ChartAlert):Promise<ChartAlert>{
  const data=await request<{alert:ChartAlert}>({action:'upsert',alert})
  return data.alert
}

export async function deleteChartAlert(id:string):Promise<void>{
  await request<{ok:boolean}>({action:'delete',id})
}

export async function loadChartAlertsV2():Promise<ChartAlertsV2Snapshot>{
  const data=await requestV2<any>({action:'snapshot'})
  return normalizeChartAlertsV2Snapshot(data)
}

export async function saveChartDrawing(drawing:ChartDrawing):Promise<ChartDrawing>{
  const data=await requestV2<{drawing:any}>({action:'drawing_upsert',drawing})
  return drawingFromRow(data.drawing)
}

export async function deleteChartDrawing(id:string):Promise<void>{
  await requestV2<{ok:boolean}>({action:'drawing_delete',id})
}

export async function saveChartAlertRule(rule:ChartAlertRule):Promise<ChartAlertRule>{
  const data=await requestV2<{rule:any}>({action:'rule_upsert',rule})
  return ruleFromRow(data.rule)
}

export async function deleteChartAlertRule(id:string):Promise<void>{
  await requestV2<{ok:boolean}>({action:'rule_delete',id})
}

export async function setChartAlertEventRead(id:string,read=true):Promise<void>{
  await requestV2<{ok:boolean}>({action:'event_read',id,read})
}

export async function loadTelegramConnection():Promise<TelegramConnection>{
  const data=await requestV2<{telegram:any}>({action:'telegram_status'})
  return telegramFromRaw(data.telegram)
}

export async function saveTelegramConnection(token:string,chatId:string):Promise<TelegramConnection>{
  const data=await requestV2<{telegram:any}>({action:'telegram_save',token,chatId})
  return telegramFromRaw(data.telegram)
}

export async function sendTelegramTestMessage():Promise<void>{
  await requestV2<{ok:boolean}>({action:'telegram_test'})
}

export async function disconnectTelegram():Promise<void>{
  await requestV2<{ok:boolean}>({action:'telegram_disconnect'})
}

export async function loadAlertSyncStatus():Promise<AlertSyncStatus>{
  const data=await requestSync<{sync:any}>({action:'status'})
  return syncFromRaw(data.sync)
}

export async function createAlertSync():Promise<{status:AlertSyncStatus;recoveryKey:string}>{
  const recoveryKey=generateRecoveryKey()
  const data=await requestSync<{sync:any}>({action:'create',recoveryKey})
  return{status:syncFromRaw(data.sync),recoveryKey}
}

export async function rotateAlertSyncRecoveryKey():Promise<{status:AlertSyncStatus;recoveryKey:string}>{
  const recoveryKey=generateRecoveryKey()
  const data=await requestSync<{sync:any}>({action:'rotate',recoveryKey})
  return{status:syncFromRaw(data.sync),recoveryKey}
}

export async function joinAlertSync(recoveryKey:string):Promise<AlertSyncStatus>{
  const data=await requestSync<{sync:any}>({action:'join',recoveryKey:recoveryKey.trim().toUpperCase()})
  return syncFromRaw(data.sync)
}

export async function unlinkAlertSync():Promise<AlertSyncStatus>{
  const data=await requestSync<{sync:any}>({action:'unlink'})
  return syncFromRaw(data.sync)
}
