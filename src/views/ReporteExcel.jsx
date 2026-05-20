import{useState}from'react'
import*as XLSX from'xlsx'
import Icon from'../components/Icon'
import{showToast}from'../components/Toast'
import{assignedOf}from'../lib/utils'

const fmtD=s=>{if(!s)return"—";return new Date(s).toLocaleDateString("es-GT",{day:"2-digit",month:"2-digit",year:"numeric"})}
const fmtH=h=>Number(h||0).toFixed(1)
const eff=(est,real)=>{const e=Number(est),r=Number(real);if(!e||!r)return"—";return Math.round(e/r*100)+"%"}
const SL={pendiente:"Pendiente",en_progreso:"En progreso",en_pausa:"En pausa",en_revision:"En revisión",completada:"Completada",vencida:"Vencida"}

function getRanges(){
  const now=new Date()
  const day=now.getDay(),diff=now.getDate()-day+(day===0?-6:1)
  const semFrom=new Date(now);semFrom.setDate(diff);semFrom.setHours(0,0,0,0)
  const semTo=new Date(semFrom);semTo.setDate(semTo.getDate()+6);semTo.setHours(23,59,59,999)
  const mesFrom=new Date(now.getFullYear(),now.getMonth(),1)
  const mesTo=new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59,999)
  return{semFrom,semTo,mesFrom,mesTo}
}

function filterTasks(tasks,period,customFrom,customTo){
  const{semFrom,semTo,mesFrom,mesTo}=getRanges()
  return tasks.filter(t=>{
    const created=t.created_at?new Date(t.created_at):null
    if(!created)return false
    if(period==="semana")return created>=semFrom&&created<=semTo
    if(period==="mes")return created>=mesFrom&&created<=mesTo
    if(period==="custom"&&customFrom&&customTo){
      const f=new Date(customFrom+"T00:00:00"),to2=new Date(customTo+"T23:59:59")
      return created>=f&&created<=to2
    }
    return true
  })
}

function buildExcel(tasks,users,teams,period,customFrom,customTo){
  const filtered=filterTasks(tasks,period,customFrom,customTo)
  const wb=XLSX.utils.book_new()

  // Agrupar por marca — solo órdenes CON marca real para pestañas individuales
  const marcasMap={}
  filtered.forEach(t=>{
    const m=t.marca&&t.marca.trim()?t.marca.trim():null
    const key=m||"Sin marca"
    if(!marcasMap[key])marcasMap[key]={marca:key,tasks:[],hrsE:0,hrsR:0,colabs:new Set(),hasMarca:!!m}
    marcasMap[key].tasks.push(t)
    marcasMap[key].hrsE+=Number(t.hours||0)
    marcasMap[key].hrsR+=Number(t.hours_real||0)
    assignedOf(t).forEach(id=>marcasMap[key].colabs.add(id))
  })
  const allMarcas=Object.values(marcasMap).sort((a,b)=>b.hrsR-a.hrsR)
  // Solo marcas reales para pestañas individuales
  const marcasConNombre=allMarcas.filter(r=>r.hasMarca)
  const sinMarca=marcasMap["Sin marca"]
  const periodStr=period==="custom"?`${customFrom} al ${customTo}`:period==="semana"?"Semana actual":"Mes actual"

  // ── RESUMEN — incluye Sin marca para no perder el dato ──
  const resumenRows=[
    [`REPORTE LA CATA — ${periodStr.toUpperCase()}`],
    [],
    ["Marca","Órdenes","Colaboradores","Hrs Estimadas","Hrs Reales","Eficiencia","Completadas","Vencidas"],
    ...allMarcas.map(r=>[
      r.marca,r.tasks.length,r.colabs.size,
      fmtH(r.hrsE),fmtH(r.hrsR),eff(r.hrsE,r.hrsR),
      r.tasks.filter(t=>t.status==="completada").length,
      r.tasks.filter(t=>t.status==="vencida").length,
    ])
  ]
  // Si hay órdenes sin marca, agregar nota al resumen
  if(sinMarca&&sinMarca.tasks.length>0){
    resumenRows.push([])
    resumenRows.push([`⚠️ ${sinMarca.tasks.length} orden(es) sin marca asignada — asigna marca en cada orden para verlas en su pestaña correspondiente`])
  }
  const wsResumen=XLSX.utils.aoa_to_sheet(resumenRows)
  wsResumen["!cols"]=[{wch:24},{wch:10},{wch:14},{wch:14},{wch:12},{wch:12},{wch:14},{wch:10}]
  XLSX.utils.book_append_sheet(wb,wsResumen,"Resumen")

  // ── PESTAÑA POR MARCA — solo marcas con nombre real ──
  marcasConNombre.forEach(({marca,tasks:mt})=>{
    const header=["No. Orden","Nombre de Orden","Colaborador(es)","Equipo","Estado","Prioridad","Hrs Est.","Hrs Reales","Eficiencia","Fecha Creación","Fecha Límite","Cambios"]
    const rows=mt.map(t=>{
      const assigned=assignedOf(t).map(id=>users.find(u=>u.id===id)?.name||"?").join(", ")
      const team=teams.find(x=>x.id===t.team_id)
      return[
        t.order_number?"AC-"+String(t.order_number).padStart(4,"0"):"-",
        t.title||"",assigned||"Sin asignar",team?.name||"Sin equipo",
        SL[t.status]||t.status,t.priority||"Normal",
        fmtH(t.hours),fmtH(t.hours_real),eff(t.hours,t.hours_real),
        fmtD(t.created_at),t.due_date?fmtD(t.due_date):"—",t.changes||0,
      ]
    })
    const ws=XLSX.utils.aoa_to_sheet([header,...rows])
    ws["!cols"]=[{wch:10},{wch:32},{wch:24},{wch:16},{wch:14},{wch:10},{wch:10},{wch:10},{wch:11},{wch:14},{wch:14},{wch:9}]
    const sheetName=marca.replace(/[:\\/?*\[\]]/g,"").slice(0,31)
    XLSX.utils.book_append_sheet(wb,ws,sheetName)
  })

  // ── COLABORADORES ──
  const colabMap={}
  filtered.forEach(t=>{
    assignedOf(t).forEach(id=>{
      if(!colabMap[id])colabMap[id]={id,tasks:[],marcas:new Set()}
      colabMap[id].tasks.push(t)
      if(t.marca&&t.marca.trim())colabMap[id].marcas.add(t.marca.trim())
    })
  })
  const colabHeader=["Colaborador","Equipo","Marca(s)","Total Órdenes","Completadas","Vencidas","Hrs Est.","Hrs Reales","Eficiencia"]
  const colabRows=Object.values(colabMap).map(c=>{
    const u=users.find(x=>x.id===c.id)
    const team=teams.find(x=>x.id===u?.team_id)
    const hrsE=c.tasks.reduce((s,t)=>s+Number(t.hours||0),0)
    const hrsR=c.tasks.reduce((s,t)=>s+Number(t.hours_real||0),0)
    return[u?.name||"?",team?.name||"Sin equipo",[...c.marcas].join(", ")||"—",
      c.tasks.length,c.tasks.filter(t=>t.status==="completada").length,
      c.tasks.filter(t=>t.status==="vencida").length,fmtH(hrsE),fmtH(hrsR),eff(hrsE,hrsR)]
  }).sort((a,b)=>a[0].localeCompare(b[0]))
  const wsColabs=XLSX.utils.aoa_to_sheet([colabHeader,...colabRows])
  wsColabs["!cols"]=[{wch:22},{wch:16},{wch:24},{wch:14},{wch:13},{wch:10},{wch:10},{wch:11},{wch:11}]
  XLSX.utils.book_append_sheet(wb,wsColabs,"Colaboradores")

  const periodLabel=period==="custom"?`${customFrom}_${customTo}`:period
  XLSX.writeFile(wb,`LaCata_Reporte_${periodLabel}_${new Date().toISOString().split("T")[0]}.xlsx`)
  showToast(`Reporte descargado${sinMarca?.tasks.length?` · ${sinMarca.tasks.length} órdenes sin marca`:""}`, sinMarca?.tasks.length?"warning":"success")
}

export default function ReporteExcel({tasks,users,teams,isOpen,onClose}){
  const[period,setPeriod]=useState("mes")
  const[customFrom,setCustomFrom]=useState("")
  const[customTo,setCustomTo]=useState("")
  const[loading,setLoading]=useState(false)

  if(!isOpen)return null

  // Conteo de órdenes sin marca para mostrar advertencia en el modal
  const{semFrom,semTo,mesFrom,mesTo}=getRanges()
  const filtered=filterTasks(tasks,period,customFrom,customTo)
  const sinMarcaCount=filtered.filter(t=>!t.marca||!t.marca.trim()).length

  function handleDownload(){
    if(period==="custom"&&(!customFrom||!customTo)){showToast("Selecciona el rango de fechas","error");return}
    setLoading(true)
    try{buildExcel(tasks,users,teams,period,customFrom,customTo)}
    catch(e){console.error(e);showToast("Error al generar el reporte","error")}
    finally{setLoading(false);onClose()}
  }

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:14,padding:"24px 28px",width:"100%",maxWidth:380,boxShadow:"0 20px 60px rgba(0,0,0,.5)"}}>
        <h3 style={{fontSize:16,fontWeight:800,marginBottom:4,fontFamily:"var(--font-display)"}}>📊 Descargar Reporte</h3>
        <p style={{fontSize:12,color:"var(--muted)",marginBottom:20}}>Excel con pestañas por marca, órdenes, colaboradores y horas</p>

        <div style={{display:"flex",gap:4,background:"var(--bg3)",borderRadius:8,padding:3,marginBottom:16}}>
          {[{v:"semana",l:"Esta semana"},{v:"mes",l:"Este mes"},{v:"custom",l:"Rango"}].map(p=>(
            <button key={p.v} onClick={()=>setPeriod(p.v)}
              style={{flex:1,padding:"6px 4px",borderRadius:6,fontSize:12,cursor:"pointer",border:"none",fontFamily:"inherit",
                background:period===p.v?"var(--bg2)":"transparent",
                color:period===p.v?"var(--text)":"var(--muted)",
                fontWeight:period===p.v?700:400,transition:".13s"}}>
              {p.l}
            </button>
          ))}
        </div>

        {period==="custom"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
            <div>
              <label style={{fontSize:11,color:"var(--muted)",display:"block",marginBottom:4}}>Desde</label>
              <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)}
                style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg3)",color:"var(--text)",fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/>
            </div>
            <div>
              <label style={{fontSize:11,color:"var(--muted)",display:"block",marginBottom:4}}>Hasta</label>
              <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)}
                style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg3)",color:"var(--text)",fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/>
            </div>
          </div>
        )}

        <div style={{background:"var(--bg3)",borderRadius:8,padding:"10px 12px",marginBottom:sinMarcaCount>0?12:20,fontSize:11,color:"var(--muted)",lineHeight:1.8}}>
          Pestañas incluidas:<br/>
          <strong style={{color:"var(--text)"}}>Resumen</strong> → totales por marca<br/>
          <strong style={{color:"var(--text)"}}>Una pestaña por marca</strong> → órdenes detalladas<br/>
          <strong style={{color:"var(--text)"}}>Colaboradores</strong> → rendimiento individual
        </div>

        {/* Advertencia si hay órdenes sin marca */}
        {sinMarcaCount>0&&(
          <div style={{background:"rgba(232,140,46,.1)",border:"1px solid rgba(232,140,46,.3)",borderRadius:8,padding:"8px 12px",marginBottom:16,fontSize:11,color:"var(--p-alta)",display:"flex",gap:8,alignItems:"flex-start"}}>
            <Icon n="alerta" size={13} style={{flexShrink:0,marginTop:1}}/>
            <span><strong>{sinMarcaCount} orden{sinMarcaCount!==1?"es":""} sin marca</strong> — no aparecerán en pestañas individuales. Asigna marca en cada orden para incluirlas.</span>
          </div>
        )}

        <div style={{display:"flex",gap:8}}>
          <button onClick={onClose}
            style={{flex:1,padding:"9px",borderRadius:8,border:"1px solid var(--border)",background:"transparent",color:"var(--muted)",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>
            Cancelar
          </button>
          <button onClick={handleDownload} disabled={loading}
            style={{flex:2,padding:"9px",borderRadius:8,border:"none",background:"var(--accent)",color:"#0d0d0d",cursor:loading?"default":"pointer",fontSize:13,fontWeight:700,fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:loading?.7:1}}>
            <Icon n="exportar" size={14}/>{loading?"Generando...":"Descargar Excel"}
          </button>
        </div>
      </div>
    </div>
  )
}
