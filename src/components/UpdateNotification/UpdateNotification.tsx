import { useState, useEffect } from 'react'
import './UpdateNotification.css'

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function UpdateNotification() {
  const [status, setStatus] = useState<'available' | 'downloaded' | 'error' | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [progress, setProgress] = useState<{ percent: number; transferred: number; total: number } | null>(null)
  const [slowTimeout, setSlowTimeout] = useState(false)

  useEffect(() => {
    window.glitnir.updater.onStatus((data) => {
      if (data.status === 'available') {
        setStatus('available')
        const t = setTimeout(() => setSlowTimeout(true), 10000)
        return () => clearTimeout(t)
      } else if (data.status === 'downloaded') {
        setStatus('downloaded')
      } else if (data.status === 'error') {
        setStatus('error')
        setErrorMsg((data as any).message || 'Erro desconhecido')
      }
    })
    window.glitnir.updater.onProgress((data) => {
      setSlowTimeout(false)
      setProgress(data)
    })
  }, [])

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
            <span className="update-title">Atualização disponível</span>
            {progress ? (
              <>
                <div className="update-progress-bar">
                  <div className="update-progress-fill" style={{ width: `${progress.percent}%` }} />
                </div>
                <span className="update-desc">
                  {progress.percent}% — {formatBytes(progress.transferred)} / {formatBytes(progress.total)}
                </span>
              </>
            ) : (
              <span className="update-desc">
                {slowTimeout ? 'Download lento, aguarde...' : 'Preparando download...'}
              </span>
            )}
          </>
        )}
        {status === 'downloaded' && (
          <>
            <span className="update-title">Atualização pronta!</span>
            <span className="update-desc">Clique para reiniciar e aplicar.</span>
          </>
        )}
        {status === 'error' && (
          <>
            <span className="update-title" style={{ color: '#ff6b6b' }}>Erro na atualização</span>
            <span className="update-desc" title={errorMsg}>Não foi possível baixar.</span>
          </>
        )}
      </div>

      {status === 'downloaded' && (
        <button className="update-btn" onClick={() => window.glitnir.updater.install()}>
          Reiniciar
        </button>
      )}

      {(status === 'downloaded' || status === 'error') && (
        <button className="update-close" onClick={() => setStatus(null)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="6" y1="18" x2="18" y2="6" />
          </svg>
        </button>
      )}
    </div>
  )
}
