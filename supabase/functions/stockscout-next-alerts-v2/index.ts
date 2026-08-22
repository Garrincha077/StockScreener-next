import {createClient} from 'npm:@supabase/supabase-js@2'

const corsHeaders={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'content-type,x-stockscout-device-key',
  'Access-Control-Allow-Methods':'POST,OPTIONS',
}
const SUPABASE_URL=Deno.env.get('SUPABASE_URL')??''
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??''
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false}})
const api=db.schema('stockscout_api')
const TELEGRAM_TEST_MESSAGE='StockScout Next Telegram alerts connected successfully.'

function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json','Cache-Control':'no-store'}})}
async function sha256(value:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(digest)).map(byte=>byte.toString(16).padStart(2,'0')).join('')}
function errorStatus(error:any){return error?.code==='P0002'?404:error?.code==='22023'?400:500}
function validTelegramToken(value:string){return /^\d{5,20}:[A-Za-z0-9_-]{20,120}$/.test(value)}
function validTelegramChatId(value:string){return /^-?\d{1,20}$/.test(value)||/^@[A-Za-z0-9_]{5,64}$/.test(value)}

async function verifyTelegramBot(token:string){
  try{
    const response=await fetch(`https://api.telegram.org/bot${token}/getMe`,{method:'GET',cache:'no-store'})
    const data=await response.json().catch(()=>null)
    if(!response.ok||!data?.ok||!data?.result?.is_bot)return{ok:false as const,httpStatus:response.status}
    return{ok:true as const,botId:String(data.result.id??''),botUsername:typeof data.result.username==='string'?data.result.username:''}
  }catch{return{ok:false as const,httpStatus:0}}
}

async function sendTelegramTest(token:string,chatId:string){
  try{
    const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chat_id:chatId,text:TELEGRAM_TEST_MESSAGE,disable_web_page_preview:true}),
    })
    return{ok:response.ok,httpStatus:response.status}
  }catch{return{ok:false,httpStatus:0}}
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders})
  if(req.method!=='POST')return json({error:'Method not allowed'},405)
  try{
    const deviceKey=req.headers.get('x-stockscout-device-key')??''
    if(deviceKey.length<32||deviceKey.length>256)return json({error:'Missing device key'},401)
    const ownerKey=await sha256(deviceKey)
    const body=await req.json().catch(()=>({}))
    const action=String(body?.action??'')

    if(action==='snapshot'){
      const{data,error}=await api.rpc('next_chart_alert_v2_snapshot',{p_owner_key:ownerKey})
      if(error)return json({error:error.message},errorStatus(error))
      return json(data&&typeof data==='object'?data:{drawings:[],rules:[],status:[],events:[]})
    }
    if(action==='drawing_upsert'){
      if(!body?.drawing||typeof body.drawing!=='object')return json({error:'Missing drawing'},400)
      const{data,error}=await api.rpc('next_chart_drawing_upsert',{p_owner_key:ownerKey,p_drawing:body.drawing})
      if(error)return json({error:error.message},errorStatus(error))
      return json({drawing:data},body.drawing.id?200:201)
    }
    if(action==='drawing_delete'){
      const id=String(body?.id??'')
      if(!id)return json({error:'Missing drawing id'},400)
      const{data,error}=await api.rpc('next_chart_drawing_delete',{p_owner_key:ownerKey,p_id:id})
      if(error)return json({error:error.message},errorStatus(error))
      return json({ok:data===true})
    }
    if(action==='rule_upsert'){
      if(!body?.rule||typeof body.rule!=='object')return json({error:'Missing rule'},400)
      const{data,error}=await api.rpc('next_chart_alert_rule_upsert',{p_owner_key:ownerKey,p_rule:body.rule})
      if(error)return json({error:error.message},errorStatus(error))
      return json({rule:data},body.rule.id?200:201)
    }
    if(action==='rule_delete'){
      const id=String(body?.id??'')
      if(!id)return json({error:'Missing rule id'},400)
      const{data,error}=await api.rpc('next_chart_alert_rule_delete',{p_owner_key:ownerKey,p_id:id})
      if(error)return json({error:error.message},errorStatus(error))
      return json({ok:data===true})
    }
    if(action==='event_read'){
      const id=String(body?.id??'')
      if(!id)return json({error:'Missing event id'},400)
      const{data,error}=await api.rpc('next_chart_alert_event_set_read',{p_owner_key:ownerKey,p_id:id,p_read:body?.read!==false})
      if(error)return json({error:error.message},errorStatus(error))
      return json({ok:data===true})
    }
    if(action==='telegram_status'){
      const{data,error}=await api.rpc('next_chart_alert_telegram_status',{p_owner_key:ownerKey})
      if(error)return json({error:'Unable to read Telegram status'},errorStatus(error))
      return json({telegram:data&&typeof data==='object'?data:{configured:false}})
    }
    if(action==='telegram_save'){
      const token=String(body?.token??'').trim()
      const chatId=String(body?.chatId??'').trim()
      if(!validTelegramToken(token))return json({error:'Invalid Telegram bot token format'},400)
      if(!validTelegramChatId(chatId))return json({error:'Invalid Telegram chat ID format'},400)
      const verified=await verifyTelegramBot(token)
      if(!verified.ok)return json({error:verified.httpStatus===0?'Telegram verification unavailable':'Telegram bot token was rejected'},verified.httpStatus===0?502:400)
      const{data,error}=await api.rpc('next_chart_alert_telegram_store',{
        p_owner_key:ownerKey,p_token:token,p_chat_id:chatId,p_bot_id:verified.botId,p_bot_username:verified.botUsername,
      })
      if(error)return json({error:'Unable to save Telegram credentials'},errorStatus(error))
      return json({telegram:data&&typeof data==='object'?data:{configured:true}})
    }
    if(action==='telegram_test'){
      const{data,error}=await api.rpc('next_chart_alert_telegram_credentials',{p_owner_key:ownerKey})
      if(error||!data||typeof data!=='object')return json({error:'Unable to read Telegram connection'},500)
      const credentials=data as{configured?:boolean;token?:unknown;chatId?:unknown}
      if(credentials.configured!==true||typeof credentials.token!=='string'||typeof credentials.chatId!=='string')return json({error:'Telegram is not configured'},409)
      const sent=await sendTelegramTest(credentials.token,credentials.chatId)
      if(!sent.ok)return json({error:sent.httpStatus===0?'Telegram test unavailable':`Telegram test message failed (HTTP ${sent.httpStatus})`},sent.httpStatus===0?502:400)
      return json({ok:true})
    }
    if(action==='telegram_disconnect'){
      const{error}=await api.rpc('next_chart_alert_telegram_disconnect',{p_owner_key:ownerKey})
      if(error)return json({error:'Unable to disconnect Telegram'},errorStatus(error))
      return json({ok:true,telegram:{configured:false}})
    }
    return json({error:'Unknown action'},400)
  }catch{return json({error:'Alert service request failed'},500)}
})
