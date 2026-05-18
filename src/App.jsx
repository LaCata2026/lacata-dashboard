import { useState, useEffect, useRef } from 'react'
import { sb, LS } from './lib/supabase'
import { Realtime, PushNotif } from './lib/realtime'
import Toast, { showToast } from './components/Toast'
import ConfirmDialog from './components/ConfirmDialog'
import Dashboard from './components/Dashboard'
import Login from './components/Login'
import SetPassword from './components/SetPassword'

function useSessionRefresh(session,onLogout,onTokenUpdate){
  const refreshTokenRef=useRef(LS.get("lc_refresh_token",null))
  const refreshingRef=useRef(false)
  const warnedRef=useRef(false)
  useEffect(()=>{
    if(!session)return
    function getExpiry(token){try{const p=JSON.parse(atob(token.split(".")[1]));return p.exp?p.exp*1000:null}catch{return null}}
    async function doRefresh(){
      if(refreshingRef.current)return;const rt=refreshTokenRef.current;if(!rt)return
      refreshingRef.current=true
      try{const d=await sb.refreshSession(rt);if(d.access_token){refreshTokenRef.current=d.refresh_token||rt;LS.set("lc_refresh_token",d.refresh_token||rt);onTokenUpdate&&onTokenUpdate(d.access_token);warnedRef.current=false}}
      catch{showToast("No se pudo renovar la sesion.","error")}
      finally{refreshingRef.current=false}
    }
    const id=setInterval(()=>{
      const expiry=getExpiry(session.token);if(!expiry)return
      const rem=expiry-Date.now()
      if(rem<120000&&rem>0&&!warnedRef.current){warnedRef.current=true;showToast("Renovando sesion...","info")}
      if(rem<300000&&rem>60000)doRefresh()
      if(rem<=0){LS.del("lc_session");LS.del("lc_refresh_token");onLogout();showToast("Sesion expirada.","error")}
    },30000)
    const expiry=getExpiry(session.token)
    if(expiry&&(expiry-Date.now())<600000)doRefresh()
    return()=>clearInterval(id)
  },[session?.token])
}

export default function App(){
  const[session,setSession]=useState(()=>LS.get("lc_session",null))
  const[isDark,setIsDark]=useState(()=>{const s=localStorage.getItem("lc_theme");return s?s==="dark":true})
  useEffect(()=>{document.body.classList.toggle("light",!isDark);localStorage.setItem("lc_theme",isDark?"dark":"light")},[isDark])
  function handleTokenUpdate(t){const u={...session,token:t};LS.set("lc_session",u);setSession(u)}
  function handleLogout(){Realtime.disconnect();LS.del("lc_session");LS.del("lc_refresh_token");setSession(null)}
  useSessionRefresh(session,handleLogout,handleTokenUpdate)
  useEffect(()=>{
    if(session?.token){Realtime.connect(session.token);PushNotif.requestPermission()}
    else Realtime.disconnect()
    return()=>{if(!session)Realtime.disconnect()}
  },[session?.token])
  const hash=window.location.hash
  const params=new URLSearchParams(hash.replace("#",""))
  const isInvite=(params.get("type")==="invite"||params.get("type")==="recovery")&&params.get("access_token")
  if(isInvite)return<><Toast/><ConfirmDialog/><SetPassword/></>
  return<><Toast/><ConfirmDialog/>{session?<Dashboard session={session} isDark={isDark} toggleTheme={()=>setIsDark(d=>!d)} onLogout={handleLogout}/>:<Login onLogin={s=>setSession(s)}/>}</>
}
