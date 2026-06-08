import { useState, useEffect } from 'react'
import './UpdateNotification.css'

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function UpdateNotification() {
  const [status, setStatus] = useState<'available' | 'downloaded' | null>(null)
  const [progress, setProgress] = useState<{ percent: number; transferred: number; total: number } | null>(null)

  useEffect(() => {
    window.glitnir.updater.onStatus((data) => {
      if (data.status === 'available') setStatus('available')
      else if (data.status === 'downloaded') setStatus('downloaded')
    })
    window.glitnir.updater.onProgress((data) => {
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
              <span className="update-desc">Preparando download...</span>
            )}
          </>
        )}
        {status === 'downloaded' && (
          <>
            <span className="update-title">Atualização pronta!</span>
            <span className="update-desc">Clique para reiniciar e aplicar.</span>
          </>
        )}
      </div>

      {status === 'downloaded' && (
        <button className="update-btn" onClick={() => window.glitnir.updater.install()}>
          Reiniciar
        </button>
      )}

      {status === 'downloaded' && (
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
