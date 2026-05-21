import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    // Verificar que el llamador está autenticado
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verificar token del director que llama
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await callerClient.auth.getUser()
    if (authError || !user) return json({ error: 'Token inválido' }, 401)

    // Solo directores pueden invitar
    const { data: profile, error: profileError } = await callerClient
      .from('usuarios')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || profile?.role !== 'director') {
      return json({ error: 'Solo los directores pueden invitar usuarios' }, 403)
    }

    const { email, name } = await req.json()
    if (!email || !name) return json({ error: 'email y name son requeridos' }, 400)

    // Invitar usuario — Supabase envía el email usando la plantilla configurada
    // en Auth → Email Templates → Invite user del dashboard de Supabase
    const adminClient = createClient(supabaseUrl, serviceKey)
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name: name },
      redirectTo: 'https://hub.agarrate-catalina.com',
    })

    if (error) return json({ error: error.message }, 400)

    const u = data.user
    return json({ id: u.id, email: u.email, user_metadata: u.user_metadata })

  } catch (err) {
    console.error('invite-user error:', err)
    return json({ error: err.message }, 500)
  }
})
