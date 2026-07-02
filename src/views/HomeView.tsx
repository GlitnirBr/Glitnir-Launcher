import { useState } from 'react'
import { NewsItem } from '../components/News/NewsCard'
import HeroBanner from '../components/News/HeroBanner'
import PinnedAlert from '../components/News/PinnedAlert'
import NewsCard from '../components/News/NewsCard'
import { NewsData } from '../types'
import { uploadImage } from '../utils/backendApi'
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
  isAdmin?: boolean
  adminToken?: string | null
  backendUrl?: string
  onPublishNews?: (updates: Partial<NewsData>) => Promise<void>
}

type CardKey = 'noticias' | 'eventos' | 'destaque'
type CardDraft = { title: string; date: string; image: string; link: string; summary: string }
const EMPTY_CARD: CardDraft = { title: '', date: '', image: '', link: '', summary: '' }

const CARD_META: { key: CardKey; label: string; type: NewsItem['type'] }[] = [
  { key: 'noticias', label: 'Notícias', type: 'update' },
  { key: 'eventos', label: 'Eventos', type: 'event' },
  { key: 'destaque', label: 'Destaque', type: 'announcement' },
]

function cardFromItem(item: NewsItem | null): CardDraft {
  if (!item) return { ...EMPTY_CARD }
  return {
    title: item.title || '',
    date: item.date || '',
    image: item.image || '',
    link: item.link || '',
    summary: item.summary || '',
  }
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
  isAdmin = false,
  adminToken,
  backendUrl,
  onPublishNews,
}: Props) {
  const noticiaItem = news.find(n => n.category === 'noticias' || n.type === 'update') ?? null
  const eventosItem = news.find(n => n.category === 'eventos' || n.type === 'event') ?? null
  const destaqueItem = news.find(n => n.category === 'destaque' || n.type === 'announcement') ?? null

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState<Record<string, boolean>>({})

  const [draftTitle, setDraftTitle] = useState('')
  const [draftSubtitle, setDraftSubtitle] = useState('')
  const [draftImage, setDraftImage] = useState('')
  const [draftLink, setDraftLink] = useState('')
  const [draftAlertText, setDraftAlertText] = useState('')
  const [draftAlertLink, setDraftAlertLink] = useState('')
  const [draftCards, setDraftCards] = useState<Record<CardKey, CardDraft>>({
    noticias: { ...EMPTY_CARD },
    eventos: { ...EMPTY_CARD },
    destaque: { ...EMPTY_CARD },
  })

  function startEditing() {
    setError('')
    setDraftTitle(featured?.title || '')
    setDraftSubtitle(featured?.subtitle || '')
    setDraftImage(featured?.image || '')
    setDraftLink(featured?.link || '')
    setDraftAlertText(pinnedAlert?.text || '')
    setDraftAlertLink(pinnedAlert?.link || '')
    setDraftCards({
      noticias: cardFromItem(noticiaItem),
      eventos: cardFromItem(eventosItem),
      destaque: cardFromItem(destaqueItem),
    })
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setError('')
  }

  async function handlePickImage(key: string, onUrl: (url: string) => void) {
    if (!adminToken) return
    const file = await window.glitnir.fs.pickImage()
    if (!file) return
    setUploading(prev => ({ ...prev, [key]: true }))
    try {
      // Unique filename per upload — see ModpackEditorView.handlePickImage for why:
      // GitHub's raw CDN caches by path, so reusing a filename would keep serving stale bytes.
      const dotIndex = file.filename.lastIndexOf('.')
      const ext = dotIndex >= 0 ? file.filename.slice(dotIndex) : ''
      const base = (dotIndex >= 0 ? file.filename.slice(0, dotIndex) : file.filename).replace(/[^a-zA-Z0-9_-]/g, '_')
      const uniqueFilename = `${base}-${Date.now()}${ext}`
      const result = await uploadImage(adminToken, uniqueFilename, file.content, backendUrl)
      onUrl(result.url)
    } catch (err: any) {
      setError(err.message || 'Falha ao enviar imagem')
    } finally {
      setUploading(prev => ({ ...prev, [key]: false }))
    }
  }

  async function handleSave() {
    if (!onPublishNews) return
    setSaving(true)
    setError('')
    try {
      const newsList: NewsItem[] = CARD_META
        .filter(({ key }) => draftCards[key].title.trim())
        .map(({ key, type }) => ({ id: key, type, category: key, ...draftCards[key] }))

      await onPublishNews({
        featured: { title: draftTitle, subtitle: draftSubtitle, image: draftImage, link: draftLink },
        pinnedAlert: draftAlertText.trim() ? { text: draftAlertText, link: draftAlertLink || undefined } : undefined,
        news: newsList,
      })
      setEditing(false)
    } catch (err: any) {
      setError(err.message || 'Falha ao publicar')
    } finally {
      setSaving(false)
    }
  }

  function copyIp() {
    if (serverInfo?.ip) navigator.clipboard.writeText(serverInfo.ip).catch(() => {})
  }

  // While editing, feed the draft values into the real display components so the admin
  // sees exactly what players will see, live, before publishing anything.
  const displayFeatured = editing ? { title: draftTitle, subtitle: draftSubtitle, image: draftImage, link: draftLink } : featured
  const displayAlert = editing ? (draftAlertText.trim() ? { text: draftAlertText, link: draftAlertLink } : undefined) : pinnedAlert
  function displayCard(key: CardKey, fallback: NewsItem | null): NewsItem | null {
    if (!editing) return fallback
    const d = draftCards[key]
    if (!d.title.trim()) return null
    const meta = CARD_META.find(c => c.key === key)!
    return { id: key, type: meta.type, category: key, ...d }
  }

  return (
    <div className="home-view">
      {isAdmin && (
        <div className="home-edit-toolbar">
          {!editing ? (
            <button className="btn-ghost home-edit-toggle" onClick={startEditing}>
              <EditIcon /> Editar página inicial
            </button>
          ) : (
            <>
              <span className="home-edit-label">Editando página inicial — a prévia abaixo já reflete suas mudanças</span>
              <div className="home-edit-toolbar-actions">
                <button className="btn-ghost" onClick={cancelEditing} disabled={saving}>Cancelar</button>
                <button className="btn-play" style={{ width: 'auto', padding: '9px 20px' }} onClick={handleSave} disabled={saving}>
                  {saving ? 'Publicando...' : 'Salvar e publicar'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {error && <div className="error-banner home-edit-error">{error}</div>}

      <HeroBanner
        featured={displayFeatured}
        fallbackTitle="Glitnir Fantasy"
        fallbackSubtitle="Servidor de Valheim com raças, classes e aventuras épicas. Junte-se a nós!"
      />

      {editing && (
        <div className="card home-edit-form">
          <div className="card-header"><h3>Banner principal (hero)</h3></div>
          <div className="card-body">
            <div className="form-group">
              <label>Título</label>
              <input type="text" value={draftTitle} onChange={e => setDraftTitle(e.target.value)} placeholder="Glitnir Fantasy" />
            </div>
            <div className="form-group">
              <label>Subtítulo</label>
              <input type="text" value={draftSubtitle} onChange={e => setDraftSubtitle(e.target.value)}
                placeholder="Servidor de Valheim com raças, classes e aventuras épicas." />
            </div>
            <div className="form-group">
              <label>Imagem de fundo</label>
              <div className="image-upload-row">
                <input type="text" value={draftImage} onChange={e => setDraftImage(e.target.value)}
                  placeholder="URL gerada após envio..." style={{ flex: 1 }} readOnly={!!draftImage} />
                <button className="btn-ghost" style={{ whiteSpace: 'nowrap', fontSize: 13 }}
                  onClick={() => handlePickImage('hero', setDraftImage)} disabled={uploading['hero']}>
                  {uploading['hero'] ? 'Enviando...' : draftImage ? '↺ Trocar imagem' : '↑ Selecionar e enviar'}
                </button>
                {draftImage && <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setDraftImage('')}>✕</button>}
              </div>
              <span className="form-hint">Tamanho recomendado: <strong>1280 × 220 px</strong>. A prévia acima já mostra o resultado.</span>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Link (opcional)</label>
              <input type="text" value={draftLink} onChange={e => setDraftLink(e.target.value)} placeholder="https://..." />
            </div>
          </div>
        </div>
      )}

      {displayAlert && <PinnedAlert text={displayAlert.text} link={displayAlert.link} />}

      {editing && (
        <div className="card home-edit-form">
          <div className="card-header"><h3>Aviso fixado (barra)</h3></div>
          <div className="card-body">
            <div className="form-group">
              <label>Texto do aviso</label>
              <input type="text" value={draftAlertText} onChange={e => setDraftAlertText(e.target.value)}
                placeholder="Deixe vazio para ocultar a barra" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Link (opcional)</label>
              <input type="text" value={draftAlertLink} onChange={e => setDraftAlertLink(e.target.value)} placeholder="https://..." />
            </div>
          </div>
        </div>
      )}

      <div className="home-cards-grid">
        <NewsCard news={displayCard('noticias', noticiaItem)} categoryLabel="NOTÍCIAS" />
        <NewsCard news={displayCard('eventos', eventosItem)} categoryLabel="EVENTOS" />
        <NewsCard news={displayCard('destaque', destaqueItem)} categoryLabel="DESTAQUE" />

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

      {editing && (
        <div className="home-edit-cards">
          {CARD_META.map(({ key, label }) => (
            <div className="card home-edit-form" key={key}>
              <div className="card-header"><h3>Card — {label}</h3></div>
              <div className="card-body">
                <div className="form-group">
                  <label>Título</label>
                  <input type="text" value={draftCards[key].title}
                    onChange={e => setDraftCards(prev => ({ ...prev, [key]: { ...prev[key], title: e.target.value } }))}
                    placeholder="Título do card" />
                </div>
                <div className="form-group">
                  <label>Data</label>
                  <input type="text" value={draftCards[key].date}
                    onChange={e => setDraftCards(prev => ({ ...prev, [key]: { ...prev[key], date: e.target.value } }))}
                    placeholder="YYYY-MM-DD" />
                </div>
                <div className="form-group">
                  <label>Imagem</label>
                  <div className="image-upload-row">
                    <input type="text" value={draftCards[key].image}
                      onChange={e => setDraftCards(prev => ({ ...prev, [key]: { ...prev[key], image: e.target.value } }))}
                      placeholder="URL gerada após envio..." style={{ flex: 1 }} readOnly={!!draftCards[key].image} />
                    <button className="btn-ghost" style={{ whiteSpace: 'nowrap', fontSize: 13 }}
                      onClick={() => handlePickImage(key, url => setDraftCards(prev => ({ ...prev, [key]: { ...prev[key], image: url } })))}
                      disabled={uploading[key]}>
                      {uploading[key] ? 'Enviando...' : draftCards[key].image ? '↺ Trocar' : '↑ Selecionar e enviar'}
                    </button>
                    {draftCards[key].image && (
                      <button className="btn-ghost" style={{ fontSize: 12 }}
                        onClick={() => setDraftCards(prev => ({ ...prev, [key]: { ...prev[key], image: '' } }))}>✕</button>
                    )}
                  </div>
                  <span className="form-hint">Tamanho recomendado: <strong>560 × 150 px</strong>.</span>
                </div>
                <div className="form-group">
                  <label>Link (opcional)</label>
                  <input type="text" value={draftCards[key].link}
                    onChange={e => setDraftCards(prev => ({ ...prev, [key]: { ...prev[key], link: e.target.value } }))}
                    placeholder="https://..." />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Resumo (opcional)</label>
                  <input type="text" value={draftCards[key].summary}
                    onChange={e => setDraftCards(prev => ({ ...prev, [key]: { ...prev[key], summary: e.target.value } }))}
                    placeholder="Descrição curta..." />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    </svg>
  )
}
