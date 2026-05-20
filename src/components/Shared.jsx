import{useState,useEffect}from'react'

// Colores fijos por rol — consistentes en toda la app
const ROLE_AVATAR_COLOR={
  director:"var(--role-director)",
  cuentas:"var(--role-cuentas)",
  colaborador:"var(--role-colab)",
}

export function Av({u,size=32}){
  const bg=ROLE_AVATAR_COLOR[u?.role]||u?.avatar_color||"#7c3aed"
  return<div className="avatar" style={{width:size,height:size,background:bg,fontSize:size*.33,color:"#fff"}}>{u?.initials||"?"}</div>
}
export function SC({label,value,sub,color}){
  return(
    <div className="stat-card fade-in" style={{"--ac":color||"var(--accent)"}}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{color:color||"var(--text)"}}>{value}</div>
      {sub&&<div className="stat-sub">{sub}</div>}
    </div>
  )
}
export function BackBtn({onClick,label="← Volver"}){
  return(
    <button onClick={onClick} style={{display:"inline-flex",alignItems:"center",gap:6,background:"transparent",border:"1px solid var(--border)",color:"var(--muted2)",padding:"5px 12px",borderRadius:7,fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"var(--font-body)",marginBottom:16,transition:".13s"}}
      onMouseEnter={e=>{e.currentTarget.style.color="var(--text)";e.currentTarget.style.borderColor="var(--border2)"}}
      onMouseLeave={e=>{e.currentTarget.style.color="var(--muted2)";e.currentTarget.style.borderColor="var(--border)"}}>
      {label}
    </button>
  )
}
export function Linkify({text,style={}}){
  if(!text)return null
  const URL_RE=/(https?:\/\/[^\s<>"]+)/g
  const parts=text.split(URL_RE)
  return(
    <span style={style}>
      {parts.map((p,i)=>URL_RE.test(p)
        ?<a key={i} href={p} target="_blank" rel="noopener noreferrer" style={{color:"var(--accent)",textDecoration:"underline",textDecorationStyle:"dotted",wordBreak:"break-all"}}>{p}</a>
        :<span key={i} style={{whiteSpace:"pre-wrap"}}>{p}</span>
      )}
    </span>
  )
}
export function ActiveTimer({startedAt,hoursReal}){
  const[elapsed,setElapsed]=useState(0)
  useEffect(()=>{
    if(!startedAt)return
    const update=()=>setElapsed(Math.max(0,(Date.now()-new Date(startedAt).getTime())/3600000))
    update();const id=setInterval(update,10000);return()=>clearInterval(id)
  },[startedAt])
  const total=Number(hoursReal||0)+elapsed
  const h=Math.floor(total);const m=Math.floor((total-h)*60)
  return<span className="timer-live" style={{color:"var(--s-progreso)",fontSize:12}}>⏱ {h}h {m.toString().padStart(2,"0")}m corriendo</span>
}
export function StatusLegend(){
  const items=[
    {c:"var(--s-pendiente)",l:"Pendiente"},{c:"var(--s-progreso)",l:"En progreso"},
    {c:"var(--s-pausa)",l:"En pausa"},{c:"var(--s-revision)",l:"En revisión"},
    {c:"var(--s-completada)",l:"Completada"},{c:"var(--s-vencida)",l:"Vencida"},
  ]
  return(
    <div className="status-legend">
      {items.map(({c,l})=>(<span key={l} className="status-dot"><span style={{width:8,height:8,borderRadius:"50%",background:c,display:"inline-block",flexShrink:0}}/>{l}</span>))}
      <span className="status-dot"><span style={{width:8,height:4,borderRadius:1,background:"var(--p-alta)",display:"inline-block"}}/>Alta</span>
      <span className="status-dot"><span style={{width:8,height:4,borderRadius:1,background:"var(--p-urgente)",display:"inline-block"}}/>Urgente</span>
    </div>
  )
}
