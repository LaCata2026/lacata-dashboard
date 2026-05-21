import { useState, useEffect, useRef, useCallback } from 'react'
import ReactDOM from 'react-dom'
import {
  sb,
  teamColor,
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
function ModalPortal({ children }) {
  const el = useRef(document.createElement('div'))
  useEffect(() => {
    document.body.appendChild(el.current)
    return () => document.body.removeChild(el.current)
  }, [])
  return ReactDOM.createPortal(children, el.current)
}
export default function CalendarView({ tasks, users, teams, me }) {
  const today = new Date()
  const [calYear, setCalYear] = useState(today.getFullYear())
  const [calMonth, setCalMonth] = useState(today.getMonth())
  const [hoveredDay, setHoveredDay] = useState(null)

  const isDir = me.role === 'director'
  const isCuentas = me.role === 'cuentas'

  // Filter tasks user can see
  const visibleTasks = tasks
    .filter((t) => {
      if (isDir) return true
      if (isCuentas) {
        const myTeamIds = Array.isArray(me.team_ids) && me.team_ids.length > 0 ? me.team_ids : null
        return myTeamIds ? myTeamIds.includes(t.team_id) : true
      }
      const a = Array.isArray(t.assigned_to) ? t.assigned_to : [t.assigned_to].filter(Boolean)
      return a.includes(me.id)
    })
    .filter((t) => t.due_date)

  const monthNames = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ]
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

  // Build calendar grid
  const firstDay = new Date(calYear, calMonth, 1)
  const lastDay = new Date(calYear, calMonth + 1, 0)
  const startDow = firstDay.getDay() // 0=Sunday
  const daysInMonth = lastDay.getDate()

  // Tasks indexed by date string YYYY-MM-DD
  const tasksByDate = {}
  visibleTasks.forEach((t) => {
    const d = t.due_date
    if (!tasksByDate[d]) tasksByDate[d] = []
    tasksByDate[d].push(t)
  })

  // Stats for this month
  const monthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`
  const monthTasks = visibleTasks.filter((t) => t.due_date && t.due_date.startsWith(monthStr))
  const overdueMonth = monthTasks.filter((t) => t.status === 'vencida').length
  const doneMonth = monthTasks.filter((t) => t.status === 'completada').length

  function prevMonth() {
    if (calMonth === 0) {
      setCalMonth(11)
      setCalYear((y) => y - 1)
    } else setCalMonth((m) => m - 1)
  }
  function nextMonth() {
    if (calMonth === 11) {
      setCalMonth(0)
      setCalYear((y) => y + 1)
    } else setCalMonth((m) => m + 1)
  }

  // Build cells: padding + days + padding
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push({ type: 'pad', key: 'pad-s-' + i })
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dayTasks = tasksByDate[dateStr] || []
    const isToday =
      d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear()
    cells.push({ type: 'day', key: dateStr, d, dateStr, dayTasks, isToday })
  }
  const remaining = (7 - (cells.length % 7)) % 7
  for (let i = 0; i < remaining; i++) cells.push({ type: 'pad', key: 'pad-e-' + i })

  return (
    <div className="fade-in">
      {/* Month navigation */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={prevMonth}
            style={{
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              borderRadius: 7,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--muted2)',
              transition: '.13s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted2)')}
          >
            <svg
              width={14}
              height={14}
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M10 4L6 8l4 4" />
            </svg>
          </button>
          <h3
            style={{
              fontSize: 17,
              fontWeight: 800,
              fontFamily: 'var(--font-display)',
              letterSpacing: '-.02em',
              minWidth: 160,
              textAlign: 'center',
            }}
          >
            {monthNames[calMonth]} {calYear}
          </h3>
          <button
            onClick={nextMonth}
            style={{
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              borderRadius: 7,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--muted2)',
              transition: '.13s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted2)')}
          >
            <svg
              width={14}
              height={14}
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M6 4l4 4-4 4" />
            </svg>
          </button>
          <button
            onClick={() => {
              setCalMonth(today.getMonth())
              setCalYear(today.getFullYear())
            }}
            style={{
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 6,
              background: 'var(--accent-dim)',
              color: 'var(--accent)',
              border: '1px solid rgba(232,197,71,.25)',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              fontWeight: 700,
            }}
          >
            Hoy
          </button>
        </div>
        {/* Month summary pills */}
        <div style={{ display: 'flex', gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              padding: '3px 10px',
              borderRadius: 999,
              background: 'var(--bg3)',
              color: 'var(--muted2)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{monthTasks.length}</span>{' '}
            entrega{monthTasks.length !== 1 ? 's' : ''}
          </span>
          {overdueMonth > 0 && (
            <span
              style={{
                fontSize: 11,
                padding: '3px 10px',
                borderRadius: 999,
                background: 'var(--s-vencida-bg)',
                color: 'var(--s-vencida)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
              }}
            >
              ⚠ {overdueMonth} vencida{overdueMonth !== 1 ? 's' : ''}
            </span>
          )}
          {doneMonth > 0 && (
            <span
              style={{
                fontSize: 11,
                padding: '3px 10px',
                borderRadius: 999,
                background: 'var(--s-completada-bg)',
                color: 'var(--s-completada)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              ✓ {doneMonth} completada{doneMonth !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Day names header */}
      <div className="cal-header">
        {dayNames.map((d) => (
          <div key={d} className="cal-day-name">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="cal-grid">
        {cells.map((cell) => {
          if (cell.type === 'pad') return <div key={cell.key} className="cal-cell other-month" />
          const { d, dateStr, dayTasks, isToday } = cell
          const MAX_SHOW = 3
          const visible2 = dayTasks.slice(0, MAX_SHOW)
          const extra = dayTasks.length - MAX_SHOW
          return (
            <div
              key={dateStr}
              className={`cal-cell${isToday ? ' today' : ''}${dayTasks.length > 0 ? ' has-events' : ''}`}
              onMouseEnter={() => setHoveredDay(dateStr)}
              onMouseLeave={() => setHoveredDay(null)}
            >
              <div className="cal-date">{d}</div>
              {visible2.map((t) => {
                const col = statusColor[t.status] || 'var(--muted)'
                return (
                  <div
                    key={t.id}
                    className="cal-event"
                    style={{ background: col + '22', color: col, border: `1px solid ${col}44` }}
                    onClick={(e) => {
                      e.stopPropagation()
                      window._openTask && window._openTask(t)
                    }}
                  >
                    {t.title}
                  </div>
                )
              })}
              {extra > 0 && <div className="cal-more">+{extra} más</div>}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div
        style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
          Estado de fecha límite:
        </span>
        {[
          { s: 'en_progreso', l: 'En progreso' },
          { s: 'en_revision', l: 'En revisión' },
          { s: 'pendiente', l: 'Pendiente' },
          { s: 'vencida', l: 'Vencida' },
          { s: 'completada', l: 'Completada' },
        ].map(({ s, l }) => (
          <span
            key={s}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11,
              color: 'var(--muted2)',
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: 2, background: statusColor[s] }} />
            {l}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ── ORDENES ── */
