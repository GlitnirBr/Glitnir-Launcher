import { useState, useEffect, useCallback } from 'react'
import Layout from './components/Layout/Layout'
import AdminLoginModal from './components/Admin/AdminLoginModal'
import UpdateNotification from './components/UpdateNotification/UpdateNotification'
import InstallBar from './components/InstallBar/InstallBar'
import { HomeView, ModsView, SettingsView, AdminView, ModpackEditorView, AboutView } from './views'
import { fetchModpackFromUrl, buildModpackRawUrl, checkOutdated, normalizeModpack } from './utils/modManager'
import { getAdminModpack, getPublicModpack, getNews, publishNews, resolvePrivateMod } from './utils/backendApi'
import { Config, Modpack, Mod, ModpackEntry, NewsData } from './types'
import { NewsItem } from './components/News'
import newsColiseuImg from './assets/news-coliseu.png'
import './App.css'

const FALLBACK_NEWS: NewsItem[] = [
  {
    id: 'coliseu-pvp',
    type: 'event',
    title: 'Coliseu PvP',
    date: new Date().toISOString().split('T')[0],
    time: '20h',
    summary: 'Toda quarta-feira às 20h. Entrada: 2 Moedas Glitnir. Recompensa: 20 Moedas Glitnir. O último sobrevivente vence!',
    image: newsColiseuImg,
  },
]

const VANILLA: ModpackEntry = { id: 'vanilla', name: 'Vanilla', type: 'vanilla', builtin: true }
const MAIN: ModpackEntry = { id: 'principal', name: 'Glitnir', type: 'public' }
const ADMIN_TEST: ModpackEntry = { id: 'admin-teste', name: 'Glitnir Admin', type: 'admin' }

export default function App() {
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)

  const [isAdmin, setIsAdmin] = useState(false)
  const [adminToken, setAdminToken] = useState<string | null>(null)
  const [showAdminModal, setShowAdminModal] = useState(false)

  const [currentView, setCurrentView] = useState('home')
  const [selectedModpack, setSelectedModpack] = useState('principal')

  const [modpackData, setModpackData] = useState<Modpack | null>(null)
  const [mods, setMods] = useState<(Mod & { installed?: boolean; outdated?: boolean })[]>([])
  const [newsData, setNewsData] = useState<NewsData>({ news: [] })

  const [installing, setInstalling] = useState(false)
  const [installProgress, setInstallProgress] = useState(0)
  const [installStatus, setInstallStatus] = useState('')

  const [isPlaying, setIsPlaying] = useState(false)
  const [launchError, setLaunchError] = useState('')

  const [serverOnline, setServerOnline] = useState(false)
  const [serverPlayers, setServerPlayers] = useState(0)
  const [serverMaxPlayers, setServerMaxPlayers] = useState(0)
  const [publicBattlemetricsId, setPublicBattlemetricsId] = useState('')

  const modpacks: ModpackEntry[] = isAdmin
    ? [VANILLA, MAIN, ADMIN_TEST]
    : [VANILLA, MAIN]

  const loadConfig = useCallback(async () => {
    try {
      const cfg = await window.glitnir.config.load()
      setConfig({
        valheimPath: cfg.valheimPath || '',
        installedMods: cfg.installedMods || [],
        installedByProfile: cfg.installedByProfile || {},
        backendUrl: cfg.backendUrl || '',
        modpackRepo: cfg.modpackRepo || '',
        modpackBranch: cfg.modpackBranch || 'main',
        newsUrl: cfg.newsUrl || '',
        selectedModpack: cfg.selectedModpack,
        modsPath: cfg.modsPath,
      })
      if (cfg.selectedModpack) setSelectedModpack(cfg.selectedModpack)
    } catch {
      setConfig({
        valheimPath: '',
        installedMods: [],
        installedByProfile: {},
        backendUrl: '',
        modpackRepo: '',
        modpackBranch: 'main',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  const loadModpack = useCallback(async () => {
    if (!config) return

    const entry = modpacks.find(m => m.id === selectedModpack)
    if (!entry || entry.type === 'vanilla') {
      setModpackData(null)
      setMods([])
      return
    }

    try {
      let data: Modpack
      if (entry.type === 'admin') {
        if (!adminToken) {
          setModpackData(null)
          setMods([])
          return
        }
        data = await getAdminModpack(adminToken, config.backendUrl)
      } else {
        // Try backend first (uses DEFAULT_BACKEND_URL when backendUrl is empty); fall back to GitHub raw.
        let rawData: any = null
        try {
          rawData = await getPublicModpack(config.backendUrl || undefined)
        } catch { /* ignore, will try GitHub */ }
        if (!rawData) {
          const url = buildModpackRawUrl(config.modpackRepo, config.modpackBranch)
          rawData = await fetchModpackFromUrl(url)
        }
        data = normalizeModpack(rawData)
      }

      setModpackData(data)
      const installed = config.installedByProfile?.[entry.id] || []
      const disabledOptional = config.optionalModsDisabled?.[entry.id] || []
      setMods(checkOutdated(installed, data, disabledOptional))
    } catch (err) {
      console.error('Falha ao carregar modpack:', err)
      setModpackData(null)
      setMods([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModpack, config, adminToken, isAdmin])

  const loadNews = useCallback(async () => {
    // Try the backend first — this is what the admin's "Notícias" tab actually publishes to
    // (publishNews → POST {backendUrl}/news). The raw newsUrl below is a legacy fallback for
    // setups that host a static news.json instead of using the backend.
    try {
      const data = await getNews(config?.backendUrl || undefined)
      setNewsData(data)
      return
    } catch { /* ignore, try legacy newsUrl */ }

    const newsUrl = config?.newsUrl
    if (!newsUrl) {
      setNewsData({ news: FALLBACK_NEWS })
      return
    }
    try {
      const res = await fetch(newsUrl + '?t=' + Date.now())
      if (res.ok) setNewsData(await res.json())
      else setNewsData({ news: FALLBACK_NEWS })
    } catch {
      setNewsData({ news: FALLBACK_NEWS })
    }
  }, [config])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  useEffect(() => {
    if (config) {
      loadModpack()
      loadNews()
    }
  }, [config, loadModpack, loadNews])

  // Fetch the public modpack to extract battlemetricsId (backend first, GitHub fallback).
  useEffect(() => {
    if (!config) return
    async function load() {
      try {
        let raw: any = null
        try {
          raw = await getPublicModpack(config!.backendUrl || undefined)
        } catch { /* ignore, will try GitHub */ }
        if (!raw) {
          raw = await fetchModpackFromUrl(buildModpackRawUrl(config!.modpackRepo, config!.modpackBranch))
        }
        const data = normalizeModpack(raw)
        if (data.battlemetricsId) setPublicBattlemetricsId(data.battlemetricsId)
      } catch { /* silently ignore */ }
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.backendUrl, config?.modpackRepo, config?.modpackBranch])

  // Poll BattleMetrics: prefer public modpack ID, fall back to currently loaded modpack.
  useEffect(() => {
    const id = publicBattlemetricsId || modpackData?.battlemetricsId || ''
    if (!id) {
      setServerOnline(false)
      setServerPlayers(0)
      setServerMaxPlayers(0)
      return
    }

    let cancelled = false

    async function fetchStatus() {
      try {
        const res = await fetch(`https://api.battlemetrics.com/servers/${id}`)
        if (!res.ok || cancelled) return
        const json = await res.json()
        const attr = json?.data?.attributes
        if (!attr || cancelled) return
        setServerOnline(attr.status === 'online')
        setServerPlayers(attr.players ?? 0)
        setServerMaxPlayers(attr.maxPlayers ?? 0)
      } catch { /* silently ignore */ }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 60_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [publicBattlemetricsId, modpackData?.battlemetricsId])

  async function handleSaveConfig(updates: Partial<Config>) {
    // When modsPath changes, the old installed-mods metadata points to the wrong directory.
    // Clear it so mods are reinstalled to the new path on next launch.
    const merged: Partial<Config> = { ...updates }
    if ('modsPath' in updates && updates.modsPath !== config?.modsPath) {
      merged.installedByProfile = {}
    }
    await window.glitnir.config.save(merged)
    await loadConfig()
  }

  /** Liga/desliga um mod opcional para o perfil atual — reflete na lista e no próximo install. */
  async function handleToggleOptionalMod(modName: string, enabled: boolean) {
    const profile = selectedModpack
    const current = new Set(config?.optionalModsDisabled?.[profile] || [])
    if (enabled) current.delete(modName)
    else current.add(modName)
    await handleSaveConfig({
      optionalModsDisabled: { ...(config?.optionalModsDisabled || {}), [profile]: Array.from(current) },
    })
  }

  /**
   * Publica atualizações parciais da home/notícias. Sempre funde sobre o `newsData` atual
   * (que já tem o estado completo carregado) antes de enviar — assim, salvar só o hero na
   * HomeView não apaga o que a AdminView salvou em serverInfo, e vice-versa.
   */
  async function handlePublishNews(updates: Partial<NewsData>) {
    if (!adminToken) throw new Error('Faça login de admin para publicar.')
    const merged: NewsData = { ...newsData, ...updates }
    await publishNews(adminToken, merged, config?.backendUrl)
    setNewsData(merged)
  }

  async function handleInstallMods() {
    if (!modpackData || !config) return

    setInstalling(true)
    try {
      const profile = selectedModpack
      // Optional mods the player turned off are excluded from install/removal accounting,
      // same as if they weren't in the modpack at all.
      const activeMods = mods.filter(m => !m.optionalDisabled)
      // If BepInEx core files are missing on disk, ignore cached "installed" state and reinstall everything.
      const bepinexOk = await window.glitnir.mods.bepinexOk({ profile })
      const toInstall = bepinexOk
        ? activeMods.filter(m => !m.installed || m.outdated)
        : activeMods

      // Remove mods that were installed for this profile before but are no longer active —
      // either the admin took them out of the modpack, or the player disabled an optional one.
      // Otherwise the old plugin folder stays on disk forever and keeps loading in-game.
      const previouslyInstalled = config.installedByProfile?.[profile] || []
      const currentModNames = new Set(activeMods.map(m => m.name))
      const stale = previouslyInstalled.filter(m => !currentModNames.has(m.name))
      for (const mod of stale) {
        setInstallStatus(`Removendo ${mod.name}...`)
        await window.glitnir.mods.remove({ modName: mod.name, profile })
      }

      for (let i = 0; i < toInstall.length; i++) {
        const mod = toInstall[i]
        setInstallStatus(`Baixando ${mod.name}...`)
        setInstallProgress(Math.round((i / Math.max(toInstall.length, 1)) * 90))

        let url = mod.downloadUrl
        let headers: Record<string, string> | undefined

        if (mod.source === 'private') {
          if (!adminToken) throw new Error('Faça login de admin para baixar mods privados')
          const resolved = resolvePrivateMod(mod.downloadUrl, adminToken, config.backendUrl)
          url = resolved.url
          headers = resolved.headers
        }

        const dl = await window.glitnir.mods.download({ url, modName: mod.name, headers })
        if (!dl.success) throw new Error(dl.error || `Falha ao baixar ${mod.name}`)

        setInstallStatus(`Instalando ${mod.name}...`)
        const inst = await window.glitnir.mods.install({
          zipPath: dl.tempPath!,
          modName: mod.name,
          profile,
        })
        if (!inst.success) throw new Error(inst.error || `Falha ao instalar ${mod.name}`)
      }

      // Aplica as configs do modpack.
      const configs = modpackData.configs || []
      for (let i = 0; i < configs.length; i++) {
        const cfg = configs[i]
        setInstallStatus(`Aplicando config ${cfg.filename}...`)
        setInstallProgress(90 + Math.round((i / Math.max(configs.length, 1)) * 10))
        await window.glitnir.mods.applyConfig({
          profile,
          installPath: cfg.installPath,
          content: cfg.content,
        })
      }

      // Registra os mods instalados desse perfil.
      const installedList = activeMods.map(m => ({ name: m.name, version: m.version || '0.0.0' }))
      const installedByProfile = { ...(config.installedByProfile || {}), [profile]: installedList }
      await handleSaveConfig({ installedByProfile })

      setInstallProgress(100)
      setInstallStatus('Concluído!')
    } catch (err: any) {
      setInstallStatus(err.message || 'Erro na instalação')
      throw err
    } finally {
      setInstalling(false)
    }
  }

  async function handlePlay() {
    if (!config?.valheimPath) {
      const path = await window.glitnir.dialog.selectValheimPath()
      if (path) await handleSaveConfig({ valheimPath: path })
      return
    }

    setIsPlaying(true)
    setLaunchError('')

    try {
      // Auto-install mods if any are missing or outdated before launching.
      const hasPending = selectedModpack !== 'vanilla' && mods.some(m => !m.optionalDisabled && (!m.installed || m.outdated))
      if (hasPending) {
        await handleInstallMods()
      }

      const mode = selectedModpack === 'vanilla' ? 'vanilla' : 'modded'
      const result = await window.glitnir.game.launch({
        valheimPath: config.valheimPath,
        mode,
        profile: selectedModpack,
      })
      if (result && !result.success) {
        setLaunchError(result.error || 'Erro ao iniciar o jogo.')
      }
    } catch (err: any) {
      setLaunchError(err.message || 'Erro ao instalar mods antes de iniciar.')
    } finally {
      setIsPlaying(false)
    }
  }

  function handleAdminClick() {
    if (isAdmin) {
      setIsAdmin(false)
      setAdminToken(null)
      if (selectedModpack === ADMIN_TEST.id) setSelectedModpack('principal')
      setCurrentView('home')
    } else {
      setShowAdminModal(true)
    }
  }

  function handleAdminLogin(token: string) {
    setAdminToken(token)
    setIsAdmin(true)
    setShowAdminModal(false)
  }

  if (loading) {
    return (
      <div className="splash">
        <p>Carregando...</p>
      </div>
    )
  }

  const pinnedAlertItem = newsData.news.find(n => n.pinned)
  const pinnedAlert = newsData.pinnedAlert ||
    (pinnedAlertItem ? { text: pinnedAlertItem.title, link: pinnedAlertItem.link } : undefined)
  const regularNews = newsData.news.filter(n => !n.pinned)

  return (
    <>
      {launchError && (
        <div className="launch-error-overlay" onClick={() => setLaunchError('')}>
          <div className="launch-error-box" onClick={e => e.stopPropagation()}>
            <strong>Erro ao iniciar</strong>
            <p>{launchError}</p>
            <button onClick={() => setLaunchError('')}>Fechar</button>
          </div>
        </div>
      )}
      <Layout
        currentView={currentView}
        onViewChange={setCurrentView}
        selectedModpack={selectedModpack}
        modpacks={modpacks}
        onModpackChange={setSelectedModpack}
        onPlay={handlePlay}
        isPlaying={isPlaying}
        modpackVersion={modpackData?.version}
        isAdmin={isAdmin}
        onAdminClick={handleAdminClick}
        username={isAdmin ? 'Admin' : 'Jogador'}
        serverOnline={serverOnline}
        serverPlayers={serverPlayers}
        serverMaxPlayers={serverMaxPlayers}
        hasBattlemetrics={!!(publicBattlemetricsId || modpackData?.battlemetricsId)}
      >
        {currentView === 'home' && (
          <HomeView
            featured={newsData.featured}
            news={regularNews}
            pinnedAlert={pinnedAlert}
            serverOnline={serverOnline}
            serverPlayers={serverPlayers}
            serverMaxPlayers={serverMaxPlayers}
            hasBattlemetrics={!!(publicBattlemetricsId || modpackData?.battlemetricsId)}
            serverInfo={newsData.serverInfo}
            isAdmin={isAdmin}
            adminToken={adminToken}
            backendUrl={config?.backendUrl}
            onPublishNews={handlePublishNews}
          />
        )}

        {currentView === 'mods' && (
          <ModsView
            modpack={modpackData}
            mods={mods}
            selectedModpackId={selectedModpack}
            onInstallMods={handleInstallMods}
            installing={installing}
            onToggleOptionalMod={handleToggleOptionalMod}
          />
        )}

        {currentView === 'settings' && config && (
          <SettingsView
            config={config}
            onSave={handleSaveConfig}
          />
        )}

        {currentView === 'about' && (
          <AboutView modpack={modpackData} />
        )}

        {currentView === 'modpack-editor' && isAdmin && config && (
          <ModpackEditorView
            config={config}
            adminToken={adminToken}
            onSave={handleSaveConfig}
          />
        )}

        {currentView === 'admin' && isAdmin && config && (
          <AdminView
            config={config}
            adminToken={adminToken}
            onSave={handleSaveConfig}
            serverInfo={newsData.serverInfo}
            onPublishNews={handlePublishNews}
          />
        )}
      </Layout>

      {showAdminModal && config && (
        <AdminLoginModal
          backendUrl={config.backendUrl}
          onSuccess={handleAdminLogin}
          onClose={() => setShowAdminModal(false)}
        />
      )}

      <UpdateNotification />
      <InstallBar
        installing={installing}
        installProgress={installProgress}
        installStatus={installStatus}
        onVerify={handleInstallMods}
        onOpenSettings={() => setCurrentView('settings')}
      />
    </>
  )
}
