const ICONS = {
  home: `<path d="M3 9L8 4l5 5v6H10v-3H6v3H3V9z" stroke-linejoin="round"/>`,
  ordenes: `<rect x="3" y="2" width="10" height="12" rx="1.5"/><path d="M5 6h6M5 9h4"/>`,
  nueva: `<path d="M8 3v10M3 8h10"/>`,
  equipos: `<circle cx="8" cy="5" r="2"/><circle cx="13" cy="5" r="1.5"/><circle cx="3" cy="5" r="1.5"/><path d="M5 12c0-1.66 1.34-3 3-3s3 1.34 3 3"/><path d="M10.5 10c.83-.6 2.5-.5 3.5.5v1.5"/><path d="M5.5 10c-.83-.6-2.5-.5-3.5.5V12"/>`,
  desempeno: `<polyline points="3,12 6,8 9,10 13,5"/><polyline points="10,5 13,5 13,8"/>`,
  admin: `<circle cx="8" cy="8" r="2"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.93 2.93l1.41 1.41M11.66 11.66l1.41 1.41M11.66 4.34l-1.41 1.41M4.34 11.66l-1.41 1.41"/>`,
  buscar: `<circle cx="7" cy="7" r="4"/><path d="M10.5 10.5l3 3"/>`,
  exportar: `<path d="M8 3v8M5 8l3 3 3-3"/><path d="M3 13h10"/>`,
  duplicar: `<rect x="5" y="5" width="8" height="8" rx="1.5"/><path d="M5 5V3.5A1.5 1.5 0 0 1 6.5 2H12a1.5 1.5 0 0 1 1.5 1.5V11"/>`,
  reasignar: `<path d="M10 3l3 3-3 3"/><path d="M3 6h10M6 11l-3 3 3 3"/><path d="M13 14H3"/>`,
  cambio: `<path d="M13 5a5 5 0 0 0-9.9 1M3 11a5 5 0 0 0 9.9-1"/><path d="M11 3l2 2-2 2M5 13l-2-2 2-2"/>`,
  editar: `<path d="M10 3l3 3L6 13H3v-3L10 3z"/>`,
  eliminar: `<path d="M3 5h10M6 5V3h4v2M11 5v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5"/>`,
  volver: `<path d="M10 3L5 8l5 5"/><path d="M5 8h8"/>`,
  pendiente: `<circle cx="8" cy="8" r="5"/><path d="M8 5v3.5L10 10"/>`,
  progreso: `<path d="M4 8l3 3 6-6"/><circle cx="8" cy="8" r="5" fill="none"/>`,
  pausa: `<rect x="5" y="4" width="2" height="8" rx="0.5"/><rect x="9" y="4" width="2" height="8" rx="0.5"/>`,
  revision: `<circle cx="8" cy="8" r="5"/><path d="M6 8l1.5 1.5 3-3"/>`,
  completada: `<circle cx="8" cy="8" r="5"/><path d="M5 8l2.5 2.5 4-4"/>`,
  vencida: `<path d="M8 3l5 9H3L8 3z"/><path d="M8 7v3"/><circle cx="8" cy="11.5" r=".75" fill="currentColor"/>`,
  detalles: `<path d="M5 5h6M5 8h6M5 11h4"/><rect x="2" y="2" width="12" height="13" rx="1.5"/>`,
  comentar: `<path d="M13 3H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h1v3l3-3h6a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1z"/>`,
  historial: `<circle cx="8" cy="8" r="5"/><path d="M8 5v3.5L6 10"/>`,
  adjunto: `<path d="M13 8.5A4.5 4.5 0 0 1 4 8.5V4a3 3 0 0 1 6 0v5a1.5 1.5 0 0 1-3 0V4"/>`,
  link: `<path d="M6 9a3 3 0 0 0 4.24.06l2-2a3 3 0 0 0-4.24-4.24l-1 1"/><path d="M10 7a3 3 0 0 0-4.24-.06l-2 2a3 3 0 0 0 4.24 4.24l1-1"/>`,
  kanban: `<rect x="2" y="3" width="3.5" height="10" rx="1"/><rect x="6.25" y="3" width="3.5" height="7" rx="1"/><rect x="10.5" y="3" width="3.5" height="5" rx="1"/>`,
  lista: `<path d="M4 5h9M4 8h9M4 11h6"/><circle cx="2" cy="5" r=".75" fill="currentColor"/><circle cx="2" cy="8" r=".75" fill="currentColor"/><circle cx="2" cy="11" r=".75" fill="currentColor"/>`,
  copia: `<rect x="5" y="5" width="8" height="8" rx="1.5"/><path d="M5 5V3.5A1.5 1.5 0 0 1 6.5 2H12a1.5 1.5 0 0 1 1.5 1.5V11"/>`,
  sol: `<circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.22 3.22l1.42 1.42M11.36 11.36l1.42 1.42M11.36 4.64l-1.42 1.42M4.64 11.36l-1.42 1.42"/>`,
  luna: `<path d="M12 12.5A6 6 0 0 1 6.5 3a6 6 0 1 0 5.5 9.5z"/>`,
  alerta: `<path d="M8 3l5 9H3L8 3z"/><path d="M8 7v2.5"/><circle cx="8" cy="11" r=".75" fill="currentColor"/>`,
  check: `<path d="M3 8l4 4 6-6"/>`,
  cerrar: `<path d="M4 4l8 8M12 4l-8 8"/>`,
  colapsar: `<path d="M4 6l4 4 4-4"/>`,
  expandir: `<path d="M4 10l4-4 4 4"/>`,
  tiempo: `<circle cx="8" cy="8" r="5"/><path d="M8 5v3.5L10 10"/>`,
  carga: `<path d="M8 3v2M8 11v2M3 8h2M11 8h2M4.93 4.93l1.41 1.41M9.66 9.66l1.41 1.41M9.66 6.34l-1.41 1.41M6.34 9.66l-1.41 1.41"/><circle cx="8" cy="8" r="3"/>`,
  flecha_der: `<path d="M5 8h6M8 5l3 3-3 3"/>`,
  persona: `<circle cx="8" cy="5" r="2.5"/><path d="M4 13a4 4 0 0 1 8 0"/>`,
  equipo2: `<circle cx="6" cy="5" r="2"/><circle cx="11" cy="5" r="2"/><path d="M2 13a4 4 0 0 1 8 0"/><path d="M10 11a4 4 0 0 1 4 2"/>`,
  marca: `<path d="M3 3h6l4 4-7 7-4-4V3z"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/>`,
  semaforo: `<rect x="5" y="2" width="6" height="12" rx="3"/><circle cx="8" cy="5" r="1" fill="currentColor"/><circle cx="8" cy="8" r="1" fill="currentColor"/><circle cx="8" cy="11" r="1" fill="currentColor"/>`,
  calendario: `<rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M2 7h12"/><path d="M5 1v4M11 1v4"/><path d="M5 10h1M8 10h1M11 10h1"/>`,
  drag: `<path d="M8 3v10M5 6l3-3 3 3M5 10l3 3 3-3"/>`,
}
export default function Icon({ n, size = 16, color = 'currentColor', style = {}, className = '' }) {
  const path = ICONS[n]
  if (!path) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, display: 'inline-block', ...style }}
      className={className}
      dangerouslySetInnerHTML={{ __html: path }}
    />
  )
}
