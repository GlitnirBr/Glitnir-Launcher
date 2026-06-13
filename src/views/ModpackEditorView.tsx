import { useState, useEffect, useCallback, useMemo } from 'react'
import { Config, Mod, ModConfig, Modpack } from '../types'
import { fetchAllMods, clearModsCache, ThunderstoreMod, getDownloadUrl } from '../utils/thunderstoreApi'
import { fetchModpackFromUrl, buildModpackRawUrl } from '../utils/modManager'
import { getAdminModpack, publishModpack } from '../utils/backendApi'
import ErrorBoundary from '../components/ErrorBoundary'
import './AdminView.css'

interface Props {
  config: Config
  adminToken: string | null
}

type Target = 'main' | 'admin'
type Tab = 'online' | 'modpack' | 'configs'

const PAGE_SIZE = 50

export default function ModpackEditorView({ config, adminToken }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('online')
  const [target, setTarget] = useState<Target>('main')

  const [packName, setPackName] = useState('')
  const [packDescription, setPackDescription] = useState('')
  const [packVersion, setPackVersion] = useState('1.0.0')
  const [modpackMods, setModpackMods] = useState<Mod[]>([])
  const [modpackConfigs, setModpackConfigs] = useState<ModConfig[]>([])

  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'downloads' | 'rating' | 'updated' | 'name'>('downloads')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [allMods, setAllMods] = useState<ThunderstoreMod[]>([])
  const [loadingMods, setLoadingMods] = useState(false)
  const [modsError, setModsError] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const [privName, setPrivName] = useState('')
  const [privFilename, setPrivFilename] = useState('')

  const [cfgMod, setCfgMod] = useState('')
  const [cfgFilename, setCfgFilename] = useState('')
  const [cfgInstallPath, setCfgInstallPath] = useState('')
  const [cfgContent, setCfgContent] = useState('')

  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [publishing, setPublishing] = useState(false)

  const backendUrl = config.backendUrl || ''
  const modpackRepo = config.modpackRepo || ''
  const modpackBranch = config.modpackBranch || 'main'

  const loadModpack = useCallback(async () => {
    setError('')
    try {
      let data: Modpack | null = null
      if (target === 'admin') {
        if (!adminToken) return
        data = await getAdminModpack(adminToken, backendUrl)
      } else {
        const url = buildModpackRawUrl(modpackRepo, modpackBranch)
        data = await fetchModpackFromUrl(url)
      }
      if (data) {
        setPackName(data.name || '')
        setPackDescription(data.description || '')
        setPackVersion(data.version || '1.0.0')
        setModpackMods(data.mods || [])
        setModpackConfigs(data.configs || [])
      }
    } catch {
      setPackName(target === 'admin' ? 'Modpack Teste Admin' : 'Modpack Servidor Principal')
      setPackDescription('')
      setPackVersion('1.0.0')
      setModpackMods([])
      setModpackConfigs([])
    }
  }, [target, adminToken, backendUrl, modpackRepo, modpackBranch])

  useEffect(() => { loadModpack() }, [loadModpack])

  const loadMods = useCallback(() => {
    setLoadingMods(true)
    setModsError('')
    fetchAllMods()
      .then(mods => {
        setAllMods(mods)
        setVisibleCount(PAGE_SIZE)
      })
      .catch((err: any) => setModsError(err?.message || 'Erro ao carregar mods do Thunderstore'))
      .finally(() => setLoadingMods(false))
  }, [])

  useEffect(() => {
    if (allMods.length > 0) return
    loadMods()
  }, [allMods.length, loadMods])

  const availableCategories = useMemo(() => {
    const cats = new Set<string>()
    allMods.forEach(m => (m.categories || []).forEach(c => cats.add(c)))
    return Array.from(cats).sort()
  }, [allMods])

  const filteredMods = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    let source = allMods
    if (q) {
      source = source.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.owner.toLowerCase().includes(q) ||
        (m.latest.description?.toLowerCase().includes(q) ?? false)
      )
    }
    if (categoryFilter) {
      source = source.filter(m => (m.categories || []).includes(categoryFilter))
    }
    const sorted = [...source]
    if (sortBy === 'downloads') sorted.sort((a, b) => (b.total_downloads ?? 0) - (a.total_downloads ?? 0))
    else if (sortBy === 'rating') sorted.sort((a, b) => (b.rating_score ?? 0) - (a.rating_score ?? 0))
    else if (sortBy === 'updated') sorted.sort((a, b) => (b.date_updated ?? '').localeCompare(a.date_updated ?? ''))
    else if (sortBy === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name))
    return sorted
  }, [allMods, searchQuery, sortBy, categoryFilter])

  // Reset visible count when filter changes
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [searchQuery, sortBy, categoryFilter])

  function handleAddThunderstoreMod(ts: ThunderstoreMod) {
    if (modpackMods.some(m => m.source === 'thunderstore' && m.namespace === ts.owner && m.name === ts.name)) return
    setModpackMods([...modpackMods, {
      name: ts.name,
      source: 'thunderstore',
      namespace: ts.owner,
      version: ts.latest.version_number,
      downloadUrl: getDownloadUrl(ts.owner, ts.name, ts.latest.version_number),
      description: ts.latest.description?.slice(0, 120),
    }])
  }

  function handleAddPrivateMod() {
    if (!privName.trim() || !privFilename.trim()) return
    setModpackMods([...modpackMods, {
      name: privName.trim(),
      source: 'private',
      filename: privFilename.trim(),
      downloadUrl: `/mods/private/${privFilename.trim()}`,
    }])
    setPrivName('')
    setPrivFilename('')
  }

  function handleRemoveMod(index: number) {
    setModpackMods(modpackMods.filter((_, i) => i !== index))
  }

  function handleUpdateModVersion(index: number, version: string) {
    setModpackMods(modpackMods.map((m, i) => {
      if (i !== index) return m
      const updated = { ...m, version }
      if (m.source === 'thunderstore' && m.namespace) {
        updated.downloadUrl = getDownloadUrl(m.namespace, m.name, version)
      }
      return updated
    }))
  }

  function handleAddConfig() {
    if (!cfgFilename.trim()) return
    setModpackConfigs([...modpackConfigs, {
      mod: cfgMod.trim(),
      filename: cfgFilename.trim(),
      installPath: cfgInstallPath.trim() || `BepInEx/config/${cfgFilename.trim()}`,
      content: cfgContent,
    }])
    setCfgMod('')
    setCfgFilename('')
    setCfgInstallPath('')
    setCfgContent('')
  }

  function handleRemoveConfig(index: number) {
    setModpackConfigs(modpackConfigs.filter((_, i) => i !== index))
  }

  async function handlePublish() {
    if (!adminToken) {
      setError('Sessão de admin expirada. Faça login novamente.')
      return
    }
    setPublishing(true)
    setError('')
    try {
      await publishModpack(adminToken, target, {
        version: packVersion,
        name: packName,
        description: packDescription,
        updatedAt: new Date().toISOString(),
        mods: modpackMods,
        configs: modpackConfigs,
      }, undefined, backendUrl)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setPublishing(false)
    }
  }

  const visibleMods = filteredMods.slice(0, visibleCount)
  const hasMore = visibleCount < filteredMods.length

  return (
    <div className="admin-view modpack-editor">
      <div className="admin-header">
        <h1>Editor de Modpack</h1>
        <p className="text-secondary">Navegue mods do Thunderstore e monte seu modpack.</p>
      </div>

      {/* Target selector */}
      <div className="admin-section card">
        <div className="card-body">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Modpack alvo</label>
            <div className="search-row" style={{ marginBottom: 0 }}>
              <button
                className={target === 'main' ? 'btn-secondary' : 'btn-ghost'}
                onClick={() => setTarget('main')}
              >
                Servidor Principal (público)
              </button>
              <button
                className={target === 'admin' ? 'btn-secondary' : 'btn-ghost'}
                onClick={() => setTarget('admin')}
              >
                Teste Admin (secreto)
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Tabs */}
      <div className="admin-tabs">
        <button className={`admin-tab ${activeTab === 'online' ? 'active' : ''}`} onClick={() => setActiveTab('online')}>
          Online (Thunderstore)
        </button>
        <button className={`admin-tab ${activeTab === 'modpack' ? 'active' : ''}`} onClick={() => setActiveTab('modpack')}>
          Modpack ({modpackMods.length} mods)
        </button>
        <button className={`admin-tab ${activeTab === 'configs' ? 'active' : ''}`} onClick={() => setActiveTab('configs')}>
          Configs ({modpackConfigs.length})
        </button>
      </div>

      {/* ── ONLINE TAB ── */}
      {activeTab === 'online' && (
        <div className="ts-browser-panel">
          <ErrorBoundary>
            <div className="ts-filters">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar por nome, autor ou descrição..."
                className="ts-search-input"
              />
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="ts-select">
                <option value="">Todas as categorias</option>
                {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} className="ts-select">
                <option value="downloads">+ Downloads</option>
                <option value="rating">+ Avaliações</option>
                <option value="updated">Mais recentes</option>
                <option value="name">Nome A-Z</option>
              </select>
            </div>

            {modsError && (
              <div className="error-banner" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ flex: 1 }}>{modsError}</span>
                <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => {
                  clearModsCache()
                  setAllMods([])
                  loadMods()
                }}>Tentar novamente</button>
              </div>
            )}

            {loadingMods ? (
              <div className="ts-loading-state">
                <div className="ts-loading-spinner" />
                <p>Carregando mods do Thunderstore...</p>
                <p className="text-muted" style={{ fontSize: 12 }}>Isso pode levar alguns segundos na primeira vez</p>
              </div>
            ) : (
              <>
                <p className="ts-result-count text-muted">
                  {allMods.length === 0
                    ? 'Nenhum mod carregado'
                    : `Mostrando ${Math.min(visibleCount, filteredMods.length)} de ${filteredMods.length} mods${categoryFilter || searchQuery ? ` (${allMods.length} total)` : ''}`
                  }
                </p>
                <div className="ts-mod-list">
                  {visibleMods.map(mod => {
                    const already = modpackMods.some(m => m.source === 'thunderstore' && m.namespace === mod.owner && m.name === mod.name)
                    return (
                      <div key={mod.full_name} className={`ts-mod-item ${already ? 'ts-mod-added' : ''}`}>
                        {mod.latest.icon ? (
                          <img
                            className="ts-mod-icon"
                            src={mod.latest.icon}
                            alt={mod.name}
                            loading="lazy"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                        ) : (
                          <div className="ts-mod-icon ts-mod-icon-placeholder" />
                        )}
                        <div className="ts-mod-info">
                          <span className="ts-mod-name">{mod.name}</span>
                          <span className="ts-mod-meta">
                            {mod.owner} · v{mod.latest.version_number} · ↓ {(mod.total_downloads ?? 0).toLocaleString()}
                          </span>
                          <span className="ts-mod-desc">{mod.latest.description?.slice(0, 100)}</span>
                          {mod.categories && mod.categories.length > 0 && (
                            <div className="ts-mod-badges">
                              {mod.categories.slice(0, 2).map(cat => (
                                <span key={cat} className="ts-mod-badge">{cat}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          className={already ? 'btn-ghost' : 'btn-secondary'}
                          style={{ flexShrink: 0, fontSize: 13 }}
                          onClick={() => handleAddThunderstoreMod(mod)}
                          disabled={already}
                        >
                          {already ? '✓ No modpack' : '+ Adicionar'}
                        </button>
                      </div>
                    )
                  })}
                </div>
                {hasMore && (
                  <div className="ts-load-more">
                    <button className="btn-ghost ts-load-more-btn" onClick={() => setVisibleCount(v => v + PAGE_SIZE)}>
                      Carregar mais {Math.min(PAGE_SIZE, filteredMods.length - visibleCount)} mods
                    </button>
                    <span className="text-muted" style={{ fontSize: 12 }}>
                      {filteredMods.length - visibleCount} restantes
                    </span>
                  </div>
                )}
              </>
            )}
          </ErrorBoundary>
        </div>
      )}

      {/* ── MODPACK TAB ── */}
      {activeTab === 'modpack' && (
        <>
          {/* Pack metadata */}
          <div className="admin-section card">
            <div className="card-header"><h3>Informações do Modpack</h3></div>
            <div className="card-body">
              <div className="form-group">
                <label>Nome</label>
                <input type="text" value={packName} onChange={e => setPackName(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Descrição</label>
                <input type="text" value={packDescription} onChange={e => setPackDescription(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Versão</label>
                <input type="text" value={packVersion} onChange={e => setPackVersion(e.target.value)} style={{ width: '150px' }} />
              </div>
            </div>
          </div>

          {/* Current modpack mods */}
          <div className="admin-section card">
            <div className="card-header">
              <h3>Mods do Modpack ({modpackMods.length})</h3>
              <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setActiveTab('online')}>
                + Adicionar mods
              </button>
            </div>
            <div className="card-body">
              {modpackMods.length === 0 ? (
                <p className="text-muted">
                  Nenhum mod adicionado.{' '}
                  <button className="btn-link" onClick={() => setActiveTab('online')}>
                    Ir para a aba Online
                  </button>{' '}
                  para adicionar mods do Thunderstore.
                </p>
              ) : (
                <div className="modpack-mods">
                  {modpackMods.map((mod, index) => (
                    <div key={`${mod.name}-${index}`} className="modpack-mod-item">
                      <div className="mod-info">
                        <span className="mod-name">
                          {mod.name}{' '}
                          <span className={`badge ${mod.source === 'private' ? 'badge-warning' : 'badge-update'}`}>
                            {mod.source === 'private' ? 'privado' : 'thunderstore'}
                          </span>
                        </span>
                        {mod.source === 'thunderstore' ? (
                          <input type="text" value={mod.version || ''} className="version-input"
                            onChange={e => handleUpdateModVersion(index, e.target.value)} />
                        ) : (
                          <span className="text-muted">{mod.filename}</span>
                        )}
                      </div>
                      <button className="btn-ghost btn-remove" onClick={() => handleRemoveMod(index)}>Remover</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Private mod */}
          <div className="admin-section card">
            <div className="card-header"><h3>Adicionar Mod Privado</h3></div>
            <div className="card-body">
              <div className="search-row">
                <input type="text" value={privName} onChange={e => setPrivName(e.target.value)} placeholder="Nome do mod" />
                <input type="text" value={privFilename} onChange={e => setPrivFilename(e.target.value)} placeholder="arquivo.zip" />
                <button className="btn-secondary" onClick={handleAddPrivateMod} disabled={!privName.trim() || !privFilename.trim()}>
                  + Adicionar
                </button>
              </div>
              <span className="form-hint">Mods privados são baixados pelo backend a partir do repo privado.</span>
            </div>
          </div>

          <div className="admin-actions">
            <button className="btn-play" style={{ width: 'auto', padding: '12px 32px' }}
              onClick={handlePublish} disabled={publishing}>
              {publishing ? 'Publicando...' : saved ? 'Publicado!' : `Publicar (${target === 'main' ? 'Principal' : 'Admin'})`}
            </button>
          </div>
        </>
      )}

      {/* ── CONFIGS TAB ── */}
      {activeTab === 'configs' && (
        <>
          <div className="admin-section card">
            <div className="card-header"><h3>Adicionar Config</h3></div>
            <div className="card-body">
              <div className="form-group">
                <label>Mod relacionado</label>
                <select value={cfgMod} onChange={e => setCfgMod(e.target.value)}>
                  <option value="">— selecione —</option>
                  {modpackMods.map((m, i) => <option key={i} value={m.name}>{m.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Nome do arquivo</label>
                <input type="text" value={cfgFilename} onChange={e => setCfgFilename(e.target.value)} placeholder="valheim_plus.cfg" />
              </div>
              <div className="form-group">
                <label>Caminho de instalação</label>
                <input type="text" value={cfgInstallPath} onChange={e => setCfgInstallPath(e.target.value)} placeholder="BepInEx/config/valheim_plus.cfg" />
                <span className="form-hint">Relativo ao perfil. Vazio = BepInEx/config/&lt;arquivo&gt;.</span>
              </div>
              <div className="form-group">
                <label>Conteúdo (texto literal ou URL http)</label>
                <textarea value={cfgContent} onChange={e => setCfgContent(e.target.value)} rows={6}
                  placeholder="# Conteúdo do config aqui, ou uma URL https para buscar" />
              </div>
              <button className="btn-secondary" onClick={handleAddConfig} disabled={!cfgFilename.trim()}>
                + Adicionar Config
              </button>
            </div>
          </div>

          <div className="admin-section card">
            <div className="card-header"><h3>Configs do Modpack ({modpackConfigs.length})</h3></div>
            <div className="card-body">
              {modpackConfigs.length === 0 ? (
                <p className="text-muted">Nenhuma config adicionada.</p>
              ) : (
                <div className="modpack-mods">
                  {modpackConfigs.map((cfg, index) => (
                    <div key={`${cfg.filename}-${index}`} className="modpack-mod-item">
                      <div className="mod-info">
                        <span className="mod-name">{cfg.filename}</span>
                        <span className="text-muted">{cfg.installPath}{cfg.mod ? ` · ${cfg.mod}` : ''}</span>
                      </div>
                      <button className="btn-ghost btn-remove" onClick={() => handleRemoveConfig(index)}>Remover</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="admin-actions">
            <button className="btn-play" style={{ width: 'auto', padding: '12px 32px' }}
              onClick={handlePublish} disabled={publishing}>
              {publishing ? 'Publicando...' : saved ? 'Publicado!' : `Publicar (${target === 'main' ? 'Principal' : 'Admin'})`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
