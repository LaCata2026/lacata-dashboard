import{useState,useEffect,useRef,useCallback}from'react'
import ReactDOM from'react-dom'
import{sb,teamColor,COLLAB_COLORS,COLORS,MARCAS_PREDEFINIDAS,getInitials,autoColor}from'../lib/supabase'
import{showToast}from'../components/Toast'
import{showConfirm}from'../components/ConfirmDialog'
import UserTeamRow from'../components/UserTeamRow'
import Icon from'../components/Icon'
import{Av,SC,BackBtn,Linkify,ActiveTimer,StatusLegend}from'../components/Shared'
import{statusLabel,statusPill,statusColor,prioPill,fmtDate,fmtDateRelative,useSessionFilters}from'../lib/utils'
function ModalPortal({children}){const el=useRef(document.createElement("div"));useEffect(()=>{document.body.appendChild(el.current);return()=>document.body.removeChild(el.current)},[]);return ReactDOM.createPortal(children,el.current)}
export default function AdminView({users,teams,tasks,token,onRefresh,onBack,onViewUser,setUsers}){
  const [showNewUser,setShowNewUser]=useState(false);
  const [showNewTeam,setShowNewTeam]=useState(false);
  const [editingTeam,setEditingTeam]=useState(null);
  const [uForm,setUForm]=useState({name:"",email:"",role:"colaborador",team_id:"",team_ids:[],avatar_color:COLLAB_COLORS[0]});
  const [tForm,setTForm]=useState({name:"",color:"#7c3aed",icon:"equipos"});
  const [loading,setLoading]=useState(false);
  const [secOpen,setSecOpen]=useState({equipos:true,directores:true,cuentas:true,colaboradores:true});
  const [showInactive,setShowInactive]=useState(false);
  const toggleSec=(k)=>setSecOpen(s=>({...s,[k]:!s[k]}));
  const setU=k=>e=>{
    const val=e.target.value;
    setUForm(f=>{
      const upd={...f,[k]:val};
      if(k==="email")upd.avatar_color=autoColor(val);
      return upd;
    });
  };
  const setT=k=>e=>setTForm(f=>({...f,[k]:e.target.value}));

  const TEAM_ICONS=["equipos","editar","progreso","desempeno","completada","semaforo","vencida","nueva","flecha_der","buscar","carga","marca","adjunto","comentar","detalles"];

  async function createUser(){
    if(!uForm.name||!uForm.email){alert("Nombre y correo son obligatorios.");return;}
    setLoading(true);
    try{
      const authUser=await sb.inviteUser(uForm.email,uForm.name);
      if(!authUser||!authUser.id)throw new Error(authUser.msg||"No se pudo crear el usuario");
      const initials=getInitials(uForm.name);
      const color=uForm.avatar_color||autoColor(uForm.email);
      const teamId=uForm.role==="cuentas"?(uForm.team_ids&&uForm.team_ids[0]||null):uForm.team_id||null;
      const teamIds=uForm.role==="cuentas"?(uForm.team_ids||[]):null;
      await sb.insert("usuarios",{id:authUser.id,email:uForm.email.toLowerCase(),name:uForm.name,role:uForm.role,team_id:teamId,team_ids:teamIds,avatar_color:color,initials,activo:true},token);
      showToast("Invitacion enviada a "+uForm.email,"success");
      setUForm({name:"",email:"",role:"colaborador",team_id:"",team_ids:[],avatar_color:COLLAB_COLORS[0]});
      setShowNewUser(false);
      onRefresh();
    }catch(e){showToast("Error: "+e.message,"error");}
    setLoading(false);
  }

  async function createTeam(){
    if(!tForm.name){alert("El nombre del equipo es obligatorio.");return;}
    setLoading(true);
    try{
      await sb.insert("equipos",{name:tForm.name,color:tForm.color,icon:tForm.icon||"equipos"},token);
      showToast("Equipo creado","success");
      setTForm({name:"",color:"#7c3aed",icon:"equipos"});
      setShowNewTeam(false);
      onRefresh();
    }catch(e){showToast("Error: "+e.message,"error");}
    setLoading(false);
  }

  async function saveTeamEdit(){
    if(!editingTeam)return;
    await sb.update("equipos",editingTeam.id,{name:editingTeam.name,color:editingTeam.color,icon:editingTeam.icon||"equipos"},token);
    showToast("Equipo actualizado","success");
    setEditingTeam(null);
    onRefresh();
  }

  // SOFT DELETE — marca activo=false en lugar de borrar
  // El usuario queda en la BD para auditoria de órdenes históricas
  async function deleteUser(u){
    const ok=await showConfirm(
      `¿Desactivar a ${u.name}?`,
      {
        title:"Desactivar usuario",
        confirmLabel:"Sí, desactivar",
        confirmColor:"var(--s-vencida)",
        detail:"El usuario no podrá entrar al sistema. Su historial de órdenes se conserva."
      }
    );
    if(!ok)return;
    try{
      await sb.update("usuarios",u.id,{activo:false},token);
      showToast(u.name+" desactivado","success");
      onRefresh();
    }catch(e){showToast("Error: "+e.message,"error");}
  }

  // REACTIVAR usuario previamente desactivado
  async function reactivateUser(u){
    try{
      await sb.update("usuarios",u.id,{activo:true},token);
      showToast(u.name+" reactivado","success");
      onRefresh();
    }catch(e){showToast("Error: "+e.message,"error");}
  }

  async function deleteTeam(t){
    if(!confirm("Eliminar el equipo "+t.name+"?"))return;
    await sb.del("equipos",t.id,token);
    showToast("Equipo eliminado","success");
    onRefresh();
  }

  async function changeUserRole(userId,newRole){
    await sb.update("usuarios",userId,{role:newRole},token);
    showToast("Rol actualizado","success");
    onRefresh();
  }

  async function changeUserTeam(userId,teamId){
    try{
      await sb.update("usuarios",userId,{team_id:teamId||null},token);
      showToast("Equipo actualizado","success");
      onRefresh();
    }catch(e){showToast("Error: "+e.message,"error");}
  }

  async function toggleUserTeam(userId,teamId,currentTeamIds,role){
    const ids=Array.isArray(currentTeamIds)&&currentTeamIds.length>0?currentTeamIds:[];
    const next=ids.includes(teamId)?ids.filter(x=>x!==teamId):[...ids,teamId];
    const primaryId=next.length>0?next[0]:null;
    setUsers(prev=>prev.map(u=>u.id===userId?{...u,team_ids:next,team_id:primaryId}:u));
    try{
      await sb.update("usuarios",userId,{team_ids:next,team_id:primaryId},token);
      showToast(next.length===0?"Sin equipos asignados":`${next.length} equipo${next.length>1?"s":""} asignado${next.length>1?"s":""}` ,"success");
      onRefresh();
    }catch(e){
      setUsers(prev=>prev.map(u=>u.id===userId?{...u,team_ids:ids,team_id:ids[0]||null}:u));
      showToast("Error al guardar: "+e.message,"error");
    }
  }

  // Separar activos e inactivos
  const activeUsers=users.filter(u=>u.activo!==false)
  const inactiveUsers=users.filter(u=>u.activo===false)

  return(
    <div>
      {onBack&&<BackBtn onClick={onBack}/>}
      <div className="section-header"><h2 className="section-title">Administracion</h2></div>

      {/* EQUIPOS */}
      <div className="card fade-in" style={{marginBottom:12}}>
        <div onClick={()=>toggleSec("equipos")} style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",userSelect:"none",marginBottom:secOpen.equipos?16:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{color:"var(--muted)",fontSize:13,transition:"transform .2s",display:"inline-block",transform:secOpen.equipos?"rotate(0)":"rotate(-90deg)"}}>▼</span>
            <h3 style={{fontSize:15,fontWeight:700}}>Equipos / Células</h3>
            <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>({teams.length})</span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={e=>{e.stopPropagation();setShowNewTeam(true);}}>+ Nuevo equipo</button>
        </div>
        {secOpen.equipos&&(
          <>
            {teams.length===0&&<p style={{color:"var(--muted)",fontSize:13,textAlign:"center",padding:20}}>No hay equipos aun.</p>}
            {teams.map(t=>{
              // Solo contar miembros ACTIVOS para métricas de carga
              const members=activeUsers.filter(u=>(u.team_id===t.id||(Array.isArray(u.team_ids)&&u.team_ids.includes(t.id)))&&u.role==="colaborador");
              const activeCount=tasks.filter(x=>x.team_id===t.id&&x.status!=="completada").length;
              const avg=members.length>0?activeCount/members.length:0;
              const overloaded=members.filter(u=>tasks.filter(x=>{const a=Array.isArray(x.assigned_to)?x.assigned_to:[x.assigned_to].filter(Boolean);return a.includes(u.id)&&x.status!=="completada";}).length>=7).length;
              const overdueCount=tasks.filter(x=>x.team_id===t.id&&x.status==="vencida").length;
              const sColor=overdueCount>0||overloaded>0?"var(--s-vencida)":avg>=4?"var(--load-warn)":"var(--load-ok)";
              const sLabel=overdueCount>0?`${overdueCount} vencida${overdueCount>1?"s":""}`:overloaded>0?`${overloaded} sobrecargado${overloaded>1?"s":""}`:avg>=4?`~${avg.toFixed(1)} t/persona`:"Carga normal";
              return(
                <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 0",borderBottom:"1px solid var(--border)",flexWrap:"wrap"}}>
                  <span style={{fontSize:16,flexShrink:0}}>{<Icon n={t.icon||"equipos"} size={16}/>}</span>
                  <div style={{width:9,height:9,borderRadius:"50%",background:teamColor(t),flexShrink:0}}/>
                  <span style={{flex:1,fontSize:14,fontWeight:600,minWidth:80}}>{t.name}</span>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:sColor,boxShadow:`0 0 5px ${sColor}`}}/>
                    <span style={{fontSize:11,color:sColor,fontWeight:600}}>{sLabel}</span>
                    <span style={{fontSize:11,color:"var(--muted)"}}>· {members.length} miembro{members.length!==1?"s":""}</span>
                    {activeCount>0&&<span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{activeCount} activas</span>}
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setEditingTeam({...t,icon:t.icon||"equipos"})}>Editar</button>
                  <button className="btn btn-danger btn-sm" onClick={()=>deleteTeam(t)}>Eliminar</button>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* USUARIOS ACTIVOS */}
      <div className="card fade-in">
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <h3 style={{fontSize:15,fontWeight:700}}>Usuarios ({activeUsers.length})</h3>
          <button className="btn btn-primary btn-sm" onClick={()=>setShowNewUser(true)}>+ Nuevo usuario</button>
        </div>
        {activeUsers.length===0&&<p style={{color:"var(--muted)",fontSize:13,textAlign:"center",padding:20}}>No hay usuarios aun.</p>}
        {[
          {role:"director",label:"Directores",color:"var(--role-director)",key:"directores"},
          {role:"cuentas",label:"Cuentas",color:"var(--role-cuentas)",key:"cuentas"},
          {role:"colaborador",label:"Colaboradores",color:"var(--role-colab)",key:"colaboradores"},
        ].map(({role,label,color,key})=>{
          const group=activeUsers.filter(u=>u.role===role);
          if(group.length===0)return null;
          const isOpen=secOpen[key]!==false;
          return(
            <div key={role} style={{marginBottom:6,background:"var(--bg3)",borderRadius:8,overflow:"hidden"}}>
              <div onClick={()=>toggleSec(key)}
                style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",cursor:"pointer",userSelect:"none",borderLeft:`3px solid ${color}`}}>
                <span style={{color:"var(--muted)",fontSize:11,transition:"transform .2s",display:"inline-block",transform:isOpen?"rotate(0)":"rotate(-90deg)"}}>▼</span>
                <div style={{width:6,height:6,borderRadius:"50%",background:color,flexShrink:0}}/>
                <span style={{fontSize:11,fontWeight:700,color,textTransform:"uppercase",letterSpacing:".08em",fontFamily:"var(--font-mono)",flex:1}}>{label}</span>
                <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{group.length}</span>
              </div>
              {isOpen&&group.map(u=>(
                <UserTeamRow key={u.id} u={u} teams={teams} tasks={tasks} token={token}
                  onRefresh={onRefresh} onViewUser={onViewUser}
                  changeUserRole={changeUserRole} deleteUser={deleteUser}/>
              ))}
            </div>
          );
        })}
      </div>

      {/* USUARIOS INACTIVOS — solo se muestran si existen */}
      {inactiveUsers.length>0&&(
        <div className="card fade-in" style={{marginTop:12,opacity:.85}}>
          <div onClick={()=>setShowInactive(s=>!s)}
            style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",userSelect:"none"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{color:"var(--muted)",fontSize:13,transition:"transform .2s",display:"inline-block",transform:showInactive?"rotate(0)":"rotate(-90deg)"}}>▼</span>
              <h3 style={{fontSize:14,fontWeight:700,color:"var(--muted)"}}>Usuarios desactivados</h3>
              <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>({inactiveUsers.length})</span>
            </div>
            <span style={{fontSize:11,color:"var(--muted)"}}>Su historial de órdenes está preservado</span>
          </div>
          {showInactive&&(
            <div style={{marginTop:12}}>
              {inactiveUsers.map(u=>(
                <div key={u.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid var(--border)",flexWrap:"wrap",opacity:.7}}>
                  <Av u={u} size={30}/>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:13,fontWeight:600,color:"var(--muted2)"}}>{u.name}</p>
                    <p style={{fontSize:11,color:"var(--muted)"}}>{u.email} · <span style={{textTransform:"capitalize"}}>{u.role}</span></p>
                  </div>
                  <span style={{fontSize:10,padding:"2px 8px",borderRadius:4,background:"var(--bg4)",color:"var(--muted)",fontFamily:"var(--font-mono)",fontWeight:700,border:"1px solid var(--border)"}}>INACTIVO</span>
                  <button className="btn btn-ghost btn-sm" onClick={()=>reactivateUser(u)}>
                    <Icon n="check" size={13}/> Reactivar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL NUEVO USUARIO */}
      {showNewUser&&(
        <ModalPortal>
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowNewUser(false)}>
          <div className="modal fade-in" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">Nuevo usuario</div>
            <div className="form-group"><label className="form-label">Nombre completo *</label><input value={uForm.name} onChange={setU("name")} placeholder="Ej: Lucia Mendoza"/></div>
            <div className="form-group"><label className="form-label">Correo *</label><input type="email" value={uForm.email} onChange={setU("email")} placeholder="lucia@lacata.com"/></div>
            <div className="form-group"><label className="form-label">Rol</label>
              <select value={uForm.role} onChange={setU("role")}>
                <option value="colaborador">Colaborador</option>
                <option value="cuentas">Cuentas</option>
                <option value="director">Director</option>
              </select>
            </div>
            {uForm.role==="cuentas"?(
              <div className="form-group">
                <label className="form-label">Equipos (puede gestionar múltiples)</label>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6}}>
                  {teams.map(t=>{
                    const sel=(uForm.team_ids||[]).includes(t.id);
                    return(
                      <button key={t.id} type="button" onClick={()=>setUForm(f=>({...f,team_ids:sel?(f.team_ids||[]).filter(x=>x!==t.id):[...(f.team_ids||[]),t.id]}))}
                        style={{padding:"5px 12px",borderRadius:6,fontSize:12,cursor:"pointer",fontFamily:"inherit",background:sel?teamColor(t):"var(--bg4)",color:sel?"#fff":"var(--muted2)",border:sel?"none":"1px solid var(--border)",fontWeight:sel?700:400,transition:".13s"}}>
                        {<Icon n={t.icon||"equipos"} size={16}/>} {t.name}
                      </button>
                    );
                  })}
                </div>
                {(uForm.team_ids||[]).length===0&&<p style={{fontSize:11,color:"var(--muted)",marginTop:6}}>Sin restricción — verá todos los equipos</p>}
              </div>
            ):(
              <div className="form-group"><label className="form-label">Equipo</label>
                <select value={uForm.team_id} onChange={setU("team_id")}>
                  <option value="">Sin equipo</option>
                  {teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Color de avatar (auto-asignado · puedes cambiar)</label>
              <div style={{display:"flex",gap:7,flexWrap:"wrap",marginTop:6}}>
                {COLLAB_COLORS.map(c=>(
                  <div key={c} onClick={()=>setUForm(f=>({...f,avatar_color:c}))}
                    style={{width:26,height:26,borderRadius:5,background:c,cursor:"pointer",border:uForm.avatar_color===c?"2px solid #f2f0eb":"2px solid transparent",transform:uForm.avatar_color===c?"scale(1.18)":"scale(1)",transition:".15s"}}/>
                ))}
              </div>
            </div>
            {uForm.name&&(
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,padding:12,background:"var(--bg3)",borderRadius:10}}>
                <Av u={{initials:getInitials(uForm.name),avatar_color:uForm.avatar_color}} size={36}/>
                <div><p style={{fontSize:13,fontWeight:600}}>{uForm.name}</p><p style={{fontSize:12,color:"var(--muted)"}}>{uForm.role}{uForm.role==="cuentas"&&(uForm.team_ids||[]).length>0?` · ${(uForm.team_ids||[]).length} equipos`:""}</p></div>
              </div>
            )}
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button className="btn btn-ghost" onClick={()=>setShowNewUser(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={createUser} disabled={loading}>{loading?"Enviando...":"Enviar invitacion"}</button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* MODAL NUEVO EQUIPO */}
      {showNewTeam&&(
        <ModalPortal>
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowNewTeam(false)}>
          <div className="modal fade-in" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">Nuevo equipo</div>
            <div className="form-group"><label className="form-label">Nombre *</label><input value={tForm.name} onChange={setT("name")} placeholder="Ej: Celula Estrategia"/></div>
            <div className="form-group">
              <label className="form-label">Icono</label>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {TEAM_ICONS.map(ic=>(
                  <button key={ic} type="button" onClick={()=>setTForm(f=>({...f,icon:ic}))}
                    style={{fontSize:20,padding:"6px 10px",borderRadius:8,background:tForm.icon===ic?"var(--accent)":"var(--bg3)",border:tForm.icon===ic?"none":"1px solid var(--border)",cursor:"pointer"}}>
                    {ic}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Color</label>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:6}}>
                {COLORS.map(c=>(
                  <div key={c} onClick={()=>setTForm(f=>({...f,color:c}))}
                    style={{width:28,height:28,borderRadius:"50%",background:c,cursor:"pointer",border:tForm.color===c?"2px solid #fff":"2px solid transparent",transform:tForm.color===c?"scale(1.15)":"scale(1)",transition:".15s"}}/>
                ))}
              </div>
              {tForm.name&&<div style={{display:"flex",alignItems:"center",gap:8,marginTop:12}}>
                <span style={{fontSize:18}}>{tForm.icon}</span>
                <div style={{width:10,height:10,borderRadius:"50%",background:tForm.color}}/>
                <span style={{fontSize:13}}>{tForm.name}</span>
              </div>}
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button className="btn btn-ghost" onClick={()=>setShowNewTeam(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={createTeam} disabled={loading}>{loading?"Creando...":"Crear equipo"}</button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* MODAL EDITAR EQUIPO */}
      {editingTeam&&(
        <ModalPortal>
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setEditingTeam(null)}>
          <div className="modal fade-in" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">Editar equipo</div>
            <div className="form-group"><label className="form-label">Nombre</label><input value={editingTeam.name} onChange={e=>setEditingTeam(t=>({...t,name:e.target.value}))}/></div>
            <div className="form-group">
              <label className="form-label">Icono</label>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {TEAM_ICONS.map(ic=>(
                  <button key={ic} type="button" onClick={()=>setEditingTeam(t=>({...t,icon:ic}))}
                    style={{fontSize:20,padding:"6px 10px",borderRadius:8,background:editingTeam.icon===ic?"var(--accent)":"var(--bg3)",border:editingTeam.icon===ic?"none":"1px solid var(--border)",cursor:"pointer"}}>
                    {ic}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Color</label>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:6}}>
                {COLORS.map(c=>(
                  <div key={c} onClick={()=>setEditingTeam(t=>({...t,color:c}))}
                    style={{width:28,height:28,borderRadius:"50%",background:c,cursor:"pointer",border:editingTeam.color===c?"2px solid #fff":"2px solid transparent",transform:editingTeam.color===c?"scale(1.15)":"scale(1)",transition:".15s"}}/>
                ))}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginTop:12}}>
                <span style={{display:"flex",alignItems:"center",justifyContent:"center",width:24}}><Icon n={editingTeam.icon||"equipos"} size={18}/></span>
                <div style={{width:10,height:10,borderRadius:"50%",background:editingTeam.color}}/>
                <span style={{fontSize:13,fontWeight:500}}>{editingTeam.name}</span>
              </div>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button className="btn btn-ghost" onClick={()=>setEditingTeam(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveTeamEdit}>Guardar cambios</button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  );
}

/* ── TASK CARD ── */
