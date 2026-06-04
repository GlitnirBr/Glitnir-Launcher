import { useState, useEffect } from 'react'
import './UpdateNotification.css'

export default function UpdateNotification() {
  const [status, setStatus] = useState<'checking' | 'available' | 'downloaded' | null>(null)

  useEffect(() => {
    window.glitnir.updater.onStatus((data) => {
      if (data.status === 'available') {
        setStatus('available')
      } else if (data.status === 'downloaded') {
        setStatus('downloaded')
      }
    })
  }, [])

  function handleInstall() {
    window.glitnir.updater.install()
  }

  function handleDismiss() {
    setStatus(null)
  }

  if (!status) return null

  return (
    <div className="update-notification">
      <div className="update-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7,10 12,15 17,10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </div>
      <div className="update-content">
        {status === 'available' && (
          <>
            <span className="update-title">Atualizacao disponivel</span>
            <span className="update-desc">Baixando nova versao...</span>
          </>
        )}
        {status === 'downloaded' && (
          <>
            <span className="update-title">Atualizacao pronta!</span>
            <span className="update-desc">Reinicie para aplicar.</span>
          </>
        )}
      </div>
      {status === 'downloaded' && (
        <button className="update-btn" onClick={handleInstall}>
          Reiniciar
        </button>
      )}
      <button className="update-close" onClick={handleDismiss}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="6" y1="18" x2="18" y2="6" />
        </svg>
      </button>
    </div>
  )
}
