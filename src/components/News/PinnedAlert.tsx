import { NewsItem } from './NewsCard'
import './PinnedAlert.css'

interface Props {
  alert: NewsItem
  onDismiss?: () => void
}

export default function PinnedAlert({ alert, onDismiss }: Props) {
  const formattedDate = new Date(alert.date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short'
  })

  return (
    <div className="pinned-alert">
      <div className="pinned-alert-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <div className="pinned-alert-content">
        <span className="pinned-alert-title">{alert.title}</span>
        <span className="pinned-alert-meta">
          {alert.summary} — {formattedDate}
          {alert.time && ` as ${alert.time}`}
        </span>
      </div>
      {onDismiss && (
        <button className="pinned-alert-dismiss" onClick={onDismiss}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="6" y1="18" x2="18" y2="6" />
          </svg>
        </button>
      )}
    </div>
  )
}
