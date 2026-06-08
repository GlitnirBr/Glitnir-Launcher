import { useState, useEffect, useCallback } from 'react'
import { Config, Mod, ModConfig, Modpack } from '../types'
import { searchMods, ThunderstoreMod, getDownloadUrl } from '../utils/thunderstoreApi'
import { fetchModpackFromUrl, buildModpackRawUrl } from '../utils/modManager'
import { getAdminModpack, publishModpack } from '../utils/backendApi'
import './AdminView.css'

interface Props {
  config: Config
  adminToken: string | null
  onSave: (updates: Partial<Config>) => Promise<void>
}

type Target = 'main' | 'admin'

export default function AdminView({ config, adminToken, onSave }: Props) {
  const [activeTab, setActiveTab] = useState<'config' | 'modpack' | 'configs'>('config')

  // Config tab
  const [backendUrl, setBackendUrl] = useState(config.backendUrl || '')
  const [modpackRepo, setModpackRepo] = useState(config.modpackRepo || '')
  const [modpackBranch, setModpackBranch] = useState(config.modpackBranch || 'main')
  const [newsUrl, setNewsUrl] = useState(config.newsUrl || '')

  // Modpack tab
  const [target, setTarget] = useState<Target>('main')
  const [packName, setPackName] = useState('')
  const [packDescription, setPackDescription] = useState('')
  const [packVersion, setPackVersion] = useState('1.0.0')
  const [modpackMods, setModpackMods] = useState<Mod[]>([])
  const [modpackConfigs, setModpackConfigs] = useState<ModConfig[]>([])

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ThunderstoreMod[]>([])
  const [searching, setSearching] = useState(false)

  // Private mod form
  const [privName, setPrivName] = useState('')
  const [privFilename, setPrivFilename] = useState('')

  // Config form
  const [cfgMod, setCfgMod] = useState('')
  const [cfgFilename, setCfgFilename] = useState('')
  const [cfgInstallPath, setCfgInstallPath] = useState('')
  const [cfgContent, setCfgContent] = useState('')

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [publishing, setPublishing] = useState(false)

  const loadModpackForEdit = useCallback(async () => {
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
      // modpack ainda não existe — começa vazio
      setPackName(target === 'admin' ? 'Modpack Teste Admin' : 'Modpack Servidor Principal')
      setPackDescription('')
      setPackVersion('1.0.0')
      setModpackMods([])
      setModpackConfigs([])
    }
  }, [target, adminToken, backendUrl, modpackRepo, modpackBranch])

  useEffect(() => {
    if (activeTab === 'modpack' || activeTab === 'configs') loadModpackForEdit()
  }, [activeTab, loadModpackForEdit])

  async function handleSaveConfig() {
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      await onSave({ backendUrl, modpackRepo, modpackBranch, newsUrl })
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
      setSearchResults(await searchMods(searchQuery))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSearching(false)
    }
  }

  function handleAddThunderstoreMod(ts: ThunderstoreMod) {
    if (modpackMods.some(m => m.source === 'thunderstore' && m.namespace === ts.owner && m.name === ts.name)) return
    const mod: Mod = {
      name: ts.name,
      source: 'thunderstore',
      namespace: ts.owner,
      version: ts.latest.version_number,
      downloadUrl: getDownloadUrl(ts.owner, ts.name, ts.latest.version_number),
      description: ts.latest.description?.slice(0, 120),
    }
    setModpackMods([...modpackMods, mod])
    setSearchResults([])
    setSearchQuery('')
  }

  function handleAddPrivateMod() {
    if (!privName.trim() || !privFilename.trim()) return
    const mod: Mod = {
      name: privName.trim(),
      source: 'private',
      filename: privFilename.trim(),
      downloadUrl: `/mods/private/${privFilename.trim()}`,
    }
    setModpackMods([...modpackMods, mod])
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
    const installPath = cfgInstallPath.trim() || `BepInEx/config/${cfgFilename.trim()}`
    const cfg: ModConfig = {
      mod: cfgMod.trim(),
      filename: cfgFilename.trim(),
      installPath,
      content: cfgContent,
    }
    setModpackConfigs([...modpackConfigs, cfg])
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
      const modpack: Modpack = {
        version: packVersion,
        name: packName,
        description: packDescription,
        updatedAt: new Date().toISOString(),
        mods: modpackMods,
        configs: modpackConfigs,
      }
      await publishModpack(adminToken, target, modpack, undefined, backendUrl)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setPublishing(false)
    }
  }

  const hasConfigChanges =
    backendUrl !== (config.backendUrl || '') ||
    modpackRepo !== (config.modpackRepo || '') ||
    modpackBranch !== (config.modpackBranch || 'main') ||
    newsUrl !== (config.newsUrl || '')

  return (
    <div className="admin-view">
      <div className="admin-header">
        <h1>Painel Admin</h1>
        <p className="text-secondary">Gerencie configurações, modpacks e configs dos mods.</p>
      </div>

      <div className="admin-tabs">
        <button className={`admin-tab ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')}>
          Configurações
        </button>
        <button className={`admin-tab ${activeTab === 'modpack' ? 'active' : ''}`} onClick={() => setActiveTab('modpack')}>
          Modpack
        </button>
        <button className={`admin-tab ${activeTab === 'configs' ? 'active' : ''}`} onClick={() => setActiveTab('configs')}>
          Configs dos Mods
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {activeTab !== 'config' && (
        <div className="admin-section card">
          <div className="card-body">
            <div className="form-group">
              <label>Modpack alvo</label>
              <div className="search-row">
                <button className={`btn-${target === 'main' ? 'secondary' : 'ghost'}`} onClick={() => setTarget('main')}>
                  Servidor Principal (público)
                </button>
                <button className={`btn-${target === 'admin' ? 'secondary' : 'ghost'}`} onClick={() => setTarget('admin')}>
                  Teste Admin (secreto)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'config' && (
        <>
          <div className="admin-section card">
            <div className="card-header"><h3>Backend e Repositório</h3></div>
            <div className="card-body">
              <div className="form-group">
                <label>URL do Backend (Cloudflare)</label>
                <input type="text" value={backendUrl} onChange={e => setBackendUrl(e.target.value)}
                  placeholder="https://glitnir-launcher-backend.workers.dev" />
                <span className="form-hint">Usado para login, publicar modpacks e mods privados.</span>
              </div>
              <div className="form-group">
                <label>Repositório do Modpack (owner/repo)</label>
                <input type="text" value={modpackRepo} onChange={e => setModpackRepo(e.target.value)}
                  placeholder="GlitnirBr/glitnir-modpack" />
                <span className="form-hint">Onde fica o modpack.json público (lido via raw GitHub).</span>
              </div>
              <div className="form-group">
                <label>Branch</label>
                <input type="text" value={modpackBranch} onChange={e => setModpackBranch(e.target.value)}
                  placeholder="main" style={{ width: '150px' }} />
              </div>
              <div className="form-group">
                <label>URL das Notícias (opcional)</label>
                <input type="text" value={newsUrl} onChange={e => setNewsUrl(e.target.value)}
                  placeholder="https://raw.githubusercontent.com/.../news.json" />
              </div>
            </div>
          </div>

          <div className="admin-actions">
            <button className="btn-play" style={{ width: 'auto', padding: '12px 32px' }}
              onClick={handleSaveConfig} disabled={!hasConfigChanges || saving}>
              {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar'}
            </button>
          </div>
        </>
      )}

      {activeTab === 'modpack' && (
        <>
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
              <div className="form-group">
                <label>Versão</label>
                <input type="text" value={packVersion} onChange={e => setPackVersion(e.target.value)}
                  style={{ width: '150px' }} />
              </div>
            </div>
          </div>

          <div className="admin-section card">
            <div className="card-header"><h3>Buscar Mods no Thunderstore</h3></div>
            <div className="card-body">
              <div className="search-row">
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Digite o nome do mod..." onKeyDown={e => e.key === 'Enter' && handleSearch()} />
                <button className="btn-secondary" onClick={handleSearch} disabled={searching}>
                  {searching ? 'Buscando...' : 'Buscar'}
                </button>
              </div>
              {searchResults.length > 0 && (
                <div className="search-results">
                  {searchResults.map(mod => {
                    const already = modpackMods.some(m => m.source === 'thunderstore' && m.namespace === mod.owner && m.name === mod.name)
                    return (
                      <div key={mod.full_name} className="search-result-item">
                        <div className="result-info">
                          <span className="result-name">{mod.name}</span>
                          <span className="result-owner">por {mod.owner}</span>
                          <span className="result-version">v{mod.latest.version_number}</span>
                        </div>
                        <button className="btn-ghost" onClick={() => handleAddThunderstoreMod(mod)} disabled={already}>
                          {already ? 'Adicionado' : '+ Adicionar'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="admin-section card">
            <div className="card-header"><h3>Adicionar Mod Privado</h3></div>
            <div className="card-body">
              <div className="search-row">
                <input type="text" value={privName} onChange={e => setPrivName(e.target.value)}
                  placeholder="Nome do mod" />
                <input type="text" value={privFilename} onChange={e => setPrivFilename(e.target.value)}
                  placeholder="arquivo.zip" />
                <button className="btn-secondary" onClick={handleAddPrivateMod} disabled={!privName.trim() || !privFilename.trim()}>
                  + Adicionar
                </button>
              </div>
              <span className="form-hint">Mods privados são baixados pelo backend a partir do repo privado.</span>
            </div>
          </div>

          <div className="admin-section card">
            <div className="card-header"><h3>Mods do Modpack ({modpackMods.length})</h3></div>
            <div className="card-body">
              {modpackMods.length === 0 ? (
                <p className="text-muted">Nenhum mod adicionado.</p>
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

          <div className="admin-actions">
            <button className="btn-play" style={{ width: 'auto', padding: '12px 32px' }}
              onClick={handlePublish} disabled={publishing}>
              {publishing ? 'Publicando...' : saved ? 'Publicado!' : `Publicar (${target === 'main' ? 'Principal' : 'Admin'})`}
            </button>
          </div>
        </>
      )}

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
                <input type="text" value={cfgFilename} onChange={e => setCfgFilename(e.target.value)}
                  placeholder="valheim_plus.cfg" />
              </div>
              <div className="form-group">
                <label>Caminho de instalação</label>
                <input type="text" value={cfgInstallPath} onChange={e => setCfgInstallPath(e.target.value)}
                  placeholder="BepInEx/config/valheim_plus.cfg" />
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
