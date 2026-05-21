import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { sb, teamColor } from '../lib/supabase'
import { Realtime } from '../lib/realtime'
import { NAV } from '../lib/utils'
import { useNotifications } from '../lib/notifications'
import Icon from './Icon'
import { Av } from './Shared'
import Spotlight from './Spotlight'
import TaskCard from '../views/TaskCard'
import HomeView from '../views/HomeView'
import OrdenesView from '../views/OrdenesView'
import CreateTask from '../views/CreateTask'
import CalendarView from '../views/CalendarView'
import IntelView from '../views/IntelView'
import AdminView from '../views/AdminView'
import BottomNav from './BottomNav'
import DiagnosticPanel from './DiagnosticPanel'
import ReporteExcel from '../views/ReporteExcel'
import TeamDetailView from '../views/TeamDetailView'

function TeamsOverview({ teams, users, tasks, onSelect }) {
  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">Equipos</h2>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))',
          gap: 10,
        }}
      >
        {teams.map((team) => {
          const members = users.filter(
            (u) =>
              u.activo !== false &&
              (u.team_id === team.id ||
                (Array.isArray(u.team_ids) && u.team_ids.includes(team.id)))
          )
          const active = tasks.filter(
            (t) => t.team_id === team.id && t.status !== 'completada'
          ).length
          const color = teamColor(team)
          return (
            <button
              key={team.id}
              onClick={() => onSelect(team.id)}
              style={{
                background: 'var(--bg2)',
                border: `1px solid var(--border)`,
                borderLeft: `4px solid ${color}`,
                borderRadius: 10,
                padding: '14px 16px',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'background .13s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg3)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg2)')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: 14,
                    fontFamily: 'var(--font-display)',
                    color: 'var(--text)',
                  }}
                >
                  {team.name}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--muted)' }}>
                <span>{members.length} integrante{members.length !== 1 ? 's' : ''}</span>
                <span style={{ color: active > 0 ? 'var(--s-progreso)' : 'var(--muted)' }}>
                  {active} activa{active !== 1 ? 's' : ''}
                </span>
              </div>
            </button>
          )
        })}
        {teams.length === 0 && (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>No hay equipos registrados.</p>
        )}
      </div>
    </div>
  )
}

export default function Dashboard({ session, isDark, toggleTheme, onLogout }) {
  const { token } = session
  const profile = useMemo(
    () => ({
      id: session.profile?.id || '',
      name: session.profile?.name || 'Usuario',
      email: session.profile?.email || '',
      role: session.profile?.role || 'colaborador',
      initials:
        session.profile?.initials ||
        (session.profile?.name || 'U')
          .split(' ')
          .map((w) => w[0])
          .join('')
          .slice(0, 2)
          .toUpperCase(),
      avatar_color: session.profile?.avatar_color || '#7c3aed',
      team_id: session.profile?.team_id || null,
      team_ids: Array.isArray(session.profile?.team_ids) ? session.profile.team_ids : [],
    }),
    [session.profile]
  )

  // ── Inicializar página desde hash de URL (soporta recargar/compartir link) ──
  const [page, setPage] = useState(() => {
    const hash = window.location.hash.replace('#', '')
    if (!hash || hash.includes('access_token') || hash.includes('type=')) return 'home'
    const [hashPage] = hash.split('/')
    const valid = ['home', 'ordenes', 'crear', 'equipos', 'calendario', 'desempeno', 'admin', 'perfil']
    return valid.includes(hashPage) ? hashPage : 'home'
  })
  const [pageArg, setPageArg] = useState(() => {
    const hash = window.location.hash.replace('#', '')
    if (!hash || hash.includes('access_token') || hash.includes('type=')) return null
    const parts = hash.split('/')
    return parts[1] || null // string ID; se resuelve a objeto cuando carguen los datos
  })
  const [activeTeamId, setActiveTeamId] = useState(null)
  const [pageTransitioning, setPageTransitioning] = useState(false)
  const [tasks, setTasks] = useState([])
  const [users, setUsers] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [spotlight, setSpotlight] = useState(false)
  const [floatTaskId, setFloatTaskId] = useState(null)
  // NUEVO: cuando se abre una tarea, en qué tab debe abrir (detalles | conversacion)
  const [floatTaskTab, setFloatTaskTab] = useState('detalles')
  const [showNotif, setShowNotif] = useState(false)
  const [showDiag, setShowDiag] = useState(false)
  const [showReporte, setShowReporte] = useState(false)
  const [dense, setDense] = useState(() => localStorage.getItem('lc_dense') === '1')
  const [rtOk, setRtOk] = useState(true)
  const [loadError, setLoadError] = useState(false)

  // Ref siempre actualizado de users — usado en el handler popstate sin clausura stale
  const usersRef = useRef([])
  useEffect(() => { usersRef.current = users }, [users])

  const { unread, markAllSeen, markSeen } = useNotifications(tasks, profile)

  const load = useCallback(async () => {
    try {
      const cutoff = new Date(Date.now() - 60 * 24 * 3600000).toISOString()
      const taskQuery =
        'select=*&order=created_at.desc&or=(status.neq.completada,created_at.gte.' + cutoff + ')'
      const [t, u, tm] = await Promise.all([
        sb.get('tareas', taskQuery, token),
        sb.get('usuarios', 'select=*&order=name.asc', token),
        sb.get('equipos', 'select=*&order=name.asc', token),
      ])
      if (!Array.isArray(t) || t[0]?.code === 'PGRST301') throw new Error('SESSION_EXPIRED')
      setTasks(t)
      setUsers(u)
      setTeams(tm)
      setLoadError(false)
    } catch (e) {
      if (e.message === 'SESSION_EXPIRED') onLogout()
      else setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [token])

  // Llama al Edge Function una sola vez por sesión al iniciar
  const markedThisSession = useRef(false)
  useEffect(() => {
    if (markedThisSession.current || !token) return
    markedThisSession.current = true
    fetch(`${import.meta.env.VITE_SB_URL}/functions/v1/auto-mark-vencidas`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SB_ANON },
    })
      .then((r) => r.json())
      .then((d) => { if (d.marked || d.reverted) load() })
      .catch(() => {})
  }, [token, load])

  const loadHistory = useCallback(async () => {
    try {
      const all = await sb.get('tareas', 'select=*&order=created_at.desc', token)
      if (Array.isArray(all)) setTasks(all)
    } catch (e) {
      console.warn('loadHistory:', e)
    }
  }, [token])

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    document.body.classList.toggle('dense', dense)
    localStorage.setItem('lc_dense', dense ? '1' : '0')
  }, [dense])

  const reloadTimer = useRef(null)
  useEffect(() => {
    function schedule() {
      clearTimeout(reloadTimer.current)
      reloadTimer.current = setTimeout(() => {
        // No recargar si el usuario tiene la tab en segundo plano
        if (document.visibilityState !== 'hidden') load()
      }, 2000)
    }
    const unsubs = ['tareas', 'usuarios', 'equipos'].map((table) =>
      Realtime.subscribe(table, () => {
        schedule()
      })
    )
    function onVisible() {
      if (document.visibilityState === 'visible') {
        Realtime.connect(token)
        load()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    const rtCheck = setInterval(() => setRtOk(window._realtimeConnected !== false), 5000)
    return () => {
      clearTimeout(reloadTimer.current)
      unsubs.forEach((u) => u())
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(rtCheck)
    }
  }, [load, token])

  // window._openTask AHORA acepta segundo parámetro initialTab
  // - openTask(task) → abre en tab "detalles" (default)
  // - openTask(task, "conversacion") → abre directo en el tab de comentarios
  useEffect(() => {
    window._openTask = (t, initialTab) => {
      setFloatTaskId(t?.id || null)
      setFloatTaskTab(initialTab === 'conversacion' ? 'conversacion' : 'detalles')
    }
    return () => {
      delete window._openTask
    }
  }, [])

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSpotlight((s) => !s)
      }
      if (e.key === 'Escape') {
        setSpotlight(false)
        setShowNotif(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Click outside cierra el popup de menciones
  const notifPopupRef = useRef(null)
  const notifBtnRef = useRef(null)
  useEffect(() => {
    if (!showNotif) return
    function onClickOutside(e) {
      if (
        notifPopupRef.current &&
        !notifPopupRef.current.contains(e.target) &&
        notifBtnRef.current &&
        !notifBtnRef.current.contains(e.target)
      ) {
        setShowNotif(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [showNotif])

  const navigate = useCallback((id, arg = null) => {
    setPageTransitioning(true)
    setTimeout(() => setPageTransitioning(false), 320)

    let newPage = id
    let newPageArg = arg
    let newActiveTeamId = null

    if (id && id.startsWith('equipo_')) {
      newPage = 'equipos'
      newPageArg = id.replace('equipo_', '')
    } else if (arg && typeof arg === 'object' && arg.teamId) {
      newPage = id
      newActiveTeamId = arg.teamId
      newPageArg = null
    }

    setPage(newPage)
    setPageArg(newPageArg)
    setActiveTeamId(newActiveTeamId)
    setSidebarOpen(false)

    // ── Empujar al historial del browser ──
    const argId =
      newPageArg && typeof newPageArg === 'object'
        ? newPageArg.id
        : newPageArg || null
    const argType = newPageArg && typeof newPageArg === 'object' ? 'user' : null
    const hashPart = newPage + (argId ? '/' + argId : '')
    window.history.pushState({ page: newPage, argId, argType }, '', '#' + hashPart)
  }, [])

  // ── Restaurar página al usar Atrás / Adelante del browser ──
  useEffect(() => {
    // Decorar la entrada inicial del historial para que popstate pueda restaurarla
    if (!window.history.state?.page) {
      const argId = pageArg && typeof pageArg === 'object' ? pageArg.id : (pageArg || null)
      const argType = pageArg && typeof pageArg === 'object' ? 'user' : null
      window.history.replaceState({ page, argId, argType }, '', window.location.hash || '#home')
    }

    function onPopState(e) {
      if (!e.state?.page) return
      const { page: p, argId, argType } = e.state
      let restoredArg = argId || null
      if (argType === 'user' && argId) {
        restoredArg = usersRef.current.find((u) => u.id === argId) || null
      }
      setPage(p)
      setPageArg(restoredArg)
      setActiveTeamId(null)
      setSidebarOpen(false)
      setPageTransitioning(true)
      setTimeout(() => setPageTransitioning(false), 320)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps — usersRef es ref, no necesita dep

  // ── Resolver pageArg de string-ID a objeto usuario (carga inicial desde hash) ──
  useEffect(() => {
    if (page === 'desempeno' && typeof pageArg === 'string' && users.length > 0) {
      const user = users.find((u) => u.id === pageArg)
      if (user) setPageArg(user)
    }
  }, [users, page, pageArg])

  useEffect(() => {
    if (page !== 'ordenes' && activeTeamId) setActiveTeamId(null)
  }, [page, activeTeamId])

  const floatTask = useMemo(
    () => (floatTaskId ? tasks.find((t) => t.id === floatTaskId) || null : null),
    [floatTaskId, tasks]
  )
  const navItems = NAV.filter((n) => n.roles.includes(profile.role))
  const isCuentas = profile.role === 'cuentas'
  const isCollab = profile.role === 'colaborador'

  const myScopedTeamIds = useMemo(
    () =>
      isCuentas || isCollab
        ? Array.isArray(profile.team_ids) && profile.team_ids.length > 0
          ? profile.team_ids
          : [profile.team_id].filter(Boolean)
        : null,
    [isCuentas, isCollab, profile.team_ids, profile.team_id]
  )
  const visibleTeams = useMemo(
    () =>
      (isCuentas || isCollab) && myScopedTeamIds
        ? teams.filter((t) => myScopedTeamIds.includes(t.id))
        : teams,
    [isCuentas, isCollab, myScopedTeamIds, teams]
  )

  // Tasks filtradas según el rol — usadas en Spotlight y vistas para evitar que
  // colaboradores vean órdenes que no les corresponden
  const scopedTasksForRole = useMemo(() => {
    if (profile.role === 'director') return tasks
    if (profile.role === 'cuentas' && myScopedTeamIds)
      return tasks.filter((t) => myScopedTeamIds.includes(t.team_id))
    // colaborador: solo órdenes de su equipo o asignadas a él
    return tasks.filter((t) => {
      const a = Array.isArray(t.assigned_to) ? t.assigned_to : [t.assigned_to].filter(Boolean)
      return a.includes(profile.id) || (profile.team_id && t.team_id === profile.team_id)
    })
  }, [tasks, profile, myScopedTeamIds])
  const onViewUser = useCallback(
    (u) => {
      navigate('desempeno', u)
    },
    [navigate]
  )
  // onOpenTask para usar dentro del dashboard (no via window._openTask) — también acepta tab
  const onOpenTask = useCallback((t, initialTab) => {
    setFloatTaskId(t?.id || null)
    setFloatTaskTab(initialTab === 'conversacion' ? 'conversacion' : 'detalles')
  }, [])

  const shared = useMemo(
    () => ({
      tasks,
      users,
      teams,
      token,
      profile,
      me: profile,
      onReload: load,
      onRefresh: load,
      onNavigate: navigate,
      onViewUser,
      onOpenTask,
    }),
    [tasks, users, teams, token, profile, load, navigate, onViewUser, onOpenTask]
  )

  const views = {
    home: <HomeView {...shared} />,
    ordenes: (
      <OrdenesView
        {...shared}
        initialFilter={pageArg}
        initialTeam={activeTeamId}
        onClearTeamFilter={() => setActiveTeamId(null)}
      />
    ),
    crear: (
      <CreateTask
        {...shared}
        onCreated={() => navigate('ordenes')}
        onBack={() => navigate('ordenes')}
      />
    ),
    equipos: (() => {
      const team = teams.find((t) => t.id === pageArg)
      if (!team) {
        return (
          <TeamsOverview
            teams={teams}
            users={users}
            tasks={tasks}
            onSelect={(id) => navigate('equipo_' + id)}
          />
        )
      }
      const teamTasks = tasks.filter((t) => t.team_id === team.id)
      const teamUsers = users.filter(
        (u) =>
          u.activo !== false &&
          (u.team_id === team.id ||
            (Array.isArray(u.team_ids) && u.team_ids.includes(team.id)))
      )
      return (
        <TeamDetailView
          team={team}
          teamTasks={teamTasks}
          teamUsers={teamUsers}
          allUsers={users}
          allTeams={teams}
          me={profile}
          token={token}
          onRefresh={load}
          onBack={() => navigate('equipos')}
        />
      )
    })(),
    calendario: <CalendarView {...shared} />,
    desempeno: (
      <IntelView
        {...shared}
        me={profile}
        profile={profile}
        token={token}
        onRefresh={load}
        onLoadHistory={loadHistory}
        initialUser={pageArg}
        onNavigate={navigate}
      />
    ),
    admin: <AdminView {...shared} />,
    perfil: (
      <div style={{ padding: 20 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 24,
            padding: 16,
            background: 'var(--bg2)',
            borderRadius: 12,
            border: '1px solid var(--border)',
          }}
        >
          <Av u={profile} size={48} teams={teams} />
          <div>
            <p style={{ fontSize: 16, fontWeight: 700 }}>{profile.name}</p>
            <p style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'capitalize' }}>
              {profile.role}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={toggleTheme}
            className="btn btn-ghost"
            style={{ justifyContent: 'flex-start', gap: 10 }}
          >
            {isDark ? '☀ Modo claro' : '☾ Modo oscuro'}
          </button>
          <button
            onClick={() => setShowNotif((s) => !s)}
            className="btn btn-ghost"
            style={{ justifyContent: 'flex-start', gap: 10, position: 'relative' }}
          >
            💬 Menciones
            {unread.length > 0 && (
              <span
                style={{
                  marginLeft: 'auto',
                  background: 'var(--s-vencida)',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  borderRadius: 10,
                  padding: '1px 7px',
                }}
              >
                {unread.length}
              </span>
            )}
          </button>
          {(profile.role === 'director' || profile.role === 'cuentas') && (
            <button
              onClick={() => navigate('admin')}
              className="btn btn-ghost"
              style={{ justifyContent: 'flex-start', gap: 10 }}
            >
              ⚙ Administración
            </button>
          )}
          <button
            onClick={onLogout}
            className="btn btn-danger"
            style={{ justifyContent: 'flex-start', gap: 10, marginTop: 8 }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    ),
  }

  const SidebarBtn = ({ onClick, title, active, children, btnRef }) => (
    <button
      ref={btnRef}
      onClick={onClick}
      title={title}
      style={{
        background: active ? 'var(--accent-dim)' : 'none',
        border: 'none',
        cursor: 'pointer',
        color: active ? 'var(--accent)' : 'var(--muted2)',
        padding: '5px 6px',
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: '.13s',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--bg3)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'none'
      }}
    >
      {children}
    </button>
  )

  return (
    <div className="app-shell">
      <div
        className={`mobile-overlay${sidebarOpen ? ' open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-inner">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 24,
              paddingBottom: 16,
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div className="logo-mark" style={{ background: '#0d0d0d', padding: 2 }}>
              <img
                src="/logo_cata.png"
                alt="La Cata"
                style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 6 }}
              />
            </div>
            <div>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 15,
                  fontFamily: 'var(--font-display)',
                  letterSpacing: '-.02em',
                }}
              >
                La Cata
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--muted)',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  letterSpacing: '.08em',
                }}
              >
                Creative Ops
              </div>
            </div>
          </div>

          <button
            onClick={() => setSpotlight(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '7px 10px',
              color: 'var(--muted)',
              fontSize: 12,
              cursor: 'pointer',
              marginBottom: 16,
              fontFamily: 'var(--font-body)',
              transition: '.13s',
            }}
          >
            <Icon n="buscar" size={13} />
            <span style={{ flex: 1, textAlign: 'left' }}>Buscar...</span>
            <span
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                background: 'var(--bg4)',
                padding: '2px 5px',
                borderRadius: 4,
              }}
            >
              K
            </span>
          </button>

          <nav>
            {['trabajo', 'admin'].map((section) => {
              const items = navItems.filter((n) => n.section === section)
              if (!items.length) return null
              return (
                <div key={section}>
                  {section === 'admin' && <div className="nav-section">Admin</div>}
                  {items.map((n) => (
                    <button
                      key={n.id}
                      className={`nav-item${page === n.id && !activeTeamId ? ' active' : ''}`}
                      onClick={() => navigate(n.id)}
                    >
                      <Icon n={n.icon} size={15} />
                      {n.label}
                    </button>
                  ))}
                </div>
              )
            })}
            {visibleTeams.length > 0 && (
              <div>
                <div className="nav-section">Equipos</div>
                {visibleTeams.map((t) => {
                  const isActive = page === 'equipos' && pageArg === t.id
                  return (
                    <button
                      key={t.id}
                      onClick={() => navigate('equipo_' + t.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '5px 10px',
                        fontSize: 12,
                        color: isActive ? 'var(--text)' : 'var(--muted2)',
                        fontWeight: isActive ? 700 : 400,
                        background: isActive ? 'var(--bg3)' : 'transparent',
                        border: isActive
                          ? `1px solid ${t.color || '#e8c547'}55`
                          : '1px solid transparent',
                        cursor: 'pointer',
                        width: '100%',
                        borderRadius: 6,
                        transition: '.13s',
                        fontFamily: 'inherit',
                        textAlign: 'left',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.background = 'var(--bg3)'
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: t.color || 'var(--accent)',
                          flexShrink: 0,
                          display: 'inline-block',
                          boxShadow: isActive ? `0 0 6px ${t.color || '#e8c547'}99` : 'none',
                        }}
                      />
                      <span
                        style={{
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {t.name}
                      </span>
                      {isActive && (
                        <span
                          style={{
                            fontSize: 9,
                            color: 'var(--accent)',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                          }}
                        >
                          ●
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
            {profile.role === 'director' && (
              <div style={{ marginTop: 8 }}>
                <div className="nav-section">Reportes</div>
                <button className="nav-item" onClick={() => setShowReporte(true)}>
                  <Icon n="exportar" size={15} />
                  Reporte Excel
                </button>
              </div>
            )}
          </nav>

          <div
            style={{
              borderTop: '1px solid var(--border)',
              paddingTop: 12,
              marginTop: 8,
              position: 'relative',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '4px 4px 10px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <Av u={profile} size={32} teams={teams} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {profile.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--muted)',
                      textTransform: 'capitalize',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {profile.role}
                  </span>
                  {!rtOk && <span className="realtime-badge">sin conexión</span>}
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: 8,
                paddingBottom: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <SidebarBtn
                  onClick={() => setDense((d) => !d)}
                  title={dense ? 'Vista normal' : 'Vista densa'}
                  active={dense}
                >
                  <Icon n="lista" size={15} />
                </SidebarBtn>
                <SidebarBtn onClick={toggleTheme} title={isDark ? 'Modo claro' : 'Modo oscuro'}>
                  <Icon n={isDark ? 'sol' : 'luna'} size={15} />
                </SidebarBtn>
                {profile.role === 'director' && (
                  <SidebarBtn onClick={() => setShowDiag(true)} title="Diagnóstico del sistema">
                    <Icon n="semaforo" size={15} />
                  </SidebarBtn>
                )}
              </div>

              <SidebarBtn
                btnRef={notifBtnRef}
                onClick={() => setShowNotif((s) => !s)}
                title="Menciones"
                active={showNotif || unread.length > 0}
              >
                <Icon n="comentar" size={15} />
                {unread.length > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      background: 'var(--s-vencida)',
                      color: '#fff',
                      fontSize: 9,
                      fontWeight: 700,
                      borderRadius: '50%',
                      width: 13,
                      height: 13,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1,
                    }}
                  >
                    {unread.length > 9 ? '9+' : unread.length}
                  </span>
                )}
              </SidebarBtn>
            </div>

            {/* Popup de menciones anclado al sidebar */}
            {showNotif && (
              <div
                ref={notifPopupRef}
                className="fade-in"
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 6px)',
                  left: 0,
                  right: 0,
                  background: 'var(--bg2)',
                  border: '1px solid var(--border2)',
                  borderRadius: 10,
                  padding: 8,
                  boxShadow: '0 8px 32px rgba(0,0,0,.4)',
                  zIndex: 500,
                  maxHeight: '60vh',
                  overflowY: 'auto',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                    paddingBottom: 8,
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700 }}>
                    Menciones{' '}
                    {unread.length > 0 && (
                      <span
                        style={{
                          color: 'var(--muted)',
                          fontWeight: 400,
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        ({unread.length})
                      </span>
                    )}
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {unread.length > 0 && (
                      <button
                        onClick={markAllSeen}
                        style={{
                          fontSize: 11,
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--muted)',
                          padding: '2px 6px',
                          borderRadius: 4,
                        }}
                      >
                        Marcar leídas
                      </button>
                    )}
                    <button
                      onClick={() => setShowNotif(false)}
                      style={{
                        fontSize: 14,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--muted)',
                        padding: '0 4px',
                        lineHeight: 1,
                      }}
                      title="Cerrar"
                    >
                      ×
                    </button>
                  </div>
                </div>
                {unread.length === 0 ? (
                  <p
                    style={{
                      fontSize: 12,
                      color: 'var(--muted)',
                      textAlign: 'center',
                      padding: '16px 0',
                    }}
                  >
                    Sin menciones nuevas
                  </p>
                ) : (
                  unread.slice(0, 8).map((n) => (
                    <div
                      key={n.key}
                      onClick={() => {
                        markSeen(n.key)
                        setShowNotif(false)
                        // Abrir DIRECTO en el tab de conversación
                        setFloatTaskId(n.task.id)
                        setFloatTaskTab('conversacion')
                      }}
                      style={{
                        display: 'flex',
                        gap: 8,
                        padding: '8px 6px',
                        borderRadius: 7,
                        cursor: 'pointer',
                        transition: '.13s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg3)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ fontSize: 16, flexShrink: 0 }}>💬</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {n.task.title}
                        </p>
                        <p
                          style={{
                            fontSize: 11,
                            color: 'var(--muted)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {n.comment.user_name}: {n.comment.text.slice(0, 60)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                {unread.length > 8 && (
                  <p
                    style={{
                      fontSize: 10,
                      color: 'var(--muted)',
                      textAlign: 'center',
                      marginTop: 8,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    +{unread.length - 8} más
                  </p>
                )}
              </div>
            )}

            <button
              className="btn btn-ghost btn-sm"
              style={{ width: '100%', fontSize: 11, marginTop: 4 }}
              onClick={onLogout}
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <div className="mobile-topbar">
          <button
            className="hamburger"
            onClick={() => setSidebarOpen(true)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text)',
              fontSize: 20,
              padding: 6,
              lineHeight: 1,
            }}
          >
            ☰
          </button>
          <div style={{ fontWeight: 800, fontSize: 15, fontFamily: 'var(--font-display)' }}>
            La Cata
          </div>
        </div>
        {pageTransitioning && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              zIndex: 9999,
              background: 'var(--accent)',
              animation: 'navProgress .32s ease-out forwards',
            }}
          />
        )}
        <div className="page-content">
          {(() => {
            const labels = {
              home: 'Inicio',
              ordenes: 'Órdenes',
              crear: 'Nueva orden',
              equipos: 'Equipos',
              calendario: 'Calendario',
              desempeno: 'Desempeño',
              admin: 'Administración',
              perfil: 'Perfil',
            }
            const pageLabel = labels[page] || 'Inicio'
            const teamName = page === 'equipos' && pageArg
              ? teams.find((t) => t.id === pageArg)?.name
              : null
            const userCrumb = page === 'desempeno' && pageArg && typeof pageArg === 'object'
              ? pageArg.name
              : null
            const crumbBtnStyle = {
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--muted)', fontFamily: 'inherit', fontSize: 'inherit', padding: 0,
            }
            return (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  color: 'var(--muted)',
                  marginBottom: 12,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {teamName ? (
                  <>
                    <button
                      onClick={() => navigate('equipos')}
                      style={crumbBtnStyle}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted)')}
                    >
                      Equipos
                    </button>
                    <span>›</span>
                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>{teamName}</span>
                  </>
                ) : userCrumb ? (
                  <>
                    <button
                      onClick={() => navigate('desempeno')}
                      style={crumbBtnStyle}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted)')}
                    >
                      Reportes
                    </button>
                    <span>›</span>
                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>{userCrumb}</span>
                  </>
                ) : (
                  <span style={{ color: 'var(--muted2)' }}>{pageLabel}</span>
                )}
              </div>
            )
          })()}
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              <div
                className="skeleton skeleton-title"
                style={{ width: 200, margin: '0 auto 12px' }}
              />
              <div className="skeleton skeleton-text" style={{ width: 300, margin: '0 auto' }} />
            </div>
          ) : loadError ? (
            <div
              style={{
                padding: 48,
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <span style={{ fontSize: 32, opacity: 0.4 }}>⚠️</span>
              <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.5 }}>
                No se pudieron cargar los datos.
                <br />
                Verifica tu conexión e inténtalo de nuevo.
              </p>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setLoadError(false)
                  setLoading(true)
                  load()
                }}
              >
                Reintentar
              </button>
            </div>
          ) : (
            <div key={page + (activeTeamId || '')} className="page-enter">
              {views[page] || views.home}
            </div>
          )}
        </div>
      </main>

      {showDiag && (
        <DiagnosticPanel
          session={session}
          tasks={tasks}
          users={users}
          teams={teams}
          onClose={() => setShowDiag(false)}
        />
      )}
      {showReporte && (
        <ReporteExcel
          tasks={tasks}
          users={users}
          teams={teams}
          isOpen={showReporte}
          onClose={() => setShowReporte(false)}
        />
      )}
      {spotlight && (
        <Spotlight
          tasks={scopedTasksForRole}
          users={users}
          teams={teams}
          onNavigate={navigate}
          onClose={() => setSpotlight(false)}
          onOpenTask={onOpenTask}
        />
      )}
      {/* initialTab le dice al TaskCard si abrir en detalles o conversacion */}
      {floatTask && (
        <TaskCard
          key={floatTaskId}
          task={floatTask}
          users={users}
          teams={teams}
          me={profile}
          token={token}
          onRefresh={load}
          forceOpen={true}
          initialTab={floatTaskTab}
          onForceClose={() => {
            setFloatTaskId(null)
            setFloatTaskTab('detalles')
          }}
        />
      )}
      <div className="mobile-bottom-nav" style={{ display: sidebarOpen ? 'none' : undefined }}>
        <BottomNav
          page={page}
          navigate={navigate}
          profile={profile}
          isDark={isDark}
          toggleTheme={toggleTheme}
          onLogout={onLogout}
          unread={unread.length}
          onNotif={() => setShowNotif((s) => !s)}
          onReporte={() => setShowReporte(true)}
          onEquipos={() =>
            visibleTeams.length === 1
              ? navigate('equipo_' + visibleTeams[0].id)
              : navigate('equipos')
          }
        />
      </div>
    </div>
  )
}
