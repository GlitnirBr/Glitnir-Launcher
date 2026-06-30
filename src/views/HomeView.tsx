import { NewsItem } from '../components/News/NewsCard'
import HeroBanner from '../components/News/HeroBanner'
import PinnedAlert from '../components/News/PinnedAlert'
import NewsCard from '../components/News/NewsCard'
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
  pinnedAlert?: { text: string; link?: string }
  serverOnline?: boolean
  serverPlayers?: number
  serverMaxPlayers?: number
  hasBattlemetrics?: boolean
  serverInfo?: { ip?: string; uptime?: string; version?: string }
}

export default function HomeView({
  featured,
  news,
  pinnedAlert,
  serverOnline = false,
  serverPlayers = 0,
  serverMaxPlayers = 0,
  hasBattlemetrics = false,
  serverInfo,
}: Props) {
  const noticiaItem = news.find(n => n.category === 'noticias' || n.type === 'update') ?? null
  const eventosItem = news.find(n => n.category === 'eventos' || n.type === 'event') ?? null
  const destaqueItem = news.find(n => n.category === 'destaque' || n.type === 'announcement') ?? null

  function copyIp() {
    if (serverInfo?.ip) navigator.clipboard.writeText(serverInfo.ip).catch(() => {})
  }

  return (
    <div className="home-view">
      <HeroBanner
        featured={featured}
        fallbackTitle="Glitnir Fantasy"
        fallbackSubtitle="Servidor de Valheim com raças, classes e aventuras épicas. Junte-se a nós!"
      />

      {pinnedAlert && <PinnedAlert text={pinnedAlert.text} link={pinnedAlert.link} />}

      <div className="home-cards-grid">
        <NewsCard news={noticiaItem} categoryLabel="NOTÍCIAS" />
        <NewsCard news={eventosItem} categoryLabel="EVENTOS" />
        <NewsCard news={destaqueItem} categoryLabel="DESTAQUE" />

        <div className="server-status-card">
          <div className="status-card-header">Status do Servidor</div>
          <div className="status-card-body">
            {hasBattlemetrics ? (
              <div className={`status-indicator-row ${serverOnline ? 'online' : 'offline'}`}>
                <span className="status-dot" />
                <span className="status-label">{serverOnline ? 'Online' : 'Offline'}</span>
              </div>
            ) : (
              <div className="status-indicator-row offline">
                <span className="status-dot" />
                <span className="status-label">Não configurado</span>
              </div>
            )}

            {serverInfo?.ip && (
              <div className="status-info-row">
                <span className="status-info-label">IP</span>
                <span className="status-info-value mono">{serverInfo.ip}</span>
                <button className="status-copy-btn" onClick={copyIp} title="Copiar IP">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
              </div>
            )}

            {hasBattlemetrics && (
              <div className="status-info-row">
                <span className="status-info-label">Jogadores</span>
                <span className="status-info-value">{serverPlayers} / {serverMaxPlayers}</span>
              </div>
            )}

            {serverInfo?.uptime && (
              <div className="status-info-row">
                <span className="status-info-label">Uptime</span>
                <span className="status-info-value">{serverInfo.uptime}</span>
              </div>
            )}

            {serverInfo?.version && (
              <div className="status-info-row">
                <span className="status-info-label">Versão</span>
                <span className="status-info-value mono">{serverInfo.version}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
