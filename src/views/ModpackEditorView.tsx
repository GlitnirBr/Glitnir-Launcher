import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Config, Mod, ModConfig, Modpack } from '../types'
import { fetchAllMods, clearModsCache, ThunderstoreMod, getDownloadUrl } from '../utils/thunderstoreApi'
import { fetchModpackFromUrl, buildModpackRawUrl } from '../utils/modManager'
import { getAdminModpack, publishModpack, uploadPrivateMod, listPrivateMods } from '../utils/backendApi'
import ErrorBoundary from '../components/ErrorBoundary'
import './AdminView.css'

interface Props {
  config: Config
  adminToken: string | null
  onSave?: (updates: Partial<Config>) => Promise<void>
}

type Target = 'main' | 'admin'
type Tab = 'online' | 'modpack' | 'configs'

type PackDraft = {
  name: string
  description: string
  version: string
  battlemetricsId: string
  mods: Mod[]
  configs: ModConfig[]
}

const PAGE_SIZE = 50

export default function ModpackEditorView({ config, adminToken, onSave }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('online')
  const [target, setTarget] = useState<Target>('main')

  const [packName, setPackName] = useState('')
  const [packDescription, setPackDescription] = useState('')
  const [packVersion, setPackVersion] = useState('1.0.0')
  const [packBattlemetricsId, setPackBattlemetricsId] = useState('')
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
  // Private mod upload / repo list
  type PrivateModEntry = { filename: string; size: number; updatedAt: string }
  const [repoMods, setRepoMods] = useState<PrivateModEntry[]>([])
  const [repoLoading, setRepoLoading] = useState(false)
  const [repoError, setRepoError] = useState('')
  const [pendingFile, setPendingFile] = useState<{ filename: string; content: string; size: number } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const [cfgMod, setCfgMod] = useState('')
  const [cfgFilename, setCfgFilename] = useState('')
  const [cfgInstallPath, setCfgInstallPath] = useState('')
  const [cfgContent, setCfgContent] = useState('')
  // Discovered config files from the selected mod's zip
  const configScanCache = useRef<Record<string, { filename: string; installPath: string; content: string }[]>>({})
  const [cfgScanLoading, setCfgScanLoading] = useState(false)
  const [cfgDiscoveredFiles, setCfgDiscoveredFiles] = useState<{ filename: string; installPath: string; content: string }[]>([])

  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [publishing, setPublishing] = useState(false)

  // Config suggestions discovered from mod zip scans
  type ConfigSuggestion = { modName: string; configs: { filename: string; installPath: string; content: string }[] }
  const [suggestedConfigs, setSuggestedConfigs] = useState<ConfigSuggestion[]>([])
  const [scanningMods, setScanningMods] = useState<Set<string>>(new Set())

  // Inline editing of existing configs in the Configs tab
  const [editingConfigIndex, setEditingConfigIndex] = useState<number | null>(null)
  const [editingContent, setEditingContent] = useState('')

  // Local filesystem config reader
  const [localConfigDir, setLocalConfigDir] = useState('')
  const [localConfigFiles, setLocalConfigFiles] = useState<string[]>([])
  const [localConfigLoading, setLocalConfigLoading] = useState(false)
  const [localConfigError, setLocalConfigError] = useState('')
  const [localSelectedFile, setLocalSelectedFile] = useState('')
  const [localFileContent, setLocalFileContent] = useState('')
  const [localFileLoading, setLocalFileLoading] = useState(false)
  const [localFileSaving, setLocalFileSaving] = useState(false)
  const [localFileSaved, setLocalFileSaved] = useState(false)

  // Per-target drafts — persists unsaved changes when switching between modpacks
  const drafts = useRef<Partial<Record<Target, PackDraft>>>({})

  // Pre-fill localConfigDir from saved config on mount
  useEffect(() => {
    if (config.adminProfilePath && !localConfigDir) {
      setLocalConfigDir(config.adminProfilePath)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const backendUrl = config.backendUrl || ''
  const modpackRepo = config.modpackRepo || ''
  const modpackBranch = config.modpackBranch || 'main'

  const applyDraft = useCallback((draft: PackDraft) => {
    setPackName(draft.name)
    setPackDescription(draft.description)
    setPackVersion(draft.version)
    setPackBattlemetricsId(draft.battlemetricsId)
    setModpackMods(draft.mods)
    setModpackConfigs(draft.configs)
  }, [])

  const loadModpack = useCallback(async () => {
    setError('')
    // Restore in-memory draft first — no server round-trip needed
    const draft = drafts.current[target]
    if (draft) {
      applyDraft(draft)
      return
    }
    // First time loading this target — fetch from server
    try {
      let data: Modpack | null = null
      if (target === 'admin') {
        if (!adminToken) return
        data = await getAdminModpack(adminToken, backendUrl)
      } else {
        const url = buildModpackRawUrl(modpackRepo, modpackBranch)
        data = await fetchModpackFromUrl(url)
      }
      const fetched: PackDraft = {
        name: data?.name || (target === 'admin' ? 'Glitnir Admin' : 'Glitnir'),
        description: data?.description || '',
        version: data?.version || '1.0.0',
        battlemetricsId: data?.battlemetricsId || '',
        mods: data?.mods || [],
        configs: data?.configs || [],
      }
      drafts.current[target] = fetched
      applyDraft(fetched)
    } catch {
      const fallback: PackDraft = {
        name: target === 'admin' ? 'Glitnir Admin' : 'Glitnir',
        description: '',
        version: '1.0.0',
        battlemetricsId: '',
        mods: [],
        configs: [],
      }
      applyDraft(fallback)
    }
  }, [target, adminToken, backendUrl, modpackRepo, modpackBranch, applyDraft])

  useEffect(() => { loadModpack() }, [loadModpack])

  // Keep in-memory draft in sync with every edit so switching never loses work
  useEffect(() => {
    drafts.current[target] = {
      name: packName,
      description: packDescription,
      version: packVersion,
      battlemetricsId: packBattlemetricsId,
      mods: modpackMods,
      configs: modpackConfigs,
    }
  }, [target, packName, packDescription, packVersion, packBattlemetricsId, modpackMods, modpackConfigs])

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
    const downloadUrl = getDownloadUrl(ts.owner, ts.name, ts.latest.version_number)
    setModpackMods(prev => [...prev, {
      name: ts.name,
      source: 'thunderstore',
      namespace: ts.owner,
      version: ts.latest.version_number,
      downloadUrl,
      description: ts.latest.description?.slice(0, 120),
    }])
    // Scan the mod zip for bundled config files in background (Electron only)
    const w = window as any
    if (w?.glitnir?.mods?.readConfigsFromZip) {
      setScanningMods(prev => new Set(prev).add(ts.name))
      w.glitnir.mods.readConfigsFromZip({ url: downloadUrl })
        .then((result: { success: boolean; configs?: { filename: string; installPath: string; content: string }[]; error?: string }) => {
          if (result.success && result.configs && result.configs.length > 0) {
            setSuggestedConfigs(prev => {
              const existing = prev.find(s => s.modName === ts.name)
              if (existing) return prev
              return [...prev, { modName: ts.name, configs: result.configs! }]
            })
          }
        })
        .catch(() => {})
        .finally(() => setScanningMods(prev => { const s = new Set(prev); s.delete(ts.name); return s }))
    }
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

  const loadRepoMods = useCallback(() => {
    if (!adminToken) return
    setRepoLoading(true)
    setRepoError('')
    listPrivateMods(adminToken, backendUrl)
      .then(mods => setRepoMods(mods))
      .catch((err: any) => setRepoError(err?.message || 'Erro ao listar mods privados'))
      .finally(() => setRepoLoading(false))
  }, [adminToken, backendUrl])

  async function handlePickFile() {
    const w = window as any
    if (!w?.glitnir?.mods?.pickAndRead) return
    const file = await w.glitnir.mods.pickAndRead()
    if (!file) return
    setPendingFile(file)
    setUploadError('')
    // Auto-fill name from filename (strip extension)
    if (!privName.trim()) {
      setPrivName(file.filename.replace(/\.(zip|dll)$/i, ''))
    }
    setPrivFilename(file.filename)
  }

  async function handleUploadAndAdd() {
    if (!pendingFile || !adminToken) return
    setUploading(true)
    setUploadError('')
    try {
      await uploadPrivateMod(adminToken, pendingFile.filename, pendingFile.content, backendUrl)
      // Add to modpack with the name filled in
      const name = privName.trim() || pendingFile.filename.replace(/\.(zip|dll)$/i, '')
      setModpackMods(prev => [...prev, {
        name,
        source: 'private',
        filename: pendingFile.filename,
        downloadUrl: `/mods/private/${pendingFile.filename}`,
      }])
      // Refresh repo list and reset form
      setPendingFile(null)
      setPrivName('')
      setPrivFilename('')
      loadRepoMods()
    } catch (err: any) {
      setUploadError(err?.message || 'Erro ao fazer upload')
    } finally {
      setUploading(false)
    }
  }

  function handleAddFromRepo(entry: PrivateModEntry) {
    const name = entry.filename.replace(/\.(zip|dll)$/i, '')
    if (modpackMods.some(m => m.source === 'private' && m.filename === entry.filename)) return
    setModpackMods(prev => [...prev, {
      name,
      source: 'private',
      filename: entry.filename,
      downloadUrl: `/mods/private/${entry.filename}`,
    }])
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

  // Scan the selected mod's zip for config files whenever cfgMod changes
  useEffect(() => {
    if (!cfgMod) {
      setCfgDiscoveredFiles([])
      return
    }
    // Serve from cache if available
    if (configScanCache.current[cfgMod]) {
      setCfgDiscoveredFiles(configScanCache.current[cfgMod])
      return
    }
    const mod = modpackMods.find(m => m.name === cfgMod)
    if (!mod || mod.source !== 'thunderstore' || !mod.downloadUrl) {
      setCfgDiscoveredFiles([])
      return
    }
    const w = window as any
    if (!w?.glitnir?.mods?.readConfigsFromZip) return
    setCfgScanLoading(true)
    setCfgDiscoveredFiles([])
    w.glitnir.mods.readConfigsFromZip({ url: mod.downloadUrl })
      .then((result: { success: boolean; configs?: { filename: string; installPath: string; content: string }[] }) => {
        const files = result.success ? (result.configs ?? []) : []
        configScanCache.current[cfgMod] = files
        setCfgDiscoveredFiles(files)
      })
      .catch(() => setCfgDiscoveredFiles([]))
      .finally(() => setCfgScanLoading(false))
  }, [cfgMod, modpackMods])

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

  async function handlePickLocalDir() {
    const dir = await window.glitnir.fs.pickDir()
    if (dir) {
      setLocalConfigDir(dir)
      setLocalConfigFiles([])
      setLocalConfigError('')
      setLocalSelectedFile('')
      setLocalFileContent('')
      onSave?.({ adminProfilePath: dir })
    }
  }

  async function handleListLocalConfigs() {
    const dir = localConfigDir.trim()
    if (!dir) return
    setLocalConfigLoading(true)
    setLocalConfigError('')
    setLocalConfigFiles([])
    setLocalSelectedFile('')
    setLocalFileContent('')
    const result = await window.glitnir.fs.listDir({ dir })
    if (result?.success) {
      setLocalConfigFiles(result.files ?? [])
      onSave?.({ adminProfilePath: dir })
    } else {
      setLocalConfigError(result?.error || 'Erro ao listar arquivos')
    }
    setLocalConfigLoading(false)
  }

  function localFilePath(filename: string) {
    const dir = localConfigDir.replace(/[\\/]+$/, '')
    const sep = dir.includes('\\') ? '\\' : '/'
    return dir + sep + filename
  }

  async function handleOpenLocalFile(filename: string) {
    setLocalSelectedFile(filename)
    setLocalFileContent('')
    setLocalFileLoading(true)
    const result = await window.glitnir.fs.readFile({ filePath: localFilePath(filename) })
    if (result?.success) {
      setLocalFileContent(result.content ?? '')
    } else {
      setLocalFileContent('// Erro ao ler arquivo: ' + (result?.error || ''))
    }
    setLocalFileLoading(false)
  }

  async function handleSaveLocalFile() {
    if (!localSelectedFile || !localConfigDir) return
    setLocalFileSaving(true)
    await window.glitnir.fs.writeFile({ filePath: localFilePath(localSelectedFile), content: localFileContent })
    setLocalFileSaving(false)
    setLocalFileSaved(true)
    setTimeout(() => setLocalFileSaved(false), 2000)
  }

  function handleAddLocalToModpack() {
    if (!localSelectedFile || !localFileContent) return
    const installPath = `BepInEx/config/${localSelectedFile}`
    if (modpackConfigs.some(c => c.filename === localSelectedFile)) return
    setModpackConfigs(prev => [...prev, {
      mod: '',
      filename: localSelectedFile,
      installPath,
      content: localFileContent,
    }])
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
        battlemetricsId: packBattlemetricsId || undefined,
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
                      <div
                        key={mod.full_name}
                        className={`ts-mod-item ${already ? 'ts-mod-added' : ''}`}
                        title="Clique para abrir no Thunderstore"
                        onClick={() => mod.package_url && (window as any).glitnir?.shell?.openExternal(mod.package_url)}
                        style={{ cursor: mod.package_url ? 'pointer' : undefined }}
                      >
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
                          onClick={e => { e.stopPropagation(); handleAddThunderstoreMod(mod) }}
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

            {/* Config suggestions from scanned mod zips */}
            {(scanningMods.size > 0 || suggestedConfigs.length > 0) && (
              <div className="config-suggestions-area">
                {scanningMods.size > 0 && (
                  <div className="config-scan-notice text-muted">
                    Verificando configs em {Array.from(scanningMods).join(', ')}...
                  </div>
                )}
                {suggestedConfigs.map((suggestion, si) => (
                  <div key={`${suggestion.modName}-${si}`} className="config-suggestion-card">
                    <div className="suggestion-card-header">
                      <span>
                        <strong>{suggestion.modName}</strong> — {suggestion.configs.length} arquivo{suggestion.configs.length > 1 ? 's' : ''} de config encontrado{suggestion.configs.length > 1 ? 's' : ''}
                      </span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn-secondary"
                          style={{ fontSize: 12 }}
                          onClick={() => {
                            const toAdd = suggestion.configs
                              .filter(c => !modpackConfigs.some(mc => mc.filename === c.filename))
                              .map(c => ({ mod: suggestion.modName, filename: c.filename, installPath: c.installPath, content: c.content }))
                            if (toAdd.length > 0) setModpackConfigs(prev => [...prev, ...toAdd])
                            setSuggestedConfigs(prev => prev.filter((_, i) => i !== si))
                          }}
                        >
                          + Adicionar todos
                        </button>
                        <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setSuggestedConfigs(prev => prev.filter((_, i) => i !== si))}>
                          Ignorar
                        </button>
                      </div>
                    </div>
                    <div className="suggestion-file-list">
                      {suggestion.configs.map((cfg, ci) => {
                        const alreadyAdded = modpackConfigs.some(mc => mc.filename === cfg.filename)
                        return (
                          <div key={cfg.filename} className="suggestion-file-item">
                            <span className="suggestion-filename">{cfg.filename}</span>
                            <span className="text-muted" style={{ fontSize: 11, flex: 1 }}>{cfg.installPath}</span>
                            {alreadyAdded ? (
                              <span className="text-muted" style={{ fontSize: 12 }}>✓ já adicionado</span>
                            ) : (
                              <button
                                className="btn-ghost"
                                style={{ fontSize: 12 }}
                                onClick={() => {
                                  setModpackConfigs(prev => [...prev, { mod: suggestion.modName, filename: cfg.filename, installPath: cfg.installPath, content: cfg.content }])
                                  setSuggestedConfigs(prev => prev.map((s, i) => i === si
                                    ? { ...s, configs: s.configs.filter((_, j) => j !== ci) }
                                    : s
                                  ).filter(s => s.configs.length > 0))
                                }}
                              >
                                + Adicionar
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
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
                <label>Modpack</label>
                <select
                  value={target}
                  onChange={e => {
                    const t = e.target.value as Target
                    // Save current state before switching — draft sync effect also handles this
                    // but we want it captured synchronously before the target state flip
                    drafts.current[target] = {
                      name: packName,
                      description: packDescription,
                      version: packVersion,
                      mods: modpackMods,
                      configs: modpackConfigs,
                    }
                    setTarget(t)
                  }}
                >
                  <option value="main">Glitnir (servidor público)</option>
                  <option value="admin">Glitnir Admin (secreto)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Descrição</label>
                <input type="text" value={packDescription} onChange={e => setPackDescription(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Versão</label>
                <input type="text" value={packVersion} onChange={e => setPackVersion(e.target.value)} style={{ width: '150px' }} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>BattleMetrics ID do Servidor</label>
                <input
                  type="text"
                  value={packBattlemetricsId}
                  onChange={e => setPackBattlemetricsId(e.target.value)}
                  placeholder="ex: 12345678"
                  style={{ width: '200px' }}
                />
                <span className="form-hint">
                  Exibe status e jogadores na home para todos. Encontre em battlemetrics.com/servers/valheim/<strong>ID</strong>
                </span>
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

          {/* Private mods */}
          <div className="admin-section card">
            <div className="card-header">
              <h3>Mods Privados</h3>
              <button
                className="btn-ghost"
                style={{ fontSize: 12 }}
                onClick={loadRepoMods}
                disabled={repoLoading}
              >
                {repoLoading ? 'Carregando...' : '↻ Listar do repo'}
              </button>
            </div>
            <div className="card-body">

              {/* Upload new file */}
              <div className="priv-upload-area">
                <div className="priv-upload-row">
                  <button className="btn-ghost priv-pick-btn" onClick={handlePickFile}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17,8 12,3 7,8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Selecionar arquivo (.zip / .dll)
                  </button>
                  {pendingFile && (
                    <span className="priv-file-preview">
                      <strong>{pendingFile.filename}</strong>
                      <span className="text-muted"> ({(pendingFile.size / 1024).toFixed(0)} KB)</span>
                    </span>
                  )}
                </div>

                {pendingFile && (
                  <div className="priv-upload-form">
                    <input
                      type="text"
                      value={privName}
                      onChange={e => setPrivName(e.target.value)}
                      placeholder="Nome do mod (ex: MeuPlugin)"
                      style={{ flex: 1 }}
                    />
                    <button
                      className="btn-secondary"
                      onClick={handleUploadAndAdd}
                      disabled={uploading || !privName.trim()}
                    >
                      {uploading ? 'Enviando...' : '↑ Upload e Adicionar'}
                    </button>
                    <button className="btn-ghost" onClick={() => { setPendingFile(null); setPrivName(''); setPrivFilename('') }}>
                      ✕
                    </button>
                  </div>
                )}
                {uploadError && <p className="text-error" style={{ marginTop: 8, fontSize: 12 }}>{uploadError}</p>}
              </div>

              {/* Existing mods in repo */}
              {repoError && <p className="text-error" style={{ fontSize: 12, marginBottom: 8 }}>{repoError}</p>}
              {repoMods.length > 0 && (
                <div className="priv-repo-list">
                  <p className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>Arquivos disponíveis no repo:</p>
                  {repoMods.map(entry => {
                    const inPack = modpackMods.some(m => m.source === 'private' && m.filename === entry.filename)
                    return (
                      <div key={entry.filename} className="priv-repo-item">
                        <div className="priv-repo-info">
                          <span className="priv-repo-filename">{entry.filename}</span>
                          <span className="text-muted" style={{ fontSize: 11 }}>
                            {(entry.size / 1024).toFixed(0)} KB · {new Date(entry.updatedAt).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                        {inPack ? (
                          <span className="text-muted" style={{ fontSize: 12 }}>✓ no modpack</span>
                        ) : (
                          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => handleAddFromRepo(entry)}>
                            + Adicionar
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              {repoMods.length === 0 && !repoLoading && !repoError && (
                <p className="text-muted" style={{ fontSize: 12 }}>
                  Clique em "↻ Listar do repo" para ver os arquivos já disponíveis.
                </p>
              )}
            </div>
          </div>

          <div className="admin-actions">
            <button className="btn-play" style={{ width: 'auto', padding: '12px 32px' }}
              onClick={handlePublish} disabled={publishing}>
              {publishing ? 'Publicando...' : saved ? 'Publicado!' : `Publicar (${target === 'main' ? 'Glitnir' : 'Glitnir Admin'})`}
            </button>
          </div>
        </>
      )}

      {/* ── CONFIGS TAB ── */}
      {activeTab === 'configs' && (
        <>
          {/* Local profile config reader */}
          <div className="admin-section card">
            <div className="card-header"><h3>Configs do Perfil Local</h3></div>
            <div className="card-body">
              <div className="form-group">
                <label>Pasta BepInEx/config (r2modman)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={localConfigDir}
                    onChange={e => setLocalConfigDir(e.target.value)}
                    placeholder="C:\Users\...\BepInEx\config"
                    style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
                    onKeyDown={e => e.key === 'Enter' && handleListLocalConfigs()}
                  />
                  <button className="btn-ghost" style={{ fontSize: 13, whiteSpace: 'nowrap' }} onClick={handlePickLocalDir}>
                    Buscar...
                  </button>
                  <button className="btn-secondary" style={{ fontSize: 13, whiteSpace: 'nowrap' }} onClick={handleListLocalConfigs} disabled={!localConfigDir.trim() || localConfigLoading}>
                    {localConfigLoading ? 'Listando...' : 'Listar'}
                  </button>
                </div>
              </div>

              {localConfigError && <p className="text-muted" style={{ color: 'var(--color-error, #e55)', fontSize: 13 }}>{localConfigError}</p>}

              {localConfigFiles.length > 0 && (
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  {/* File list */}
                  <div style={{ width: 220, flexShrink: 0 }}>
                    <p className="text-muted" style={{ fontSize: 11, marginBottom: 4 }}>{localConfigFiles.length} arquivo{localConfigFiles.length > 1 ? 's' : ''}</p>
                    <div className="cfg-file-list" style={{ maxHeight: 320, overflowY: 'auto' }}>
                      {localConfigFiles.map(f => {
                        const inModpack = modpackConfigs.some(c => c.filename === f)
                        return (
                          <button
                            key={f}
                            type="button"
                            className={`cfg-file-option ${localSelectedFile === f ? 'active' : ''}`}
                            onClick={() => handleOpenLocalFile(f)}
                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
                          >
                            <span className="cfg-file-name">{f}</span>
                            {inModpack && <span className="text-muted" style={{ fontSize: 10 }}>✓ no modpack</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Editor pane */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {localFileLoading && <p className="text-muted" style={{ fontSize: 13 }}>Carregando...</p>}
                    {!localFileLoading && localSelectedFile && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{localSelectedFile}</span>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              className="btn-ghost"
                              style={{ fontSize: 12 }}
                              onClick={handleAddLocalToModpack}
                              disabled={modpackConfigs.some(c => c.filename === localSelectedFile)}
                            >
                              {modpackConfigs.some(c => c.filename === localSelectedFile) ? '✓ No modpack' : '+ Adicionar ao modpack'}
                            </button>
                            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={handleSaveLocalFile} disabled={localFileSaving}>
                              {localFileSaved ? 'Salvo!' : localFileSaving ? 'Salvando...' : 'Salvar no disco'}
                            </button>
                          </div>
                        </div>
                        <textarea
                          className="cfg-edit-textarea"
                          value={localFileContent}
                          onChange={e => setLocalFileContent(e.target.value)}
                          rows={16}
                          spellCheck={false}
                          style={{ width: '100%' }}
                        />
                      </>
                    )}
                    {!localFileLoading && !localSelectedFile && (
                      <p className="text-muted" style={{ fontSize: 13, paddingTop: 8 }}>Selecione um arquivo à esquerda para editar.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="admin-section card">
            <div className="card-header"><h3>Adicionar Config</h3></div>
            <div className="card-body">
              <div className="form-group">
                <label>Mod relacionado</label>
                <select
                  value={cfgMod}
                  onChange={e => {
                    setCfgMod(e.target.value)
                    setCfgFilename('')
                    setCfgInstallPath('')
                    setCfgContent('')
                  }}
                >
                  <option value="">— selecione —</option>
                  {modpackMods.map((m, i) => <option key={i} value={m.name}>{m.name}</option>)}
                </select>
              </div>

              {/* Config files discovered from the mod's zip */}
              {cfgMod && (
                <div className="cfg-file-picker form-group">
                  <label>Arquivo de config</label>
                  {cfgScanLoading && (
                    <p className="text-muted" style={{ fontSize: 12, margin: '6px 0' }}>
                      Verificando arquivos de config do mod...
                    </p>
                  )}
                  {!cfgScanLoading && cfgDiscoveredFiles.length > 0 && (
                    <div className="cfg-file-list">
                      {cfgDiscoveredFiles.map(f => (
                        <button
                          key={f.filename}
                          type="button"
                          className={`cfg-file-option ${cfgFilename === f.filename ? 'active' : ''}`}
                          onClick={() => {
                            setCfgFilename(f.filename)
                            setCfgInstallPath(f.installPath)
                            setCfgContent(f.content)
                          }}
                        >
                          <span className="cfg-file-name">{f.filename}</span>
                          <span className="cfg-file-path text-muted">{f.installPath}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {!cfgScanLoading && cfgDiscoveredFiles.length === 0 && cfgMod && (
                    <p className="text-muted" style={{ fontSize: 12, margin: '6px 0' }}>
                      {modpackMods.find(m => m.name === cfgMod)?.source === 'private'
                        ? 'Mods privados: insira o nome do arquivo manualmente abaixo.'
                        : 'Nenhum arquivo .cfg encontrado no zip. Insira manualmente.'}
                    </p>
                  )}
                  {/* Always allow manual override */}
                  <input
                    type="text"
                    value={cfgFilename}
                    onChange={e => setCfgFilename(e.target.value)}
                    placeholder="ou digite o nome do arquivo..."
                    style={{ marginTop: cfgDiscoveredFiles.length > 0 ? 8 : 0 }}
                  />
                </div>
              )}

              {cfgFilename && (
                <>
                  <div className="form-group">
                    <label>Caminho de instalação</label>
                    <input type="text" value={cfgInstallPath} onChange={e => setCfgInstallPath(e.target.value)} placeholder="BepInEx/config/valheim_plus.cfg" />
                    <span className="form-hint">Relativo ao perfil. Vazio = BepInEx/config/&lt;arquivo&gt;.</span>
                  </div>
                  <div className="form-group">
                    <label>Conteúdo</label>
                    <textarea
                      value={cfgContent}
                      onChange={e => setCfgContent(e.target.value)}
                      rows={8}
                      className="cfg-edit-textarea"
                      spellCheck={false}
                      placeholder="# Conteúdo do arquivo, ou uma URL https:// para buscar na instalação"
                    />
                  </div>
                </>
              )}

              <button className="btn-secondary" onClick={handleAddConfig} disabled={!cfgFilename.trim() || !cfgMod}>
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
                  {modpackConfigs.map((cfg, index) => {
                    const isEditing = editingConfigIndex === index
                    return (
                      <div key={`${cfg.filename}-${index}`} className={`modpack-mod-item cfg-item ${isEditing ? 'cfg-item-expanded' : ''}`}>
                        <div className="cfg-item-header">
                          <div className="mod-info">
                            <span className="mod-name">{cfg.filename}</span>
                            <span className="text-muted">{cfg.installPath}{cfg.mod ? ` · ${cfg.mod}` : ''}</span>
                          </div>
                          <div className="cfg-item-actions">
                            <button
                              className="btn-ghost"
                              style={{ fontSize: 12 }}
                              onClick={() => {
                                if (isEditing) {
                                  setEditingConfigIndex(null)
                                } else {
                                  setEditingConfigIndex(index)
                                  setEditingContent(cfg.content)
                                }
                              }}
                            >
                              {isEditing ? 'Fechar' : 'Editar'}
                            </button>
                            <button className="btn-ghost btn-remove" onClick={() => {
                              handleRemoveConfig(index)
                              if (editingConfigIndex === index) setEditingConfigIndex(null)
                            }}>Remover</button>
                          </div>
                        </div>
                        {isEditing && (
                          <div className="cfg-edit-area">
                            <textarea
                              className="cfg-edit-textarea"
                              value={editingContent}
                              onChange={e => setEditingContent(e.target.value)}
                              rows={12}
                              spellCheck={false}
                              placeholder="Conteúdo do arquivo, ou uma URL https:// para buscar no momento da instalação"
                            />
                            <div className="cfg-edit-footer">
                              <span className="text-muted" style={{ fontSize: 11 }}>
                                {editingContent.startsWith('http') ? '🔗 URL — conteúdo será buscado na instalação' : `${editingContent.length} chars`}
                              </span>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  className="btn-secondary"
                                  style={{ fontSize: 13 }}
                                  onClick={() => {
                                    setModpackConfigs(modpackConfigs.map((c, i) => i === index ? { ...c, content: editingContent } : c))
                                    setEditingConfigIndex(null)
                                  }}
                                >
                                  Salvar
                                </button>
                                <button className="btn-ghost" style={{ fontSize: 13 }} onClick={() => setEditingConfigIndex(null)}>
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="admin-actions">
            <button className="btn-play" style={{ width: 'auto', padding: '12px 32px' }}
              onClick={handlePublish} disabled={publishing}>
              {publishing ? 'Publicando...' : saved ? 'Publicado!' : `Publicar (${target === 'main' ? 'Glitnir' : 'Glitnir Admin'})`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
