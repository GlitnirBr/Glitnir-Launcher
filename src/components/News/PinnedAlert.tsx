import { NewsItem } from './NewsCard'
import './PinnedAlert.css'

interface Props {
  alert: NewsItem
  onDismiss?: () => void
}

export default function PinnedAlert({ alert, onDismiss }: Props) {
  return (
    <div className="pinned-alert">
      <div className="pinned-alert-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      </div>
      <span className="pinned-label">Últimas notícias</span>
      <div className="pinned-alert-content">
        <span className="pinned-alert-title">{alert.title}</span>
        {alert.summary && (
          <>
            <span className="pinned-alert-sep">—</span>
            <span className="pinned-alert-summary">{alert.summary}</span>
          </>
        )}
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
