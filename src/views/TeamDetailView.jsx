import { useState, useEffect, useRef, useCallback } from 'react'
import ReactDOM from 'react-dom'
import {
  sb,
  teamColor,
  getUserColor,
  COLLAB_COLORS,
  COLORS,
  MARCAS_PREDEFINIDAS,
  getInitials,
  autoColor,
} from '../lib/supabase'
import { showToast } from '../components/Toast'
import { showConfirm } from '../components/ConfirmDialog'
import Icon from '../components/Icon'
import { Av, SC, BackBtn, Linkify, ActiveTimer, StatusLegend } from '../components/Shared'
import TaskCard from './TaskCard'
import {
  statusLabel,
  statusPill,
  statusColor,
  prioPill,
  fmtDate,
  fmtDateRelative,
  useSessionFilters,
} from '../lib/utils'
function ModalPortal({ children }) {
  const el = useRef(document.createElement('div'))
  useEffect(() => {
    document.body.appendChild(el.current)
    return () => document.body.removeChild(el.current)
  }, [])
  return ReactDOM.createPortal(children, el.current)
}
export default function TeamDetailView({
  team,
  teamTasks,
  teamUsers,
  allUsers,
  allTeams,
  me,
  token,
  onRefresh,
  onBack,
}) {
  const [expanded, setExpanded] = useState({}) // userId -> boolean
  const [sfilt, setSfilt] = useState('activas') // "activas" | "todas"
  const isDir = me.role === 'director' || me.role === 'cuentas'

  const displayTasks =
    sfilt === 'todas' ? teamTasks : teamTasks.filter((t) => t.status !== 'completada')

  // Agrupar por miembro del equipo — iterar teamUsers, no tasks,
  // para que siempre aparezcan todos los integrantes aunque no tengan tareas
  const grouped = teamUsers.map((u) => ({
    userId: u.id,
    tasks: displayTasks.filter((t) => {
      const a = Array.isArray(t.assigned_to) ? t.assigned_to : [t.assigned_to].filter(Boolean)
      return a.includes(u.id)
    }),
  }))

  // Tareas del equipo sin responsable asignado
  const unassigned = displayTasks.filter(
    (t) =>
      !(Array.isArray(t.assigned_to) ? t.assigned_to : [t.assigned_to].filter(Boolean)).some(
        (id) => teamUsers.find((u) => u.id === id)
      )
  )

  const toggle = (id) => setExpanded((e) => ({ ...e, [id]: !e[id] }))

  return (
    <div>
      <BackBtn onClick={onBack} label="← Equipos" />
      <div className="section-header">
        <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: teamColor(team),
              boxShadow: `0 0 8px ${teamColor(team)}66`,
              display: 'inline-block',
            }}
          />
          {<Icon n={team.icon || 'equipos'} size={18} style={{ display: 'inline-block' }} />}{' '}
          {team.name}
        </h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {teamUsers.length} integrante{teamUsers.length !== 1 ? 's' : ''} ·{' '}
            {teamTasks.filter((t) => t.status !== 'completada').length} activas
          </span>
          <div
            style={{
              display: 'flex',
              gap: 3,
              background: 'var(--bg3)',
              borderRadius: 7,
              padding: 3,
            }}
          >
            {[
              { v: 'activas', l: 'Activas' },
              { v: 'todas', l: 'Todas' },
            ].map((o) => (
              <button
                key={o.v}
                onClick={() => setSfilt(o.v)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 5,
                  fontSize: 11,
                  cursor: 'pointer',
                  border: 'none',
                  fontFamily: 'inherit',
                  background: sfilt === o.v ? 'var(--bg2)' : 'transparent',
                  color: sfilt === o.v ? 'var(--text)' : 'var(--muted)',
                  fontWeight: sfilt === o.v ? 600 : 400,
                }}
              >
                {o.l}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              const allExp = {}
              teamUsers.forEach((u) => { allExp[u.id] = true })
              setExpanded(allExp)
            }}
            style={{
              fontSize: 11,
              color: 'var(--muted)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Expandir todo
          </button>
          <button
            onClick={() => setExpanded({})}
            style={{
              fontSize: 11,
              color: 'var(--muted)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Colapsar
          </button>
        </div>
      </div>

      {teamUsers.length === 0 ? (
        <div className="empty">
          <div style={{ opacity: 0.3, marginBottom: 8 }}>
            <Icon n="equipos" size={40} color="currentColor" />
          </div>
          <p>Este equipo no tiene integrantes aún.</p>
        </div>
      ) : (
        <>
          {grouped.map(({ userId, tasks: uTasks }) => {
            const u = allUsers.find((x) => x.id === userId)
            if (!u) return null
            const isOpen = expanded[userId] !== false // default open
            const urgentes = uTasks.filter(
              (t) => t.status === 'vencida' || t.priority === 'Urgente'
            ).length
            const loadColor =
              uTasks.length >= 7
                ? 'var(--s-vencida)'
                : uTasks.length >= 4
                  ? 'var(--load-warn)'
                  : getUserColor(u, allTeams)
            return (
              <div
                key={userId}
                style={{
                  marginBottom: 6,
                  background: 'var(--bg2)',
                  borderRadius: 10,
                  border: `1px solid var(--border)`,
                  overflow: 'hidden',
                }}
              >
                {/* Collaborator header — always visible, click to toggle */}
                <div
                  onClick={() => toggle(userId)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 16px',
                    cursor: 'pointer',
                    borderLeft: `4px solid ${getUserColor(u, allTeams)}`,
                    transition: '.13s',
                    background: isOpen ? 'var(--bg3)' : 'var(--bg2)',
                  }}
                >
                  <Av u={u} size={30} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{u.name}</span>
                      {urgentes > 0 && (
                        <span
                          style={{
                            fontSize: 10,
                            padding: '1px 6px',
                            borderRadius: 3,
                            background: 'var(--s-vencida-bg)',
                            color: 'var(--s-vencida)',
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          <Icon n="alerta" size={9} /> {urgentes} urgente{urgentes > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Task status mini-summary */}
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    {[
                      { s: 'en_progreso', c: 'var(--s-progreso)' },
                      { s: 'en_revision', c: 'var(--s-revision)' },
                      { s: 'pendiente', c: 'var(--s-pendiente)' },
                      { s: 'vencida', c: 'var(--s-vencida)' },
                    ].map(({ s, c }) => {
                      const n = uTasks.filter((t) => t.status === s).length
                      return n > 0 ? (
                        <span
                          key={s}
                          style={{
                            fontSize: 10,
                            padding: '2px 6px',
                            borderRadius: 3,
                            background: c + '1a',
                            color: c,
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {n}
                        </span>
                      ) : null
                    })}
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 800,
                        color: loadColor,
                        minWidth: 22,
                        textAlign: 'right',
                        fontFamily: 'var(--font-display)',
                        marginLeft: 4,
                      }}
                    >
                      {uTasks.length}
                    </span>
                  </div>
                  <span
                    style={{
                      color: 'var(--muted)',
                      fontSize: 14,
                      marginLeft: 4,
                      transition: 'transform .2s',
                      display: 'inline-block',
                      transform: isOpen ? 'rotate(0)' : 'rotate(-90deg)',
                    }}
                  >
                    ▼
                  </span>
                </div>
                {/* Collapsible task list */}
                {isOpen && (
                  <div style={{ padding: '6px 12px 12px' }}>
                    {uTasks.length === 0 ? (
                      <p style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 4px', fontStyle: 'italic' }}>
                        Sin órdenes {sfilt === 'activas' ? 'activas' : 'asignadas'}.
                      </p>
                    ) : (
                      uTasks.map((t) => (
                        <TaskCard
                          key={t.id}
                          task={t}
                          users={allUsers}
                          teams={allTeams}
                          me={me}
                          token={token}
                          onRefresh={onRefresh}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {unassigned.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <p
                style={{
                  fontSize: 11,
                  color: 'var(--muted)',
                  marginBottom: 6,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                Sin responsable asignado
              </p>
              {unassigned.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  users={allUsers}
                  teams={allTeams}
                  me={me}
                  token={token}
                  onRefresh={onRefresh}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ── DASHBOARD ── */
