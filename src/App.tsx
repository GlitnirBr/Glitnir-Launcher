import { useState, useEffect, useCallback } from 'react'
import Layout from './components/Layout/Layout'
import AdminLoginModal from './components/Admin/AdminLoginModal'
import UpdateNotification from './components/UpdateNotification/UpdateNotification'
import { HomeView, ModsView, SettingsView, AdminView, ModpackEditorView } from './views'
import { fetchModpackFromUrl, buildModpackRawUrl, checkOutdated } from './utils/modManager'
import { getAdminModpack, resolvePrivateMod } from './utils/backendApi'
import { Config, Modpack, Mod, ModpackEntry } from './types'
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

interface NewsData {
  featured?: {
    title: string
    subtitle?: string
    image?: string
    link?: string
    cta?: string
  }
  news: NewsItem[]
}

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
        const url = buildModpackRawUrl(config.modpackRepo, config.modpackBranch)
        data = await fetchModpackFromUrl(url)
      }

      setModpackData(data)
      const installed = config.installedByProfile?.[entry.id] || []
      setMods(checkOutdated(installed, data))
    } catch (err) {
      console.error('Falha ao carregar modpack:', err)
      setModpackData(null)
      setMods([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModpack, config, adminToken, isAdmin])

  const loadNews = useCallback(async () => {
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

  async function handleSaveConfig(updates: Partial<Config>) {
    await window.glitnir.config.save(updates)
    await loadConfig()
  }

  async function handleInstallMods() {
    if (!modpackData || !config) return

    setInstalling(true)
    try {
      const profile = selectedModpack
      const toInstall = mods.filter(m => !m.installed || m.outdated)

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
      const installedList = modpackData.mods.map(m => ({ name: m.name, version: m.version || '0.0.0' }))
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
      const hasPending = selectedModpack !== 'vanilla' && mods.some(m => !m.installed || m.outdated)
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

  const pinnedAlert = newsData.news.find(n => n.pinned)
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
      >
        {currentView === 'home' && (
          <HomeView
            featured={newsData.featured}
            news={regularNews}
            pinnedAlert={pinnedAlert}
            serverOnline={config?.serverOnline !== false}
          />
        )}

        {currentView === 'mods' && (
          <ModsView
            modpack={modpackData}
            mods={mods}
            selectedModpackId={selectedModpack}
            onInstallMods={handleInstallMods}
            installing={installing}
            installProgress={installProgress}
            installStatus={installStatus}
          />
        )}

        {currentView === 'settings' && config && (
          <SettingsView
            config={config}
            onSave={handleSaveConfig}
          />
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
    </>
  )
}
