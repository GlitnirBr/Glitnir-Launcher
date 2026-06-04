import { useState, useEffect } from 'react'
import { Config, Mod, Modpack } from '../types'
import { searchMods, ThunderstoreMod, getThunderstoreId } from '../utils/thunderstoreApi'
import { updateGist, extractGistId } from '../utils/githubApi'
import './AdminView.css'

interface ModpackConfig {
  id: string
  name: string
  gistUrl: string | null
  builtin?: boolean
}

interface Props {
  config: Config
  modpacks: ModpackConfig[]
  onSave: (updates: Partial<Config>) => Promise<void>
  onUpdateModpacks: (modpacks: ModpackConfig[]) => Promise<void>
}

export default function AdminView({ config, modpacks, onSave, onUpdateModpacks }: Props) {
  const [activeTab, setActiveTab] = useState<'config' | 'modpack' | 'news'>('config')

  // Config tab state
  const [glitnirGistUrl, setGlitnirGistUrl] = useState(config.glitnirGistUrl)
  const [newsGistUrl, setNewsGistUrl] = useState((config as any).newsGistUrl || '')
  const [githubToken, setGithubToken] = useState((config as any).githubToken || '')
  const [adminPassword, setAdminPassword] = useState((config as any).adminPassword || '')

  // Modpack tab state
  const [currentModpack, setCurrentModpack] = useState<Modpack | null>(null)
  const [modpackMods, setModpackMods] = useState<Mod[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ThunderstoreMod[]>([])
  const [searching, setSearching] = useState(false)
  const [modpackVersion, setModpackVersion] = useState('')
  const [changelogEntry, setChangelogEntry] = useState('')

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [publishing, setPublishing] = useState(false)

  // Load current modpack
  useEffect(() => {
    async function loadModpack() {
      if (!config.glitnirGistUrl) return
      try {
        const res = await fetch(config.glitnirGistUrl + '?t=' + Date.now())
        if (res.ok) {
          const data = await res.json()
          setCurrentModpack(data)
          setModpackMods(data.mods || [])
          setModpackVersion(data.version || '1.0.0')
        }
      } catch {
        // ignore
      }
    }
    loadModpack()
  }, [config.glitnirGistUrl])

  async function handleSaveConfig() {
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      await onSave({
        glitnirGistUrl,
        ...({ newsGistUrl, githubToken, adminPassword: adminPassword || undefined } as any)
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return
    setSearching(true)
    setError('')
    try {
      const results = await searchMods(searchQuery)
      setSearchResults(results)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSearching(false)
    }
  }

  function handleAddMod(tsMod: ThunderstoreMod) {
    const newMod: Mod = {
      name: tsMod.name,
      version: tsMod.latest.version_number,
      thunderstoreId: getThunderstoreId(tsMod),
      description: tsMod.latest.description.slice(0, 100)
    }

    if (modpackMods.some(m => m.thunderstoreId === newMod.thunderstoreId)) {
      return // Already added
    }

    setModpackMods([...modpackMods, newMod])
    setSearchResults([])
    setSearchQuery('')
  }

  function handleRemoveMod(thunderstoreId: string) {
    setModpackMods(modpackMods.filter(m => m.thunderstoreId !== thunderstoreId))
  }

  function handleUpdateModVersion(thunderstoreId: string, version: string) {
    setModpackMods(modpackMods.map(m =>
      m.thunderstoreId === thunderstoreId ? { ...m, version } : m
    ))
  }

  async function handlePublishModpack() {
    if (!githubToken) {
      setError('Configure o token do GitHub primeiro')
      return
    }

    const gistId = extractGistId(glitnirGistUrl)
    if (!gistId) {
      setError('URL do Gist invalida')
      return
    }

    setPublishing(true)
    setError('')

    try {
      const newChangelog = changelogEntry.trim()
        ? [{
            version: modpackVersion,
            date: new Date().toISOString().split('T')[0],
            changes: changelogEntry.split('\n').filter(l => l.trim())
          }, ...(currentModpack?.changelog || [])]
        : currentModpack?.changelog || []

      const newModpack: Modpack = {
        version: modpackVersion,
        updatedAt: new Date().toISOString(),
        changelog: newChangelog,
        mods: modpackMods
      }

      await updateGist(gistId, githubToken, {
        'modpack.json': { content: JSON.stringify(newModpack, null, 2) }
      })

      setCurrentModpack(newModpack)
      setChangelogEntry('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setPublishing(false)
    }
  }

  const hasConfigChanges =
    glitnirGistUrl !== config.glitnirGistUrl ||
    newsGistUrl !== ((config as any).newsGistUrl || '') ||
    githubToken !== ((config as any).githubToken || '') ||
    adminPassword !== ((config as any).adminPassword || '')

  return (
    <div className="admin-view">
      <div className="admin-header">
        <h1>Painel Admin</h1>
        <p className="text-secondary">Gerencie o servidor, modpacks e noticias.</p>
      </div>

      <div className="admin-tabs">
        <button
          className={`admin-tab ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          Configuracoes
        </button>
        <button
          className={`admin-tab ${activeTab === 'modpack' ? 'active' : ''}`}
          onClick={() => setActiveTab('modpack')}
        >
          Modpack
        </button>
        <button
          className={`admin-tab ${activeTab === 'news' ? 'active' : ''}`}
          onClick={() => setActiveTab('news')}
        >
          Noticias
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {activeTab === 'config' && (
        <>
          <div className="admin-section card">
            <div className="card-header">
              <h3>URLs dos Gists</h3>
            </div>
            <div className="card-body">
              <div className="form-group">
                <label>URL do Modpack Glitnir</label>
                <input
                  type="text"
                  value={glitnirGistUrl}
                  onChange={e => setGlitnirGistUrl(e.target.value)}
                  placeholder="https://gist.githubusercontent.com/.../modpack.json"
                />
                <span className="form-hint">URL raw do arquivo modpack.json no Gist.</span>
              </div>

              <div className="form-group">
                <label>URL das Noticias</label>
                <input
                  type="text"
                  value={newsGistUrl}
                  onChange={e => setNewsGistUrl(e.target.value)}
                  placeholder="https://gist.githubusercontent.com/.../news.json"
                />
                <span className="form-hint">URL raw do arquivo news.json no Gist (opcional).</span>
              </div>

              <div className="form-group">
                <label>Token GitHub (para publicar)</label>
                <input
                  type="password"
                  value={githubToken}
                  onChange={e => setGithubToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxx"
                />
                <span className="form-hint">Token com permissao de Gist. Necessario para publicar modpack.</span>
              </div>

              <div className="form-group">
                <label>Senha de Admin</label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  placeholder="Deixe vazio para usar padrao (glitnir2024)"
                />
                <span className="form-hint">Senha para acessar o painel admin. Padrao: glitnir2024</span>
              </div>
            </div>
          </div>

          <div className="admin-actions">
            <button
              className="btn-play"
              style={{ width: 'auto', padding: '12px 32px' }}
              onClick={handleSaveConfig}
              disabled={!hasConfigChanges || saving}
            >
              {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar'}
            </button>
          </div>
        </>
      )}

      {activeTab === 'modpack' && (
        <>
          <div className="admin-section card">
            <div className="card-header">
              <h3>Buscar Mods no Thunderstore</h3>
            </div>
            <div className="card-body">
              <div className="search-row">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Digite o nome do mod..."
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
                <button className="btn-secondary" onClick={handleSearch} disabled={searching}>
                  {searching ? 'Buscando...' : 'Buscar'}
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="search-results">
                  {searchResults.map(mod => (
                    <div key={mod.full_name} className="search-result-item">
                      <div className="result-info">
                        <span className="result-name">{mod.name}</span>
                        <span className="result-owner">por {mod.owner}</span>
                        <span className="result-version">v{mod.latest.version_number}</span>
                      </div>
                      <button
                        className="btn-ghost"
                        onClick={() => handleAddMod(mod)}
                        disabled={modpackMods.some(m => m.thunderstoreId === getThunderstoreId(mod))}
                      >
                        {modpackMods.some(m => m.thunderstoreId === getThunderstoreId(mod)) ? 'Adicionado' : '+ Adicionar'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="admin-section card">
            <div className="card-header">
              <h3>Mods do Modpack ({modpackMods.length})</h3>
            </div>
            <div className="card-body">
              {modpackMods.length === 0 ? (
                <p className="text-muted">Nenhum mod adicionado. Use a busca acima.</p>
              ) : (
                <div className="modpack-mods">
                  {modpackMods.map(mod => (
                    <div key={mod.thunderstoreId} className="modpack-mod-item">
                      <div className="mod-info">
                        <span className="mod-name">{mod.name}</span>
                        <input
                          type="text"
                          value={mod.version}
                          onChange={e => handleUpdateModVersion(mod.thunderstoreId, e.target.value)}
                          className="version-input"
                        />
                      </div>
                      <button
                        className="btn-ghost btn-remove"
                        onClick={() => handleRemoveMod(mod.thunderstoreId)}
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="admin-section card">
            <div className="card-header">
              <h3>Publicar Modpack</h3>
            </div>
            <div className="card-body">
              <div className="form-group">
                <label>Versao do Modpack</label>
                <input
                  type="text"
                  value={modpackVersion}
                  onChange={e => setModpackVersion(e.target.value)}
                  placeholder="1.0.0"
                  style={{ width: '150px' }}
                />
              </div>

              <div className="form-group">
                <label>Changelog (uma mudanca por linha)</label>
                <textarea
                  value={changelogEntry}
                  onChange={e => setChangelogEntry(e.target.value)}
                  placeholder="Adicionado mod X&#10;Atualizado mod Y para v2.0&#10;Removido mod Z"
                  rows={4}
                />
              </div>
            </div>
          </div>

          <div className="admin-actions">
            <button
              className="btn-play"
              style={{ width: 'auto', padding: '12px 32px' }}
              onClick={handlePublishModpack}
              disabled={publishing || modpackMods.length === 0}
            >
              {publishing ? 'Publicando...' : saved ? 'Publicado!' : 'Publicar no Gist'}
            </button>
          </div>
        </>
      )}

      {activeTab === 'news' && (
        <div className="admin-section card">
          <div className="card-header">
            <h3>Gerenciar Noticias</h3>
          </div>
          <div className="card-body">
            <p className="text-muted">Em breve: editor de noticias e eventos.</p>
          </div>
        </div>
      )}
    </div>
  )
}
