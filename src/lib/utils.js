import { useState } from 'react'
export const statusLabel={pendiente:"Pendiente",en_progreso:"En progreso",en_pausa:"En pausa",en_revision:"En revisión",completada:"Completada",vencida:"Vencida"}
export const statusPill={pendiente:"pill-pendiente",en_progreso:"pill-progreso",en_pausa:"pill-pausa",en_revision:"pill-revision",completada:"pill-completada",vencida:"pill-vencida"}
export const statusColor={pendiente:"var(--s-pendiente)",en_progreso:"var(--s-progreso)",en_pausa:"var(--s-pausa)",en_revision:"var(--s-revision)",completada:"var(--s-completada)",vencida:"var(--s-vencida)"}
export const prioPill={Normal:"pill-prio-normal",Alta:"pill-prio-alta",Urgente:"pill-prio-urgente"}
export const NAV=[
  {id:"home",icon:"home",label:"Inicio",section:"trabajo",roles:["director","colaborador","cuentas"]},
  {id:"ordenes",icon:"ordenes",label:"Órdenes",section:"trabajo",roles:["director","colaborador","cuentas"]},
  {id:"crear",icon:"nueva",label:"Nueva orden",section:"trabajo",roles:["director","cuentas"]},
  {id:"equipos",icon:"equipos",label:"Equipos",section:"trabajo",roles:["director","cuentas"]},
  {id:"calendario",icon:"calendario",label:"Calendario",section:"trabajo",roles:["director","cuentas"]},
  {id:"desempeno",icon:"desempeno",label:"Desempeño & Reportes",section:"trabajo",roles:["director","cuentas"]},
  {id:"admin",icon:"admin",label:"Administración",section:"admin",roles:["director"]},
]
export const fmtDate=d=>{if(!d)return"—";const[y,m,dd]=d.split("-");return`${dd}/${m}/${y}`}

/**
 * fmtDateRelative — etiqueta de fecha límite relativa al hoy.
 *
 * @param {string} d       fecha límite (YYYY-MM-DD)
 * @param {string} status  estado de la tarea (opcional). Si la tarea ya está
 *                          "completada", NO se muestra alerta de vencimiento —
 *                          una tarea terminada no debe generar pánico aunque
 *                          su fecha límite haya pasado. Se muestra la fecha
 *                          plana en color neutro.
 *
 * Retorna {label, color, urgent}.
 */
export const fmtDateRelative=(d,status)=>{
  if(!d)return{label:"—",color:"var(--muted)",urgent:false}
  // Tarea completada: la fecha límite ya no es relevante como alerta.
  // Mostramos solo la fecha en gris, sin "Venció hace" ni urgencia.
  if(status==="completada")return{label:fmtDate(d),color:"var(--muted)",urgent:false}
  const today=new Date();today.setHours(0,0,0,0)
  const due=new Date(d+"T00:00:00")
  const diff=Math.round((due-today)/(1000*60*60*24))
  if(diff<0)return{label:`Venció hace ${Math.abs(diff)}d`,color:"var(--red)",urgent:true}
  if(diff===0)return{label:"Vence HOY",color:"var(--red)",urgent:true}
  if(diff===1)return{label:"Vence mañana",color:"var(--orange)",urgent:true}
  if(diff<=3)return{label:`${diff} días`,color:"var(--yellow)",urgent:false}
  if(diff<=7)return{label:`${diff} días`,color:"var(--muted2)",urgent:false}
  return{label:fmtDate(d),color:"var(--muted)",urgent:false}
}
export function useSessionFilters(key,defaults){
  const stored=(()=>{try{const v=sessionStorage.getItem("sf_"+key);return v?JSON.parse(v):defaults}catch{return defaults}})()
  const[state,setState]=useState(stored)
  function set(val){try{sessionStorage.setItem("sf_"+key,JSON.stringify(val))}catch{};setState(val)}
  return[state,set]
}

export async function autoMarkVencidas(tasks, token, sb) {
  const today = new Date(); today.setHours(0,0,0,0);
  const toMark = tasks.filter(t =>
    t.due_date &&
    t.status !== "completada" &&
    t.status !== "vencida" &&
    new Date(t.due_date + "T00:00:00") < today
  );
  if (toMark.length === 0) return false;
  await Promise.all(toMark.map(t =>
    sb.update("tareas", t.id, {
      status: "vencida",
      history: [...(t.history||[]), `⚠️ Marcada como vencida automáticamente — ${new Date().toLocaleString("es-GT")}`]
    }, token)
  ));
  return true;
}

/**
 * assignedOf — helper único para normalizar el campo assigned_to.
 *
 * La BD puede guardar assigned_to como:
 *   - array:  ["uuid1","uuid2"]   (asignación múltiple)
 *   - string: "uuid1"             (asignación simple, legacy)
 *   - null/undefined              (sin asignar)
 *
 * Siempre devuelve un array de strings (puede ser vacío), nunca null.
 *
 * Uso:  assignedOf(task).includes(userId)
 *       assignedOf(task).map(id => users.find(u => u.id === id))
 */
export const assignedOf = t =>
  Array.isArray(t.assigned_to)
    ? t.assigned_to
    : [t.assigned_to].filter(Boolean)
