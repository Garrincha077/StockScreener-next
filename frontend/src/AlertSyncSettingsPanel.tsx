import {useEffect,useState} from 'react'
import {
  createAlertSync,
  joinAlertSync,
  loadAlertSyncStatus,
  rotateAlertSyncRecoveryKey,
  unlinkAlertSync,
  type AlertSyncStatus,
} from './deepvue/chartAlerts'

const EMPTY:AlertSyncStatus={enabled:false,linked:false,primaryDevice:false,deviceCount:0}

export default function AlertSyncSettingsPanel({onIdentityChanged}:{onIdentityChanged?:()=>void}){
  const[status,setStatus]=useState<AlertSyncStatus>(EMPTY)
  const[loading,setLoading]=useState(true)
  const[busy,setBusy]=useState(false)
  const[joinKey,setJoinKey]=useState('')
  const[oneTimeKey,setOneTimeKey]=useState('')
  const[notice,setNotice]=useState('')
  const[failed,setFailed]=useState(false)

  useEffect(()=>{
    let active=true
    setLoading(true)
    loadAlertSyncStatus().then(value=>{
      if(!active)return
      setStatus(value)
      setFailed(false)
      setNotice('')
    }).catch(()=>{
      if(!active)return
      setStatus(EMPTY)
      setFailed(true)
      setNotice('Unable to read cross-device sync status.')
    }).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[])

  const enable=async()=>{
    setBusy(true);setNotice('');setFailed(false)
    try{
      const result=await createAlertSync()
      setStatus(result.status)
      setOneTimeKey(result.recoveryKey)
      setNotice('Cross-device sync enabled. Save the recovery key before leaving this screen.')
      onIdentityChanged?.()
    }catch(error){
      setFailed(true)
      setNotice(error instanceof Error?error.message:'Unable to enable cross-device sync.')
    }finally{setBusy(false)}
  }

  const rotate=async()=>{
    setBusy(true);setNotice('');setFailed(false)
    try{
      const result=await rotateAlertSyncRecoveryKey()
      setStatus(result.status)
      setOneTimeKey(result.recoveryKey)
      setNotice('New recovery key created. Old recovery keys can no longer add devices; already-linked devices stay connected.')
    }catch(error){
      setFailed(true)
      setNotice(error instanceof Error?error.message:'Unable to rotate recovery key.')
    }finally{setBusy(false)}
  }

  const join=async()=>{
    if(!joinKey.trim())return
    setBusy(true);setNotice('');setFailed(false)
    try{
      const next=await joinAlertSync(joinKey)
      setStatus(next)
      setJoinKey('')
      setNotice('This device is linked. Existing local drawings were merged into the shared alert set.')
      onIdentityChanged?.()
    }catch(error){
      setFailed(true)
      setNotice(error instanceof Error?error.message:'Unable to link this device.')
    }finally{setBusy(false)}
  }

  const unlink=async()=>{
    setBusy(true);setNotice('');setFailed(false)
    try{
      const next=await unlinkAlertSync()
      setStatus(next)
      setOneTimeKey('')
      setNotice('This device was unlinked from the shared alert profile.')
      onIdentityChanged?.()
    }catch(error){
      setFailed(true)
      setNotice(error instanceof Error?error.message:'Unable to unlink this device.')
    }finally{setBusy(false)}
  }

  const copyKey=async()=>{
    if(!oneTimeKey)return
    try{
      await navigator.clipboard.writeText(oneTimeKey)
      setFailed(false)
      setNotice('Recovery key copied. Store it somewhere private.')
    }catch{
      setFailed(true)
      setNotice('Copy failed. Select the recovery key and copy it manually.')
    }
  }

  const statusLabel=loading?'Checking…':status.enabled?`On · ${status.deviceCount} device${status.deviceCount===1?'':'s'}`:'Off'

  return <section className="cad-sync-settings" aria-label="Cross-device alert sync settings">
    <div className="cad-sync-settings-head">
      <div><b>Cross-device Alerts Sync</b><span>Recovery-key identity · shared drawings, alerts, events and Telegram status</span></div>
      <span className={`cad-sync-connection ${status.enabled?'connected':''}`}>{statusLabel}</span>
    </div>

    <div className="cad-sync-security-note">
      The recovery key is an access capability for your alert profile. StockScout stores only its SHA-256 hash. The key is never saved in localStorage/sessionStorage and is shown only when created or rotated.
    </div>

    {!status.enabled&&<>
      <div className="cad-sync-actions">
        <button type="button" className="primary" disabled={busy||loading} onClick={()=>void enable()}>Enable sync on this device</button>
      </div>
      <div className="cad-sync-join">
        <label>Recovery Key
          <input value={joinKey} onChange={event=>setJoinKey(event.target.value.toUpperCase())} autoComplete="off" spellCheck={false} placeholder="SSN2-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" aria-label="Alerts recovery key"/>
        </label>
        <button type="button" className="primary" disabled={busy||loading||!joinKey.trim()} onClick={()=>void join()}>Link this device</button>
      </div>
      <small className="cad-sync-footnote">If this browser already has drawings or alert rules, linking merges them into the shared profile. If both profiles separately have Telegram configured, the merge is blocked so no credentials are overwritten.</small>
    </>}

    {status.enabled&&<>
      <div className="cad-sync-summary">
        <b>{status.primaryDevice?'Primary sync device':'Linked device'}</b>
        <span>{status.deviceCount} linked device{status.deviceCount===1?'':'s'} share the same alert sidecar.</span>
      </div>

      {oneTimeKey&&<div className="cad-sync-keybox" role="status">
        <span>Save this recovery key now</span>
        <code>{oneTimeKey}</code>
        <div><button type="button" onClick={()=>void copyKey()}>Copy key</button><button type="button" onClick={()=>setOneTimeKey('')}>I saved it</button></div>
      </div>}

      {status.primaryDevice?<div className="cad-sync-actions">
        <button type="button" disabled={busy||loading} onClick={()=>void rotate()}>Generate new recovery key</button>
      </div>:<div className="cad-sync-actions">
        <button type="button" className="danger" disabled={busy||loading} onClick={()=>void unlink()}>Unlink this device</button>
      </div>}

      <small className="cad-sync-footnote">Rotating a recovery key blocks future joins with the old key but does not disconnect devices already linked. Telegram credentials remain server-side in Vault and are never exposed during sync.</small>
    </>}

    {notice&&<div className={`cad-sync-feedback ${failed?'error':'success'}`} role="status">{notice}</div>}
  </section>
}
