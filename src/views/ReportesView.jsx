import{useState,useMemo}from'react'
import Icon from'../components/Icon'
import{Av}from'../components/Shared'
import{showToast}from'../components/Toast'
import{teamColor}from'../lib/supabase'

/* ─── helpers ─── */
const SL={pendiente:"Pendiente",en_progreso:"En progreso",en_pausa:"En pausa",en_revision:"En revisión",completada:"Completada",vencida:"Vencida"}
function fmtD(str){if(!str)return"—";return new Date(str).toLocaleDateString("es-GT",{day:"2-digit",month:"short",year:"2-digit"})}
function fmtH(h){return Number(h||0).toFixed(1)+"h"}
function eff(est,real){const e=Number(est);const r=Number(real);if(!e||!r)return null;return Math.round(e/r*100)}
function effColor(e){return e==null?"var(--muted)":e>=90?"var(--green)":e>=70?"var(--yellow)":"var(--red)"}
function effLabel(e){return e==null?"—":e+"%"}

function getRangeLabel(period,offset){
  const now=new Date()
  let from,to
  if(period==="semana"){
    const ref=new Date(now);ref.setDate(ref.getDate()+offset*7)
    const day=ref.getDay();const diff=ref.getDate()-day+(day===0?-6:1)
    from=new Date(ref);from.setDate(diff);from.setHours(0,0,0,0)
    to=new Date(from);to.setDate(to.getDate()+6);to.setHours(23,59,59,999)
  }else{
    from=new Date(now.getFullYear(),now.getMonth()+offset,1)
    to=new Date(now.getFullYear(),now.getMonth()+offset+1,0,23,59,59,999)
  }
  return{from,to}
}

function filterByRange(tasks,range){
  return tasks.filter(t=>{const d=new Date(t.created_at||0);return d>=range.from&&d<=range.to})
}

function exportCSV(rows,filename){
  const esc=v=>`"${String(v==null?"":v).replace(/"/g,'""')}"`
  const csv="\uFEFF"+rows.map(r=>r.map(esc).join(",")).join("\r\n")
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"})
  const url=URL.createObjectURL(blob)
  const a=document.createElement("a");a.href=url;a.download=filename
  document.body.appendChild(a);a.click();document.body.removeChild(a)
  URL.revokeObjectURL(url)
  showToast("Exportado correctamente","success")
}

/* ─── Period Selector ─── */
function PeriodBar({period,offset,onChange}){
  const{from,to}=getRangeLabel(period,offset)
  const opts={day:"2-digit",month:"short"}
  const label=from.toLocaleDateString("es-GT",opts)+" – "+to.toLocaleDateString("es-GT",opts)
  return(
    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
      <div style={{display:"flex",background:"var(--bg3)",borderRadius:8,padding:3,gap:3}}>
        {["semana","mes"].map(p=>(
          <button key={p} onClick={()=>onChange(p,0)}
            style={{padding:"5px 14px",borderRadius:6,fontSize:12,cursor:"pointer",border:"none",fontFamily:"inherit",
              background:period===p?"var(--bg2)":"transparent",
              color:period===p?"var(--text)":"var(--muted)",
              fontWeight:period===p?600:400,transition:".13s"}}>
            {p==="semana"?"Semana":"Mes"}
          </button>
        ))}
      </div>
      <button onClick={()=>onChange(period,offset-1)} style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:6,padding:"5px 10px",cursor:"pointer",color:"var(--text)",fontSize:13,lineHeight:1}}>‹</button>
      <span style={{fontSize:12,color:"var(--muted)",fontFamily:"var(--font-mono)",minWidth:160,textAlign:"center"}}>
        {label}
        {offset===0&&<span style={{marginLeft:6,fontSize:10,background:"var(--accent)",color:"#fff",borderRadius:4,padding:"1px 6px",fontWeight:700,verticalAlign:"middle"}}>ACTUAL</span>}
      </span>
      <button onClick={()=>onChange(period,offset+1)} disabled={offset>=0}
        style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:6,padding:"5px 10px",cursor:offset>=0?"default":"pointer",color:offset>=0?"var(--border)":"var(--text)",fontSize:13,lineHeight:1}}>›</button>
    </div>
  )
}

/* ─── Stat chip ─── */
function Chip({label,value,color}){
  return(
    <div style={{textAlign:"center",minWidth:64}}>
      <div style={{fontSize:18,fontWeight:800,color:color||"var(--text)",fontFamily:"var(--font-display)",lineHeight:1.1}}>{value}</div>
      <div style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)",marginTop:2,whiteSpace:"nowrap"}}>{label}</div>
    </div>
  )
}

/* ─── TAB: Por Colaborador ─── */
function TabColaborador({tasks,users,teams,range}){
  const[detail,setDetail]=useState(null)
  const filtered=filterByRange(tasks,range)
  const colabs=users.filter(u=>u.role==="colaborador")

  const rows=useMemo(()=>colabs.map(u=>{
    const mt=filtered.filter(t=>{const a=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean);return a.includes(u.id)})
    const comp=mt.filter(t=>t.status==="completada")
    const venc=mt.filter(t=>t.status==="vencida")
    const actv=mt.filter(t=>t.status!=="completada")
    const hrsE=mt.reduce((s,t)=>s+Number(t.hours||0),0)
    const hrsR=mt.reduce((s,t)=>s+Number(t.hours_real||0),0)
    const e=eff(hrsE,hrsR)
    const marcas=[...new Set(mt.map(t=>t.marca).filter(Boolean))]
    return{u,mt,comp,venc,actv,hrsE,hrsR,e,marcas}
  }).filter(r=>r.mt.length>0).sort((a,b)=>b.hrsR-a.hrsR),[filtered,colabs])

  function doExport(){
    const hdr=["Colaborador","Equipo","Total tareas","Completadas","Vencidas","Activas","Hrs Est.","Hrs Reales","Eficiencia","Marcas"]
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
    const hrsR=mt.reduce((s,t)=>s+Number(t.hours_real||0),0)
    const hrsE=mt.reduce((s,t)=>s+Number(t.hours||0),0)
    return(
      <div>
        <button onClick={()=>setDetail(null)} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",color:"var(--muted)",fontSize:13,padding:"0 0 16px",fontFamily:"inherit"}}>← Volver a colaboradores</button>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20,padding:"16px",background:"var(--bg2)",borderRadius:12,border:"1px solid var(--border)",borderLeft:`4px solid ${u.avatar_color||"var(--accent)"}`}}>
          <Av u={u} size={44}/>
          <div style={{flex:1}}>
            <div style={{fontSize:16,fontWeight:700}}>{u.name}</div>
            <div style={{fontSize:12,color:"var(--muted)"}}>{team?.name||"Sin equipo"}</div>
          </div>
          <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
            <Chip label="TAREAS" value={mt.length} color="var(--accent)"/>
            <Chip label="COMPLETADAS" value={mt.filter(t=>t.status==="completada").length} color="var(--green)"/>
            <Chip label="HRS EST." value={fmtH(hrsE)} color="var(--muted)"/>
            <Chip label="HRS REALES" value={fmtH(hrsR)} color="var(--blue)"/>
            <Chip label="EFICIENCIA" value={effLabel(eff(hrsE,hrsR))} color={effColor(eff(hrsE,hrsR))}/>
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
                  {e!=null&&<span style={{fontSize:11,fontWeight:700,color:effColor(e),fontFamily:"var(--font-mono)",background:"var(--bg3)",borderRadius:4,padding:"1px 7px"}}>{e}%</span>}
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
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
        <button className="btn btn-green" onClick={doExport} style={{display:"flex",alignItems:"center",gap:7,fontSize:13}}>
          <Icon n="exportar" size={13}/> Exportar CSV
        </button>
      </div>
      {rows.length===0&&<p style={{textAlign:"center",color:"var(--muted)",padding:48,fontSize:14}}>Sin actividad en este período.</p>}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {rows.map(({u,mt,comp,venc,actv,hrsE,hrsR,e,marcas},i)=>{
          const team=teams.find(t=>t.id===u.team_id)
          return(
            <div key={u.id} onClick={()=>setDetail({u,mt})}
              style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px",cursor:"pointer",transition:".13s",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor="var(--accent)"}
              onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
              <span style={{fontSize:12,fontWeight:700,color:"var(--muted)",minWidth:20,fontFamily:"var(--font-mono)"}}>{i+1}</span>
              <div style={{width:4,height:44,borderRadius:2,background:u.avatar_color||"var(--accent)",flexShrink:0}}/>
              <Av u={u} size={36}/>
              <div style={{flex:1,minWidth:120}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:2}}>{u.name}</div>
                <div style={{fontSize:11,color:"var(--muted)"}}>{team?.name||"Sin equipo"}{marcas.length>0&&" · "+marcas.slice(0,3).join(", ")+(marcas.length>3?"…":"")}</div>
              </div>
              <div style={{display:"flex",gap:20,alignItems:"center",flexWrap:"wrap"}}>
                <Chip label="TAREAS" value={mt.length} color="var(--text)"/>
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

/* ─── TAB: Por Marca ─── */
function TabMarca({tasks,users,teams,range}){
  const[detail,setDetail]=useState(null)
  const filtered=filterByRange(tasks,range)

  const rows=useMemo(()=>{
    const map={}
    filtered.forEach(t=>{
      const m=t.marca||"Sin marca"
      if(!map[m])map[m]={marca:m,tasks:[],colabs:new Set()}
      map[m].tasks.push(t)
      const a=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean)
      a.forEach(id=>map[m].colabs.add(id))
    })
    return Object.values(map).map(r=>{
      const hrsE=r.tasks.reduce((s,t)=>s+Number(t.hours||0),0)
      const hrsR=r.tasks.reduce((s,t)=>s+Number(t.hours_real||0),0)
      const comp=r.tasks.filter(t=>t.status==="completada").length
      const e=eff(hrsE,hrsR)
      return{...r,hrsE,hrsR,comp,e,colabs:r.colabs}
    }).sort((a,b)=>b.hrsR-a.hrsR)
  },[filtered])

  function doExport(){
    const hdr=["Marca","Total Órdenes","Completadas","Colaboradores","Hrs Est.","Hrs Reales","Eficiencia"]
    const data=rows.map(r=>[r.marca,r.tasks.length,r.comp,r.colabs.size,fmtH(r.hrsE),fmtH(r.hrsR),effLabel(r.e)])
    exportCSV([hdr,...data],"LaCata_Marcas_"+new Date().toISOString().split("T")[0]+".csv")
  }

  if(detail){
    const{marca,tasks:mt}=detail
    const ORDER=["vencida","en_revision","en_progreso","pendiente","en_pausa","completada"]
    const sorted=[...mt].sort((a,b)=>ORDER.indexOf(a.status)-ORDER.indexOf(b.status))
    const hrsE=mt.reduce((s,t)=>s+Number(t.hours||0),0)
    const hrsR=mt.reduce((s,t)=>s+Number(t.hours_real||0),0)
    // group by collab
    const collabMap={}
    mt.forEach(t=>{
      const a=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean)
      a.forEach(id=>{
        if(!collabMap[id])collabMap[id]={id,tasks:[],hrsR:0}
        collabMap[id].tasks.push(t)
        collabMap[id].hrsR+=Number(t.hours_real||0)
      })
    })
    return(
      <div>
        <button onClick={()=>setDetail(null)} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",color:"var(--muted)",fontSize:13,padding:"0 0 16px",fontFamily:"inherit"}}>← Volver a marcas</button>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20,padding:"16px",background:"var(--bg2)",borderRadius:12,border:"1px solid var(--border)"}}>
          <div style={{width:10,height:10,borderRadius:"50%",background:"var(--accent)",flexShrink:0}}/>
          <div style={{flex:1}}>
            <div style={{fontSize:17,fontWeight:700}}>{marca}</div>
            <div style={{fontSize:12,color:"var(--muted)"}}>{mt.length} órdenes en este período</div>
          </div>
          <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
            <Chip label="ÓRDENES" value={mt.length} color="var(--accent)"/>
            <Chip label="COMPLETADAS" value={mt.filter(t=>t.status==="completada").length} color="var(--green)"/>
            <Chip label="HRS EST." value={fmtH(hrsE)} color="var(--muted)"/>
            <Chip label="HRS REALES" value={fmtH(hrsR)} color="var(--blue)"/>
            <Chip label="EFICIENCIA" value={effLabel(eff(hrsE,hrsR))} color={effColor(eff(hrsE,hrsR))}/>
          </div>
        </div>
        {/* Colabs que trabajaron esta marca */}
        {Object.values(collabMap).length>0&&(
          <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 16px",marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:700,color:"var(--muted)",marginBottom:10,fontFamily:"var(--font-mono)"}}>COLABORADORES EN ESTA MARCA</div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              {Object.values(collabMap).map(c=>{
                const u=users.find(x=>x.id===c.id)
                if(!u)return null
                return(
                  <div key={c.id} style={{display:"flex",alignItems:"center",gap:7,background:"var(--bg3)",borderRadius:8,padding:"6px 10px"}}>
                    <Av u={u} size={24}/>
                    <div>
                      <div style={{fontSize:12,fontWeight:600}}>{u.name.split(" ")[0]}</div>
                      <div style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{fmtH(c.hrsR)} · {c.tasks.length} tareas</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {sorted.map(t=>{
            const a=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean)
            const names=a.map(id=>users.find(u=>u.id===id)?.name||"?").join(", ")
            const e=eff(t.hours,t.hours_real)
            const orderN=t.order_number?"AC-"+String(t.order_number).padStart(4,"0"):null
            return(
              <div key={t.id} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:180}}>
                  <div style={{fontWeight:600,fontSize:13,marginBottom:2}}>
                    {orderN&&<span style={{color:"var(--muted)",fontSize:11,fontFamily:"var(--font-mono)",marginRight:6}}>{orderN}</span>}
                    {t.title}
                  </div>
                  <div style={{fontSize:11,color:"var(--muted)"}}>{names||"Sin asignar"} · {fmtD(t.created_at)}</div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>Est: {fmtH(t.hours)}</span>
                  <span style={{fontSize:11,fontWeight:700,fontFamily:"var(--font-mono)"}}>Real: {fmtH(t.hours_real)}</span>
                  {e!=null&&<span style={{fontSize:11,fontWeight:700,color:effColor(e),fontFamily:"var(--font-mono)",background:"var(--bg3)",borderRadius:4,padding:"1px 7px"}}>{e}%</span>}
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
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
        <button className="btn btn-green" onClick={doExport} style={{display:"flex",alignItems:"center",gap:7,fontSize:13}}>
          <Icon n="exportar" size={13}/> Exportar CSV
        </button>
      </div>
      {rows.length===0&&<p style={{textAlign:"center",color:"var(--muted)",padding:48,fontSize:14}}>Sin actividad en este período.</p>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
        {rows.map((r,i)=>(
          <div key={r.marca} onClick={()=>setDetail(r)}
            style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:12,padding:"16px",cursor:"pointer",transition:".13s"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor="var(--accent)"}
            onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
              <span style={{fontSize:11,fontWeight:700,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>#{i+1}</span>
              <div style={{flex:1,fontSize:15,fontWeight:700}}>{r.marca}</div>
              <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{r.colabs.size} colab{r.colabs.size!==1?"s":""}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
              <Chip label="ÓRDENES" value={r.tasks.length}/>
              <Chip label="COMPLET." value={r.comp} color="var(--green)"/>
              <Chip label="HRS REAL" value={fmtH(r.hrsR)} color="var(--blue)"/>
              <Chip label="EFIC." value={effLabel(r.e)} color={effColor(r.e)}/>
            </div>
            <div style={{height:4,background:"var(--bg3)",borderRadius:2,overflow:"hidden"}}>
              <div style={{width:(r.comp/Math.max(r.tasks.length,1)*100)+"%",height:"100%",background:"var(--green)",borderRadius:2,transition:"width .6s"}}/>
            </div>
            <div style={{fontSize:10,color:"var(--muted)",marginTop:5,fontFamily:"var(--font-mono)"}}>
              {Math.round(r.comp/Math.max(r.tasks.length,1)*100)}% completado
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── TAB: Por Orden ─── */
function TabOrdenes({tasks,users,teams,range}){
  const[search,setSearch]=useState("")
  const[filterStatus,setFilterStatus]=useState("all")
  const filtered=filterByRange(tasks,range)

  const rows=useMemo(()=>{
    return filtered.filter(t=>{
      const q=search.toLowerCase()
      if(q){
        const a=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean)
        const names=a.map(id=>users.find(u=>u.id===id)?.name||"").join(" ").toLowerCase()
        const orderN=t.order_number?"ac-"+String(t.order_number).padStart(4,"0"):""
        if(!t.title?.toLowerCase().includes(q)&&!names.includes(q)&&!(t.marca||"").toLowerCase().includes(q)&&!orderN.includes(q))return false
      }
      if(filterStatus!=="all"&&t.status!==filterStatus)return false
      return true
    }).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0))
  },[filtered,search,filterStatus,users])

  function doExport(){
    const hdr=["No. Orden","Proyecto","Marca","Equipo","Responsable(s)","Estado","Prioridad","Hrs Est.","Hrs Reales","Eficiencia","Fecha Creación","Fecha Límite","Cambios"]
    const data=rows.map(t=>{
      const a=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean)
      const names=a.map(id=>users.find(u=>u.id===id)?.name||"?").join(", ")
      const team=teams.find(x=>x.id===t.team_id)
      const e=eff(t.hours,t.hours_real)
      const orderN=t.order_number?"AC-"+String(t.order_number).padStart(4,"0"):"-"
      return[orderN,t.title||"",t.marca||"—",team?.name||"Sin equipo",names||"Sin asignar",SL[t.status]||t.status,t.priority||"Normal",fmtH(t.hours),fmtH(t.hours_real),effLabel(e),fmtD(t.created_at),t.due_date?fmtD(t.due_date):"—",t.changes||0]
    })
    exportCSV([hdr,...data],"LaCata_Ordenes_"+new Date().toISOString().split("T")[0]+".csv")
  }

  const statusOpts=["all","pendiente","en_progreso","en_pausa","en_revision","completada","vencida"]

  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar orden, colaborador, marca..."
          style={{flex:1,minWidth:200,padding:"7px 12px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg3)",color:"var(--text)",fontSize:13,fontFamily:"inherit"}}/>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
          style={{padding:"7px 10px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg3)",color:"var(--text)",fontSize:13,fontFamily:"inherit",cursor:"pointer"}}>
          {statusOpts.map(s=><option key={s} value={s}>{s==="all"?"Todos los estados":SL[s]}</option>)}
        </select>
        <button className="btn btn-green" onClick={doExport} style={{display:"flex",alignItems:"center",gap:7,fontSize:13,whiteSpace:"nowrap"}}>
          <Icon n="exportar" size={13}/> Exportar CSV
        </button>
      </div>
      <div style={{fontSize:12,color:"var(--muted)",marginBottom:10,fontFamily:"var(--font-mono)"}}>{rows.length} órdenes</div>
      {rows.length===0&&<p style={{textAlign:"center",color:"var(--muted)",padding:48,fontSize:14}}>Sin resultados.</p>}
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {rows.map(t=>{
          const a=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean)
          const assignedUsers=a.map(id=>users.find(u=>u.id===id)).filter(Boolean)
          const team=teams.find(x=>x.id===t.team_id)
          const e=eff(t.hours,t.hours_real)
          const orderN=t.order_number?"AC-"+String(t.order_number).padStart(4,"0"):null
          const isOverdue=t.status==="vencida"
          const isComp=t.status==="completada"
          return(
            <div key={t.id} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 16px",
              borderLeft:`3px solid ${isOverdue?"var(--red)":isComp?"var(--green)":"var(--border)"}`,
              display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:200}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
                  {orderN&&<span style={{fontSize:11,fontFamily:"var(--font-mono)",color:"var(--muted)",background:"var(--bg3)",borderRadius:4,padding:"1px 6px"}}>{orderN}</span>}
                  {t.marca&&<span style={{fontSize:11,background:"var(--bg3)",borderRadius:4,padding:"1px 6px",color:"var(--muted)"}}>{t.marca}</span>}
                  <span style={{fontSize:11,background:"var(--bg3)",borderRadius:4,padding:"1px 6px"}}>{SL[t.status]||t.status}</span>
                </div>
                <div style={{fontWeight:600,fontSize:13,marginBottom:3}}>{t.title}</div>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  {assignedUsers.map(u=>(
                    <div key={u.id} style={{display:"flex",alignItems:"center",gap:4}}>
                      <Av u={u} size={18}/>
                      <span style={{fontSize:11,color:"var(--muted)"}}>{u.name.split(" ")[0]}</span>
                    </div>
                  ))}
                  {team&&<span style={{fontSize:11,color:"var(--muted)"}}>· {team.name}</span>}
                  <span style={{fontSize:11,color:"var(--muted)"}}>· {fmtD(t.created_at)}</span>
                  {t.due_date&&<span style={{fontSize:11,color:isOverdue?"var(--red)":"var(--muted)"}}>· límite {fmtD(t.due_date)}</span>}
                </div>
              </div>
              <div style={{display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"}}>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>Est: {fmtH(t.hours)}</div>
                  <div style={{fontSize:13,fontWeight:700,fontFamily:"var(--font-mono)"}}>Real: {fmtH(t.hours_real)}</div>
                </div>
                {e!=null&&(
                  <div style={{textAlign:"center",background:"var(--bg3)",borderRadius:8,padding:"5px 10px"}}>
                    <div style={{fontSize:15,fontWeight:800,color:effColor(e),fontFamily:"var(--font-display)"}}>{e}%</div>
                    <div style={{fontSize:9,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>EFIC.</div>
                  </div>
                )}
                {(t.changes||0)>0&&<span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{t.changes} cambios</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── MAIN ─── */
export default function ReportesView({tasks,users,teams,onBack}){
  const[tab,setTab]=useState("colaborador")
  const[period,setPeriod]=useState("semana")
  const[offset,setOffset]=useState(0)

  function handlePeriod(p,o){setPeriod(p);setOffset(o)}

  const range=getRangeLabel(period,offset)
  const filtered=filterByRange(tasks,range)

  const TABS=[
    {v:"colaborador",l:"Por colaborador",icon:"persona"},
    {v:"marca",l:"Por marca",icon:"marca"},
    {v:"ordenes",l:"Por orden",icon:"ordenes"},
  ]

  // summary stats
  const hrsR=filtered.reduce((s,t)=>s+Number(t.hours_real||0),0)
  const hrsE=filtered.reduce((s,t)=>s+Number(t.hours||0),0)
  const comp=filtered.filter(t=>t.status==="completada").length
  const venc=filtered.filter(t=>t.status==="vencida").length
  const globalEff=eff(hrsE,hrsR)

  return(
    <div>
      {onBack&&<button onClick={onBack} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",color:"var(--muted)",fontSize:13,padding:"0 0 16px",fontFamily:"inherit"}}>← Atrás</button>}

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:12}}>
        <h2 style={{fontSize:18,fontWeight:800,fontFamily:"var(--font-display)"}}>Reportería</h2>
        <PeriodBar period={period} offset={offset} onChange={handlePeriod}/>
      </div>

      {/* KPIs globales */}
      <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
        {[
          {l:"ÓRDENES",v:filtered.length,c:"var(--accent)"},
          {l:"COMPLETADAS",v:comp,c:"var(--green)"},
          {l:"VENCIDAS",v:venc,c:venc>0?"var(--red)":"var(--muted)"},
          {l:"HRS REALES",v:fmtH(hrsR),c:"var(--blue)"},
          {l:"HRS EST.",v:fmtH(hrsE),c:"var(--muted)"},
          {l:"EFICIENCIA",v:effLabel(globalEff),c:effColor(globalEff)},
        ].map(({l,v,c})=>(
          <div key={l} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 16px",textAlign:"center",flex:1,minWidth:80}}>
            <div style={{fontSize:18,fontWeight:800,color:c,fontFamily:"var(--font-display)",lineHeight:1.1}}>{v}</div>
            <div style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)",marginTop:3}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:4,background:"var(--bg3)",borderRadius:10,padding:4,marginBottom:20}}>
        {TABS.map(t=>(
          <button key={t.v} onClick={()=>setTab(t.v)}
            style={{flex:1,padding:"8px 4px",borderRadius:7,fontSize:12,cursor:"pointer",border:"none",fontFamily:"inherit",
              background:tab===t.v?"var(--bg2)":"transparent",
              color:tab===t.v?"var(--text)":"var(--muted)",
              fontWeight:tab===t.v?700:400,transition:".13s"}}>
            {t.l}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab==="colaborador"&&<TabColaborador tasks={tasks} users={users} teams={teams} range={range}/>}
      {tab==="marca"&&<TabMarca tasks={tasks} users={users} teams={teams} range={range}/>}
      {tab==="ordenes"&&<TabOrdenes tasks={tasks} users={users} teams={teams} range={range}/>}
    </div>
  )
}
