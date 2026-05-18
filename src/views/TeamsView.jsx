import{useState,useEffect,useRef,useCallback}from'react'
import ReactDOM from'react-dom'
import{sb,teamColor,COLLAB_COLORS,COLORS,MARCAS_PREDEFINIDAS,getInitials,autoColor}from'../lib/supabase'
import{showToast}from'../components/Toast'
import{showConfirm}from'../components/ConfirmDialog'
import Icon from'../components/Icon'
import{Av,SC,BackBtn,Linkify,ActiveTimer,StatusLegend}from'../components/Shared'
import{statusLabel,statusPill,statusColor,prioPill,fmtDate,fmtDateRelative,useSessionFilters}from'../lib/utils'
function ModalPortal({children}){const el=useRef(document.createElement("div"));useEffect(()=>{document.body.appendChild(el.current);return()=>document.body.removeChild(el.current)},[]);return ReactDOM.createPortal(children,el.current)}
export default function TeamsView({tasks,users,teams,onBack,onViewUser,onOpenTask}){
  const [selectedTeam,setSelectedTeam]=useState("all");
  const [openMembers,setOpenMembers]=useState({}); // {userId: true}
  const filteredTeams=selectedTeam==="all"?teams:teams.filter(t=>t.id===selectedTeam);
  const toggleMember=(id)=>setOpenMembers(o=>({...o,[id]:!o[id]}));
  return(
    <div>
      {onBack&&<BackBtn onClick={onBack}/>}
      <div className="section-header"><h2 className="section-title">Equipos y carga de trabajo</h2></div>
      <div className="filter-bar" style={{marginBottom:16}}>
        <button className={`filter-chip${selectedTeam==="all"?" active":""}`} onClick={()=>setSelectedTeam("all")}>Todos</button>
        {teams.map(t=>{const tc=teamColor(t);return <button key={t.id} className={`filter-chip${selectedTeam===t.id?" active":""}`} style={selectedTeam===t.id?{background:tc,borderColor:tc,color:"#fff"}:{}} onClick={()=>setSelectedTeam(t.id)}>{<Icon n={t.icon||"equipos"} size={16}/>} {t.name}</button>;})}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(340px,1fr))",gap:16}}>
        {filteredTeams.map(team=>{
          const members=users.filter(u=>(u.team_id===team.id||(Array.isArray(u.team_ids)&&u.team_ids.includes(team.id)))&&u.role==="colaborador");
          const teamTasks=tasks.filter(t=>t.team_id===team.id&&t.status!=="completada");
          // Health for color dot
          const overdueCount=tasks.filter(t=>t.team_id===team.id&&t.status==="vencida").length;
          const overloaded=members.filter(u=>tasks.filter(x=>{const a=Array.isArray(x.assigned_to)?x.assigned_to:[x.assigned_to].filter(Boolean);return a.includes(u.id)&&x.status!=="completada";}).length>=7).length;
          const avgLoad=members.length>0?teamTasks.length/members.length:0;
          const health=overdueCount>0||overloaded>0?"var(--s-vencida)":avgLoad>=4?"var(--load-warn)":"var(--load-ok)";
          return(
            <div key={team.id} className="card fade-in">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:20}}>{<Icon n={team.icon||"equipos"} size={18} style={{display:"inline-block"}}/>}</span>
                  <div>
                    <h3 style={{fontSize:15,fontWeight:700}}>{team.name}</h3>
                    <p style={{fontSize:11,color:"var(--muted)",marginTop:1,fontFamily:"var(--font-mono)"}}>{members.length} miembros · {teamTasks.length} activas</p>
                  </div>
                </div>
                <div style={{width:10,height:10,borderRadius:"50%",background:health,boxShadow:`0 0 8px ${health}66`}}/>
              </div>
              {members.length===0&&<p style={{fontSize:13,color:"var(--muted)",textAlign:"center",padding:20}}>Sin miembros asignados</p>}
              {members.map(m=>{
                const mTasks=tasks.filter(t=>{const a=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean);return a.includes(m.id)&&t.status!=="completada";});
                const mOverdue=mTasks.filter(t=>t.status==="vencida").length;
                const pct=Math.min(100,Math.round(mTasks.length/8*100));
                const loadColor=mTasks.length>=7?"var(--s-vencida)":mTasks.length>=4?"var(--load-warn)":m.avatar_color;
                const isOpen=!!openMembers[m.id];
                return(
                  <div key={m.id} style={{marginBottom:8,background:"var(--bg3)",borderRadius:8,overflow:"hidden",border:"1px solid var(--border)"}}>
                    {/* Collaborator header — clickable to expand */}
                    <div onClick={()=>toggleMember(m.id)}
                      style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",cursor:"pointer",userSelect:"none",
                        borderLeft:`3px solid ${m.avatar_color}`,transition:".13s",
                        background:isOpen?"var(--bg4)":"transparent"}}>
                      <span style={{color:"var(--muted)",fontSize:11,transition:"transform .2s",display:"inline-block",transform:isOpen?"rotate(0)":"rotate(-90deg)",flexShrink:0}}>▼</span>
                      {/* Avatar — click goes to user's tasks */}
                      <div onClick={e=>{e.stopPropagation();onViewUser&&onViewUser(m);}}
                        style={{cursor:onViewUser?"pointer":"default"}}
                        title={onViewUser?"Ver perfil y todas sus tareas":""}>
                        <Av u={m} size={28}/>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                          <span style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</span>
                          {mOverdue>0&&<span style={{fontSize:10,padding:"1px 5px",borderRadius:3,background:"var(--s-vencida-bg)",color:"var(--s-vencida)",fontWeight:700,fontFamily:"var(--font-mono)"}}><Icon n="alerta" size={9}/>{mOverdue}</span>}
                        </div>
                      </div>
                      <span style={{fontSize:14,fontWeight:800,color:loadColor,fontFamily:"var(--font-display)",minWidth:24,textAlign:"right"}}>{mTasks.length}</span>
                      <span style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{mTasks.length===1?"tarea":"tareas"}</span>
                    </div>
                    {/* Load progress bar — always visible */}
                    <div style={{height:2,background:"var(--bg2)",overflow:"hidden"}}>
                      <div style={{width:`${pct}%`,height:"100%",background:loadColor,transition:"width .6s cubic-bezier(.4,0,.2,1)"}}/>
                    </div>
                    {/* Collapsed expansion — tasks list */}
                    {isOpen&&(
                      <div style={{padding:"8px 10px",background:"var(--bg3)"}}>
                        {mTasks.length===0
                          ?<p style={{fontSize:11,color:"var(--muted)",padding:6,textAlign:"center"}}>Sin tareas activas 🎉</p>
                          :mTasks.map(t=>{
                            const dr=fmtDateRelative(t.due_date);
                            return(
                              <div key={t.id} onClick={()=>onOpenTask&&onOpenTask(t)}
                                style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",borderRadius:6,marginBottom:3,
                                  background:"var(--bg2)",borderLeft:`3px solid ${statusColor[t.status]||"var(--border)"}`,
                                  cursor:onOpenTask?"pointer":"default",transition:".13s"}}
                                onMouseEnter={e=>e.currentTarget.style.background="var(--bg4)"}
                                onMouseLeave={e=>e.currentTarget.style.background="var(--bg2)"}>
                                {t.order_number&&<span style={{fontSize:10,color:"var(--accent)",fontFamily:"var(--font-mono)",flexShrink:0,minWidth:40,fontWeight:700}}>AC-{String(t.order_number).padStart(4,"0")}</span>}
                                <span style={{fontSize:12,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.title}</span>
                                {t.priority!=="Normal"&&<span className={`pill pill-prio-${t.priority.toLowerCase()}`} style={{fontSize:9,padding:"1px 5px"}}>{t.priority}</span>}
                                <span className={`pill ${statusPill[t.status]||"pill-gray"}`} style={{fontSize:9,padding:"1px 5px"}}>{statusLabel[t.status]}</span>
                                <span style={{fontSize:10,color:dr.color,fontWeight:dr.urgent?700:400,flexShrink:0,fontFamily:"var(--font-mono)"}}>{dr.label}</span>
                              </div>
                            );
                          })
                        }
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── PERFORMANCE ── */
