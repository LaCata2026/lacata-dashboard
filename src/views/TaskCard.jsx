import{useState,useEffect,useRef,useCallback}from'react'
import ReactDOM from'react-dom'
import{sb,teamColor,COLLAB_COLORS,COLORS,MARCAS_PREDEFINIDAS,getInitials,autoColor}from'../lib/supabase'
import{showToast}from'../components/Toast'
import{showConfirm}from'../components/ConfirmDialog'
import Icon from'../components/Icon'
import{Av,SC,BackBtn,Linkify,ActiveTimer,StatusLegend}from'../components/Shared'
import{statusLabel,statusPill,statusColor,prioPill,fmtDate,fmtDateRelative,useSessionFilters}from'../lib/utils'
function ModalPortal({children}){const el=useRef(document.createElement("div"));useEffect(()=>{document.body.appendChild(el.current);return()=>document.body.removeChild(el.current)},[]);return ReactDOM.createPortal(children,el.current)}
export function ReassignModal({task,users,teams,token,onClose,onRefresh,me}){
  const current=Array.isArray(task.assigned_to)?task.assigned_to:[task.assigned_to].filter(Boolean);
  const [selected,setSelected]=useState([...current]);
  const [saving,setSaving]=useState(false);
  const opts=users.filter(u=>u.role==="colaborador");
  async function save(){
    if(selected.length===0){showToast("Debe haber al menos un responsable","error");return;}
    setSaving(true);
    const h=[...(task.history||[]),`Responsables actualizados por ${me.name} — ${new Date().toLocaleString("es-GT")}`];
    await sb.update("tareas",task.id,{assigned_to:selected,history:h},token);
    showToast("Responsables actualizados","success");
    onRefresh();onClose();setSaving(false);
  }
  return ReactDOM.createPortal(
    <div className="confirm-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="confirm-box fade-in" style={{maxWidth:460}}>
        <h3 style={{fontSize:16,fontWeight:700,marginBottom:4,fontFamily:"var(--font-display)"}}>Reasignar responsables</h3>
        <p style={{fontSize:12,color:"var(--muted)",marginBottom:16,fontFamily:"var(--font-mono)"}}>{task.title}</p>
        <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:20,maxHeight:260,overflowY:"auto"}}>
          {opts.map(u=>{
            const sel=selected.includes(u.id);
            const uTeam=teams.find(t=>t.id===u.team_id);
            return(
              <div key={u.id} onClick={()=>setSelected(s=>sel?s.filter(x=>x!==u.id):[...s,u.id])}
                style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:8,cursor:"pointer",
                  background:sel?"var(--bg4)":"transparent",border:`1px solid ${sel?"var(--border2)":"transparent"}`,transition:".13s"}}>
                <Av u={u} size={28}/>
                <div style={{flex:1}}><p style={{fontSize:13,fontWeight:600}}>{u.name}</p><p style={{fontSize:11,color:"var(--muted)"}}>{uTeam?.name||""}</p></div>
                <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${sel?"var(--accent)":"var(--border2)"}`,background:sel?"var(--accent)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:".13s"}}>
                  {sel&&<span style={{color:"#0d0d0d",fontSize:11,fontWeight:700}}>✓</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:11,color:"var(--muted)"}}>{selected.length} seleccionado{selected.length!==1?"s":""}</span>
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={saving||selected.length===0}>{saving?"...":"Guardar"}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function AddChangeModal({task,token,onClose,onRefresh,me}){
  const [text,setText]=useState("");
  const [saving,setSaving]=useState(false);
  async function save(){
    if(!text.trim())return;
    setSaving(true);
    const n=(task.changes||0)+1;
    const h=[...(task.history||[]),`Cambio ${n}: ${text.trim()} — ${me.name} — ${new Date().toLocaleString("es-GT")}`];
    await sb.update("tareas",task.id,{changes:n,history:h},token);
    showToast("Cambio #"+n+" registrado","success");
    onRefresh();onClose();setSaving(false);
  }
  return ReactDOM.createPortal(
    <div className="confirm-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="confirm-box fade-in">
        <h3 style={{fontSize:16,fontWeight:700,marginBottom:4,fontFamily:"var(--font-display)"}}>Registrar cambio #{(task.changes||0)+1}</h3>
        <p style={{fontSize:12,color:"var(--muted)",marginBottom:14,fontFamily:"var(--font-mono)"}}>{task.title}</p>
        <textarea value={text} onChange={e=>setText(e.target.value)} autoFocus
          placeholder="Describe el cambio solicitado..."
          style={{width:"100%",minHeight:90,marginBottom:8,resize:"vertical"}}
          onKeyDown={e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)){e.preventDefault();save();}}}/>
        <p style={{fontSize:11,color:"var(--muted)",marginBottom:14,fontFamily:"var(--font-mono)"}}>⌘+Enter para guardar</p>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={!text.trim()||saving}>{saving?"...":"Registrar"}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export async function duplicateTask(task,token,onRefresh){
  try{
    const existing=await sb.get("tareas","select=order_number&order=order_number.desc&limit=1",token);
    const lastNum=Array.isArray(existing)&&existing.length>0&&existing[0].order_number?existing[0].order_number:0;
    const orderNum=lastNum+1;
    const assigned=Array.isArray(task.assigned_to)?task.assigned_to:[task.assigned_to].filter(Boolean);
    await sb.insert("tareas",{
      title:task.title,description:task.description||"",marca:task.marca||"",
      materials:task.materials||"",priority:task.priority||"Normal",status:"pendiente",
      hours:Number(task.hours)||0,due_date:task.due_date||null,team_id:task.team_id||null,
      assigned_to:assigned,order_number:orderNum,changes:0,files:[],comments:[],
      history:[`Orden AC-${String(orderNum).padStart(4,"0")} creada (copia de AC-${String(task.order_number||0).padStart(4,"0")}) — ${new Date().toLocaleDateString("es-GT")}`],
    },token);
    showToast(`Orden duplicada como AC-${String(orderNum).padStart(4,"0")}`,"success");
    onRefresh();
  }catch(e){showToast("Error al duplicar: "+e.message,"error");}
}

// Campo "Otro motivo" para el diálogo de pausa: input + botón.
// Se mantiene como componente aparte para tener su propio estado
// sin re-renderizar el TaskCard completo en cada tecla.
function OtherReasonInput({onSubmit}){
  const [open,setOpen]=useState(false);
  const [txt,setTxt]=useState("");
  if(!open)return(
    <button onClick={()=>setOpen(true)}
      style={{textAlign:"left",padding:"11px 14px",borderRadius:8,background:"var(--bg3)",border:"1px solid var(--border)",color:"var(--muted2)",fontSize:13,cursor:"pointer",fontFamily:"var(--font-body)",transition:".13s"}}
      onMouseEnter={e=>{e.currentTarget.style.background="var(--bg4)";e.currentTarget.style.borderColor="var(--border2)";}}
      onMouseLeave={e=>{e.currentTarget.style.background="var(--bg3)";e.currentTarget.style.borderColor="var(--border)";}}>
      Otro motivo…
    </button>
  );
  return(
    <div style={{display:"flex",gap:6}}>
      <input autoFocus value={txt} onChange={e=>setTxt(e.target.value)}
        onKeyDown={e=>{if(e.key==="Enter"&&txt.trim())onSubmit(txt.trim());}}
        placeholder="Escribe el motivo…" style={{fontSize:13}}/>
      <button className="btn btn-primary btn-sm" disabled={!txt.trim()}
        onClick={()=>txt.trim()&&onSubmit(txt.trim())}>OK</button>
    </div>
  );
}

export default function TaskCard({task,users,teams,me,token,onRefresh,forceOpen=false,onForceClose=null}){
  const [modal,setModal]=useState(forceOpen);
  // ── LOCAL STATUS for immediate visual feedback ──
  const [localStatus,setLocalStatus]=useState(task.status);
  useEffect(()=>setLocalStatus(task.status),[task.status]);
  const [editing,setEditing]=useState(false);
  const [editForm,setEditForm]=useState({});
  const [activeTab,setActiveTab]=useState("detalles");
  const [commentText,setCommentText]=useState("");
  const [sendingComment,setSendingComment]=useState(false);
  const [mentionState,setMentionState]=useState({open:false,query:"",pos:0});
  const [showReassign,setShowReassign]=useState(false);
  const [showAddChange,setShowAddChange]=useState(false);
  const [pausePrompt,setPausePrompt]=useState(false); // diálogo motivo de pausa
  const [quickMenu,setQuickMenu]=useState(false); // menú rápido del pill de estado
  const [imgPreview,setImgPreview]=useState(null);
  const textareaRef=useRef(null);
  const commentsEndRef=useRef(null);

  useEffect(()=>{
    function onKey(e){if(e.key==="Escape"){setModal(false);setEditing(false);setImgPreview(null);}}
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[]);
  useEffect(()=>{
    if(activeTab==="conversacion"&&commentsEndRef.current)commentsEndRef.current.scrollIntoView({behavior:"smooth"});
  },[activeTab,task.comments?.length]);

  const comments=Array.isArray(task.comments)?task.comments:[];
  const isDir=me.role==="director"||me.role==="cuentas";
  const team=teams.find(t=>t.id===task.team_id);
  // Estado efectivo (incluye el cambio local optimista) — usado para
  // decidir si la fecha límite debe alertar o no.
  const effStatus=localStatus||task.status;

  const lastActivity=(()=>{
    const hist=task.history||[];const cs=Array.isArray(task.comments)?task.comments:[];
    let latest=task.created_at?new Date(task.created_at):null;
    cs.forEach(c=>{const d=new Date(c.created_at);if(!latest||d>latest)latest=d;});
    if(!latest)return null;
    const diff=Date.now()-latest.getTime();const h=Math.floor(diff/3600000);
    if(h<1)return"hace un momento";if(h<24)return`hace ${h}h`;
    return`hace ${Math.floor(h/24)}d`;
  })();

  async function changeStatus(s,pauseReason){
    // Si se pausa y aún no hay motivo, abrir el diálogo en vez de ejecutar.
    // El diálogo vuelve a llamar changeStatus("en_pausa", motivo).
    if(s==="en_pausa"&&!pauseReason){
      setPausePrompt(true);
      return;
    }
    setLocalStatus(s); // ── immediate visual update ──
    const btn=document.querySelector(`[data-status="${s}"]`);
    if(btn){btn.style.transform="scale(0.95)";setTimeout(()=>{btn.style.transform=""},200);}
    const now=new Date();const nowStr=now.toLocaleString("es-GT");const prev=task.status;
    let newHoursReal=Number(task.hours_real)||0;let entry="";
    if(prev==="en_progreso"&&task.started_at&&(s==="en_pausa"||s==="en_revision"||s==="completada")){
      const started=new Date(task.started_at);const diffH=Math.round(((now-started)/3600000)*100)/100;
      newHoursReal=Math.round((newHoursReal+diffH)*100)/100;
      if(s==="en_revision")entry=`🔍 ${me.name} envió a revisión — ${nowStr} (⏱ ${diffH}h sesión · total: ${newHoursReal}h — reloj detenido)`;
      else if(s==="en_pausa")entry=`⏸ ${me.name} → Pausa: ${pauseReason} — ${nowStr} (${diffH}h sesión · total: ${newHoursReal}h)`;
      else entry=`✅ ${me.name} completó — ${nowStr} — Total: ${newHoursReal}h`;
    }else if(s==="en_progreso"){entry=`⚡ ${me.name} inició trabajo — ${nowStr}`;
    }else if(s==="en_revision"&&prev!=="en_progreso"){entry=`🔍 ${me.name} envió a revisión — ${nowStr}`;
    }else if(s==="completada"){entry=`✅ ${me.name} marcó como completada — ${nowStr} — Total: ${newHoursReal}h reales`;
    }else if(s==="en_pausa"){entry=`⏸ ${me.name} → Pausa: ${pauseReason} — ${nowStr}`;
    }else{entry=`${statusLabel[s]} — ${me.name} — ${nowStr}`;}
    const h=[...(task.history||[]),entry];
    const updates={status:s,history:h,hours_real:newHoursReal,
      started_at:s==="en_progreso"?now.toISOString():(prev==="en_progreso"?null:task.started_at||null)};
    try{
      await sb.update("tareas",task.id,updates,token);
      showToast("Estado: "+statusLabel[s],"success");
      onRefresh();
    }catch(e){
      setLocalStatus(prev); // revert on error
      showToast("Error al cambiar estado: "+e.message,"error");
    }
  }

  async function del(){
    const ok=await showConfirm(`¿Eliminar "${task.title}"?`,{
      title:"Eliminar orden",confirmLabel:"Sí, eliminar",confirmColor:"var(--s-vencida)",
      detail:`Esta acción no se puede deshacer. AC-${String(task.order_number||0).padStart(4,"0")}`});
    if(!ok)return;
    const files=Array.isArray(task.files)?task.files:[];
    for(const f of files){if(typeof f==="object"&&f.path){try{await sb.deleteFile(f.path);}catch(e){console.warn("No se pudo borrar archivo:",f.path);}}}
    await sb.del("tareas",task.id,token);
    showToast("Orden eliminada","success");setModal(false);onRefresh();
  }

  async function saveEdit(){
    const h=[...(task.history||[]),`Editado por ${me.name} — ${new Date().toLocaleString("es-GT")}`];
    await sb.update("tareas",task.id,{
      title:editForm.title||task.title,description:editForm.description||task.description,
      materials:editForm.materials||task.materials||"",hours:Number(editForm.hours)||task.hours||0,
      due_date:editForm.due_date||task.due_date,priority:editForm.priority||task.priority,history:h,
    },token);
    showToast("Orden actualizada","success");setEditing(false);onRefresh();
  }

  async function postComment(){
    const trimmed=commentText.trim();
    if(!trimmed||sendingComment)return;
    setSendingComment(true);
    try{
      const mentions=[];
      users.forEach(u=>{const handle="@"+u.name.split(" ")[0].toLowerCase();if(trimmed.toLowerCase().includes(handle))mentions.push(u.id);});
      const newComment={id:Date.now()+"-"+Math.random().toString(36).slice(2,8),user_id:me.id,user_name:me.name,user_color:me.avatar_color||"#888",text:trimmed,mentions,created_at:new Date().toISOString()};
      const updated=[...comments,newComment];
      await sb.update("tareas",task.id,{comments:updated},token);
      setCommentText("");setMentionState({open:false,query:"",pos:0});onRefresh();
    }catch(e){showToast("Error al enviar comentario: "+e.message,"error");}
    setSendingComment(false);
  }

  function handleCommentInput(e){
    const val=e.target.value;const pos=e.target.selectionStart;setCommentText(val);
    const before=val.substring(0,pos);const match=before.match(/@(\w*)$/);
    if(match)setMentionState({open:true,query:match[1].toLowerCase(),pos});
    else setMentionState({open:false,query:"",pos});
  }

  function insertMention(user){
    const firstName=user.name.split(" ")[0];const before=commentText.substring(0,mentionState.pos);const after=commentText.substring(mentionState.pos);
    const newBefore=before.replace(/@\w*$/,`@${firstName} `);setCommentText(newBefore+after);
    setMentionState({open:false,query:"",pos:0});textareaRef.current?.focus();
  }

  function onCommentKey(e){
    if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)){e.preventDefault();postComment();}
    if(e.key==="Escape"&&mentionState.open){e.preventDefault();setMentionState({open:false,query:"",pos:0});}
  }

  return(
    <div className="task-card fade-in" style={{
      cursor:"pointer",
      borderLeft:`3px solid ${statusColor[effStatus]||"var(--border2)"}`,
      paddingLeft:15,
      opacity:(localStatus==="completada"&&me.role!=="director"&&me.role!=="cuentas")?0.6:1,
      transition:"opacity .2s, border-left-color .2s",
      outline:task.priority==="Urgente"?`1px solid ${statusColor.vencida}33`:"none",
    }} onClick={()=>setModal(true)}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:7,alignItems:"center"}}>
            {task.order_number&&<span style={{fontSize:11,fontWeight:700,color:"var(--accent)",fontFamily:"monospace"}}>#{"AC-"+String(task.order_number).padStart(4,"0")}</span>}
            <span className={`pill ${prioPill[task.priority]||"pill-gray"}`}>{task.priority}</span>
            {(()=>{
              // Mismos permisos que el modal: director/cuentas todo,
              // colaborador solo si está asignado a la tarea.
              const canChange=isDir||(Array.isArray(task.assigned_to)?task.assigned_to:[task.assigned_to]).includes(me.id);
              if(!canChange)return <span className={`pill ${statusPill[effStatus]||"pill-gray"}`}>{statusLabel[effStatus]||task.status}</span>;
              const opts=[
                {v:"pendiente",label:"Pendiente"},
                {v:"en_progreso",label:"En progreso"},
                {v:"en_pausa",label:"En pausa"},
                {v:"en_revision",label:"Revisión"},
                {v:"completada",label:"Completada"},
                ...(isDir?[{v:"vencida",label:"Vencida"}]:[])
              ];
              return(
                <span style={{position:"relative",display:"inline-flex"}}>
                  <span className={`pill ${statusPill[effStatus]||"pill-gray"}`}
                    onClick={e=>{e.stopPropagation();setQuickMenu(q=>!q);}}
                    style={{cursor:"pointer",userSelect:"none"}}
                    title="Cambiar estado">
                    {statusLabel[effStatus]||task.status} <span style={{opacity:.5,fontSize:8,marginLeft:2}}>▼</span>
                  </span>
                  {quickMenu&&(
                    <>
                      <span onClick={e=>{e.stopPropagation();setQuickMenu(false);}}
                        style={{position:"fixed",inset:0,zIndex:50}}/>
                      <span style={{position:"absolute",top:"calc(100% + 4px)",left:0,zIndex:51,background:"var(--bg2)",border:"1px solid var(--border2)",borderRadius:8,padding:4,minWidth:150,boxShadow:"0 8px 24px rgba(0,0,0,.4)",display:"flex",flexDirection:"column",gap:1}}>
                        {opts.map(o=>(
                          <span key={o.v}
                            onClick={e=>{e.stopPropagation();setQuickMenu(false);if(o.v!==effStatus)changeStatus(o.v);}}
                            style={{padding:"7px 12px",borderRadius:5,fontSize:12,cursor:"pointer",color:o.v===effStatus?"var(--accent)":"var(--text)",fontWeight:o.v===effStatus?700:400,background:o.v===effStatus?"var(--accent-dim)":"transparent",fontFamily:"var(--font-body)",whiteSpace:"nowrap",transition:".1s"}}
                            onMouseEnter={ev=>{if(o.v!==effStatus)ev.currentTarget.style.background="var(--bg3)";}}
                            onMouseLeave={ev=>{if(o.v!==effStatus)ev.currentTarget.style.background="transparent";}}>
                            {o.label}{o.v===effStatus&&" ✓"}
                          </span>
                        ))}
                      </span>
                    </>
                  )}
                </span>
              );
            })()}
            {task.changes>0&&<span className="pill pill-purple"><Icon n="cambio" size={10}/> {task.changes}</span>}
            {(()=>{
              const files=Array.isArray(task.files)?task.files:[];if(files.length===0)return null;
              const now=Date.now();
              const urgent=files.some(f=>typeof f==="object"&&f.uploaded_at&&(new Date(f.uploaded_at).getTime()+48*3600000-now)<6*3600000&&(new Date(f.uploaded_at).getTime()+48*3600000-now)>0);
              const warning=!urgent&&files.some(f=>typeof f==="object"&&f.uploaded_at&&(new Date(f.uploaded_at).getTime()+48*3600000-now)<24*3600000&&(new Date(f.uploaded_at).getTime()+48*3600000-now)>0);
              if(urgent)return<span className="pill" style={{background:"rgba(232,93,93,.15)",color:"var(--s-vencida)",animation:"badgePulse 2s ease-in-out infinite"}}><Icon n="alerta" size={10}/> Archivo expira pronto</span>;
              if(warning)return<span className="pill" style={{background:"rgba(232,140,46,.12)",color:"var(--p-alta)"}}><Icon n="alerta" size={10}/> Archivo vence hoy</span>;
              return<span className="pill" style={{background:"var(--bg4)",color:"var(--muted2)"}}><Icon n="adjunto" size={10}/> {files.length}</span>;
            })()}
            {comments.length>0&&<span className="pill" style={{background:"rgba(155,127,232,.12)",color:"var(--s-revision)"}}><Icon n="comentar" size={10}/> {comments.length}</span>}
            {team&&(()=>{const tc=teamColor(team);return <span className="pill" style={{background:tc+"22",color:tc}}>{team.name}</span>;})()}
          </div>
          <h3 style={{fontSize:15,fontWeight:700,marginBottom:6}}>{task.title}</h3>
          <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:12,color:"var(--muted)",alignItems:"center"}}>
            {(()=>{const al=Array.isArray(task.assigned_to)?task.assigned_to:[task.assigned_to].filter(Boolean);return al.map(id=>users.find(u=>u.id===id)).filter(Boolean).map(u=>(<span key={u.id} style={{display:"flex",alignItems:"center",gap:4}}><Av u={u} size={18}/><span>{u.name}</span></span>));})()}
            {(()=>{const dr=fmtDateRelative(task.due_date,effStatus);return(<span style={{color:dr.color,fontWeight:dr.urgent?700:400,background:dr.urgent?"rgba(240,107,107,.08)":"transparent",padding:dr.urgent?"2px 6px":"0",borderRadius:5}}><Icon n="tiempo" size={11} style={{marginRight:3}}/>{dr.label}</span>);})()}
            {localStatus==="en_progreso"&&task.started_at
              ?<ActiveTimer startedAt={task.started_at} hoursReal={task.hours_real}/>
              :task.hours>0&&<span>⏱ {task.hours}h</span>}
            {task.hours_real>0&&localStatus!=="en_progreso"&&<span style={{color:"var(--s-completada)"}}>✓ {task.hours_real}h real</span>}
            {lastActivity&&<span style={{color:"var(--muted)",fontSize:11}}>{lastActivity}</span>}
          </div>
        </div>
        <span className="task-open-hint">Ver detalle <Icon n="flecha_der" size={11}/></span>
      </div>

      {/* TASK DETAIL MODAL */}
      {modal&&(
        <ModalPortal>
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget){setModal(false);if(onForceClose)onForceClose();}}}>
          <div className="modal fade-in" onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,gap:12}}>
              <div style={{flex:1}}>
                {task.order_number&&(
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <span style={{fontSize:12,fontWeight:700,padding:"3px 10px",borderRadius:999,background:"var(--accent-dim)",color:"var(--accent)",fontFamily:"monospace"}}>{"AC-"+String(task.order_number).padStart(4,"0")+" "+task.title}</span>
                    <button onClick={(e)=>{navigator.clipboard.writeText("AC-"+String(task.order_number).padStart(4,"0")+" "+task.title);e.target.textContent="✓";e.target.style.color="var(--green)";setTimeout(()=>{e.target.textContent="⎘";e.target.style.color="";},1500);}} style={{background:"var(--bg3)",border:"none",cursor:"pointer",color:"var(--muted)",fontSize:13,padding:"2px 6px",borderRadius:6}}>⎘</button>
                  </div>
                )}
                {editing
                  ?<input value={editForm.title||task.title} onChange={e=>setEditForm(f=>({...f,title:e.target.value}))} style={{fontSize:18,fontWeight:700,width:"100%",marginBottom:4}}/>
                  :<h2 style={{fontSize:20,fontWeight:700}}>{task.title}</h2>
                }
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0,alignItems:"center"}}>
                {isDir&&!editing&&<button onClick={()=>{setEditing(true);setEditForm({title:task.title,description:task.description||"",materials:task.materials||"",hours:task.hours,due_date:task.due_date,priority:task.priority});}} style={{background:"var(--accent-dim)",border:"none",cursor:"pointer",color:"var(--accent)",fontSize:13,padding:"5px 12px",borderRadius:8,fontFamily:"inherit"}}><Icon n="editar" size={14}/> Editar</button>}
                {editing&&<button onClick={saveEdit} style={{background:"var(--green)",border:"none",cursor:"pointer",color:"#fff",fontSize:13,padding:"5px 12px",borderRadius:8,fontFamily:"inherit",fontWeight:600}}>Guardar</button>}
                {editing&&<button onClick={()=>setEditing(false)} style={{background:"var(--bg3)",border:"none",cursor:"pointer",color:"var(--muted)",fontSize:13,padding:"5px 12px",borderRadius:8,fontFamily:"inherit"}}>Cancelar</button>}
                <button onClick={(e)=>{e.stopPropagation();setModal(false);setEditing(false);if(onForceClose)onForceClose();}} style={{background:"var(--bg3)",border:"none",cursor:"pointer",color:"var(--muted)",fontSize:18,padding:"4px 10px",borderRadius:8}}>✕</button>
              </div>
            </div>

            {/* STATUS BUTTONS */}
            {(isDir||(Array.isArray(task.assigned_to)?task.assigned_to:[task.assigned_to]).includes(me.id))&&(
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:16}}>
                {[
                  {v:"pendiente",icon:"pendiente",label:"Pendiente",c:"var(--s-pendiente)",bg:"var(--s-pendiente-bg)"},
                  {v:"en_progreso",icon:"progreso",label:"En progreso",c:"var(--s-progreso)",bg:"var(--s-progreso-bg)"},
                  {v:"en_pausa",icon:"pausa",label:"En pausa",c:"var(--s-pausa)",bg:"var(--s-pausa-bg)"},
                  {v:"en_revision",icon:"revision",label:"Revisión",c:"var(--s-revision)",bg:"var(--s-revision-bg)"},
                  {v:"completada",icon:"completada",label:"Completada",c:"var(--s-completada)",bg:"var(--s-completada-bg)"},
                  ...(isDir?[{v:"vencida",icon:"vencida",label:"Vencida",c:"var(--s-vencida)",bg:"var(--s-vencida-bg)"}]:[])
                ].map(s=>(
                  <button key={s.v} data-status={s.v} onClick={()=>changeStatus(s.v)}
                    style={{padding:"5px 12px",borderRadius:7,fontSize:12,cursor:"pointer",fontFamily:"inherit",transition:".13s",
                      border:localStatus===s.v?`2px solid ${s.c}`:"1px solid var(--border)",
                      background:localStatus===s.v?s.bg:"transparent",
                      color:localStatus===s.v?s.c:"var(--muted)",
                      fontWeight:localStatus===s.v?700:400}}>
                    <Icon n={s.icon} size={14} style={{marginRight:4}}/>{s.label}
                  </button>
                ))}
              </div>
            )}

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              <div style={{background:"var(--bg3)",borderRadius:10,padding:"10px 14px"}}>
                <p style={{fontSize:11,color:"var(--muted)",marginBottom:4,textTransform:"uppercase",letterSpacing:".4px"}}>Responsables</p>
                {(Array.isArray(task.assigned_to)?task.assigned_to:[task.assigned_to].filter(Boolean)).map(id=>{const u=users.find(x=>x.id===id);return u?<span key={id} style={{display:"flex",alignItems:"center",gap:4,fontSize:13,marginBottom:2}}><div style={{width:18,height:18,borderRadius:"50%",background:u.avatar_color,fontSize:7,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>{u.initials}</div>{u.name}</span>:null;})}
              </div>
              <div style={{background:"var(--bg3)",borderRadius:10,padding:"10px 14px"}}>
                <p style={{fontSize:11,color:"var(--muted)",marginBottom:4,textTransform:"uppercase",letterSpacing:".4px"}}>Fechas y horas</p>
                <p style={{fontSize:13}}><Icon n="tiempo" size={12} style={{marginRight:4}}/>{(()=>{const dr=fmtDateRelative(task.due_date,effStatus);return <span style={{color:dr.color,fontWeight:dr.urgent?700:400}}>{dr.label}</span>;})()}</p>
                <p style={{fontSize:12,color:"var(--muted)",marginTop:2}}>⏱ Est: {task.hours||0}h {task.hours_real>0&&<span style={{color:"var(--green)"}}>· Real: {task.hours_real}h</span>}</p>
              </div>
            </div>

            {editing?(
              <>
                <div style={{marginBottom:12}}><p style={{fontSize:11,color:"var(--muted)",fontWeight:600,textTransform:"uppercase",letterSpacing:".4px",marginBottom:6}}>Brief</p><textarea value={editForm.description||""} onChange={e=>setEditForm(f=>({...f,description:e.target.value}))} style={{width:"100%",minHeight:80}}/></div>
                <div style={{marginBottom:12}}><p style={{fontSize:11,color:"var(--yellow)",fontWeight:600,marginBottom:6}}>📦 Materiales</p><textarea value={editForm.materials||""} onChange={e=>setEditForm(f=>({...f,materials:e.target.value}))} style={{width:"100%",minHeight:60}}/></div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
                  <div><p style={{fontSize:11,color:"var(--muted)",marginBottom:4}}>Horas est.</p><input type="number" value={editForm.hours||""} onChange={e=>setEditForm(f=>({...f,hours:e.target.value}))}/></div>
                  <div><p style={{fontSize:11,color:"var(--muted)",marginBottom:4}}>Fecha límite</p><input type="date" value={editForm.due_date||""} onChange={e=>setEditForm(f=>({...f,due_date:e.target.value}))}/></div>
                  <div><p style={{fontSize:11,color:"var(--muted)",marginBottom:4}}>Prioridad</p><select value={editForm.priority||"Normal"} onChange={e=>setEditForm(f=>({...f,priority:e.target.value}))}><option>Normal</option><option>Alta</option><option>Urgente</option></select></div>
                </div>
              </>
            ):(
              <>
                {task.description&&<div style={{background:"var(--bg3)",borderRadius:10,padding:"12px 14px",marginBottom:12}}><p style={{fontSize:11,color:"var(--muted)",fontWeight:600,textTransform:"uppercase",letterSpacing:".4px",marginBottom:6}}>Brief</p><Linkify text={task.description} style={{fontSize:13,color:"var(--muted2)",lineHeight:1.6,display:"block"}}/></div>}
                {task.materials&&<div style={{background:"rgba(245,158,11,.08)",border:"1px solid rgba(245,158,11,.2)",borderRadius:10,padding:"12px 14px",marginBottom:12}}><p style={{fontSize:11,color:"var(--yellow)",fontWeight:600,marginBottom:4}}>📦 Materiales</p><Linkify text={task.materials} style={{fontSize:13,color:"var(--muted2)",lineHeight:1.5,display:"block"}}/></div>}
              </>
            )}

            {task.files&&task.files.length>0&&(
              <div style={{background:"var(--bg3)",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:6}}>
                  <p style={{fontSize:11,color:"var(--muted)",fontWeight:600,textTransform:"uppercase",letterSpacing:".4px"}}>Archivos adjuntos</p>
                  <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:6,background:"rgba(232,140,46,.1)",border:"1px solid rgba(232,140,46,.25)"}}>
                    <Icon n="alerta" size={12} color="var(--p-alta)"/>
                    <span style={{fontSize:11,color:"var(--p-alta)",fontWeight:600}}>Los archivos se eliminan a las 48h de subidos.</span>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-start"}}>
                  {task.files.map((f,idx)=>{
                    const fileName=typeof f==="object"?f.name:f;
                    const fileUrl=typeof f==="object"?f.url:null;
                    const uploadedAt=typeof f==="object"&&f.uploaded_at?new Date(f.uploaded_at):null;
                    const fileExt=(fileName||"").split(".").pop().toLowerCase();
                    const isImg=["jpg","jpeg","png","gif","webp","svg"].includes(fileExt);
                    const expiryInfo=(()=>{
                      if(!uploadedAt)return null;
                      const expiry=new Date(uploadedAt.getTime()+48*3600000);const remaining=expiry-Date.now();
                      if(remaining<=0)return{label:"Expirado",color:"var(--s-vencida)",urgent:true};
                      const h=Math.floor(remaining/3600000);const m=Math.floor((remaining%3600000)/60000);
                      if(h<6)return{label:`${h}h ${m}m restantes`,color:"var(--s-vencida)",urgent:true};
                      if(h<24)return{label:`${h}h restantes`,color:"var(--p-alta)",urgent:false};
                      return{label:`${h}h restantes`,color:"var(--muted)",urgent:false};
                    })();
                    if(isImg&&fileUrl)return(
                      <div key={idx} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                        <div style={{position:"relative"}}>
                          <img src={fileUrl} alt={fileName} className="img-preview" onClick={()=>setImgPreview(fileUrl)} title={fileName}/>
                          {expiryInfo?.urgent&&<div style={{position:"absolute",top:2,right:2,background:"var(--s-vencida)",borderRadius:3,padding:"1px 4px",fontSize:9,color:"#fff",fontWeight:700}}>{expiryInfo.label.replace(" restantes","")}</div>}
                        </div>
                        <span style={{fontSize:10,color:"var(--muted)",maxWidth:64,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{fileName}</span>
                        {expiryInfo&&<span style={{fontSize:9,color:expiryInfo.color,fontFamily:"var(--font-mono)",fontWeight:600}}>{expiryInfo.label}</span>}
                      </div>
                    );
                    return fileUrl?(
                      <div key={idx} style={{display:"flex",flexDirection:"column",gap:3}}>
                        <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                          style={{fontSize:12,padding:"6px 12px",background:"var(--bg4)",borderRadius:8,color:"var(--accent)",border:`1px solid ${expiryInfo?.urgent?"rgba(232,93,93,.3)":"rgba(232,197,71,.2)"}`,display:"flex",alignItems:"center",gap:6,textDecoration:"none"}}>
                          <Icon n="adjunto" size={12}/> {fileName} <span style={{fontSize:10,color:"var(--muted)"}}>↓</span>
                        </a>
                        {expiryInfo&&<span style={{fontSize:10,color:expiryInfo.color,fontFamily:"var(--font-mono)",fontWeight:600,paddingLeft:4}}>{expiryInfo.label}</span>}
                      </div>
                    ):(
                      <span key={idx} style={{fontSize:12,padding:"6px 12px",background:"var(--bg4)",borderRadius:8,color:"var(--muted2)",display:"flex",alignItems:"center",gap:6}}>
                        <Icon n="adjunto" size={12}/> {fileName}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TABS */}
            <div style={{display:"flex",gap:0,borderBottom:"1px solid var(--border)",marginBottom:14,marginTop:6}}>
              {[{v:"detalles",icon:"detalles",c:(task.history||[]).length},{v:"conversacion",icon:"comentar",c:comments.length}].map(t=>(
                <button key={t.v} onClick={()=>setActiveTab(t.v)}
                  style={{background:"none",border:"none",borderBottom:activeTab===t.v?"2px solid var(--accent)":"2px solid transparent",
                    padding:"8px 14px",cursor:"pointer",fontFamily:"inherit",fontSize:13,
                    color:activeTab===t.v?"var(--text)":"var(--muted)",fontWeight:activeTab===t.v?700:500,marginBottom:-1,transition:".13s"}}>
                  <Icon n={t.icon} size={13} style={{marginRight:5}}/>{t.v==="detalles"?"Detalles":"Conversación"}
                  {t.c>0&&<span style={{marginLeft:6,fontSize:10,padding:"1px 6px",borderRadius:10,background:activeTab===t.v?"var(--accent)":"var(--bg4)",color:activeTab===t.v?"#0d0d0d":"var(--muted2)",fontWeight:700,fontFamily:"var(--font-mono)"}}>{t.c}</span>}
                </button>
              ))}
            </div>

            {activeTab==="detalles"&&(
              <div style={{background:"var(--bg3)",borderRadius:10,padding:"12px 14px"}}>
                <p style={{fontSize:11,color:"var(--muted)",fontWeight:600,textTransform:"uppercase",letterSpacing:".4px",marginBottom:8}}>Historial</p>
                {(task.history||[]).length===0?<p style={{fontSize:13,color:"var(--muted)"}}>Sin historial aun.</p>:(task.history||[]).map((h,i)=><p key={i} style={{fontSize:12,color:"var(--muted2)",padding:"4px 0",borderBottom:"1px solid var(--border)"}}><span style={{color:"var(--muted)",fontSize:11,marginRight:6}}>#{i+1}</span><Linkify text={h}/></p>)}
              </div>
            )}

            {activeTab==="conversacion"&&(
              <div>
                <div style={{background:"var(--bg3)",borderRadius:10,padding:"12px 14px",maxHeight:360,overflowY:"auto",marginBottom:12}}>
                  {comments.length===0
                    ?<div style={{textAlign:"center",padding:"24px 12px",color:"var(--muted)",fontSize:13}}>
                      <div style={{fontSize:32,opacity:.4,marginBottom:6}}><Icon n="comentar" size={32} color="currentColor"/></div>
                      Aún no hay conversación.
                    </div>
                    :comments.map(c=>{
                      const isMe=c.user_id===me.id;
                      const author=users.find(u=>u.id===c.user_id);
                      const mentioned=Array.isArray(c.mentions)&&c.mentions.includes(me.id);
                      const t=new Date(c.created_at);
                      const timeStr=t.toLocaleString("es-GT",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
                      return(
                        <div key={c.id} style={{display:"flex",gap:9,padding:"8px 0",borderBottom:"1px solid var(--border)",alignItems:"flex-start",
                          background:mentioned?"rgba(232,197,71,.04)":"transparent",
                          borderLeft:mentioned?"2px solid var(--accent)":"2px solid transparent",
                          paddingLeft:mentioned?8:0,marginLeft:mentioned?-8:0}}>
                          <Av u={author||{initials:c.user_name?.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()||"?",avatar_color:c.user_color||"#888"}} size={28}/>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:2,flexWrap:"wrap"}}>
                              <span style={{fontSize:12,fontWeight:700,color:c.user_color||(author?.avatar_color)||"var(--text)"}}>{c.user_name||author?.name||"?"}</span>
                              {isMe&&<span style={{fontSize:9,color:"var(--muted)",padding:"1px 5px",background:"var(--bg4)",borderRadius:3,fontFamily:"var(--font-mono)"}}>tú</span>}
                              {mentioned&&!isMe&&<span style={{fontSize:9,color:"var(--accent)",fontWeight:700,fontFamily:"var(--font-mono)"}}>@MENCIÓN</span>}
                              <span style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{timeStr}</span>
                            </div>
                            <div style={{fontSize:13,color:"var(--text)",lineHeight:1.5,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
                              {(()=>{
                                const parts=c.text.split(/(@\w+|https?:\/\/[^\s]+)/g);
                                return parts.map((p,i)=>{
                                  if(p.startsWith("@")){const name=p.slice(1).toLowerCase();const u=users.find(x=>x.name.split(" ")[0].toLowerCase()===name);return u?<span key={i} style={{color:u.avatar_color,fontWeight:700,background:u.avatar_color+"1a",padding:"0 4px",borderRadius:3}}>{p}</span>:<span key={i}>{p}</span>;}
                                  if(p.match(/^https?:\/\//))return <a key={i} href={p} target="_blank" rel="noopener noreferrer" style={{color:"var(--accent)",textDecoration:"underline",textDecorationStyle:"dotted",wordBreak:"break-all"}}>{p}</a>;
                                  return <span key={i}>{p}</span>;
                                });
                              })()}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  <div ref={commentsEndRef}/>
                </div>
                <div style={{position:"relative"}}>
                  <textarea ref={textareaRef} value={commentText} onChange={handleCommentInput} onKeyDown={onCommentKey}
                    placeholder="Comenta cambios, menciona con @nombre, comparte links..."
                    style={{minHeight:70,fontSize:13,paddingRight:80,resize:"vertical"}}/>
                  <button onClick={postComment} disabled={!commentText.trim()||sendingComment}
                    style={{position:"absolute",right:8,bottom:8,padding:"6px 14px",
                      background:commentText.trim()?"var(--accent)":"var(--bg4)",
                      color:commentText.trim()?"#0d0d0d":"var(--muted)",
                      fontWeight:700,fontSize:12,border:"none",borderRadius:6,
                      cursor:commentText.trim()?"pointer":"not-allowed",fontFamily:"inherit",transition:".13s"}}>
                    {sendingComment?"...":"Enviar"}
                  </button>
                  {mentionState.open&&(()=>{
                    const matches=users.filter(u=>u.name.toLowerCase().includes(mentionState.query)).slice(0,5);
                    if(matches.length===0)return null;
                    return(
                      <div style={{position:"absolute",bottom:"100%",left:0,marginBottom:4,background:"var(--bg2)",border:"1px solid var(--border2)",borderRadius:8,padding:4,minWidth:200,boxShadow:"0 8px 24px rgba(0,0,0,.4)",zIndex:10}}>
                        {matches.map(u=>(
                          <div key={u.id} onClick={()=>insertMention(u)}
                            style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",cursor:"pointer",borderRadius:5,transition:".1s"}}
                            onMouseEnter={e=>e.currentTarget.style.background="var(--bg3)"}
                            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                            <Av u={u} size={22}/>
                            <span style={{fontSize:13,fontWeight:600}}>{u.name}</span>
                            <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)",marginLeft:"auto"}}>@{u.name.split(" ")[0].toLowerCase()}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                <p style={{fontSize:11,color:"var(--muted)",marginTop:6,fontFamily:"var(--font-mono)"}}>⌘+Enter para enviar · @nombre para mencionar</p>
              </div>
            )}

            {isDir&&(
              <div style={{display:"flex",gap:8,marginTop:14,justifyContent:"flex-end",flexWrap:"wrap"}}>
                <button className="btn btn-ghost btn-sm" onClick={()=>setShowReassign(true)}><Icon n="equipo2" size={14}/> Reasignar</button>
                <button className="btn btn-ghost btn-sm" onClick={()=>setShowAddChange(true)}><Icon n="cambio" size={14}/> + Cambio</button>
                <button className="btn btn-ghost btn-sm" onClick={()=>duplicateTask(task,token,()=>{onRefresh();})}><Icon n="duplicar" size={14}/> Duplicar</button>
                <button className="btn btn-danger btn-sm" onClick={del}><Icon n="eliminar" size={14}/> Eliminar</button>
              </div>
            )}
          </div>
        </div>
        </ModalPortal>
      )}
      {showAddChange&&<AddChangeModal task={task} token={token} me={me} onClose={()=>setShowAddChange(false)} onRefresh={onRefresh}/>}
      {pausePrompt&&ReactDOM.createPortal(
        <div className="confirm-overlay" onClick={e=>e.target===e.currentTarget&&setPausePrompt(false)}>
          <div className="confirm-box fade-in" style={{maxWidth:420}}>
            <h3 style={{fontSize:16,fontWeight:700,marginBottom:4,fontFamily:"var(--font-display)"}}>¿Por qué pausas esta orden?</h3>
            <p style={{fontSize:12,color:"var(--muted)",marginBottom:16,fontFamily:"var(--font-mono)"}}>{task.title}</p>
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
              {["Cambió la prioridad","Continúa otro día","Esperando algo (material/feedback)"].map(motivo=>(
                <button key={motivo} onClick={()=>{setPausePrompt(false);changeStatus("en_pausa",motivo);}}
                  style={{textAlign:"left",padding:"11px 14px",borderRadius:8,background:"var(--bg3)",border:"1px solid var(--border)",color:"var(--text)",fontSize:13,cursor:"pointer",fontFamily:"var(--font-body)",transition:".13s"}}
                  onMouseEnter={e=>{e.currentTarget.style.background="var(--bg4)";e.currentTarget.style.borderColor="var(--border2)";}}
                  onMouseLeave={e=>{e.currentTarget.style.background="var(--bg3)";e.currentTarget.style.borderColor="var(--border)";}}>
                  {motivo}
                </button>
              ))}
              <OtherReasonInput onSubmit={(txt)=>{setPausePrompt(false);changeStatus("en_pausa",txt);}}/>
            </div>
            <div style={{display:"flex",justifyContent:"flex-end"}}>
              <button className="btn btn-ghost btn-sm" onClick={()=>setPausePrompt(false)}>Cancelar</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {showReassign&&<ReassignModal task={task} users={users} teams={teams} token={token} me={me} onClose={()=>setShowReassign(false)} onRefresh={onRefresh}/>}
      {imgPreview&&ReactDOM.createPortal(
        <div onClick={()=>setImgPreview(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.9)",zIndex:900,display:"flex",alignItems:"center",justifyContent:"center",cursor:"zoom-out"}}>
          <img src={imgPreview} alt="" style={{maxWidth:"90vw",maxHeight:"90vh",borderRadius:8,boxShadow:"0 0 80px rgba(0,0,0,.8)"}}/>
        </div>,
        document.body
      )}
    </div>
  );
}

/* ── CREATE TASK ── */
