import Icon from './Icon'

export default function BottomNav({
  page,
  navigate,
  profile,
  isDark,
  toggleTheme,
  onLogout,
  unread,
  onNotif,
  onReporte,
}) {
  const isDir = profile.role === 'director'
  const isCuentas = profile.role === 'cuentas'
  const canCreate = isDir || isCuentas

  const items = [
    { id: 'home', icon: 'home', label: 'Inicio' },
    { id: 'ordenes', icon: 'ordenes', label: 'Ordenes' },
    ...(canCreate ? [{ id: 'crear', icon: 'nueva', label: 'Nueva', primary: true }] : []),
    { id: 'equipos', icon: 'equipos', label: 'Equipos' },
    ...(isDir
      ? [
          {
            id: '__reporte__',
            icon: 'exportar',
            label: 'Reporte',
            action: () => onReporte && onReporte(),
          },
        ]
      : []),
    { id: 'perfil', icon: 'persona', label: 'Perfil' },
  ]

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'var(--bg2)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'stretch',
        zIndex: 250,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => (item.action ? item.action() : navigate(item.id))}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
            padding: '8px 4px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: page === item.id ? 'var(--accent)' : 'var(--muted)',
            transition: '.13s',
            position: 'relative',
            minHeight: 56,
          }}
        >
          {item.primary ? (
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 2,
                boxShadow: '0 4px 12px var(--accent-glow)',
              }}
            >
              <Icon n={item.icon} size={20} color="#0d0d0d" />
            </div>
          ) : (
            <>
              <div style={{ position: 'relative' }}>
                <Icon n={item.icon} size={20} />
                {item.id === 'perfil' && unread > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      background: 'var(--s-vencida)',
                      color: '#fff',
                      fontSize: 8,
                      fontWeight: 700,
                      borderRadius: '50%',
                      width: 12,
                      height: 12,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {unread}
                  </span>
                )}
              </div>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: page === item.id ? 700 : 400,
                  letterSpacing: '.02em',
                }}
              >
                {item.label}
              </span>
            </>
          )}
        </button>
      ))}
    </nav>
  )
}
