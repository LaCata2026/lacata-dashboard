import{useState,useEffect,useRef,useCallback}from'react'
import{sb,LS,SB_URL,SB_ANON}from'./lib/supabase'
import{Realtime,PushNotif}from'./lib/realtime'
import Toast,{showToast}from'./components/Toast'
import ConfirmDialog from'./components/ConfirmDialog'
import Dashboard from'./components/Dashboard'
import Login from'./components/Login'
import SetPassword from'./components/SetPassword'

function useVersionChecker(){
  const[newVersion,setNewVersion]=useState(false)
  const currentHash=useRef(null)
  useEffect(()=>{
    async function checkVersion(){
      try{
        const r=await fetch("/?_="+Date.now(),{cache:"no-store"})
        const html=await r.text()
        const match=html.match(/src="\/assets\/index-([^"]+)\.js"/)
        const hash=match?match[1]:null
        if(!hash)return
        if(currentHash.current===null){currentHash.current=hash;return}
        if(hash!==currentHash.current){setNewVersion(true)}
      }catch{}
    }
    checkVersion()
    const id=setInterval(checkVersion,5*60*1000)
    function onVisible(){if(document.visibilityState==="visible")checkVersion()}
    document.addEventListener("visibilitychange",onVisible)
    return()=>{clearInterval(id);document.removeEventListener("visibilitychange",onVisible)}
  },[])
  return newVersion
}

function UpdateBanner(){
  return(
    <div style={{position:"fixed",top:0,left:0,right:0,zIndex:9999,background:"var(--accent)",color:"#0d0d0d",display:"flex",alignItems:"center",justifyContent:"center",gap:12,padding:"10px 16px",fontSize:13,fontWeight:600,fontFamily:"var(--font-body)",boxShadow:"0 2px 12px rgba(0,0,0,.3)"}}>
      <span>🔄 Hay una nueva versión disponible</span>
      <button onClick={()=>window.location.reload(true)} style={{background:"#0d0d0d",color:"var(--accent)",border:"none",borderRadius:6,padding:"4px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Actualizar ahora</button>
      <span style={{fontSize:11,opacity:.7}}>Recarga para no perder funcionalidad</span>
    </div>
  )
}

function SessionExpiredModal({onContinue,onLogout}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:9998,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:14,padding:"28px 32px",maxWidth:360,textAlign:"center",boxShadow:"0 20px 60px rgba(0,0,0,.5)"}}>
        <div style={{fontSize:36,marginBottom:12}}>⏰</div>
        <h3 style={{fontSize:17,fontWeight:700,marginBottom:8}}>Sesión expirada</h3>
        <p style={{fontSize:13,color:"var(--muted)",marginBottom:20,lineHeight:1.5}}>Tu sesión expiró por inactividad. ¿Quieres continuar trabajando?</p>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <button onClick={onLogout} style={{padding:"8px 18px",borderRadius:8,border:"1px solid var(--border)",background:"transparent",color:"var(--muted)",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>Cerrar sesión</button>
          <button onClick={onContinue} style={{padding:"8px 20px",borderRadius:8,border:"none",background:"var(--accent)",color:"#0d0d0d",cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"inherit"}}>Continuar →</button>
        </div>
      </div>
    </div>
  )
}

function useSessionRefresh(session,onLogout,onTokenUpdate){
  const refreshTokenRef=useRef(LS.get("lc_refresh_token",null))
  const refreshingRef=useRef(false)
  const[expired,setExpired]=useState(false)

  function getExpiry(token){
    try{const p=JSON.parse(atob(token.split(".")[1]));return p.exp?p.exp*1000:null}catch{return null}
  }

  const doRefresh=useCallback(async(force=false)=>{
    if(refreshingRef.current&&!force)return
    const rt=refreshTokenRef.current
    if(!rt)return
    refreshingRef.current=true
    try{
      const d=await sb.refreshSession(rt)
      if(d.access_token){
        refreshTokenRef.current=d.refresh_token||rt
        LS.set("lc_refresh_token",d.refresh_token||rt)
        onTokenUpdate&&onTokenUpdate(d.access_token)
        setExpired(false)
      }
    }catch(e){console.warn("Session refresh failed:",e)}
    finally{refreshingRef.current=false}
  },[onTokenUpdate])

  useEffect(()=>{
    if(!session)return
    const expiry=getExpiry(session.token)
    if(expiry&&(expiry-Date.now())<20*60*1000)doRefresh()
    const id=setInterval(()=>{
      const exp=getExpiry(session.token)
      if(!exp)return
      const rem=exp-Date.now()
      if(rem<10*60*1000&&rem>0)doRefresh()
      if(rem<=0)setExpired(true)
    },3*60*1000)
    function onVisible(){
      if(document.visibilityState!=="visible")return
      const exp=getExpiry(session.token)
      if(!exp)return
      if((exp-Date.now())<15*60*1000)doRefresh()
    }
    document.addEventListener("visibilitychange",onVisible)
    let activityTimer=null
    function onActivity(){
      clearTimeout(activityTimer)
      activityTimer=setTimeout(()=>{
        const exp=getExpiry(session.token)
        if(exp&&(exp-Date.now())<20*60*1000)doRefresh()
      },2000)
    }
    window.addEventListener("click",onActivity,{passive:true})
    window.addEventListener("keydown",onActivity,{passive:true})
    return()=>{
      clearInterval(id)
      document.removeEventListener("visibilitychange",onVisible)
      window.removeEventListener("click",onActivity)
      window.removeEventListener("keydown",onActivity)
      clearTimeout(activityTimer)
    }
  },[session?.token,doRefresh])

  useEffect(()=>{
    const rt=LS.get("lc_refresh_token",null)
    if(rt)refreshTokenRef.current=rt
  },[session?.token])

  return{expired,doRefresh}
}

export default function App(){
  const[session,setSession]=useState(()=>LS.get("lc_session",null))
  const[isDark,setIsDark]=useState(()=>{const s=localStorage.getItem("lc_theme");return s?s==="dark":true})
  const newVersion=useVersionChecker()

  useEffect(()=>{
    document.body.classList.toggle("light",!isDark)
    localStorage.setItem("lc_theme",isDark?"dark":"light")
  },[isDark])

  // ── REFRESH PERFIL DESDE BD AL CARGAR ──
  // Si hay sesión en LS, verificar que el perfil esté actualizado con la BD.
  // Esto corrige nombres/roles incorrectos sin que el usuario tenga que hacer login.
  // Usar ref para que solo corra UNA vez al montar, no en cada refresh de token
  const profileRefreshedRef=useRef(false)
  useEffect(()=>{
    if(!session?.token||!session?.profile?.id)return
    if(profileRefreshedRef.current)return
    profileRefreshedRef.current=true
    async function refreshProfile(){
      try{
        const r=await fetch(`${SB_URL}/rest/v1/usuarios?id=eq.${session.profile.id}&select=*`,{
          headers:{apikey:SB_ANON,Authorization:`Bearer ${session.token}`}
        })
        if(!r.ok)return
        const data=await r.json()
        if(!Array.isArray(data)||data.length===0)return
        const freshProfile=data[0]
        if(typeof freshProfile.team_ids==="string"){try{freshProfile.team_ids=JSON.parse(freshProfile.team_ids)}catch{freshProfile.team_ids=[]}}
        if(!Array.isArray(freshProfile.team_ids))freshProfile.team_ids=[]
        // Solo actualizar si algo cambió — evitar re-renders innecesarios
        const hasChanges=
          freshProfile.name!==session.profile.name||
          freshProfile.role!==session.profile.role||
          freshProfile.initials!==session.profile.initials
        if(hasChanges){
          const updated={...session,profile:{...session.profile,...freshProfile}}
          LS.set("lc_session",updated)
          setSession(updated)
        }
      }catch(e){console.warn("refreshProfile error:",e)}
    }
    refreshProfile()
  // Solo correr al montar — no en cada cambio de sesión para evitar loops
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[session?.token])

  function handleTokenUpdate(t){
    const u={...session,token:t}
    LS.set("lc_session",u)
    setSession(u)
  }

  function handleLogout(){
    Realtime.disconnect()
    LS.del("lc_session")
    LS.del("lc_refresh_token")
    setSession(null)
  }

  const{expired,doRefresh}=useSessionRefresh(session,handleLogout,handleTokenUpdate)

  async function handleContinue(){
    await doRefresh(true)
    const rt=LS.get("lc_refresh_token",null)
    if(!rt)handleLogout()
  }

  useEffect(()=>{
    if(session?.token){Realtime.connect(session.token);PushNotif.requestPermission()}
    else Realtime.disconnect()
    return()=>{if(!session)Realtime.disconnect()}
  },[session?.token])

  // Detectar invitación/recovery en hash, query string o cookies
  const hash=window.location.hash||""
  const search=window.location.search||""
  const hashParams=new URLSearchParams(hash.replace("#",""))
  const searchParams=new URLSearchParams(search)
  const typeFromHash=hashParams.get("type")
  const typeFromQuery=searchParams.get("type")
  const tokenFromHash=hashParams.get("access_token")
  const tokenFromQuery=searchParams.get("access_token")||searchParams.get("code")
  const isInvite=(typeFromHash==="invite"||typeFromHash==="recovery"||typeFromQuery==="invite"||typeFromQuery==="recovery"||!!tokenFromHash||!!tokenFromQuery)&&(tokenFromHash||tokenFromQuery)

  if(isInvite)return<><Toast/><ConfirmDialog/><SetPassword/></>

  return(
    <>
      <Toast/>
      <ConfirmDialog/>
      {newVersion&&<UpdateBanner/>}
      {session&&expired&&<SessionExpiredModal onContinue={handleContinue} onLogout={handleLogout}/>}
      {session
        ?<Dashboard session={session} isDark={isDark} toggleTheme={()=>setIsDark(d=>!d)} onLogout={handleLogout}/>
        :<Login onLogin={s=>setSession(s)}/>
      }
    </>
  )
}
