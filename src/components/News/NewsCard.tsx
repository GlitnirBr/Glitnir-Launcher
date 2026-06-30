import './NewsCard.css'

export interface NewsItem {
  id: string
  type: 'update' | 'event' | 'announcement'
  category?: 'noticias' | 'eventos' | 'destaque'
  title: string
  date: string
  time?: string
  summary?: string
  image?: string
  link?: string
  pinned?: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
  noticias: 'NOTÍCIAS',
  eventos: 'EVENTOS',
  destaque: 'DESTAQUE',
  update: 'NOTÍCIAS',
  event: 'EVENTOS',
  announcement: 'DESTAQUE',
}

interface Props {
  news: NewsItem | null
  categoryLabel?: string
}

export default function NewsCard({ news, categoryLabel }: Props) {
  function handleClick() {
    if (news?.link) window.glitnir.shell.openExternal(news.link)
  }

  const label =
    categoryLabel ||
    (news?.category ? CATEGORY_LABELS[news.category] : null) ||
    (news?.type ? CATEGORY_LABELS[news.type] : 'NOTÍCIAS')

  const formattedDate = news?.date
    ? new Date(news.date + 'T12:00:00').toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : ''

  return (
    <div className={`news-card ${news?.link ? 'clickable' : ''}`} onClick={news?.link ? handleClick : undefined}>
      <div className="news-card-label">{label}</div>
      <div
        className="news-card-image"
        style={news?.image ? { backgroundImage: `url(${news.image})` } : undefined}
      />
      <div className="news-card-footer">
        <p className="news-card-title">{news?.title || ''}</p>
        <div className="news-card-bottom">
          <span className="news-card-date">{formattedDate}</span>
          {news?.link && <span className="news-card-link">Ler mais</span>}
        </div>
      </div>
    </div>
  )
}
