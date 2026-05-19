import{useState,useMemo,useEffect}from'react'
import Icon from'../components/Icon'
import{Av,SC,BackBtn,StatusLegend}from'../components/Shared'
import{showToast}from'../components/Toast'
import{teamColor}from'../lib/supabase'
import TaskCard from'./TaskCard'

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
const SL={pendiente:"Pendiente",en_progreso:"En progreso",en_pausa:"En pausa",en_revision:"En revisión",completada:"Completada",vencida:"Vencida"}
const fmtH=h=>Number(h||0).toFixed(1)+"h"
const fmtD=s=>{if(!s)return"—";return new Date(s).toLocaleDateString("es-GT",{day:"2-digit",month:"short",year:"2-digit"})}
const eff=(est,real)=>{const e=Number(est),r=Number(real);if(!e||!r)return null;return Math.round(e/r*100)}
const effColor=e=>e==null?"var(--muted)":e>=90?"var(--green)":e>=70?"var(--yellow)":"var(--red)"
const effLabel=e=>e==null?"—":e+"%"

// Helper único para normalizar assigned_to (array o valor único)
const assignedOf=t=>Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean)

function getRangeLabel(period,offset){
  const now=new Date()
  let from,to
  if(period==="semana"){
    const ref=new Date(now);ref.setDate(ref.getDate()+offset*7)
    const day=ref.getDay(),diff=ref.getDate()-day+(day===0?-6:1)
    from=new Date(ref);from.setDate(diff);from.setHours(0,0,0,0)
    to=new Date(from);to.setDate(to.getDate()+6);to.setHours(23,59,59,999)
  }else{
    from=new Date(now.getFullYear(),now.getMonth()+offset,1)
    to=new Date(now.getFullYear(),now.getMonth()+offset+1,0,23,59,59,999)
  }
  return{from,to}
}

function taskHadActivity(t,range){
  const hist=Array.isArray(t.history)?t.history:[]
  const inRange=d=>d&&d>=range.from&&d<=range.to
  if(hist.some(e=>{
    const iso=e.match(/\d{4}-\d{2}-\d{2}T[\d:.-]+Z?/);if(iso)return inRange(new Date(iso[0]))
    const loc=e.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);if(loc)return inRange(new Date(`${loc[3]}-${loc[2].padStart(2,"0")}-${loc[1].padStart(2,"0")}`))
    return false
  }))return true
  if(inRange(t.started_at?new Date(t.started_at):null))return true
  if(inRange(t.created_at?new Date(t.created_at):null))return true
  return false
}

function filterByRange(tasks,range){return tasks.filter(t=>taskHadActivity(t,range))}

function exportCSV(rows,filename){
  const esc=v=>`"${String(v==null?"":v).replace(/"/g,'""')}"`
  const csv="\uFEFF"+rows.map(r=>r.map(esc).join(",")).join("\r\n")
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"})
  const url=URL.createObjectURL(blob)
  const a=document.createElement("a");a.href=url;a.download=filename
  document.body.appendChild(a);a.click();document.body.removeChild(a)
  URL.revokeObjectURL(url)
  showToast("CSV exportado","success")
}

/* ═══════════════════════════════════════════
   PERIOD BAR
═══════════════════════════════════════════ */
function PeriodBar({period,offset,onChange}){
  const{from,to}=getRangeLabel(period,offset)
  const o={day:"2-digit",month:"short"}
  return(
    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
      <div style={{display:"flex",background:"var(--bg3)",borderRadius:8,padding:3,gap:3}}>
        {["semana","mes"].map(p=>(
          <button key={p} onClick={()=>onChange(p,0)}
            style={{padding:"5px 14px",borderRadius:6,fontSize:12,cursor:"pointer",border:"none",fontFamily:"inherit",
              background:period===p?"var(--bg2)":"transparent",
              color:period===p?"var(--text)":"var(--muted)",fontWeight:period===p?600:400,transition:".13s"}}>
            {p==="semana"?"Semana":"Mes"}
          </button>
        ))}
      </div>
      <button onClick={()=>onChange(period,offset-1)} style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:6,padding:"5px 10px",cursor:"pointer",color:"var(--text)",fontSize:13}}>‹</button>
      <span style={{fontSize:12,color:"var(--muted)",fontFamily:"var(--font-mono)",minWidth:160,textAlign:"center"}}>
        {from.toLocaleDateString("es-GT",o)} – {to.toLocaleDateString("es-GT",o)}
        {offset===0&&<span style={{marginLeft:6,fontSize:10,background:"var(--accent)",color:"#fff",borderRadius:4,padding:"1px 6px",fontWeight:700}}>ACTUAL</span>}
      </span>
      <button onClick={()=>onChange(period,offset+1)} disabled={offset>=0}
        style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:6,padding:"5px 10px",cursor:offset>=0?"default":"pointer",color:offset>=0?"var(--border)":"var(--text)",fontSize:13}}>›</button>
    </div>
  )
}

/* ═══════════════════════════════════════════
   CHIP
═══════════════════════════════════════════ */
function Chip({label,value,color,sub}){
  return(
    <div style={{textAlign:"center",minWidth:60}}>
      <div style={{fontSize:18,fontWeight:800,color:color||"var(--text)",fontFamily:"var(--font-display)",lineHeight:1.1}}>{value}</div>
      <div style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)",marginTop:2,whiteSpace:"nowrap"}}>{label}</div>
      {sub&&<div style={{fontSize:10,color:color||"var(--muted)",fontFamily:"var(--font-mono)"}}>{sub}</div>}
    </div>
  )
}

/* ═══════════════════════════════════════════
   TAB 1 — CARGA EN TIEMPO REAL
   initialUser: usuario a preseleccionar al montar
   (viene de onViewUser en Dashboard, vía pageArg)
═══════════════════════════════════════════ */
function TabCarga({tasks,users,teams,myTeamIds,isCuentas,myProfile,token,onRefresh,initialUser}){
  const[viewMode,setViewMode]=useState("individual")

  // Si se recibe initialUser (navegación desde HomeView u otro componente),
  // arrancamos con ese usuario ya seleccionado — sin globals ni setTimeout.
  const[selectedUser,setSelectedUser]=useState(initialUser||null)

  const colabs=users.filter(u=>{
    if(u.role!=="colaborador")return false
    if(!isCuentas||!myTeamIds)return true
    return myTeamIds.includes(u.team_id)||(Array.isArray(u.team_ids)&&u.team_ids.some(id=>myTeamIds.includes(id)))
  })
  const sorted=[...colabs].sort((a,b)=>{
    const at=tasks.filter(t=>assignedOf(t).includes(a.id)&&t.status!=="completada").length
    const bt=tasks.filter(t=>assignedOf(t).includes(b.id)&&t.status!=="completada").length
    return bt-at
  })

  if(selectedUser){
    const u=selectedUser
    const team=teams.find(t=>t.id===u.team_id)
    const uTasks=tasks.filter(t=>assignedOf(t).includes(u.id))
    const ORDER=["vencida","en_revision","en_progreso","pendiente","en_pausa","completada"]
    const s=[...uTasks].sort((a,b)=>ORDER.indexOf(a.status)-ORDER.indexOf(b.status))
    const active=s.filter(t=>t.status!=="completada"),done=s.filter(t=>t.status==="completada")
    const hrs=uTasks.reduce((s,t)=>s+Number(t.hours_real||0),0)
    return(
      <div>
        <BackBtn onClick={()=>setSelectedUser(null)} label="← Carga"/>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20,padding:"16px 20px",background:"var(--bg2)",borderRadius:12,border:"1px solid var(--border)",borderLeft:`4px solid ${u.avatar_color||"var(--accent)"}`}}>
          <Av u={u} size={48}/>
          <div style={{flex:1}}>
            <h2 style={{fontSize:18,fontWeight:700,marginBottom:2}}>{u.name}</h2>
            <p style={{fontSize:12,color:"var(--muted)"}}>{team?.name||"Sin equipo"} · {u.email}</p>
          </div>
          <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
            {[{v:active.length,l:"Activas",c:"var(--s-progreso)"},{v:uTasks.filter(t=>t.status==="vencida").length,l:"Vencidas",c:"var(--s-vencida)"},{v:done.length,l:"Completadas",c:"var(--s-completada)"},{v:fmtH(hrs),l:"Hrs reales",c:"var(--accent)"}].map(({v,l,c})=>(
              <Chip key={l} label={l} value={v} color={c}/>
            ))}
          </div>
        </div>
        <StatusLegend/>
        {active.map(t=><TaskCard key={t.id} task={t} users={users} teams={teams} me={myProfile} token={token} onRefresh={onRefresh||(() => {})}/>)}
        {done.length>0&&<>
          <div style={{display:"flex",alignItems:"center",gap:10,margin:"16px 0 8px",opacity:.45}}>
            <div style={{flex:1,height:1,background:"var(--border)"}}/>
            <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>Completadas ({done.length})</span>
            <div style={{flex:1,height:1,background:"var(--border)"}}/>
          </div>
          {done.map(t=><TaskCard key={t.id} task={t} users={users} teams={teams} me={myProfile} token={token} onRefresh={onRefresh||(() => {})}/>)}
        </>}
      </div>
    )
  }

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div className="stat-grid" style={{flex:1}}>
          <SC label="Activas" value={tasks.filter(t=>t.status!=="completada").length} color="var(--blue)"/>
          <SC label="Completadas" value={tasks.filter(t=>t.status==="completada").length} color="var(--green)"/>
          <SC label="Vencidas" value={tasks.filter(t=>t.status==="vencida").length} color="var(--red)"/>
          <SC label="Horas totales" value={fmtH(tasks.reduce((s,t)=>s+Number(t.hours||0),0))} color="var(--accent)"/>
        </div>
        <div style={{display:"flex",gap:3,background:"var(--bg3)",borderRadius:8,padding:3}}>
          {[{v:"individual",l:"Individual"},{v:"equipo",l:"Por equipo"}].map(m=>(
            <button key={m.v} onClick={()=>setViewMode(m.v)}
              style={{padding:"5px 12px",borderRadius:6,fontSize:12,cursor:"pointer",fontFamily:"inherit",border:"none",
                background:viewMode===m.v?"var(--bg2)":"transparent",color:viewMode===m.v?"var(--text)":"var(--muted)",fontWeight:viewMode===m.v?600:400,transition:".13s"}}>
              {m.l}
            </button>
          ))}
        </div>
      </div>

      {viewMode==="individual"&&(
        <div className="card fade-in">
          <h3 style={{fontSize:15,fontWeight:700,marginBottom:16}}>Carga por colaborador</h3>
          {sorted.length===0&&<p style={{textAlign:"center",color:"var(--muted)",padding:20}}>No hay colaboradores aún.</p>}
          {sorted.map((u,i)=>{
            const ut=tasks.filter(t=>assignedOf(t).includes(u.id)&&t.status!=="completada")
            const uc=tasks.filter(t=>assignedOf(t).includes(u.id)&&t.status==="completada")
            const uv=tasks.filter(t=>assignedOf(t).includes(u.id)&&t.status==="vencida")
            const team=teams.find(t=>t.id===u.team_id)
            const pct=Math.min(100,Math.round(ut.length/8*100))
            const loadColor=ut.length>=7?"var(--s-vencida)":ut.length>=4?"var(--load-warn)":(team?teamColor(team):"var(--load-ok)")
            const uHrs=tasks.filter(t=>assignedOf(t).includes(u.id)).reduce((s,t)=>s+Number(t.hours_real||0),0)
            return(
              <div key={u.id} onClick={()=>setSelectedUser(u)}
                style={{display:"flex",alignItems:"center",gap:14,padding:"12px 10px",borderBottom:"1px solid var(--border)",cursor:"pointer",borderRadius:8,transition:".13s"}}
                onMouseEnter={e=>e.currentTarget.style.background="var(--bg3)"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span style={{fontSize:13,fontWeight:700,color:"var(--muted)",minWidth:22,fontFamily:"var(--font-mono)"}}>{i+1}</span>
                <Av u={u} size={36}/>
                <div style={{flex:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5,flexWrap:"wrap",gap:6}}>
                    <span style={{fontWeight:600,fontSize:13}}>{u.name}{team&&<span style={{fontWeight:400,color:"var(--muted)",fontSize:11,marginLeft:8}}>· {team.name}</span>}</span>
                    <div style={{display:"flex",gap:10,fontSize:12,fontFamily:"var(--font-mono)"}}>
                      <span style={{color:"var(--s-completada)"}}>✓ {uc.length}</span>
                      {uv.length>0&&<span style={{color:"var(--s-vencida)"}}>{uv.length} venc.</span>}
                      <span style={{color:"var(--muted)"}}>{fmtH(uHrs)}</span>
                    </div>
                  </div>
                  <div className="progress-bar"><div className="progress-fill" style={{width:`${pct}%`,background:loadColor,transition:"width .6s cubic-bezier(.4,0,.2,1)"}}/></div>
                </div>
                <span style={{fontSize:20,fontWeight:800,minWidth:28,textAlign:"right",color:loadColor,fontFamily:"var(--font-display)"}}>{ut.length}</span>
                <span style={{color:"var(--muted)",fontSize:12}}>→</span>
              </div>
            )
          })}
        </div>
      )}

      {viewMode==="equipo"&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:12}}>
          {(isCuentas&&myTeamIds?teams.filter(t=>myTeamIds.includes(t.id)):teams).map(team=>{
            const members=users.filter(u=>(u.team_id===team.id||(Array.isArray(u.team_ids)&&u.team_ids.includes(team.id)))&&u.role==="colaborador")
            const teamActive=tasks.filter(t=>t.team_id===team.id&&t.status!=="completada").length
            const teamDone=tasks.filter(t=>t.team_id===team.id&&t.status==="completada").length
            const teamOverdue=tasks.filter(t=>t.team_id===team.id&&t.status==="vencida").length
            const teamHours=tasks.filter(t=>t.team_id===team.id).reduce((s,t)=>s+Number(t.hours_real||0),0)
            const avgLoad=members.length>0?teamActive/members.length:0
            const health=teamOverdue>0||members.some(u=>tasks.filter(x=>assignedOf(x).includes(u.id)&&x.status!=="completada").length>=7)?"red":avgLoad>=4?"yellow":"green"
            const healthColor={red:"var(--load-crit)",yellow:"var(--load-warn)",green:"var(--load-ok)"}[health]
            return(
              <div key={team.id} className="card fade-in">
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                  <Icon n={team.icon||"equipos"} size={18}/>
                  <div style={{flex:1}}><h3 style={{fontSize:15,fontWeight:700}}>{team.name}</h3><p style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{members.length} miembros</p></div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:11,color:healthColor,fontWeight:700,fontFamily:"var(--font-mono)"}}>{teamActive} activas</div>
                    <div style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>✓{teamDone}{teamOverdue>0&&<span style={{color:"var(--red)"}}> · {teamOverdue} venc.</span>}</div>
                  </div>
                </div>
                <div style={{height:4,background:"var(--bg3)",borderRadius:2,marginBottom:14,overflow:"hidden"}}>
                  <div style={{width:Math.min(100,avgLoad/8*100)+"%",height:"100%",background:healthColor,borderRadius:2,transition:"width .6s"}}/>
                </div>
                {members.length===0?<p style={{fontSize:12,color:"var(--muted)",textAlign:"center",padding:8}}>Sin miembros</p>
                  :members.map(u=>{
                    const ut=tasks.filter(t=>assignedOf(t).includes(u.id)&&t.status!=="completada").length
                    const uh=tasks.filter(t=>assignedOf(t).includes(u.id)).reduce((s,t)=>s+Number(t.hours_real||0),0)
                    const uColor=ut>=7?"var(--red)":ut>=4?"var(--yellow)":u.avatar_color
                    return(
                      <div key={u.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                        <div style={{width:3,height:32,borderRadius:2,background:u.avatar_color,flexShrink:0}}/>
                        <Av u={u} size={26}/>
                        <div style={{flex:1}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                            <span style={{fontSize:12,fontWeight:600}}>{u.name.split(" ")[0]}</span>
                            <span style={{fontSize:11,color:uColor,fontWeight:700,fontFamily:"var(--font-mono)"}}>{ut} · {fmtH(uh)}</span>
                          </div>
                          <div className="progress-bar" style={{height:3}}><div className="progress-fill" style={{width:Math.min(100,ut/8*100)+"%",background:uColor}}/></div>
                        </div>
                      </div>
                    )
                  })}
                <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid var(--border)",display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>
                  <span>{fmtH(teamHours)} reales</span><span>{avgLoad.toFixed(1)} tareas/persona</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════
   TAB 2 — DESEMPEÑO INDIVIDUAL
═══════════════════════════════════════════ */
function TabDesempeno({tasks,users,teams,range}){
  const[detail,setDetail]=useState(null)
  const filtered=filterByRange(tasks,range)
  const colabs=users.filter(u=>u.role==="colaborador")

  const rows=useMemo(()=>colabs.map(u=>{
    const mt=filtered.filter(t=>assignedOf(t).includes(u.id))
    const comp=mt.filter(t=>t.status==="completada")
    const venc=mt.filter(t=>t.status==="vencida")
    const actv=mt.filter(t=>t.status!=="completada")
    const hrsE=mt.reduce((s,t)=>s+Number(t.hours||0),0)
    const hrsR=mt.reduce((s,t)=>s+Number(t.hours_real||0),0)
    const e=eff(hrsE,hrsR)
    const marcas=[...new Set(mt.map(t=>t.marca).filter(Boolean))]
    return{u,mt,comp,venc,actv,hrsE,hrsR,e,marcas}
  }).filter(r=>r.mt.length>0).sort((a,b)=>b.comp.length-a.comp.length),[filtered])

  // Rankings
  const top3=rows.slice(0,3)
  const bot3=[...rows].sort((a,b)=>a.comp.length-b.comp.length).slice(0,3)

  function doExport(){
    const hdr=["Colaborador","Equipo","Total","Completadas","Vencidas","Activas","Hrs Est.","Hrs Reales","Eficiencia","Marcas"]
    const data=rows.map(({u,mt,comp,venc,actv,hrsE,hrsR,e,marcas})=>{
      const team=teams.find(t=>t.id===u.team_id)
      return[u.name,team?.name||"—",mt.length,comp.length,venc.length,actv.length,fmtH(hrsE),fmtH(hrsR),effLabel(e),marcas.join(", ")||"—"]
    })
    exportCSV([hdr,...data],"LaCata_Colaboradores_"+new Date().toISOString().split("T")[0]+".csv")
  }

  if(detail){
    const{u,mt}=detail
    const team=teams.find(t=>t.id===u.team_id)
    const ORDER=["vencida","en_revision","en_progreso","pendiente","en_pausa","completada"]
    const sorted=[...mt].sort((a,b)=>ORDER.indexOf(a.status)-ORDER.indexOf(b.status))
    const hrsE=mt.reduce((s,t)=>s+Number(t.hours||0),0)
    const hrsR=mt.reduce((s,t)=>s+Number(t.hours_real||0),0)
    return(
      <div>
        <BackBtn onClick={()=>setDetail(null)} label="← Desempeño"/>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20,padding:"16px",background:"var(--bg2)",borderRadius:12,border:"1px solid var(--border)",borderLeft:`4px solid ${u.avatar_color||"var(--accent)"}`}}>
          <Av u={u} size={44}/>
          <div style={{flex:1}}><div style={{fontSize:16,fontWeight:700}}>{u.name}</div><div style={{fontSize:12,color:"var(--muted)"}}>{team?.name||"Sin equipo"}</div></div>
          <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
            <Chip label="TAREAS" value={mt.length} color="var(--accent)"/>
            <Chip label="COMPLET." value={mt.filter(t=>t.status==="completada").length} color="var(--green)"/>
            <Chip label="HRS EST." value={fmtH(hrsE)} color="var(--muted)"/>
            <Chip label="HRS REAL" value={fmtH(hrsR)} color="var(--blue)"/>
            <Chip label="EFIC." value={effLabel(eff(hrsE,hrsR))} color={effColor(eff(hrsE,hrsR))}/>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {sorted.map(t=>{
            const e=eff(t.hours,t.hours_real)
            const orderN=t.order_number?"AC-"+String(t.order_number).padStart(4,"0"):null
            return(
              <div key={t.id} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:180}}>
                  <div style={{fontWeight:600,fontSize:13,marginBottom:2}}>
                    {orderN&&<span style={{color:"var(--muted)",fontSize:11,fontFamily:"var(--font-mono)",marginRight:6}}>{orderN}</span>}
                    {t.title}
                  </div>
                  <div style={{fontSize:11,color:"var(--muted)"}}>{t.marca||"Sin marca"} · {fmtD(t.created_at)}</div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>Est: {fmtH(t.hours)}</span>
                  <span style={{fontSize:11,fontWeight:700,fontFamily:"var(--font-mono)"}}>Real: {fmtH(t.hours_real)}</span>
                  {e!=null&&<span style={{fontSize:11,fontWeight:700,color:effColor(e),background:"var(--bg3)",borderRadius:4,padding:"1px 7px",fontFamily:"var(--font-mono)"}}>{e}%</span>}
                  <span style={{fontSize:11,background:"var(--bg3)",borderRadius:6,padding:"2px 8px"}}>{SL[t.status]||t.status}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return(
    <div>
      {/* Rankings top/bottom */}
      {rows.length>=2&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
          <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px"}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--green)",fontFamily:"var(--font-mono)",marginBottom:10,letterSpacing:".08em"}}>🏆 MÁS PRODUCTIVOS</div>
            {top3.map(({u,comp,hrsR},i)=>(
              <div key={u.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <span style={{fontSize:12,fontWeight:800,color:i===0?"var(--yellow)":"var(--muted)",minWidth:16,fontFamily:"var(--font-mono)"}}>{i+1}</span>
                <Av u={u} size={24}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:600}}>{u.name.split(" ")[0]}</div>
                  <div style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{comp.length} completadas · {fmtH(hrsR)}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px"}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--red)",fontFamily:"var(--font-mono)",marginBottom:10,letterSpacing:".08em"}}>⚠️ NECESITAN ATENCIÓN</div>
            {bot3.map(({u,comp,venc,hrsR},i)=>(
              <div key={u.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <span style={{fontSize:12,fontWeight:800,color:"var(--muted)",minWidth:16,fontFamily:"var(--font-mono)"}}>{i+1}</span>
                <Av u={u} size={24}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:600}}>{u.name.split(" ")[0]}</div>
                  <div style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{comp.length} complet. · {venc.length>0?<span style={{color:"var(--red)"}}>{venc.length} venc.</span>:fmtH(hrsR)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
        <button className="btn btn-green" onClick={doExport} style={{display:"flex",alignItems:"center",gap:7,fontSize:13}}>
          <Icon n="exportar" size={13}/> Exportar CSV
        </button>
      </div>

      {rows.length===0&&<p style={{textAlign:"center",color:"var(--muted)",padding:48}}>Sin actividad en este período.</p>}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {rows.map(({u,mt,comp,venc,actv,hrsE,hrsR,e,marcas},i)=>{
          const team=teams.find(t=>t.id===u.team_id)
          return(
            <div key={u.id} onClick={()=>setDetail({u,mt})}
              style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px",cursor:"pointer",transition:".13s",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}
              onMouseEnter={ev=>ev.currentTarget.style.borderColor="var(--accent)"}
              onMouseLeave={ev=>ev.currentTarget.style.borderColor="var(--border)"}>
              <span style={{fontSize:12,fontWeight:700,color:"var(--muted)",minWidth:20,fontFamily:"var(--font-mono)"}}>{i+1}</span>
              <div style={{width:4,height:44,borderRadius:2,background:u.avatar_color||"var(--accent)",flexShrink:0}}/>
              <Av u={u} size={36}/>
              <div style={{flex:1,minWidth:120}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:2}}>{u.name}</div>
                <div style={{fontSize:11,color:"var(--muted)"}}>{team?.name||"Sin equipo"}{marcas.length>0?" · "+marcas.slice(0,2).join(", ")+(marcas.length>2?"…":""):""}</div>
              </div>
              <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
                <Chip label="TOTAL" value={mt.length}/>
                <Chip label="COMPLET." value={comp.length} color="var(--green)"/>
                <Chip label="VENCIDAS" value={venc.length} color={venc.length>0?"var(--red)":"var(--muted)"}/>
                <Chip label="HRS REAL" value={fmtH(hrsR)} color="var(--blue)"/>
                <Chip label="EFIC." value={effLabel(e)} color={effColor(e)}/>
              </div>
              <span style={{color:"var(--muted)",fontSize:12}}>→</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   TAB 3 — EQUIPOS
═══════════════════════════════════════════ */
function TabEquipos({tasks,users,teams,range}){
  const[detail,setDetail]=useState(null)
  const filtered=filterByRange(tasks,range)

  const rows=useMemo(()=>teams.map(team=>{
    const members=users.filter(u=>(u.team_id===team.id||(Array.isArray(u.team_ids)&&u.team_ids.includes(team.id)))&&u.role==="colaborador")
    const mt=filtered.filter(t=>t.team_id===team.id)
    const comp=mt.filter(t=>t.status==="completada")
    const venc=mt.filter(t=>t.status==="vencida")
    const hrsE=mt.reduce((s,t)=>s+Number(t.hours||0),0)
    const hrsR=mt.reduce((s,t)=>s+Number(t.hours_real||0),0)
    const e=eff(hrsE,hrsR)
    const avgHrsPerOrder=mt.length>0?hrsR/mt.length:0
    return{team,members,mt,comp,venc,hrsE,hrsR,e,avgHrsPerOrder}
  }).filter(r=>r.mt.length>0).sort((a,b)=>b.mt.length-a.mt.length),[filtered])

  const topTeam=rows[0]
  const botTeam=[...rows].sort((a,b)=>a.mt.length-b.mt.length)[0]

  function doExport(){
    const hdr=["Equipo","Miembros","Total órdenes","Completadas","Vencidas","Hrs Est.","Hrs Reales","Eficiencia","Avg hrs/orden"]
    const data=rows.map(({team,members,mt,comp,venc,hrsE,hrsR,e,avgHrsPerOrder})=>[team.name,members.length,mt.length,comp.length,venc.length,fmtH(hrsE),fmtH(hrsR),effLabel(e),fmtH(avgHrsPerOrder)])
    exportCSV([hdr,...data],"LaCata_Equipos_"+new Date().toISOString().split("T")[0]+".csv")
  }

  if(detail){
    const{team,members,mt}=detail
    const ORDER=["vencida","en_revision","en_progreso","pendiente","en_pausa","completada"]
    const sorted=[...mt].sort((a,b)=>ORDER.indexOf(a.status)-ORDER.indexOf(b.status))
    const hrsE=mt.reduce((s,t)=>s+Number(t.hours||0),0)
    const hrsR=mt.reduce((s,t)=>s+Number(t.hours_real||0),0)
    return(
      <div>
        <BackBtn onClick={()=>setDetail(null)} label="← Equipos"/>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20,padding:"16px",background:"var(--bg2)",borderRadius:12,border:"1px solid var(--border)",borderLeft:`4px solid ${teamColor(team)}`}}>
          <Icon n={team.icon||"equipos"} size={32}/>
          <div style={{flex:1}}><div style={{fontSize:16,fontWeight:700}}>{team.name}</div><div style={{fontSize:12,color:"var(--muted)"}}>{members.length} miembros</div></div>
          <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
            <Chip label="ÓRDENES" value={mt.length} color="var(--accent)"/>
            <Chip label="COMPLET." value={mt.filter(t=>t.status==="completada").length} color="var(--green)"/>
            <Chip label="HRS EST." value={fmtH(hrsE)} color="var(--muted)"/>
            <Chip label="HRS REAL" value={fmtH(hrsR)} color="var(--blue)"/>
            <Chip label="EFIC." value={effLabel(eff(hrsE,hrsR))} color={effColor(eff(hrsE,hrsR))}/>
          </div>
        </div>
        {/* Members summary */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
          {members.map(u=>{
            const umt=mt.filter(t=>assignedOf(t).includes(u.id))
            const uHrs=umt.reduce((s,t)=>s+Number(t.hours_real||0),0)
            return(
              <div key={u.id} style={{display:"flex",alignItems:"center",gap:7,background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,padding:"7px 12px"}}>
                <Av u={u} size={24}/>
                <div><div style={{fontSize:12,fontWeight:600}}>{u.name.split(" ")[0]}</div><div style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{umt.length} tareas · {fmtH(uHrs)}</div></div>
              </div>
            )
          })}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {sorted.map(t=>{
            const a=assignedOf(t).map(id=>users.find(u=>u.id===id)).filter(Boolean)
            const e=eff(t.hours,t.hours_real)
            return(
              <div key={t.id} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:180}}>
                  <div style={{fontWeight:600,fontSize:13,marginBottom:2}}>
                    {t.order_number&&<span style={{color:"var(--muted)",fontSize:11,fontFamily:"var(--font-mono)",marginRight:6}}>AC-{String(t.order_number).padStart(4,"0")}</span>}
                    {t.title}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3}}>
                    {a.map(u=><Av key={u.id} u={u} size={16}/>)}
                    <span style={{fontSize:11,color:"var(--muted)"}}>{t.marca||"Sin marca"} · {fmtD(t.created_at)}</span>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>Est: {fmtH(t.hours)}</span>
                  <span style={{fontSize:11,fontWeight:700,fontFamily:"var(--font-mono)"}}>Real: {fmtH(t.hours_real)}</span>
                  {e!=null&&<span style={{fontSize:11,fontWeight:700,color:effColor(e),background:"var(--bg3)",borderRadius:4,padding:"1px 7px",fontFamily:"var(--font-mono)"}}>{e}%</span>}
                  <span style={{fontSize:11,background:"var(--bg3)",borderRadius:6,padding:"2px 8px"}}>{SL[t.status]||t.status}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return(
    <div>
      {/* Comparativo top/bottom */}
      {rows.length>=2&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
          {topTeam&&(
            <div style={{background:"var(--bg2)",border:"1px solid var(--green)",borderRadius:12,padding:"14px 16px"}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--green)",fontFamily:"var(--font-mono)",marginBottom:8,letterSpacing:".08em"}}>🏆 EQUIPO MÁS ACTIVO</div>
              <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>{topTeam.team.name}</div>
              <div style={{fontSize:12,color:"var(--muted)"}}>{topTeam.mt.length} órdenes · {topTeam.comp.length} completadas · {fmtH(topTeam.hrsR)}</div>
            </div>
          )}
          {botTeam&&botTeam.team.id!==topTeam?.team.id&&(
            <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px"}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--muted)",fontFamily:"var(--font-mono)",marginBottom:8,letterSpacing:".08em"}}>📉 EQUIPO CON MENOS ACTIVIDAD</div>
              <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>{botTeam.team.name}</div>
              <div style={{fontSize:12,color:"var(--muted)"}}>{botTeam.mt.length} órdenes · {botTeam.comp.length} completadas · {fmtH(botTeam.hrsR)}</div>
            </div>
          )}
        </div>
      )}

      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
        <button className="btn btn-green" onClick={doExport} style={{display:"flex",alignItems:"center",gap:7,fontSize:13}}>
          <Icon n="exportar" size={13}/> Exportar CSV
        </button>
      </div>

      {rows.length===0&&<p style={{textAlign:"center",color:"var(--muted)",padding:48}}>Sin actividad en este período.</p>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
        {rows.map(({team,members,mt,comp,venc,hrsR,e,avgHrsPerOrder})=>(
          <div key={team.id} onClick={()=>setDetail({team,members,mt})}
            style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:12,padding:"16px",cursor:"pointer",transition:".13s",borderLeft:`3px solid ${teamColor(team)}`}}
            onMouseEnter={ev=>ev.currentTarget.style.borderColor=teamColor(team)}
            onMouseLeave={ev=>ev.currentTarget.style.borderColor="var(--border)"}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
              <Icon n={team.icon||"equipos"} size={18}/>
              <div style={{flex:1,fontSize:14,fontWeight:700}}>{team.name}</div>
              <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{members.length} miembros</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
              <Chip label="ÓRDENES" value={mt.length}/>
              <Chip label="COMPLET." value={comp.length} color="var(--green)"/>
              <Chip label="HRS REAL" value={fmtH(hrsR)} color="var(--blue)"/>
              <Chip label="EFIC." value={effLabel(e)} color={effColor(e)}/>
            </div>
            <div style={{height:4,background:"var(--bg3)",borderRadius:2,overflow:"hidden",marginBottom:6}}>
              <div style={{width:(comp.length/Math.max(mt.length,1)*100)+"%",height:"100%",background:"var(--green)",borderRadius:2,transition:"width .6s"}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>
              <span>{Math.round(comp.length/Math.max(mt.length,1)*100)}% completado</span>
              <span>~{fmtH(avgHrsPerOrder)}/orden</span>
            </div>
            {venc.length>0&&<div style={{marginTop:8,fontSize:11,color:"var(--red)",fontWeight:600}}>{venc.length} vencida{venc.length!==1?"s":""} este período</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   TAB 4 — MARCAS
═══════════════════════════════════════════ */
function TabMarcas({tasks,users,teams,range}){
  const[detail,setDetail]=useState(null)
  const filtered=filterByRange(tasks,range)

  const rows=useMemo(()=>{
    const map={}
    filtered.forEach(t=>{
      const m=t.marca||"Sin marca"
      if(!map[m])map[m]={marca:m,tasks:[],colabs:new Set()}
      map[m].tasks.push(t)
      assignedOf(t).forEach(id=>map[m].colabs.add(id))
    })
    return Object.values(map).map(r=>{
      const hrsE=r.tasks.reduce((s,t)=>s+Number(t.hours||0),0)
      const hrsR=r.tasks.reduce((s,t)=>s+Number(t.hours_real||0),0)
      const comp=r.tasks.filter(t=>t.status==="completada").length
      const venc=r.tasks.filter(t=>t.status==="vencida").length
      const changes=r.tasks.reduce((s,t)=>s+Number(t.changes||0),0)
      const e=eff(hrsE,hrsR)
      return{...r,hrsE,hrsR,comp,venc,changes,e}
    }).sort((a,b)=>b.hrsR-a.hrsR)
  },[filtered])

  const topMarca=rows[0]
  const mostChanges=[...rows].sort((a,b)=>b.changes-a.changes)[0]

  function doExport(){
    const hdr=["Marca","Órdenes","Completadas","Vencidas","Colaboradores","Hrs Est.","Hrs Reales","Eficiencia","Total cambios"]
    const data=rows.map(r=>[r.marca,r.tasks.length,r.comp,r.venc,r.colabs.size,fmtH(r.hrsE),fmtH(r.hrsR),effLabel(r.e),r.changes])
    exportCSV([hdr,...data],"LaCata_Marcas_"+new Date().toISOString().split("T")[0]+".csv")
  }

  if(detail){
    const{marca,tasks:mt,colabs}=detail
    const collabMap={}
    mt.forEach(t=>{assignedOf(t).forEach(id=>{
      if(!collabMap[id])collabMap[id]={id,tasks:[],hrsR:0}
      collabMap[id].tasks.push(t);collabMap[id].hrsR+=Number(t.hours_real||0)
    })})
    const ORDER=["vencida","en_revision","en_progreso","pendiente","en_pausa","completada"]
    const sorted=[...mt].sort((a,b)=>ORDER.indexOf(a.status)-ORDER.indexOf(b.status))
    const hrsE=mt.reduce((s,t)=>s+Number(t.hours||0),0)
    const hrsR=mt.reduce((s,t)=>s+Number(t.hours_real||0),0)
    return(
      <div>
        <BackBtn onClick={()=>setDetail(null)} label="← Marcas"/>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16,padding:"16px",background:"var(--bg2)",borderRadius:12,border:"1px solid var(--border)"}}>
          <div style={{width:10,height:10,borderRadius:"50%",background:"var(--accent)"}}/>
          <div style={{flex:1}}><div style={{fontSize:17,fontWeight:700}}>{marca}</div><div style={{fontSize:12,color:"var(--muted)"}}>{mt.length} órdenes en este período</div></div>
          <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
            <Chip label="ÓRDENES" value={mt.length} color="var(--accent)"/>
            <Chip label="COMPLET." value={mt.filter(t=>t.status==="completada").length} color="var(--green)"/>
            <Chip label="HRS EST." value={fmtH(hrsE)} color="var(--muted)"/>
            <Chip label="HRS REAL" value={fmtH(hrsR)} color="var(--blue)"/>
            <Chip label="EFIC." value={effLabel(eff(hrsE,hrsR))} color={effColor(eff(hrsE,hrsR))}/>
          </div>
        </div>
        {Object.values(collabMap).length>0&&(
          <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 16px",marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--muted)",marginBottom:10,fontFamily:"var(--font-mono)"}}>COLABORADORES EN ESTA MARCA</div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              {Object.values(collabMap).map(c=>{
                const u=users.find(x=>x.id===c.id);if(!u)return null
                return(
                  <div key={c.id} style={{display:"flex",alignItems:"center",gap:7,background:"var(--bg3)",borderRadius:8,padding:"6px 10px"}}>
                    <Av u={u} size={24}/>
                    <div><div style={{fontSize:12,fontWeight:600}}>{u.name.split(" ")[0]}</div><div style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{fmtH(c.hrsR)} · {c.tasks.length} tareas</div></div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {sorted.map(t=>{
            const a=assignedOf(t).map(id=>users.find(u=>u.id===id)).filter(Boolean)
            const e=eff(t.hours,t.hours_real)
            return(
              <div key={t.id} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:180}}>
                  <div style={{fontWeight:600,fontSize:13,marginBottom:2}}>
                    {t.order_number&&<span style={{color:"var(--muted)",fontSize:11,fontFamily:"var(--font-mono)",marginRight:6}}>AC-{String(t.order_number).padStart(4,"0")}</span>}
                    {t.title}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:5,marginTop:3}}>
                    {a.map(u=><Av key={u.id} u={u} size={16}/>)}
                    <span style={{fontSize:11,color:"var(--muted)",marginLeft:2}}>{fmtD(t.created_at)}</span>
                    {(t.changes||0)>0&&<span style={{fontSize:11,color:"var(--muted)"}}>· {t.changes} cambios</span>}
                  </div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>Est: {fmtH(t.hours)}</span>
                  <span style={{fontSize:11,fontWeight:700,fontFamily:"var(--font-mono)"}}>Real: {fmtH(t.hours_real)}</span>
                  {e!=null&&<span style={{fontSize:11,fontWeight:700,color:effColor(e),background:"var(--bg3)",borderRadius:4,padding:"1px 7px",fontFamily:"var(--font-mono)"}}>{e}%</span>}
                  <span style={{fontSize:11,background:"var(--bg3)",borderRadius:6,padding:"2px 8px"}}>{SL[t.status]||t.status}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return(
    <div>
      {/* Insights */}
      {rows.length>=2&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12,marginBottom:20}}>
          {topMarca&&(
            <div style={{background:"var(--bg2)",border:"1px solid var(--blue)",borderRadius:12,padding:"14px 16px"}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--blue)",fontFamily:"var(--font-mono)",marginBottom:6,letterSpacing:".08em"}}>📊 MAYOR DEMANDA</div>
              <div style={{fontSize:15,fontWeight:700}}>{topMarca.marca}</div>
              <div style={{fontSize:12,color:"var(--muted)",marginTop:4}}>{topMarca.tasks.length} órdenes · {fmtH(topMarca.hrsR)} invertidas</div>
            </div>
          )}
          {mostChanges&&mostChanges.changes>0&&(
            <div style={{background:"var(--bg2)",border:"1px solid var(--yellow)",borderRadius:12,padding:"14px 16px"}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--yellow)",fontFamily:"var(--font-mono)",marginBottom:6,letterSpacing:".08em"}}>🔄 MÁS CAMBIOS DE OPINIÓN</div>
              <div style={{fontSize:15,fontWeight:700}}>{mostChanges.marca}</div>
              <div style={{fontSize:12,color:"var(--muted)",marginTop:4}}>{mostChanges.changes} cambios en {mostChanges.tasks.length} órdenes</div>
            </div>
          )}
          {rows.filter(r=>r.venc>0).length>0&&(
            <div style={{background:"var(--bg2)",border:"1px solid var(--red)",borderRadius:12,padding:"14px 16px"}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--red)",fontFamily:"var(--font-mono)",marginBottom:6,letterSpacing:".08em"}}>⚠️ MARCAS CON VENCIDAS</div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {rows.filter(r=>r.venc>0).map(r=>(
                  <div key={r.marca} style={{fontSize:13,fontWeight:600}}>{r.marca} <span style={{color:"var(--red)",fontFamily:"var(--font-mono)",fontSize:11}}>{r.venc} venc.</span></div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
        <button className="btn btn-green" onClick={doExport} style={{display:"flex",alignItems:"center",gap:7,fontSize:13}}>
          <Icon n="exportar" size={13}/> Exportar CSV
        </button>
      </div>

      {rows.length===0&&<p style={{textAlign:"center",color:"var(--muted)",padding:48}}>Sin actividad en este período.</p>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:10}}>
        {rows.map((r,i)=>(
          <div key={r.marca} onClick={()=>setDetail(r)}
            style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:12,padding:"16px",cursor:"pointer",transition:".13s"}}
            onMouseEnter={ev=>ev.currentTarget.style.borderColor="var(--accent)"}
            onMouseLeave={ev=>ev.currentTarget.style.borderColor="var(--border)"}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
              <span style={{fontSize:11,fontWeight:700,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>#{i+1}</span>
              <div style={{flex:1,fontSize:14,fontWeight:700}}>{r.marca}</div>
              <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{r.colabs.size} colab{r.colabs.size!==1?"s":""}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
              <Chip label="ÓRDENES" value={r.tasks.length}/>
              <Chip label="COMPLET." value={r.comp} color="var(--green)"/>
              <Chip label="HRS REAL" value={fmtH(r.hrsR)} color="var(--blue)"/>
              <Chip label="EFIC." value={effLabel(r.e)} color={effColor(r.e)}/>
            </div>
            <div style={{height:4,background:"var(--bg3)",borderRadius:2,overflow:"hidden",marginBottom:6}}>
              <div style={{width:(r.comp/Math.max(r.tasks.length,1)*100)+"%",height:"100%",background:"var(--green)",borderRadius:2}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>
              <span>{Math.round(r.comp/Math.max(r.tasks.length,1)*100)}% completado</span>
              {r.changes>0&&<span style={{color:"var(--yellow)"}}>{r.changes} cambios</span>}
              {r.venc>0&&<span style={{color:"var(--red)"}}>{r.venc} vencidas</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   TAB 5 — ÓRDENES
═══════════════════════════════════════════ */
function TabOrdenes({tasks,users,teams,range}){
  const[search,setSearch]=useState("")
  const[filterStatus,setFilterStatus]=useState("all")
  const filtered=filterByRange(tasks,range)

  const rows=useMemo(()=>filtered.filter(t=>{
    const q=search.toLowerCase()
    if(q){
      const names=assignedOf(t).map(id=>users.find(u=>u.id===id)?.name||"").join(" ").toLowerCase()
      const orderN=t.order_number?"ac-"+String(t.order_number).padStart(4,"0"):""
      if(![t.title,names,t.marca||"",orderN].some(s=>s.toLowerCase().includes(q)))return false
    }
    if(filterStatus!=="all"&&t.status!==filterStatus)return false
    return true
  }).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)),[filtered,search,filterStatus])

  function doExport(){
    const hdr=["No. Orden","Proyecto","Marca","Equipo","Responsable(s)","Estado","Prioridad","Hrs Est.","Hrs Reales","Eficiencia","Fecha Creación","Fecha Límite","Cambios"]
    const data=rows.map(t=>{
      const names=assignedOf(t).map(id=>users.find(u=>u.id===id)?.name||"?").join(", ")
      const team=teams.find(x=>x.id===t.team_id)
      const e=eff(t.hours,t.hours_real)
      return[t.order_number?"AC-"+String(t.order_number).padStart(4,"0"):"-",t.title||"",t.marca||"—",team?.name||"Sin equipo",names||"Sin asignar",SL[t.status]||t.status,t.priority||"Normal",fmtH(t.hours),fmtH(t.hours_real),effLabel(e),fmtD(t.created_at),t.due_date?fmtD(t.due_date):"—",t.changes||0]
    })
    exportCSV([hdr,...data],"LaCata_Ordenes_"+new Date().toISOString().split("T")[0]+".csv")
  }

  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar orden, colaborador, marca..."
          style={{flex:1,minWidth:200,padding:"7px 12px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg3)",color:"var(--text)",fontSize:13,fontFamily:"inherit"}}/>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
          style={{padding:"7px 10px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg3)",color:"var(--text)",fontSize:13,fontFamily:"inherit",cursor:"pointer"}}>
          {["all","pendiente","en_progreso","en_pausa","en_revision","completada","vencida"].map(s=>(
            <option key={s} value={s}>{s==="all"?"Todos los estados":SL[s]}</option>
          ))}
        </select>
        <button className="btn btn-green" onClick={doExport} style={{display:"flex",alignItems:"center",gap:7,fontSize:13,whiteSpace:"nowrap"}}>
          <Icon n="exportar" size={13}/> Exportar CSV
        </button>
      </div>
      <div style={{fontSize:12,color:"var(--muted)",marginBottom:10,fontFamily:"var(--font-mono)"}}>{rows.length} órdenes</div>
      {rows.length===0&&<p style={{textAlign:"center",color:"var(--muted)",padding:48}}>Sin resultados.</p>}
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {rows.map(t=>{
          const assigned=assignedOf(t).map(id=>users.find(u=>u.id===id)).filter(Boolean)
          const team=teams.find(x=>x.id===t.team_id)
          const e=eff(t.hours,t.hours_real)
          const isOverdue=t.status==="vencida",isComp=t.status==="completada"
          return(
            <div key={t.id} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 16px",
              borderLeft:`3px solid ${isOverdue?"var(--red)":isComp?"var(--green)":"var(--border)"}`,
              display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:200}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
                  {t.order_number&&<span style={{fontSize:11,fontFamily:"var(--font-mono)",color:"var(--muted)",background:"var(--bg3)",borderRadius:4,padding:"1px 6px"}}>AC-{String(t.order_number).padStart(4,"0")}</span>}
                  {t.marca&&<span style={{fontSize:11,background:"var(--bg3)",borderRadius:4,padding:"1px 6px",color:"var(--muted)"}}>{t.marca}</span>}
                  <span style={{fontSize:11,background:"var(--bg3)",borderRadius:4,padding:"1px 6px"}}>{SL[t.status]||t.status}</span>
                </div>
                <div style={{fontWeight:600,fontSize:13,marginBottom:3}}>{t.title}</div>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  {assigned.map(u=><span key={u.id} style={{display:"flex",alignItems:"center",gap:4}}><Av u={u} size={16}/><span style={{fontSize:11,color:"var(--muted)"}}>{u.name.split(" ")[0]}</span></span>)}
                  {team&&<span style={{fontSize:11,color:"var(--muted)"}}>· {team.name}</span>}
                  <span style={{fontSize:11,color:"var(--muted)"}}>· {fmtD(t.created_at)}</span>
                  {t.due_date&&<span style={{fontSize:11,color:isOverdue?"var(--red)":"var(--muted)"}}>· límite {fmtD(t.due_date)}</span>}
                </div>
              </div>
              <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>Est: {fmtH(t.hours)}</div>
                  <div style={{fontSize:13,fontWeight:700,fontFamily:"var(--font-mono)"}}>Real: {fmtH(t.hours_real)}</div>
                </div>
                {e!=null&&<div style={{textAlign:"center",background:"var(--bg3)",borderRadius:8,padding:"5px 10px"}}>
                  <div style={{fontSize:15,fontWeight:800,color:effColor(e),fontFamily:"var(--font-display)"}}>{e}%</div>
                  <div style={{fontSize:9,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>EFIC.</div>
                </div>}
                {(t.changes||0)>0&&<span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{t.changes} cambios</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   initialUser: usuario a preseleccionar en TabCarga
   (recibido desde Dashboard vía pageArg cuando
   se navega desde onViewUser en HomeView u otros)
═══════════════════════════════════════════ */
export default function IntelView({tasks,users,teams,onBack,me,profile,token,onRefresh,onLoadHistory,initialUser}){
  const[tab,setTab]=useState("carga")
  const[period,setPeriod]=useState("semana")
  const[offset,setOffset]=useState(0)
  const[historyLoaded,setHistoryLoaded]=useState(false)

  // Si el usuario navega a un período antiguo (>60 días atrás) o entra a las
  // pestañas de Marcas/Órdenes que necesitan histórico, carga todas las
  // tareas completadas viejas una sola vez.
  useEffect(()=>{
    if(historyLoaded||!onLoadHistory)return
    const needsHistory=offset<0||tab==="ordenes"||tab==="marcas"||tab==="desempeno"
    if(needsHistory){
      setHistoryLoaded(true)
      onLoadHistory()
    }
  },[offset,tab,historyLoaded,onLoadHistory])

  // Cuentas: filter tasks to only their assigned teams
  const myProfile=me||profile
  const isCuentas=myProfile?.role==="cuentas"
  const myTeamIds=isCuentas?(Array.isArray(myProfile?.team_ids)&&myProfile.team_ids.length>0?myProfile.team_ids:[myProfile?.team_id].filter(Boolean)):null
  const visibleTasks=isCuentas&&myTeamIds
    ?tasks.filter(t=>myTeamIds.includes(t.team_id))
    :tasks

  function handlePeriod(p,o){setPeriod(p);setOffset(o)}
  const range=getRangeLabel(period,offset)

  const TABS=[
    {v:"carga",l:"Carga actual"},
    {v:"desempeno",l:"Colaboradores"},
    {v:"equipos",l:"Equipos"},
    {v:"marcas",l:"Marcas"},
    {v:"ordenes",l:"Órdenes"},
  ]

  // KPIs globales del período (no aplica a carga que es tiempo real)
  const filtered=filterByRange(visibleTasks,range)
  const hrsR=filtered.reduce((s,t)=>s+Number(t.hours_real||0),0)
  const hrsE=filtered.reduce((s,t)=>s+Number(t.hours||0),0)
  const comp=filtered.filter(t=>t.status==="completada").length
  const venc=filtered.filter(t=>t.status==="vencida").length
  const globalEff=eff(hrsE,hrsR)

  return(
    <div>
      {onBack&&<BackBtn onClick={onBack}/>}

      {/* Cuentas scope notice */}
      {isCuentas&&myTeamIds&&(
        <div style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:8,padding:"8px 14px",marginBottom:12,fontSize:12,color:"var(--muted)",display:"flex",alignItems:"center",gap:8}}>
          <Icon n="equipo2" size={13}/>
          Mostrando datos de tus equipos asignados ({myTeamIds.length} equipo{myTeamIds.length!==1?"s":""})
        </div>
      )}

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:12}}>
        <h2 style={{fontSize:18,fontWeight:800,fontFamily:"var(--font-display)"}}>Desempeño & Reportería</h2>
        {tab!=="carga"&&<PeriodBar period={period} offset={offset} onChange={handlePeriod}/>}
      </div>

      {/* KPIs — solo cuando no es pestaña de carga */}
      {tab!=="carga"&&(
        <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
          {[
            {l:"ÓRDENES",v:filtered.length,c:"var(--accent)"},
            {l:"COMPLETADAS",v:comp,c:"var(--green)"},
            {l:"VENCIDAS",v:venc,c:venc>0?"var(--red)":"var(--muted)"},
            {l:"HRS REALES",v:fmtH(hrsR),c:"var(--blue)"},
            {l:"HRS EST.",v:fmtH(hrsE),c:"var(--muted)"},
            {l:"EFICIENCIA",v:effLabel(globalEff),c:effColor(globalEff)},
          ].map(({l,v,c})=>(
            <div key={l} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 14px",textAlign:"center",flex:1,minWidth:70}}>
              <div style={{fontSize:17,fontWeight:800,color:c,fontFamily:"var(--font-display)",lineHeight:1.1}}>{v}</div>
              <div style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)",marginTop:3}}>{l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{display:"flex",gap:3,background:"var(--bg3)",borderRadius:10,padding:4,marginBottom:20,overflowX:"auto"}}>
        {TABS.map(t=>(
          <button key={t.v} onClick={()=>setTab(t.v)}
            style={{flex:1,padding:"8px 4px",borderRadius:7,fontSize:12,cursor:"pointer",border:"none",fontFamily:"inherit",whiteSpace:"nowrap",minWidth:80,
              background:tab===t.v?"var(--bg2)":"transparent",
              color:tab===t.v?"var(--text)":"var(--muted)",
              fontWeight:tab===t.v?700:400,transition:".13s"}}>
            {t.l}
          </button>
        ))}
      </div>

      {/* initialUser se pasa a TabCarga para preseleccionar al usuario sin globals */}
      {tab==="carga"&&<TabCarga tasks={visibleTasks} users={users} teams={teams} myTeamIds={myTeamIds} isCuentas={isCuentas} myProfile={myProfile} token={token} onRefresh={onRefresh} initialUser={initialUser||null}/>}
      {tab==="desempeno"&&<TabDesempeno tasks={visibleTasks} users={users} teams={teams} range={range}/>}
      {tab==="equipos"&&<TabEquipos tasks={visibleTasks} users={users} teams={teams} range={range}/>}
      {tab==="marcas"&&<TabMarcas tasks={visibleTasks} users={users} teams={teams} range={range}/>}
      {tab==="ordenes"&&<TabOrdenes tasks={visibleTasks} users={users} teams={teams} range={range}/>}
    </div>
  )
}
