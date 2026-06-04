import './NewsCard.css'

export interface NewsItem {
  id: string
  type: 'update' | 'event' | 'announcement'
  title: string
  date: string
  time?: string
  summary: string
  image?: string
  link?: string
  pinned?: boolean
}

interface Props {
  news: NewsItem
}

const TYPE_LABELS: Record<NewsItem['type'], string> = {
  update: 'Atualizacao',
  event: 'Evento',
  announcement: 'Aviso'
}

export default function NewsCard({ news }: Props) {
  function handleClick() {
    if (news.link) {
      window.glitnir.shell.openExternal(news.link)
    }
  }

  const formattedDate = new Date(news.date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short'
  })

  return (
    <div
      className={`news-card ${news.link ? 'clickable' : ''}`}
      onClick={news.link ? handleClick : undefined}
    >
      {news.image && (
        <div
          className="news-card-image"
          style={{ backgroundImage: `url(${news.image})` }}
        />
      )}
      <div className="news-card-content">
        <div className="news-card-meta">
          <span className={`badge badge-${news.type}`}>
            {TYPE_LABELS[news.type]}
          </span>
          <span className="news-card-date">
            {formattedDate}
            {news.time && ` - ${news.time}`}
          </span>
        </div>
        <h3 className="news-card-title">{news.title}</h3>
        <p className="news-card-summary">{news.summary}</p>
      </div>
    </div>
  )
}
