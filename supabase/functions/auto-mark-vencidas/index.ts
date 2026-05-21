import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Ejecutar con service role — bypasea RLS para operar sobre todas las tareas
const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async () => {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]
  const nowLabel = new Date().toLocaleString('es-GT')

  // 1. Marcar como vencidas las tareas cuya fecha ya pasó
  const { data: toMark, error: e1 } = await admin
    .from('tareas')
    .select('id, history')
    .lt('due_date', todayStr)
    .not('status', 'in', '("completada","vencida","en_revision","en_pausa")')

  if (e1) return Response.json({ error: e1.message }, { status: 500 })

  // 2. Revertir a pendiente las vencidas cuya fecha fue actualizada al futuro
  const { data: toRevert, error: e2 } = await admin
    .from('tareas')
    .select('id, history')
    .eq('status', 'vencida')
    .gte('due_date', todayStr)

  if (e2) return Response.json({ error: e2.message }, { status: 500 })

  const marked: string[] = []
  const reverted: string[] = []

  await Promise.all([
    ...( toMark ?? []).map(async (t) => {
      await admin.from('tareas').update({
        status: 'vencida',
        history: [
          ...(t.history ?? []),
          `⚠️ Marcada como vencida automáticamente — ${nowLabel}`,
        ],
      }).eq('id', t.id)
      marked.push(t.id)
    }),
    ...(toRevert ?? []).map(async (t) => {
      await admin.from('tareas').update({
        status: 'pendiente',
        history: [
          ...(t.history ?? []),
          `✅ Reactivada automáticamente — fecha actualizada — ${nowLabel}`,
        ],
      }).eq('id', t.id)
      reverted.push(t.id)
    }),
  ])

  return Response.json({
    ok: true,
    marked: marked.length,
    reverted: reverted.length,
    at: new Date().toISOString(),
  })
})
