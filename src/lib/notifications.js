import { useState, useEffect, useRef } from 'react'
import { LS } from '../lib/supabase'
import { PushNotif } from '../lib/realtime'

export function useNotifications(tasks, me) {
  const [unread, setUnread] = useState([])
  // Rastreamos qué claves ya dispararon push para no repetir en cada re-render
  const notifiedRef = useRef(new Set(LS.get('lc_push_notified', [])))

  useEffect(() => {
    if (!tasks || !me) return
    const seen = LS.get('lc_seen_mentions', {})
    const mentions = []
    tasks.forEach((t) => {
      const comments = Array.isArray(t.comments) ? t.comments : []
      comments.forEach((c) => {
        if (c.user_id === me.id) return // mis propios comentarios no cuentan
        const mentioned = Array.isArray(c.mentions) && c.mentions.includes(me.id)
        const key = t.id + '-' + c.id
        if (mentioned && !seen[key]) {
          mentions.push({ taskId: t.id, task: t, comment: c, key })
          // ── PUSH NOTIFICATION ──
          // Solo dispara si no hemos notificado ya esta mención en esta sesión
          if (!notifiedRef.current.has(key)) {
            notifiedRef.current.add(key)
            // Persistir para sobrevivir reloads dentro de la misma sesión
            LS.set('lc_push_notified', [...notifiedRef.current].slice(-200))
            PushNotif.send(
              'Nueva mención en: ' + t.title,
              (c.user_name || 'Alguien') + ' te mencionó: ' + c.text.slice(0, 80),
              // Click en la notif → abre la tarea EN EL TAB DE CONVERSACIÓN
              () => {
                window._openTask && window._openTask(t, 'conversacion')
              }
            )
          }
        }
      })
      // ── NOTIFICACIÓN: nueva tarea asignada ──
      const assigned = Array.isArray(t.assigned_to)
        ? t.assigned_to
        : [t.assigned_to].filter(Boolean)
      if (assigned.includes(me.id) && t.status === 'pendiente') {
        const assignKey = 'assign-' + t.id
        if (!notifiedRef.current.has(assignKey) && !seen[assignKey]) {
          // Solo notificar tareas creadas en los últimos 10 minutos
          const age = Date.now() - new Date(t.created_at).getTime()
          if (age < 10 * 60 * 1000) {
            notifiedRef.current.add(assignKey)
            LS.set('lc_push_notified', [...notifiedRef.current].slice(-200))
            PushNotif.send(
              'Nueva orden asignada',
              t.title +
                (t.order_number ? ' (AC-' + String(t.order_number).padStart(4, '0') + ')' : ''),
              // Click → abre la tarea en detalles (tab por defecto)
              () => {
                window._openTask && window._openTask(t, 'detalles')
              }
            )
          }
        }
      }
    })
    setUnread(mentions)
  }, [tasks, me?.id])

  function markAllSeen() {
    const seen = LS.get('lc_seen_mentions', {})
    unread.forEach((n) => {
      seen[n.key] = true
    })
    LS.set('lc_seen_mentions', seen)
    setUnread([])
  }

  function markSeen(key) {
    const seen = LS.get('lc_seen_mentions', {})
    seen[key] = true
    LS.set('lc_seen_mentions', seen)
    setUnread((u) => u.filter((n) => n.key !== key))
  }

  return { unread, markAllSeen, markSeen }
}
