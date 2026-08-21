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

const ENDPOINT='https://jekidjsifihbbuzxrbse.supabase.co/functions/v1/stockscout-next-alerts'
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

async function request<T>(body?:Record<string,unknown>,method='POST'):Promise<T>{
  const response=await fetch(ENDPOINT,{
    method,
    cache:'no-store',
    headers:{'Content-Type':'application/json','x-stockscout-device-key':browserDeviceKey()},
    body:method==='GET'?undefined:JSON.stringify(body||{}),
  })
  const data=await response.json().catch(()=>({}))
  if(!response.ok)throw new Error(String(data?.error||`Alert service HTTP ${response.status}`))
  return data as T
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
