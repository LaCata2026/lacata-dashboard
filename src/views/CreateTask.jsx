import{useState,useEffect,useRef,useCallback}from'react'
import ReactDOM from'react-dom'
import{sb,teamColor,COLLAB_COLORS,COLORS,MARCAS_PREDEFINIDAS,getMarcas,getInitials,autoColor}from'../lib/supabase'
import{showToast}from'../components/Toast'
import{showConfirm}from'../components/ConfirmDialog'
import Icon from'../components/Icon'
import{Av,SC,BackBtn,Linkify,ActiveTimer,StatusLegend}from'../components/Shared'
import{statusLabel,statusPill,statusColor,prioPill,fmtDate,fmtDateRelative,useSessionFilters}from'../lib/utils'
function ModalPortal({children}){const el=useRef(document.createElement("div"));useEffect(()=>{document.body.appendChild(el.current);return()=>document.body.removeChild(el.current)},[]);return ReactDOM.createPortal(children,el.current)}

const MAX_SIZE=50*1024*1024

export default function CreateTask({users,teams,tasks,me,token,onCreated,onBack}){
  const blank={title:"",description:"",assigned_to:[],team_id:"",priority:"Normal",hours:"",due_date:"",status:"pendiente",materials:"",marca:""};
  const [form,setForm]=useState(blank);
  const [files,setFiles]=useState([]);
  const [loading,setLoading]=useState(false);
  const [showOtra,setShowOtra]=useState(false);
  const [errors,setErrors]=useState({});
  const set=k=>e=>setForm(f=>({...f,[k]:e.target.value}));

  // Filter teams visible to cuentas
  const isCuentas=me?.role==="cuentas"
  const myTeamIds=isCuentas?(Array.isArray(me?.team_ids)&&me.team_ids.length>0?me.team_ids:[me?.team_id].filter(Boolean)):null
  const visibleTeams=isCuentas&&myTeamIds?teams.filter(t=>myTeamIds.includes(t.id)):teams

  function validate(){
    const e={};
    if(!form.title.trim())e.title="Nombre del proyecto requerido";
    if(!form.marca)e.marca="Selecciona o escribe una marca";
    if(!form.description.trim())e.description="El brief es requerido";
    if(!form.assigned_to||form.assigned_to.length===0)e.assigned_to="Selecciona al menos un responsable";
    if(!form.due_date)e.due_date="Fecha límite requerida";
    setErrors(e);
    return Object.keys(e).length===0;
  }

  async function submit(){
    if(!validate())return;
    let finalTeamId=form.team_id;
    if(!finalTeamId&&form._teamFilter&&form._teamFilter!=="todos")finalTeamId=form._teamFilter;
    if(!finalTeamId&&form.assigned_to.length>0){
      const firstUser=users.find(u=>u.id===form.assigned_to[0]);
      finalTeamId=firstUser?.team_id||"";
    }
    setLoading(true);
    try{
      const existing=await sb.get("tareas","select=order_number&order=order_number.desc&limit=1",token);
      const lastNum=Array.isArray(existing)&&existing.length>0&&existing[0].order_number?existing[0].order_number:0;
      const orderNum=lastNum+1;
      const{_teamFilter,...formData}={...form,team_id:finalTeamId};

      // Upload files — use sb.upload (correct method name)
      let fileData=[];
      for(const file of files){
        if(file.size>MAX_SIZE){showToast("Archivo muy grande (max 50MB): "+file.name,"error");continue;}
        try{
          const path=`task-${orderNum}/${Date.now()}-${file.name}`;
          const url=await sb.upload("task-files",path,file,token);
          fileData.push({name:file.name,url,path,uploaded_at:new Date().toISOString()});
        }catch(e){
          console.warn("File upload failed:",file.name,e);
          showToast("No se pudo subir: "+file.name,"error");
        }
      }

      const taskData={
        title:       formData.title.trim(),
        description: formData.description.trim(),
        marca:       formData.marca||"",
        materials:   formData.materials||"",
        priority:    formData.priority||"Normal",
        status:      formData.status||"pendiente",
        hours:       Number(formData.hours)||0,
        due_date:    formData.due_date||null,
        team_id:     finalTeamId||null,
        assigned_to: Array.isArray(formData.assigned_to)?formData.assigned_to:formData.assigned_to?[formData.assigned_to]:[],
        order_number: orderNum,
        changes:     0,
        files:       fileData,
        comments:    [],
        history:     [`Orden AC-${String(orderNum).padStart(4,"0")} creada — ${new Date().toLocaleDateString("es-GT")}`],
        created_by:  me.id,
      };

      await sb.insert("tareas",taskData,token);
      showToast("Orden AC-"+String(orderNum).padStart(4,"0")+" creada ✓","success");
      setForm(blank);setFiles([]);setErrors({});
      onCreated();
    }catch(e){
      console.error("Error creando orden:",e);
      showToast("Error al crear: "+e.message,"error");
    }
    setLoading(false);
  }

  return(
    <div>
      {onBack&&<BackBtn onClick={onBack}/>}
      <div className="section-header"><h2 className="section-title">Nueva orden de trabajo</h2></div>
      <div className="card fade-in" style={{maxWidth:680}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:12}}>
          <div style={{gridColumn:"1/-1"}}>
            <label className="form-label">Nombre del proyecto *</label>
            <input value={form.title} onChange={e=>{set("title")(e);if(errors.title)setErrors(v=>({...v,title:""}));}} placeholder="Ej: Campaña verano Claro" className={errors.title?"field-error":""}/>
            {errors.title&&<p className="field-hint">{errors.title}</p>}
          </div>
          <div><label className="form-label">Marca / Cliente *</label>
            {(()=>{
              const existing=[...new Set(tasks.map(t=>t.marca).filter(Boolean))];
              const allMarcas=[...new Set([...getMarcas(),...existing])].sort();
              return(
                <>
                  <select value={showOtra?"__otra__":form.marca||""} onChange={e=>{
                    if(e.target.value==="__otra__"){setShowOtra(true);setForm(f=>({...f,marca:""}));}
                    else{setShowOtra(false);setForm(f=>({...f,marca:e.target.value}));}
                  }} style={{marginBottom:showOtra?6:0}}>
                    <option value="">— Seleccionar marca —</option>
                    {allMarcas.map(m=><option key={m} value={m}>{m}</option>)}
                    <option value="__otra__">✏️ Otra / cliente emergente</option>
                  </select>
                  {showOtra&&(
                    <div style={{display:"flex",gap:6,alignItems:"center",marginTop:6}}>
                      <input value={form.marca||""} onChange={set("marca")} placeholder="Nombre del cliente o marca nueva" autoFocus style={{flex:1}}/>
                      <button type="button" onClick={()=>{setShowOtra(false);setForm(f=>({...f,marca:""}));}} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:18,lineHeight:1,padding:"0 4px",flexShrink:0}}>×</button>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
          <div><label className="form-label">Equipo (manual)</label>
            <select value={form.team_id} onChange={e=>setForm(f=>({...f,team_id:e.target.value,_teamFilter:e.target.value||"todos"}))}>
              <option value="">Auto-detectar desde responsable</option>
              {visibleTeams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div style={{gridColumn:"1/-1"}}><label className="form-label">Brief y especificaciones *</label><textarea value={form.description} onChange={set("description")} placeholder="Entregables, formatos, dimensiones..."/></div>
          <div style={{gridColumn:"1/-1"}}>
            <label className="form-label">Responsables *</label>
            <div style={{background:"var(--bg3)",borderRadius:12,border:"1px solid var(--border)",padding:14}}>
              <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
                {visibleTeams.map(t=>(
                  <button key={t.id} type="button" onClick={()=>setForm(f=>({...f,_teamFilter:t.id,team_id:t.id}))}
                    style={{padding:"4px 12px",borderRadius:999,fontSize:12,cursor:"pointer",fontFamily:"inherit",background:form._teamFilter===t.id?teamColor(t):"var(--bg4)",color:form._teamFilter===t.id?"#fff":"var(--muted2)",border:"none"}}>
                    {t.name}
                  </button>
                ))}
                <button type="button" onClick={()=>setForm(f=>({...f,_teamFilter:"todos",team_id:""}))}
                  style={{padding:"4px 12px",borderRadius:999,fontSize:12,cursor:"pointer",fontFamily:"inherit",background:(!form._teamFilter||form._teamFilter==="todos")?"var(--accent)":"var(--bg4)",color:(!form._teamFilter||form._teamFilter==="todos")?"#fff":"var(--muted2)",border:"none"}}>
                  Todos
                </button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(72px,1fr))",gap:8}}>
                {users.filter(u=>{
                  if(u.role!=="colaborador")return false;
                  if(!form._teamFilter||form._teamFilter==="todos"){
                    // cuentas: only show users from their teams
                    if(isCuentas&&myTeamIds)return myTeamIds.includes(u.team_id)||(Array.isArray(u.team_ids)&&u.team_ids.some(id=>myTeamIds.includes(id)))
                    return true;
                  }
                  return u.team_id===form._teamFilter||(Array.isArray(u.team_ids)&&u.team_ids.includes(form._teamFilter));
                }).map(u=>{
                  const sel=(form.assigned_to||[]).includes(u.id);
                  const taskCount=tasks.filter(t=>{const a=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean);return a.includes(u.id)&&t.status!=="completada";}).length;
                  const loadColor=taskCount>=7?"var(--red)":taskCount>=5?"var(--yellow)":u.avatar_color;
                  return(
                    <button key={u.id} type="button" onClick={()=>{
                      const cur=form.assigned_to||[];
                      setForm(f=>({...f,assigned_to:sel?cur.filter(x=>x!==u.id):[...cur,u.id]}));
                    }} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"10px 6px",borderRadius:10,cursor:"pointer",fontFamily:"inherit",background:sel?"var(--accent-dim)":"var(--bg4)",border:sel?"2px solid var(--accent)":"2px solid transparent",position:"relative",transition:".15s"}}>
                      {sel&&<span style={{position:"absolute",top:4,right:4,fontSize:10,background:"var(--accent)",color:"#fff",borderRadius:"50%",width:14,height:14,display:"flex",alignItems:"center",justifyContent:"center"}}>✓</span>}
                      <div style={{width:36,height:36,borderRadius:"50%",background:u.avatar_color,fontSize:13,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>{u.initials}</div>
                      <span style={{fontSize:11,fontWeight:500,color:sel?"var(--purple2)":"var(--text)",textAlign:"center",lineHeight:1.2}}>{u.name.split(" ")[0]}</span>
                      <span style={{fontSize:10,color:loadColor,fontWeight:600}}>{taskCount} tareas</span>
                      <div style={{width:"100%",height:3,background:"var(--bg3)",borderRadius:2,overflow:"hidden"}}>
                        <div style={{width:Math.min(100,taskCount/8*100)+"%",height:"100%",background:loadColor,borderRadius:2}}/>
                      </div>
                    </button>
                  );
                })}
              </div>
              {(form.assigned_to||[]).length>0&&(
                <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid var(--border)",display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontSize:11,color:"var(--muted)"}}>Seleccionados:</span>
                  {(form.assigned_to||[]).map(id=>{
                    const u=users.find(x=>x.id===id);if(!u)return null;
                    return(
                      <span key={id} style={{display:"flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:5,background:"var(--accent)",color:"#0d0d0d",fontSize:12,fontWeight:600}}>
                        {u.name.split(" ")[0]}
                        <button type="button" onClick={()=>setForm(f=>({...f,assigned_to:(f.assigned_to||[]).filter(x=>x!==id)}))} style={{background:"none",border:"none",color:"#0d0d0d",cursor:"pointer",fontSize:12,padding:0,lineHeight:1,opacity:.7}}>×</button>
                      </span>
                    );
                  })}
                </div>
              )}
              {(()=>{
                if((form.assigned_to||[]).length===0)return null;
                let teamId=form.team_id;
                if(!teamId&&form._teamFilter&&form._teamFilter!=="todos")teamId=form._teamFilter;
                if(!teamId){const fu=users.find(u=>u.id===(form.assigned_to||[])[0]);teamId=fu?.team_id||"";}
                const detectedTeam=teams.find(t=>t.id===teamId);
                if(!detectedTeam)return null;
                const tc=teamColor(detectedTeam);
                return(
                  <div style={{marginTop:8,padding:"8px 12px",background:tc+"14",border:`1px solid ${tc}44`,borderRadius:7,display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:tc,flexShrink:0}}/>
                    <span style={{fontSize:12,color:"var(--muted2)"}}>
                      {form.team_id?"Equipo seleccionado:":form._teamFilter&&form._teamFilter!=="todos"?"Equipo del filtro:":"Equipo auto-detectado:"} <strong style={{color:tc}}>{detectedTeam.name}</strong>
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
          <div><label className="form-label">Prioridad</label>
            <select value={form.priority} onChange={set("priority")}><option>Normal</option><option>Alta</option><option>Urgente</option></select>
          </div>
          <div><label className="form-label">Horas estimadas</label><input type="number" value={form.hours} onChange={set("hours")} placeholder="Ej: 16" min="1"/></div>
          <div><label className="form-label">Fecha límite *</label><input type="date" value={form.due_date} onChange={set("due_date")}/></div>
          <div><label className="form-label">Estado inicial</label>
            <select value={form.status} onChange={set("status")}><option value="pendiente">Pendiente</option><option value="en_progreso">En progreso</option></select>
          </div>
          <div style={{gridColumn:"1/-1"}}>
            <label className="form-label">Materiales necesarios</label>
            <textarea value={form.materials||""} onChange={e=>setForm(f=>({...f,materials:e.target.value}))} placeholder="Lista de materiales, insumos o recursos necesarios..." style={{minHeight:70}}/>
          </div>
          <div style={{gridColumn:"1/-1"}}>
            <label className="form-label">Referencias / archivos</label>
            <label className="file-drop">
              <Icon n="adjunto" size={22} color="var(--muted)"/><span>Arrastra archivos o haz clic</span>
              <span style={{fontSize:12,color:"var(--muted)"}}>PDF, PNG, JPG, AI, MP4</span>
              <input type="file" multiple onChange={e=>setFiles([...e.target.files])}/>
            </label>
            {files.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>{files.map((f,i)=><span key={i} style={{fontSize:12,padding:"3px 10px",background:"var(--bg3)",borderRadius:999,color:"var(--muted2)"}}><Icon n="adjunto" size={11} style={{marginRight:4}}/>{f.name}</span>)}</div>}
          </div>
        </div>
        <button className="btn btn-primary" style={{width:"100%",marginTop:20,padding:13,fontSize:15,fontWeight:700}} onClick={submit} disabled={loading}>{loading?"Creando...":"Crear orden de trabajo"}</button>
      </div>
    </div>
  );
}
