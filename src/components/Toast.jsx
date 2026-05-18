import { useState } from 'react'
let _toast=null
export function showToast(m,type="info"){_toast&&_toast(m,type)}
export default function Toast(){
  const[msg,setMsg]=useState("");const[type,setType]=useState("info");const[show,setShow]=useState(false)
  _toast=(m,t="info")=>{setMsg(m);setType(t);setShow(true);setTimeout(()=>setShow(false),3000)}
  const bg=type==="error"?"rgba(239,68,68,.9)":type==="success"?"rgba(16,185,129,.9)":"var(--bg3)"
  return<div className={`toast${show?" show":""}`} style={{background:bg}}>{msg}</div>
}
