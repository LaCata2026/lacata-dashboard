import { useState, useEffect, useRef, useCallback } from 'react'
import ExcelJS from 'exceljs'
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
import CalendarView from './CalendarView'
function ModalPortal({ children }) {
  const el = useRef(document.createElement('div'))
  useEffect(() => {
    document.body.appendChild(el.current)
    return () => document.body.removeChild(el.current)
  }, [])
  return ReactDOM.createPortal(children, el.current)
}

export async function exportExcel(tasks, users, teams) {
  const statusMap = {
    pendiente: 'Pendiente',
    en_progreso: 'En progreso',
    en_pausa: 'En pausa',
    en_revision: 'En revision',
    completada: 'Completada',
    vencida: 'Vencida',
  }
  const colDefs = [
    { header: 'No. Orden', width: 12 },
    { header: 'Proyecto', width: 36 },
    { header: 'Responsable', width: 22 },
    { header: 'Marca', width: 18 },
    { header: 'Equipo', width: 18 },
    { header: 'Estado', width: 14 },
    { header: 'Prioridad', width: 10 },
    { header: 'Horas Est.', width: 10 },
    { header: 'Horas Reales', width: 12 },
    { header: 'Diferencia', width: 10 },
    { header: 'Fecha Límite', width: 14 },
    { header: 'Cambios', width: 8 },
  ]
  const headerStyle = {
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a1a2e' } },
  }

  function buildRowData(t) {
    const assigned = Array.isArray(t.assigned_to) ? t.assigned_to : [t.assigned_to].filter(Boolean)
    const names = assigned.map((id) => users.find((u) => u.id === id)?.name || '?').join(', ')
    const team = teams.find((x) => x.id === t.team_id)
    return [
      'AC-' + String(t.order_number || 0).padStart(4, '0'),
      t.title || '',
      names || 'Sin asignar',
      t.marca || '—',
      team?.name || 'Sin equipo',
      statusMap[t.status] || t.status || '',
      t.priority || 'Normal',
      Number(t.hours) || 0,
      Number(t.hours_real) || 0,
      t.hours_real > 0 ? Math.round((Number(t.hours_real) - Number(t.hours)) * 100) / 100 : '—',
      t.due_date || '',
      t.changes || 0,
    ]
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'La Cata'
  wb.created = new Date()

  // Hoja: Todas las órdenes
  const wsAll = wb.addWorksheet('Todas las órdenes')
  wsAll.columns = colDefs
  wsAll.getRow(1).eachCell((cell) => {
    cell.font = headerStyle.font
    cell.fill = headerStyle.fill
  })
  tasks.forEach((t) => wsAll.addRow(buildRowData(t)))

  // Hoja por marca
  const marcas = [...new Set(tasks.map((t) => t.marca || 'Sin marca').filter(Boolean))].sort()
  marcas.forEach((marca) => {
    const mTasks = tasks.filter((t) => (t.marca || 'Sin marca') === marca)
    if (mTasks.length === 0) return

    const collabMap = {}
    mTasks.forEach((t) => {
      const assigned = Array.isArray(t.assigned_to)
        ? t.assigned_to
        : [t.assigned_to].filter(Boolean)
      assigned.forEach((id) => {
        const u = users.find((x) => x.id === id)
        if (!collabMap[id])
          collabMap[id] = { nombre: u?.name || '?', horasEst: 0, horasReal: 0, tareas: 0 }
        collabMap[id].horasEst += Number(t.hours) || 0
        collabMap[id].horasReal += Number(t.hours_real) || 0
        collabMap[id].tareas++
      })
    })

    const sheetName = marca.substring(0, 31).replace(/[\\/?*[\]]/g, '_')
    const ws = wb.addWorksheet(sheetName)
    ws.columns = colDefs
    ws.getRow(1).eachCell((cell) => {
      cell.font = headerStyle.font
      cell.fill = headerStyle.fill
    })
    mTasks.forEach((t) => ws.addRow(buildRowData(t)))

    // Resumen por colaborador
    ws.addRow([])
    const summaryHeaderRow = ws.addRow(['— Resumen por colaborador —', '', ''])
    summaryHeaderRow.getCell(1).font = { bold: true }
    ws.addRow(['Responsable', 'Tareas', 'Hrs Est.', 'Hrs Real'])
    Object.values(collabMap).forEach((c) => ws.addRow([c.nombre, c.tareas, c.horasEst, c.horasReal]))
    const totalEst = mTasks.reduce((s, t) => s + Number(t.hours || 0), 0)
    const totalReal = mTasks.reduce((s, t) => s + Number(t.hours_real || 0), 0)
    ws.addRow([])
    ws.addRow(['TOTAL HORAS MARCA:', totalEst, 'Reales:', totalReal])
  })

  // Descargar
  const filename = 'LaCata_Reporte_' + new Date().toISOString().split('T')[0] + '.xlsx'
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  showToast('Excel descargado con ' + marcas.length + ' tabs de marca', 'success')
}

// Calcula prioridad de urgencia del equipo para ordenar
function teamUrgencyScore(tTasks) {
  const now = new Date(),
    in24h = new Date(now.getTime() + 24 * 3600000)
  const venc = tTasks.filter((t) => t.status === 'vencida').length
  const hoy = tTasks.filter((t) => {
    if (t.status === 'completada' || t.status === 'vencida' || !t.due_date) return false
    const d = new Date(t.due_date + 'T23:59:59')
    return d >= now && d <= in24h
  }).length
  const rev = tTasks.filter((t) => t.status === 'en_revision').length
  const act = tTasks.filter((t) => t.status !== 'completada' && t.status !== 'vencida').length
  // Mayor score = más urgente = va primero
  if (venc > 0) return 1000 + venc
  if (hoy > 0) return 500 + hoy
  if (rev > 0) return 100 + rev
  if (act > 0) return 10 + act
  return 0 // solo completadas → al final
}

export default function OrdenesView({
  tasks,
  users,
  teams,
  me,
  token,
  onRefresh,
  onBack,
  initialFilter,
  initialView,
  initialTeam,
  onClearTeamFilter,
}) {
  const [viewMode, setViewMode] = useSessionFilters('ordenes_view', initialView || 'lista')
  const [sf, setSf] = useSessionFilters('ordenes_status', initialFilter || 'todas')
  const [tf, setTf] = useSessionFilters('ordenes_team', 'todas')
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState({})
  const [dragOverCol, setDragOverCol] = useState(null)
  const dragTaskRef = useRef(null)
  const isDir = me.role === 'director'
  const isCuentas = me.role === 'cuentas'
  const isCollab = me.role === 'colaborador'
  const effectiveView = isCollab ? 'lista' : viewMode
  const myTeamIds = isCuentas
    ? Array.isArray(me.team_ids) && me.team_ids.length > 0
      ? me.team_ids
      : [me.team_id].filter(Boolean)
    : null
  const visibleTeams =
    isCuentas && myTeamIds ? teams.filter((t) => myTeamIds.includes(t.id)) : teams

  // NUEVO: cuando llega initialTeam desde el sidebar, aplicarlo como filtro
  // Solo lo aplicamos una vez al cambiar initialTeam (no en cada render).
  // Esto pisa el filtro de equipo guardado en sesión, pero es lo esperado:
  // si el usuario hizo click en un equipo del sidebar, quiere ver ese equipo.
  const lastInitialTeamRef = useRef(undefined)
  useEffect(() => {
    if (initialTeam !== lastInitialTeamRef.current) {
      lastInitialTeamRef.current = initialTeam
      if (initialTeam) {
        setTf(initialTeam)
        // Al cambiar de equipo, también reseteamos el filtro de status si estaba aplicado por error
        // No tocamos sf — el usuario puede haber pinchado "vencidas" y ahora ver vencidas de un equipo
      }
    }
  }, [initialTeam, setTf])

  // Equipo actualmente seleccionado en el dropdown (sea por initialTeam o por elección manual)
  const selectedTeam = tf !== 'todas' ? visibleTeams.find((t) => t.id === tf) : null

  const visible = tasks.filter((t) => {
    let canSee = false
    if (isDir) canSee = true
    else if (isCuentas) {
      canSee = myTeamIds ? myTeamIds.includes(t.team_id) : true
    } else {
      const a = Array.isArray(t.assigned_to) ? t.assigned_to : [t.assigned_to].filter(Boolean)
      canSee = a.includes(me.id)
    }
    const sm =
      !search ||
      t.title?.toLowerCase().includes(search.toLowerCase()) ||
      (t.order_number &&
        ('AC-' + String(t.order_number).padStart(4, '0'))
          .toLowerCase()
          .includes(search.toLowerCase())) ||
      (t.marca || '').toLowerCase().includes(search.toLowerCase())
    return (
      canSee && (sf === 'todas' || t.status === sf) && (tf === 'todas' || t.team_id === tf) && sm
    )
  })

  // Contadores por status para la barra de filtros unificada
  const statusCounts = [
    'vencida',
    'en_progreso',
    'en_revision',
    'pendiente',
    'en_pausa',
    'completada',
  ].reduce((acc, s) => {
    acc[s] = visible.filter((t) => t.status === s).length
    return acc
  }, {})

  const COLS = [
    { s: 'vencida', label: 'Vencidas', color: 'var(--s-vencida)' },
    { s: 'en_progreso', label: 'En progreso', color: 'var(--s-progreso)' },
    { s: 'en_revision', label: 'En revisión', color: 'var(--s-revision)' },
    { s: 'pendiente', label: 'Pendiente', color: 'var(--s-pendiente)' },
    { s: 'en_pausa', label: 'En pausa', color: 'var(--s-pausa)' },
    { s: 'completada', label: 'Completada', color: 'var(--s-completada)' },
  ]

  async function handleDrop(newStatus) {
    const t = dragTaskRef.current
    if (!t || t.status === newStatus) return
    setDragOverCol(null)
    dragTaskRef.current = null
    showToast(`Moviendo a ${statusLabel[newStatus]}...`, 'info')
    try {
      const history = Array.isArray(t.history) ? [...t.history] : []
      history.push(
        `Estado cambiado a "${statusLabel[newStatus]}" — ${new Date().toLocaleDateString('es-GT')}`
      )
      await sb.update('tareas', t.id, { status: newStatus, history }, token)
      showToast(`✓ Movido a ${statusLabel[newStatus]}`, 'success')
      onRefresh()
    } catch (e) {
      showToast('Error al mover tarea: ' + e.message, 'error')
    }
  }

  function KanbanCard({ t }) {
    const assigned = Array.isArray(t.assigned_to) ? t.assigned_to : [t.assigned_to].filter(Boolean)
    const dr = fmtDateRelative(t.due_date, t.status)
    const canDrag = isDir || isCuentas || assigned.includes(me.id)
    return (
      <div
        className="kanban-card"
        draggable={canDrag}
        onDragStart={(e) => {
          if (!canDrag) return
          dragTaskRef.current = t
          e.dataTransfer.effectAllowed = 'move'
          const ghost = e.currentTarget.cloneNode(true)
          ghost.style.opacity = '0.01'
          ghost.style.position = 'absolute'
          ghost.style.top = '-1000px'
          document.body.appendChild(ghost)
          e.dataTransfer.setDragImage(ghost, 0, 0)
          setTimeout(() => document.body.removeChild(ghost), 0)
          e.currentTarget.classList.add('dragging')
        }}
        onDragEnd={(e) => {
          e.currentTarget.classList.remove('dragging')
          dragTaskRef.current = null
          setDragOverCol(null)
        }}
        onClick={() => {
          window._openTask && window._openTask(t)
        }}
        style={{ borderLeft: `3px solid ${statusColor[t.status] || 'var(--border)'}` }}
      >
        {canDrag && (
          <div
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              opacity: 0.2,
              transition: '.13s',
              pointerEvents: 'none',
            }}
            className="drag-handle"
          >
            <svg width={10} height={10} viewBox="0 0 10 10" fill="currentColor" opacity={0.5}>
              <circle cx="3" cy="2" r="1" />
              <circle cx="7" cy="2" r="1" />
              <circle cx="3" cy="5" r="1" />
              <circle cx="7" cy="5" r="1" />
              <circle cx="3" cy="8" r="1" />
              <circle cx="7" cy="8" r="1" />
            </svg>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
          {t.order_number ? (
            <span
              style={{
                fontSize: 10,
                color: 'var(--accent)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
              }}
            >
              AC-{String(t.order_number).padStart(4, '0')}
            </span>
          ) : (
            <span
              style={{
                fontSize: 10,
                color: 'var(--muted)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                opacity: 0.6,
              }}
            >
              Sin #
            </span>
          )}
          {t.priority !== 'Normal' && (
            <span className={`pill pill-prio-${t.priority.toLowerCase()}`}>{t.priority}</span>
          )}
        </div>
        <p style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4, marginBottom: 6 }}>{t.title}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: -4 }}>
            {assigned.slice(0, 3).map((id) => {
              const u = users.find((x) => x.id === id)
              return u ? (
                <div
                  key={id}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    background: getUserColor(u, teams),
                    fontSize: 7,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    marginRight: 2,
                  }}
                >
                  {u.initials}
                </div>
              ) : null
            })}
          </div>
          <span
            style={{
              fontSize: 10,
              color: dr.color,
              fontWeight: dr.urgent ? 700 : 400,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {dr.label}
          </span>
        </div>
      </div>
    )
  }

  // ── BARRA DE FILTROS UNIFICADA — filtro + leyenda + contadores ──
  function UnifiedFilterBar() {
    const items = [
      { s: 'todas', label: 'Todas', color: null, count: visible.length },
      { s: 'vencida', label: 'Vencida', color: 'var(--s-vencida)', count: statusCounts.vencida },
      {
        s: 'en_progreso',
        label: 'En progreso',
        color: 'var(--s-progreso)',
        count: statusCounts.en_progreso,
      },
      {
        s: 'en_revision',
        label: 'En revisión',
        color: 'var(--s-revision)',
        count: statusCounts.en_revision,
      },
      {
        s: 'pendiente',
        label: 'Pendiente',
        color: 'var(--s-pendiente)',
        count: statusCounts.pendiente,
      },
      { s: 'en_pausa', label: 'En pausa', color: 'var(--s-pausa)', count: statusCounts.en_pausa },
      {
        s: 'completada',
        label: 'Completada',
        color: 'var(--s-completada)',
        count: statusCounts.completada,
      },
    ]
    return (
      <div className="filter-bar" style={{ marginBottom: 12 }}>
        {items.map(({ s, label, color, count }) => {
          const isActive = sf === s
          const baseStyle = {
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 11px',
            borderRadius: 6,
            fontSize: 11.5,
            fontWeight: isActive ? 700 : 500,
            cursor: 'pointer',
            border: `1px solid ${isActive && s !== 'todas' ? color : 'var(--border)'}`,
            transition: '.13s',
            background:
              isActive && s !== 'todas'
                ? color
                : isActive
                  ? 'var(--accent)'
                  : s === 'todas'
                    ? 'var(--bg3)'
                    : 'var(--bg3)',
            color: isActive && s !== 'todas' ? '#fff' : isActive ? '#0d0d0d' : 'var(--muted2)',
            fontFamily: 'var(--font-body)',
          }
          return (
            <button key={s} style={baseStyle} onClick={() => setSf(s)}>
              {color && (
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: isActive ? '#fff' : color,
                    flexShrink: 0,
                    display: 'inline-block',
                  }}
                />
              )}
              {label}
              <span
                style={{
                  fontSize: 10,
                  padding: '0px 5px',
                  borderRadius: 8,
                  background:
                    isActive && s !== 'todas'
                      ? 'rgba(255,255,255,.25)'
                      : isActive
                        ? 'rgba(0,0,0,.15)'
                        : 'var(--bg4)',
                  color: 'inherit',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                }}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>
    )
  }

  // ── NUEVO: chip de equipo filtrado, visible cuando hay filtro activo ──
  function TeamFilterChip() {
    if (!selectedTeam) return null
    const c = selectedTeam.color || 'var(--accent)'
    function clear() {
      setTf('todas')
      if (onClearTeamFilter) onClearTeamFilter()
    }
    return (
      <div
        className="fade-in"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 6px 5px 12px',
          borderRadius: 7,
          background: 'var(--bg3)',
          border: `1px solid ${c}55`,
          fontSize: 12,
          fontFamily: 'var(--font-body)',
          marginBottom: 10,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: c,
            boxShadow: `0 0 6px ${c}99`,
            flexShrink: 0,
          }}
        />
        <span style={{ color: 'var(--muted2)' }}>Filtrando por:</span>
        <strong style={{ color: 'var(--text)' }}>{selectedTeam.name}</strong>
        <button
          onClick={clear}
          title="Quitar filtro"
          style={{
            background: 'var(--bg4)',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--muted)',
            borderRadius: 5,
            padding: '2px 7px',
            fontSize: 13,
            lineHeight: 1,
            fontFamily: 'inherit',
            transition: '.13s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--s-vencida)'
            e.currentTarget.style.color = '#fff'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg4)'
            e.currentTarget.style.color = 'var(--muted)'
          }}
        >
          ×
        </button>
      </div>
    )
  }

  return (
    <div>
      {onBack && <BackBtn onClick={onBack} />}
      <div className="section-header" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Órdenes de trabajo</h2>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {!isCollab && (
            <div
              style={{
                display: 'flex',
                gap: 2,
                background: 'var(--bg3)',
                borderRadius: 8,
                padding: 3,
              }}
            >
              {[
                { v: 'kanban', l: 'Kanban', icon: 'kanban' },
                { v: 'lista', l: 'Lista', icon: 'lista' },
                { v: 'equipo', l: 'Equipos', icon: 'equipos' },
                { v: 'calendario', l: 'Calendario', icon: 'calendario' },
              ].map((m) => (
                <button
                  key={m.v}
                  onClick={() => setViewMode(m.v)}
                  data-view={m.v}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    background: viewMode === m.v ? 'var(--bg2)' : 'transparent',
                    color: viewMode === m.v ? 'var(--text)' : 'var(--muted)',
                    fontWeight: viewMode === m.v ? 600 : 400,
                  }}
                >
                  <Icon n={m.icon} size={13} />
                  {m.l}
                </button>
              ))}
            </div>
          )}
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {visible.length} orden{visible.length !== 1 ? 'es' : ''}
          </span>
        </div>
      </div>

      {/* Chip de equipo filtrado — aparece arriba de los filtros */}
      {effectiveView !== 'calendario' && <TeamFilterChip />}

      {effectiveView !== 'calendario' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nombre, AC-0001, marca..."
            style={{ flex: 1, minWidth: 200, fontSize: 13 }}
          />
          {(isDir || isCuentas) && (
            <select
              value={tf}
              onChange={(e) => {
                setTf(e.target.value)
                if (e.target.value === 'todas' && onClearTeamFilter) onClearTeamFilter()
              }}
              style={{ width: 'auto', fontSize: 12 }}
            >
              <option value="todas">Todos los equipos</option>
              {visibleTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Barra unificada: reemplaza filter-bar + StatusLegend */}
      {(effectiveView === 'lista' || effectiveView === 'equipo') && <UnifiedFilterBar />}

      {effectiveView === 'kanban' && (isDir || isCuentas) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 10,
            padding: '6px 12px',
            background: 'var(--bg3)',
            borderRadius: 7,
            border: '1px solid var(--border)',
            width: 'fit-content',
          }}
        >
          <Icon n="drag" size={13} color="var(--muted)" />
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
            Arrastra las tarjetas entre columnas para cambiar el estado
          </span>
        </div>
      )}

      {effectiveView === 'calendario' && (
        <CalendarView tasks={tasks} users={users} teams={teams} me={me} />
      )}

      {visible.length === 0 &&
        effectiveView !== 'calendario' &&
        (() => {
          const hayFiltros = sf !== 'todas' || tf !== 'todas' || search.trim() !== ''
          return (
            <div className="empty">
              <div style={{ opacity: 0.3, marginBottom: 8 }}>
                <Icon n="ordenes" size={40} color="currentColor" />
              </div>
              {hayFiltros ? (
                <>
                  <p>Ninguna orden coincide con los filtros actuales.</p>
                  <button
                    onClick={() => {
                      setSf('todas')
                      setTf('todas')
                      setSearch('')
                      if (onClearTeamFilter) onClearTeamFilter()
                    }}
                    style={{
                      marginTop: 10,
                      fontSize: 12,
                      color: 'var(--accent)',
                      background: 'var(--accent-dim)',
                      border: '1px solid rgba(232,197,71,.2)',
                      padding: '6px 14px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-body)',
                      fontWeight: 600,
                    }}
                  >
                    Limpiar filtros
                  </button>
                </>
              ) : isCollab ? (
                <p>Aún no tienes órdenes asignadas. Cuando te asignen una, aparecerá aquí.</p>
              ) : (
                <>
                  <p>Todavía no hay órdenes de trabajo.</p>
                  {isDir && (
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                      Usa "Nueva orden" en el menú lateral para crear la primera.
                    </p>
                  )}
                </>
              )}
            </div>
          )
        })()}

      {effectiveView === 'kanban' && visible.length > 0 && (
        <div className="kanban-wrap">
          {COLS.map((col) => {
            const colTasks = visible.filter((t) => t.status === col.s)
            if (colTasks.length === 0 && col.s !== 'en_progreso' && col.s !== 'pendiente')
              return null
            const isOver = dragOverCol === col.s
            return (
              <div
                key={col.s}
                className={`kanban-col${isOver ? ' drag-over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setDragOverCol(col.s)
                }}
                onDragEnter={(e) => {
                  e.preventDefault()
                  setDragOverCol(col.s)
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) setDragOverCol(null)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  handleDrop(col.s)
                }}
              >
                <div className="kanban-col-head">
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: col.color,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>{col.label}</span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--muted)',
                      fontFamily: 'var(--font-mono)',
                      background: 'var(--bg4)',
                      borderRadius: 4,
                      padding: '1px 6px',
                    }}
                  >
                    {colTasks.length}
                  </span>
                </div>
                <div className="kanban-col-body">
                  {colTasks.length === 0 ? (
                    <div
                      style={{
                        border: '2px dashed var(--border)',
                        borderRadius: 8,
                        padding: '20px 12px',
                        textAlign: 'center',
                        margin: '4px 0',
                        transition: '.2s',
                        borderColor: isOver ? 'var(--accent)' : 'var(--border)',
                      }}
                    >
                      <p
                        style={{
                          fontSize: 11,
                          color: isOver ? 'var(--accent)' : 'var(--muted)',
                          opacity: isOver ? 1 : 0.5,
                          transition: '.2s',
                        }}
                      >
                        {isOver ? 'Soltar aquí' : 'Sin tareas'}
                      </p>
                    </div>
                  ) : (
                    colTasks.map((t) => <KanbanCard key={t.id} t={t} />)
                  )}
                  {colTasks.length > 0 && isOver && (
                    <div
                      style={{
                        height: 36,
                        border: '2px dashed var(--accent)',
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '4px 0',
                      }}
                    >
                      <span style={{ fontSize: 11, color: 'var(--accent)' }}>Soltar aquí</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {effectiveView === 'lista' &&
        visible.length > 0 &&
        (() => {
          const order = [
            'vencida',
            'en_revision',
            'en_progreso',
            'pendiente',
            'en_pausa',
            'completada',
          ]
          const sorted = [...visible].sort((a, b) => {
            const si = order.indexOf(a.status) - order.indexOf(b.status)
            if (si !== 0) return si
            return new Date(b.created_at) - new Date(a.created_at)
          })
          const active = sorted.filter((t) => t.status !== 'completada')
          const done = sorted.filter((t) => t.status === 'completada')
          return (
            <>
              {active.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  users={users}
                  teams={teams}
                  me={me}
                  token={token}
                  onRefresh={onRefresh}
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
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--muted)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
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
                      me={me}
                      token={token}
                      onRefresh={onRefresh}
                    />
                  ))}
                </>
              )}
            </>
          )
        })()}

      {effectiveView === 'equipo' &&
        visible.length > 0 &&
        (() => {
          const now = new Date(),
            in24h = new Date(now.getTime() + 24 * 3600000)
          const teamsWithTasks = visibleTeams
            .filter((t) => visible.some((x) => x.team_id === t.id))
            .sort((a, b) => {
              const aTasks = visible.filter((x) => x.team_id === a.id)
              const bTasks = visible.filter((x) => x.team_id === b.id)
              return teamUrgencyScore(bTasks) - teamUrgencyScore(aTasks)
            })
          const noTeam = visible.filter((t) => !t.team_id)

          // Color del borde del equipo según urgencia
          function teamBorderColor(tTasks) {
            const venc = tTasks.filter((t) => t.status === 'vencida').length
            const hoy = tTasks.filter((t) => {
              if (t.status === 'completada' || t.status === 'vencida' || !t.due_date) return false
              const d = new Date(t.due_date + 'T23:59:59')
              return d >= now && d <= in24h
            }).length
            const rev = tTasks.filter((t) => t.status === 'en_revision').length
            const act = tTasks.filter((t) => t.status !== 'completada').length
            if (venc > 0) return 'var(--s-vencida)'
            if (hoy > 0) return 'var(--yellow)'
            if (rev > 0) return 'var(--s-revision)'
            if (act > 0)
              return teamColor(visibleTeams.find((t) => t.id === tTasks[0]?.team_id) || {})
            return 'var(--s-completada)'
          }

          return (
            <>
              {teamsWithTasks.map((team) => {
                const tTasks = visible.filter((t) => t.team_id === team.id)
                const activeTasks = tTasks.filter((t) => t.status !== 'completada')
                const doneTasks = tTasks.filter((t) => t.status === 'completada')
                const isOnlyDone = activeTasks.length === 0
                // Por defecto: equipos con solo completadas van colapsados
                const isOpen = collapsed[team.id] !== undefined ? !collapsed[team.id] : !isOnlyDone
                const overdue = tTasks.filter((t) => t.status === 'vencida').length
                const inRev = tTasks.filter((t) => t.status === 'en_revision').length
                const inProg = tTasks.filter((t) => t.status === 'en_progreso').length
                const inPend = tTasks.filter((t) => t.status === 'pendiente').length
                const inPausa = tTasks.filter((t) => t.status === 'en_pausa').length
                const hoyCount = tTasks.filter((t) => {
                  if (t.status === 'completada' || t.status === 'vencida' || !t.due_date)
                    return false
                  const d = new Date(t.due_date + 'T23:59:59')
                  return d >= now && d <= in24h
                }).length
                const bc = teamBorderColor(tTasks)
                const dotColor =
                  overdue > 0
                    ? 'var(--s-vencida)'
                    : hoyCount > 0
                      ? 'var(--yellow)'
                      : inRev > 0
                        ? 'var(--s-revision)'
                        : activeTasks.length > 0
                          ? teamColor(team)
                          : 'var(--s-completada)'

                return (
                  <div
                    key={team.id}
                    style={{
                      marginBottom: 8,
                      background: 'var(--bg2)',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      overflow: 'hidden',
                      opacity: isOnlyDone ? 0.75 : 1,
                    }}
                  >
                    {/* Header del equipo */}
                    <div
                      onClick={() => setCollapsed((c) => ({ ...c, [team.id]: isOpen }))}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 14px',
                        cursor: 'pointer',
                        borderLeft: `3px solid ${bc}`,
                        background: isOpen ? 'var(--bg3)' : 'var(--bg2)',
                        transition: '.13s',
                      }}
                    >
                      {/* Semáforo */}
                      <div
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: '50%',
                          background: dotColor,
                          boxShadow: isOnlyDone ? 'none' : `0 0 7px ${dotColor}88`,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{team.name}</span>
                      {/* Contadores por estado — compactos */}
                      <div
                        style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}
                      >
                        {overdue > 0 && (
                          <span
                            style={{
                              fontSize: 10,
                              padding: '2px 7px',
                              borderRadius: 4,
                              background: 'var(--s-vencida-bg)',
                              color: 'var(--s-vencida)',
                              fontWeight: 700,
                              fontFamily: 'var(--font-mono)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 3,
                            }}
                          >
                            <span
                              style={{
                                width: 5,
                                height: 5,
                                borderRadius: '50%',
                                background: 'var(--s-vencida)',
                                display: 'inline-block',
                              }}
                            />
                            {overdue}
                          </span>
                        )}
                        {hoyCount > 0 && (
                          <span
                            style={{
                              fontSize: 10,
                              padding: '2px 7px',
                              borderRadius: 4,
                              background: 'rgba(232,197,71,.12)',
                              color: 'var(--yellow)',
                              fontWeight: 700,
                              fontFamily: 'var(--font-mono)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 3,
                            }}
                          >
                            <span
                              style={{
                                width: 5,
                                height: 5,
                                borderRadius: '50%',
                                background: 'var(--yellow)',
                                display: 'inline-block',
                              }}
                            />
                            hoy
                          </span>
                        )}
                        {inRev > 0 && (
                          <span
                            style={{
                              fontSize: 10,
                              padding: '2px 7px',
                              borderRadius: 4,
                              background: 'var(--s-revision-bg)',
                              color: 'var(--s-revision)',
                              fontWeight: 700,
                              fontFamily: 'var(--font-mono)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 3,
                            }}
                          >
                            <span
                              style={{
                                width: 5,
                                height: 5,
                                borderRadius: '50%',
                                background: 'var(--s-revision)',
                                display: 'inline-block',
                              }}
                            />
                            {inRev}
                          </span>
                        )}
                        {inProg > 0 && (
                          <span
                            style={{
                              fontSize: 10,
                              padding: '2px 7px',
                              borderRadius: 4,
                              background: 'var(--s-progreso-bg)',
                              color: 'var(--s-progreso)',
                              fontWeight: 700,
                              fontFamily: 'var(--font-mono)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 3,
                            }}
                          >
                            <span
                              style={{
                                width: 5,
                                height: 5,
                                borderRadius: '50%',
                                background: 'var(--s-progreso)',
                                display: 'inline-block',
                              }}
                            />
                            {inProg}
                          </span>
                        )}
                        {inPend > 0 && (
                          <span
                            style={{
                              fontSize: 10,
                              padding: '2px 7px',
                              borderRadius: 4,
                              background: 'var(--s-pendiente-bg)',
                              color: 'var(--s-pendiente)',
                              fontWeight: 700,
                              fontFamily: 'var(--font-mono)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 3,
                            }}
                          >
                            <span
                              style={{
                                width: 5,
                                height: 5,
                                borderRadius: '50%',
                                background: 'var(--s-pendiente)',
                                display: 'inline-block',
                              }}
                            />
                            {inPend}
                          </span>
                        )}
                        {inPausa > 0 && (
                          <span
                            style={{
                              fontSize: 10,
                              padding: '2px 7px',
                              borderRadius: 4,
                              background: 'var(--s-pausa-bg)',
                              color: 'var(--s-pausa)',
                              fontWeight: 700,
                              fontFamily: 'var(--font-mono)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 3,
                            }}
                          >
                            <span
                              style={{
                                width: 5,
                                height: 5,
                                borderRadius: '50%',
                                background: 'var(--s-pausa)',
                                display: 'inline-block',
                              }}
                            />
                            {inPausa}
                          </span>
                        )}
                        {isOnlyDone && (
                          <span
                            style={{
                              fontSize: 10,
                              padding: '2px 7px',
                              borderRadius: 4,
                              background: 'var(--s-completada-bg)',
                              color: 'var(--s-completada)',
                              fontWeight: 700,
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            Al día ✓
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: 11,
                            color: 'var(--muted)',
                            fontFamily: 'var(--font-mono)',
                            marginLeft: 2,
                          }}
                        >
                          {tTasks.length}
                        </span>
                      </div>
                      <span
                        style={{
                          color: 'var(--muted)',
                          transition: 'transform .2s',
                          transform: isOpen ? 'rotate(0)' : 'rotate(-90deg)',
                          display: 'inline-block',
                          fontSize: 12,
                        }}
                      >
                        ▼
                      </span>
                    </div>

                    {/* Órdenes expandidas */}
                    {isOpen && (
                      <div style={{ padding: '6px 12px 10px' }}>
                        {/* Activas ordenadas por urgencia */}
                        {[...activeTasks]
                          .sort((a, b) => {
                            // 1. Vencidas primero
                            if (a.status === 'vencida' && b.status !== 'vencida') return -1
                            if (b.status === 'vencida' && a.status !== 'vencida') return 1
                            // 2. Vence hoy o mañana (cualquier status activo)
                            const in48h = new Date(now.getTime() + 48 * 3600000)
                            const aUrgent =
                              a.due_date && new Date(a.due_date + 'T23:59:59') <= in48h
                            const bUrgent =
                              b.due_date && new Date(b.due_date + 'T23:59:59') <= in48h
                            if (aUrgent && !bUrgent) return -1
                            if (bUrgent && !aUrgent) return 1
                            // 3. En progreso antes que en revisión
                            const order = ['en_progreso', 'en_revision', 'pendiente', 'en_pausa']
                            const si = order.indexOf(a.status) - order.indexOf(b.status)
                            if (si !== 0) return si
                            // 4. Prioridad
                            const pa = a.priority === 'Urgente' ? 0 : a.priority === 'Alta' ? 1 : 2
                            const pb = b.priority === 'Urgente' ? 0 : b.priority === 'Alta' ? 1 : 2
                            if (pa !== pb) return pa - pb
                            // 5. Fecha límite más próxima
                            if (a.due_date && b.due_date)
                              return new Date(a.due_date) - new Date(b.due_date)
                            if (a.due_date) return -1
                            if (b.due_date) return 1
                            return new Date(b.created_at) - new Date(a.created_at)
                          })
                          .map((t) => (
                            <TaskCard
                              key={t.id}
                              task={t}
                              users={users}
                              teams={teams}
                              me={me}
                              token={token}
                              onRefresh={onRefresh}
                            />
                          ))}

                        {/* Completadas separadas con divisor */}
                        {doneTasks.length > 0 && (
                          <>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                margin: '10px 0 6px',
                                opacity: 0.4,
                              }}
                            >
                              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                              <span
                                style={{
                                  fontSize: 10,
                                  color: 'var(--muted)',
                                  fontFamily: 'var(--font-mono)',
                                }}
                              >
                                <Icon n="completada" size={10} style={{ marginRight: 3 }} />{' '}
                                Completadas ({doneTasks.length})
                              </span>
                              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                            </div>
                            {doneTasks.map((t) => (
                              <TaskCard
                                key={t.id}
                                task={t}
                                users={users}
                                teams={teams}
                                me={me}
                                token={token}
                                onRefresh={onRefresh}
                              />
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              {noTeam.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <p
                    style={{
                      fontSize: 11,
                      color: 'var(--muted)',
                      fontFamily: 'var(--font-mono)',
                      marginBottom: 6,
                    }}
                  >
                    Sin equipo asignado
                  </p>
                  {noTeam.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      users={users}
                      teams={teams}
                      me={me}
                      token={token}
                      onRefresh={onRefresh}
                    />
                  ))}
                </div>
              )}
            </>
          )
        })()}
    </div>
  )
}

/* ── TEAM DETAIL VIEW (collapsible collaborators) ── */
