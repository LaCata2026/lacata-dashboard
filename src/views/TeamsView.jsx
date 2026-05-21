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
import {
  statusLabel,
  statusPill,
  statusColor,
  prioPill,
  fmtDate,
  fmtDateRelative,
  useSessionFilters,
} from '../lib/utils'
import TaskCard from './TaskCard'
function ModalPortal({ children }) {
  const el = useRef(document.createElement('div'))
  useEffect(() => {
    document.body.appendChild(el.current)
    return () => document.body.removeChild(el.current)
  }, [])
  return ReactDOM.createPortal(children, el.current)
}

// assignedOf — normaliza assigned_to a array (array | string | null → array)
const assignedOf = (t) =>
  Array.isArray(t.assigned_to) ? t.assigned_to : [t.assigned_to].filter(Boolean)

export default function TeamsView({
  tasks,
  users,
  teams,
  onBack,
  onViewUser,
  onOpenTask,
  me,
  token,
  onRefresh,
}) {
  const [selectedTeam, setSelectedTeam] = useState('all')
  const [openMembers, setOpenMembers] = useState({})
  const filteredTeams = selectedTeam === 'all' ? teams : teams.filter((t) => t.id === selectedTeam)
  const toggleMember = (id) => setOpenMembers((o) => ({ ...o, [id]: !o[id] }))

  // ── ALCANCE POR ROL ──
  // El colaborador NO debe ver las tareas de otras personas, ni siquiera
  // dentro de su propio equipo. Solo ve lo que se le asignó a él.
  // Director y cuentas ven todo (las tareas que ya les llegan filtradas
  // desde el Dashboard / scope de cuentas).
  const isCollab = me?.role === 'colaborador'

  // Las tareas que este usuario tiene permitido ver en esta vista.
  // - colaborador: solo donde está en assigned_to
  // - resto: todas las que recibió por props (ya scoped arriba)
  const scopedTasks = isCollab ? tasks.filter((t) => assignedOf(t).includes(me.id)) : tasks

  return (
    <div>
      {onBack && <BackBtn onClick={onBack} />}
      <div className="section-header">
        <h2 className="section-title">Equipos y carga de trabajo</h2>
      </div>
      <div className="filter-bar" style={{ marginBottom: 16 }}>
        <button
          className={`filter-chip${selectedTeam === 'all' ? ' active' : ''}`}
          onClick={() => setSelectedTeam('all')}
        >
          Todos
        </button>
        {teams.map((t) => {
          const tc = teamColor(t)
          return (
            <button
              key={t.id}
              className={`filter-chip${selectedTeam === t.id ? ' active' : ''}`}
              style={
                selectedTeam === t.id ? { background: tc, borderColor: tc, color: '#fff' } : {}
              }
              onClick={() => setSelectedTeam(t.id)}
            >
              <Icon n={t.icon || 'equipos'} size={16} /> {t.name}
            </button>
          )
        })}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))',
          gap: 16,
        }}
      >
        {filteredTeams.map((team) => {
          const members = users.filter(
            (u) =>
              (u.team_id === team.id ||
                (Array.isArray(u.team_ids) && u.team_ids.includes(team.id))) &&
              u.role === 'colaborador'
          )
          // Para el header del equipo: el colaborador solo cuenta SUS tareas
          // del equipo; director/cuentas ven el total del equipo.
          const teamTasks = scopedTasks.filter(
            (t) => t.team_id === team.id && t.status !== 'completada'
          )
          const overdueCount = scopedTasks.filter(
            (t) => t.team_id === team.id && t.status === 'vencida'
          ).length
          const overloaded = members.filter(
            (u) =>
              scopedTasks.filter((x) => assignedOf(x).includes(u.id) && x.status !== 'completada')
                .length >= 7
          ).length
          const avgLoad = members.length > 0 ? teamTasks.length / members.length : 0
          const health =
            overdueCount > 0 || overloaded > 0
              ? 'var(--s-vencida)'
              : avgLoad >= 4
                ? 'var(--load-warn)'
                : 'var(--load-ok)'

          // Para el colaborador: si no tiene tareas en este equipo, ocultamos
          // el desglose por miembros (no debe husmear cargas ajenas).
          const visibleMembers = isCollab ? members.filter((m) => m.id === me.id) : members

          return (
            <div key={team.id} className="card fade-in">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 20 }}>
                    <Icon
                      n={team.icon || 'equipos'}
                      size={18}
                      style={{ display: 'inline-block' }}
                    />
                  </span>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 700 }}>{team.name}</h3>
                    <p
                      style={{
                        fontSize: 11,
                        color: 'var(--muted)',
                        marginTop: 1,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {members.length} miembros · {teamTasks.length}{' '}
                      {isCollab ? 'mías activas' : 'activas'}
                    </p>
                  </div>
                </div>
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: health,
                    boxShadow: `0 0 8px ${health}66`,
                  }}
                />
              </div>
              {visibleMembers.length === 0 && (
                <p
                  style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: 20 }}
                >
                  {isCollab ? 'No tienes tareas en este equipo' : 'Sin miembros asignados'}
                </p>
              )}
              {visibleMembers.map((m) => {
                // Tareas del miembro — desde scopedTasks. Para el colaborador
                // m siempre es él mismo, así que solo ve sus propias tareas.
                const mTasks = scopedTasks.filter(
                  (t) => assignedOf(t).includes(m.id) && t.status !== 'completada'
                )
                const mOverdue = mTasks.filter((t) => t.status === 'vencida').length
                const pct = Math.min(100, Math.round((mTasks.length / 8) * 100))
                const loadColor =
                  mTasks.length >= 7
                    ? 'var(--s-vencida)'
                    : mTasks.length >= 4
                      ? 'var(--load-warn)'
                      : getUserColor(m, teams)
                const isOpen = !!openMembers[m.id]
                return (
                  <div
                    key={m.id}
                    style={{
                      marginBottom: 8,
                      background: 'var(--bg3)',
                      borderRadius: 8,
                      overflow: 'hidden',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div
                      onClick={() => toggleMember(m.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 12px',
                        cursor: 'pointer',
                        userSelect: 'none',
                        borderLeft: `3px solid ${getUserColor(m, teams)}`,
                        transition: '.13s',
                        background: isOpen ? 'var(--bg4)' : 'transparent',
                      }}
                    >
                      <span
                        style={{
                          color: 'var(--muted)',
                          fontSize: 11,
                          transition: 'transform .2s',
                          display: 'inline-block',
                          transform: isOpen ? 'rotate(0)' : 'rotate(-90deg)',
                          flexShrink: 0,
                        }}
                      >
                        ▼
                      </span>
                      {/* Avatar — click navega a Desempeño (solo director/cuentas) */}
                      <div
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!isCollab && onViewUser) onViewUser(m)
                        }}
                        style={{ cursor: !isCollab && onViewUser ? 'pointer' : 'default' }}
                        title={!isCollab ? 'Ver en Desempeño' : ''}
                      >
                        <Av u={m} size={28} teams={teams} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            flexWrap: 'wrap',
                          }}
                        >
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {m.name}
                          </span>
                          {mOverdue > 0 && (
                            <span
                              style={{
                                fontSize: 10,
                                padding: '1px 5px',
                                borderRadius: 3,
                                background: 'var(--s-vencida-bg)',
                                color: 'var(--s-vencida)',
                                fontWeight: 700,
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              <Icon n="alerta" size={9} />
                              {mOverdue}
                            </span>
                          )}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: loadColor,
                          fontFamily: 'var(--font-display)',
                          minWidth: 24,
                          textAlign: 'right',
                        }}
                      >
                        {mTasks.length}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          color: 'var(--muted)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {mTasks.length === 1 ? 'tarea' : 'tareas'}
                      </span>
                    </div>
                    <div style={{ height: 2, background: 'var(--bg2)', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: loadColor,
                          transition: 'width .6s cubic-bezier(.4,0,.2,1)',
                        }}
                      />
                    </div>
                    {isOpen && (
                      <div style={{ padding: '8px 10px', background: 'var(--bg3)' }}>
                        {mTasks.length === 0 ? (
                          <p
                            style={{
                              fontSize: 11,
                              color: 'var(--muted)',
                              padding: 6,
                              textAlign: 'center',
                            }}
                          >
                            Sin tareas activas 🎉
                          </p>
                        ) : (
                          mTasks.map((t) => (
                            <TaskCard
                              key={t.id}
                              task={t}
                              users={users}
                              teams={teams}
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
