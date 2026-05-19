import{useState,useEffect,useRef,useCallback}from'react'
import ReactDOM from'react-dom'
import{sb,teamColor,COLLAB_COLORS,COLORS,MARCAS_PREDEFINIDAS,getInitials,autoColor}from'../lib/supabase'
import{showToast}from'../components/Toast'
import{showConfirm}from'../components/ConfirmDialog'
import Icon from'../components/Icon'
import{Av,SC,BackBtn,Linkify,ActiveTimer,StatusLegend}from'../components/Shared'
import{statusLabel,statusPill,statusColor,prioPill,fmtDate,fmtDateRelative,useSessionFilters}from'../lib/utils'
function ModalPortal({children}){const el=useRef(document.createElement("div"));useEffect(()=>{document.body.appendChild(el.current);return()=>document.body.removeChild(el.current)},[]);return ReactDOM.createPortal(children,el.current)}
export default function HomeView({tasks,users,teams,me,token,onRefresh,onNavigate,onOpenTask,onViewUser}){
  const isDir=me.role==="director"
  const isCuentas=me.role==="cuentas"
  const isCollab=me.role==="colaborador"

  // ── CUENTAS SCOPE ──
  const myTeamIds=isCuentas?(Array.isArray(me.team_ids)&&me.team_ids.length>0?me.team_ids:[me.team_id].filter(Boolean)):null
  const visibleTeams=isCuentas&&myTeamIds?teams.filter(t=>myTeamIds.includes(t.id)):teams
  // For cuentas: only show tasks from their teams
  const scopedTasks=isCuentas&&myTeamIds?tasks.filter(t=>myTeamIds.includes(t.team_id)):tasks

  const pendingApproval=scopedTasks.filter(t=>t.status==="en_revision")

  // My tasks — colaborador sees ONLY tasks assigned to them directly
  const myCollabTeamIds=Array.isArray(me.team_ids)&&me.team_ids.length>0?me.team_ids:(me.team_id?[me.team_id]:[])
  const myTasks=tasks.filter(t=>{
    const a=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean)
    return a.includes(me.id)
  })
  const myActive=myTasks.filter(t=>!["completada"].includes(t.status))
  const myUrgent=myActive.filter(t=>t.priority==="Urgente"||t.status==="vencida")

  // Global stats — scoped for cuentas
  const allActive=scopedTasks.filter(t=>t.status!=="completada")
  const forReview=scopedTasks.filter(t=>t.status==="en_revision")
  const overdue=scopedTasks.filter(t=>t.status==="vencida")
  const inProgress=scopedTasks.filter(t=>t.status==="en_progreso")
  const onPause=scopedTasks.filter(t=>t.status==="en_pausa")

  const now=Date.now(),day7=7*24*3600000
  const completedThisWeek=scopedTasks.filter(t=>t.status==="completada"&&t.updated_at&&(now-new Date(t.updated_at).getTime())<day7).length
  const completedLastWeek=scopedTasks.filter(t=>t.status==="completada"&&t.updated_at&&(now-new Date(t.updated_at).getTime())<day7*2&&(now-new Date(t.updated_at).getTime())>=day7).length
  const trend=completedLastWeek===0?null:Math.round(((completedThisWeek-completedLastWeek)/completedLastWeek)*100)

  // Workload — filter collabs by visible teams for cuentas
  const collabs=users.filter(u=>{
    if(u.role!=="colaborador")return false
    if(!isCuentas||!myTeamIds)return true
    return myTeamIds.includes(u.team_id)||(Array.isArray(u.team_ids)&&u.team_ids.some(id=>myTeamIds.includes(id)))
  })
  const workload=collabs.map(u=>({
    ...u,
    active:scopedTasks.filter(t=>{const a=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean);return a.includes(u.id)&&t.status!=="completada";}).length,
    overdue:scopedTasks.filter(t=>{const a=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean);return a.includes(u.id)&&t.status==="vencida";}).length,
    done:scopedTasks.filter(t=>{const a=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean);return a.includes(u.id)&&t.status==="completada";}).length,
  })).sort((a,b)=>b.active-a.active)
  const maxLoad=Math.max(...workload.map(w=>w.active),1)

  return(
    <div className="fade-in">
      {/* COLLABORATOR VIEW */}
      {isCollab&&(
        <>
          <div style={{marginBottom:20}}>
            <h2 style={{fontSize:20,fontWeight:700,marginBottom:4}}>{(()=>{const h=new Date().getHours();return(h<12?"Buenos días":h<18?"Buenas tardes":"Buenas noches")+", "+me.name.split(" ")[0]+" 👋";})()}</h2>
            <p style={{color:"var(--muted)",fontSize:14}}>Tienes {myActive.length} tarea{myActive.length!==1?"s":""} activa{myActive.length!==1?"s":""}</p>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:20}}>
            <button className="quick-action" onClick={()=>onNavigate("ordenes")}><div className="quick-action-icon" style={{background:"rgba(77,157,224,.12)"}}><Icon n="ordenes" size={18} color="var(--s-progreso)"/></div><span style={{fontSize:11,fontWeight:600}}>Mis órdenes</span></button>
            <button className="quick-action" onClick={()=>onNavigate("ordenes","en_revision")}><div className="quick-action-icon" style={{background:"rgba(155,127,232,.12)"}}><Icon n="revision" size={18} color="var(--s-revision)"/></div><span style={{fontSize:11,fontWeight:600}}>En revisión</span></button>
            {myCollabTeamIds.length>0&&<button className="quick-action" onClick={()=>onNavigate("equipo_"+myCollabTeamIds[0])}><div className="quick-action-icon" style={{background:"rgba(46,196,160,.12)"}}><Icon n="equipos" size={18} color="var(--s-completada)"/></div><span style={{fontSize:11,fontWeight:600}}>Mi equipo</span></button>}
          </div>
          <div className="stat-grid" style={{marginBottom:20}}>
            <div className="stat-card clickable" style={{"--ac":"var(--blue)"}} onClick={()=>onNavigate("ordenes")}><div className="stat-label">Mis tareas activas</div><div className="stat-value" style={{color:"var(--blue)"}}>{myActive.length}</div><div className="stat-sub">Ver todas →</div></div>
            <div className="stat-card clickable" style={{"--ac":"var(--red)"}} onClick={()=>onNavigate("ordenes","vencida")}><div className="stat-label">Urgentes / Vencidas</div><div className="stat-value" style={{color:myUrgent.length>0?"var(--red)":"var(--green)"}}>{myUrgent.length}</div><div className="stat-sub">{myUrgent.length>0?"Atención requerida →":"Todo al día ✓"}</div></div>
            <div className="stat-card clickable" style={{"--ac":"var(--green)"}} onClick={()=>onNavigate("ordenes","completada")}><div className="stat-label">Completadas</div><div className="stat-value" style={{color:"var(--green)"}}>{myTasks.filter(t=>t.status==="completada").length}</div><div className="stat-sub">Ver historial →</div></div>
          </div>
          {myUrgent.length>0&&(
            <div style={{background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.2)",borderRadius:14,padding:16,marginBottom:16}}>
              <p style={{fontSize:13,fontWeight:700,color:"#fca5a5",marginBottom:10}}><Icon n="vencida" size={13} style={{marginRight:4}}/> Requieren atención inmediata</p>
              {myUrgent.slice(0,3).map(t=>(
                <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 8px",borderBottom:"1px solid rgba(239,68,68,.1)",cursor:"pointer",borderRadius:6,transition:".12s"}} onClick={()=>onOpenTask&&onOpenTask(t)} onMouseEnter={e=>e.currentTarget.style.background="rgba(239,68,68,.06)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  {t.order_number&&<span style={{fontSize:11,color:"#fca5a5",fontWeight:700}}>#{String(t.order_number).padStart(4,"0")}</span>}
                  <span style={{flex:1,fontSize:13}}>{t.title}</span>
                  {(()=>{const dr=fmtDateRelative(t.due_date);return<span style={{color:dr.color,fontWeight:700,fontSize:11}}>{dr.label}</span>;})()}
                </div>
              ))}
            </div>
          )}
          <div>
            <h3 style={{fontSize:15,fontWeight:700,marginBottom:12}}>Mis tareas activas</h3>
            {myActive.length===0
              ?<div className="empty"><div style={{fontSize:36,opacity:.4}}>🎉</div><p>Sin tareas pendientes</p></div>
              :myActive.map(t=>{
                const team=teams.find(x=>x.id===t.team_id),dr=fmtDateRelative(t.due_date)
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

      {/* DIRECTOR/CUENTAS VIEW */}
      {isCuentas&&pendingApproval.length>0&&(
        <div className="card fade-in" style={{marginBottom:16,border:"1px solid var(--s-revision-bg)",background:"rgba(155,127,232,.05)"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <span style={{fontSize:16}}>🔍</span>
            <h3 style={{fontSize:15,fontWeight:700}}>Pendiente de aprobar</h3>
            <span style={{fontSize:11,color:"var(--s-revision)",fontFamily:"var(--font-mono)",background:"var(--s-revision-bg)",padding:"2px 8px",borderRadius:10,fontWeight:700}}>{pendingApproval.length}</span>
          </div>
          {pendingApproval.slice(0,4).map(t=>{
            const team=teams.find(x=>x.id===t.team_id)
            return(
              <div key={t.id} onClick={()=>onOpenTask&&onOpenTask(t)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid var(--border)",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="var(--bg3)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span style={{fontSize:11,fontWeight:700,color:"var(--accent)",fontFamily:"var(--font-mono)",minWidth:72}}>AC-{String(t.order_number||0).padStart(4,"0")}</span>
                <div style={{flex:1,minWidth:0}}><p style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.title}</p><p style={{fontSize:11,color:"var(--muted)"}}>{team?.name||"Sin equipo"}</p></div>
                <span style={{fontSize:11,color:"var(--s-revision)",fontWeight:600,flexShrink:0}}>Revisar →</span>
              </div>
            )
          })}
        </div>
      )}

      {(isDir||isCuentas)&&(
        <>
          <div style={{marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4,flexWrap:"wrap",gap:8}}>
              <h2 style={{fontSize:20,fontWeight:700}}>{(()=>{const h=new Date().getHours();return(h<12?"Buenos días":h<18?"Buenas tardes":"Buenas noches")+", "+me.name.split(" ")[0];})()}</h2>
              <p style={{color:"var(--muted)",fontSize:12,fontFamily:"var(--font-mono)"}}>{new Date().toLocaleDateString("es-GT",{weekday:"long",day:"numeric",month:"long"})}</p>
            </div>
          </div>

          <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
            {isDir&&<button className="quick-action" onClick={()=>onNavigate("crear")}><div className="quick-action-icon" style={{background:"var(--accent-dim)"}}><Icon n="nueva" size={18} color="var(--accent)"/></div><span style={{fontSize:11,fontWeight:600}}>Nueva orden</span></button>}
            {isCuentas&&<button className="quick-action" onClick={()=>onNavigate("crear")}><div className="quick-action-icon" style={{background:"var(--accent-dim)"}}><Icon n="nueva" size={18} color="var(--accent)"/></div><span style={{fontSize:11,fontWeight:600}}>Nueva orden</span></button>}
            <button className="quick-action" onClick={()=>onNavigate("ordenes")}><div className="quick-action-icon" style={{background:"rgba(77,157,224,.12)"}}><Icon n="ordenes" size={18} color="var(--s-progreso)"/></div><span style={{fontSize:11,fontWeight:600}}>Todas las órdenes</span></button>
            <button className="quick-action" onClick={()=>onNavigate("ordenes","vencida")} style={{borderColor:overdue.length>0?"rgba(232,93,93,.3)":"var(--border)"}}>
              <div className="quick-action-icon" style={{background:"rgba(232,93,93,.1)",position:"relative"}}><Icon n="vencida" size={18} color="var(--s-vencida)"/>{overdue.length>0&&<span style={{position:"absolute",top:-4,right:-4,background:"var(--s-vencida)",color:"#fff",fontSize:9,fontWeight:700,borderRadius:"50%",width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center"}}>{overdue.length}</span>}</div>
              <span style={{fontSize:11,fontWeight:600,color:overdue.length>0?"var(--s-vencida)":"inherit"}}>Vencidas{overdue.length>0?` (${overdue.length})`:""}</span>
            </button>
            <button className="quick-action" onClick={()=>onNavigate("equipos")}><div className="quick-action-icon" style={{background:"rgba(46,196,160,.12)"}}><Icon n="equipos" size={18} color="var(--s-completada)"/></div><span style={{fontSize:11,fontWeight:600}}>Equipos</span></button>
            {isDir&&<button className="quick-action" onClick={()=>onNavigate("desempeno")}><div className="quick-action-icon" style={{background:"rgba(155,127,232,.12)"}}><Icon n="desempeno" size={18} color="var(--s-revision)"/></div><span style={{fontSize:11,fontWeight:600}}>Desempeño</span></button>}
          </div>

          {/* HERO: stacked bar por equipo */}
          {(()=>{
            const teamData=visibleTeams.map(t=>({...t,color:teamColor(t),count:allActive.filter(x=>x.team_id===t.id).length})).filter(t=>t.count>0).sort((a,b)=>b.count-a.count)
            const noTeam=allActive.filter(x=>!x.team_id).length
            if(noTeam>0&&isDir)teamData.push({id:"none",name:"Sin equipo",color:"#555",count:noTeam})
            const total=allActive.length,totalForPct=Math.max(total,1)
            return(
              <div className="card" style={{marginBottom:16,padding:"18px 22px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,gap:12,flexWrap:"wrap"}}>
                  <div style={{display:"flex",alignItems:"baseline",gap:14}}>
                    <div style={{display:"flex",alignItems:"baseline",gap:8}}>
                      <span style={{fontSize:42,fontWeight:800,lineHeight:1,fontFamily:"var(--font-display)",letterSpacing:"-.04em",color:"var(--text)"}}>{total}</span>
                      <span style={{fontSize:11,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".12em",fontFamily:"var(--font-mono)"}}>tareas activas</span>
                    </div>
                    <div style={{display:"flex",gap:10,fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>
                      <span style={{color:"var(--s-progreso)"}}><Icon n="progreso" size={11} style={{marginRight:3}}/>{inProgress.length}</span>
                      <span style={{color:"var(--s-revision)"}}>🔍 {forReview.length}</span>
                      {onPause.length>0&&<span style={{color:"var(--s-pausa)"}}><Icon n="pausa" size={11} style={{marginRight:3}}/>{onPause.length}</span>}
                    </div>
                  </div>
                  <button onClick={()=>onNavigate("ordenes")} style={{fontSize:11,color:"var(--accent)",background:"var(--accent-dim)",border:"1px solid rgba(232,197,71,.2)",padding:"5px 12px",borderRadius:6,cursor:"pointer",fontFamily:"var(--font-body)",fontWeight:700}}>Ver todas →</button>
                </div>
                {teamData.length===0
                  ?<div style={{padding:20,textAlign:"center",color:"var(--muted)",fontSize:13}}>Sin tareas activas 🎉</div>
                  :<>
                    <div style={{display:"flex",height:38,borderRadius:6,overflow:"hidden",background:"var(--bg3)",marginBottom:10}}>
                      {teamData.map((s,i)=>{
                        const w=(s.count/totalForPct)*100
                        return(
                          <div key={s.id} onClick={()=>s.id!=="none"&&onNavigate("equipo_"+s.id)} title={`${s.name} · ${s.count} tareas · ${Math.round(w)}%`}
                            style={{width:`${w}%`,background:s.color,cursor:s.id!=="none"?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",borderRight:i<teamData.length-1?"2px solid var(--bg2)":"none",transition:"all .2s"}}
                            onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.15)"} onMouseLeave={e=>e.currentTarget.style.filter="brightness(1)"}>
                            {w>=8&&<span style={{fontSize:13,fontWeight:800,color:"#0d0d0d",fontFamily:"var(--font-display)"}}>{s.count}</span>}
                          </div>
                        )
                      })}
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:6}}>
                      {teamData.map(s=>(
                        <div key={s.id} onClick={()=>s.id!=="none"&&onNavigate("equipo_"+s.id)} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 8px",borderRadius:5,cursor:s.id!=="none"?"pointer":"default",transition:".13s"}} onMouseEnter={e=>{if(s.id!=="none")e.currentTarget.style.background="var(--bg3)"}} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                          <div style={{width:8,height:8,borderRadius:2,background:s.color,flexShrink:0}}/>
                          <span style={{fontSize:11.5,color:"var(--muted2)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{s.name}</span>
                          <span style={{fontSize:11,fontWeight:700,color:s.color,fontFamily:"var(--font-mono)"}}>{s.count}</span>
                          <span style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)",minWidth:28,textAlign:"right"}}>{Math.round(s.count/totalForPct*100)}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                }
              </div>
            )
          })()}

          <div className="stat-grid" style={{marginBottom:20,gridTemplateColumns:"repeat(3,1fr)"}}>
            <div className="stat-card clickable" style={{"--ac":"var(--s-revision)"}} onClick={()=>onNavigate("ordenes","en_revision")}><div className="stat-label">En revisión</div><div className="stat-value" style={{color:"var(--s-revision)"}}>{forReview.length}</div><div className="stat-sub">Esperando aprobación →</div></div>
            <div className="stat-card clickable" style={{"--ac":overdue.length>0?"var(--s-vencida)":"var(--s-completada)"}} onClick={()=>onNavigate("ordenes","vencida")}><div className="stat-label">Vencidas</div><div className="stat-value" style={{color:overdue.length>0?"var(--s-vencida)":"var(--s-completada)"}}>{overdue.length}</div><div className="stat-sub">{overdue.length===0?"Todo al día ✓":"Requieren atención →"}</div></div>
            <div className="stat-card clickable" style={{"--ac":"var(--s-completada)"}} onClick={()=>onNavigate("ordenes","completada")}><div className="stat-label">Completadas</div><div className="stat-value" style={{color:"var(--s-completada)"}}>{scopedTasks.filter(t=>t.status==="completada").length}</div><div className="stat-sub">Este período →</div></div>
            <div className="stat-card fade-in" style={{"--ac":"var(--yellow)"}}><div className="stat-label">Tendencia semanal</div><div className="stat-value" style={{color:trend===null?"var(--muted)":trend>=0?"var(--green)":"var(--red)",fontSize:22}}>{trend===null?"—":`${trend>=0?"+":""}${trend}%`}</div><div className="stat-sub">{completedThisWeek} esta semana{completedLastWeek>0?` vs ${completedLastWeek} anterior`:""}</div></div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12,marginBottom:14}}>
            <div className="card">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}><h3 style={{fontSize:15,fontWeight:700}}>🔍 Cola de revisión</h3><span style={{fontSize:12,color:"var(--muted)"}}>{forReview.length}</span></div>
              {forReview.length===0
                ?<p style={{fontSize:13,color:"var(--muted)",textAlign:"center",padding:16}}>Sin tareas en revisión</p>
                :forReview.slice(0,5).map(t=>{
                  const u=users.find(x=>x.id===(Array.isArray(t.assigned_to)?t.assigned_to[0]:t.assigned_to))
                  return(
                    <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid var(--border)",cursor:"pointer",borderRadius:5,transition:".12s"}} onClick={()=>onOpenTask&&onOpenTask(t)} onMouseEnter={e=>e.currentTarget.style.background="var(--bg3)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      {t.order_number&&<span style={{fontSize:11,fontWeight:700,color:"var(--accent)",minWidth:40,fontFamily:"var(--font-mono)"}}>{"AC-"+String(t.order_number).padStart(4,"0")}</span>}
                      <div style={{flex:1,minWidth:0}}><p style={{fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.title}</p><p style={{fontSize:11,color:"var(--muted)"}}>{u?.name||"—"}</p></div>
                      <span style={{fontSize:11,color:"var(--accent)",opacity:.6}}>→</span>
                    </div>
                  )
                })
              }
              {forReview.length>5&&<button onClick={()=>onNavigate("ordenes")} style={{width:"100%",marginTop:10,padding:"7px",background:"transparent",border:"1px solid var(--border)",borderRadius:6,color:"var(--muted2)",fontSize:12,cursor:"pointer",fontFamily:"var(--font-body)"}}>Ver {forReview.length-5} más →</button>}
            </div>

            <div className="card" style={{borderColor:overdue.length>0?"rgba(239,68,68,.3)":"var(--border)"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}><h3 style={{fontSize:15,fontWeight:700,color:overdue.length>0?"#fca5a5":"var(--text)"}}><Icon n="vencida" size={14} style={{marginRight:6}}/> Vencidas</h3><span style={{fontSize:12,color:"var(--muted)"}}>{overdue.length}</span></div>
              {overdue.length===0
                ?<p style={{fontSize:13,color:"var(--green)",textAlign:"center",padding:16}}>✓ Todo al día</p>
                :overdue.slice(0,5).map(t=>{
                  const u=users.find(x=>x.id===(Array.isArray(t.assigned_to)?t.assigned_to[0]:t.assigned_to))
                  const days=Math.ceil((new Date()-new Date(t.due_date+"T00:00:00"))/(1000*60*60*24))
                  return(
                    <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid rgba(240,107,107,.1)",cursor:"pointer",borderRadius:5,transition:".12s"}} onClick={()=>onOpenTask&&onOpenTask(t)} onMouseEnter={e=>e.currentTarget.style.background="rgba(240,107,107,.04)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      {t.order_number&&<span style={{fontSize:11,fontWeight:700,color:"var(--red)",minWidth:40,fontFamily:"var(--font-mono)"}}>{"AC-"+String(t.order_number).padStart(4,"0")}</span>}
                      <div style={{flex:1,minWidth:0}}><p style={{fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.title}</p><p style={{fontSize:11,color:"var(--muted)"}}>{u?.name||"—"}</p></div>
                      <span style={{fontSize:11,background:"rgba(240,107,107,.12)",color:"var(--red)",fontWeight:700,flexShrink:0,padding:"2px 7px",borderRadius:4}}>{days}d tarde</span>
                    </div>
                  )
                })
              }
              {overdue.length>0&&<button onClick={()=>onNavigate("ordenes")} style={{width:"100%",marginTop:10,padding:"7px",background:"rgba(240,107,107,.08)",border:"1px solid rgba(240,107,107,.2)",borderRadius:6,color:"var(--red)",fontSize:12,cursor:"pointer",fontFamily:"var(--font-body)",fontWeight:600}}>Ver todas las vencidas →</button>}
            </div>
          </div>

          {isDir&&(
            <div className="card" style={{marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <div><h3 style={{fontSize:15,fontWeight:700}}>🚦 Semáforo de equipos</h3><p style={{fontSize:11,color:"var(--muted)",marginTop:2,fontFamily:"var(--font-mono)"}}>🟢 Libre · 🟡 Cargado ≥4/pers · 🔴 Urgente o sobrecarga ≥7/pers</p></div>
                <button onClick={()=>onNavigate("admin")} style={{display:"flex",alignItems:"center",gap:5,background:"var(--accent-dim)",border:"1px solid rgba(232,197,71,.2)",color:"var(--accent)",fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:6,cursor:"pointer",fontFamily:"var(--font-body)"}}>+ Nuevo equipo</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10}}>
                {teams.map(team=>{
                  const members=users.filter(u=>(u.team_id===team.id||(Array.isArray(u.team_ids)&&u.team_ids.includes(team.id)))&&u.role==="colaborador")
                  const teamTasks=tasks.filter(t=>t.team_id===team.id&&t.status!=="completada")
                  const teamOverdue=tasks.filter(t=>t.team_id===team.id&&t.status==="vencida").length
                  const overloaded=members.filter(u=>tasks.filter(x=>{const a=Array.isArray(x.assigned_to)?x.assigned_to:[x.assigned_to].filter(Boolean);return a.includes(u.id)&&x.status!=="completada";}).length>=7).length
                  const avgLoad=members.length>0?teamTasks.length/members.length:0
                  const health=teamOverdue>0||overloaded>0?"red":avgLoad>=4?"yellow":"green"
                  const healthColor={red:"var(--load-crit)",yellow:"var(--load-warn)",green:"var(--load-ok)"}[health]
                  const healthLabel={red:teamOverdue>0?`${teamOverdue} vencida${teamOverdue>1?"s":""}`:overloaded>0?`${overloaded} sobrecargado${overloaded>1?"s":""}`:"-",yellow:`~${Math.round(avgLoad*10)/10} tareas/persona`,green:members.length===0?"Sin miembros":"Al día"}[health]
                  return(
                    <div key={team.id} onClick={()=>onNavigate("equipo_"+team.id)} className="team-semaph" style={{padding:"12px 14px",background:"var(--bg3)",borderRadius:10,border:`1px solid ${healthColor}55`,cursor:"pointer",position:"relative",overflow:"hidden"}}>
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
            <h3 style={{fontSize:15,fontWeight:700,marginBottom:14}}>⚖️ Carga de trabajo por colaborador</h3>
            {workload.length===0
              ?<p style={{fontSize:13,color:"var(--muted)",textAlign:"center",padding:16}}>No hay colaboradores aún.</p>
              :workload.map(w=>{
                const team=teams.find(t=>t.id===w.team_id)
                const pct=Math.round((w.active/maxLoad)*100)
                const color=w.active>=7?"var(--s-vencida)":w.active>=4?"var(--load-warn)":(team?teamColor(team):"var(--s-completada)")
                return(
                  <div key={w.id} style={{display:"flex",alignItems:"center",gap:12,marginBottom:10,padding:"6px 8px",borderRadius:8,cursor:(isDir||isCuentas)?"pointer":"default",transition:".13s"}}
                    onClick={()=>{if((isDir||isCuentas)&&onViewUser)onViewUser(w)}}
                    onMouseEnter={e=>{if(isDir||isCuentas)e.currentTarget.style.background="var(--bg3)";}}
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
