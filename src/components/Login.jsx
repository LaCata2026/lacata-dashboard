import{useState}from'react'
import{sb,LS}from'../lib/supabase'
import{showToast}from'./Toast'
import Icon from'./Icon'

function ForgotPassword({onBack}){
  const[email,setEmail]=useState("");const[sent,setSent]=useState(false);const[loading,setLoading]=useState(false)
  async function send(){if(!email)return;setLoading(true);await sb.forgotPassword(email);setSent(true);setLoading(false)}
  return(
    <div className="login-wrap"><div className="login-card">
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
        <div className="logo-mark" style={{background:"#0d0d0d",padding:2}}><img src="/logo_cata.png" alt="La Cata" style={{width:"100%",height:"100%",objectFit:"contain",borderRadius:6}}/></div>
        <div><h1 style={{fontSize:24,fontWeight:900,letterSpacing:"-0.4px",fontFamily:"var(--font-display)"}}>La Cata</h1><p style={{fontSize:12,color:"var(--muted)"}}>Recuperar contraseña</p></div>
      </div>
      {sent?(<div style={{textAlign:"center",padding:"20px 0"}}>
        <p style={{fontSize:15,color:"var(--text)",marginBottom:8}}>✓ Correo enviado</p>
        <p style={{fontSize:13,color:"var(--muted)",marginBottom:20}}>Revisa tu bandeja de entrada.</p>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>Volver al login</button>
      </div>):(
        <>
          <p style={{color:"var(--muted2)",fontSize:14,marginBottom:20}}>Ingresa tu correo para recibir un enlace de recuperación.</p>
          <div className="form-group"><label className="form-label">Correo electrónico</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="tu@correo.com"/></div>
          <button className="btn btn-primary" style={{width:"100%",padding:13,fontSize:15,fontWeight:700,marginBottom:12}} onClick={send} disabled={loading}>{loading?"Enviando...":"Enviar enlace"}</button>
          <button className="btn btn-ghost" style={{width:"100%",padding:11}} onClick={onBack}>Volver</button>
        </>
      )}
    </div></div>
  )
}

export default function Login({onLogin}){
  const[email,setEmail]=useState("");const[pw,setPw]=useState("");const[loading,setLoading]=useState(false);const[err,setErr]=useState("");const[forgot,setForgot]=useState(false)
  if(forgot)return<ForgotPassword onBack={()=>setForgot(false)}/>
  async function login(){
    setErr("");setLoading(true)
    try{const{profile,access_token,refresh_token}=await sb.signIn(email,pw);const session={token:access_token,profile};LS.set("lc_session",session);LS.set("lc_refresh_token",refresh_token);onLogin(session)}
    catch(e){setErr(e.message)}finally{setLoading(false)}
  }
  return(
    <div className="login-wrap"><div className="login-card">
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
        <div className="logo-mark" style={{background:"#0d0d0d",padding:2}}><img src="/logo_cata.png" alt="La Cata" style={{width:"100%",height:"100%",objectFit:"contain",borderRadius:6}}/></div>
        <div><h1 style={{fontSize:24,fontWeight:900,letterSpacing:"-0.4px",fontFamily:"var(--font-display)"}}>La Cata</h1><p style={{fontSize:12,color:"var(--muted)"}}>Creative Ops</p></div>
      </div>
      <div className="form-group"><label className="form-label">Correo electrónico</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@correo.com" autoComplete="email"/></div>
      <div className="form-group"><label className="form-label">Contraseña</label><input type="password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} placeholder="••••••••" autoComplete="current-password"/></div>
      {err&&(<div style={{background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.2)",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#fca5a5",marginBottom:14}}><Icon n="alerta" size={12} style={{marginRight:4}}/>{err}</div>)}
      <button className="btn btn-primary" style={{width:"100%",padding:13,fontSize:15,fontWeight:700,marginBottom:12}} onClick={login} disabled={loading}>{loading?"Ingresando...":"Ingresar"}</button>
      <button className="btn btn-ghost" style={{width:"100%",padding:11,fontSize:13}} onClick={()=>setForgot(true)}>Olvidé mi contraseña</button>
    </div></div>
  )
}
