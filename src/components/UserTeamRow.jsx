import{useState,useEffect}from'react'
import{sb,teamColor}from'../lib/supabase'
import{showToast}from'./Toast'
import Icon from'./Icon'
import{Av}from'./Shared'
export default function UserTeamRow({u,teams,tasks,token,onRefresh,changeUserRole,deleteUser}){
  const[localIds,setLocalIds]=useState(()=>Array.isArray(u.team_ids)&&u.team_ids.length>0?u.team_ids:u.team_id?[u.team_id]:[])
  useEffect(()=>{const fresh=Array.isArray(u.team_ids)&&u.team_ids.length>0?u.team_ids:u.team_id?[u.team_id]:[];setLocalIds(fresh)},[u.team_ids,u.team_id])
  async function toggle(teamId){
    const next=localIds.includes(teamId)?localIds.filter(x=>x!==teamId):[...localIds,teamId];setLocalIds(next)
    try{await sb.update("usuarios",u.id,{team_ids:next,team_id:next[0]||null},token);showToast(`${next.length||"Sin"} equipo${next.length!==1?"s":""}` ,"success");onRefresh()}
    catch(e){setLocalIds(localIds);showToast("Error: "+e.message,"error")}
  }
  const isCuentas=u.role==="cuentas";const isCollab=u.role==="colaborador"
  const active=tasks.filter(t=>{const a=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean);return a.includes(u.id)&&t.status!=="completada"}).length
  const overdue=tasks.filter(t=>{const a=Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to].filter(Boolean);return a.includes(u.id)&&t.status==="vencida"}).length
  return(
    <div style={{borderTop:"1px solid var(--border)",padding:"10px 12px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <div style={{position:"relative"}}>
          <Av u={u} size={34}/>
          {isCollab&&active>0&&<span style={{position:"absolute",top:-4,right:-4,background:overdue>0?"var(--s-vencida)":u.avatar_color,color:"#fff",fontSize:9,fontWeight:700,borderRadius:"50%",width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"var(--font-mono)",border:"2px solid var(--bg3)"}}>{active}</span>}
        </div>
        <div style={{flex:1,minWidth:120}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <p style={{fontSize:13,fontWeight:600}}>{u.name}</p>
            {isCollab&&overdue>0&&<span style={{fontSize:10,padding:"1px 5px",borderRadius:3,background:"var(--s-vencida-bg)",color:"var(--s-vencida)",fontWeight:700}}><Icon n="alerta" size={9}/>{overdue}</span>}
          </div>
          <p style={{fontSize:11,color:"var(--muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200}}>{u.email}</p>
        </div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {["colaborador","cuentas","director"].map(r=>(
            <button key={r} onClick={()=>changeUserRole(u.id,r)} style={{padding:"3px 9px",borderRadius:7,fontSize:11,cursor:"pointer",fontFamily:"inherit",background:u.role===r?(r==="director"?"var(--role-director)":r==="cuentas"?"var(--role-cuentas)":"var(--role-colab)"):"var(--bg4)",color:u.role===r?"#0d0d0d":"var(--muted2)",border:"none",fontWeight:u.role===r?700:400,transition:".13s"}}>
              {r.charAt(0).toUpperCase()+r.slice(1)}
            </button>
          ))}
        </div>
        <button className="btn btn-danger btn-sm" onClick={()=>deleteUser(u)}>×</button>
      </div>
      {(isCuentas||isCollab)&&(
        <div style={{marginTop:7,paddingLeft:44,display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:10,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".06em",fontFamily:"var(--font-mono)",flexShrink:0}}>{isCuentas?"Gestiona:":"Equipos:"}</span>
          {teams.map(t=>{const sel=localIds.includes(t.id);const tc=teamColor(t);return(
            <button key={t.id} type="button" onClick={()=>toggle(t.id)} style={{padding:"3px 10px",borderRadius:5,fontSize:11,cursor:"pointer",fontFamily:"var(--font-body)",background:sel?tc:"var(--bg4)",color:sel?"#fff":"var(--muted2)",border:sel?"none":"1px solid var(--border)",fontWeight:sel?700:400,transition:".15s"}}>
              {sel?"✓ ":""}{t.name}
            </button>
          )})}
          {isCuentas&&localIds.length===0&&<span style={{fontSize:11,color:"var(--muted)",fontStyle:"italic"}}>Sin restricción — ve todos</span>}
          {isCollab&&localIds.length===0&&<span style={{fontSize:11,color:"var(--muted)",fontStyle:"italic"}}>Sin equipos asignados</span>}
        </div>
      )}
    </div>
  )
}
