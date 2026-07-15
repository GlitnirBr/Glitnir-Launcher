import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Config, Mod, ModConfig, Modpack } from '../types'
import { fetchAllMods, clearModsCache, ThunderstoreMod, getDownloadUrl } from '../utils/thunderstoreApi'
import { fetchModpackFromUrl, buildModpackRawUrl, isBinaryConfigPath, byteLength, stripModToReference } from '../utils/modManager'
import { getAdminModpack, getPublicModpack, publishModpack, listPrivateMods, uploadConfig } from '../utils/backendApi'
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

  // Selected version per mod in the Thunderstore browser (key: full_name), defaults to latest
  const [selectedVersions, setSelectedVersions] = useState<Record<string, string>>({})

  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'downloads' | 'rating' | 'updated' | 'name'>('downloads')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showDeprecated, setShowDeprecated] = useState(false)
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
  const [pendingFile, setPendingFile] = useState<{ token: string; filename: string; size: number } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
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
  // installPaths dos configs binários inline que o publish NÃO conseguiu subir pro R2
  // (arquivo não achado no disco). Quando setado, o banner de erro oferece removê-los.
  const [unresolvedBinaries, setUnresolvedBinaries] = useState<string[]>([])

  // ── Import / Export state ────────────────────────────────────────────────
  const [showImportExport, setShowImportExport] = useState(false)
  const [exportCode, setExportCode] = useState('')
  const [importCodeInput, setImportCodeInput] = useState('')
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState('')
  // Qual import está rodando ('' = nenhum). Dá feedback visual e trava os botões durante o
  // trabalho (resolver código no Thunderstore / subir binários ao R2 pode levar segundos).
  const [importing, setImporting] = useState<'' | 'code' | 'file' | 'r2'>('')
  const [codeCopied, setCodeCopied] = useState(false)
  // ─────────────────────────────────────────────────────────────────────────

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
  const [localUploading, setLocalUploading] = useState(false)
  const [localUploadError, setLocalUploadError] = useState('')


  // Per-target drafts — persists unsaved changes when switching between modpacks
  const drafts = useRef<Partial<Record<Target, PackDraft>>>({})
  // Tracks which targets have had their data fetched at least once.
  // The draft-sync effect must not write until after the first fetch, otherwise
  // stale state gets saved as the new target's draft before the server responds.
  const loadedTargets = useRef<Set<Target>>(new Set())

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
    // Restore in-memory draft first — no server round-trip needed.
    // Only use the draft after the target has been loaded at least once;
    // this prevents stale state written by the draft-sync effect (which runs
    // when target changes) from blocking the actual server fetch.
    const draft = drafts.current[target]
    if (draft && loadedTargets.current.has(target)) {
      applyDraft(draft)
      return
    }
    // First time loading this target — fetch from server
    try {
      let data: Modpack | null = null
      if (target === 'admin') {
        if (!adminToken) return
        data = await getAdminModpack(adminToken, backendUrl || undefined)
      } else {
        // Try backend first (uses DEFAULT_BACKEND_URL when backendUrl is empty); fall back to GitHub.
        try {
          data = await getPublicModpack(backendUrl || undefined)
        } catch { /* ignore */ }
        if (!data) {
          const url = buildModpackRawUrl(modpackRepo, modpackBranch)
          data = await fetchModpackFromUrl(url)
        }
      }
      const fetched: PackDraft = {
        name: data?.name || (target === 'admin' ? 'Glitnir Admin' : 'Glitnir'),
        description: data?.description || '',
        version: data?.version || '1.0.0',
        battlemetricsId: data?.battlemetricsId || '',
        mods: data?.mods || [],
        configs: data?.configs || [],
      }
      loadedTargets.current.add(target)
      drafts.current[target] = fetched
      applyDraft(fetched)
    } catch {
      loadedTargets.current.add(target)
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

  // Keep in-memory draft in sync with every edit so switching never loses work.
  // Guard: don't write until loadModpack has fetched data for this target at least once,
  // otherwise changing `target` would snapshot stale state as the new target's draft.
  useEffect(() => {
    if (!loadedTargets.current.has(target)) return
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
    if (!showDeprecated) {
      source = source.filter(m => !m.is_deprecated)
    }
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
  }, [allMods, searchQuery, sortBy, categoryFilter, showDeprecated])

  // Reset visible count when filter changes
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [searchQuery, sortBy, categoryFilter, showDeprecated])

  /** Divide uma referência de dependência do Thunderstore ("Owner-Name-Version") em partes. */
  function parseDependencyRef(ref: string): { owner: string; name: string; version: string } | null {
    const parts = ref.split('-')
    if (parts.length < 3) return null
    return { owner: parts[0], name: parts.slice(1, -1).join('-'), version: parts[parts.length - 1] }
  }

  function handleAddThunderstoreMod(ts: ThunderstoreMod) {
    const alreadyPresent = (owner: string, name: string) =>
      modpackMods.some(m => m.source === 'thunderstore' && m.namespace === owner && m.name === name)

    if (alreadyPresent(ts.owner, ts.name)) return

    // Coleta o mod escolhido e, recursivamente, suas dependências (nas versões fixadas pelo manifesto).
    const toAdd: Mod[] = []
    const seen = new Set<string>()

    function collect(mod: ThunderstoreMod, versionOverride?: string) {
      const key = `${mod.owner}-${mod.name}`
      if (seen.has(key) || alreadyPresent(mod.owner, mod.name)) return
      seen.add(key)
      const version = versionOverride || selectedVersions[mod.full_name] || mod.latest.version_number
      const downloadUrl = getDownloadUrl(mod.owner, mod.name, version)
      toAdd.push({
        name: mod.name,
        source: 'thunderstore',
        namespace: mod.owner,
        version,
        downloadUrl,
        description: mod.latest.description?.slice(0, 120),
      })
      for (const depRef of mod.latest.dependencies || []) {
        const parsed = parseDependencyRef(depRef)
        if (!parsed) continue
        const depMod = allMods.find(m => m.owner === parsed.owner && m.name === parsed.name)
        if (depMod) collect(depMod, parsed.version)
      }
    }

    collect(ts)
    if (toAdd.length === 0) return
    setModpackMods(prev => [...prev, ...toAdd])

    // Scan each newly added mod's zip for bundled config files in background (Electron only)
    const w = window as any
    if (w?.glitnir?.mods?.readConfigsFromZip) {
      for (const mod of toAdd) {
        setScanningMods(prev => new Set(prev).add(mod.name))
        w.glitnir.mods.readConfigsFromZip({ url: mod.downloadUrl })
          .then((result: { success: boolean; configs?: { filename: string; installPath: string; content: string }[]; error?: string }) => {
            if (result.success && result.configs && result.configs.length > 0) {
              setSuggestedConfigs(prev => {
                const existing = prev.find(s => s.modName === mod.name)
                if (existing) return prev
                return [...prev, { modName: mod.name, configs: result.configs! }]
              })
            }
          })
          .catch(() => {})
          .finally(() => setScanningMods(prev => { const s = new Set(prev); s.delete(mod.name); return s }))
      }
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
    if (!window.glitnir?.mods?.pickModFile) return
    // Escolhe o arquivo SEM lê-lo (mods de 300MB+ não passam por IPC como base64).
    // Recebe só um token opaco + metadados; o upload streama do main direto pro Worker.
    const file = await window.glitnir.mods.pickModFile()
    if (!file) return
    setPendingFile(file)
    setUploadError('')
    if (!privName.trim()) {
      setPrivName(file.filename.replace(/\.(zip|dll)$/i, ''))
    }
    setPrivFilename(file.filename)
  }

  async function handleUploadAndAdd() {
    if (!pendingFile || !adminToken) return
    setUploading(true)
    setUploadError('')
    setUploadProgress(0)
    // Progresso vindo do main (upload multipart via Worker → R2).
    window.glitnir.mods.onUploadProgress(({ sent, total }) => {
      setUploadProgress(total > 0 ? Math.round((sent / total) * 100) : 0)
    })
    try {
      const res = await window.glitnir.mods.uploadPrivateModStream({
        token: pendingFile.token,
        backendUrl: backendUrl || '',
        authToken: adminToken,
      })
      if (!res.success || !res.filename) throw new Error(res.error || 'Falha no upload')
      const name = privName.trim() || res.filename.replace(/\.(zip|dll)$/i, '')
      setModpackMods(prev => [...prev, {
        name,
        source: 'private',
        filename: res.filename!,
        downloadUrl: res.downloadUrl || `/mods/private/${res.filename}`,
      }])
      setPendingFile(null)
      setPrivName('')
      setPrivFilename('')
      loadRepoMods()
    } catch (err: any) {
      setUploadError(err?.message || 'Erro ao fazer upload')
    } finally {
      window.glitnir.mods.offUploadProgress()
      setUploading(false)
      setUploadProgress(0)
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

  function handleToggleOptional(index: number) {
    setModpackMods(modpackMods.map((m, i) => i === index ? { ...m, optional: !m.optional } : m))
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
    setLocalUploadError('')
    // Binário não é lido como texto (corromperia e o preview é inútil) — os bytes são
    // lidos só na hora de enviar ao R2, via fs.readFileBase64 em handleAddLocalToModpack.
    if (isBinaryConfigPath(filename)) return
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

  async function handleAddLocalToModpack() {
    if (!localSelectedFile) return
    const installPath = `BepInEx/config/${localSelectedFile}`

    // Config BINÁRIO (ex.: spritesheet .png de emoji): não pode virar string JSON —
    // seria corrompido em UTF-8. Lê os bytes crus (base64), sobe pro R2 e guarda a
    // URL no content. O player baixa os bytes via applyConfig (binary-safe).
    if (isBinaryConfigPath(localSelectedFile)) {
      if (!adminToken) {
        setLocalUploadError('Faça login de admin para enviar configs binários.')
        return
      }
      setLocalUploading(true)
      setLocalUploadError('')
      try {
        const read = await window.glitnir.fs.readFileBase64({ filePath: localFilePath(localSelectedFile) })
        if (!read.success || !read.content) throw new Error(read.error || 'Falha ao ler o arquivo')
        // Basename: o backend exige nome simples (sem `/`) na key do R2. O installPath
        // preserva a subpasta pra o player gravar no lugar certo.
        const { url } = await uploadConfig(adminToken, configBasename(localSelectedFile), read.content, backendUrl)
        // Substitui uma entrada existente com o mesmo installPath (ex.: corrigir um
        // binário antes corrompido) em vez de só pular.
        setModpackConfigs(prev => {
          const next = prev.filter(c => c.installPath !== installPath)
          return [...next, { mod: '', filename: localSelectedFile, installPath, content: url }]
        })
      } catch (err: any) {
        setLocalUploadError('Falha ao enviar config binário: ' + (err.message || ''))
      } finally {
        setLocalUploading(false)
      }
      return
    }

    // Config de texto: embute o conteúdo direto no modpack.
    if (!localFileContent) return
    if (modpackConfigs.some(c => c.filename === localSelectedFile)) return
    setModpackConfigs(prev => [...prev, {
      mod: '',
      filename: localSelectedFile,
      installPath,
      content: localFileContent,
    }])
  }

  /** Constrói o objeto Modpack com o estado atual do draft (mods só como referência). */
  function buildCurrentModpack(): Modpack {
    return {
      version: packVersion,
      name: packName,
      description: packDescription,
      mods: modpackMods.map(stripModToReference),
      configs: modpackConfigs,
      battlemetricsId: packBattlemetricsId || undefined,
    }
  }

  /** Aplica um modpack importado ao estado do editor. */
  function applyImportedModpack(data: Modpack) {
    setPackName(data.name || '')
    setPackDescription(data.description || '')
    setPackVersion(data.version || '1.0.0')
    setPackBattlemetricsId(data.battlemetricsId || '')
    setModpackMods(data.mods || [])
    setModpackConfigs(data.configs || [])
    // Mark as loaded so draft sync works correctly
    loadedTargets.current.add(target)
  }

  function handleExportCode() {
    const json = JSON.stringify(buildCurrentModpack(), null, 2)
    const code = 'GLITNIR-v1-' + btoa(encodeURIComponent(json))
    setExportCode(code)
  }

  async function handleExportFile() {
    const pack = buildCurrentModpack()
    const json = JSON.stringify(pack, null, 2)
    const filename = `${pack.name.replace(/\s+/g, '_') || 'modpack'}.glitnir`
    await window.glitnir.fs.saveFileDialog({ filename, content: json })
  }

  async function handleImportCode() {
    setImportError('')
    setImportSuccess('')
    const raw = importCodeInput.trim()
    if (!raw) return
    setImporting('code')
    try {
      // ── Formato Glitnir ──────────────────────────────────────────────────────
      if (raw.startsWith('GLITNIR-v1-')) {
        try {
          const data = JSON.parse(decodeURIComponent(atob(raw.slice('GLITNIR-v1-'.length)))) as Modpack
          if (!data.mods) throw new Error('campo "mods" ausente')
          applyImportedModpack(data)
          setImportCodeInput('')
          const cfgCount = data.configs?.length ?? 0
          setImportSuccess(`✓ ${data.mods.length} mod${data.mods.length !== 1 ? 's' : ''}${cfgCount ? ` e ${cfgCount} config${cfgCount !== 1 ? 's' : ''}` : ''} importados!`)
          setTimeout(() => setImportSuccess(''), 3000)
        } catch (err: any) {
          setImportError('Código Glitnir inválido: ' + (err.message || ''))
        }
        return
      }

      // ── Formato R2ModManager (código curto resolvido via API do Thunderstore) ──
      const r2Result = await window.glitnir.mods.importR2Code({ code: raw })
      if (!r2Result.success || !r2Result.mods) {
        setImportError(r2Result.error || 'Formato não reconhecido. Use um código Glitnir (GLITNIR-v1-…) ou R2ModManager.')
        return
      }
      await applyR2Result(r2Result.mods, r2Result.configs)
      setImportCodeInput('')
    } finally {
      setImporting('')
    }
  }

  /**
   * Converte o resultado de um perfil R2ModManager (código ou arquivo .r2z) para o
   * estado do editor. Reusado por importação por código e por arquivo .r2z, já que
   * ambos produzem a mesma estrutura { mods, configs } vinda do main process.
   *
   * Configs de TEXTO chegam em `content` (embutidos no modpack). Configs BINÁRIOS
   * (imagem/música/gif/fonte) chegam em `contentBase64` e são enviados ao R2 aqui;
   * o `content` final vira a URL pública. Requer login de admin para o upload.
   */
  async function applyR2Result(
    mods: { namespace: string; name: string; version: string }[],
    configs?: { filename: string; installPath: string; content?: string; contentBase64?: string }[],
  ) {
    const newMods: Mod[] = mods.map(({ namespace, name, version }) => {
      const ts = allMods.find(m => m.owner === namespace && m.name === name)
      return {
        name,
        source: 'thunderstore' as const,
        namespace,
        version,
        downloadUrl: getDownloadUrl(namespace, name, version),
        description: ts?.latest.description?.slice(0, 120),
      }
    })

    const matchMod = (filename: string) =>
      newMods.find(m =>
        filename.toLowerCase().includes(m.name.toLowerCase()) ||
        filename.toLowerCase().includes((m.namespace ?? '').toLowerCase())
      )?.name ?? ''

    const newConfigs: ModConfig[] = []
    let skippedBinaries = 0
    for (const cfg of configs ?? []) {
      if (cfg.contentBase64 != null) {
        // Config binário: sobe pro R2 e guarda a URL. Sem admin logado não dá pra
        // subir — conta como pulado e avisa no final (mods/text seguem normalmente).
        if (!adminToken) { skippedBinaries++; continue }
        try {
          const { url } = await uploadConfig(adminToken, cfg.filename, cfg.contentBase64, backendUrl)
          newConfigs.push({ mod: matchMod(cfg.filename), filename: cfg.filename, installPath: cfg.installPath, content: url })
        } catch {
          skippedBinaries++
        }
      } else {
        newConfigs.push({ mod: matchMod(cfg.filename), filename: cfg.filename, installPath: cfg.installPath, content: cfg.content ?? '' })
      }
    }

    setModpackMods(newMods)
    if (newConfigs.length > 0) setModpackConfigs(newConfigs)
    loadedTargets.current.add(target)
    const cfgCount = newConfigs.length
    const warn = skippedBinaries > 0 ? ` (${skippedBinaries} binário(s) não enviado(s) — faça login de admin)` : ''
    setImportSuccess(`✓ ${newMods.length} mod${newMods.length !== 1 ? 's' : ''}${cfgCount ? ` e ${cfgCount} config${cfgCount !== 1 ? 's' : ''}` : ''} importados do R2!${warn}`)
    setTimeout(() => setImportSuccess(''), 4000)
  }

  async function handleImportR2File() {
    setImportError('')
    setImportSuccess('')
    const r2Result = await window.glitnir.mods.pickAndImportR2File()
    if (!r2Result) return // usuário cancelou o diálogo
    // O spinner só liga DEPOIS do diálogo do OS (durante ele o usuário já vê a janela nativa).
    setImporting('r2')
    try {
      if (!r2Result.success || !r2Result.mods) {
        setImportError(r2Result.error || 'Não foi possível ler o arquivo .r2z.')
        return
      }
      await applyR2Result(r2Result.mods, r2Result.configs)
    } finally {
      setImporting('')
    }
  }

  async function handleImportFile() {
    setImportError('')
    setImportSuccess('')
    const text = await window.glitnir.fs.pickJsonFile()
    if (!text) return
    setImporting('file')
    try {
      const data = JSON.parse(text) as Modpack
      if (!data.mods) throw new Error('campo "mods" ausente')
      applyImportedModpack(data)
      const cfgCount = data.configs?.length ?? 0
      setImportSuccess(`✓ ${data.mods.length} mod${data.mods.length !== 1 ? 's' : ''}${cfgCount ? ` e ${cfgCount} config${cfgCount !== 1 ? 's' : ''}` : ''} importados!`)
      setTimeout(() => setImportSuccess(''), 3000)
    } catch (err: any) {
      setImportError('Arquivo inválido: ' + (err.message || 'falha ao ler'))
    } finally {
      setImporting('')
    }
  }

  /** Monta o objeto Modpack publicável (mods só como referência) a partir dos configs dados. */
  function buildPublishPayload(configs: ModConfig[]): Modpack {
    return {
      version: packVersion,
      name: packName,
      description: packDescription,
      updatedAt: new Date().toISOString(),
      mods: modpackMods.map(stripModToReference),
      configs,
      battlemetricsId: packBattlemetricsId || undefined,
    }
  }

  /** Publica o modpack a partir da lista de configs dada (já enxuta, só metadados + URLs). */
  async function pushModpack(configs: ModConfig[]) {
    await publishModpack(adminToken!, target, buildPublishPayload(configs), undefined, backendUrl)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const isUrlContent = (c: ModConfig) => /^https?:\/\//i.test((c.content || '').trim())
  /** Basename do installPath — o backend exige nome simples (sem `/`) na key do R2. */
  const configBasename = (installPath: string) => installPath.split(/[\\/]/).pop() || installPath
  /** Base64 dos BYTES UTF-8 de um texto (o backend faz atob→bytes; texto = bytes UTF-8). */
  function base64Utf8(s: string): string {
    const bytes = new TextEncoder().encode(s)
    let bin = ''
    const CHUNK = 0x8000
    for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
    return btoa(bin)
  }

  /**
   * Fluxo de publish. O modpack.json tem limite de 5 MB no backend e deve carregar só
   * metadados + URLs — conteúdo pesado vai pro R2:
   *   • BINÁRIO embutido (content não-URL): os bytes inline estão corrompidos (foram lidos
   *     como UTF-8), então precisa reler o arquivo real do disco (pasta de configs local).
   *     Se não achar no disco, vira pendência e o banner oferece remover.
   *   • TEXTO grande: o content inline é válido, então sobe direto pro R2 (sem disco), do
   *     maior pro menor, até o JSON caber no orçamento.
   */
  async function runPublish(configsInput: ModConfig[]) {
    if (!adminToken) {
      setError('Sessão de admin expirada. Faça login novamente.')
      return
    }
    setPublishing(true)
    setError('')
    setUnresolvedBinaries([])
    try {
      let configs = configsInput
      const unresolved: { installPath: string; reason: string }[] = []

      // 1. Binários embutidos → R2 lendo o arquivo REAL do disco (o inline está corrompido).
      const dir = localConfigDir.trim()
      const inlineBinaries = configs.filter(c => !isUrlContent(c) && isBinaryConfigPath(c.installPath))
      for (const c of inlineBinaries) {
        if (!dir) {
          unresolved.push({ installPath: c.installPath, reason: 'binário sem pasta de configs local definida' })
          continue
        }
        const rel = c.installPath.replace(/^BepInEx[\\/]config[\\/]/, '')
        try {
          const read = await window.glitnir.fs.readFileBase64({ filePath: localFilePath(rel) })
          if (!read.success || !read.content) {
            unresolved.push({ installPath: c.installPath, reason: read.error || 'arquivo não encontrado no disco' })
            continue
          }
          const { url } = await uploadConfig(adminToken, configBasename(c.installPath), read.content, backendUrl)
          configs = configs.map(x => x.installPath === c.installPath ? { ...x, content: url } : x)
        } catch (err: any) {
          unresolved.push({ installPath: c.installPath, reason: err.message || 'falha ao enviar ao R2' })
        }
      }

      // 2. Texto grande → R2 (a partir do content inline, válido), do maior pro menor,
      //    até o modpack.json caber no orçamento (< 5 MB do backend, com folga).
      const MAX_PUBLISH_BYTES = 4.5 * 1024 * 1024
      const payloadBytes = (cs: ModConfig[]) => byteLength(JSON.stringify(buildPublishPayload(cs)))
      while (payloadBytes(configs) > MAX_PUBLISH_BYTES) {
        const heaviest = configs
          .filter(c => !isUrlContent(c) && !isBinaryConfigPath(c.installPath))
          .sort((a, b) => byteLength(b.content) - byteLength(a.content))[0]
        if (!heaviest) break // nada mais de texto pra offload
        try {
          const { url } = await uploadConfig(adminToken, configBasename(heaviest.installPath), base64Utf8(heaviest.content || ''), backendUrl)
          configs = configs.map(x => x.installPath === heaviest.installPath ? { ...x, content: url } : x)
        } catch (err: any) {
          unresolved.push({ installPath: heaviest.installPath, reason: 'falha ao subir texto ao R2: ' + (err.message || '') })
          break // evita loop infinito
        }
      }

      // Persiste as URLs resolvidas no editor (mesmo que ainda reste pendência).
      setModpackConfigs(configs)

      if (unresolved.length > 0) {
        setUnresolvedBinaries(unresolved.map(u => u.installPath))
        const top = unresolved.slice(0, 8).map(u => `• ${u.installPath} — ${u.reason}`).join('\n')
        const extra = unresolved.length > 8 ? `\n…e mais ${unresolved.length - 8}` : ''
        const hint = dir
          ? `\nConfira se a pasta de configs local aponta pro perfil certo, ou remova estes configs.`
          : `\nDefina a pasta de configs local (aba "Configs locais") pra enviar os binários, ou remova estes configs.`
        setError(`${unresolved.length} config(s) não puderam ir pro R2:\n${top}${extra}${hint}`)
        setPublishing(false)
        return
      }

      const finalBytes = payloadBytes(configs)
      if (finalBytes > MAX_PUBLISH_BYTES) {
        setError(
          `O modpack ainda está grande demais (${(finalBytes / 1024 / 1024).toFixed(1)} MB) mesmo após enviar os ` +
          `configs pesados ao R2 — o peso restante é de metadados/mods. Reduza o conteúdo do modpack.`,
        )
        setPublishing(false)
        return
      }

      await pushModpack(configs)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setPublishing(false)
    }
  }

  function handlePublish() {
    void runPublish(modpackConfigs)
  }

  /** Remove os configs binários que não puderam ir pro R2 e publica sem eles. */
  function handleDropUnresolvedAndPublish() {
    const drop = new Set(unresolvedBinaries)
    const next = modpackConfigs.filter(c => !drop.has(c.installPath))
    setModpackConfigs(next)
    setUnresolvedBinaries([])
    void runPublish(next)
  }

  const visibleMods = filteredMods.slice(0, visibleCount)
  const hasMore = visibleCount < filteredMods.length

  return (
    <div className="admin-view modpack-editor">
      <div className="admin-header">
        <h1>Editor de Modpack</h1>
        <p className="text-secondary">Navegue mods do Thunderstore e monte seu modpack.</p>
      </div>

      {error && (
        <div className="error-banner" style={{ whiteSpace: 'pre-line' }}>
          {error}
          {unresolvedBinaries.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <button
                className="btn-secondary"
                style={{ fontSize: 13 }}
                onClick={handleDropUnresolvedAndPublish}
                disabled={publishing}
              >
                Remover {unresolvedBinaries.length} config(s) e publicar mesmo assim
              </button>
            </div>
          )}
        </div>
      )}

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
              <label className="ts-filter-checkbox">
                <input
                  type="checkbox"
                  checked={showDeprecated}
                  onChange={e => setShowDeprecated(e.target.checked)}
                />
                Mostrar depreciados
              </label>
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
                          {(mod.is_deprecated || (mod.categories && mod.categories.length > 0)) && (
                            <div className="ts-mod-badges">
                              {mod.is_deprecated && (
                                <span className="badge badge-warning">Depreciado</span>
                              )}
                              {mod.categories?.slice(0, 2).map(cat => (
                                <span key={cat} className="ts-mod-badge">{cat}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="ts-mod-actions" onClick={e => e.stopPropagation()}>
                          {!already && mod.versions.length > 1 && (
                            <select
                              className="version-select-sm"
                              value={selectedVersions[mod.full_name] || mod.latest.version_number}
                              onChange={e => setSelectedVersions(prev => ({ ...prev, [mod.full_name]: e.target.value }))}
                              title="Escolher versão"
                            >
                              {mod.versions.map(v => (
                                <option key={v.version_number} value={v.version_number}>
                                  {v.version_number === mod.latest.version_number ? `${v.version_number} (latest)` : v.version_number}
                                </option>
                              ))}
                            </select>
                          )}
                          <button
                            className={already ? 'btn-ghost' : 'btn-secondary'}
                            style={{ flexShrink: 0, fontSize: 13 }}
                            onClick={() => handleAddThunderstoreMod(mod)}
                            disabled={already}
                          >
                            {already ? '✓ No modpack' : '+ Adicionar'}
                          </button>
                        </div>
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
                      battlemetricsId: packBattlemetricsId,
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

          {/* Import / Export */}
          <div className="admin-section card">
            <div className="card-header">
              <h3>Importar / Exportar</h3>
              <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => { setShowImportExport(v => !v); setExportCode(''); setImportError('') }}>
                {showImportExport ? 'Fechar ▲' : 'Abrir ▼'}
              </button>
            </div>
            {showImportExport && (
              <div className="card-body">
                {/* Export */}
                <div style={{ marginBottom: 16 }}>
                  <p className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>
                    Exporta o modpack atual para compartilhar ou fazer backup.
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn-secondary" style={{ fontSize: 13 }} onClick={handleExportCode}>
                      Gerar código
                    </button>
                    <button className="btn-ghost" style={{ fontSize: 13 }} onClick={handleExportFile}>
                      Salvar arquivo (.glitnir)
                    </button>
                  </div>
                  {exportCode && (
                    <div style={{ marginTop: 10 }}>
                      <textarea
                        readOnly
                        value={exportCode}
                        rows={3}
                        className="cfg-edit-textarea"
                        style={{ width: '100%', fontSize: 11, fontFamily: 'monospace', resize: 'none' }}
                        onFocus={e => e.target.select()}
                      />
                      <button
                        className="btn-ghost"
                        style={{ fontSize: 12, marginTop: 6 }}
                        onClick={() => {
                          navigator.clipboard.writeText(exportCode).catch(() => {})
                          setCodeCopied(true)
                          setTimeout(() => setCodeCopied(false), 2000)
                        }}
                      >
                        {codeCopied ? '✓ Copiado!' : 'Copiar código'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div style={{ borderTop: '1px solid var(--border-color)', marginBottom: 16 }} />

                {/* Import */}
                <p className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>
                  Importar sobrescreve o modpack atual com os dados do código ou arquivo.
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <textarea
                      value={importCodeInput}
                      onChange={e => setImportCodeInput(e.target.value)}
                      placeholder="Cole o código GLITNIR-v1-… ou o código de perfil do R2ModManager"
                      rows={3}
                      className="cfg-edit-textarea"
                      style={{ width: '100%', fontSize: 11, fontFamily: 'monospace', resize: 'none' }}
                    />
                    <button
                      className="btn-secondary"
                      style={{ fontSize: 13, marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 8 }}
                      onClick={handleImportCode}
                      disabled={!importCodeInput.trim() || !!importing}
                    >
                      {importing === 'code' && <span className="ts-loading-spinner" style={{ width: 13, height: 13, borderWidth: 2 }} />}
                      {importing === 'code' ? 'Importando…' : 'Importar por código'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 2 }}>
                    <button
                      className="btn-ghost"
                      style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}
                      onClick={handleImportFile}
                      disabled={!!importing}
                    >
                      {importing === 'file' && <span className="ts-loading-spinner" style={{ width: 13, height: 13, borderWidth: 2 }} />}
                      {importing === 'file' ? 'Importando…' : 'Importar arquivo (.glitnir / .json)'}
                    </button>
                    <button
                      className="btn-ghost"
                      style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}
                      onClick={handleImportR2File}
                      disabled={!!importing}
                    >
                      {importing === 'r2' && <span className="ts-loading-spinner" style={{ width: 13, height: 13, borderWidth: 2 }} />}
                      {importing === 'r2' ? 'Importando…' : 'Importar perfil do R2ModManager (.r2z)'}
                    </button>
                  </div>
                </div>
                {importError && <p className="text-error" style={{ fontSize: 12, marginTop: 8 }}>{importError}</p>}
                {importSuccess && <p style={{ fontSize: 12, marginTop: 8, color: 'var(--accent-green)' }}>{importSuccess}</p>}
              </div>
            )}
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
                        {mod.source === 'thunderstore' ? (() => {
                          const tsVersions = allMods.find(m => m.name === mod.name && m.owner === mod.namespace)?.versions ?? []
                          return tsVersions.length > 1 ? (
                            <select
                              className="version-select-sm"
                              value={mod.version || ''}
                              onChange={e => handleUpdateModVersion(index, e.target.value)}
                              title="Versão pinada"
                            >
                              {tsVersions.map(v => (
                                <option key={v.version_number} value={v.version_number}>
                                  {v.version_number}
                                </option>
                              ))}
                              {/* Ensure current version is always an option even if allMods is stale */}
                              {mod.version && !tsVersions.some(v => v.version_number === mod.version) && (
                                <option value={mod.version}>{mod.version}</option>
                              )}
                            </select>
                          ) : (
                            <input type="text" value={mod.version || ''} className="version-input"
                              onChange={e => handleUpdateModVersion(index, e.target.value)} />
                          )
                        })() : (
                          <span className="text-muted">{mod.filename}</span>
                        )}
                      </div>
                      <label className="mod-optional-toggle" title="Jogadores poderão escolher não instalar esse mod">
                        <input
                          type="checkbox"
                          checked={!!mod.optional}
                          onChange={() => handleToggleOptional(index)}
                        />
                        Opcional
                      </label>
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
                      <span className="text-muted"> ({pendingFile.size >= 1024 * 1024
                        ? `${(pendingFile.size / 1024 / 1024).toFixed(1)} MB`
                        : `${(pendingFile.size / 1024).toFixed(0)} KB`})</span>
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
                      {uploading ? `Enviando... ${uploadProgress}%` : '↑ Upload e Adicionar'}
                    </button>
                    {!uploading && (
                      <button className="btn-ghost" onClick={() => { setPendingFile(null); setPrivName(''); setPrivFilename('') }}>
                        ✕
                      </button>
                    )}
                  </div>
                )}
                {uploading && (
                  <div style={{ height: 4, background: 'var(--border-color)', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${uploadProgress}%`, background: 'var(--accent-green)', transition: 'width 0.2s' }} />
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
                            {isBinaryConfigPath(localSelectedFile) ? (
                              // Binário: sempre permite (re)enviar pro R2 — inclusive pra corrigir
                              // um asset antes corrompido. Não há edição de texto nem "salvar no disco".
                              <button
                                className="btn-ghost"
                                style={{ fontSize: 12 }}
                                onClick={handleAddLocalToModpack}
                                disabled={localUploading}
                              >
                                {localUploading
                                  ? 'Enviando ao R2...'
                                  : modpackConfigs.some(c => c.filename === localSelectedFile)
                                    ? '↻ Reenviar ao R2'
                                    : '+ Enviar binário ao R2'}
                              </button>
                            ) : (
                              <>
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
                              </>
                            )}
                          </div>
                        </div>
                        {localUploadError && <p className="text-error" style={{ fontSize: 12, marginBottom: 6 }}>{localUploadError}</p>}
                        {isBinaryConfigPath(localSelectedFile) ? (
                          <p className="text-muted" style={{ fontSize: 12, padding: '12px 0' }}>
                            Arquivo binário — não é editável como texto. Ele será enviado ao bucket R2
                            e o modpack guardará a URL; os players baixam os bytes originais na instalação.
                          </p>
                        ) : (
                          <textarea
                            className="cfg-edit-textarea"
                            value={localFileContent}
                            onChange={e => setLocalFileContent(e.target.value)}
                            rows={16}
                            spellCheck={false}
                            style={{ width: '100%' }}
                          />
                        )}
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
