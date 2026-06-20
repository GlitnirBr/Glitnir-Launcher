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
  serverOnline?: boolean
}

export default function HomeView({ featured, news, pinnedAlert, onDismissAlert, serverOnline = true }: Props) {
  const displayNews = news.slice(0, 1)

  return (
    <div className="home-view">
      <HeroBanner
        featured={featured}
        fallbackTitle="Glitnir Fantasy"
        fallbackSubtitle="Servidor de Valheim com raças, classes e aventuras épicas. Junte-se a nós!"
      />

      {pinnedAlert && (
        <PinnedAlert alert={pinnedAlert} onDismiss={onDismissAlert} />
      )}

      <div className="home-content">
        {/* Server status card */}
        <aside className="server-status-card">
          <div className="status-card-header">
            <span className="status-card-title">Status do Servidor</span>
          </div>
          <div className="status-card-body">
            <div className={`status-indicator ${serverOnline ? 'online' : 'offline'}`}>
              <span className="status-dot" />
              <span className="status-text">{serverOnline ? 'Online' : 'Offline'}</span>
            </div>
            <div className="status-rows">
              <div className="status-row">
                <span className="status-row-label">IP</span>
                <span className="status-row-value mono">glitnir.valheim.gg</span>
              </div>
              <div className="status-row">
                <span className="status-row-label">Jogadores</span>
                <span className="status-row-value">0 / 100</span>
              </div>
            </div>
          </div>
        </aside>

        {/* News section */}
        {displayNews.length > 0 ? (
          <section className="home-section">
            <h2 className="section-title">Notícias do Servidor</h2>
            <div className="news-grid">
              {displayNews.map(item => (
                <NewsCard key={item.id} news={item} />
              ))}
            </div>
          </section>
        ) : (
          !featured && (
            <div className="empty-state">
              <p>Nenhuma novidade no momento.</p>
              <span className="text-muted">Configure as notícias no painel admin.</span>
            </div>
          )
        )}
      </div>
    </div>
  )
}
