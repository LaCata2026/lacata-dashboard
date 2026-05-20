import{useState,useMemo,useEffect}from'react'
import Icon from'../components/Icon'
import{Av,SC,BackBtn,StatusLegend}from'../components/Shared'
import{showToast}from'../components/Toast'
import{teamColor}from'../lib/supabase'
import{assignedOf}from'../lib/utils'
import TaskCard from'./TaskCard'

const SL={pendiente:"Pendiente",en_progreso:"En progreso",en_pausa:"En pausa",en_revision:"En revisión",completada:"Completada",vencida:"Vencida"}
const fmtH=h=>Number(h||0).toFixed(1)+"h"
const fmtD=s=>{if(!s)return"—";return new Date(s).toLocaleDateString("es-GT",{day:"2-digit",month:"short",year:"2-digit"})}
const eff=(est,real)=>{const e=Number(est),r=Number(real);if(!e||!r)return null;return Math.min(999,Math.round(e/r*100))}
const effColor=e=>e==null?"var(--muted)":e>=90?"var(--green)":e>=70?"var(--yellow)":"var(--red)"
const effLabel=e=>e==null?"—":e+"%"

function getRangeLabel(period,offset){
  const now=new Date()
  if(period==="todo")return{from:new Date(2000,0,1),to:new Date(2099,11,31,23,59,59,999),all:true}
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

function filterByRange(tasks,range){if(range&&range.all)return tasks;return tasks.filter(t=>taskHadActivity(t,range))}

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

function PeriodBar({period,offset,onChange}){
  const{from,to,all}=getRangeLabel(period,offset)
  const o={day:"2-digit",month:"short"}
  return(
    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
      <div style={{display:"flex",background:"var(--bg3)",borderRadius:8,padding:3,gap:3}}>
        {[["todo","Todo"],["mes","Mes"],["semana","Semana"]].map(([p,l])=>(
          <button key={p} onClick={()=>onChange(p,0)}
            style={{padding:"5px 14px",borderRadius:6,fontSize:12,cursor:"pointer",border:"none",fontFamily:"inherit",
              background:period===p?"var(--bg2)":"transparent",
              color:period===p?"var(--text)":"var(--muted)",fontWeight:period===p?600:400,transition:".13s"}}>
            {l}
          </button>
        ))}
      </div>
      {all?(
        <span style={{fontSize:12,color:"var(--muted)",fontFamily:"var(--font-mono)",minWidth:160,textAlign:"center"}}>
          Histórico completo
          <span style={{marginLeft:6,fontSize:10,background:"var(--accent)",color:"#fff",borderRadius:4,padding:"1px 6px",fontWeight:700}}>TODO</span>
        </span>
      ):(<>
        <button onClick={()=>onChange(period,offset-1)} style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:6,padding:"5px 10px",cursor:"pointer",color:"var(--text)",fontSize:13}}>‹</button>
        <span style={{fontSize:12,color:"var(--muted)",fontFamily:"var(--font-mono)",minWidth:160,textAlign:"center"}}>
          {from.toLocaleDateString("es-GT",o)} – {to.toLocaleDateString("es-GT",o)}
          {offset===0&&<span style={{marginLeft:6,fontSize:10,background:"var(--accent)",color:"#fff",borderRadius:4,padding:"1px 6px",fontWeight:700}}>ACTUAL</span>}
        </span>
        <button onClick={()=>onChange(period,offset+1)} disabled={offset>=0}
          style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:6,padding:"5px 10px",cursor:offset>=0?"default":"pointer",color:offset>=0?"var(--border)":"var(--text)",fontSize:13}}>›</button>
      </>)}
    </div>
  )
}

function Chip({label,value,color,sub}){
  return(
    <div style={{textAlign:"center",minWidth:60}}>
      <div style={{fontSize:18,fontWeight:800,color:color||"var(--text)",fontFamily:"var(--font-display)",lineHeight:1.1}}>{value}</div>
      <div style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)",marginTop:2,whiteSpace:"nowrap"}}>{label}</div>
      {sub&&<div style={{fontSize:10,color:color||"var(--muted)",fontFamily:"var(--font-mono)"}}>{sub}</div>}
    </div>
  )
}

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
            <text x={LABEL_W-8} y={y+BAR_H/2+4} textAnchor="end" fontSize={11} fill="var(--text)" fontFamily="var(--font-body)" style={{dominantBaseline:"middle"}}>{(d[labelKey]||"").split(" ")[0]}</text>
            <rect x={LABEL_W} y={y} width={BAR_W} height={BAR_H} rx={4} fill="var(--bg3)"/>
            {barW>0&&<rect x={LABEL_W} y={y} width={barW} height={BAR_H} rx={4} fill={color} style={{transition:"width .6s cubic-bezier(.4,0,.2,1)"}}/>}
            <text x={LABEL_W+BAR_W+8} y={y+BAR_H/2+4} fontSize={11} fontWeight={700} fill={color} fontFamily="var(--font-mono)" style={{dominantBaseline:"middle"}}>{val>0?val.toFixed(1)+valueSuffix:"—"}</text>
          </g>
        )
      })}
    </svg>
  )
}

function StackedBar({comp,actv,venc,total}){
  if(total===0)return<div style={{height:14,background:"var(--bg3)",borderRadius:4}}/>
  const W=100,wComp=Math.round(comp/total*W),wVenc=Math.round(venc/total*W),wActv=W-wComp-wVenc
  return(
    <div style={{display:"flex",height:14,borderRadius:4,overflow:"hidden",background:"var(--bg3)"}}>
      {wComp>0&&<div style={{width:wComp+"%",background:"var(--green)",transition:"width .5s"}}/>}
      {wActv>0&&<div style={{width:wActv+"%",background:"var(--blue)",opacity:.7,transition:"width .5s"}}/>}
      {wVenc>0&&<div style={{width:wVenc+"%",background:"var(--red)",transition:"width .5s"}}/>}
    </div>
  )
}

function DonutChart({data,size=180}){
  if(!data||data.length===0)return null
  const total=data.reduce((s,d)=>s+d.value,0)
  if(total===0)return null
  const cx=size/2,cy=size/2,r=size*0.38,inner=size*0.24
  const COLORS=["var(--accent)","var(--blue)","var(--green)","var(--s-revision)","var(--orange)","var(--red)","var(--yellow)","var(--s-progreso)"]
  let startAngle=-Math.PI/2
  const slices=data.map((d,i)=>{
    const angle=(d.value/total)*2*Math.PI,endAngle=startAngle+angle
    const x1=cx+r*Math.cos(startAngle),y1=cy+r*Math.sin(startAngle)
    const x2=cx+r*Math.cos(endAngle),y2=cy+r*Math.sin(endAngle)
    const xi1=cx+inner*Math.cos(startAngle),yi1=cy+inner*Math.sin(startAngle)
    const xi2=cx+inner*Math.cos(endAngle),yi2=cy+inner*Math.sin(endAngle)
    const large=angle>Math.PI?1:0
    const path=`M${xi1},${yi1} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${xi2},${yi2} A${inner},${inner} 0 ${large} 0 ${xi1},${yi1} Z`
    const color=COLORS[i%COLORS.length];startAngle=endAngle
    return{path,color,label:d.label,value:d.value,pct:Math.round(d.value/total*100)}
  })
  return(
    <div style={{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{flexShrink:0}}>
        {slices.map((s,i)=>(<path key={i} d={s.path} fill={s.color} stroke="var(--bg2)" strokeWidth={2}/>))}
        <text x={cx} y={cy-6} textAnchor="middle" fontSize={13} fontWeight={800} fill="var(--text)" fontFamily="var(--font-display)">{data.length}</text>
        <text x={cx} y={cy+10} textAnchor="middle" fontSize={9} fill="var(--muted)" fontFamily="var(--font-mono)">MARCAS</text>
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
   TAB OPERATIVO — carga de trabajo actual
   Antes era TeamsView (nav separado).
   Ahora vive aquí como primer tab de Reportes.
   Director ve todos los equipos.
   Cuentas ve solo sus equipos/marcas.
═══════════════════════════════════════════ */
function TabOperativo({tasks,users,teams,me,token,onRefresh,onOpenTask,onViewUser}){
  const[selectedTeam,setSelectedTeam]=useState("all")
  const[openMembers,setOpenMembers]=useState({})
  const isCollab=me?.role==="colaborador"
  const scopedTasks=isCollab?tasks.filter(t=>assignedOf(t).includes(me.id)):tasks
  const filteredTeams=selectedTeam==="all"?teams:teams.filter(t=>t.id===selectedTeam)

  // Stats globales de carga actual
  const totalActive=scopedTasks.filter(t=>t.status!=="completada").length
  const totalOverdue=scopedTasks.filter(t=>t.status==="vencida").length
  const totalRevision=scopedTasks.filter(t=>t.status==="en_revision").length
  const overloadedCount=users.filter(u=>u.role==="colaborador"&&scopedTasks.filter(t=>assignedOf(t).includes(u.id)&&t.status!=="completada").length>=7).length

  return(
    <div>
      {/* Resumen rápido */}
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        {[
          {l:"ACTIVAS",v:totalActive,c:"var(--accent)"},
          {l:"EN REVISIÓN",v:totalRevision,c:"var(--s-revision)"},
          {l:"VENCIDAS",v:totalOverdue,c:totalOverdue>0?"var(--red)":"var(--muted)"},
          {l:"SOBRECARGADOS",v:overloadedCount,c:overloadedCount>0?"var(--orange)":"var(--muted)"},
        ].map(({l,v,c})=>(
          <div key={l} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 14px",textAlign:"center",flex:1,minWidth:70}}>
            <div style={{fontSize:17,fontWeight:800,color:c,fontFamily:"var(--font-display)",lineHeight:1.1}}>{v}</div>
            <div style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)",marginTop:3}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Filtro por equipo */}
      <div className="filter-bar" style={{marginBottom:16}}>
        <button className={`filter-chip${selectedTeam==="all"?" active":""}`} onClick={()=>setSelectedTeam("all")}>Todos</button>
        {teams.map(t=>{const tc=teamColor(t);return(
          <button key={t.id} className={`filter-chip${selectedTeam===t.id?" active":""}`}
            style={selectedTeam===t.id?{background:tc,borderColor:tc,color:"#fff"}:{}}
            onClick={()=>setSelectedTeam(t.id)}>
            <Icon n={t.icon||"equipos"} size={13}/> {t.name}
          </button>
        )})}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(340px,1fr))",gap:16}}>
        {filteredTeams.map(team=>{
          const members=users.filter(u=>(u.team_id===team.id||(Array.isArray(u.team_ids)&&u.team_ids.includes(team.id)))&&u.role==="colaborador")
          const teamTasks=scopedTasks.filter(t=>t.team_id===team.id&&t.status!=="completada")
          const overdueCount=scopedTasks.filter(t=>t.team_id===team.id&&t.status==="vencida").length
          const overloaded=members.filter(u=>scopedTasks.filter(x=>assignedOf(x).includes(u.id)&&x.status!=="completada").length>=7).length
          const avgLoad=members.length>0?teamTasks.length/members.length:0
          const health=overdueCount>0||overloaded>0?"var(--s-vencida)":avgLoad>=4?"var(--load-warn)":"var(--load-ok)"
          const visibleMembers=isCollab?members.filter(m=>m.id===me.id):members
          return(
            <div key={team.id} className="card fade-in">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <Icon n={team.icon||"equipos"} size={18}/>
                  <div>
                    <h3 style={{fontSize:15,fontWeight:700}}>{team.name}</h3>
                    <p style={{fontSize:11,color:"var(--muted)",marginTop:1,fontFamily:"var(--font-mono)"}}>{members.length} miembros · {teamTasks.length} activas</p>
                  </div>
                </div>
                <div style={{width:10,height:10,borderRadius:"50%",background:health,boxShadow:`0 0 8px ${health}66`}}/>
              </div>
              {visibleMembers.length===0&&<p style={{fontSize:13,color:"var(--muted)",textAlign:"center",padding:20}}>Sin miembros asignados</p>}
              {visibleMembers.map(m=>{
                const mTasks=scopedTasks.filter(t=>assignedOf(t).includes(m.id)&&t.status!=="completada")
                const mOverdue=mTasks.filter(t=>t.status==="vencida").length
                const pct=Math.min(100,Math.round(mTasks.length/8*100))
                const loadColor=mTasks.length>=7?"var(--s-vencida)":mTasks.length>=4?"var(--load-warn)":m.avatar_color
                const isOpen=!!openMembers[m.id]
                return(
                  <div key={m.id} style={{marginBottom:8,background:"var(--bg3)",borderRadius:8,overflow:"hidden",border:"1px solid var(--border)"}}>
                    <div onClick={()=>setOpenMembers(o=>({...o,[m.id]:!o[m.id]}))}
                      style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",cursor:"pointer",userSelect:"none",
                        borderLeft:`3px solid ${m.avatar_color}`,transition:".13s",background:isOpen?"var(--bg4)":"transparent"}}>
                      <span style={{color:"var(--muted)",fontSize:11,transition:"transform .2s",display:"inline-block",transform:isOpen?"rotate(0)":"rotate(-90deg)",flexShrink:0}}>▼</span>
                      <div onClick={e=>{e.stopPropagation();if(!isCollab&&onViewUser)onViewUser(m)}}
                        style={{cursor:(!isCollab&&onViewUser)?"pointer":"default"}} title={!isCollab?"Ver en Desempeño":""}>
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
                    <div style={{height:2,background:"var(--bg2)",overflow:"hidden"}}>
                      <div style={{width:`${pct}%`,height:"100%",background:loadColor,transition:"width .6s cubic-bezier(.4,0,.2,1)"}}/>
                    </div>
                    {isOpen&&(
                      <div style={{padding:"8px 10px",background:"var(--bg3)"}}>
                        {mTasks.length===0
                          ?<p style={{fontSize:11,color:"var(--muted)",padding:6,textAlign:"center"}}>Sin tareas activas 🎉</p>
                          :mTasks.map(t=><TaskCard key={t.id} task={t} users={users} teams={teams} me={me} token={token} onRefresh={onRefresh} onOpenTask={onOpenTask}/>)
                        }
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TabDesempeno({tasks,users,teams,range,onOpenTask}){
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
    const score=comp.length*10-venc.length*15+(e!=null?Math.min(e,150)/50:0)
    return{u,mt,comp,venc,actv,hrsE,hrsR,e,marcas,score}
  }).filter(r=>r.mt.length>0).sort((a,b)=>b.score-a.score),[filtered])
  const maxHrs=Math.max(...rows.map(r=>r.hrsR),1)
  const top=rows[0],bot=rows.length>1?rows[rows.length-1]:null
  function doExport(){
    const hdr=["Ranking","Colaborador","Equipo","Total","Completadas","Vencidas","Activas","Hrs Est.","Hrs Reales","Eficiencia","Marcas"]
    const data=rows.map(({u,mt,comp,venc,actv,hrsE,hrsR,e,marcas},i)=>{const team=teams.find(t=>t.id===u.team_id);return[i+1,u.name,team?.name||"—",mt.length,comp.length,venc.length,actv.length,fmtH(hrsE),fmtH(hrsR),effLabel(e),marcas.join(", ")||"—"]})
    exportCSV([hdr,...data],"LaCata_Colaboradores_"+new Date().toISOString().split("T")[0]+".csv")
  }
  if(detail){
    const{u,mt}=detail
    const team=teams.find(t=>t.id===u.team_id)
    const ORDER=["vencida","en_revision","en_progreso","pendiente","en_pausa","completada"]
    const sorted=[...mt].sort((a,b)=>ORDER.indexOf(a.status)-ORDER.indexOf(b.status))
    const hrsE=mt.reduce((s,t)=>s+Number(t.hours||0),0),hrsR=mt.reduce((s,t)=>s+Number(t.hours_real||0),0)
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
          {sorted.map(t=>{const e=eff(t.hours,t.hours_real);const orderN=t.order_number?"AC-"+String(t.order_number).padStart(4,"0"):null;return(
            <div key={t.id} onClick={()=>onOpenTask&&onOpenTask(t)}
              style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",cursor:onOpenTask?"pointer":"default",transition:".13s"}}
              onMouseEnter={ev=>{if(onOpenTask)ev.currentTarget.style.borderColor="var(--accent)"}} onMouseLeave={ev=>ev.currentTarget.style.borderColor="var(--border)"}>
              <div style={{flex:1,minWidth:180}}>
                <div style={{fontWeight:600,fontSize:13,marginBottom:2}}>{orderN&&<span style={{color:"var(--muted)",fontSize:11,fontFamily:"var(--font-mono)",marginRight:6}}>{orderN}</span>}{t.title}</div>
                <div style={{fontSize:11,color:"var(--muted)"}}>{t.marca||"Sin marca"} · {fmtD(t.created_at)}</div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>Est: {fmtH(t.hours)}</span>
                <span style={{fontSize:11,fontWeight:700,fontFamily:"var(--font-mono)"}}>Real: {fmtH(t.hours_real)}</span>
                {e!=null&&<span style={{fontSize:11,fontWeight:700,color:effColor(e),background:"var(--bg3)",borderRadius:4,padding:"1px 7px",fontFamily:"var(--font-mono)"}}>{e}%</span>}
                <span style={{fontSize:11,background:"var(--bg3)",borderRadius:6,padding:"2px 8px"}}>{SL[t.status]||t.status}</span>
                {onOpenTask&&<span style={{fontSize:11,color:"var(--muted)"}}>→</span>}
              </div>
            </div>
          )})}
        </div>
      </div>
    )
  }
  return(
    <div>
      {rows.length===0&&<p style={{textAlign:"center",color:"var(--muted)",padding:48}}>Sin actividad en este período.</p>}
      {rows.length>0&&(
        <div className="card fade-in" style={{marginBottom:20}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,flexWrap:"wrap",gap:8}}>
            <h3 style={{fontSize:15,fontWeight:700}}>Ranking de desempeño</h3>
            <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>Mejor → peor · completadas vs vencidas</span>
          </div>
          <p style={{fontSize:10,color:"var(--muted)",marginBottom:16,fontFamily:"var(--font-mono)"}}>Posición = tareas completadas, penalizando vencidas. No es por horas trabajadas.</p>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {rows.map((r,i)=>{
              const{u,comp,venc,hrsR,e}=r
              const medal=i===0?"🥇":i===1?"🥈":i===2?"🥉":null
              const rankColor=i===0?"var(--green)":i===rows.length-1&&rows.length>1?"var(--red)":"var(--muted)"
              const barPct=maxHrs>0?Math.max(hrsR/maxHrs,hrsR>0?0.03:0)*100:0
              return(
                <div key={u.id} onClick={()=>setDetail({u:r.u,mt:r.mt})}
                  style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",borderRadius:9,cursor:"pointer",border:"1px solid var(--border)",background:"var(--bg3)",transition:".13s"}}
                  onMouseEnter={ev=>ev.currentTarget.style.borderColor=u.avatar_color||"var(--accent)"} onMouseLeave={ev=>ev.currentTarget.style.borderColor="var(--border)"}>
                  <div style={{minWidth:34,textAlign:"center"}}>{medal?<span style={{fontSize:18}}>{medal}</span>:<span style={{fontSize:14,fontWeight:800,color:rankColor,fontFamily:"var(--font-display)"}}>{i+1}</span>}</div>
                  <div style={{width:4,height:40,borderRadius:2,background:u.avatar_color||"var(--accent)",flexShrink:0}}/>
                  <Av u={u} size={34}/>
                  <div style={{flex:1,minWidth:100}}>
                    <div style={{fontWeight:700,fontSize:13,marginBottom:5}}>{u.name}</div>
                    <div style={{height:6,background:"var(--bg2)",borderRadius:3,overflow:"hidden"}}><div style={{width:barPct+"%",height:"100%",background:u.avatar_color||"var(--accent)",borderRadius:3,transition:"width .6s cubic-bezier(.4,0,.2,1)"}}/></div>
                  </div>
                  <div style={{display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"}}>
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
      )}
      {rows.length>=2&&top&&bot&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
          <div style={{background:"var(--bg2)",border:"1px solid var(--green)",borderRadius:12,padding:"14px 16px"}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--green)",fontFamily:"var(--font-mono)",marginBottom:8,letterSpacing:".08em"}}>🏆 MEJOR DESEMPEÑO</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}><Av u={top.u} size={28}/><div><div style={{fontSize:14,fontWeight:700}}>{top.u.name}</div><div style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{top.comp.length} completadas{top.venc.length>0?` · ${top.venc.length} venc.`:""} · {effLabel(top.e)}</div></div></div>
          </div>
          <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px"}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--red)",fontFamily:"var(--font-mono)",marginBottom:8,letterSpacing:".08em"}}>⚠️ NECESITA APOYO</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}><Av u={bot.u} size={28}/><div><div style={{fontSize:14,fontWeight:700}}>{bot.u.name}</div><div style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{bot.comp.length} completadas{bot.venc.length>0?` · ${bot.venc.length} venc.`:""} · {effLabel(bot.e)}</div></div></div>
          </div>
        </div>
      )}
      {rows.length>0&&<div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}><button className="btn btn-green" onClick={doExport} style={{display:"flex",alignItems:"center",gap:7,fontSize:13}}><Icon n="exportar" size={13}/> Exportar CSV</button></div>}
    </div>
  )
}

function TabEquipos({tasks,users,teams,range}){
  const[detail,setDetail]=useState(null)
  const filtered=filterByRange(tasks,range)
  const rows=useMemo(()=>teams.map(team=>{
    const members=users.filter(u=>(u.team_id===team.id||(Array.isArray(u.team_ids)&&u.team_ids.includes(team.id)))&&u.role==="colaborador")
    const mt=filtered.filter(t=>t.team_id===team.id)
    const comp=mt.filter(t=>t.status==="completada"),venc=mt.filter(t=>t.status==="vencida")
    const hrsE=mt.reduce((s,t)=>s+Number(t.hours||0),0),hrsR=mt.reduce((s,t)=>s+Number(t.hours_real||0),0)
    const e=eff(hrsE,hrsR),avgHrsPerOrder=mt.length>0?hrsR/mt.length:0
    return{team,members,mt,comp,venc,hrsE,hrsR,e,avgHrsPerOrder}
  }).filter(r=>r.mt.length>0).sort((a,b)=>b.mt.length-a.mt.length),[filtered])
  const topTeam=rows[0],botTeam=[...rows].sort((a,b)=>a.mt.length-b.mt.length)[0]
  function doExport(){
    const hdr=["Equipo","Miembros","Total órdenes","Completadas","Vencidas","Hrs Est.","Hrs Reales","Eficiencia","Avg hrs/orden"]
    const data=rows.map(({team,members,mt,comp,venc,hrsE,hrsR,e,avgHrsPerOrder})=>[team.name,members.length,mt.length,comp.length,venc.length,fmtH(hrsE),fmtH(hrsR),effLabel(e),fmtH(avgHrsPerOrder)])
    exportCSV([hdr,...data],"LaCata_Equipos_"+new Date().toISOString().split("T")[0]+".csv")
  }
  if(detail){
    const{team,members,mt}=detail
    const ORDER=["vencida","en_revision","en_progreso","pendiente","en_pausa","completada"]
    const sorted=[...mt].sort((a,b)=>ORDER.indexOf(a.status)-ORDER.indexOf(b.status))
    const hrsE=mt.reduce((s,t)=>s+Number(t.hours||0),0),hrsR=mt.reduce((s,t)=>s+Number(t.hours_real||0),0)
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
          {members.map(u=>{const umt=mt.filter(t=>assignedOf(t).includes(u.id));const uHrs=umt.reduce((s,t)=>s+Number(t.hours_real||0),0);return(<div key={u.id} style={{display:"flex",alignItems:"center",gap:7,background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,padding:"7px 12px"}}><Av u={u} size={24}/><div><div style={{fontSize:12,fontWeight:600}}>{u.name.split(" ")[0]}</div><div style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{umt.length} tareas · {fmtH(uHrs)}</div></div></div>)})}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {sorted.map(t=>{const a=assignedOf(t).map(id=>users.find(u=>u.id===id)).filter(Boolean);const e=eff(t.hours,t.hours_real);return(<div key={t.id} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}><div style={{flex:1,minWidth:180}}><div style={{fontWeight:600,fontSize:13,marginBottom:2}}>{t.order_number&&<span style={{color:"var(--muted)",fontSize:11,fontFamily:"var(--font-mono)",marginRight:6}}>AC-{String(t.order_number).padStart(4,"0")}</span>}{t.title}</div><div style={{display:"flex",alignItems:"center",gap:6,marginTop:3}}>{a.map(u=><Av key={u.id} u={u} size={16}/>)}<span style={{fontSize:11,color:"var(--muted)"}}>{t.marca||"Sin marca"} · {fmtD(t.created_at)}</span></div></div><div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>Est: {fmtH(t.hours)}</span><span style={{fontSize:11,fontWeight:700,fontFamily:"var(--font-mono)"}}>Real: {fmtH(t.hours_real)}</span>{e!=null&&<span style={{fontSize:11,fontWeight:700,color:effColor(e),background:"var(--bg3)",borderRadius:4,padding:"1px 7px",fontFamily:"var(--font-mono)"}}>{e}%</span>}<span style={{fontSize:11,background:"var(--bg3)",borderRadius:6,padding:"2px 8px"}}>{SL[t.status]||t.status}</span></div></div>)})}
        </div>
      </div>
    )
  }
  return(
    <div>
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
              return(<div key={team.id} style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer"}} onClick={()=>setDetail({team,members:users.filter(u=>(u.team_id===team.id||(Array.isArray(u.team_ids)&&u.team_ids.includes(team.id)))&&u.role==="colaborador"),mt})}>
                <div style={{width:4,height:32,borderRadius:2,background:teamColor(team),flexShrink:0}}/>
                <span style={{fontSize:12,fontWeight:600,minWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{team.name}</span>
                <div style={{flex:1}}><StackedBar comp={comp.length} actv={actv.length} venc={venc.length} total={mt.length}/></div>
                <span style={{fontSize:12,fontWeight:700,fontFamily:"var(--font-mono)",minWidth:28,textAlign:"right"}}>{mt.length}</span>
                <span style={{fontSize:11,color:"var(--muted)"}}>→</span>
              </div>)
            })}
          </div>
        </div>
      )}
      {rows.length>=2&&(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
        {topTeam&&<div style={{background:"var(--bg2)",border:"1px solid var(--green)",borderRadius:12,padding:"14px 16px"}}><div style={{fontSize:11,fontWeight:700,color:"var(--green)",fontFamily:"var(--font-mono)",marginBottom:8,letterSpacing:".08em"}}>🏆 EQUIPO MÁS ACTIVO</div><div style={{fontSize:15,fontWeight:700,marginBottom:4}}>{topTeam.team.name}</div><div style={{fontSize:12,color:"var(--muted)"}}>{topTeam.mt.length} órdenes · {topTeam.comp.length} completadas · {fmtH(topTeam.hrsR)}</div></div>}
        {botTeam&&botTeam.team.id!==topTeam?.team.id&&<div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px"}}><div style={{fontSize:11,fontWeight:700,color:"var(--muted)",fontFamily:"var(--font-mono)",marginBottom:8,letterSpacing:".08em"}}>📉 MENOS ACTIVIDAD</div><div style={{fontSize:15,fontWeight:700,marginBottom:4}}>{botTeam.team.name}</div><div style={{fontSize:12,color:"var(--muted)"}}>{botTeam.mt.length} órdenes · {botTeam.comp.length} completadas · {fmtH(botTeam.hrsR)}</div></div>}
      </div>)}
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}><button className="btn btn-green" onClick={doExport} style={{display:"flex",alignItems:"center",gap:7,fontSize:13}}><Icon n="exportar" size={13}/> Exportar CSV</button></div>
      {rows.length===0&&<p style={{textAlign:"center",color:"var(--muted)",padding:48}}>Sin actividad en este período.</p>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
        {rows.map(({team,members,mt,comp,venc,hrsR,e,avgHrsPerOrder})=>(
          <div key={team.id} onClick={()=>setDetail({team,members,mt})}
            style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:12,padding:"16px",cursor:"pointer",transition:".13s",borderLeft:`3px solid ${teamColor(team)}`}}
            onMouseEnter={ev=>ev.currentTarget.style.borderColor=teamColor(team)} onMouseLeave={ev=>ev.currentTarget.style.borderColor="var(--border)"}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}><Icon n={team.icon||"equipos"} size={18}/><div style={{flex:1,fontSize:14,fontWeight:700}}>{team.name}</div><span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{members.length} miembros</span></div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><Chip label="ÓRDENES" value={mt.length}/><Chip label="COMPLET." value={comp.length} color="var(--green)"/><Chip label="HRS REAL" value={fmtH(hrsR)} color="var(--blue)"/><Chip label="EFIC." value={effLabel(e)} color={effColor(e)}/></div>
            <StackedBar comp={comp.length} actv={mt.filter(t=>t.status!=="completada"&&t.status!=="vencida").length} venc={venc.length} total={mt.length}/>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)",marginTop:6}}><span>{Math.round(comp.length/Math.max(mt.length,1)*100)}% completado</span><span>~{fmtH(avgHrsPerOrder)}/orden</span></div>
            {venc.length>0&&<div style={{marginTop:8,fontSize:11,color:"var(--red)",fontWeight:600}}>{venc.length} vencida{venc.length!==1?"s":""} este período</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

function TabMarcas({tasks,users,teams,range}){
  const[detail,setDetail]=useState(null)
  const filtered=filterByRange(tasks,range)
  const rows=useMemo(()=>{
    const map={}
    filtered.forEach(t=>{const m=t.marca||"Sin marca";if(!map[m])map[m]={marca:m,tasks:[],colabs:new Set()};map[m].tasks.push(t);assignedOf(t).forEach(id=>map[m].colabs.add(id))})
    return Object.values(map).map(r=>{const hrsE=r.tasks.reduce((s,t)=>s+Number(t.hours||0),0),hrsR=r.tasks.reduce((s,t)=>s+Number(t.hours_real||0),0),comp=r.tasks.filter(t=>t.status==="completada").length,venc=r.tasks.filter(t=>t.status==="vencida").length,changes=r.tasks.reduce((s,t)=>s+Number(t.changes||0),0),e=eff(hrsE,hrsR);return{...r,hrsE,hrsR,comp,venc,changes,e}}).sort((a,b)=>b.hrsR-a.hrsR)
  },[filtered])
  const topMarca=rows[0],botMarca=rows.length>1?rows[rows.length-1]:null,mostChanges=[...rows].sort((a,b)=>b.changes-a.changes)[0],maxHrs=Math.max(...rows.map(r=>r.hrsR),1)
  function doExport(){
    const hdr=["Marca","Órdenes","Completadas","Vencidas","Colaboradores","Hrs Est.","Hrs Reales","Eficiencia","Total cambios"]
    const data=rows.map(r=>[r.marca,r.tasks.length,r.comp,r.venc,r.colabs.size,fmtH(r.hrsE),fmtH(r.hrsR),effLabel(r.e),r.changes])
    exportCSV([hdr,...data],"LaCata_Marcas_"+new Date().toISOString().split("T")[0]+".csv")
  }
  if(detail){
    const{marca,tasks:mt}=detail
    const collabMap={};mt.forEach(t=>{assignedOf(t).forEach(id=>{if(!collabMap[id])collabMap[id]={id,tasks:[],hrsR:0};collabMap[id].tasks.push(t);collabMap[id].hrsR+=Number(t.hours_real||0)})})
    const ORDER=["vencida","en_revision","en_progreso","pendiente","en_pausa","completada"]
    const sorted=[...mt].sort((a,b)=>ORDER.indexOf(a.status)-ORDER.indexOf(b.status))
    const hrsE=mt.reduce((s,t)=>s+Number(t.hours||0),0),hrsR=mt.reduce((s,t)=>s+Number(t.hours_real||0),0)
    return(
      <div>
        <BackBtn onClick={()=>setDetail(null)} label="← Marcas"/>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16,padding:"16px",background:"var(--bg2)",borderRadius:12,border:"1px solid var(--border)"}}><div style={{width:10,height:10,borderRadius:"50%",background:"var(--accent)"}}/><div style={{flex:1}}><div style={{fontSize:17,fontWeight:700}}>{marca}</div><div style={{fontSize:12,color:"var(--muted)"}}>{mt.length} órdenes en este período</div></div><div style={{display:"flex",gap:16,flexWrap:"wrap"}}><Chip label="ÓRDENES" value={mt.length} color="var(--accent)"/><Chip label="COMPLET." value={mt.filter(t=>t.status==="completada").length} color="var(--green)"/><Chip label="HRS EST." value={fmtH(hrsE)} color="var(--muted)"/><Chip label="HRS REAL" value={fmtH(hrsR)} color="var(--blue)"/><Chip label="EFIC." value={effLabel(eff(hrsE,hrsR))} color={effColor(eff(hrsE,hrsR))}/></div></div>
        {Object.values(collabMap).length>0&&<div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 16px",marginBottom:14}}><div style={{fontSize:11,fontWeight:700,color:"var(--muted)",marginBottom:10,fontFamily:"var(--font-mono)"}}>COLABORADORES EN ESTA MARCA</div><div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{Object.values(collabMap).map(c=>{const u=users.find(x=>x.id===c.id);if(!u)return null;return(<div key={c.id} style={{display:"flex",alignItems:"center",gap:7,background:"var(--bg3)",borderRadius:8,padding:"6px 10px"}}><Av u={u} size={24}/><div><div style={{fontSize:12,fontWeight:600}}>{u.name.split(" ")[0]}</div><div style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{fmtH(c.hrsR)} · {c.tasks.length} tareas</div></div></div>)})}</div></div>}
        <div style={{display:"flex",flexDirection:"column",gap:6}}>{sorted.map(t=>{const a=assignedOf(t).map(id=>users.find(u=>u.id===id)).filter(Boolean);const e=eff(t.hours,t.hours_real);return(<div key={t.id} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}><div style={{flex:1,minWidth:180}}><div style={{fontWeight:600,fontSize:13,marginBottom:2}}>{t.order_number&&<span style={{color:"var(--muted)",fontSize:11,fontFamily:"var(--font-mono)",marginRight:6}}>AC-{String(t.order_number).padStart(4,"0")}</span>}{t.title}</div><div style={{display:"flex",alignItems:"center",gap:5,marginTop:3}}>{a.map(u=><Av key={u.id} u={u} size={16}/>)}<span style={{fontSize:11,color:"var(--muted)",marginLeft:2}}>{fmtD(t.created_at)}</span>{(t.changes||0)>0&&<span style={{fontSize:11,color:"var(--muted)"}}>· {t.changes} cambios</span>}</div></div><div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>Est: {fmtH(t.hours)}</span><span style={{fontSize:11,fontWeight:700,fontFamily:"var(--font-mono)"}}>Real: {fmtH(t.hours_real)}</span>{e!=null&&<span style={{fontSize:11,fontWeight:700,color:effColor(e),background:"var(--bg3)",borderRadius:4,padding:"1px 7px",fontFamily:"var(--font-mono)"}}>{e}%</span>}<span style={{fontSize:11,background:"var(--bg3)",borderRadius:6,padding:"2px 8px"}}>{SL[t.status]||t.status}</span></div></div>)})}</div>
      </div>
    )
  }
  return(
    <div>
      {rows.length>0&&(<>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12,marginBottom:20}}>
          <div className="card fade-in"><h3 style={{fontSize:14,fontWeight:700,marginBottom:16}}>Distribución de horas reales</h3><DonutChart data={rows.map(r=>({label:r.marca,value:r.hrsR}))}/></div>
          {rows.length>=2&&topMarca&&botMarca&&(<div className="card fade-in"><h3 style={{fontSize:14,fontWeight:700,marginBottom:16}}>Top vs bottom</h3>{[{label:"Órdenes",top:topMarca.tasks.length,bot:botMarca.tasks.length,color:"var(--accent)"},{label:"Completadas",top:topMarca.comp,bot:botMarca.comp,color:"var(--green)"},{label:"Hrs reales",top:topMarca.hrsR,bot:botMarca.hrsR,color:"var(--blue)"},{label:"Cambios",top:topMarca.changes,bot:botMarca.changes,color:"var(--yellow)"}].map(({label,top,bot,color})=>{const mx=Math.max(top,bot,1);return(<div key={label} style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)",marginBottom:4}}><span style={{color:"var(--green)",fontWeight:700}}>{topMarca.marca.slice(0,12)}</span><span style={{fontWeight:600}}>{label}</span><span style={{color:"var(--muted)"}}>{botMarca.marca.slice(0,12)}</span></div><div style={{display:"flex",gap:3,alignItems:"center"}}><div style={{flex:top/mx,height:16,background:color,borderRadius:"4px 0 0 4px",minWidth:top>0?4:0,transition:"flex .5s"}}/><span style={{fontSize:10,fontFamily:"var(--font-mono)",minWidth:28,textAlign:"center",fontWeight:700,color}}>{typeof top==="number"&&top%1!==0?top.toFixed(1):top}</span><div style={{flex:bot/mx,height:16,background:"var(--bg3)",borderRadius:"0 4px 4px 0",border:"1px solid var(--border)",minWidth:bot>0?4:0,transition:"flex .5s"}}/></div></div>)})}<div style={{display:"flex",justifyContent:"space-between",marginTop:8,fontSize:11,fontFamily:"var(--font-mono)"}}><span style={{color:"var(--green)",fontWeight:700}}>↑ {topMarca.marca}</span><span style={{color:"var(--muted)"}}>↓ {botMarca.marca}</span></div></div>)}
        </div>
        <div className="card fade-in" style={{marginBottom:20}}><h3 style={{fontSize:14,fontWeight:700,marginBottom:16}}>Horas reales por marca</h3><BarChart data={rows.map(r=>({marca:r.marca,hrsR:r.hrsR}))} maxVal={maxHrs} labelKey="marca" valueKey="hrsR" valueSuffix="h" colorFn={(d,i)=>i===0?"var(--accent)":"var(--blue)"}/></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,marginBottom:20}}>
          {mostChanges&&mostChanges.changes>0&&<div style={{background:"var(--bg2)",border:"1px solid var(--yellow)",borderRadius:12,padding:"14px 16px"}}><div style={{fontSize:11,fontWeight:700,color:"var(--yellow)",fontFamily:"var(--font-mono)",marginBottom:6,letterSpacing:".08em"}}>🔄 MÁS CAMBIOS</div><div style={{fontSize:15,fontWeight:700}}>{mostChanges.marca}</div><div style={{fontSize:12,color:"var(--muted)",marginTop:4}}>{mostChanges.changes} cambios en {mostChanges.tasks.length} órdenes</div></div>}
          {rows.filter(r=>r.venc>0).length>0&&<div style={{background:"var(--bg2)",border:"1px solid var(--red)",borderRadius:12,padding:"14px 16px"}}><div style={{fontSize:11,fontWeight:700,color:"var(--red)",fontFamily:"var(--font-mono)",marginBottom:6,letterSpacing:".08em"}}>⚠️ CON VENCIDAS</div><div style={{display:"flex",flexDirection:"column",gap:4}}>{rows.filter(r=>r.venc>0).map(r=><div key={r.marca} style={{fontSize:13,fontWeight:600}}>{r.marca} <span style={{color:"var(--red)",fontFamily:"var(--font-mono)",fontSize:11}}>{r.venc} venc.</span></div>)}</div></div>}
        </div>
      </>)}
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}><button className="btn btn-green" onClick={doExport} style={{display:"flex",alignItems:"center",gap:7,fontSize:13}}><Icon n="exportar" size={13}/> Exportar CSV</button></div>
      {rows.length===0&&<p style={{textAlign:"center",color:"var(--muted)",padding:48}}>Sin actividad en este período.</p>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:10}}>
        {rows.map((r,i)=>(
          <div key={r.marca} onClick={()=>setDetail(r)} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:12,padding:"16px",cursor:"pointer",transition:".13s"}} onMouseEnter={ev=>ev.currentTarget.style.borderColor="var(--accent)"} onMouseLeave={ev=>ev.currentTarget.style.borderColor="var(--border)"}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}><span style={{fontSize:11,fontWeight:700,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>#{i+1}</span><div style={{flex:1,fontSize:14,fontWeight:700}}>{r.marca}</div><span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{r.colabs.size} colab{r.colabs.size!==1?"s":""}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><Chip label="ÓRDENES" value={r.tasks.length}/><Chip label="COMPLET." value={r.comp} color="var(--green)"/><Chip label="HRS REAL" value={fmtH(r.hrsR)} color="var(--blue)"/><Chip label="EFIC." value={effLabel(r.e)} color={effColor(r.e)}/></div>
            <div style={{height:4,background:"var(--bg3)",borderRadius:2,overflow:"hidden",marginBottom:6}}><div style={{width:(r.comp/Math.max(r.tasks.length,1)*100)+"%",height:"100%",background:"var(--green)",borderRadius:2}}/></div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)"}}><span>{Math.round(r.comp/Math.max(r.tasks.length,1)*100)}% completado</span>{r.changes>0&&<span style={{color:"var(--yellow)"}}>{r.changes} cambios</span>}{r.venc>0&&<span style={{color:"var(--red)"}}>{r.venc} vencidas</span>}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TabOrdenes({tasks,users,teams,range}){
  const[search,setSearch]=useState("")
  const[filterStatus,setFilterStatus]=useState("all")
  const filtered=filterByRange(tasks,range)
  const rows=useMemo(()=>filtered.filter(t=>{
    const q=search.toLowerCase()
    if(q){const names=assignedOf(t).map(id=>users.find(u=>u.id===id)?.name||"").join(" ").toLowerCase();const orderN=t.order_number?"ac-"+String(t.order_number).padStart(4,"0"):"";if(![t.title,names,t.marca||"",orderN].some(s=>s.toLowerCase().includes(q)))return false}
    if(filterStatus!=="all"&&t.status!==filterStatus)return false
    return true
  }).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)),[filtered,search,filterStatus])
  function doExport(){
    const hdr=["No. Orden","Proyecto","Marca","Equipo","Responsable(s)","Estado","Prioridad","Hrs Est.","Hrs Reales","Eficiencia","Fecha Creación","Fecha Límite","Cambios"]
    const data=rows.map(t=>{const names=assignedOf(t).map(id=>users.find(u=>u.id===id)?.name||"?").join(", ");const team=teams.find(x=>x.id===t.team_id);const e=eff(t.hours,t.hours_real);return[t.order_number?"AC-"+String(t.order_number).padStart(4,"0"):"-",t.title||"",t.marca||"—",team?.name||"Sin equipo",names||"Sin asignar",SL[t.status]||t.status,t.priority||"Normal",fmtH(t.hours),fmtH(t.hours_real),effLabel(e),fmtD(t.created_at),t.due_date?fmtD(t.due_date):"—",t.changes||0]})
    exportCSV([hdr,...data],"LaCata_Ordenes_"+new Date().toISOString().split("T")[0]+".csv")
  }
  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar orden, colaborador, marca..." style={{flex:1,minWidth:200,padding:"7px 12px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg3)",color:"var(--text)",fontSize:13,fontFamily:"inherit"}}/>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{padding:"7px 10px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg3)",color:"var(--text)",fontSize:13,fontFamily:"inherit",cursor:"pointer"}}>
          {["all","pendiente","en_progreso","en_pausa","en_revision","completada","vencida"].map(s=>(<option key={s} value={s}>{s==="all"?"Todos los estados":SL[s]}</option>))}
        </select>
        <button className="btn btn-green" onClick={doExport} style={{display:"flex",alignItems:"center",gap:7,fontSize:13,whiteSpace:"nowrap"}}><Icon n="exportar" size={13}/> Exportar CSV</button>
      </div>
      <div style={{fontSize:12,color:"var(--muted)",marginBottom:10,fontFamily:"var(--font-mono)"}}>{rows.length} órdenes</div>
      {rows.length===0&&<p style={{textAlign:"center",color:"var(--muted)",padding:48}}>Sin resultados.</p>}
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {rows.map(t=>{
          const assigned=assignedOf(t).map(id=>users.find(u=>u.id===id)).filter(Boolean)
          const team=teams.find(x=>x.id===t.team_id),e=eff(t.hours,t.hours_real)
          const isOverdue=t.status==="vencida",isComp=t.status==="completada"
          return(<div key={t.id} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 16px",borderLeft:`3px solid ${isOverdue?"var(--red)":isComp?"var(--green)":"var(--border)"}`,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
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
              <div style={{textAlign:"right"}}><div style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>Est: {fmtH(t.hours)}</div><div style={{fontSize:13,fontWeight:700,fontFamily:"var(--font-mono)"}}>Real: {fmtH(t.hours_real)}</div></div>
              {e!=null&&<div style={{textAlign:"center",background:"var(--bg3)",borderRadius:8,padding:"5px 10px"}}><div style={{fontSize:15,fontWeight:800,color:effColor(e),fontFamily:"var(--font-display)"}}>{e}%</div><div style={{fontSize:9,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>EFIC.</div></div>}
              {(t.changes||0)>0&&<span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{t.changes} cambios</span>}
            </div>
          </div>)
        })}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   MAIN
═══════════════════════════════════════════ */
export default function IntelView({tasks,users,teams,onBack,me,profile,token,onRefresh,onLoadHistory,initialUser,onNavigate,onOpenTask,onViewUser}){
  const[tab,setTab]=useState("operativo")
  const[period,setPeriod]=useState("todo")
  const[offset,setOffset]=useState(0)
  const[historyLoaded,setHistoryLoaded]=useState(false)

  useEffect(()=>{if(historyLoaded||!onLoadHistory)return;setHistoryLoaded(true);onLoadHistory()},[historyLoaded,onLoadHistory])

  const myProfile=me||profile
  const isCuentas=myProfile?.role==="cuentas"
  const myTeamIds=isCuentas?(Array.isArray(myProfile?.team_ids)&&myProfile.team_ids.length>0?myProfile.team_ids:[myProfile?.team_id].filter(Boolean)):null
  const visibleTasks=isCuentas&&myTeamIds?tasks.filter(t=>myTeamIds.includes(t.team_id)):tasks
  // Equipos visibles para cuentas
  const visibleTeams=isCuentas&&myTeamIds?teams.filter(t=>myTeamIds.includes(t.id)):teams

  function handlePeriod(p,o){setPeriod(p);setOffset(o)}
  const range=getRangeLabel(period,offset)

  // Tabs según rol:
  // Director: Operativo / Colaboradores / Equipos / Marcas / Órdenes
  // Cuentas: Operativo / Marcas / Órdenes (no ve ranking de colaboradores de otros equipos)
  const isDir=myProfile?.role==="director"
  const TABS=isDir
    ?[{v:"operativo",l:"Operativo"},{v:"desempeno",l:"Colaboradores"},{v:"equipos",l:"Equipos"},{v:"marcas",l:"Marcas"},{v:"ordenes",l:"Órdenes"}]
    :[{v:"operativo",l:"Operativo"},{v:"marcas",l:"Marcas"},{v:"ordenes",l:"Órdenes"}]

  const filtered=filterByRange(visibleTasks,range)
  const hrsR=filtered.reduce((s,t)=>s+Number(t.hours_real||0),0)
  const hrsE=filtered.reduce((s,t)=>s+Number(t.hours||0),0)
  const comp=filtered.filter(t=>t.status==="completada").length
  const venc=filtered.filter(t=>t.status==="vencida").length
  const globalEff=eff(hrsE,hrsR)

  // El tab Operativo no necesita PeriodBar ni stats globales (es vista actual)
  const isOperativo=tab==="operativo"

  return(
    <div>
      {onBack&&<BackBtn onClick={onBack}/>}

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:12}}>
        <h2 style={{fontSize:18,fontWeight:800,fontFamily:"var(--font-display)"}}>Reportes</h2>
        {!isOperativo&&<PeriodBar period={period} offset={offset} onChange={handlePeriod}/>}
      </div>

      {/* Stats globales — solo en tabs de reportería histórica */}
      {!isOperativo&&(
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

      {tab==="operativo"&&<TabOperativo tasks={visibleTasks} users={users} teams={visibleTeams} me={myProfile} token={token} onRefresh={onRefresh} onOpenTask={onOpenTask} onViewUser={onViewUser}/>}
      {tab==="desempeno"&&<TabDesempeno tasks={visibleTasks} users={users} teams={teams} range={range} onOpenTask={onOpenTask}/>}
      {tab==="equipos"&&<TabEquipos tasks={visibleTasks} users={users} teams={teams} range={range}/>}
      {tab==="marcas"&&<TabMarcas tasks={visibleTasks} users={users} teams={teams} range={range}/>}
      {tab==="ordenes"&&<TabOrdenes tasks={visibleTasks} users={users} teams={teams} range={range} onOpenTask={onOpenTask}/>}
    </div>
  )
}
