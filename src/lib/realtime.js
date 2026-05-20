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
    // ── FIX: antes este handler disparaba los callbacks DOS VECES por evento.
    // Tenía dos `if` separados que matcheaban el mismo mensaje (uno por
    // msg.payload?.data?.table y otro por msg.event==="postgres_changes").
    // Ahora se procesa UNA sola vez: extraemos el event data y disparamos.
    this.ws.onmessage=(e)=>{
      try{
        const msg=JSON.parse(e.data)
        // Supabase Realtime envía el cambio en msg.payload.data, ya sea como
        // mensaje suelto o envuelto en event:"postgres_changes". Lo unificamos.
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
export const PushNotif={
  _granted:false,
  async requestPermission(){if(!("Notification"in window))return;if(Notification.permission==="granted"){this._granted=true;return};if(Notification.permission!=="denied"){const p=await Notification.requestPermission();this._granted=(p==="granted")}},
  send(title,body,onClick){if(!this._granted)return;try{const n=new Notification(title,{body,tag:title});if(onClick)n.onclick=()=>{window.focus();onClick();n.close()};setTimeout(()=>n.close(),8000)}catch{}},
}
