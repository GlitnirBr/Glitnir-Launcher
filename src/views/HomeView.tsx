import { HeroBanner, NewsCard, PinnedAlert, NewsItem } from '../components/News'
import './HomeView.css'

interface FeaturedNews {
  title: string
  subtitle?: string
  image?: string
  link?: string
  cta?: string
}

interface Props {
  featured?: FeaturedNews
  news: NewsItem[]
  pinnedAlert?: NewsItem
  onDismissAlert?: () => void
}

export default function HomeView({ featured, news, pinnedAlert, onDismissAlert }: Props) {
  return (
    <div className="home-view">
      <HeroBanner
        featured={featured}
        fallbackTitle="Glitnir Fantasy"
        fallbackSubtitle="Servidor de Valheim com raças, classes e aventuras epicas. Junte-se a nos!"
      />

      {pinnedAlert && (
        <PinnedAlert alert={pinnedAlert} onDismiss={onDismissAlert} />
      )}

      {news.length > 0 && (
        <section className="news-section">
          <h2 className="section-title">Noticias do Servidor</h2>
          <div className="news-grid">
            {news.slice(0, 3).map(item => (
              <NewsCard key={item.id} news={item} />
            ))}
          </div>
        </section>
      )}

      {news.length === 0 && !featured && (
        <div className="empty-state">
          <p>Nenhuma novidade no momento.</p>
          <span className="text-muted">Configure as noticias no painel admin.</span>
        </div>
      )}
    </div>
  )
}
