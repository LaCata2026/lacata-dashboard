import{useState,useEffect,useRef,useCallback}from'react'
import ReactDOM from'react-dom'
import{sb,teamColor,COLLAB_COLORS,COLORS,MARCAS_PREDEFINIDAS,getInitials,autoColor}from'../lib/supabase'
import{showToast}from'../components/Toast'
import{showConfirm}from'../components/ConfirmDialog'
import Icon from'../components/Icon'
import{Av,SC,BackBtn,Linkify,ActiveTimer,StatusLegend}from'../components/Shared'
import{statusLabel,statusPill,statusColor,prioPill,fmtDate,fmtDateRelative,useSessionFilters}from'../lib/utils'
import{PushNotif}from'../lib/realtime'
function ModalPortal({children}){const el=useRef(document.createElement("div"));useEffect(()=>{document.body.appendChild(el.current);return()=>document.body.removeChild(el.current)},[]);return ReactDOM.createPortal(children,el.current)}
const assignedOf=t=>Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean)

/* ═══════════════════════════════════════════
   STAT CARD — tarjeta de estadística clickeable
   Componente reutilizable con hover visual claro.
   Se ve "tappable" sin ser ruidoso.
═══════════════════════════════════════════ */
function StatCard({val,label,color,onClick,isHero}){
  const clickable=typeof onClick==="function"
  return(
    <button
      onClick={onClick}
      disabled={!clickable}
      style={{
        background:"transparent",border:"none",padding:isHero?"0":"4px 10px",
        borderRadius:8,cursor:clickable?"pointer":"default",
        textAlign:"center",fontFamily:"inherit",color:"inherit",
        transition:".13s",display:"flex",
        flexDirection:isHero?"row":"column",
        alignItems:isHero?"baseline":"center",gap:isHero?8:3
      }}
      onMouseEnter={e=>{if(clickable){e.currentTarget.style.background="var(--bg3)";e.currentTarget.style.transform="translateY(-1px)"}}}
      onMouseLeave={e=>{if(clickable){e.currentTarget.style.background="transparent";e.currentTarget.style.transform="translateY(0)"}}}>
      <span style={{fontSize:isHero?34:22,fontWeight:800,color,fontFamily:"var(--font-display)",letterSpacing:isHero?"-.03em":"normal",lineHeight:1}}>{val}</span>
      <span style={{fontSize:isHero?11:10,color:"var(--muted)",textTransform:"uppercase",letterSpacing:isHero?".1em":".05em",fontFamily:"var(--font-mono)",marginTop:isHero?0:3}}>{label}</span>
    </button>
  )
}

/* ═══════════════════════════════════════════
   TIP BANNER
   Aparece en el Home cuando:
   - El usuario nunca lo ha descartado, O
   - Las notificaciones no están activadas (banner se queda visible para volver a ofrecerlas)
   Si el usuario ya descartó Y las notificaciones están activas → no aparece.
═══════════════════════════════════════════ */
function TipBanner(){
  const [dismissed,setDismissed]=useState(()=>localStorage.getItem("lc_tip_dismissed")==="1")
  const [notifState,setNotifState]=useState(()=>"Notification"in window?Notification.permission:"denied")

  // Refrescar el estado del permiso si la ventana recobra foco (usuario pudo cambiarlo en settings)
  useEffect(()=>{
    function onFocus(){
      if("Notification"in window)setNotifState(Notification.permission)
    }
    window.addEventListener("focus",onFocus)
    return()=>window.removeEventListener("focus",onFocus)
  },[])

  async function enableNotifs(){
    await PushNotif.requestPermission()
    setNotifState("Notification"in window?Notification.permission:"denied")
  }

  function dismiss(){
    localStorage.setItem("lc_tip_dismissed","1")
    setDismissed(true)
  }

  // Si ya descartó el banner Y las notificaciones están activas → no mostramos nada
  if(dismissed&&notifState==="granted")return null
  // Si ya descartó pero notifs no están activas → mostramos solo botón de notifs
  const showFullTip=!dismissed

  return(
    <div className="fade-in" style={{
      display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",
      padding:"10px 14px",marginBottom:16,
      background:"var(--accent-dim)",border:"1px solid rgba(232,197,71,.25)",
      borderRadius:10,fontSize:12
    }}>
      <span style={{fontSize:15,flexShrink:0}}>{notifState==="granted"?"💡":"🔔"}</span>
      <span style={{flex:1,color:"var(--muted2)"}}>
        {showFullTip
          ?<>Usa <kbd style={{background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:4,padding:"1px 5px",fontSize:11,fontFamily:"var(--font-mono)",color:"var(--text)"}}>⌘K</kbd> para buscar órdenes, usuarios o equipos al instante.</>
          :<>Recibe avisos en el escritorio cuando te asignen una orden o te mencionen.</>
        }
      </span>
      {notifState!=="granted"&&(
        <button onClick={enableNotifs} style={{
          display:"inline-flex",alignItems:"center",gap:5,
          fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:6,cursor:"pointer",
          background:"var(--accent)",color:"#0d0d0d",border:"none",fontFamily:"var(--font-body)",
          flexShrink:0
        }}>
          🔔 Activar notificaciones
        </button>
      )}
      {notifState==="granted"&&showFullTip&&(
        <span style={{fontSize:11,color:"var(--s-completada)",fontWeight:600,flexShrink:0}}>✓ Notificaciones activas</span>
      )}
      <button onClick={dismiss} title="Cerrar" style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",fontSize:16,padding:"0 2px",flexShrink:0,lineHeight:1}}>×</button>
    </div>
  )
}

function MyWeekCard({me,tasks,onNavigate}){
  const now=new Date()
  const day=now.getDay()
  const diffToMon=now.getDate()-day+(day===0?-6:1)
  const weekStart=new Date(now);weekStart.setDate(diffToMon);weekStart.setHours(0,0,0,0)
  const weekEnd=new Date(weekStart);weekEnd.setDate(weekEnd.getDate()+6);weekEnd.setHours(23,59,59,999)
  const mine=tasks.filter(t=>assignedOf(t).includes(me.id))
  const doneThisWeek=mine.filter(t=>{
    if(t.status!=="completada")return false
    const ref=t.updated_at?new Date(t.updated_at):(t.created_at?new Date(t.created_at):null)
    return ref&&ref>=weekStart&&ref<=weekEnd
  })
  const effBase=doneThisWeek.filter(t=>Number(t.hours)>0&&Number(t.hours_real)>0)
  const totalEst=effBase.reduce((s,t)=>s+Number(t.hours),0)
  const totalReal=effBase.reduce((s,t)=>s+Number(t.hours_real),0)
  const efic=totalReal>0?Math.min(999,Math.round(totalEst/totalReal*100)):null
  const streak=(()=>{
    const overdue=mine.filter(t=>t.status==="vencida"&&t.due_date)
    if(overdue.length===0){const oldest=mine.reduce((min,t)=>{const c=t.created_at?new Date(t.created_at):null;return c&&(!min||c<min)?c:min},null);if(!oldest)return 0;return Math.min(99,Math.floor((now-oldest)/(1000*60*60*24)))}
    const lastOverdue=overdue.reduce((max,t)=>{const d=new Date(t.due_date+"T00:00:00");return(!max||d>max)?d:max},null)
    if(!lastOverdue)return 0
    return Math.max(0,Math.min(99,Math.floor((now-lastOverdue)/(1000*60*60*24))))
  })()
  const activas=mine.filter(t=>!["completada"].includes(t.status)).length
  const enRevision=mine.filter(t=>t.status==="en_revision").length
  const vencidas=mine.filter(t=>t.status==="vencida").length
  const cheer=(()=>{
    if(doneThisWeek.length===0&&streak===0)return"Nueva semana, nuevas metas 💪"
    if(doneThisWeek.length>=5)return"¡Semana imparable! 🔥"
    if(efic!=null&&efic>=90)return"Excelente ritmo de trabajo ✨"
    if(streak>=7)return`${streak} días sin atrasos, ¡sigue así! 🎯`
    if(vencidas===0&&doneThisWeek.length>0)return"Buen avance, todo al día 👏"
    if(vencidas===0)return"Vas bien — sin vencidas esta semana 👏"
    return"Vamos a ponernos al día 💪"
  })()
  const Metric=({val,label,color,tip})=>(
    <div data-tip={tip||undefined} style={{textAlign:"center",padding:"12px 8px",background:"var(--bg3)",borderRadius:10,cursor:tip?"help":"default"}}>
      <div style={{fontSize:26,fontWeight:800,color,fontFamily:"var(--font-display)",lineHeight:1}}>{val}</div>
      <div style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)",marginTop:5,textTransform:"uppercase",letterSpacing:".06em"}}>{label}{tip&&<span style={{marginLeft:4,opacity:.5}}>ⓘ</span>}</div>
    </div>
  )
  // OpCount: ahora con hover visual más claro y fondo activo
  const OpCount=({val,label,color,onClick})=>(
    <button
      onClick={onClick}
      disabled={!onClick}
      style={{
        flex:1,textAlign:"center",padding:"8px 6px",borderRadius:8,
        cursor:onClick?"pointer":"default",transition:".13s",
        background:"transparent",border:"none",fontFamily:"inherit",color:"inherit"
      }}
      onMouseEnter={e=>{if(onClick)e.currentTarget.style.background="var(--bg3)"}}
      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      <span style={{fontSize:16,fontWeight:800,color,fontFamily:"var(--font-display)"}}>{val}</span>
      <span style={{fontSize:11,color:"var(--muted)",marginLeft:6}}>{label}</span>
      {onClick&&<span style={{fontSize:10,color:"var(--muted)",opacity:.4,marginLeft:4}}>→</span>}
    </button>
  )
  return(
    <div className="card fade-in" style={{marginBottom:20,background:"linear-gradient(135deg, rgba(232,197,71,.08), rgba(155,127,232,.06))",border:"1px solid rgba(232,197,71,.18)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <Av u={me} size={32}/>
          <div><h3 style={{fontSize:14,fontWeight:700}}>Tu semana</h3><p style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{cheer}</p></div>
        </div>
        <span style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)",background:"var(--bg3)",borderRadius:6,padding:"3px 8px"}}>
          {weekStart.toLocaleDateString("es-GT",{day:"2-digit",month:"short"})} – {weekEnd.toLocaleDateString("es-GT",{day:"2-digit",month:"short"})}
        </span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
        <Metric val={doneThisWeek.length} label="Completadas" color="var(--s-completada)" tip="Órdenes que terminaste esta semana (lunes a domingo)"/>
        <Metric val={efic==null?"—":efic+"%"} label="Eficiencia" color={efic==null?"var(--muted)":efic>=90?"var(--s-completada)":efic>=70?"var(--yellow)":"var(--accent)"} tip="Horas estimadas vs. horas reales. 100% = trabajaste justo lo previsto"/>
        <Metric val={`${streak}${streak>=7?" 🔥":""}`} label="Días sin atraso" color={streak>=7?"var(--accent)":"var(--text)"} tip="Días seguidos sin que se te venza ninguna tarea"/>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:4,marginTop:12,paddingTop:12,borderTop:"1px solid var(--border)"}}>
        <OpCount val={activas} label={activas===1?"activa":"activas"} color="var(--blue)" onClick={()=>onNavigate&&onNavigate("ordenes")}/>
        <div style={{width:1,height:24,background:"var(--border)"}}/>
        <OpCount val={enRevision} label="en revisión" color="var(--s-revision)" onClick={()=>onNavigate&&onNavigate("ordenes","en_revision")}/>
        <div style={{width:1,height:24,background:"var(--border)"}}/>
        <OpCount val={vencidas} label={vencidas===1?"vencida":"vencidas"} color={vencidas>0?"var(--s-vencida)":"var(--s-completada)"} onClick={()=>onNavigate&&onNavigate("ordenes","vencida")}/>
      </div>
    </div>
  )
}

function DailySignal({tasks,users,collabs,onNavigate,onOpenTask,onViewUser}){
  const now=new Date()
  const in48h=new Date(now.getTime()+48*3600000)
  const vencidas=tasks.filter(t=>t.status==="vencida")
  const dueSoon=tasks.filter(t=>{
    if(t.status==="completada"||t.status==="vencida")return false
    if(!t.due_date)return false
    const d=new Date(t.due_date+"T23:59:59")
    return d>=now&&d<=in48h
  }).sort((a,b)=>new Date(a.due_date)-new Date(b.due_date))
  const sobrecargados=collabs.map(u=>({u,n:tasks.filter(t=>{const a=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean);return a.includes(u.id)&&t.status!=="completada"}).length})).filter(x=>x.n>=7).sort((a,b)=>b.n-a.n)
  const hasVencidas=vencidas.length>0
  const hasDueSoon=dueSoon.length>0
  const hasSobre=sobrecargados.length>0
  const allClear=!hasVencidas&&!hasDueSoon&&!hasSobre
  const level=hasVencidas?"red":hasDueSoon?"yellow":hasSobre?"orange":"green"
  const levelStyles={
    red:{border:"rgba(232,93,93,.35)",bg:"rgba(232,93,93,.06)",dot:"var(--s-vencida)",label:"Requiere atención",labelColor:"#fca5a5"},
    yellow:{border:"rgba(232,197,71,.35)",bg:"rgba(232,197,71,.05)",dot:"var(--yellow)",label:"Atención esta semana",labelColor:"var(--yellow)"},
    orange:{border:"rgba(251,146,60,.35)",bg:"rgba(251,146,60,.05)",dot:"#fb923c",label:"Carga elevada",labelColor:"#fb923c"},
    green:{border:"rgba(46,196,160,.25)",bg:"rgba(46,196,160,.04)",dot:"var(--s-completada)",label:"Todo bajo control",labelColor:"var(--s-completada)"},
  }[level]
  const topItem=hasVencidas?vencidas[0]:hasDueSoon?dueSoon[0]:null

  // Órdenes sin marca — solo activas para no saturar con completadas viejas
  const sinMarca=tasks.filter(t=>(!t.marca||!t.marca.trim())&&t.status!=="completada")

  return(
    <div className="card fade-in" style={{marginBottom:16,padding:"14px 18px",border:`1px solid ${levelStyles.border}`,background:levelStyles.bg,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:levelStyles.dot,opacity:.9}}/>
      <div style={{display:"flex",alignItems:"center",gap:10,marginTop:2}}>
        <div style={{width:10,height:10,borderRadius:"50%",background:levelStyles.dot,boxShadow:`0 0 8px ${levelStyles.dot}`,flexShrink:0}}/>
        <div style={{flex:1,minWidth:0}}>
          {allClear?(
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:14,fontWeight:700,color:levelStyles.labelColor}}>Todo bajo control ✓</span>
              <span style={{fontSize:12,color:"var(--muted)"}}>Sin vencidas ni alertas hoy</span>
            </div>
          ):(
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <span style={{fontSize:13,fontWeight:700,color:levelStyles.labelColor}}>{levelStyles.label}</span>
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                {hasVencidas&&<button onClick={()=>onNavigate("ordenes","vencida")} style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:12,fontWeight:700,background:"rgba(232,93,93,.12)",border:"1px solid rgba(232,93,93,.25)",color:"var(--s-vencida)",borderRadius:6,padding:"3px 9px",cursor:"pointer",fontFamily:"var(--font-body)"}}><Icon n="vencida" size={11}/>{vencidas.length} vencida{vencidas.length>1?"s":""}</button>}
                {hasDueSoon&&<button onClick={()=>onNavigate("ordenes")} style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:12,fontWeight:700,background:"rgba(232,197,71,.1)",border:"1px solid rgba(232,197,71,.25)",color:"var(--yellow)",borderRadius:6,padding:"3px 9px",cursor:"pointer",fontFamily:"var(--font-body)"}}><Icon n="reloj" size={11}/>{dueSoon.length} vence{dueSoon.length>1?"n":""} en 48h</button>}
                {hasSobre&&<button onClick={()=>onNavigate("equipos")} style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:12,fontWeight:700,background:"rgba(251,146,60,.1)",border:"1px solid rgba(251,146,60,.25)",color:"#fb923c",borderRadius:6,padding:"3px 9px",cursor:"pointer",fontFamily:"var(--font-body)"}}><Icon n="equipos" size={11}/>{sobrecargados.length} sobrecargado{sobrecargados.length>1?"s":""}</button>}
              </div>
            </div>
          )}
        </div>
        {/* Badge sin marca — clickeable, navega a Órdenes */}
        {sinMarca.length>0&&(
          <button onClick={()=>onNavigate("ordenes")} style={{
            display:"inline-flex",alignItems:"center",gap:4,
            fontSize:12,fontWeight:700,
            background:"rgba(232,197,71,.1)",border:"1px solid rgba(232,197,71,.25)",
            color:"var(--yellow)",borderRadius:6,padding:"3px 9px",cursor:"pointer",
            fontFamily:"var(--font-body)",flexShrink:0
          }}>
            <Icon n="alerta" size={11}/>
            {sinMarca.length} sin marca →
          </button>
        )}
        {topItem&&(
          <div onClick={()=>onOpenTask&&onOpenTask(topItem)} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:7,background:"var(--bg3)",cursor:"pointer",border:"1px solid var(--border)",transition:".12s",maxWidth:240,flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.background="var(--bg4)"} onMouseLeave={e=>e.currentTarget.style.background="var(--bg3)"}>
            {topItem.order_number&&<span style={{fontSize:10,fontWeight:700,color:"var(--muted)",fontFamily:"var(--font-mono)",flexShrink:0}}>AC-{String(topItem.order_number).padStart(4,"0")}</span>}
            <span style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{topItem.title}</span>
            <span style={{fontSize:10,color:"var(--muted)",flexShrink:0}}>→</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function HomeView({tasks,users,teams,me,token,onRefresh,onNavigate,onOpenTask,onViewUser}){
  const isDir=me.role==="director"
  const isCuentas=me.role==="cuentas"
  const isCollab=me.role==="colaborador"
  const myTeamIds=isCuentas?(Array.isArray(me.team_ids)&&me.team_ids.length>0?me.team_ids:[me.team_id].filter(Boolean)):null
  const scopedTasks=isCuentas&&myTeamIds?tasks.filter(t=>myTeamIds.includes(t.team_id)):tasks
  const myTasks=tasks.filter(t=>{const a=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean);return a.includes(me.id)})
  const myActive=myTasks.filter(t=>!["completada"].includes(t.status))
  const myUrgent=myActive.filter(t=>t.priority==="Urgente"||t.status==="vencida")
  const allActive=scopedTasks.filter(t=>t.status!=="completada")
  const forReview=scopedTasks.filter(t=>t.status==="en_revision")
  const overdue=scopedTasks.filter(t=>t.status==="vencida")
  const onPause=scopedTasks.filter(t=>t.status==="en_pausa")
  const now=Date.now(),day7=7*24*3600000
  const completedThisWeek=scopedTasks.filter(t=>t.status==="completada"&&t.updated_at&&(now-new Date(t.updated_at).getTime())<day7).length
  const completedLastWeek=scopedTasks.filter(t=>t.status==="completada"&&t.updated_at&&(now-new Date(t.updated_at).getTime())<day7*2&&(now-new Date(t.updated_at).getTime())>=day7).length
  const trend=completedLastWeek===0?null:Math.round(((completedThisWeek-completedLastWeek)/completedLastWeek)*100)
  const collabs=users.filter(u=>{
    if(u.role!=="colaborador")return false
    if(!isCuentas||!myTeamIds)return true
    return myTeamIds.includes(u.team_id)||(Array.isArray(u.team_ids)&&u.team_ids.some(id=>myTeamIds.includes(id)))
  })
  const workload=collabs.map(u=>({
    ...u,
    active:scopedTasks.filter(t=>{const a=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean);return a.includes(u.id)&&t.status!=="completada"}).length,
    overdue:scopedTasks.filter(t=>{const a=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean);return a.includes(u.id)&&t.status==="vencida"}).length,
    done:scopedTasks.filter(t=>{const a=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean);return a.includes(u.id)&&t.status==="completada"}).length,
  })).sort((a,b)=>b.active-a.active)
  const maxLoad=Math.max(...workload.map(w=>w.active),1)

  return(
    <div className="fade-in">
      {/* ── TIP BANNER — visible para todos los roles, una sola vez ── */}
      <TipBanner/>

      {/* ════════ COLLABORATOR VIEW ════════ */}
      {isCollab&&(
        <>
          <div style={{marginBottom:20}}>
            <h2 style={{fontSize:20,fontWeight:700,marginBottom:4}}>{(()=>{const h=new Date().getHours();return(h<12?"Buenos días":h<18?"Buenas tardes":"Buenas noches")+", "+me.name.split(" ")[0]+" 👋"})()}</h2>
            <p style={{color:"var(--muted)",fontSize:14}}>Tienes {myActive.length} tarea{myActive.length!==1?"s":""} activa{myActive.length!==1?"s":""}</p>
          </div>
          <MyWeekCard me={me} tasks={myTasks} onNavigate={onNavigate}/>
          {myUrgent.length>0&&(
            <div style={{background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.2)",borderRadius:14,padding:16,marginBottom:16}}>
              <p style={{fontSize:13,fontWeight:700,color:"#fca5a5",marginBottom:10}}><Icon n="vencida" size={13} style={{marginRight:4}}/> Requieren atención inmediata</p>
              {myUrgent.slice(0,3).map(t=>(
                <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 8px",borderBottom:"1px solid rgba(239,68,68,.1)",cursor:"pointer",borderRadius:6,transition:".12s"}} onClick={()=>onOpenTask&&onOpenTask(t)} onMouseEnter={e=>e.currentTarget.style.background="rgba(239,68,68,.06)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  {t.order_number&&<span style={{fontSize:11,color:"#fca5a5",fontWeight:700}}>#{String(t.order_number).padStart(4,"0")}</span>}
                  <span style={{flex:1,fontSize:13}}>{t.title}</span>
                  {(()=>{const dr=fmtDateRelative(t.due_date,t.status);return<span style={{color:dr.color,fontWeight:700,fontSize:11}}>{dr.label}</span>})()}
                </div>
              ))}
            </div>
          )}
          <div>
            <h3 style={{fontSize:15,fontWeight:700,marginBottom:12}}>Mis tareas activas</h3>
            {myActive.length===0
              ?<div className="empty"><div style={{fontSize:36,opacity:.4}}>🎉</div><p>Sin tareas pendientes</p><p style={{fontSize:12,color:"var(--muted)",marginTop:6}}>Cuando te asignen una orden nueva, aparecerá aquí.</p></div>
              :myActive.map(t=>{
                const team=teams.find(x=>x.id===t.team_id),dr=fmtDateRelative(t.due_date,t.status)
                return(
                  <div key={t.id} className="task-card fade-in" style={{cursor:"pointer",borderLeft:`3px solid ${statusColor[t.status]||"var(--border2)"}`,marginBottom:8}} onClick={()=>onOpenTask&&onOpenTask(t)}>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      {t.order_number&&<span style={{fontSize:11,fontWeight:700,color:"var(--accent)",minWidth:45,fontFamily:"var(--font-mono)"}}>AC-{String(t.order_number).padStart(4,"0")}</span>}
                      <div style={{flex:1}}><p style={{fontSize:13,fontWeight:600,marginBottom:2}}>{t.title}</p><p style={{fontSize:11,color:"var(--muted)"}}>{team?.name} · <span style={{color:dr.color,fontWeight:dr.urgent?700:400}}>{dr.label}</span></p></div>
                      <span className={`pill ${statusPill[t.status]||"pill-gray"}`}>{statusLabel[t.status]}</span>
                    </div>
                  </div>
                )
              })
            }
          </div>
        </>
      )}

      {/* ════════ DIRECTOR / CUENTAS VIEW ════════ */}
      {(isDir||isCuentas)&&(
        <>
          <div style={{marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4,flexWrap:"wrap",gap:8}}>
              <h2 style={{fontSize:20,fontWeight:700}}>{(()=>{const h=new Date().getHours();return(h<12?"Buenos días":h<18?"Buenas tardes":"Buenas noches")+", "+me.name.split(" ")[0]})()}</h2>
              <p style={{color:"var(--muted)",fontSize:12,fontFamily:"var(--font-mono)"}}>{new Date().toLocaleDateString("es-GT",{weekday:"long",day:"numeric",month:"long"})}</p>
            </div>
          </div>
          {isDir&&<DailySignal tasks={scopedTasks} users={users} collabs={collabs} onNavigate={onNavigate} onOpenTask={onOpenTask} onViewUser={onViewUser}/>}
          <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
            {(isDir||isCuentas)&&<button className="quick-action" onClick={()=>onNavigate("crear")}><div className="quick-action-icon" style={{background:"var(--accent-dim)"}}><Icon n="nueva" size={18} color="var(--accent)"/></div><span style={{fontSize:11,fontWeight:600}}>Nueva orden</span></button>}
            <button className="quick-action" onClick={()=>onNavigate("ordenes")}><div className="quick-action-icon" style={{background:"rgba(77,157,224,.12)"}}><Icon n="ordenes" size={18} color="var(--s-progreso)"/></div><span style={{fontSize:11,fontWeight:600}}>Todas las órdenes</span></button>
            <button className="quick-action" onClick={()=>onNavigate("ordenes","vencida")} style={{borderColor:overdue.length>0?"rgba(232,93,93,.3)":"var(--border)"}}>
              <div className="quick-action-icon" style={{background:"rgba(232,93,93,.1)",position:"relative"}}><Icon n="vencida" size={18} color="var(--s-vencida)"/>{overdue.length>0&&<span style={{position:"absolute",top:-4,right:-4,background:"var(--s-vencida)",color:"#fff",fontSize:9,fontWeight:700,borderRadius:"50%",width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center"}}>{overdue.length}</span>}</div>
              <span style={{fontSize:11,fontWeight:600,color:overdue.length>0?"var(--s-vencida)":"inherit"}}>Vencidas{overdue.length>0?` (${overdue.length})`:""}</span>
            </button>
            <button className="quick-action" onClick={()=>onNavigate("equipos")}><div className="quick-action-icon" style={{background:"rgba(46,196,160,.12)"}}><Icon n="equipos" size={18} color="var(--s-completada)"/></div><span style={{fontSize:11,fontWeight:600}}>Equipos</span></button>
            {isDir&&<button className="quick-action" onClick={()=>onNavigate("desempeno")}><div className="quick-action-icon" style={{background:"rgba(155,127,232,.12)"}}><Icon n="desempeno" size={18} color="var(--s-revision)"/></div><span style={{fontSize:11,fontWeight:600}}>Desempeño</span></button>}
          </div>

          {/* ──────────────── BARRA DE STATS — ahora con botones <button> que tienen hover real ──────────────── */}
          <div className="card" style={{marginBottom:16,padding:"12px 18px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:16}}>
              <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
                {/* Activas — hero */}
                <button onClick={()=>onNavigate("ordenes")} style={{
                  display:"flex",alignItems:"baseline",gap:8,
                  background:"transparent",border:"none",cursor:"pointer",padding:"6px 10px",borderRadius:8,
                  transition:".13s",fontFamily:"inherit",color:"inherit"
                }}
                  onMouseEnter={e=>{e.currentTarget.style.background="var(--bg3)";e.currentTarget.style.transform="translateY(-1px)"}}
                  onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.transform="translateY(0)"}}>
                  <span style={{fontSize:34,fontWeight:800,lineHeight:1,fontFamily:"var(--font-display)",letterSpacing:"-.03em",color:"var(--text)"}}>{allActive.length}</span>
                  <span style={{fontSize:11,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".1em",fontFamily:"var(--font-mono)"}}>activas</span>
                </button>

                <div style={{width:1,height:32,background:"var(--border)"}}/>

                {/* En revisión */}
                <StatCard val={forReview.length} label="en revisión" color="var(--s-revision)" onClick={()=>onNavigate("ordenes","en_revision")}/>

                {/* Vencidas */}
                <StatCard val={overdue.length} label="vencidas" color={overdue.length>0?"var(--s-vencida)":"var(--s-completada)"} onClick={()=>onNavigate("ordenes","vencida")}/>

                {/* En pausa — solo si hay */}
                {onPause.length>0&&<StatCard val={onPause.length} label="en pausa" color="var(--s-pausa)" onClick={()=>onNavigate("ordenes","en_pausa")}/>}

                {/* Tendencia — NO clickeable, solo informativa. Sin cursor pointer. */}
                <div style={{textAlign:"center",padding:"4px 10px"}}>
                  <div style={{fontSize:22,fontWeight:800,color:trend===null?"var(--muted)":trend>=0?"var(--green)":"var(--red)",fontFamily:"var(--font-display)",lineHeight:1}}>{trend===null?"—":`${trend>=0?"+":""}${trend}%`}</div>
                  <div style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)",marginTop:3,textTransform:"uppercase",letterSpacing:".05em"}}>tendencia</div>
                </div>
              </div>
              <button onClick={()=>onNavigate("ordenes")} style={{fontSize:11,color:"var(--accent)",background:"var(--accent-dim)",border:"1px solid rgba(232,197,71,.2)",padding:"6px 14px",borderRadius:6,cursor:"pointer",fontFamily:"var(--font-body)",fontWeight:700}}>Ver todas →</button>
            </div>
          </div>

          {isCuentas&&(()=>{
            const byBrand={}
            scopedTasks.forEach(t=>{
              const marca=t.marca||"Sin marca"
              if(!byBrand[marca])byBrand[marca]={marca,activas:0,revision:0,vencidas:0,memberIds:new Set()}
              const g=byBrand[marca]
              if(t.status!=="completada"){g.activas++;const a=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean);a.forEach(id=>g.memberIds.add(id))}
              if(t.status==="en_revision")g.revision++
              if(t.status==="vencida")g.vencidas++
            })
            const brands=Object.values(byBrand).filter(b=>b.activas>0).sort((a,b)=>(b.vencidas-a.vencidas)||(b.activas-a.activas))
            if(brands.length===0)return null
            return(
              <div className="card fade-in" style={{marginBottom:16}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                  <h3 style={{fontSize:15,fontWeight:700}}><Icon n="marca" size={14} style={{marginRight:6}}/>Mis marcas</h3>
                  <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{brands.length} con trabajo activo</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:10}}>
                  {brands.map(b=>{
                    const members=[...b.memberIds].map(id=>users.find(u=>u.id===id)).filter(Boolean)
                    const hasAlert=b.vencidas>0
                    return(
                      <div key={b.marca} onClick={()=>onNavigate&&onNavigate("ordenes")}
                        style={{padding:"12px 14px",background:"var(--bg3)",borderRadius:10,border:`1px solid ${hasAlert?"rgba(232,93,93,.35)":"var(--border)"}`,cursor:"pointer",transition:".13s",position:"relative",overflow:"hidden"}}
                        onMouseEnter={e=>e.currentTarget.style.background="var(--bg4)"} onMouseLeave={e=>e.currentTarget.style.background="var(--bg3)"}>
                        {hasAlert&&<div style={{position:"absolute",top:0,left:0,right:0,height:3,background:"var(--s-vencida)",opacity:.8}}/>}
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,marginTop:2}}>
                          <span style={{fontSize:14,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.marca}</span>
                          <span style={{fontSize:18,fontWeight:800,color:"var(--text)",fontFamily:"var(--font-display)",lineHeight:1}}>{b.activas}</span>
                        </div>
                        <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
                          {b.revision>0&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:4,background:"var(--s-revision-bg)",color:"var(--s-revision)",fontWeight:700,fontFamily:"var(--font-mono)"}}><Icon n="revision" size={9}/> {b.revision} en revisión</span>}
                          {b.vencidas>0&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:4,background:"var(--s-vencida-bg)",color:"var(--s-vencida)",fontWeight:700,fontFamily:"var(--font-mono)"}}><Icon n="alerta" size={9}/> {b.vencidas} vencida{b.vencidas>1?"s":""}</span>}
                          {b.revision===0&&b.vencidas===0&&<span style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>Todo al día ✓</span>}
                        </div>
                        <div style={{display:"flex",alignItems:"center"}}>
                          {members.slice(0,5).map((m,i)=>(<div key={m.id} title={m.name} style={{width:22,height:22,borderRadius:"50%",background:m.avatar_color,fontSize:9,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,border:"2px solid var(--bg3)",marginLeft:i>0?-6:0}}>{m.initials}</div>))}
                          {members.length>5&&<span style={{fontSize:10,color:"var(--muted)",marginLeft:4,fontFamily:"var(--font-mono)"}}>+{members.length-5}</span>}
                          {members.length===0&&<span style={{fontSize:10,color:"var(--muted)",fontStyle:"italic"}}>Sin asignar</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12,marginBottom:14}}>
            <div className="card">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}><h3 style={{fontSize:15,fontWeight:700}}><Icon n="revision" size={14} style={{marginRight:6}}/>Cola de revisión</h3><span style={{fontSize:12,color:"var(--muted)"}}>{forReview.length}</span></div>
              {forReview.length===0?<p style={{fontSize:13,color:"var(--muted)",textAlign:"center",padding:16}}>Sin tareas en revisión</p>
                :forReview.slice(0,5).map(t=>{const u=users.find(x=>x.id===(Array.isArray(t.assigned_to)?t.assigned_to[0]:t.assigned_to));return(
                  <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid var(--border)",cursor:"pointer",borderRadius:5,transition:".12s"}} onClick={()=>onOpenTask&&onOpenTask(t)} onMouseEnter={e=>e.currentTarget.style.background="var(--bg3)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    {t.order_number&&<span style={{fontSize:11,fontWeight:700,color:"var(--accent)",minWidth:40,fontFamily:"var(--font-mono)"}}>{"AC-"+String(t.order_number).padStart(4,"0")}</span>}
                    <div style={{flex:1,minWidth:0}}><p style={{fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.title}</p><p style={{fontSize:11,color:"var(--muted)"}}>{u?.name||"—"}</p></div>
                    <span style={{fontSize:11,color:"var(--accent)",opacity:.6}}>→</span>
                  </div>
                )})}
              {forReview.length>5&&<button onClick={()=>onNavigate("ordenes")} style={{width:"100%",marginTop:10,padding:"7px",background:"transparent",border:"1px solid var(--border)",borderRadius:6,color:"var(--muted2)",fontSize:12,cursor:"pointer",fontFamily:"var(--font-body)"}}>Ver {forReview.length-5} más →</button>}
            </div>
            <div className="card" style={{borderColor:overdue.length>0?"rgba(239,68,68,.3)":"var(--border)"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}><h3 style={{fontSize:15,fontWeight:700,color:overdue.length>0?"#fca5a5":"var(--text)"}}><Icon n="vencida" size={14} style={{marginRight:6}}/> Vencidas</h3><span style={{fontSize:12,color:"var(--muted)"}}>{overdue.length}</span></div>
              {overdue.length===0?<p style={{fontSize:13,color:"var(--green)",textAlign:"center",padding:16}}>✓ Todo al día</p>
                :overdue.slice(0,5).map(t=>{const u=users.find(x=>x.id===(Array.isArray(t.assigned_to)?t.assigned_to[0]:t.assigned_to));const days=Math.ceil((new Date()-new Date(t.due_date+"T00:00:00"))/(1000*60*60*24));return(
                  <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid rgba(240,107,107,.1)",cursor:"pointer",borderRadius:5,transition:".12s"}} onClick={()=>onOpenTask&&onOpenTask(t)} onMouseEnter={e=>e.currentTarget.style.background="rgba(240,107,107,.04)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    {t.order_number&&<span style={{fontSize:11,fontWeight:700,color:"var(--red)",minWidth:40,fontFamily:"var(--font-mono)"}}>{"AC-"+String(t.order_number).padStart(4,"0")}</span>}
                    <div style={{flex:1,minWidth:0}}><p style={{fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.title}</p><p style={{fontSize:11,color:"var(--muted)"}}>{u?.name||"—"}</p></div>
                    <span style={{fontSize:11,background:"rgba(240,107,107,.12)",color:"var(--red)",fontWeight:700,flexShrink:0,padding:"2px 7px",borderRadius:4}}>{days}d tarde</span>
                  </div>
                )})}
              {overdue.length>0&&<button onClick={()=>onNavigate("ordenes")} style={{width:"100%",marginTop:10,padding:"7px",background:"rgba(240,107,107,.08)",border:"1px solid rgba(240,107,107,.2)",borderRadius:6,color:"var(--red)",fontSize:12,cursor:"pointer",fontFamily:"var(--font-body)",fontWeight:600}}>Ver todas las vencidas →</button>}
            </div>
          </div>
          {isDir&&(
            <div className="card" style={{marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <div><h3 style={{fontSize:15,fontWeight:700}}><Icon n="semaforo" size={14} style={{marginRight:6}}/>Semáforo de equipos</h3><p style={{fontSize:11,color:"var(--muted)",marginTop:2,fontFamily:"var(--font-mono)"}}><span style={{color:"var(--s-completada)"}}>●</span> Libre · <span style={{color:"var(--yellow)"}}>●</span> Cargado ≥4/pers · <span style={{color:"var(--s-vencida)"}}>●</span> Urgente o sobrecarga ≥7/pers</p></div>
                <button onClick={()=>onNavigate("admin")} style={{display:"flex",alignItems:"center",gap:5,background:"var(--accent-dim)",border:"1px solid rgba(232,197,71,.2)",color:"var(--accent)",fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:6,cursor:"pointer",fontFamily:"var(--font-body)"}}>+ Nuevo equipo</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10}}>
                {teams.map(team=>{
                  const members=users.filter(u=>(u.team_id===team.id||(Array.isArray(u.team_ids)&&u.team_ids.includes(team.id)))&&u.role==="colaborador")
                  const teamTasks=tasks.filter(t=>t.team_id===team.id&&t.status!=="completada")
                  const teamOverdue=tasks.filter(t=>t.team_id===team.id&&t.status==="vencida").length
                  const overloaded=members.filter(u=>tasks.filter(x=>{const a=Array.isArray(x.assigned_to)?x.assigned_to:[x.assigned_to].filter(Boolean);return a.includes(u.id)&&x.status!=="completada"}).length>=7).length
                  const avgLoad=members.length>0?teamTasks.length/members.length:0
                  const health=teamOverdue>0||overloaded>0?"red":avgLoad>=4?"yellow":"green"
                  const healthColor={red:"var(--load-crit)",yellow:"var(--load-warn)",green:"var(--load-ok)"}[health]
                  const healthLabel={red:teamOverdue>0?`${teamOverdue} vencida${teamOverdue>1?"s":""}`:overloaded>0?`${overloaded} sobrecargado${overloaded>1?"s":""}`:"-",yellow:`~${Math.round(avgLoad*10)/10} tareas/persona`,green:members.length===0?"Sin miembros":"Al día"}[health]
                  // NUEVO: ahora pasa el team_id para filtrar órdenes por ese equipo
                  return(
                    <div key={team.id} onClick={()=>onNavigate("ordenes",{teamId:team.id})} className="team-semaph" style={{padding:"12px 14px",background:"var(--bg3)",borderRadius:10,border:`1px solid ${healthColor}55`,cursor:"pointer",position:"relative",overflow:"hidden"}}>
                      <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:healthColor,opacity:.8}}/>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,marginTop:2}}><div style={{width:9,height:9,borderRadius:"50%",background:healthColor,boxShadow:`0 0 8px ${healthColor}`,flexShrink:0}}/><span style={{fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{team.name}</span></div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--muted)",marginBottom:5}}><span><strong style={{color:"var(--text)",fontSize:13}}>{teamTasks.length}</strong> activas</span><span><strong style={{color:"var(--text)",fontSize:13}}>{members.length}</strong> miembros</span></div>
                      <div style={{fontSize:11,fontWeight:600,color:healthColor,fontFamily:"var(--font-mono)"}}>{healthLabel}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          <div className="card">
            <h3 style={{fontSize:15,fontWeight:700,marginBottom:14}}><Icon n="carga" size={14} style={{marginRight:6}}/>Carga de trabajo por colaborador</h3>
            {workload.length===0
              ?<div style={{textAlign:"center",padding:"20px 16px"}}>
                 <p style={{fontSize:13,color:"var(--muted)",marginBottom:8}}>Aún no hay colaboradores registrados.</p>
                 {isDir&&<button onClick={()=>onNavigate("admin")} style={{fontSize:12,color:"var(--accent)",background:"var(--accent-dim)",border:"1px solid rgba(232,197,71,.2)",padding:"6px 14px",borderRadius:6,cursor:"pointer",fontFamily:"var(--font-body)",fontWeight:600}}>Ir a Administración para invitar →</button>}
               </div>
              :workload.map(w=>{
                const team=teams.find(t=>t.id===w.team_id)
                const pct=Math.round((w.active/maxLoad)*100)
                const color=w.active>=7?"var(--s-vencida)":w.active>=4?"var(--load-warn)":(team?teamColor(team):"var(--s-completada)")
                return(
                  <div key={w.id} style={{display:"flex",alignItems:"center",gap:12,marginBottom:10,padding:"6px 8px",borderRadius:8,cursor:(isDir||isCuentas)?"pointer":"default",transition:".13s"}}
                    onClick={()=>{if((isDir||isCuentas)&&onViewUser)onViewUser(w)}}
                    onMouseEnter={e=>{if(isDir||isCuentas)e.currentTarget.style.background="var(--bg3)"}}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div className="avatar" style={{width:30,height:30,background:w.avatar_color,fontSize:11,color:"#fff",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,flexShrink:0}}>{w.initials}</div>
                    <div style={{minWidth:110,flexShrink:0}}><p style={{fontSize:12,fontWeight:600}}>{w.name}</p><p style={{fontSize:10,color:"var(--muted)"}}>{team?.name||"Sin equipo"}</p></div>
                    <div style={{flex:1,height:8,background:"var(--bg3)",borderRadius:4,overflow:"hidden"}}><div style={{width:pct+"%",height:"100%",background:color,borderRadius:4,transition:"width .5s"}}/></div>
                    <div style={{minWidth:60,textAlign:"right",flexShrink:0}}><span style={{fontSize:13,fontWeight:700,color}}>{w.active}</span><span style={{fontSize:11,color:"var(--muted)"}}> activas</span></div>
                    {w.overdue>0&&<span style={{fontSize:11,padding:"2px 6px",background:"rgba(239,68,68,.15)",color:"#fca5a5",borderRadius:999,flexShrink:0}}>{w.overdue} venc.</span>}
                    {(isDir||isCuentas)&&<span style={{fontSize:11,color:"var(--muted)",flexShrink:0,opacity:.5}}>→</span>}
                  </div>
                )
              })
            }
          </div>
        </>
      )}
    </div>
  )
}

/* ── CALENDAR VIEW COMPONENT ── */
