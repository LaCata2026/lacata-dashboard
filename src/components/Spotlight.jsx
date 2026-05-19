import{useState,useEffect,useRef}from'react'
import ReactDOM from'react-dom'
import{statusLabel,statusPill}from'../lib/utils'
import Icon from'./Icon'
export default function Spotlight({tasks,users,teams,onNavigate,onClose,onOpenTask}){
  const[q,setQ]=useState("");const[sel,setSel]=useState(0);const inputRef=useRef(null)
  useEffect(()=>{inputRef.current?.focus()},[])
  const results=q.trim().length===0?[]:tasks.filter(t=>{
    const s=q.toLowerCase()
    const order="ac-"+String(t.order_number||0).padStart(4,"0")
    const assigned=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean)
    const assignedNames=assigned.map(id=>users.find(u=>u.id===id)?.name||"").join(" ").toLowerCase()
    const team=teams.find(x=>x.id===t.team_id)
    return t.title?.toLowerCase().includes(s)||order.includes(s)||(t.marca||"").toLowerCase().includes(s)||assignedNames.includes(s)||(team?.name||"").toLowerCase().includes(s)||(t.description||"").toLowerCase().includes(s)
  }).slice(0,8).map(t=>{
    const team=teams.find(x=>x.id===t.team_id)
    const assigned=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean)
    const names=assigned.map(id=>users.find(u=>u.id===id)?.name?.split(" ")[0]||"?").join(", ")
    return{t,team,names}
  })
  function go(r){onClose();if(onOpenTask)onOpenTask(r.t)}
  function onKey(e){
    if(e.key==="ArrowDown"){e.preventDefault();setSel(s=>Math.min(s+1,results.length-1))}
    if(e.key==="ArrowUp"){e.preventDefault();setSel(s=>Math.max(s-1,0))}
    if(e.key==="Enter"&&results[sel])go(results[sel])
    if(e.key==="Escape")onClose()
  }
  return ReactDOM.createPortal(
    <div className="spotlight-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="spotlight-box" onKeyDown={onKey}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"0 16px"}}>
          <span style={{color:"var(--muted)",fontSize:18}}>🔍</span>
          <input ref={inputRef} className="spotlight-input" value={q} onChange={e=>{setQ(e.target.value);setSel(0)}} placeholder="Buscar orden, número AC-0001, marca..."/>
          <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)",flexShrink:0}}>Esc</span>
        </div>
        {results.length>0&&(
          <div style={{maxHeight:360,overflowY:"auto"}}>
            {results.map((r,i)=>(
              <div key={r.t.id} className={`spotlight-result${sel===i?" active":""}`} onClick={()=>go(r)} onMouseEnter={()=>setSel(i)}>
                <span style={{fontSize:11,fontWeight:700,color:"var(--accent)",fontFamily:"var(--font-mono)",minWidth:64,flexShrink:0}}>AC-{String(r.t.order_number||0).padStart(4,"0")}</span>
                <div style={{flex:1,minWidth:0}}><p style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.t.title}</p><p style={{fontSize:11,color:"var(--muted)"}}>{r.names} · {r.team?.name||"Sin equipo"}</p></div>
                <span className={`pill ${statusPill[r.t.status]||"pill-gray"}`}>{statusLabel[r.t.status]}</span>
              </div>
            ))}
          </div>
        )}
        {q.trim()&&results.length===0&&<div style={{padding:"20px",textAlign:"center",color:"var(--muted)",fontSize:13}}>Sin resultados para "{q}"</div>}
        {!q.trim()&&(<div style={{padding:"12px 16px",display:"flex",gap:16}}>{[{icon:"ordenes",label:"Nombre o descripcion"},{icon:"buscar",label:"AC-0001"},{icon:"marca",label:"Marca o equipo"},{icon:"persona",label:"Responsable"}].map((h,i)=>(<span key={i} style={{fontSize:11,color:"var(--muted)",display:"flex",alignItems:"center",gap:5}}><Icon n={h.icon} size={13} style={{marginRight:2}}/>{h.label}</span>))}</div>)}
      </div>
    </div>,document.body
  )
}
