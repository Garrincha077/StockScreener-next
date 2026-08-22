import {useEffect,useState} from 'react'
import {
  disconnectTelegram,
  loadTelegramConnection,
  saveTelegramConnection,
  sendTelegramTestMessage,
  type TelegramConnection,
} from './deepvue/chartAlerts'

const EMPTY:TelegramConnection={configured:false}

export default function TelegramSettingsPanel(){
  const[connection,setConnection]=useState<TelegramConnection>(EMPTY)
  const[loading,setLoading]=useState(true)
  const[editing,setEditing]=useState(false)
  const[busy,setBusy]=useState(false)
  const[token,setToken]=useState('')
  const[chatId,setChatId]=useState('')
  const[notice,setNotice]=useState('')
  const[failed,setFailed]=useState(false)

  useEffect(()=>{
    let active=true
    setLoading(true)
    loadTelegramConnection().then(value=>{
      if(!active)return
      setConnection(value)
      setEditing(!value.configured)
      setFailed(false)
      setNotice('')
    }).catch(()=>{
      if(!active)return
      setConnection(EMPTY)
      setEditing(true)
      setFailed(true)
      setNotice('Unable to read Telegram status.')
    }).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[])

  const save=async()=>{
    if(!token.trim()||!chatId.trim())return
    setBusy(true);setNotice('');setFailed(false)
    try{
      const next=await saveTelegramConnection(token.trim(),chatId.trim())
      setConnection(next)
      setToken('')
      setChatId('')
      setEditing(false)
      setNotice(next.botUsername?`Connected as @${next.botUsername}.`:'Telegram connected securely.')
    }catch(error){
      setFailed(true)
      setNotice(error instanceof Error?error.message:'Telegram connection failed.')
    }finally{setBusy(false)}
  }

  const test=async()=>{
    setBusy(true);setNotice('');setFailed(false)
    try{
      await sendTelegramTestMessage()
      setNotice('Test message sent. Check Telegram.')
    }catch(error){
      setFailed(true)
      setNotice(error instanceof Error?error.message:'Telegram test failed.')
    }finally{setBusy(false)}
  }

  const disconnect=async()=>{
    setBusy(true);setNotice('');setFailed(false)
    try{
      await disconnectTelegram()
      setConnection(EMPTY)
      setEditing(true)
      setToken('')
      setChatId('')
      setNotice('Telegram disconnected. Stored Vault references were removed.')
    }catch(error){
      setFailed(true)
      setNotice(error instanceof Error?error.message:'Unable to disconnect Telegram.')
    }finally{setBusy(false)}
  }

  const status=loading?'Checking…':connection.configured?(connection.botUsername?`Connected as @${connection.botUsername}`:'Connected'):'Not configured'

  return <section className="cad-telegram-settings" aria-label="Telegram notification settings">
    <div className="cad-telegram-settings-head">
      <div><b>Telegram Notifications</b><span>Owner-scoped · encrypted in Supabase Vault</span></div>
      <span className={`cad-telegram-connection ${connection.configured?'connected':''}`}>{status}</span>
    </div>

    <div className="cad-telegram-security-note">
      Credentials are sent once over HTTPS to the alert service. The browser can never read the saved bot token or chat ID back.
    </div>

    {editing&&<div className="cad-telegram-form">
      <label>Bot Token
        <input type="password" value={token} onChange={event=>setToken(event.target.value)} autoComplete="off" spellCheck={false} placeholder="123456789:AA…" aria-label="Telegram bot token"/>
      </label>
      <label>Chat ID
        <input value={chatId} onChange={event=>setChatId(event.target.value)} autoComplete="off" spellCheck={false} placeholder="123456789 or @channel" aria-label="Telegram chat ID"/>
      </label>
      <button type="button" className="primary" disabled={busy||loading||!token.trim()||!chatId.trim()} onClick={()=>void save()}>Save securely</button>
      {connection.configured&&<button type="button" disabled={busy} onClick={()=>{setEditing(false);setToken('');setChatId('')}}>Cancel</button>}
    </div>}

    {connection.configured&&!editing&&<div className="cad-telegram-actions">
      <button type="button" className="primary" disabled={busy} onClick={()=>void test()}>Send test message</button>
      <button type="button" disabled={busy} onClick={()=>{setEditing(true);setNotice('');setFailed(false)}}>Replace credentials</button>
      <button type="button" className="danger" disabled={busy} onClick={()=>void disconnect()}>Disconnect Telegram</button>
    </div>}

    {notice&&<div className={`cad-telegram-feedback ${failed?'error':'success'}`} role="status">{notice}</div>}
    <small className="cad-telegram-footnote">A successful test sends only “StockScout Next Telegram alerts connected successfully.” It does not create a stock alert event.</small>
  </section>
}
