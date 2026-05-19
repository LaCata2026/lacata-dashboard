import{useState,useEffect}from'react'
import{sb,SB_URL,SB_ANON}from'../lib/supabase'

function Check({label,status,detail}){
  const icon=status==="pass"?"✅":status==="fail"?"❌":status==="warn"?"⚠️":"⏳"
  const color=status==="pass"?"var(--green)":status==="fail"?"var(--red)":status==="warn"?"var(--yellow)":"var(--muted)"
  return(
    <div style={{display:"flex",alignItems:"flex-start",gap:10,padding:"8px 0",borderBottom:"1px solid var(--border)"}}>
      <span style={{fontSize:16,flexShrink:0}}>{icon}</span>
      <div style={{flex:1}}>
        <div style={{fontSize:13,fontWeight:600,color}}>{label}</div>
        {detail&&<div style={{fontSize:11,color:"var(--muted)",marginTop:2,fontFamily:"var(--font-mono)"}}>{detail}</div>}
      </div>
    </div>
  )
}

export default function DiagnosticPanel({session,tasks,users,teams,onClose}){
  const[checks,setChecks]=useState([])
  const[running,setRunning]=useState(true)
  const token=session?.token
  const profile=session?.profile

  useEffect(()=>{runAll()},[])

  async function runAll(){
    setRunning(true)
    const results=[]

    // 1. Session & profile
    results.push({label:"Sesión activa",status:token?"pass":"fail",detail:token?`Token presente · Usuario: ${profile?.name||"?"}` :"No hay token en sesión"})
    results.push({label:"Perfil completo",status:(profile?.id&&profile?.name&&profile?.role&&profile?.avatar_color)?"pass":"warn",
      detail:profile?`ID:${profile.id?.slice(0,8)}… · Rol:${profile.role} · Color:${profile.avatar_color||"FALTANTE"} · Iniciales:${profile.initials||"FALTANTE"}`:"Sin perfil"})

    // 2. Supabase connection
    try{
      const r=await fetch(`${SB_URL}/rest/v1/usuarios?limit=1`,{headers:{apikey:SB_ANON,Authorization:`Bearer ${token}`}})
      results.push({label:"Conexión a Supabase",status:r.ok?"pass":"fail",detail:`Status ${r.status} · ${SB_URL.slice(8,30)}…`})
    }catch(e){results.push({label:"Conexión a Supabase",status:"fail",detail:e.message})}

    // 3. Data loaded
    results.push({label:"Tareas cargadas",status:Array.isArray(tasks)&&tasks.length>=0?"pass":"fail",detail:`${tasks?.length||0} tareas en memoria`})
    results.push({label:"Usuarios cargados",status:Array.isArray(users)&&users.length>0?"pass":"warn",detail:`${users?.length||0} usuarios · ${users?.filter(u=>u.role==="colaborador").length||0} colaboradores`})
    results.push({label:"Equipos cargados",status:Array.isArray(teams)&&teams.length>0?"pass":"warn",detail:`${teams?.length||0} equipos`})

    // 4. Profile in usuarios table
    try{
      const r=await fetch(`${SB_URL}/rest/v1/usuarios?id=eq.${profile?.id}&select=id,name,role,team_ids`,{headers:{apikey:SB_ANON,Authorization:`Bearer ${token}`}})
      const d=await r.json()
      const found=Array.isArray(d)&&d.length>0
      results.push({label:"Perfil en base de datos",status:found?"pass":"fail",detail:found?`Rol: ${d[0].role} · team_ids: ${JSON.stringify(d[0].team_ids)}`:"Perfil NO encontrado en tabla usuarios — creará problemas al recargar"})
    }catch(e){results.push({label:"Perfil en base de datos",status:"fail",detail:e.message})}

    // 5. Role permissions
    const role=profile?.role
    results.push({label:"Permisos de rol",status:["director","cuentas","colaborador"].includes(role)?"pass":"fail",
      detail:`Rol actual: ${role||"UNDEFINED"} · Puede crear órdenes: ${["director","cuentas"].includes(role)?"Sí":"No"} · Ve reportes: ${["director","cuentas"].includes(role)?"Sí":"No"}`})

    // 6. Token expiry
    try{
      const payload=JSON.parse(atob(token.split(".")[1]))
      const exp=payload.exp*1000
      const rem=exp-Date.now()
      const mins=Math.floor(rem/60000)
      results.push({label:"Expiración de token",status:rem>10*60*1000?"pass":rem>0?"warn":"fail",
        detail:rem>0?`Expira en ${mins} minutos (${new Date(exp).toLocaleTimeString("es-GT")})`:"Token EXPIRADO"})
    }catch{results.push({label:"Expiración de token",status:"warn",detail:"No se pudo leer el token"})}

    // 7. Realtime WebSocket
    results.push({label:"Realtime WebSocket",status:window._realtimeConnected?"pass":"warn",
      detail:window._realtimeConnected?"Conectado":"Estado desconocido — verifica si las notificaciones llegan en tiempo real"})

    // 8. Tasks data integrity
    const tasksWithNoTeam=tasks?.filter(t=>!t.team_id).length||0
    const tasksWithNoAssigned=tasks?.filter(t=>!t.assigned_to||!t.assigned_to.length).length||0
    results.push({label:"Integridad de órdenes",status:tasksWithNoTeam===0&&tasksWithNoAssigned===0?"pass":"warn",
      detail:`${tasksWithNoTeam} sin equipo · ${tasksWithNoAssigned} sin asignar · ${tasks?.filter(t=>t.status==="vencida").length||0} vencidas`})

    // 9. Users data integrity  
    const usersNoColor=users?.filter(u=>!u.avatar_color).length||0
    const usersNoInitials=users?.filter(u=>!u.initials).length||0
    results.push({label:"Integridad de usuarios",status:usersNoColor===0&&usersNoInitials===0?"pass":"warn",
      detail:`${usersNoColor} sin color · ${usersNoInitials} sin iniciales · ${users?.filter(u=>!u.team_id&&!u.team_ids?.length&&u.role==="colaborador").length||0} colaboradores sin equipo`})

    // 10. Can write to DB
    try{
      const testId="diag-test-"+Date.now()
      const r=await fetch(`${SB_URL}/rest/v1/usuarios?id=eq.${profile?.id}`,{
        method:"PATCH",headers:{apikey:SB_ANON,Authorization:`Bearer ${token}`,"Content-Type":"application/json",Prefer:"return=minimal"},
        body:JSON.stringify({updated_at:new Date().toISOString()})
      })
      results.push({label:"Escritura en base de datos",status:r.ok||r.status===204?"pass":"fail",detail:`Status ${r.status} · ${r.ok||r.status===204?"Escritura OK":"Error al escribir"}`})
    }catch(e){results.push({label:"Escritura en base de datos",status:"fail",detail:e.message})}

    setChecks(results)
    setRunning(false)
  }

  const passed=checks.filter(c=>c.status==="pass").length
  const failed=checks.filter(c=>c.status==="fail").length
  const warned=checks.filter(c=>c.status==="warn").length

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:9990,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:14,padding:24,width:"100%",maxWidth:560,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.5)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <div>
            <h2 style={{fontSize:17,fontWeight:700,marginBottom:4}}>🔍 Diagnóstico del sistema</h2>
            {!running&&<div style={{fontSize:12,fontFamily:"var(--font-mono)",color:"var(--muted)"}}>
              <span style={{color:"var(--green)"}}>✅ {passed} ok</span>
              {warned>0&&<span style={{color:"var(--yellow)",marginLeft:10}}>⚠️ {warned} advertencias</span>}
              {failed>0&&<span style={{color:"var(--red)",marginLeft:10}}>❌ {failed} errores</span>}
            </div>}
          </div>
          <button onClick={onClose} style={{background:"var(--bg3)",border:"none",cursor:"pointer",color:"var(--muted)",fontSize:18,padding:"4px 10px",borderRadius:8}}>✕</button>
        </div>

        {running&&(
          <div style={{textAlign:"center",padding:32,color:"var(--muted)"}}>
            <div style={{fontSize:24,marginBottom:8}}>⏳</div>
            <p style={{fontSize:13}}>Ejecutando diagnóstico...</p>
          </div>
        )}

        {!running&&(
          <>
            {checks.map((c,i)=><Check key={i} {...c}/>)}
            <div style={{marginTop:16,display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={runAll} style={{padding:"7px 16px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg3)",color:"var(--text)",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>
                🔄 Volver a correr
              </button>
              <button onClick={onClose} style={{padding:"7px 16px",borderRadius:8,border:"none",background:"var(--accent)",color:"#0d0d0d",cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"inherit"}}>
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
