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

function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json','Cache-Control':'no-store'}})}
async function sha256(value:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(digest)).map(byte=>byte.toString(16).padStart(2,'0')).join('')}
function errorStatus(error:any){return error?.code==='P0002'?404:error?.code==='22023'?400:500}

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
    return json({error:'Unknown action'},400)
  }catch(error){return json({error:String(error)},500)}
})
