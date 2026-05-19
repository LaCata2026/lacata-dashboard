import{useState,useEffect,useCallback}from'react'

import{sb}from'../lib/supabase'

import{Realtime}from'../lib/realtime'

import{NAV}from'../lib/utils'

import{useNotifications}from'../lib/notifications'

import Icon from'./Icon'

import{Av}from'./Shared'

import Spotlight from'./Spotlight'

import TaskCard from'../views/TaskCard'

import HomeView from'../views/HomeView'

import OrdenesView from'../views/OrdenesView'

import CreateTask from'../views/CreateTask'

import TeamsView from'../views/TeamsView'

import CalendarView from'../views/CalendarView'

import IntelView from'../views/IntelView'

import AdminView from'../views/AdminView'

import BottomNav from'./BottomNav'
import DiagnosticPanel from'./DiagnosticPanel'
import ReporteExcel from'../views/ReporteExcel'

export default function Dashboard({session,isDark,toggleTheme,onLogout}){

  const{token}=session
  // Defensive profile — ensure all fields exist even if DB returned incomplete data
  const profile={
    id:session.profile?.id||"",
    name:session.profile?.name||"Usuario",
    email:session.profile?.email||"",
    role:session.profile?.role||"colaborador",
    initials:session.profile?.initials||(session.profile?.name||"U").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase(),
    avatar_color:session.profile?.avatar_color||"#7c3aed",
    team_id:session.profile?.team_id||null,
    team_ids:Array.isArray(session.profile?.team_ids)?session.profile.team_ids:[],
  }

  const[page,setPage]=useState("home")

  const[pageArg,setPageArg]=useState(null)

  const[tasks,setTasks]=useState([])

  const[users,setUsers]=useState([])

  const[teams,setTeams]=useState([])

  const[loading,setLoading]=useState(true)

  const[sidebarOpen,setSidebarOpen]=useState(false)

  const[spotlight,setSpotlight]=useState(false)

  const[floatTask,setFloatTask]=useState(null)

  const[showNotif,setShowNotif]=useState(false)
  const[showDiag,setShowDiag]=useState(false)
  const[showReporte,setShowReporte]=useState(false)

  const{unread,markAllSeen,markSeen}=useNotifications(tasks,profile)

  // Carga inicial optimizada: activas SIEMPRE + completadas/vencidas de los últimos 60 días.
  // Las completadas viejas se cargan bajo demanda (loadHistory) solo si se necesitan en reportes.
  const load=useCallback(async()=>{

    try{

      // Fecha límite: 60 días atrás en formato ISO
      const cutoff=new Date(Date.now()-60*24*3600000).toISOString()

      // Tareas: trae todas las NO completadas + las completadas recientes.
      // Filtro PostgREST: status != completada OR created_at >= cutoff
      const taskQuery="select=*&order=created_at.desc&or=(status.neq.completada,created_at.gte."+cutoff+")"

      const[t,u,tm]=await Promise.all([

        sb.get("tareas",taskQuery,token),

        sb.get("usuarios","select=*&order=name.asc",token),

        sb.get("equipos","select=*&order=name.asc",token),

      ])

      if(!Array.isArray(t)||t[0]?.code==="PGRST301")throw new Error("SESSION_EXPIRED")

      setTasks(t);setUsers(u);setTeams(tm)

    }catch(e){if(e.message==="SESSION_EXPIRED")onLogout()}

    finally{setLoading(false)}

  },[token])

  // Carga el histórico completo (todas las completadas) — usado solo cuando
  // los reportes necesitan datos antiguos. No se llama en el arranque normal.
  const loadHistory=useCallback(async()=>{

    try{

      const all=await sb.get("tareas","select=*&order=created_at.desc",token)

      if(Array.isArray(all))setTasks(all)

    }catch(e){console.warn("loadHistory:",e)}

  },[token])

  useEffect(()=>{load()},[load])

  // Realtime incremental: aplica SOLO el registro que cambió al estado local,
  // en lugar de recargar las 3 tablas completas en cada cambio.
  // Esto reduce drásticamente las llamadas a Supabase con muchos usuarios.
  useEffect(()=>{

    const setters={tareas:setTasks,usuarios:setUsers,equipos:setTeams}

    function applyChange(table,payload){

      const setter=setters[table]

      if(!setter)return

      // payload puede venir como {eventType,new,old} o {type,record,old_record}
      const evType=payload.eventType||payload.type||payload.event

      const rec=payload.new||payload.record||payload.new_record

      const oldRec=payload.old||payload.old_record

      const recId=rec?.id||oldRec?.id

      if(!recId){load();return} // sin id no podemos hacer merge — fallback a recarga

      setter(prev=>{

        const arr=Array.isArray(prev)?prev:[]

        if(evType==="DELETE"||evType==="delete"){

          return arr.filter(x=>x.id!==recId)

        }

        if(evType==="INSERT"||evType==="insert"){

          if(arr.some(x=>x.id===recId))return arr.map(x=>x.id===recId?{...x,...rec}:x)

          return [rec,...arr]

        }

        // UPDATE — reemplaza la fila; si no existe (estaba fuera del rango cargado), la agrega

        if(arr.some(x=>x.id===recId))return arr.map(x=>x.id===recId?{...x,...rec}:x)

        return [rec,...arr]

      })

    }

    const unsubs=["tareas","usuarios","equipos"].map(table=>

      Realtime.subscribe(table,(payload)=>{

        try{applyChange(table,payload)}catch(e){console.warn("realtime apply error:",e);load()}

      })

    )

    return()=>unsubs.forEach(u=>u())

  },[load])

  useEffect(()=>{

    function onKey(e){if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();setSpotlight(s=>!s)};if(e.key==="Escape")setSpotlight(false)}

    window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey)

  },[])

  function navigate(id,arg=null){
    // Handle equipo_TEAMID routes — go to equipos view
    if(id&&id.startsWith("equipo_")){
      setPage("equipos");setPageArg(id.replace("equipo_",""));setSidebarOpen(false);return
    }
    setPage(id);setPageArg(arg);setSidebarOpen(false)
  }

  const navItems=NAV.filter(n=>n.roles.includes(profile.role))
  const isCuentas=profile.role==="cuentas"
  const isCollab=profile.role==="colaborador"
  // Equipos visibles en sidebar / vistas:
  //  - director: todos
  //  - cuentas: solo los de sus team_ids asignados
  //  - colaborador: solo los equipos a los que pertenece (team_ids + team_id)
  // Antes solo se filtraba para cuentas; el colaborador veía TODOS los equipos
  // en el sidebar. Ahora se aplica el mismo scope a colaborador.
  const myScopedTeamIds=(isCuentas||isCollab)
    ?(Array.isArray(profile.team_ids)&&profile.team_ids.length>0
        ?profile.team_ids
        :[profile.team_id].filter(Boolean))
    :null
  const visibleTeams=(isCuentas||isCollab)&&myScopedTeamIds
    ?teams.filter(t=>myScopedTeamIds.includes(t.id))
    :teams

  // Navega a desempeño y pasa el usuario como pageArg — IntelView lo recibe
  // como initialUser y lo pasa a TabCarga, eliminando la necesidad de
  // window._perfSelectUser y el setTimeout con condición de carrera.
  function onViewUser(u){
    navigate("desempeno",u)
  }

  function onOpenTask(t){setFloatTask(t)}

  const shared={tasks,users,teams,token,profile,me:profile,onReload:load,onRefresh:load,onNavigate:navigate,onViewUser,onOpenTask}

  const views={

    home:<HomeView {...shared}/>,

    ordenes:<OrdenesView {...shared} initialFilter={pageArg}/>,

    crear:<CreateTask {...shared} onCreated={()=>navigate("ordenes")} onBack={()=>navigate("ordenes")}/>,

    // visibleTeams ya está scoped por rol — TeamsView recibe solo los equipos permitidos
    equipos:<TeamsView {...shared} teams={visibleTeams}/>,

    calendario:<CalendarView {...shared}/>,

    // initialUser viene de pageArg cuando se navega desde onViewUser
    desempeno:<IntelView {...shared} me={profile} profile={profile} token={token} onRefresh={load} onLoadHistory={loadHistory} initialUser={pageArg} onNavigate={navigate}/>,

    admin:<AdminView {...shared}/>,

    perfil:(

      <div style={{padding:20}}>

        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24,padding:16,background:"var(--bg2)",borderRadius:12,border:"1px solid var(--border)"}}>

          <div className="avatar" style={{width:48,height:48,background:profile.avatar_color||"#7c3aed",fontSize:16,color:"#fff"}}>{profile.initials||"?"}</div>

          <div><p style={{fontSize:16,fontWeight:700}}>{profile.name}</p><p style={{fontSize:12,color:"var(--muted)",textTransform:"capitalize"}}>{profile.role}</p></div>

        </div>

        <div style={{display:"flex",flexDirection:"column",gap:8}}>

          <button onClick={toggleTheme} className="btn btn-ghost" style={{justifyContent:"flex-start",gap:10}}>

            {isDark?"&#9728; Modo claro":"&#9790; Modo oscuro"}

          </button>

          <button onClick={()=>setShowNotif(s=>!s)} className="btn btn-ghost" style={{justifyContent:"flex-start",gap:10,position:"relative"}}>

            &#x1F4AC; Menciones

            {unread.length>0&&<span style={{marginLeft:"auto",background:"var(--s-vencida)",color:"#fff",fontSize:10,fontWeight:700,borderRadius:10,padding:"1px 7px"}}>{unread.length}</span>}

          </button>

          {(profile.role==="director"||profile.role==="cuentas")&&<button onClick={()=>navigate("admin")} className="btn btn-ghost" style={{justifyContent:"flex-start",gap:10}}>

            &#9881; Administracion

          </button>}

          <button onClick={onLogout} className="btn btn-danger" style={{justifyContent:"flex-start",gap:10,marginTop:8}}>

            Cerrar sesion

          </button>

        </div>

      </div>

    ),

  }

  return(

    <div className="app-shell">

      <div className={`mobile-overlay${sidebarOpen?" open":""}`} onClick={()=>setSidebarOpen(false)}/>

      <aside className={`sidebar${sidebarOpen?" open":""}`}>

        <div className="sidebar-inner">

          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:24,paddingBottom:16,borderBottom:"1px solid var(--border)"}}>

            <div className="logo-mark" style={{background:"#0d0d0d",padding:2}}><img src="/logo_cata.png" alt="La Cata" style={{width:"100%",height:"100%",objectFit:"contain",borderRadius:6}}/></div>

            <div><div style={{fontWeight:800,fontSize:15,fontFamily:"var(--font-display)",letterSpacing:"-.02em"}}>La Cata</div><div style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)",textTransform:"uppercase",letterSpacing:".08em"}}>Creative Ops</div></div>

          </div>

          <button onClick={()=>setSpotlight(true)} style={{display:"flex",alignItems:"center",gap:8,width:"100%",background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:8,padding:"7px 10px",color:"var(--muted)",fontSize:12,cursor:"pointer",marginBottom:16,fontFamily:"var(--font-body)",transition:".13s"}}>

            <Icon n="buscar" size={13}/><span style={{flex:1,textAlign:"left"}}>Buscar...</span>

            <span style={{fontSize:10,fontFamily:"var(--font-mono)",background:"var(--bg4)",padding:"2px 5px",borderRadius:4}}>K</span>

          </button>

          <nav>

            {["trabajo","admin"].map(section=>{

              const items=navItems.filter(n=>n.section===section);if(!items.length)return null

              return(<div key={section}>{section==="admin"&&<div className="nav-section">Admin</div>}

                {items.map(n=>(<button key={n.id} className={`nav-item${page===n.id?" active":""}`} onClick={()=>navigate(n.id)}><Icon n={n.icon} size={15}/>{n.label}</button>))}

              </div>)

            })}

            {visibleTeams.length>0&&(<div><div className="nav-section">Equipos</div>

              {visibleTeams.map(t=>(<button key={t.id} onClick={()=>navigate("equipos")} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 10px",fontSize:12,color:"var(--muted2)",background:"transparent",border:"none",cursor:"pointer",width:"100%",borderRadius:6,transition:".13s",fontFamily:"inherit",textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background="var(--bg3)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><span style={{width:7,height:7,borderRadius:"50%",background:t.color||"var(--accent)",flexShrink:0,display:"inline-block"}}/>{t.name}</button>))}

            </div>)}

            {profile.role==="director"&&(
              <div style={{marginTop:8}}>
                <div className="nav-section">Reportes</div>
                <button className="nav-item" onClick={()=>setShowReporte(true)}>
                  <Icon n="exportar" size={15}/>Reporte Excel
                </button>
              </div>
            )}

          </nav>

          <div style={{borderTop:"1px solid var(--border)",paddingTop:12,marginTop:8}}>

            <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 4px",marginBottom:8,overflow:"visible"}}>

              <Av u={profile} size={28}/>

              <div style={{flex:1,minWidth:0,overflow:"visible"}}>

                <div style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{profile.name}</div>

                <div style={{fontSize:10,color:"var(--muted)",textTransform:"capitalize"}}>{profile.role}</div>

              </div>

              <button onClick={toggleTheme} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted2)",padding:4,borderRadius:6}}>

                <Icon n={isDark?"sol":"luna"} size={15}/>

              </button>

              {profile.role==="director"&&<button onClick={()=>setShowDiag(true)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted2)",padding:4,borderRadius:6}} title="Diagnóstico del sistema">

                <Icon n="semaforo" size={15}/>

              </button>}

              <div style={{position:"relative",flexShrink:0}}>

                <button onClick={()=>setShowNotif(s=>!s)} style={{background:"none",border:"none",cursor:"pointer",color:unread.length>0?"var(--accent)":"var(--muted2)",padding:4,borderRadius:6,position:"relative"}}>

                  <Icon n="comentar" size={15}/>

                  {unread.length>0&&<span style={{position:"absolute",top:-2,right:-2,background:"var(--s-vencida)",color:"#fff",fontSize:9,fontWeight:700,borderRadius:"50%",width:14,height:14,display:"flex",alignItems:"center",justifyContent:"center"}}>{unread.length}</span>}

                </button>

                {showNotif&&(

                  <div style={{position:"absolute",bottom:"100%",right:0,marginBottom:8,background:"var(--bg2)",border:"1px solid var(--border2)",borderRadius:10,padding:8,minWidth:280,boxShadow:"0 8px 32px rgba(0,0,0,.4)",zIndex:300}}>

                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,paddingBottom:8,borderBottom:"1px solid var(--border)"}}>

                      <span style={{fontSize:12,fontWeight:700}}>Menciones</span>

                      {unread.length>0&&<button onClick={markAllSeen} style={{fontSize:11,background:"none",border:"none",cursor:"pointer",color:"var(--muted)"}}>Marcar leidas</button>}

                    </div>

                    {unread.length===0

                      ?<p style={{fontSize:12,color:"var(--muted)",textAlign:"center",padding:"12px 0"}}>Sin menciones nuevas</p>

                      :unread.slice(0,5).map(n=>(

                        <div key={n.key} onClick={()=>{markSeen(n.key);setShowNotif(false);setFloatTask(n.task)}}

                          style={{display:"flex",gap:8,padding:"8px 6px",borderRadius:7,cursor:"pointer",transition:".13s"}}

                          onMouseEnter={e=>e.currentTarget.style.background="var(--bg3)"}

                          onMouseLeave={e=>e.currentTarget.style.background="transparent"}>

                          <span style={{fontSize:16,flexShrink:0}}>&#x1F4AC;</span>

                          <div style={{minWidth:0}}>

                            <p style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n.task.title}</p>

                            <p style={{fontSize:11,color:"var(--muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n.comment.user_name}: {n.comment.text.slice(0,50)}</p>

                          </div>

                        </div>

                      ))

                    }

                  </div>

                )}

              </div>

            </div>

            <button className="btn btn-ghost btn-sm" style={{width:"100%",fontSize:11}} onClick={onLogout}>Cerrar sesion</button>

          </div>

        </div>

      </aside>

      <main className="main-content">

        <div className="mobile-topbar">

          <button className="hamburger" onClick={()=>setSidebarOpen(true)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text)",fontSize:20,padding:6,lineHeight:1}}>&#9776;</button>

          <div style={{fontWeight:800,fontSize:15,fontFamily:"var(--font-display)"}}>La Cata</div>

        </div>

        <div className="page-content">

          {loading

            ?<div style={{padding:40,textAlign:"center",color:"var(--muted)"}}><div className="skeleton skeleton-title" style={{width:200,margin:"0 auto 12px"}}/><div className="skeleton skeleton-text" style={{width:300,margin:"0 auto"}}/></div>

            :(views[page]||views.home)

          }

        </div>

      </main>

      {showDiag&&<DiagnosticPanel session={session} tasks={tasks} users={users} teams={teams} onClose={()=>setShowDiag(false)}/>}
      {showReporte&&<ReporteExcel tasks={tasks} users={users} teams={teams} isOpen={showReporte} onClose={()=>setShowReporte(false)}/>}
      {spotlight&&<Spotlight tasks={tasks} users={users} teams={teams} onNavigate={navigate} onClose={()=>setSpotlight(false)} onOpenTask={setFloatTask}/>}

      {floatTask&&<TaskCard task={floatTask} users={users} teams={teams} me={profile} token={token} onRefresh={load} forceOpen={true} onForceClose={()=>setFloatTask(null)}/>}

      <div className="mobile-bottom-nav"><BottomNav page={page} navigate={navigate} profile={profile} isDark={isDark} toggleTheme={toggleTheme} onLogout={onLogout} unread={unread.length} onNotif={()=>setShowNotif(s=>!s)} onReporte={()=>setShowReporte(true)}/></div>

    </div>

  )

}
