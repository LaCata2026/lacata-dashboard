import{useState}from'react'
import{SB_URL,SB_ANON,LS,getRole,getAvatarColor,getInitials}from'../lib/supabase'
import Icon from'./Icon'
export default function SetPassword(){
  const[pw,setPw]=useState("");const[pw2,setPw2]=useState("");const[loading,setLoading]=useState(false);const[err,setErr]=useState("")
  const hash=window.location.hash;const params=new URLSearchParams(hash.replace("#",""));const accessToken=params.get("access_token")
  async function savePassword(){
    setErr("")
    if(pw.length<6)return setErr("Mínimo 6 caracteres")
    if(pw!==pw2)return setErr("Las contraseñas no coinciden")
    setLoading(true)
    try{
      // 1. Actualizar contraseña en Auth
      const r=await fetch(`${SB_URL}/auth/v1/user`,{method:"PUT",headers:{"Content-Type":"application/json",apikey:SB_ANON,Authorization:`Bearer ${accessToken}`},body:JSON.stringify({password:pw})})
      const d=await r.json();if(d.error)throw new Error(d.error_description||d.error)

      const email=d.email||d.user_metadata?.email||d.new_email||""
      const fullName=d.user_metadata?.full_name||d.user_metadata?.name||""
      const fallbackName=email?email.split("@")[0]:("usuario_"+Math.random().toString(36).slice(2,6))
      const name=fullName||fallbackName

      // 2. Buscar fila existente en tabla usuarios
      const profileR=await fetch(`${SB_URL}/rest/v1/usuarios?id=eq.${d.id}&select=*`,{
        headers:{apikey:SB_ANON,Authorization:`Bearer ${accessToken}`}
      })
      const profileData=await profileR.json()
      let profile

      if(Array.isArray(profileData)&&profileData.length>0){
        // ── Fila existe — usar la del sistema (tiene rol, equipo, etc correctos) ──
        profile=profileData[0]
      }else{
        // ── Fila NO existe — crear en la BD antes de continuar ──
        // Esto pasa cuando el usuario fue creado directo en Supabase Auth
        // sin pasar por el modal de AdminView
        const newProfile={
          id:d.id,
          email:email.toLowerCase(),
          name,
          role:getRole(email),             // "colaborador" por defecto
          avatar_color:getAvatarColor(email),
          initials:getInitials(name),
          team_id:null,
          team_ids:null,
        }
        // Insertar en BD — si ya existe por race condition, ignorar conflicto
        const insertR=await fetch(`${SB_URL}/rest/v1/usuarios`,{
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            apikey:SB_ANON,
            Authorization:`Bearer ${accessToken}`,
            Prefer:"resolution=ignore-duplicates,return=representation"
          },
          body:JSON.stringify(newProfile)
        })
        const insertData=await insertR.json()
        // Usar la fila insertada si viene, sino el objeto local
        profile=Array.isArray(insertData)&&insertData.length>0?insertData[0]:newProfile
      }

      // ── Hacer login real con email+password para obtener sesión válida ──
      // El accessToken del link de invitación es de un solo uso y no sirve para sesiones
      // Usar email del response del PUT como fallback si profile.email no está disponible
      const loginEmail=profile.email||email||d.email
      let finalToken=accessToken
      let finalRefresh=null
      if(loginEmail){
        try{
          const loginR=await fetch(`${SB_URL}/auth/v1/token?grant_type=password`,{
            method:"POST",
            headers:{"Content-Type":"application/json",apikey:SB_ANON},
            body:JSON.stringify({email:loginEmail,password:pw})
          })
          const loginD=await loginR.json()
          if(loginD.access_token){
            finalToken=loginD.access_token
            finalRefresh=loginD.refresh_token
          }
        }catch(loginErr){console.warn("Auto-login after SetPassword failed:",loginErr)}
      }

      LS.set("lc_session",{token:finalToken,profile})
      // LS.set hace JSON.stringify internamente — usar LS.set consistentemente
      if(finalRefresh)LS.set("lc_refresh_token",finalRefresh)
      window.location.hash=""
      window.location.reload()
    }catch(e){setErr(e.message)}finally{setLoading(false)}
  }
  return(
    <div className="login-wrap"><div className="login-card">
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
        <div className="logo-mark" style={{background:"#0d0d0d",padding:2}}><img src="/logo_cata.png" alt="La Cata" style={{width:"100%",height:"100%",objectFit:"contain",borderRadius:6}}/></div>
        <div><h1 style={{fontSize:24,fontWeight:900,letterSpacing:"-0.4px",fontFamily:"var(--font-display)"}}>La Cata</h1><p style={{fontSize:12,color:"var(--muted)"}}>Crea tu contraseña</p></div>
      </div>
      <p style={{color:"var(--muted2)",fontSize:14,marginBottom:20,lineHeight:1.5}}>Bienvenido a Agarrate Catalina Creative Ops. Crea tu contraseña para ingresar.</p>
      <div className="form-group"><label className="form-label">Nueva contraseña</label><input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="Mínimo 6 caracteres"/></div>
      <div className="form-group"><label className="form-label">Confirmar contraseña</label><input type="password" value={pw2} onChange={e=>setPw2(e.target.value)} onKeyDown={e=>e.key==="Enter"&&savePassword()} placeholder="Repite tu contraseña"/></div>
      {err&&(<div style={{background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.2)",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#fca5a5",marginBottom:14}}><Icon n="alerta" size={12} style={{marginRight:4}}/>{err}</div>)}
      <button className="btn btn-primary" style={{width:"100%",padding:13,fontSize:15,fontWeight:700}} onClick={savePassword} disabled={loading}>{loading?"Guardando...":"Crear contraseña e ingresar"}</button>
    </div></div>
  )
}
