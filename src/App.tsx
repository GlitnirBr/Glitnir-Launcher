import { useState, useEffect, useCallback } from 'react'
import Layout from './components/Layout/Layout'
import AdminLoginModal from './components/Admin/AdminLoginModal'
import UpdateNotification from './components/UpdateNotification/UpdateNotification'
import { HomeView, ModsView, SettingsView, AdminView } from './views'
import { fetchModpack, checkOutdated } from './utils/modManager'
import { Config, Modpack, Mod } from './types'
import { NewsItem } from './components/News'
import './App.css'

interface ModpackConfig {
  id: string
  name: string
  gistUrl: string | null
  builtin?: boolean
}

const DEFAULT_MODPACKS: ModpackConfig[] = [
  { id: 'vanilla', name: 'Vanilla', gistUrl: null, builtin: true },
  { id: 'glitnir', name: 'Glitnir Fantasy', gistUrl: '' }
]

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
  const [showAdminModal, setShowAdminModal] = useState(false)

  const [currentView, setCurrentView] = useState('home')
  const [selectedModpack, setSelectedModpack] = useState('glitnir')
  const [modpacks, setModpacks] = useState<ModpackConfig[]>(DEFAULT_MODPACKS)

  const [modpackData, setModpackData] = useState<Modpack | null>(null)
  const [mods, setMods] = useState<(Mod & { installed?: boolean; outdated?: boolean })[]>([])
  const [newsData, setNewsData] = useState<NewsData>({ news: [] })

  const [installing, setInstalling] = useState(false)
  const [installProgress, setInstallProgress] = useState(0)
  const [installStatus, setInstallStatus] = useState('')

  const [isPlaying, setIsPlaying] = useState(false)

  const loadConfig = useCallback(async () => {
    try {
      const cfg = await window.glitnir.config.load()
      setConfig({
        valheimPath: cfg.valheimPath || '',
        installedMods: cfg.installedMods || [],
        adminHash: cfg.adminHash || '',
        glitnirGistUrl: cfg.glitnirGistUrl || '',
        vanillaGistUrl: cfg.vanillaGistUrl || ''
      })

      if (cfg.glitnirGistUrl) {
        setModpacks(prev =>
          prev.map(mp =>
            mp.id === 'glitnir' ? { ...mp, gistUrl: cfg.glitnirGistUrl } : mp
          )
        )
      }

      if (cfg.selectedModpack) {
        setSelectedModpack(cfg.selectedModpack)
      }
    } catch {
      setConfig({
        valheimPath: '',
        installedMods: [],
        adminHash: '',
        glitnirGistUrl: '',
        vanillaGistUrl: ''
      })
    } finally {
      setLoading(false)
    }
  }, [])

  const loadModpack = useCallback(async () => {
    if (selectedModpack === 'vanilla') {
      setModpackData(null)
      setMods([])
      return
    }

    const mp = modpacks.find(m => m.id === selectedModpack)
    if (!mp?.gistUrl) {
      setModpackData(null)
      setMods([])
      return
    }

    try {
      const data = await fetchModpack('glitnir', mp.gistUrl)
      setModpackData(data)
      const installedMods = await window.glitnir.mods.list()
      const modsWithStatus = checkOutdated(
        installedMods.map(name => ({ name, version: '0.0.0' })),
        data
      )
      setMods(modsWithStatus)
    } catch (err) {
      console.error('Failed to load modpack:', err)
      setModpackData(null)
      setMods([])
    }
  }, [selectedModpack, modpacks])

  const loadNews = useCallback(async () => {
    const newsUrl = (config as any)?.newsGistUrl
    if (!newsUrl) return

    try {
      const res = await fetch(newsUrl + '?t=' + Date.now())
      if (res.ok) {
        const data = await res.json()
        setNewsData(data)
      }
    } catch {
      // ignore
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

  async function handleUpdateModpacks(newModpacks: ModpackConfig[]) {
    setModpacks(newModpacks)
  }

  async function handleInstallMods() {
    if (!modpackData) return

    setInstalling(true)
    const toInstall = mods.filter(m => !m.installed || m.outdated)

    for (let i = 0; i < toInstall.length; i++) {
      const mod = toInstall[i]
      setInstallStatus(`Baixando ${mod.name}...`)
      setInstallProgress(Math.round((i / toInstall.length) * 100))

      const [namespace, name] = mod.thunderstoreId.split('-')
      const url = `https://thunderstore.io/package/download/${namespace}/${name}/${mod.version}/`

      const downloadResult = await window.glitnir.mods.download({ url, modName: mod.name })
      if (!downloadResult.success) {
        throw new Error(downloadResult.error || 'Falha no download')
      }

      setInstallStatus(`Instalando ${mod.name}...`)

      const installResult = await window.glitnir.mods.install({
        zipPath: downloadResult.tempPath!,
        modName: mod.name
      })
      if (!installResult.success) {
        throw new Error(installResult.error || 'Falha na instalação')
      }
    }

    setInstallProgress(100)
    setInstallStatus('Concluido!')
    setInstalling(false)
    await loadModpack()
  }

  async function handlePlay() {
    if (!config?.valheimPath) {
      const path = await window.glitnir.dialog.selectValheimPath()
      if (path) {
        await handleSaveConfig({ valheimPath: path })
      }
      return
    }

    setIsPlaying(true)
    const mode = selectedModpack === 'vanilla' ? 'vanilla' : 'glitnir'
    await window.glitnir.game.launch({ valheimPath: config.valheimPath, mode })
    setIsPlaying(false)
  }

  function handleAdminClick() {
    if (isAdmin) {
      setIsAdmin(false)
      setCurrentView('home')
    } else {
      setShowAdminModal(true)
    }
  }

  function handleAdminLogin() {
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

        {currentView === 'admin' && isAdmin && config && (
          <AdminView
            config={config}
            modpacks={modpacks}
            onSave={handleSaveConfig}
            onUpdateModpacks={handleUpdateModpacks}
          />
        )}
      </Layout>

      {showAdminModal && (
        <AdminLoginModal
          onSuccess={handleAdminLogin}
          onClose={() => setShowAdminModal(false)}
        />
      )}

      <UpdateNotification />
    </>
  )
}
