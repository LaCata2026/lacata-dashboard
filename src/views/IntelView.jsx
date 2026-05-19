import{useState,useMemo,useEffect}from'react'
import Icon from'../components/Icon'
import{Av,SC,BackBtn,StatusLegend}from'../components/Shared'
import{showToast}from'../components/Toast'
import{teamColor}from'../lib/supabase'
import{assignedOf}from'../lib/utils'
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
   GRÁFICA: BARRAS HORIZONTALES SVG
   Usada en Colaboradores — hrs reales por persona
═══════════════════════════════════════════ */
function BarChart({data,maxVal,colorFn,labelKey,valueKey,valueSuffix=""}){
  if(!data||data.length===0)return null
  const BAR_H=22,GAP=8,LABEL_W=110,VALUE_W=48,BAR_W=260
  const h=data.length*(BAR_H+GAP)
  return(
    <svg width="100%" viewBox={`0 0 ${LABEL_W+BAR_W+VALUE_W+16} ${h}`} style={{overflow:"visible",display:"block"}}>
      {data.map((d,i)=>{
        const y=i*(BAR_H+GAP)
        const val=Number(d[valueKey])||0
        const pct=maxVal>0?Math.max(val/maxVal,val>0?0.02:0):0
        const barW=Math.round(pct*BAR_W)
        const color=colorFn?colorFn(d,i):"var(--accent)"
        return(
          <g key={d[labelKey]||i}>
            {/* Label */}
            <text x={LABEL_W-8} y={y+BAR_H/2+4} textAnchor="end" fontSize={11}
              fill="var(--text)" fontFamily="var(--font-body)" style={{dominantBaseline:"middle"}}>
              {(d[labelKey]||"").split(" ")[0]}
            </text>
            {/* Bar background */}
            <rect x={LABEL_W} y={y} width={BAR_W} height={BAR_H} rx={4} fill="var(--bg3)"/>
            {/* Bar fill */}
            {barW>0&&<rect x={LABEL_W} y={y} width={barW} height={BAR_H} rx={4} fill={color} style={{transition:"width .6s cubic-bezier(.4,0,.2,1)"}}/>}
            {/* Value */}
            <text x={LABEL_W+BAR_W+8} y={y+BAR_H/2+4} fontSize={11} fontWeight={700}
              fill={color} fontFamily="var(--font-mono)" style={{dominantBaseline:"middle"}}>
              {val>0?val.toFixed(1)+valueSuffix:"—"}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/* ═══════════════════════════════════════════
   GRÁFICA: BARRAS APILADAS SVG
   Usada en Equipos — completadas/activas/vencidas
═══════════════════════════════════════════ */
function StackedBar({comp,actv,venc,total}){
  if(total===0)return<div style={{height:14,background:"var(--bg3)",borderRadius:4}}/>
  const W=100
  const wComp=Math.round(comp/total*W)
  const wVenc=Math.round(venc/total*W)
  const wActv=W-wComp-wVenc
  return(
    <div style={{display:"flex",height:14,borderRadius:4,overflow:"hidden",background:"var(--bg3)"}}>
      {wComp>0&&<div style={{width:wComp+"%",background:"var(--green)",transition:"width .5s"}}/>}
      {wActv>0&&<div style={{width:wActv+"%",background:"var(--blue)",opacity:.7,transition:"width .5s"}}/>}
      {wVenc>0&&<div style={{width:wVenc+"%",background:"var(--red)",transition:"width .5s"}}/>}
    </div>
  )
}

/* ═══════════════════════════════════════════
   GRÁFICA: DONUT SVG
   Usada en Marcas — distribución hrs por marca
═══════════════════════════════════════════ */
function DonutChart({data,size=180}){
  if(!data||data.length===0)return null
  const total=data.reduce((s,d)=>s+d.value,0)
  if(total===0)return null
  const cx=size/2,cy=size/2,r=size*0.38,inner=size*0.24
  const COLORS=["var(--accent)","var(--blue)","var(--green)","var(--s-revision)","var(--orange)","var(--red)","var(--yellow)","var(--s-progreso)"]

  let startAngle=-Math.PI/2
  const slices=data.map((d,i)=>{
    const angle=(d.value/total)*2*Math.PI
    const endAngle=startAngle+angle
    const x1=cx+r*Math.cos(startAngle),y1=cy+r*Math.sin(startAngle)
    const x2=cx+r*Math.cos(endAngle),y2=cy+r*Math.sin(endAngle)
    const xi1=cx+inner*Math.cos(startAngle),yi1=cy+inner*Math.sin(startAngle)
    const xi2=cx+inner*Math.cos(endAngle),yi2=cy+inner*Math.sin(endAngle)
    const large=angle>Math.PI?1:0
    const path=`M${xi1},${yi1} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${xi2},${yi2} A${inner},${inner} 0 ${large} 0 ${xi1},${yi1} Z`
    const color=COLORS[i%COLORS.length]
    startAngle=endAngle
    return{path,color,label:d.label,value:d.value,pct:Math.round(d.value/total*100)}
  })

  return(
    <div style={{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{flexShrink:0}}>
        {slices.map((s,i)=>(
          <path key={i} d={s.path} fill={s.color} stroke="var(--bg2)" strokeWidth={2}/>
        ))}
        <text x={cx} y={cy-6} textAnchor="middle" fontSize={13} fontWeight={800}
          fill="var(--text)" fontFamily="var(--font-display)">{data.length}</text>
        <text x={cx} y={cy+10} textAnchor="middle" fontSize={9}
          fill="var(--muted)" fontFamily="var(--font-mono)">MARCAS</text>
      </svg>
      <div style={{display:"flex",flexDirection:"column",gap:6,flex:1,minWidth:120}}>
        {slices.map((s,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:7}}>
            <div style={{width:10,height:10,borderRadius:2,background:s.color,flexShrink:0}}/>
            <span style={{fontSize:11,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.label}</span>
            <span style={{fontSize:11,fontWeight:700,color:s.color,fontFamily:"var(--font-mono)",minWidth:32,textAlign:"right"}}>{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   TAB 1 — OVERVIEW GENERAL
   Vista completa: colaboradores, equipos, marcas,
   alertas — todo clickeable, colores consistentes
═══════════════════════════════════════════ */
function TabCarga({tasks,users,teams,myTeamIds,isCuentas,myProfile,token,onRefresh,initialUser,onNavigateHome,onSwitchTab,onOpenTask}){
  const[selectedUser,setSelectedUser]=useState(initialUser||null)

  const colabs=users.filter(u=>{
    if(u.role!=="colaborador")return false
    if(!isCuentas||!myTeamIds)return true
    return myTeamIds.includes(u.team_id)||(Array.isArray(u.team_ids)&&u.team_ids.some(id=>myTeamIds.includes(id)))
  })

  // Calcular datos de colaboradores
  const colabData=colabs.map(u=>{
    const active=tasks.filter(t=>assignedOf(t).includes(u.id)&&t.status!=="completada")
    const done=tasks.filter(t=>assignedOf(t).includes(u.id)&&t.status==="completada")
    const venc=tasks.filter(t=>assignedOf(t).includes(u.id)&&t.status==="vencida")
    const hrsR=tasks.filter(t=>assignedOf(t).includes(u.id)).reduce((s,t)=>s+Number(t.hours_real||0),0)
    const team=teams.find(t=>t.id===u.team_id)
    const loadColor=venc.length>0?"var(--red)":active.length>=7?"var(--red)":active.length>=4?"var(--yellow)":u.avatar_color||"var(--green)"
    return{u,active,done,venc,hrsR,team,loadColor}
  }).sort((a,b)=>b.active.length-a.active.length)

  // Calcular datos de equipos
  const teamData=teams.map(team=>{
    const mt=tasks.filter(t=>t.team_id===team.id)
    const comp=mt.filter(t=>t.status==="completada")
    const venc=mt.filter(t=>t.status==="vencida")
    const actv=mt.filter(t=>t.status!=="completada"&&t.status!=="vencida")
    const hrsR=mt.reduce((s,t)=>s+Number(t.hours_real||0),0)
    const members=users.filter(u=>(u.team_id===team.id||(Array.isArray(u.team_ids)&&u.team_ids.includes(team.id)))&&u.role==="colaborador")
    return{team,mt,comp,venc,actv,hrsR,members}
  }).filter(r=>r.mt.length>0).sort((a,b)=>b.mt.length-a.mt.length)

  // Calcular datos de marcas
  const marcaMap={}
  tasks.forEach(t=>{
    const m=t.marca||"Sin marca"
    if(!marcaMap[m])marcaMap[m]={marca:m,tasks:[],hrsR:0,colabs:new Set()}
    marcaMap[m].tasks.push(t)
    marcaMap[m].hrsR+=Number(t.hours_real||0)
    assignedOf(t).forEach(id=>marcaMap[m].colabs.add(id))
  })
  const marcaData=Object.values(marcaMap).sort((a,b)=>b.hrsR-a.hrsR).slice(0,6)
  const maxMarcaHrs=Math.max(...marcaData.map(r=>r.hrsR),1)
  const MARCA_COLORS=["var(--accent)","var(--blue)","var(--green)","var(--s-revision)","var(--orange)","var(--yellow)"]

  // Alertas: vencidas + sobrecargados
  const vencidasAlerts=tasks.filter(t=>t.status==="vencida").slice(0,4)
  const sobrecargados=colabData.filter(c=>c.active.length>=7)

  // Vista detalle de colaborador
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
        <BackBtn onClick={()=>setSelectedUser(null)} label="← Overview"/>
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
    <div style={{display:"flex",flexDirection:"column",gap:16}}>

      {/* ── ALERTAS — solo si hay problemas ── */}
      {(vencidasAlerts.length>0||sobrecargados.length>0)&&(
        <div style={{background:"rgba(239,68,68,.07)",border:"1px solid rgba(239,68,68,.2)",borderRadius:12,padding:"14px 16px"}}>
          <div style={{fontSize:11,fontWeight:700,color:"var(--red)",fontFamily:"var(--font-mono)",marginBottom:10,letterSpacing:".06em"}}>⚠️ REQUIEREN ATENCIÓN</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {sobrecargados.map(({u,active})=>(
              <div key={u.id} onClick={()=>setSelectedUser(u)}
                style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"6px 8px",borderRadius:7,transition:".13s"}}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(239,68,68,.08)"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <Av u={u} size={24}/>
                <span style={{fontSize:12,fontWeight:600,flex:1}}>{u.name.split(" ")[0]}</span>
                <span style={{fontSize:11,color:"var(--red)",fontFamily:"var(--font-mono)",fontWeight:700}}>{active.length} tareas activas</span>
                <span style={{fontSize:11,color:"var(--muted)"}}>→</span>
              </div>
            ))}
            {vencidasAlerts.map(t=>{
              const u=users.find(x=>assignedOf(t).includes(x.id))
              return(
                <div key={t.id} onClick={()=>onOpenTask&&onOpenTask(t)}
                  style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"6px 8px",borderRadius:7,transition:".13s"}}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(239,68,68,.08)"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  {t.order_number&&<span style={{fontSize:11,fontWeight:700,color:"var(--red)",fontFamily:"var(--font-mono)",minWidth:52}}>AC-{String(t.order_number).padStart(4,"0")}</span>}
                  <span style={{fontSize:12,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.title}</span>
                  {u&&<Av u={u} size={20}/>}
                  <span style={{fontSize:11,color:"var(--muted)"}}>→</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── GRID PRINCIPAL: Colaboradores + Equipos ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:12}}>

        {/* COLABORADORES — mapa de avatares con color de carga */}
        <div className="card fade-in">
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <h3 style={{fontSize:14,fontWeight:700}}>Colaboradores</h3>
            <div style={{display:"flex",gap:8,fontSize:10,fontFamily:"var(--font-mono)"}}>
              <span style={{color:"var(--green)"}}>● OK</span>
              <span style={{color:"var(--yellow)"}}>● Cargado</span>
              <span style={{color:"var(--red)"}}>● Crítico</span>
            </div>
          </div>
          {colabData.length===0&&<p style={{fontSize:12,color:"var(--muted)",textAlign:"center",padding:16}}>Sin colaboradores</p>}
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {colabData.map(({u,active,done,venc,hrsR,team,loadColor})=>{
              const pct=Math.min(100,active.length/8*100)
              return(
                <div key={u.id} onClick={()=>setSelectedUser(u)}
                  style={{display:"flex",alignItems:"center",gap:10,padding:"9px 10px",borderRadius:9,cursor:"pointer",border:"1px solid var(--border)",background:"var(--bg3)",transition:".13s"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=loadColor}
                  onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
                  {/* Avatar con indicador de color */}
                  <div style={{position:"relative",flexShrink:0}}>
                    <Av u={u} size={36}/>
                    <div style={{position:"absolute",bottom:-2,right:-2,width:11,height:11,borderRadius:"50%",background:loadColor,border:"2px solid var(--bg3)"}}/>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <span style={{fontSize:12,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.name.split(" ")[0]}</span>
                      <div style={{display:"flex",gap:8,fontSize:11,fontFamily:"var(--font-mono)",flexShrink:0}}>
                        <span style={{color:"var(--green)"}}>✓{done.length}</span>
                        {venc.length>0&&<span style={{color:"var(--red)"}}>!{venc.length}</span>}
                        <span style={{color:loadColor,fontWeight:700}}>{active.length}</span>
                      </div>
                    </div>
                    {/* Barra de carga con color del avatar */}
                    <div style={{height:5,background:"var(--bg2)",borderRadius:3,overflow:"hidden"}}>
                      <div style={{width:pct+"%",height:"100%",background:loadColor,borderRadius:3,transition:"width .6s cubic-bezier(.4,0,.2,1)"}}/>
                    </div>
                    <div style={{fontSize:10,color:"var(--muted)",marginTop:3,fontFamily:"var(--font-mono)"}}>{team?.name||"Sin equipo"} · {fmtH(hrsR)}</div>
                  </div>
                  <span style={{fontSize:11,color:"var(--muted)"}}>→</span>
                </div>
              )
            })}
          </div>
          {onSwitchTab&&<button onClick={()=>onSwitchTab("desempeno")} style={{marginTop:12,width:"100%",padding:"7px",background:"transparent",border:"1px solid var(--border)",borderRadius:7,color:"var(--muted)",fontSize:11,cursor:"pointer",fontFamily:"var(--font-body)"}}>Ver análisis histórico →</button>}
        </div>

        {/* EQUIPOS — barras apiladas con color del equipo */}
        <div className="card fade-in">
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <h3 style={{fontSize:14,fontWeight:700}}>Equipos</h3>
            <div style={{display:"flex",gap:8,fontSize:10,fontFamily:"var(--font-mono)"}}>
              <span style={{color:"var(--green)"}}>■ Comp.</span>
              <span style={{color:"var(--blue)",opacity:.7}}>■ Activas</span>
              <span style={{color:"var(--red)"}}>■ Venc.</span>
            </div>
          </div>
          {teamData.length===0&&<p style={{fontSize:12,color:"var(--muted)",textAlign:"center",padding:16}}>Sin actividad</p>}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {teamData.map(({team,mt,comp,venc,actv,hrsR,members})=>{
              const tc=teamColor(team)
              const health=venc.length>0?"var(--red)":actv.length/Math.max(members.length,1)>=4?"var(--yellow)":"var(--green)"
              return(
                <div key={team.id} onClick={()=>onSwitchTab&&onSwitchTab("equipos")}
                  style={{cursor:"pointer",padding:"10px 12px",borderRadius:9,border:"1px solid var(--border)",background:"var(--bg3)",transition:".13s"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=tc}
                  onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <div style={{width:3,height:28,borderRadius:2,background:tc,flexShrink:0}}/>
                    <span style={{fontSize:13,fontWeight:700,flex:1}}>{team.name}</span>
                    <div style={{width:8,height:8,borderRadius:"50%",background:health}}/>
                    <span style={{fontSize:11,fontFamily:"var(--font-mono)",color:"var(--muted)"}}>{members.length} miembros</span>
                  </div>
                  {/* Barra apilada con color del equipo para la parte activa */}
                  <div style={{display:"flex",height:10,borderRadius:4,overflow:"hidden",background:"var(--bg2)",marginBottom:6}}>
                    {comp.length>0&&<div style={{width:(comp.length/mt.length*100)+"%",background:"var(--green)",transition:"width .5s"}}/>}
                    {actv.length>0&&<div style={{width:(actv.length/mt.length*100)+"%",background:tc,opacity:.8,transition:"width .5s"}}/>}
                    {venc.length>0&&<div style={{width:(venc.length/mt.length*100)+"%",background:"var(--red)",transition:"width .5s"}}/>}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>
                    <span>✓{comp.length} · {actv.length} activas{venc.length>0?` · ${venc.length} venc.`:""}</span>
                    <span>{fmtH(hrsR)}</span>
                  </div>
                </div>
              )
            })}
          </div>
          {onSwitchTab&&<button onClick={()=>onSwitchTab("equipos")} style={{marginTop:12,width:"100%",padding:"7px",background:"transparent",border:"1px solid var(--border)",borderRadius:7,color:"var(--muted)",fontSize:11,cursor:"pointer",fontFamily:"var(--font-body)"}}>Ver análisis histórico →</button>}
        </div>
      </div>

      {/* ── MARCAS — barras horizontales proporcionales ── */}
      <div className="card fade-in">
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <h3 style={{fontSize:14,fontWeight:700}}>Actividad por marca</h3>
          <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>Todas las órdenes · horas reales</span>
        </div>
        {marcaData.length===0&&<p style={{fontSize:12,color:"var(--muted)",textAlign:"center",padding:16}}>Sin actividad</p>}
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {marcaData.map((r,i)=>{
            const color=MARCA_COLORS[i%MARCA_COLORS.length]
            const pct=maxMarcaHrs>0?Math.max(r.hrsR/maxMarcaHrs,r.hrsR>0?0.02:0)*100:0
            const comp=r.tasks.filter(t=>t.status==="completada").length
            const venc=r.tasks.filter(t=>t.status==="vencida").length
            return(
              <div key={r.marca} onClick={()=>onSwitchTab&&onSwitchTab("marcas")}
                style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"8px 10px",borderRadius:8,transition:".13s"}}
                onMouseEnter={e=>e.currentTarget.style.background="var(--bg3)"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div style={{width:10,height:10,borderRadius:2,background:color,flexShrink:0}}/>
                <span style={{fontSize:12,fontWeight:600,minWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.marca}</span>
                <div style={{flex:1,height:12,background:"var(--bg3)",borderRadius:3,overflow:"hidden"}}>
                  <div style={{width:pct+"%",height:"100%",background:color,borderRadius:3,transition:"width .6s cubic-bezier(.4,0,.2,1)"}}/>
                </div>
                <span style={{fontSize:11,fontWeight:700,color,fontFamily:"var(--font-mono)",minWidth:36,textAlign:"right"}}>{fmtH(r.hrsR)}</span>
                <div style={{display:"flex",gap:6,fontSize:10,fontFamily:"var(--font-mono)",minWidth:70}}>
                  <span style={{color:"var(--green)"}}>✓{comp}</span>
                  {venc>0&&<span style={{color:"var(--red)"}}>!{venc}</span>}
                  <span style={{color:"var(--muted)"}}>{r.colabs.size}p</span>
                </div>
              </div>
            )
          })}
        </div>
        {onSwitchTab&&<button onClick={()=>onSwitchTab("marcas")} style={{marginTop:12,width:"100%",padding:"7px",background:"transparent",border:"1px solid var(--border)",borderRadius:7,color:"var(--muted)",fontSize:11,cursor:"pointer",fontFamily:"var(--font-body)"}}>Ver análisis por marca →</button>}
      </div>

    </div>
  )
}

/* ═══════════════════════════════════════════
   TAB 2 — COLABORADORES
   + Gráfica barras horizontales hrs reales
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
  }).filter(r=>r.mt.length>0).sort((a,b)=>b.hrsR-a.hrsR),[filtered])

  const maxHrs=Math.max(...rows.map(r=>r.hrsR),1)
  const top=rows[0]
  const bot=rows.length>1?rows[rows.length-1]:null

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
        <BackBtn onClick={()=>setDetail(null)} label="← Colaboradores"/>
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
      {/* ── GRÁFICA: barras horizontales hrs reales ── */}
      {rows.length>0&&(
        <div className="card fade-in" style={{marginBottom:20}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:8}}>
            <div>
              <h3 style={{fontSize:15,fontWeight:700,marginBottom:2}}>Horas reales por colaborador</h3>
              <p style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>Ordenado de mayor a menor · click para ver detalle</p>
            </div>
            <div style={{display:"flex",gap:12,fontSize:11,fontFamily:"var(--font-mono)"}}>
              {top&&<span style={{color:"var(--green)"}}>▲ {top.u.name.split(" ")[0]} {fmtH(top.hrsR)}</span>}
              {bot&&<span style={{color:"var(--muted)"}}>▼ {bot.u.name.split(" ")[0]} {fmtH(bot.hrsR)}</span>}
            </div>
          </div>
          <BarChart
            data={rows.map(r=>({name:r.u.name,hrsR:r.hrsR,color:r.u.avatar_color||"var(--accent)",u:r.u}))}
            maxVal={maxHrs}
            labelKey="name"
            valueKey="hrsR"
            valueSuffix="h"
            colorFn={(d,i)=>i===0?"var(--green)":i===rows.length-1&&rows.length>1?"var(--red)":d.color||"var(--accent)"}
          />
          {/* Leyenda eficiencia */}
          <div style={{display:"flex",gap:16,marginTop:14,paddingTop:12,borderTop:"1px solid var(--border)",flexWrap:"wrap"}}>
            {rows.map(r=>(
              <div key={r.u.id} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}} onClick={()=>setDetail({u:r.u,mt:r.mt})}>
                <Av u={r.u} size={20}/>
                <div>
                  <div style={{fontSize:11,fontWeight:600}}>{r.u.name.split(" ")[0]}</div>
                  <div style={{fontSize:10,color:effColor(r.e),fontFamily:"var(--font-mono)",fontWeight:700}}>{effLabel(r.e)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Rankings top/bottom ── */}
      {rows.length>=2&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
          <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px"}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--green)",fontFamily:"var(--font-mono)",marginBottom:10,letterSpacing:".08em"}}>🏆 MÁS PRODUCTIVOS</div>
            {rows.slice(0,3).map(({u,comp,hrsR},i)=>(
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
            {[...rows].sort((a,b)=>a.comp.length-b.comp.length).slice(0,3).map(({u,comp,venc,hrsR},i)=>(
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
   + Gráfica barras apiladas comp/actv/venc
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
      {/* ── GRÁFICA: barras apiladas por equipo ── */}
      {rows.length>0&&(
        <div className="card fade-in" style={{marginBottom:20}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
            <h3 style={{fontSize:15,fontWeight:700}}>Órdenes por equipo</h3>
            <div style={{display:"flex",gap:12,fontSize:11,fontFamily:"var(--font-mono)"}}>
              <span style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:10,borderRadius:2,background:"var(--green)"}}/> Completadas</span>
              <span style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:10,borderRadius:2,background:"var(--blue)",opacity:.7}}/> Activas</span>
              <span style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:10,borderRadius:2,background:"var(--red)"}}/> Vencidas</span>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {rows.map(({team,mt,comp,venc})=>{
              const actv=mt.filter(t=>t.status!=="completada"&&t.status!=="vencida")
              return(
                <div key={team.id} style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}
                  onClick={()=>setDetail({team,members:users.filter(u=>(u.team_id===team.id||(Array.isArray(u.team_ids)&&u.team_ids.includes(team.id)))&&u.role==="colaborador"),mt})}>
                  <div style={{width:4,height:32,borderRadius:2,background:teamColor(team),flexShrink:0}}/>
                  <span style={{fontSize:12,fontWeight:600,minWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{team.name}</span>
                  <div style={{flex:1}}>
                    <StackedBar comp={comp.length} actv={actv.length} venc={venc.length} total={mt.length}/>
                  </div>
                  <span style={{fontSize:12,fontWeight:700,fontFamily:"var(--font-mono)",minWidth:28,textAlign:"right"}}>{mt.length}</span>
                  <span style={{fontSize:11,color:"var(--muted)"}}>→</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

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
              <div style={{fontSize:11,fontWeight:700,color:"var(--muted)",fontFamily:"var(--font-mono)",marginBottom:8,letterSpacing:".08em"}}>📉 MENOS ACTIVIDAD</div>
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
            <StackedBar comp={comp.length} actv={mt.filter(t=>t.status!=="completada"&&t.status!=="vencida").length} venc={venc.length} total={mt.length}/>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)",marginTop:6}}>
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
   + Donut distribución hrs + comparativo top/bottom
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
  const botMarca=rows.length>1?rows[rows.length-1]:null
  const mostChanges=[...rows].sort((a,b)=>b.changes-a.changes)[0]
  const maxHrs=Math.max(...rows.map(r=>r.hrsR),1)

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
      {rows.length>0&&(
        <>
          {/* ── GRÁFICA: Donut distribución hrs + comparativo top/bottom ── */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12,marginBottom:20}}>

            {/* Donut */}
            <div className="card fade-in">
              <h3 style={{fontSize:14,fontWeight:700,marginBottom:16}}>Distribución de horas reales</h3>
              <DonutChart data={rows.map(r=>({label:r.marca,value:r.hrsR}))}/>
            </div>

            {/* Comparativo top vs bottom */}
            {rows.length>=2&&topMarca&&botMarca&&(
              <div className="card fade-in">
                <h3 style={{fontSize:14,fontWeight:700,marginBottom:16}}>Top vs bottom</h3>
                {[
                  {label:"Órdenes",top:topMarca.tasks.length,bot:botMarca.tasks.length,color:"var(--accent)"},
                  {label:"Completadas",top:topMarca.comp,bot:botMarca.comp,color:"var(--green)"},
                  {label:"Hrs reales",top:topMarca.hrsR,bot:botMarca.hrsR,color:"var(--blue)"},
                  {label:"Cambios",top:topMarca.changes,bot:botMarca.changes,color:"var(--yellow)"},
                ].map(({label,top,bot,color})=>{
                  const mx=Math.max(top,bot,1)
                  return(
                    <div key={label} style={{marginBottom:12}}>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)",marginBottom:4}}>
                        <span style={{color:"var(--green)",fontWeight:700}}>{topMarca.marca.slice(0,12)}</span>
                        <span style={{fontWeight:600}}>{label}</span>
                        <span style={{color:"var(--muted)"}}>{botMarca.marca.slice(0,12)}</span>
                      </div>
                      <div style={{display:"flex",gap:3,alignItems:"center"}}>
                        <div style={{flex:top/mx,height:16,background:color,borderRadius:"4px 0 0 4px",minWidth:top>0?4:0,transition:"flex .5s"}}/>
                        <span style={{fontSize:10,fontFamily:"var(--font-mono)",minWidth:28,textAlign:"center",fontWeight:700,color}}>{typeof top==="number"&&top%1!==0?top.toFixed(1):top}</span>
                        <div style={{flex:bot/mx,height:16,background:"var(--bg3)",borderRadius:"0 4px 4px 0",border:"1px solid var(--border)",minWidth:bot>0?4:0,transition:"flex .5s"}}/>
                      </div>
                    </div>
                  )
                })}
                <div style={{display:"flex",justifyContent:"space-between",marginTop:8,fontSize:11,fontFamily:"var(--font-mono)"}}>
                  <span style={{color:"var(--green)",fontWeight:700}}>↑ {topMarca.marca}</span>
                  <span style={{color:"var(--muted)"}}>↓ {botMarca.marca}</span>
                </div>
              </div>
            )}
          </div>

          {/* Barras horizontales hrs por marca */}
          <div className="card fade-in" style={{marginBottom:20}}>
            <h3 style={{fontSize:14,fontWeight:700,marginBottom:16}}>Horas reales por marca</h3>
            <BarChart
              data={rows.map(r=>({marca:r.marca,hrsR:r.hrsR}))}
              maxVal={maxHrs}
              labelKey="marca"
              valueKey="hrsR"
              valueSuffix="h"
              colorFn={(d,i)=>i===0?"var(--accent)":"var(--blue)"}
            />
          </div>

          {/* Insight cards — solo cambios y vencidas (no duplica el donut) */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,marginBottom:20}}>
            {mostChanges&&mostChanges.changes>0&&(
              <div style={{background:"var(--bg2)",border:"1px solid var(--yellow)",borderRadius:12,padding:"14px 16px"}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--yellow)",fontFamily:"var(--font-mono)",marginBottom:6,letterSpacing:".08em"}}>🔄 MÁS CAMBIOS</div>
                <div style={{fontSize:15,fontWeight:700}}>{mostChanges.marca}</div>
                <div style={{fontSize:12,color:"var(--muted)",marginTop:4}}>{mostChanges.changes} cambios en {mostChanges.tasks.length} órdenes</div>
              </div>
            )}
            {rows.filter(r=>r.venc>0).length>0&&(
              <div style={{background:"var(--bg2)",border:"1px solid var(--red)",borderRadius:12,padding:"14px 16px"}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--red)",fontFamily:"var(--font-mono)",marginBottom:6,letterSpacing:".08em"}}>⚠️ CON VENCIDAS</div>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {rows.filter(r=>r.venc>0).map(r=>(
                    <div key={r.marca} style={{fontSize:13,fontWeight:600}}>{r.marca} <span style={{color:"var(--red)",fontFamily:"var(--font-mono)",fontSize:11}}>{r.venc} venc.</span></div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
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
═══════════════════════════════════════════ */
export default function IntelView({tasks,users,teams,onBack,me,profile,token,onRefresh,onLoadHistory,initialUser,onNavigate,onOpenTask}){
  const[tab,setTab]=useState("carga")
  const[period,setPeriod]=useState("semana")
  const[offset,setOffset]=useState(0)
  const[historyLoaded,setHistoryLoaded]=useState(false)

  useEffect(()=>{
    if(historyLoaded||!onLoadHistory)return
    const needsHistory=offset<0||tab==="ordenes"||tab==="marcas"||tab==="desempeno"
    if(needsHistory){setHistoryLoaded(true);onLoadHistory()}
  },[offset,tab,historyLoaded,onLoadHistory])

  const myProfile=me||profile
  const isCuentas=myProfile?.role==="cuentas"
  const myTeamIds=isCuentas?(Array.isArray(myProfile?.team_ids)&&myProfile.team_ids.length>0?myProfile.team_ids:[myProfile?.team_id].filter(Boolean)):null
  const visibleTasks=isCuentas&&myTeamIds?tasks.filter(t=>myTeamIds.includes(t.team_id)):tasks

  function handlePeriod(p,o){setPeriod(p);setOffset(o)}
  const range=getRangeLabel(period,offset)

  const TABS=[
    {v:"carga",l:"Carga actual"},
    {v:"desempeno",l:"Colaboradores"},
    {v:"equipos",l:"Equipos"},
    {v:"marcas",l:"Marcas"},
    {v:"ordenes",l:"Órdenes"},
  ]

  const filtered=filterByRange(visibleTasks,range)
  const hrsR=filtered.reduce((s,t)=>s+Number(t.hours_real||0),0)
  const hrsE=filtered.reduce((s,t)=>s+Number(t.hours||0),0)
  const comp=filtered.filter(t=>t.status==="completada").length
  const venc=filtered.filter(t=>t.status==="vencida").length
  const globalEff=eff(hrsE,hrsR)

  return(
    <div>
      {onBack&&<BackBtn onClick={onBack}/>}

      {isCuentas&&myTeamIds&&(
        <div style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:8,padding:"8px 14px",marginBottom:12,fontSize:12,color:"var(--muted)",display:"flex",alignItems:"center",gap:8}}>
          <Icon n="equipo2" size={13}/>
          Mostrando datos de tus equipos asignados ({myTeamIds.length} equipo{myTeamIds.length!==1?"s":""})
        </div>
      )}

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:12}}>
        <h2 style={{fontSize:18,fontWeight:800,fontFamily:"var(--font-display)"}}>Desempeño & Reportería</h2>
        {tab!=="carga"&&<PeriodBar period={period} offset={offset} onChange={handlePeriod}/>}
      </div>

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

      {tab==="carga"&&<TabCarga tasks={visibleTasks} users={users} teams={teams} myTeamIds={myTeamIds} isCuentas={isCuentas} myProfile={myProfile} token={token} onRefresh={onRefresh} initialUser={initialUser||null} onNavigateHome={onNavigate?()=>onNavigate("home"):null} onSwitchTab={setTab} onOpenTask={onOpenTask}/>}
      {tab==="desempeno"&&<TabDesempeno tasks={visibleTasks} users={users} teams={teams} range={range}/>}
      {tab==="equipos"&&<TabEquipos tasks={visibleTasks} users={users} teams={teams} range={range}/>}
      {tab==="marcas"&&<TabMarcas tasks={visibleTasks} users={users} teams={teams} range={range}/>}
      {tab==="ordenes"&&<TabOrdenes tasks={visibleTasks} users={users} teams={teams} range={range}/>}
    </div>
  )
}
