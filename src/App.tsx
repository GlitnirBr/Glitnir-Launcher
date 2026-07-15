import { useState, useEffect, useCallback, useRef } from 'react'
import Layout from './components/Layout/Layout'
import AdminLoginModal from './components/Admin/AdminLoginModal'
import UpdateNotification from './components/UpdateNotification/UpdateNotification'
import InstallBar from './components/InstallBar/InstallBar'
import { HomeView, ModsView, SettingsView, AdminView, ModpackEditorView, AboutView } from './views'
import { fetchModpackFromUrl, buildModpackRawUrl, checkOutdated, normalizeModpack, hashConfigs } from './utils/modManager'
import { getAdminModpack, getPublicModpack, getNews, publishNews, resolvePrivateMod, normalizeBackendUrl } from './utils/backendApi'
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
const MAIN: ModpackEntry = { id: 'glitnir', name: 'Glitnir', type: 'public' }
const ADMIN_TEST: ModpackEntry = { id: 'glitnir-admin', name: 'Glitnir Admin', type: 'admin' }

export default function App() {
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)

  const [isAdmin, setIsAdmin] = useState(false)
  const [adminToken, setAdminToken] = useState<string | null>(null)
  const [showAdminModal, setShowAdminModal] = useState(false)

  const [currentView, setCurrentView] = useState('home')
  const [selectedModpack, setSelectedModpack] = useState(MAIN.id)

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
      // Migra ids antigos de perfil para os novos nomes de pasta (principal → glitnir).
      const LEGACY_IDS: Record<string, string> = { principal: MAIN.id, 'admin-teste': ADMIN_TEST.id }
      const selected = cfg.selectedModpack ? (LEGACY_IDS[cfg.selectedModpack] || cfg.selectedModpack) : undefined
      // Descarta backendUrl de workers antigos (conta Cloudflare trocada) para cair no DEFAULT_BACKEND_URL.
      const backendUrl = normalizeBackendUrl(cfg.backendUrl)
      if (backendUrl !== (cfg.backendUrl || '')) {
        window.glitnir.config.save({ backendUrl }).catch(() => {})
      }
      setConfig({
        valheimPath: cfg.valheimPath || '',
        installedMods: cfg.installedMods || [],
        installedByProfile: cfg.installedByProfile || {},
        optionalModsEnabled: cfg.optionalModsEnabled || {},
        backendUrl,
        modpackRepo: cfg.modpackRepo || '',
        modpackBranch: cfg.modpackBranch || 'main',
        newsUrl: cfg.newsUrl || '',
        selectedModpack: selected,
        modsPath: cfg.modsPath,
      })
      if (selected) setSelectedModpack(selected)
    } catch {
      setConfig({
        valheimPath: '',
        installedMods: [],
        installedByProfile: {},
        optionalModsEnabled: {},
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
      const enabledOptional = config.optionalModsEnabled?.[entry.id] || []
      setMods(checkOutdated(installed, data, enabledOptional))
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

  // Mantém modpack e notícias atualizados sem precisar reabrir o launcher, com o mínimo de carga
  // no Worker do backend:
  //   - re-busca imediatamente ao voltar o foco para a janela (cobre "acabei de publicar");
  //   - enquanto a janela está VISÍVEL, faz um poll lento (5 min);
  //   - quando a janela é minimizada/escondida, PARA o poll — launcher em 2º plano = 0 requisições.
  // Assim a carga escala com jogadores ativos olhando a tela, não com launchers abertos ociosos.
  // As buscas revalidam via ETag (If-None-Match → 304 quando nada mudou), então o poll é barato.
  // Ref para ler o estado "ocupado" mais recente sem re-assinar o listener/interval a cada toggle.
  const busyRef = useRef(false)
  busyRef.current = installing || isPlaying

  useEffect(() => {
    if (!config) return

    let interval: ReturnType<typeof setInterval> | null = null

    const refresh = () => {
      // Não re-buscar no meio de uma instalação/launch: loadModpack() sobrescreveria o estado
      // otimista de `mods` (via setMods/checkOutdated) e atrapalharia o fluxo em andamento.
      if (busyRef.current) return
      loadModpack()
      loadNews()
    }

    const startPolling = () => {
      if (interval) return
      interval = setInterval(refresh, 5 * 60_000)
    }
    const stopPolling = () => {
      if (interval) { clearInterval(interval); interval = null }
    }

    // Alt-tab de volta para a janela: atualiza na hora.
    const onFocus = () => refresh()
    // Minimizar/restaurar: liga/desliga o poll de fundo conforme a visibilidade.
    const onVisibility = () => {
      if (document.hidden) {
        stopPolling()
      } else {
        refresh()
        startPolling()
      }
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    if (!document.hidden) startPolling()

    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      stopPolling()
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

  /**
   * Liga/desliga um mod opcional no estilo r2modman: os arquivos são MOVIDOS na hora entre a
   * pasta ativa do BepInEx e um depósito (.glitnir/disabled) — desativar não apaga e reativar
   * não re-baixa. Atualiza a preferência (optionalModsEnabled) e o estado físico (installedByProfile).
   */
  async function handleToggleOptionalMod(modName: string, enabled: boolean) {
    const profile = selectedModpack
    const mod = mods.find(m => m.name === modName)

    // Feedback imediato: o checkbox é controlado por `optionalDisabled`, então sem isto o toggle
    // só se moveria DEPOIS do IPC + do re-fetch do modpack em loadModpack — segundos em um backend
    // lento, dando a impressão de que "o toggle não funciona". Reflete a escolha na hora e reverte
    // só se o IPC falhar.
    setMods(prev => prev.map(m => (m.name === modName ? { ...m, optionalDisabled: !enabled } : m)))

    try {
      // Move os arquivos no disco imediatamente (se o mod já estava instalado / no depósito).
      const res = await window.glitnir.mods.setOptionalEnabled({
        profile, modName, enabled, version: mod?.version,
      })
      if (res && res.success === false) throw new Error(res.error || 'Falha ao alternar mod opcional')

      // Preferência opt-in: ligar adiciona; desligar remove.
      const enabledSet = new Set(config?.optionalModsEnabled?.[profile] || [])
      if (enabled) enabledSet.add(modName)
      else enabledSet.delete(modName)

      // Estado físico: só conta como "instalado" se os arquivos estão nos locais ativos do BepInEx.
      // Reativar de volta do depósito reusa a versão guardada (mantém a detecção de desatualizado).
      let installed = [...(config?.installedByProfile?.[profile] || [])]
      if (enabled && res?.moved) {
        if (!installed.some(m => m.name === modName)) {
          installed.push({ name: modName, version: res.version || mod?.version || '0.0.0' })
        }
      } else if (!enabled) {
        installed = installed.filter(m => m.name !== modName)
      }

      await handleSaveConfig({
        optionalModsEnabled: { ...(config?.optionalModsEnabled || {}), [profile]: Array.from(enabledSet) },
        installedByProfile: { ...(config?.installedByProfile || {}), [profile]: installed },
      })
    } catch (err) {
      // Reverte o feedback otimista — o disco/config não mudaram.
      console.error('Falha ao alternar mod opcional:', err)
      setMods(prev => prev.map(m => (m.name === modName ? { ...m, optionalDisabled: enabled } : m)))
    }
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

      // Remove mods that were installed for this profile before but are no longer in the modpack
      // (the admin took them out). Disabling an optional mod is handled instantly by the toggle
      // (files moved to the disabled store), so those don't come through here.
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
          // Mods privados são hospedados no repo privado, mas o backend serve o
          // download sem exigir login — qualquer jogador precisa conseguir baixar
          // os mods do modpack público. O token só é enviado se o admin estiver logado.
          const resolved = resolvePrivateMod(mod.downloadUrl, adminToken, config.backendUrl)
          url = resolved.url
          headers = resolved.headers
        }

        const dl = await window.glitnir.mods.download({ url, modName: mod.name, headers, sha256: mod.sha256 })
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

      // Registra os mods instalados desse perfil + o hash dos configs aplicados, para
      // detectar mudanças só de config (sem bump de versão de mod) no próximo launch.
      const installedList = activeMods.map(m => ({ name: m.name, version: m.version || '0.0.0' }))
      const installedByProfile = { ...(config.installedByProfile || {}), [profile]: installedList }
      const configsHashByProfile = { ...(config.configsHashByProfile || {}), [profile]: hashConfigs(configs) }
      await handleSaveConfig({ installedByProfile, configsHashByProfile })

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
      // Auto-install mods before launching. Besides the cached "pending" state, we check the
      // actual disk: if the profile folder was deleted (or BepInEx core is missing), the cached
      // "installed" flags lie — force a full reinstall so we recreate the profile from scratch
      // instead of launching into a missing BepInEx.dll.
      if (selectedModpack !== 'vanilla') {
        const bepinexOk = await window.glitnir.mods.bepinexOk({ profile: selectedModpack })
        // Pendência = mod ATIVO faltando/desatualizado. Desativar um opcional já move os arquivos
        // para o depósito na hora, então não gera pendência de launch.
        const hasPending = mods.some(m => !m.optionalDisabled && (!m.installed || m.outdated))
        // Configs mudaram = admin editou/adicionou config sem subir versão de mod. Sem isso,
        // uma mudança só de config nunca chegava ao player (os configs eram aplicados apenas
        // dentro de handleInstallMods, que só rodava quando havia mod pendente).
        const configsChanged =
          (config.configsHashByProfile?.[selectedModpack] ?? '') !== hashConfigs(modpackData?.configs)
        // Mod órfão = admin REMOVEU um mod do modpack (sem adicionar/atualizar outro nem mexer
        // em config). Sem este check o gate não dispararia — nenhum mod ativo fica pendente e o
        // config não muda —, então o handleInstallMods (que apaga os órfãos) nunca rodava e o
        // jogo continuava carregando o mod removido do perfil. Espelha o mesmo cálculo de `stale`
        // feito lá dentro (installedByProfile vs. mods ativos atuais).
        const currentActive = new Set(mods.filter(m => !m.optionalDisabled).map(m => m.name))
        const hasStale = (config.installedByProfile?.[selectedModpack] || [])
          .some(m => !currentActive.has(m.name))
        if (!bepinexOk || hasPending || configsChanged || hasStale) {
          await handleInstallMods()
        }
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
      if (selectedModpack === ADMIN_TEST.id) setSelectedModpack(MAIN.id)
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
