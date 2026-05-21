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

/* ── EXCEL EXPORT ── */
function exportExcel(tasks, users, teams) {
  try {
    const statusMap = {
      pendiente: 'Pendiente',
      en_progreso: 'En progreso',
      en_pausa: 'En pausa',
      en_revision: 'En revisión',
      completada: 'Completada',
      vencida: 'Vencida',
    }

    // Build rows
    const header = [
      'No. Orden',
      'Proyecto',
      'Responsable',
      'Marca',
      'Equipo',
      'Estado',
      'Prioridad',
      'Hrs Est.',
      'Hrs Reales',
      'Fecha Límite',
      'Cambios',
    ]
    const rows = tasks.map((t) => {
      const assigned = Array.isArray(t.assigned_to)
        ? t.assigned_to
        : [t.assigned_to].filter(Boolean)
      const names = assigned.map((id) => users.find((u) => u.id === id)?.name || '?').join(', ')
      const team = teams.find((x) => x.id === t.team_id)
      const orderNum = t.order_number ? 'AC-' + String(t.order_number).padStart(4, '0') : '-'
      return [
        orderNum,
        t.title || '',
        names || 'Sin asignar',
        t.marca || '—',
        team?.name || 'Sin equipo',
        statusMap[t.status] || t.status || '',
        t.priority || 'Normal',
        Number(t.hours) || 0,
        Number(t.hours_real) || 0,
        t.due_date || '',
        t.changes || 0,
      ]
    })

    // Build CSV with BOM for Excel UTF-8
    const escape = (v) => `"${String(v).replace(/"/g, '""')}"`
    const lines = [header, ...rows].map((r) => r.map(escape).join(','))
    const csvContent = '\uFEFF' + lines.join('\r\n')

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'LaCata_Reporte_' + new Date().toISOString().split('T')[0] + '.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    showToast('Excel descargado correctamente', 'success')
  } catch (err) {
    console.error('exportExcel error:', err)
    showToast('Error al exportar: ' + err.message, 'error')
  }
}

export default function PerformanceView({ tasks, users, teams, onBack }) {
  const [viewMode, setViewMode] = useState('individual')
  const [selectedUser, setSelectedUser] = useState(null)
  useEffect(() => {
    window._perfSelectUser = setSelectedUser
    return () => {
      window._perfSelectUser = null
    }
  }, [])
  const colabs = users.filter((u) => u.role === 'colaborador')
  const sorted = [...colabs].sort((a, b) => {
    const at = tasks.filter((t) => {
      const x = Array.isArray(t.assigned_to) ? t.assigned_to : [t.assigned_to].filter(Boolean)
      return x.includes(a.id) && t.status !== 'completada'
    }).length
    const bt = tasks.filter((t) => {
      const x = Array.isArray(t.assigned_to) ? t.assigned_to : [t.assigned_to].filter(Boolean)
      return x.includes(b.id) && t.status !== 'completada'
    }).length
    return bt - at
  })

  if (selectedUser) {
    const u = selectedUser
    const team = teams.find((t) => t.id === u.team_id)
    const uTasks = tasks.filter((t) => {
      const a = Array.isArray(t.assigned_to) ? t.assigned_to : [t.assigned_to].filter(Boolean)
      return a.includes(u.id)
    })
    const ORDER = ['vencida', 'en_revision', 'en_progreso', 'pendiente', 'en_pausa', 'completada']
    const sorted = [...uTasks].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status))
    const active = sorted.filter((t) => t.status !== 'completada')
    const done = sorted.filter((t) => t.status === 'completada')
    const hrs = uTasks.reduce((s, t) => s + Number(t.hours_real || 0), 0)
    return (
      <div>
        <BackBtn onClick={() => setSelectedUser(null)} label="← Desempeño" />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            marginBottom: 20,
            padding: '16px 20px',
            background: 'var(--bg2)',
            borderRadius: 12,
            border: '1px solid var(--border)',
            borderLeft: `4px solid ${getUserColor(u, teams)}`,
          }}
        >
          <Av u={u} size={48} />
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>{u.name}</h2>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>
              {team?.name || 'Sin equipo'} · {u.email}
            </p>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4,auto)',
              gap: '4px 20px',
              textAlign: 'center',
            }}
          >
            {[
              { v: active.length, l: 'Activas', c: 'var(--s-progreso)' },
              {
                v: uTasks.filter((t) => t.status === 'vencida').length,
                l: 'Vencidas',
                c: 'var(--s-vencida)',
              },
              { v: done.length, l: 'Completadas', c: 'var(--s-completada)' },
              { v: hrs.toFixed(1) + 'h', l: 'Horas reales', c: 'var(--accent)' },
            ].map(({ v, l, c }) => (
              <div key={l}>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color: c,
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  {v}
                </div>
                <div
                  style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}
                >
                  {l}
                </div>
              </div>
            ))}
          </div>
        </div>
        <StatusLegend />
        {active.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            users={users}
            teams={teams}
            me={{ id: 'system', role: 'director', name: 'Director' }}
            token={null}
            onRefresh={() => {}}
          />
        ))}
        {done.length > 0 && (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                margin: '16px 0 8px',
                opacity: 0.45,
              }}
            >
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                <Icon n="completada" size={11} style={{ marginRight: 4 }} /> Completadas (
                {done.length})
              </span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
            {done.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                users={users}
                teams={teams}
                me={{ id: 'system', role: 'director', name: 'Director' }}
                token={null}
                onRefresh={() => {}}
              />
            ))}
          </>
        )}
      </div>
    )
  }

  return (
    <div>
      {onBack && <BackBtn onClick={onBack} />}
      <div className="section-header">
        <h2 className="section-title">Desempeño</h2>
        <div
          style={{ display: 'flex', gap: 4, background: 'var(--bg3)', borderRadius: 8, padding: 3 }}
        >
          {[
            { v: 'individual', l: 'Individual' },
            { v: 'equipo', l: 'Por equipo' },
          ].map((m) => (
            <button
              key={m.v}
              onClick={() => setViewMode(m.v)}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
                border: 'none',
                background: viewMode === m.v ? 'var(--bg2)' : 'transparent',
                color: viewMode === m.v ? 'var(--text)' : 'var(--muted)',
                fontWeight: viewMode === m.v ? 600 : 400,
                transition: '.13s',
              }}
            >
              {m.l}
            </button>
          ))}
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <SC
          label="Tareas activas"
          value={tasks.filter((t) => t.status !== 'completada').length}
          color="var(--blue)"
        />
        <SC
          label="Completadas"
          value={tasks.filter((t) => t.status === 'completada').length}
          color="var(--green)"
        />
        <SC
          label="Vencidas"
          value={tasks.filter((t) => t.status === 'vencida').length}
          color="var(--red)"
        />
        <SC
          label="Horas totales"
          value={tasks.reduce((s, t) => s + (Number(t.hours) || 0), 0) + 'h'}
          color="var(--accent)"
        />
      </div>

      {viewMode === 'individual' && (
        <div className="card fade-in">
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Carga por colaborador</h3>
          {sorted.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>
              No hay colaboradores aún.
            </p>
          )}
          {sorted.map((u, i) => {
            const ut = tasks.filter((t) => {
              const a = Array.isArray(t.assigned_to)
                ? t.assigned_to
                : [t.assigned_to].filter(Boolean)
              return a.includes(u.id) && t.status !== 'completada'
            })
            const uc = tasks.filter((t) => {
              const a = Array.isArray(t.assigned_to)
                ? t.assigned_to
                : [t.assigned_to].filter(Boolean)
              return a.includes(u.id) && t.status === 'completada'
            })
            const uv = tasks.filter((t) => {
              const a = Array.isArray(t.assigned_to)
                ? t.assigned_to
                : [t.assigned_to].filter(Boolean)
              return a.includes(u.id) && t.status === 'vencida'
            })
            const team = teams.find((t) => t.id === u.team_id)
            const pct = Math.min(100, Math.round((ut.length / 8) * 100))
            const loadColor =
              ut.length >= 7
                ? 'var(--s-vencida)'
                : ut.length >= 4
                  ? 'var(--load-warn)'
                  : team
                    ? teamColor(team)
                    : 'var(--load-ok)'
            return (
              <div
                key={u.id}
                onClick={() => setSelectedUser(u)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '12px 10px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  borderRadius: 8,
                  transition: '.13s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg3)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--muted)',
                    minWidth: 22,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {i + 1}
                </span>
                <Av u={u} size={36} />
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 5,
                      flexWrap: 'wrap',
                      gap: 6,
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 13 }}>
                      {u.name}
                      {team && (
                        <span
                          style={{
                            fontWeight: 400,
                            color: 'var(--muted)',
                            fontSize: 11,
                            marginLeft: 8,
                          }}
                        >
                          · {team.name}
                        </span>
                      )}
                    </span>
                    <div
                      style={{
                        display: 'flex',
                        gap: 10,
                        fontSize: 12,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      <span style={{ color: 'var(--s-completada)' }}>✓ {uc.length}</span>
                      {uv.length > 0 && (
                        <span style={{ color: 'var(--s-vencida)' }}>
                          <Icon n="alerta" size={10} /> {uv.length}
                        </span>
                      )}
                      <span style={{ color: 'var(--muted)' }}>
                        {tasks
                          .reduce((s, t) => {
                            const a = Array.isArray(t.assigned_to)
                              ? t.assigned_to
                              : [t.assigned_to].filter(Boolean)
                            return a.includes(u.id) ? s + Number(t.hours_real || 0) : s
                          }, 0)
                          .toFixed(1)}
                        h
                      </span>
                    </div>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${pct}%`,
                        background: loadColor,
                        transition: 'width .6s cubic-bezier(.4,0,.2,1)',
                      }}
                    />
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    minWidth: 28,
                    textAlign: 'right',
                    color: loadColor,
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  {ut.length}
                </span>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>→</span>
              </div>
            )
          })}
        </div>
      )}

      {viewMode === 'equipo' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))',
            gap: 12,
          }}
        >
          {teams.map((team) => {
            const members = users.filter(
              (u) =>
                (u.team_id === team.id ||
                  (Array.isArray(u.team_ids) && u.team_ids.includes(team.id))) &&
                u.role === 'colaborador'
            )
            const teamActive = tasks.filter(
              (t) => t.team_id === team.id && t.status !== 'completada'
            ).length
            const teamDone = tasks.filter(
              (t) => t.team_id === team.id && t.status === 'completada'
            ).length
            const teamOverdue = tasks.filter(
              (t) => t.team_id === team.id && t.status === 'vencida'
            ).length
            const teamHours = tasks
              .filter((t) => t.team_id === team.id)
              .reduce((s, t) => s + Number(t.hours_real || 0), 0)
            const avgLoad = members.length > 0 ? teamActive / members.length : 0
            const health =
              teamOverdue > 0 ||
              members.some(
                (u) =>
                  tasks.filter((x) => {
                    const a = Array.isArray(x.assigned_to)
                      ? x.assigned_to
                      : [x.assigned_to].filter(Boolean)
                    return a.includes(u.id) && x.status !== 'completada'
                  }).length >= 7
              )
                ? 'red'
                : avgLoad >= 4
                  ? 'yellow'
                  : 'green'
            const healthColor = {
              red: 'var(--load-crit)',
              yellow: 'var(--load-warn)',
              green: 'var(--load-ok)',
            }[health]
            return (
              <div key={team.id} className="card fade-in">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{ fontSize: 18 }}>
                    {
                      <Icon
                        n={team.icon || 'equipos'}
                        size={18}
                        style={{ display: 'inline-block' }}
                      />
                    }
                  </span>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700 }}>{team.name}</h3>
                    <p
                      style={{
                        fontSize: 11,
                        color: 'var(--muted)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {members.length} miembros
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        fontSize: 11,
                        color: healthColor,
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {teamActive} activas
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--muted)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      ✓{teamDone}{' '}
                      {teamOverdue > 0 && (
                        <span style={{ color: 'var(--red)' }}>
                          <Icon n="alerta" size={9} />
                          {teamOverdue}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    height: 4,
                    background: 'var(--bg3)',
                    borderRadius: 2,
                    marginBottom: 14,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: Math.min(100, (avgLoad / 8) * 100) + '%',
                      height: '100%',
                      background: healthColor,
                      borderRadius: 2,
                      transition: 'width .6s',
                    }}
                  />
                </div>
                {members.length === 0 ? (
                  <p
                    style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 8 }}
                  >
                    Sin miembros
                  </p>
                ) : (
                  members.map((u) => {
                    const ut = tasks.filter((t) => {
                      const a = Array.isArray(t.assigned_to)
                        ? t.assigned_to
                        : [t.assigned_to].filter(Boolean)
                      return a.includes(u.id) && t.status !== 'completada'
                    }).length
                    const uh = tasks
                      .filter((t) => {
                        const a = Array.isArray(t.assigned_to)
                          ? t.assigned_to
                          : [t.assigned_to].filter(Boolean)
                        return a.includes(u.id)
                      })
                      .reduce((s, t) => s + Number(t.hours_real || 0), 0)
                    const uColor =
                      ut >= 7 ? 'var(--red)' : ut >= 4 ? 'var(--yellow)' : getUserColor(u, teams)
                    const pct = Math.min(100, Math.round((ut / 8) * 100))
                    return (
                      <div
                        key={u.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}
                      >
                        <div
                          style={{
                            width: 3,
                            height: 32,
                            borderRadius: 2,
                            background: getUserColor(u, teams),
                            flexShrink: 0,
                          }}
                        />
                        <Av u={u} size={26} teams={teams} />
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              marginBottom: 3,
                            }}
                          >
                            <span style={{ fontSize: 12, fontWeight: 600 }}>
                              {u.name.split(' ')[0]}
                            </span>
                            <span
                              style={{
                                fontSize: 11,
                                color: uColor,
                                fontWeight: 700,
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {ut} · {uh.toFixed(1)}h
                            </span>
                          </div>
                          <div className="progress-bar" style={{ height: 3 }}>
                            <div
                              className="progress-fill"
                              style={{ width: `${pct}%`, background: uColor }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                <div
                  style={{
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 11,
                    color: 'var(--muted)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <span>{teamHours.toFixed(1)}h reales totales</span>
                  <span>{avgLoad.toFixed(1)} tareas/persona</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <button
          className="btn btn-green"
          onClick={() => exportExcel(tasks, users, teams)}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Icon n="exportar" size={14} /> Exportar Excel
        </button>
      </div>
    </div>
  )
}
