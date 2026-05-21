import{useState,useEffect}from'react'
import{SB_URL,SB_ANON,LS,getRole,getAvatarColor,getInitials}from'../lib/supabase'
import Icon from'./Icon'

// Extrae el token de acceso desde 3 posibles ubicaciones:
// 1. Hash (#access_token=...) — flujo implicit (legacy)
// 2. Query string (?access_token=... o ?code=...) — flujo PKCE moderno
// 3. Cookies (sb-access-token) — fallback de Supabase
function extractToken(){
  // Intento 1: Hash fragment
  const hash=window.location.hash||""
  if(hash){
    const hashParams=new URLSearchParams(hash.replace("#",""))
    const t=hashParams.get("access_token")
    if(t&&t.split(".").length===3)return{token:t,refresh:hashParams.get("refresh_token"),source:"hash"}
  }

  // Intento 2: Query string (?access_token= o ?code=)
  const search=window.location.search||""
  if(search){
    const searchParams=new URLSearchParams(search)
    const t=searchParams.get("access_token")
    if(t&&t.split(".").length===3)return{token:t,refresh:searchParams.get("refresh_token"),source:"query"}
    const code=searchParams.get("code")
    if(code)return{token:null,code,source:"pkce"}
  }

  // Intento 3: Cookies
  try{
    const cookies=document.cookie.split(";").reduce((acc,c)=>{
      const[k,v]=c.trim().split("=")
      if(k&&v)acc[k]=decodeURIComponent(v)
      return acc
    },{})
    // Supabase usa "sb-{project-ref}-auth-token" como nombre de cookie
    for(const k of Object.keys(cookies)){
      if(k.startsWith("sb-")&&k.includes("auth-token")){
        try{
          const parsed=JSON.parse(cookies[k])
          if(parsed?.access_token&&parsed.access_token.split(".").length===3){
            return{token:parsed.access_token,refresh:parsed.refresh_token,source:"cookie"}
          }
        }catch{}
      }
    }
  }catch(e){console.warn("[SetPassword] error reading cookies:",e)}

  return null
}

export default function SetPassword(){
  const[pw,setPw]=useState("")
  const[pw2,setPw2]=useState("")
  const[loading,setLoading]=useState(false)
  const[err,setErr]=useState("")
  const[tokenInfo,setTokenInfo]=useState(null)

  // Intentar extraer el token al montar el componente
  useEffect(()=>{
    const info=extractToken()
    console.log("[SetPassword] Token extraction:",info?{source:info.source,hasToken:!!info.token,hasCode:!!info.code}:"none")
    setTokenInfo(info)
  },[])

  // Si no encontramos token en ningún lado, mostrar mensaje claro
  if(tokenInfo===null){
    // Aún cargando — esperar a que useEffect corra
    return null
  }

  if(!tokenInfo||(!tokenInfo.token&&!tokenInfo.code)){
    return(
      <div className="login-wrap"><div className="login-card">
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
          <div className="logo-mark" style={{background:"#0d0d0d",padding:2}}><img src="/logo_cata.png" alt="La Cata" style={{width:"100%",height:"100%",objectFit:"contain",borderRadius:6}}/></div>
          <div><h1 style={{fontSize:24,fontWeight:900,letterSpacing:"-0.4px",fontFamily:"var(--font-display)"}}>La Cata</h1><p style={{fontSize:12,color:"var(--muted)"}}>Enlace inválido</p></div>
        </div>
        <div style={{background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.2)",borderRadius:10,padding:"14px 16px",fontSize:13,color:"#fca5a5",marginBottom:16,lineHeight:1.5}}>
          Este enlace ya fue usado o es inválido. Por favor:
          <ol style={{marginTop:8,marginLeft:18,padding:0}}>
            <li>Vuelve a tu correo electrónico</li>
            <li>Haz clic en el enlace de invitación más reciente</li>
            <li>No recargues la página ni cierres la pestaña antes de crear tu contraseña</li>
          </ol>
        </div>
        <button className="btn btn-ghost" style={{width:"100%",padding:11,fontSize:13}} onClick={()=>{window.location.hash="";window.location.search="";window.location.href="/"}}>Ir al inicio</button>
      </div></div>
    )
  }

  async function savePassword(){
    setErr("")
    if(pw.length<8)return setErr("Mínimo 8 caracteres")
    if(pw!==pw2)return setErr("Las contraseñas no coinciden")
    setLoading(true)
    try{
      let accessToken=tokenInfo.token
      let userData=null

      // Si vino como PKCE code, intercambiarlo primero por un access_token
      if(tokenInfo.source==="pkce"&&tokenInfo.code){
        const exchangeR=await fetch(`${SB_URL}/auth/v1/token?grant_type=pkce`,{
          method:"POST",
          headers:{"Content-Type":"application/json",apikey:SB_ANON},
          body:JSON.stringify({auth_code:tokenInfo.code})
        })
        const exchangeD=await exchangeR.json()
        if(!exchangeR.ok||!exchangeD.access_token){
          throw new Error("No se pudo verificar el enlace. Por favor abre el enlace más reciente del correo.")
        }
        accessToken=exchangeD.access_token
        userData=exchangeD.user||null
      }

      // ── 1. Actualizar contraseña en Auth ──
      const r=await fetch(`${SB_URL}/auth/v1/user`,{
        method:"PUT",
        headers:{"Content-Type":"application/json",apikey:SB_ANON,Authorization:`Bearer ${accessToken}`},
        body:JSON.stringify({password:pw})
      })
      const d=await r.json()
      if(!r.ok||d.error||d.code)throw new Error(d.msg||d.error_description||d.error||"No se pudo guardar la contraseña")

      const userInfo=userData||d
      const email=(userInfo.email||userInfo.user_metadata?.email||userInfo.new_email||"").toLowerCase()
      if(!email)throw new Error("No se pudo identificar el email del usuario")
      const fullName=userInfo.user_metadata?.full_name||userInfo.user_metadata?.name||""
      const fallbackName=email?email.split("@")[0]:("usuario_"+Math.random().toString(36).slice(2,6))
      const name=fullName||fallbackName
      const userId=userInfo.id||d.id

      // ── 2. Login real con email+password para sesión válida ──
      const loginR=await fetch(`${SB_URL}/auth/v1/token?grant_type=password`,{
        method:"POST",
        headers:{"Content-Type":"application/json",apikey:SB_ANON},
        body:JSON.stringify({email,password:pw})
      })
      const loginD=await loginR.json()
      if(!loginR.ok||!loginD.access_token){
        throw new Error("La contraseña se guardó pero no se pudo iniciar sesión automáticamente. Por favor ve al login y entra con tu correo y contraseña.")
      }

      // ── 3. Buscar perfil en usuarios ──
      const profileR=await fetch(`${SB_URL}/rest/v1/usuarios?id=eq.${userId}&select=*`,{
        headers:{apikey:SB_ANON,Authorization:`Bearer ${loginD.access_token}`}
      })
      const profileData=await profileR.json()
      let profile

      if(Array.isArray(profileData)&&profileData.length>0){
        profile=profileData[0]
      }else{
        const newProfile={
          id:userId,
          email,
          name,
          role:getRole(email),
          avatar_color:getAvatarColor(email),
          initials:getInitials(name),
          team_id:null,
          team_ids:null,
        }
        const insertR=await fetch(`${SB_URL}/rest/v1/usuarios`,{
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            apikey:SB_ANON,
            Authorization:`Bearer ${loginD.access_token}`,
            Prefer:"resolution=ignore-duplicates,return=representation"
          },
          body:JSON.stringify(newProfile)
        })
        const insertData=await insertR.json()
        profile=Array.isArray(insertData)&&insertData.length>0?insertData[0]:newProfile
      }

      if(typeof profile.team_ids==="string"){try{profile.team_ids=JSON.parse(profile.team_ids)}catch{profile.team_ids=[]}}
      if(!Array.isArray(profile.team_ids))profile.team_ids=[]

      // ── 4. Guardar sesión y entrar ──
      LS.set("lc_session",{token:loginD.access_token,profile})
      if(loginD.refresh_token)LS.set("lc_refresh_token",loginD.refresh_token)
      window.location.hash=""
      window.location.search=""
      window.location.href="/"
    }catch(e){setErr(e.message)}finally{setLoading(false)}
  }
  return(
    <div className="login-wrap"><div className="login-card">
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
        <div className="logo-mark" style={{background:"#0d0d0d",padding:2}}><img src="/logo_cata.png" alt="La Cata" style={{width:"100%",height:"100%",objectFit:"contain",borderRadius:6}}/></div>
        <div><h1 style={{fontSize:24,fontWeight:900,letterSpacing:"-0.4px",fontFamily:"var(--font-display)"}}>La Cata</h1><p style={{fontSize:12,color:"var(--muted)"}}>Crea tu contraseña</p></div>
      </div>
      <p style={{color:"var(--muted2)",fontSize:14,marginBottom:20,lineHeight:1.5}}>Bienvenido a Agarrate Catalina Creative Ops. Crea tu contraseña para ingresar.</p>
      <div className="form-group"><label className="form-label">Nueva contraseña</label><input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="Mínimo 8 caracteres"/></div>
      <div className="form-group"><label className="form-label">Confirmar contraseña</label><input type="password" value={pw2} onChange={e=>setPw2(e.target.value)} onKeyDown={e=>e.key==="Enter"&&savePassword()} placeholder="Repite tu contraseña"/></div>
      {err&&(<div style={{background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.2)",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#fca5a5",marginBottom:14}}><Icon n="alerta" size={12} style={{marginRight:4}}/>{err}</div>)}
      <button className="btn btn-primary" style={{width:"100%",padding:13,fontSize:15,fontWeight:700}} onClick={savePassword} disabled={loading}>{loading?"Guardando...":"Crear contraseña e ingresar"}</button>
    </div></div>
  )
}
