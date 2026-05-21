import { useState } from 'react'
import ReactDOM from 'react-dom'
let _confirm = null
export async function showConfirm(msg, opts = {}) {
  if (!_confirm) return window.confirm(msg)
  return _confirm(msg, opts)
}
export default function ConfirmDialog() {
  const [state, setState] = useState(null)
  _confirm = (msg, opts = {}) =>
    new Promise((res) => {
      setState({
        msg,
        opts: {
          title: opts.title || '¿Confirmar?',
          confirmLabel: opts.confirmLabel || 'Confirmar',
          confirmColor: opts.confirmColor || 'var(--s-vencida)',
          cancelLabel: opts.cancelLabel || 'Cancelar',
          detail: opts.detail || '',
        },
        res,
      })
    })
  if (!state) return null
  function close(val) {
    const r = state.res
    setState(null)
    r(val)
  }
  return ReactDOM.createPortal(
    <div className="confirm-overlay" onClick={(e) => e.target === e.currentTarget && close(false)}>
      <div className="confirm-box fade-in">
        <h3
          style={{
            fontSize: 16,
            fontWeight: 700,
            marginBottom: 8,
            fontFamily: 'var(--font-display)',
          }}
        >
          {state.opts.title}
        </h3>
        <p
          style={{
            fontSize: 14,
            color: 'var(--muted2)',
            marginBottom: state.opts.detail ? 6 : 20,
            lineHeight: 1.5,
          }}
        >
          {state.msg}
        </p>
        {state.opts.detail && (
          <p
            style={{
              fontSize: 12,
              color: 'var(--muted)',
              marginBottom: 20,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {state.opts.detail}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => close(false)}>
            {state.opts.cancelLabel}
          </button>
          <button
            className="btn btn-sm"
            onClick={() => close(true)}
            style={{
              background: state.opts.confirmColor,
              color: '#fff',
              fontWeight: 700,
              border: 'none',
            }}
          >
            {state.opts.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
