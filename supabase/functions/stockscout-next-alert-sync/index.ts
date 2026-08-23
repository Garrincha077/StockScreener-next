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
const RECOVERY_KEY=/^SSN2(?:-[A-F0-9]{4}){8}$/

function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json','Cache-Control':'no-store'}})}
async function sha256(value:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(digest)).map(byte=>byte.toString(16).padStart(2,'0')).join('')}
function errorStatus(error:any){return error?.code==='P0002'?404:error?.code==='P0001'?409:error?.code==='22023'?400:500}
function normalizeRecoveryKey(raw:unknown){return String(raw??'').trim().toUpperCase()}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders})
  if(req.method!=='POST')return json({error:'Method not allowed'},405)
  try{
    const deviceKey=req.headers.get('x-stockscout-device-key')??''
    if(deviceKey.length<32||deviceKey.length>256)return json({error:'Missing device key'},401)
    const deviceOwnerKey=await sha256(deviceKey)
    const body=await req.json().catch(()=>({}))
    const action=String(body?.action??'')

    if(action==='status'){
      const{data,error}=await api.rpc('next_chart_alert_sync_status',{p_device_owner_key:deviceOwnerKey})
      if(error)return json({error:'Unable to read sync status'},errorStatus(error))
      return json({sync:data&&typeof data==='object'?data:{enabled:false,linked:false,primaryDevice:false,deviceCount:0}})
    }

    if(action==='create'||action==='join'||action==='rotate'){
      const key=normalizeRecoveryKey(body?.recoveryKey)
      if(!RECOVERY_KEY.test(key))return json({error:'Recovery key format is invalid'},400)
      const syncHash=await sha256(key)
      const rpc=action==='create'?'next_chart_alert_sync_create':action==='join'?'next_chart_alert_sync_join':'next_chart_alert_sync_rotate'
      const{data,error}=await api.rpc(rpc,{p_device_owner_key:deviceOwnerKey,p_sync_hash:syncHash})
      if(error)return json({error:String(error.message||'Unable to update cross-device sync')},errorStatus(error))
      return json({sync:data&&typeof data==='object'?data:{enabled:true,linked:true}})
    }

    if(action==='unlink'){
      const{data,error}=await api.rpc('next_chart_alert_sync_unlink',{p_device_owner_key:deviceOwnerKey})
      if(error)return json({error:String(error.message||'Unable to unlink this device')},errorStatus(error))
      return json({sync:data&&typeof data==='object'?data:{enabled:false,linked:false,primaryDevice:false,deviceCount:0}})
    }

    return json({error:'Unknown action'},400)
  }catch{return json({error:'Sync service request failed'},500)}
})
