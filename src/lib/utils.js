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
  {id:"desempeno",icon:"desempeno",label:"Desempeño",section:"trabajo",roles:["director"]},
  {id:"admin",icon:"admin",label:"Administración",section:"admin",roles:["director"]},
]
export const fmtDate=d=>{if(!d)return"—";const[y,m,dd]=d.split("-");return`${dd}/${m}/${y}`}
export const fmtDateRelative=d=>{
  if(!d)return{label:"—",color:"var(--muted)",urgent:false}
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
const _sessionFilters={}
export function useSessionFilters(key,defaults){
  const stored=_sessionFilters[key]||defaults
  const[state,setState]=useState(stored)
  function set(val){_sessionFilters[key]=val;setState(val)}
  return[state,set]
}
