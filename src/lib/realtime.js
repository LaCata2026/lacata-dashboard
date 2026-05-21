import { SB_URL, SB_ANON } from './supabase'
export const Realtime={
  ws:null,callbacks:{},_heartbeat:null,_token:null,_reconnectDelay:2000,_reconnectTimer:null,_manualClose:false,
  subscribe(table,fn){if(!this.callbacks[table])this.callbacks[table]=[];this.callbacks[table].push(fn);return()=>{this.callbacks[table]=this.callbacks[table].filter(f=>f!==fn)}},
  connect(token){
    this._manualClose=false;this._token=token
    if(this.ws&&(this.ws.readyState===WebSocket.OPEN||this.ws.readyState===WebSocket.CONNECTING))return
    const wsUrl=SB_URL.replace("https://","wss://")+"/realtime/v1/websocket?apikey="+SB_ANON+"&vsn=1.0.0"
    try{this.ws=new WebSocket(wsUrl)}catch(e){console.warn("Realtime WS:",e);window._realtimeConnected=false;return}
    this.ws.onopen=()=>{
      this._reconnectDelay=2000
      window._realtimeConnected=true
      ;["tareas","usuarios","equipos"].forEach(table=>{this.ws.send(JSON.stringify({topic:"realtime:public:"+table,event:"phx_join",payload:{config:{broadcast:{self:false},presence:{key:""},postgres_changes:[{event:"*",schema:"public",table}]}},ref:"join_"+table}))})
      this._heartbeat=setInterval(()=>{if(this.ws.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify({topic:"phoenix",event:"heartbeat",payload:{},ref:"hb"}))},20000)
    }
    this.ws.onmessage=(e)=>{
      try{
        const msg=JSON.parse(e.data)
        const ev=msg?.payload?.data
        if(!ev||!ev.table)return
        const cbs=this.callbacks[ev.table]
        if(cbs&&cbs.length)cbs.forEach(fn=>fn(ev))
      }catch{}
    }
    this.ws.onerror=()=>{window._realtimeConnected=false}
    this.ws.onclose=()=>{clearInterval(this._heartbeat);window._realtimeConnected=false;if(!this._manualClose){this._reconnectTimer=setTimeout(()=>{this._reconnectDelay=Math.min(this._reconnectDelay*1.5,30000);this.connect(this._token)},this._reconnectDelay)}}
  },
  disconnect(){this._manualClose=true;clearInterval(this._heartbeat);clearTimeout(this._reconnectTimer);if(this.ws)try{this.ws.close()}catch{};this.ws=null;window._realtimeConnected=false},
}

/* ════════════════════════════════════════════════════
   PushNotif — notificaciones del navegador
   FIX: ya no usamos un flag _granted que se pierde en
   cada reload. Siempre leemos Notification.permission
   en vivo. Así, si el usuario concedió el permiso en
   una sesión anterior, las notificaciones siguen
   funcionando aunque la app se haya recargado.
════════════════════════════════════════════════════ */
export const PushNotif={
  isSupported(){
    return typeof window!=="undefined" && "Notification" in window
  },
  isGranted(){
    if(!this.isSupported())return false
    return Notification.permission==="granted"
  },
  async requestPermission(){
    if(!this.isSupported())return"unsupported"
    if(Notification.permission==="granted")return"granted"
    if(Notification.permission==="denied")return"denied"
    try{
      const p=await Notification.requestPermission()
      // Algunos navegadores devuelven el resultado como string, otros pasan
      // a un callback antiguo. Re-leemos del API para estar seguros.
      return p||Notification.permission
    }catch(e){
      console.warn("[PushNotif] requestPermission error:",e)
      return Notification.permission
    }
  },
  send(title,body,onClick){
    if(!this.isGranted())return false
    try{
      const n=new Notification(title,{body,tag:title,icon:"/logo_cata.png"})
      if(onClick)n.onclick=()=>{
        window.focus()
        try{onClick()}catch(e){console.warn("[PushNotif] onclick error:",e)}
        n.close()
      }
      setTimeout(()=>{try{n.close()}catch{}},8000)
      return true
    }catch(e){
      console.warn("[PushNotif] send error:",e)
      return false
    }
  },
}
