import{useState,useEffect}from'react'
import{LS}from'../lib/supabase'

export function useNotifications(tasks,me){
  const[unread,setUnread]=useState([])
  
  useEffect(()=>{
    if(!tasks||!me)return
    const seen=LS.get("lc_seen_mentions",{})
    const mentions=[]
    tasks.forEach(t=>{
      const comments=Array.isArray(t.comments)?t.comments:[]
      comments.forEach(c=>{
        if(c.user_id!==me.id&&Array.isArray(c.mentions)&&c.mentions.includes(me.id)){
          const key=t.id+"-"+c.id
          if(!seen[key])mentions.push({taskId:t.id,task:t,comment:c,key})
        }
      })
    })
    setUnread(mentions)
  },[tasks,me])

  function markAllSeen(){
    const seen=LS.get("lc_seen_mentions",{})
    unread.forEach(n=>{seen[n.key]=true})
    LS.set("lc_seen_mentions",seen)
    setUnread([])
  }

  function markSeen(key){
    const seen=LS.get("lc_seen_mentions",{})
    seen[key]=true
    LS.set("lc_seen_mentions",seen)
    setUnread(u=>u.filter(n=>n.key!==key))
  }

  return{unread,markAllSeen,markSeen}
}
