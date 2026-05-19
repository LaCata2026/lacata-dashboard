import{useState,useEffect,useRef,useCallback}from'react'
import * as XLSX from'xlsx'
import ReactDOM from'react-dom'
import{sb,teamColor,COLLAB_COLORS,COLORS,MARCAS_PREDEFINIDAS,getInitials,autoColor}from'../lib/supabase'
import{showToast}from'../components/Toast'
import{showConfirm}from'../components/ConfirmDialog'
import Icon from'../components/Icon'
import{Av,SC,BackBtn,Linkify,ActiveTimer,StatusLegend}from'../components/Shared'
import{statusLabel,statusPill,statusColor,prioPill,fmtDate,fmtDateRelative,useSessionFilters}from'../lib/utils'
import TaskCard from'./TaskCard'
import CalendarView from'./CalendarView'
function ModalPortal({children}){const el=useRef(document.createElement("div"));useEffect(()=>{document.body.appendChild(el.current);return()=>document.body.removeChild(el.current)},[]);return ReactDOM.createPortal(children,el.current)}
export function exportExcel(tasks,users,teams){
  const statusMap={pendiente:"Pendiente",en_progreso:"En progreso",en_pausa:"En pausa",en_revision:"En revision",completada:"Completada",vencida:"Vencida"};
  function buildRows(taskList){
    return taskList.map(t=>{
      const assigned=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean);
      const names=assigned.map(id=>users.find(u=>u.id===id)?.name||"?").join(", ");
      const team=teams.find(x=>x.id===t.team_id);
      return{"No. Orden":"AC-"+String(t.order_number||0).padStart(4,"0"),"Proyecto":t.title||"","Responsable":names||"Sin asignar","Marca":t.marca||"—","Equipo":team?.name||"Sin equipo","Estado":statusMap[t.status]||t.status||"","Prioridad":t.priority||"Normal","Horas Est.":Number(t.hours)||0,"Horas Reales":Number(t.hours_real)||0,"Diferencia":t.hours_real>0?Math.round((Number(t.hours_real)-Number(t.hours))*100)/100:"—","Fecha Límite":t.due_date||"","Cambios":t.changes||0};
    });
  }
  if(!XLSX){
    const header=["No. Orden","Proyecto","Responsable","Marca","Horas Est.","Horas Reales"];
    const lines=[header.join(",")];
    tasks.forEach(t=>{const assigned=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean);const names=assigned.map(id=>users.find(u=>u.id===id)?.name||"?").join(" + ");lines.push(["AC-"+String(t.order_number||0).padStart(4,"0"),t.title||"",names,t.marca||"",t.hours||0,t.hours_real||0].join(","));});
    const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8;"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="LaCata_"+new Date().toISOString().split("T")[0]+".csv";a.click();URL.revokeObjectURL(url);showToast("Reporte CSV descargado","success");return;
  }
  const wb=XLSX.utils.book_new();
  const allRows=buildRows(tasks);const wsAll=XLSX.utils.json_to_sheet(allRows);wsAll["!cols"]=[{wch:12},{wch:36},{wch:22},{wch:18},{wch:18},{wch:14},{wch:10},{wch:10},{wch:12},{wch:10},{wch:14},{wch:8}];XLSX.utils.book_append_sheet(wb,wsAll,"Todas las órdenes");
  const marcas=[...new Set(tasks.map(t=>t.marca||"Sin marca").filter(Boolean))].sort();
  marcas.forEach(marca=>{
    const mTasks=tasks.filter(t=>(t.marca||"Sin marca")===marca);const rows=buildRows(mTasks);if(rows.length===0)return;
    const collabMap={};mTasks.forEach(t=>{const assigned=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean);assigned.forEach(id=>{const u=users.find(x=>x.id===id);if(!collabMap[id])collabMap[id]={nombre:u?.name||"?",horasEst:0,horasReal:0,tareas:0};collabMap[id].horasEst+=Number(t.hours)||0;collabMap[id].horasReal+=Number(t.hours_real)||0;collabMap[id].tareas++;});});
    const ws=XLSX.utils.json_to_sheet(rows);ws["!cols"]=[{wch:12},{wch:36},{wch:22},{wch:18},{wch:18},{wch:14},{wch:10},{wch:10},{wch:12},{wch:10},{wch:14},{wch:8}];
    const startRow=rows.length+3;XLSX.utils.sheet_add_aoa(ws,[["— Resumen por colaborador —"," "," "],[" Responsable"," Tareas"," Hrs Est."," Hrs Real"]],{origin:{r:startRow,c:0}});Object.values(collabMap).forEach((c,i)=>{XLSX.utils.sheet_add_aoa(ws,[[c.nombre,c.tareas,c.horasEst,c.horasReal]],{origin:{r:startRow+2+i,c:0}});});
    const totalEst=mTasks.reduce((s,t)=>s+Number(t.hours||0),0);const totalReal=mTasks.reduce((s,t)=>s+Number(t.hours_real||0),0);XLSX.utils.sheet_add_aoa(ws,[[" "],["TOTAL HORAS MARCA:",totalEst,"Reales:",totalReal]],{origin:{r:startRow+Object.keys(collabMap).length+3,c:0}});
    const sheetName=marca.substring(0,31).replace(/[\\\/\?\*\[\]]/g,"_");XLSX.utils.book_append_sheet(wb,ws,sheetName);
  });
  XLSX.writeFile(wb,"LaCata_Reporte_"+new Date().toISOString().split("T")[0]+".xlsx");showToast("Excel descargado con "+marcas.length+" tabs de marca","success");
}

export default function OrdenesView({tasks,users,teams,me,token,onRefresh,onBack,initialFilter,initialView}){
  const [viewMode,setViewMode]=useSessionFilters("ordenes_view",initialView||"kanban");
  const [sf,setSf]=useSessionFilters("ordenes_status",initialFilter||"todas");
  const [tf,setTf]=useSessionFilters("ordenes_team","todas");
  const [search,setSearch]=useState("");
  const [collapsed,setCollapsed]=useState({});
  const [dragOverCol,setDragOverCol]=useState(null);
  const dragTaskRef=useRef(null);
  const isDir=me.role==="director";
  const isCuentas=me.role==="cuentas";
  const isCollab=me.role==="colaborador";
  // El colaborador SIEMPRE ve lista — no necesita Kanban/Equipos/Calendario.
  // Forzamos el modo sin importar lo que tenga guardado en sesión.
  const effectiveView=isCollab?"lista":viewMode;
  // ── CUENTAS SCOPE ──
  const myTeamIds=isCuentas?(Array.isArray(me.team_ids)&&me.team_ids.length>0?me.team_ids:[me.team_id].filter(Boolean)):null;
  const visibleTeams=isCuentas&&myTeamIds?teams.filter(t=>myTeamIds.includes(t.id)):teams;

  const visible=tasks.filter(t=>{
    let canSee=false;
    if(isDir)canSee=true;
    else if(isCuentas){canSee=myTeamIds?myTeamIds.includes(t.team_id):true;}
    else{const a=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean);canSee=a.includes(me.id);}
    const sm=!search||t.title?.toLowerCase().includes(search.toLowerCase())||(t.order_number&&("AC-"+String(t.order_number).padStart(4,"0")).toLowerCase().includes(search.toLowerCase()))||(t.marca||"").toLowerCase().includes(search.toLowerCase());
    return canSee&&(sf==="todas"||t.status===sf)&&(tf==="todas"||t.team_id===tf)&&sm;
  });

  const COLS=[
    {s:"vencida",label:"Vencidas",color:"var(--s-vencida)"},
    {s:"en_progreso",label:"En progreso",color:"var(--s-progreso)"},
    {s:"en_revision",label:"En revisión",color:"var(--s-revision)"},
    {s:"pendiente",label:"Pendiente",color:"var(--s-pendiente)"},
    {s:"en_pausa",label:"En pausa",color:"var(--s-pausa)"},
    {s:"completada",label:"Completada",color:"var(--s-completada)"},
  ];

  async function handleDrop(newStatus){
    const t=dragTaskRef.current;if(!t||t.status===newStatus)return;
    setDragOverCol(null);dragTaskRef.current=null;
    showToast(`Moviendo a ${statusLabel[newStatus]}...`,"info");
    try{
      const history=Array.isArray(t.history)?[...t.history]:[];
      history.push(`Estado cambiado a "${statusLabel[newStatus]}" — ${new Date().toLocaleDateString("es-GT")}`);
      await sb.update("tareas",t.id,{status:newStatus,history},token);
      showToast(`✓ Movido a ${statusLabel[newStatus]}`,"success");onRefresh();
    }catch(e){showToast("Error al mover tarea: "+e.message,"error");}
  }

  function KanbanCard({t}){
    const assigned=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean);
    // Pasamos t.status: si la orden está completada, fmtDateRelative no
    // genera alerta de vencimiento (no debe crear pánico una tarea ya hecha).
    const dr=fmtDateRelative(t.due_date,t.status);
    const canDrag=(isDir||isCuentas||assigned.includes(me.id));
    return(
      <div className="kanban-card" draggable={canDrag}
        onDragStart={e=>{if(!canDrag)return;dragTaskRef.current=t;e.dataTransfer.effectAllowed="move";const ghost=e.currentTarget.cloneNode(true);ghost.style.opacity="0.01";ghost.style.position="absolute";ghost.style.top="-1000px";document.body.appendChild(ghost);e.dataTransfer.setDragImage(ghost,0,0);setTimeout(()=>document.body.removeChild(ghost),0);e.currentTarget.classList.add("dragging");}}
        onDragEnd={e=>{e.currentTarget.classList.remove("dragging");dragTaskRef.current=null;setDragOverCol(null);}}
        onClick={()=>{window._openTask&&window._openTask(t);}}
        style={{borderLeft:`3px solid ${statusColor[t.status]||"var(--border)"}`}}>
        {canDrag&&(<div style={{position:"absolute",top:6,right:6,opacity:.2,transition:".13s",pointerEvents:"none"}} className="drag-handle"><svg width={10} height={10} viewBox="0 0 10 10" fill="currentColor" opacity={.5}><circle cx="3" cy="2" r="1"/><circle cx="7" cy="2" r="1"/><circle cx="3" cy="5" r="1"/><circle cx="7" cy="5" r="1"/><circle cx="3" cy="8" r="1"/><circle cx="7" cy="8" r="1"/></svg></div>)}
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
          {t.order_number
            ?<span style={{fontSize:10,color:"var(--accent)",fontFamily:"var(--font-mono)",fontWeight:700}}>AC-{String(t.order_number).padStart(4,"0")}</span>
            :<span style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)",fontWeight:600,opacity:.6}}>Sin #</span>}
          {t.priority!=="Normal"&&<span className={`pill pill-prio-${t.priority.toLowerCase()}`}>{t.priority}</span>}
        </div>
        <p style={{fontSize:12,fontWeight:600,lineHeight:1.4,marginBottom:6}}>{t.title}</p>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",gap:-4}}>{assigned.slice(0,3).map(id=>{const u=users.find(x=>x.id===id);return u?<div key={id} style={{width:18,height:18,borderRadius:4,background:u.avatar_color,fontSize:7,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,marginRight:2}}>{u.initials}</div>:null;})}</div>
          <span style={{fontSize:10,color:dr.color,fontWeight:dr.urgent?700:400,fontFamily:"var(--font-mono)"}}>{dr.label}</span>
        </div>
      </div>
    );
  }

  return(
    <div>
      {onBack&&<BackBtn onClick={onBack}/>}
      <div className="section-header" style={{marginBottom:12}}>
        <h2 className="section-title">Órdenes de trabajo</h2>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          {!isCollab&&(
            <div style={{display:"flex",gap:2,background:"var(--bg3)",borderRadius:8,padding:3}}>
              {[{v:"kanban",l:"Kanban",icon:"kanban"},{v:"lista",l:"Lista",icon:"lista"},{v:"equipo",l:"Equipos",icon:"equipos"},{v:"calendario",l:"Calendario",icon:"calendario"}].map(m=>(
                <button key={m.v} onClick={()=>setViewMode(m.v)} data-view={m.v}
                  style={{padding:"4px 10px",borderRadius:6,fontSize:11,cursor:"pointer",fontFamily:"inherit",border:"none",display:"flex",alignItems:"center",gap:5,background:viewMode===m.v?"var(--bg2)":"transparent",color:viewMode===m.v?"var(--text)":"var(--muted)",fontWeight:viewMode===m.v?600:400}}>
                  <Icon n={m.icon} size={13}/>{m.l}
                </button>
              ))}
            </div>
          )}
          <span style={{fontSize:12,color:"var(--muted)"}}>{visible.length} orden{visible.length!==1?"es":""}</span>
        </div>
      </div>

      {effectiveView!=="calendario"&&(
        <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar nombre, AC-0001, marca..." style={{flex:1,minWidth:200,fontSize:13}}/>
          {(isDir||isCuentas)&&(
            <select value={tf} onChange={e=>setTf(e.target.value)} style={{width:"auto",fontSize:12}}>
              <option value="todas">Todos los equipos</option>
              {visibleTeams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </div>
      )}

      {(effectiveView==="lista"||effectiveView==="equipo")&&(
        <div className="filter-bar" style={{marginBottom:12}}>
          {["todas","vencida","en_progreso","en_revision","pendiente","en_pausa","completada"].map(s=>(
            <button key={s} className={`filter-chip${sf===s?" active":""}`}
              style={sf===s&&s!=="todas"?{background:statusColor[s],borderColor:statusColor[s],color:"#fff"}:{}}
              onClick={()=>setSf(s)}>
              {s==="todas"?"Todas":statusLabel[s]}
            </button>
          ))}
        </div>
      )}

      {effectiveView==="kanban"&&(isDir||isCuentas)&&(
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10,padding:"6px 12px",background:"var(--bg3)",borderRadius:7,border:"1px solid var(--border)",width:"fit-content"}}>
          <Icon n="drag" size={13} color="var(--muted)"/>
          <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>Arrastra las tarjetas entre columnas para cambiar el estado</span>
        </div>
      )}

      {effectiveView!=="calendario"&&!isCollab&&<StatusLegend/>}

      {effectiveView==="calendario"&&(<CalendarView tasks={tasks} users={users} teams={teams} me={me}/>)}

      {visible.length===0&&effectiveView!=="calendario"&&(
        <div className="empty"><div style={{opacity:.3,marginBottom:8}}><Icon n="ordenes" size={40} color="currentColor"/></div><p>No hay órdenes con estos filtros.</p></div>
      )}

      {effectiveView==="kanban"&&visible.length>0&&(
        <div className="kanban-wrap">
          {COLS.map(col=>{
            const colTasks=visible.filter(t=>t.status===col.s);
            if(colTasks.length===0&&col.s!=="en_progreso"&&col.s!=="pendiente")return null;
            const isOver=dragOverCol===col.s;
            return(
              <div key={col.s} className={`kanban-col${isOver?" drag-over":""}`}
                onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="move";setDragOverCol(col.s);}}
                onDragEnter={e=>{e.preventDefault();setDragOverCol(col.s);}}
                onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setDragOverCol(null);}}
                onDrop={e=>{e.preventDefault();handleDrop(col.s);}}>
                <div className="kanban-col-head">
                  <div style={{width:8,height:8,borderRadius:"50%",background:col.color,flexShrink:0}}/>
                  <span style={{fontSize:12,fontWeight:700,flex:1}}>{col.label}</span>
                  <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)",background:"var(--bg4)",borderRadius:4,padding:"1px 6px"}}>{colTasks.length}</span>
                </div>
                <div className="kanban-col-body">
                  {colTasks.length===0
                    ?<div style={{border:"2px dashed var(--border)",borderRadius:8,padding:"20px 12px",textAlign:"center",margin:"4px 0",transition:".2s",borderColor:isOver?"var(--accent)":"var(--border)"}}>
                       <p style={{fontSize:11,color:isOver?"var(--accent)":"var(--muted)",opacity:isOver?1:.5,transition:".2s"}}>{isOver?"Soltar aquí":"Sin tareas"}</p>
                     </div>
                    :colTasks.map(t=><KanbanCard key={t.id} t={t}/>)
                  }
                  {colTasks.length>0&&isOver&&(
                    <div style={{height:36,border:"2px dashed var(--accent)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",margin:"4px 0"}}>
                      <span style={{fontSize:11,color:"var(--accent)"}}>Soltar aquí</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {effectiveView==="lista"&&visible.length>0&&(()=>{
        const order=["vencida","en_revision","en_progreso","pendiente","en_pausa","completada"];
        const sorted=[...visible].sort((a,b)=>order.indexOf(a.status)-order.indexOf(b.status));
        const active=sorted.filter(t=>t.status!=="completada");
        const done=sorted.filter(t=>t.status==="completada");
        return(
          <>
            {active.map(t=><TaskCard key={t.id} task={t} users={users} teams={teams} me={me} token={token} onRefresh={onRefresh}/>)}
            {done.length>0&&(
              <>
                <div style={{display:"flex",alignItems:"center",gap:10,margin:"16px 0 8px",opacity:.45}}>
                  <div style={{flex:1,height:1,background:"var(--border)"}}/>
                  <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}><Icon n="completada" size={11} style={{marginRight:4}}/> Completadas ({done.length})</span>
                  <div style={{flex:1,height:1,background:"var(--border)"}}/>
                </div>
                {done.map(t=><TaskCard key={t.id} task={t} users={users} teams={teams} me={me} token={token} onRefresh={onRefresh}/>)}
              </>
            )}
          </>
        );
      })()}

      {effectiveView==="equipo"&&visible.length>0&&(()=>{
        const teamsWithTasks=visibleTeams.filter(t=>visible.some(x=>x.team_id===t.id));
        const noTeam=visible.filter(t=>!t.team_id);
        return(
          <>
            {teamsWithTasks.map(team=>{
              const tTasks=visible.filter(t=>t.team_id===team.id);
              const isOpen=collapsed[team.id]!==true;
              const overdue=tTasks.filter(t=>t.status==="vencida").length;
              const inProg=tTasks.filter(t=>t.status==="en_progreso").length;
              const inRev=tTasks.filter(t=>t.status==="en_revision").length;
              return(
                <div key={team.id} style={{marginBottom:8,background:"var(--bg2)",borderRadius:10,border:"1px solid var(--border)",overflow:"hidden"}}>
                  <div onClick={()=>setCollapsed(c=>({...c,[team.id]:!c[team.id]}))}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",cursor:"pointer",borderLeft:`4px solid ${teamColor(team)}`,background:isOpen?"var(--bg3)":"var(--bg2)"}}>
                    <span style={{fontSize:16}}>{<Icon n={team.icon||"equipos"} size={18} style={{display:"inline-block"}}/>}</span>
                    <span style={{fontWeight:700,fontSize:14,flex:1}}>{team.name}</span>
                    <div style={{display:"flex",gap:4}}>
                      {overdue>0&&<span style={{fontSize:10,padding:"1px 6px",borderRadius:3,background:"var(--s-vencida-bg)",color:"var(--s-vencida)",fontWeight:700,fontFamily:"var(--font-mono)"}}><Icon n="alerta" size={9}/>{overdue}</span>}
                      {inRev>0&&<span style={{fontSize:10,padding:"1px 6px",borderRadius:3,background:"var(--s-revision-bg)",color:"var(--s-revision)",fontWeight:700,fontFamily:"var(--font-mono)"}}>🔍{inRev}</span>}
                      {inProg>0&&<span style={{fontSize:10,padding:"1px 6px",borderRadius:3,background:"var(--s-progreso-bg)",color:"var(--s-progreso)",fontWeight:700,fontFamily:"var(--font-mono)"}}><Icon n="progreso" size={9}/>{inProg}</span>}
                      <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)",marginLeft:4}}>{tTasks.length}</span>
                    </div>
                    <span style={{color:"var(--muted)",transition:"transform .2s",transform:isOpen?"rotate(0)":"rotate(-90deg)",display:"inline-block"}}>▼</span>
                  </div>
                  {isOpen&&(
                    <div style={{padding:"6px 12px 12px"}}>
                      {[...tTasks].sort((a,b)=>{
                        const order=["vencida","en_revision","en_progreso","pendiente","en_pausa","completada"]
                        const si=order.indexOf(a.status)-order.indexOf(b.status);if(si!==0)return si
                        const pa=a.priority==="Urgente"?0:a.priority==="Alta"?1:2
                        const pb=b.priority==="Urgente"?0:b.priority==="Alta"?1:2
                        if(pa!==pb)return pa-pb
                        if(a.due_date&&b.due_date)return new Date(a.due_date)-new Date(b.due_date)
                        if(a.due_date)return -1;if(b.due_date)return 1;return 0
                      }).map(t=><TaskCard key={t.id} task={t} users={users} teams={teams} me={me} token={token} onRefresh={onRefresh}/>)}
                    </div>
                  )}
                </div>
              );
            })}
            {noTeam.length>0&&(
              <div style={{marginTop:8}}>
                <p style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)",marginBottom:6}}>Sin equipo asignado</p>
                {noTeam.map(t=><TaskCard key={t.id} task={t} users={users} teams={teams} me={me} token={token} onRefresh={onRefresh}/>)}
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}

/* ── TEAM DETAIL VIEW (collapsible collaborators) ── */
