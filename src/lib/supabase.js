import { createClient } from '@supabase/supabase-js'

export const SB_URL = import.meta.env.VITE_SB_URL
export const SB_ANON = import.meta.env.VITE_SB_ANON
export const supabase = createClient(SB_URL, SB_ANON)
export const hdr = (t) => ({
  apikey: SB_ANON,
  Authorization: `Bearer ${t || SB_ANON}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
})
export const hdrWrite = (t) => ({
  apikey: SB_ANON,
  Authorization: `Bearer ${t || SB_ANON}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
})
export const DIRECTOR_EMAILS = ['jorge@agarrate-catalina.com']
export const CUENTAS_EMAILS = []
export const COLLAB_COLORS = [
  '#e85d4a',
  '#f0924a',
  '#e8c547',
  '#4ade80',
  '#3ecf8e',
  '#5b9cf6',
  '#60a5fa',
  '#a78bfa',
  '#c084fc',
  '#f472b6',
  '#fb923c',
  '#f87171',
  '#34d399',
  '#38bdf8',
  '#818cf8',
  '#e879f9',
]
export const COLORS = [
  '#e85d4a',
  '#e8a23a',
  '#4ade80',
  '#3ecf8e',
  '#5b9cf6',
  '#a78bfa',
  '#f472b6',
  '#fb923c',
  '#34d399',
  '#60a5fa',
  '#c084fc',
  '#f87171',
]
export const MARCAS_PREDEFINIDAS = [
  'Novex',
  'Painsa',
  'Sombrela Y Rabinal',
  'Purina',
  'Seguros GyT',
  'CIAM',
  'Digital',
]

export function getMarcas() {
  try {
    const custom = JSON.parse(localStorage.getItem('lc_custom_marcas') || '[]')
    return [...new Set([...MARCAS_PREDEFINIDAS, ...custom])].sort()
  } catch {
    return MARCAS_PREDEFINIDAS
  }
}
export function addMarca(name) {
  try {
    const custom = JSON.parse(localStorage.getItem('lc_custom_marcas') || '[]')
    if (!custom.includes(name)) {
      custom.push(name)
      localStorage.setItem('lc_custom_marcas', JSON.stringify(custom))
    }
  } catch {}
}
export function removeMarca(name) {
  try {
    const custom = JSON.parse(localStorage.getItem('lc_custom_marcas') || '[]')
    localStorage.setItem('lc_custom_marcas', JSON.stringify(custom.filter((m) => m !== name)))
  } catch {}
}
export function getRole(e) {
  const em = (e || '').toLowerCase()
  if (DIRECTOR_EMAILS.includes(em)) return 'director'
  if (CUENTAS_EMAILS.includes(em)) return 'cuentas'
  return 'colaborador'
}
export function getInitials(name) {
  if (!name) return '?'
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase()
}
export function getAvatarColor(email) {
  let h = 0
  for (let c of email || '') h = (h * 31 + c.charCodeAt(0)) % COLLAB_COLORS.length
  return COLLAB_COLORS[Math.abs(h)]
}
export function autoColor(email) {
  return getAvatarColor(email || String(Date.now()))
}
const BRAND_COLORS = {
  novex: '#f0924a',
  painsa: '#3ecf8e',
  'sombrela y rabinal': '#a78bfa',
  purina: '#e85d4a',
  'seguros gyt': '#5b9cf6',
  ciam: '#38bdf8',
  digital: '#e8c547',
}
const FALLBACK_BRAND = [
  '#f0924a',
  '#3ecf8e',
  '#a78bfa',
  '#e85d4a',
  '#5b9cf6',
  '#38bdf8',
  '#e8c547',
  '#f472b6',
  '#34d399',
  '#c084fc',
  '#fb923c',
  '#818cf8',
]
export function teamColor(team) {
  if (!team) return 'var(--muted)'
  const key = (team.name || '').toLowerCase().trim()
  if (BRAND_COLORS[key]) return BRAND_COLORS[key]
  let h = 0
  for (let c of key) h = (h * 31 + c.charCodeAt(0)) % FALLBACK_BRAND.length
  return FALLBACK_BRAND[Math.abs(h)]
}
export const LS = {
  get: (k, d) => {
    try {
      const v = localStorage.getItem(k)
      return v ? JSON.parse(v) : d
    } catch {
      return d
    }
  },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  del: (k) => localStorage.removeItem(k),
}

function safeUser(d) {
  const u = d?.user || d || {}
  const email = u.email || u.new_email || d?.email || ''
  const meta = u.user_metadata || u.raw_user_meta_data || {}
  const fullName = meta.full_name || meta.name || ''
  const name = fullName || (email ? email.split('@')[0] : 'usuario')
  return { id: u.id, email, name, meta, fullName }
}

// Fetch perfil desde BD con reintentos — devuelve la fila o null
async function fetchProfile(id, token, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/usuarios?id=eq.${id}&select=*`, {
        headers: { apikey: SB_ANON, Authorization: `Bearer ${token}` },
      })
      // Si el status no es 200, loguear y reintentar
      if (!r.ok) {
        console.warn(`[fetchProfile] status ${r.status} intento ${i + 1}`)
        if (i < retries) {
          await new Promise((res) => setTimeout(res, 400 * (i + 1)))
          continue
        }
        return null
      }
      const data = await r.json()
      // Verificar que sea array con datos — si Supabase devuelve error JSON, data no es array
      if (Array.isArray(data) && data.length > 0) return data[0]
      // Si es array vacío, el usuario no tiene fila — no reintentar
      if (Array.isArray(data) && data.length === 0) return null
      // Si no es array (error object de Supabase), loguear y reintentar
      console.warn(`[fetchProfile] respuesta inesperada:`, JSON.stringify(data))
      if (i < retries) {
        await new Promise((res) => setTimeout(res, 400 * (i + 1)))
        continue
      }
      return null
    } catch (e) {
      console.warn(`[fetchProfile] excepción intento ${i + 1}:`, e.message)
      if (i < retries) {
        await new Promise((res) => setTimeout(res, 400 * (i + 1)))
        continue
      }
      return null
    }
  }
  return null
}

export const sb = {
  async signIn(email, pw) {
    // ── PASO 1: Autenticar en Supabase Auth ──
    const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SB_ANON },
      body: JSON.stringify({ email, password: pw }),
    })
    const d = await r.json()
    if (d.error || d.error_description) throw new Error('Correo o contraseña incorrectos')

    const { id, email: uemail, name: authName, fullName } = safeUser(d)
    if (!id) throw new Error('No se pudo obtener el usuario. Intenta de nuevo.')

    // ── PASO 2: Buscar perfil en BD con reintentos ──
    let profile = await fetchProfile(id, d.access_token)

    if (profile) {
      // Perfil encontrado — normalizar campos
      if (typeof profile.team_ids === 'string') {
        try {
          profile.team_ids = JSON.parse(profile.team_ids)
        } catch {
          profile.team_ids = []
        }
      }
      if (!Array.isArray(profile.team_ids)) profile.team_ids = []
      if (!profile.name)
        profile.name = fullName || authName || (uemail ? uemail.split('@')[0] : 'Usuario')
      if (!profile.initials) profile.initials = getInitials(profile.name)
      if (!profile.avatar_color) profile.avatar_color = getAvatarColor(uemail)
      if (!profile.role) profile.role = 'colaborador'
    } else {
      // ── PASO 3: Perfil no existe — crear en BD ──
      // IMPORTANTE: NO asumir rol desde email — usar "colaborador" como base
      // El director puede cambiar el rol desde AdminView después
      const avatar_color = getAvatarColor(uemail)
      const safeName = fullName || authName || (uemail ? uemail.split('@')[0] : 'Usuario')
      const initials = getInitials(safeName)
      // Solo director se auto-detecta por email — el resto siempre colaborador
      const role = DIRECTOR_EMAILS.includes((uemail || '').toLowerCase())
        ? 'director'
        : 'colaborador'

      const newProfile = {
        id,
        email: uemail,
        name: safeName,
        role,
        avatar_color,
        initials,
        team_ids: [],
        team_id: null,
      }

      try {
        const insertR = await fetch(`${SB_URL}/rest/v1/usuarios`, {
          method: 'POST',
          headers: {
            apikey: SB_ANON,
            Authorization: `Bearer ${d.access_token}`,
            'Content-Type': 'application/json',
            // ignore-duplicates: si ya existe por race condition, no falla
            Prefer: 'resolution=ignore-duplicates,return=representation',
          },
          body: JSON.stringify(newProfile),
        })
        const insertData = await insertR.json()
        if (Array.isArray(insertData) && insertData.length > 0) {
          profile = insertData[0]
        } else {
          // Insert ignoró duplicado — releer el perfil que ya existía
          profile = (await fetchProfile(id, d.access_token)) || newProfile
        }
      } catch (err) {
        console.warn('Auto-create profile failed:', err)
        profile = newProfile
      }

      if (!Array.isArray(profile.team_ids)) profile.team_ids = []
    }

    return { profile, access_token: d.access_token, refresh_token: d.refresh_token }
  },

  async inviteUser(email, name, token) {
    // Llama a la Edge Function — la service key nunca sale al browser
    const r = await fetch(`${SB_URL}/functions/v1/invite-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: SB_ANON,
      },
      body: JSON.stringify({ email, name }),
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error || `Error ${r.status}`)
    if (!d.id) throw new Error('No se pudo obtener el ID del usuario invitado')
    return {
      id: d.id,
      email: d.email || email,
      user_metadata: d.user_metadata || { full_name: name },
    }
  },

  async get(table, params, token) {
    const r = await fetch(`${SB_URL}/rest/v1/${table}?${params}`, { headers: hdr(token) })
    if (r.status === 401) throw new Error('SESSION_EXPIRED')
    if (r.status === 403) {
      console.warn(`RLS 403 en ${table} — retornando array vacío`)
      return []
    }
    return r.json()
  },

  async insert(table, data, token) {
    const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: hdrWrite(token),
      body: JSON.stringify(data),
    })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      throw new Error(
        Array.isArray(j) ? j[0]?.message : j?.message || j?.error || `Error ${r.status}`
      )
    }
    return {}
  },
  async update(table, id, data, token) {
    const r = await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: 'PATCH',
      headers: hdrWrite(token),
      body: JSON.stringify(data),
    })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      throw new Error(j?.message || j?.error || `Error ${r.status}`)
    }
  },
  async del(table, id, token) {
    const r = await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: 'DELETE',
      headers: hdr(token),
    })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      throw new Error(j?.message || j?.error || `Error ${r.status} al eliminar`)
    }
  },
  async upload(bucket, path, file, token) {
    const r = await fetch(`${SB_URL}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: {
        apikey: SB_ANON,
        Authorization: `Bearer ${token || SB_ANON}`,
        'Content-Type': file.type,
        'x-upsert': 'true',
      },
      body: file,
    })
    if (!r.ok) throw new Error('Error al subir archivo')
    return `${SB_URL}/storage/v1/object/public/${bucket}/${path}`
  },
  async forgotPassword(email) {
    const r = await fetch(`${SB_URL}/auth/v1/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SB_ANON },
      body: JSON.stringify({ email }),
    })
    return r.json()
  },
  async refreshSession(refreshToken) {
    const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SB_ANON },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    const d = await r.json()
    if (d.error || d.error_description) throw new Error('No se pudo renovar la sesion')
    return d
  },

  async nextOrderNumber(token) {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/next_order_number`, {
      method: 'POST',
      headers: hdr(token),
      body: JSON.stringify({}),
    })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      throw new Error(j?.message || j?.error || `Error obteniendo número de orden (${r.status})`)
    }
    const val = await r.json()
    const num = typeof val === 'number' ? val : Number(val)
    if (!num || isNaN(num)) throw new Error('Número de orden inválido recibido del servidor')
    return num
  },

  async getMarcasDB(token) {
    try {
      const rows = await this.get('marcas', 'select=name&order=name.asc', token)
      const custom = Array.isArray(rows) ? rows.map((r) => r.name).filter(Boolean) : []
      return [...new Set([...MARCAS_PREDEFINIDAS, ...custom])].sort()
    } catch (e) {
      console.warn('getMarcasDB error, fallback a predefinidas:', e)
      return [...MARCAS_PREDEFINIDAS].sort()
    }
  },

  async addMarcaDB(name, token, userId) {
    const trimmed = (name || '').trim()
    if (!trimmed || MARCAS_PREDEFINIDAS.includes(trimmed)) return
    const r = await fetch(`${SB_URL}/rest/v1/marcas`, {
      method: 'POST',
      headers: hdrWrite(token),
      body: JSON.stringify({ name: trimmed, created_by: userId || null }),
    })
    if (!r.ok && r.status !== 409) {
      const j = await r.json().catch(() => ({}))
      console.warn('addMarcaDB falló:', j)
    }
  },

  async removeMarcaDB(name, token) {
    const safe = encodeURIComponent(name)
    const r = await fetch(`${SB_URL}/rest/v1/marcas?name=eq.${safe}`, {
      method: 'DELETE',
      headers: hdr(token),
    })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      throw new Error(j?.message || j?.error || `Error ${r.status} al eliminar marca`)
    }
  },

  async migrateMarcasFromLS(token, userId) {
    const FLAG = 'lc_marcas_migrated_v1'
    if (localStorage.getItem(FLAG)) return
    try {
      const custom = JSON.parse(localStorage.getItem('lc_custom_marcas') || '[]')
      if (Array.isArray(custom) && custom.length > 0) {
        for (const m of custom) {
          try {
            await this.addMarcaDB(m, token, userId)
          } catch {}
        }
      }
      localStorage.setItem(FLAG, '1')
    } catch (e) {
      console.warn('migrateMarcasFromLS error:', e)
    }
  },
}
