import { app, BrowserWindow, ipcMain, dialog, shell, session } from 'electron'
import { autoUpdater } from 'electron-updater'
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import { spawn } from 'child_process'

const DATA_PATH = path.join(app.getPath('appData'), 'GlitnirLauncher')
const CONFIG_FILE = path.join(DATA_PATH, 'config.json')
const PROFILES_ROOT = path.join(DATA_PATH, 'profiles')

/**
 * Sanitiza um nome (mod/perfil) para uso seguro como UM segmento de caminho.
 * Remove qualquer separador ou `..`, bloqueando path traversal. Para nomes de mod
 * legítimos (ex.: "ValheimModding-Jotunn") é no-op, pois só contêm [A-Za-z0-9_-].
 */
function safeName(name?: string): string {
  return (name || 'mod').replace(/[^a-zA-Z0-9_-]/g, '_')
}

/**
 * Parseia os bytes de um perfil r2modman (ZIP contendo `export.r2x` + pasta `config/`)
 * para a lista de mods e configs do Glitnir. É o MESMO conteúdo tanto de um arquivo
 * `.r2z` local quanto do código de perfil resolvido via Thunderstore (`#r2modman` +
 * base64), então ambos os caminhos de importação reusam esta função.
 *
 * Campos confirmados contra r2modmanPlus: mods[].name é "Namespace-ModName",
 * version é {major,minor,patch}, enabled default true.
 * Fonte: https://github.com/ebkr/r2modmanPlus
 */
// Extensões de config binário — espelha BINARY_CONFIG_EXT_RE em src/utils/modManager.ts.
// Binários (imagem/música/gif/fonte) não podem virar string; são retornados como base64
// para o editor subir ao R2 em vez de embutir no modpack.
const R2_BINARY_CONFIG_RE =
  /\.(png|jpe?g|gif|webp|bmp|ico|tga|dds|mp3|ogg|wav|flac|aac|m4a|mp4|webm|mov|mkv|ttf|otf|woff2?|zip|dll|bin|dat|pdf|unity3d|assetbundle|bundle)$/i

function parseR2ProfileZip(zipBuffer: Buffer):
  | { success: true; mods: { namespace: string; name: string; version: string }[]; configs: { filename: string; installPath: string; content?: string; contentBase64?: string }[] }
  | { success: false; error: string } {
  const AdmZip = require('adm-zip')
  let zip: any
  try {
    zip = new AdmZip(zipBuffer)
  } catch {
    return { success: false, error: 'Arquivo não é um ZIP válido (esperado um perfil .r2z do R2ModManager)' }
  }
  const entry = zip.getEntry('export.r2x')
  if (!entry) return { success: false, error: 'Arquivo export.r2x não encontrado no perfil — este não parece ser um .r2z do R2ModManager' }

  const yaml = require('yaml')
  let parsed: any
  try {
    parsed = yaml.parse(zip.readAsText(entry))
  } catch (err: any) {
    return { success: false, error: `Falha ao ler export.r2x: ${err.message}` }
  }
  if (typeof parsed?.profileName !== 'string' || !Array.isArray(parsed?.mods)) {
    return { success: false, error: 'export.r2x do perfil está com formato inválido' }
  }

  const mods = parsed.mods
    .filter((m: any) => m?.enabled === undefined || m.enabled)
    .map((m: any) => {
      const parts = String(m.name).split('-')
      return {
        namespace: parts[0],
        name: parts.slice(1).join('-'),
        version: `${m.version?.major ?? 0}.${m.version?.minor ?? 0}.${m.version?.patch ?? 0}`,
      }
    })
    .filter((m: { namespace: string; name: string }) => m.namespace && m.name)

  // Extrai configs da pasta config/ PRESERVANDO a estrutura de subpastas (ex.:
  // config/DistantOrigins/Translations/Mod/Mod.French.yml). Achatar tudo para
  // BepInEx/config/<nome> criava uma segunda cópia num caminho diferente do que o
  // próprio mod instala, gerando "Duplicate key ... skipped". Mantendo o caminho, o
  // config do perfil sobrescreve o padrão do mod — igual ao r2modman.
  const configs: { filename: string; installPath: string; content?: string; contentBase64?: string }[] = []
  zip.getEntries().forEach((e: any) => {
    if (e.isDirectory) return
    const name = String(e.entryName).replace(/\\/g, '/')
    if (!name.startsWith('config/')) return
    const rel = name.slice('config/'.length)
    if (!rel || rel.includes('..')) return
    const base = { filename: path.posix.basename(rel), installPath: `BepInEx/config/${rel}` }
    if (R2_BINARY_CONFIG_RE.test(rel)) {
      // Binário (ex.: música .ogg, gif, spritesheet .png): lê os BYTES crus como base64.
      // Ler como texto (readAsText) destruiria o arquivo. O editor sobe pro R2.
      configs.push({ ...base, contentBase64: e.getData().toString('base64') })
    } else {
      configs.push({ ...base, content: zip.readAsText(e) })
    }
  })

  return { success: true, mods, configs }
}

/**
 * Raízes cujo conteúdo o renderer pode ler/gravar via fs:* — a raiz de perfis mais
 * qualquer pasta que o usuário tenha escolhido explicitamente num diálogo do SO nesta
 * sessão. Sem isso, fs:readFile/writeFile aceitariam QUALQUER caminho do disco vindo do
 * renderer (leitura/escrita arbitrária = RCE se o renderer for comprometido).
 */
const allowedFsRoots = new Set<string>()

/**
 * Registra como raízes liberadas os caminhos que o PRÓPRIO usuário configurou (pasta do Valheim,
 * pasta de mods). São tão confiáveis quanto uma pasta escolhida em diálogo — só que persistidos no
 * config.json entre sessões. Sem isso, após reiniciar o launcher o valheimPath vindo do config não
 * estaria liberado e ações como "Abrir pasta" falhariam.
 */
function registerConfiguredRoots(config: any) {
  for (const p of [config?.valheimPath, config?.modsPath]) {
    if (typeof p === 'string' && p) allowedFsRoots.add(path.resolve(p))
  }
}

/** Um caminho está liberado se cair dentro da raiz de perfis ou de uma pasta escolhida em diálogo. */
function isPathAllowed(p: string): boolean {
  const target = path.resolve(p)
  const roots = [getProfilesRoot(), ...allowedFsRoots]
  return roots.some(root => {
    const r = path.resolve(root)
    return target === r || target.startsWith(r + path.sep)
  })
}

/** Procura um arquivo pelo nome recursivamente; retorna o caminho ou null. */
function findFileInDir(dir: string, filename: string): string | null {
  if (!fs.existsSync(dir)) return null
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry)
    const stat = fs.statSync(full)
    if (stat.isFile() && entry.toLowerCase() === filename.toLowerCase()) return full
    if (stat.isDirectory()) {
      const found = findFileInDir(full, filename)
      if (found) return found
    }
  }
  return null
}

/** Copia uma pasta recursivamente (merge, não substitui pastas). */
function copyDirRecursive(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry)
    const destPath = path.join(dest, entry)
    if (fs.statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

/** Lista arquivos de uma pasta recursivamente, como caminhos relativos a ela. */
function listFilesRecursive(dir: string, prefix = ''): string[] {
  let out: string[] = []
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry)
    const rel = prefix ? path.join(prefix, entry) : entry
    if (fs.statSync(full).isDirectory()) out = out.concat(listFilesRecursive(full, rel))
    else out.push(rel)
  }
  return out
}

/**
 * Caminho do manifesto de um mod dentro do perfil. Registra os arquivos que o install
 * roteou para PASTAS COMPARTILHADAS (patchers/monomod/core) — que o mods:remove não teria
 * como localizar de outra forma, já que seus nomes não têm relação com o nome do mod.
 */
function modManifestPath(profileRoot: string, modName: string): string {
  return path.join(profileRoot, '.glitnir', 'installed', `${safeName(modName)}.json`)
}

/** Grava o manifesto de um mod com a lista de arquivos externos (relativos ao perfil). */
function writeModManifest(profileRoot: string, modName: string, external: string[]) {
  const mf = modManifestPath(profileRoot, modName)
  fs.mkdirSync(path.dirname(mf), { recursive: true })
  fs.writeFileSync(mf, JSON.stringify({ external }, null, 2))
}

/** Sobe removendo pastas que ficaram vazias, parando em (sem apagar) `stop`. */
function pruneEmptyParents(fileAbs: string, stop: string) {
  const stopAbs = path.resolve(stop)
  let dir = path.dirname(path.resolve(fileAbs))
  while (dir.startsWith(stopAbs + path.sep) && dir !== stopAbs) {
    try {
      if (fs.readdirSync(dir).length > 0) break
      fs.rmdirSync(dir)
      dir = path.dirname(dir)
    } catch { break }
  }
}

/** Move um arquivo/pasta (rename rápido no mesmo disco; cai p/ copy+rm se cruzar discos). */
function movePath(src: string, dest: string) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  try {
    fs.renameSync(src, dest)
  } catch (e: any) {
    if (e.code === 'EXDEV' || e.code === 'EPERM' || e.code === 'ENOTEMPTY') {
      if (fs.statSync(src).isDirectory()) {
        copyDirRecursive(src, dest)
        fs.rmSync(src, { recursive: true, force: true })
      } else {
        fs.copyFileSync(src, dest)
        fs.rmSync(src, { force: true })
      }
    } else throw e
  }
}

/** Depósito de um mod desativado dentro do perfil (fora da árvore que o BepInEx varre). */
function disabledStoreDir(profileRoot: string, modName: string): string {
  return path.join(profileRoot, '.glitnir', 'disabled', safeName(modName))
}

/**
 * Desativa um mod SEM apagar (estilo r2modman): MOVE a pasta do plugin e os arquivos que o
 * install roteou para pastas compartilhadas (patchers/monomod/core, do manifesto) para um
 * depósito em .glitnir/disabled/<mod>/. O BepInEx para de carregá-los, mas religar não re-baixa.
 * Retorna { moved } — moved=false quando não havia nada instalado (nada a mover).
 */
function disableModFiles(profileRoot: string, modName: string, version?: string): { moved: boolean; version?: string } {
  const store = disabledStoreDir(profileRoot, modName)
  const pluginDir = path.join(profileRoot, 'BepInEx', 'plugins', safeName(modName))
  const hadPlugin = fs.existsSync(pluginDir)

  // Arquivos externos (patchers/monomod/core) registrados no manifesto do install.
  const mf = modManifestPath(profileRoot, modName)
  let external: string[] = []
  if (fs.existsSync(mf)) {
    try { external = (JSON.parse(fs.readFileSync(mf, 'utf-8')).external || []) as string[] } catch { /* ignora */ }
  }

  if (!hadPlugin && external.length === 0) return { moved: false }

  // Zera um depósito antigo (ex.: religar interrompido no meio) antes de reencher.
  if (fs.existsSync(store)) fs.rmSync(store, { recursive: true, force: true })

  if (hadPlugin) movePath(pluginDir, path.join(store, 'plugins', safeName(modName)))

  const bepinex = path.join(profileRoot, 'BepInEx')
  const movedExternal: string[] = []
  for (const rel of external) {
    const from = path.resolve(profileRoot, rel)
    // Segurança: só mexe dentro do perfil (bloqueia path traversal em manifesto adulterado).
    if (from !== profileRoot && !from.startsWith(path.resolve(profileRoot) + path.sep)) continue
    if (fs.existsSync(from)) {
      movePath(from, path.join(store, 'external', rel))
      movedExternal.push(rel)
      pruneEmptyParents(from, bepinex)
    }
  }

  fs.mkdirSync(store, { recursive: true })
  fs.writeFileSync(
    path.join(store, 'meta.json'),
    JSON.stringify({ modName, version: version || null, external: movedExternal }, null, 2),
  )
  return { moved: true, version }
}

/**
 * Religa um mod desativado movendo os arquivos do depósito de volta aos locais ativos do
 * BepInEx. Retorna { moved, version } — moved=false quando não há depósito (nunca instalado):
 * nesse caso quem cuida é o fluxo normal de download/install.
 */
function enableModFiles(profileRoot: string, modName: string): { moved: boolean; version?: string } {
  const store = disabledStoreDir(profileRoot, modName)
  if (!fs.existsSync(store)) return { moved: false }

  let meta: { version?: string | null; external?: string[] } = {}
  try { meta = JSON.parse(fs.readFileSync(path.join(store, 'meta.json'), 'utf-8')) } catch { /* segue */ }

  const storedPlugin = path.join(store, 'plugins', safeName(modName))
  if (fs.existsSync(storedPlugin)) {
    const dest = path.join(profileRoot, 'BepInEx', 'plugins', safeName(modName))
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
    movePath(storedPlugin, dest)
  }

  for (const rel of meta.external || []) {
    const from = path.join(store, 'external', rel)
    if (fs.existsSync(from)) movePath(from, path.resolve(profileRoot, rel))
  }

  fs.rmSync(store, { recursive: true, force: true })
  return { moved: true, version: meta.version || undefined }
}

/** Localiza o BepInEx Preloader dentro de <perfil>/BepInEx/core (nome varia por runtime). */
function findPreloaderDll(coreDir: string): string | null {
  if (!fs.existsSync(coreDir)) return null
  const known = [
    'BepInEx.Preloader.dll',            // Valheim / Unity Mono (5.4.x)
    'BepInEx.Unity.Mono.Preloader.dll',
    'BepInEx.IL2CPP.dll',
    'BepInEx.Unity.IL2CPP.dll',
    'BepInEx.NET.CoreCLR.dll',
  ]
  const files = fs.readdirSync(coreDir)
  const hit = known.find(k => files.includes(k))
  return hit ? path.join(coreDir, hit) : null
}

/** Copia um arquivo só se estiver ausente ou diferente no destino (tamanho ou mtime). */
function copyFileIfChanged(src: string, dest: string) {
  try {
    const s = fs.statSync(src)
    if (fs.existsSync(dest)) {
      const d = fs.statSync(dest)
      // copyFileSync não preserva mtime, então o destino fica >= origem quando já está atualizado.
      if (d.size === s.size && d.mtimeMs >= s.mtimeMs) return
    }
  } catch { /* em dúvida, copia */ }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

/**
 * Sincroniza src → dest copiando apenas o que mudou (rápido em launches repetidos).
 * Com `mirror`, remove do destino o que não existe mais na origem (limpa mods removidos
 * e versões duplicadas). Sem `mirror`, nunca apaga (preserva configs gerados em runtime).
 */
function syncDir(src: string, dest: string, mirror: boolean) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dest, { recursive: true })
  const srcEntries = fs.readdirSync(src)
  if (mirror && fs.existsSync(dest)) {
    const keep = new Set(srcEntries)
    for (const name of fs.readdirSync(dest)) {
      if (!keep.has(name)) fs.rmSync(path.join(dest, name), { recursive: true, force: true })
    }
  }
  for (const name of srcEntries) {
    const s = path.join(src, name)
    const d = path.join(dest, name)
    if (fs.statSync(s).isDirectory()) syncDir(s, d, mirror)
    else copyFileIfChanged(s, d)
  }
}

/**
 * Subpastas de topo de um pacote Thunderstore que o BepInEx espera em locais
 * próprios (fora de plugins/). Espelha as install rules do r2modman.
 */
const BEPINEX_ROUTES: Record<string, string> = {
  config: 'config',
  patchers: 'patchers',
  monomod: 'monomod',
  core: 'core',
  plugins: 'plugins',
}

/**
 * Roteia o conteúdo de um pacote Thunderstore já extraído (staging) para os
 * locais corretos do BepInEx, imitando as install rules do r2modman:
 *   config/   → BepInEx/config/   (preservando subpastas — é isso que gera as
 *               pastas separadas de config que alguns mods criam)
 *   patchers/ → BepInEx/patchers/
 *   monomod/  → BepInEx/monomod/
 *   core/     → BepInEx/core/
 *   plugins/  → BepInEx/plugins/<modName>/
 *   restante (dll solta, manifest, readme, icon, assets…) → BepInEx/plugins/<modName>/
 */
function routeModContents(staging: string, profileRoot: string, modName: string): string[] {
  // Desce por pastas-invólucro (uma única subpasta, sem arquivos soltos) até a raiz do pacote.
  let root = staging
  for (;;) {
    const entries = fs.readdirSync(root)
    const subdirs = entries.filter(e => fs.statSync(path.join(root, e)).isDirectory())
    const files = entries.filter(e => fs.statSync(path.join(root, e)).isFile())
    if (files.length === 0 && subdirs.length === 1) {
      root = path.join(root, subdirs[0])
    } else {
      break
    }
  }

  const pluginTarget = path.join(profileRoot, 'BepInEx', 'plugins', modName)
  // Arquivos criados em pastas compartilhadas (patchers/monomod/core), para o mods:remove.
  // config/ NÃO entra aqui: é preservado na remoção, igual ao r2modman.
  const external: string[] = []

  for (const entry of fs.readdirSync(root)) {
    const full = path.join(root, entry)
    const isDir = fs.statSync(full).isDirectory()
    const routed = isDir ? BEPINEX_ROUTES[entry.toLowerCase()] : undefined

    if (routed && routed !== 'plugins') {
      // config / patchers / monomod / core → BepInEx/<routed>/ (mantém subestrutura)
      const destDir = path.join(profileRoot, 'BepInEx', routed)
      copyDirRecursive(full, destDir)
      if (routed !== 'config') {
        for (const rel of listFilesRecursive(full)) {
          external.push(path.relative(profileRoot, path.join(destDir, rel)))
        }
      }
    } else if (routed === 'plugins') {
      // conteúdo de plugins/ do pacote entra na pasta do próprio mod
      copyDirRecursive(full, pluginTarget)
    } else if (isDir) {
      // pasta desconhecida (assets etc.) → plugins/<modName>/ preservando estrutura
      copyDirRecursive(full, path.join(pluginTarget, entry))
    } else {
      // arquivo solto (dll, manifest, readme, icon…) → plugins/<modName>/
      fs.mkdirSync(pluginTarget, { recursive: true })
      fs.copyFileSync(full, path.join(pluginTarget, entry))
    }
  }

  return external
}

/**
 * Migra instalações antigas: versões anteriores do launcher extraíam o pacote
 * Thunderstore inteiro dentro de plugins/<mod>/, deixando config/patchers/monomod
 * aninhados lá em vez dos locais corretos do BepInEx. Isso duplica arquivos
 * (ex.: traduções .yml carregadas duas vezes → "Duplicate key ... will be skipped")
 * e pode impedir o jogo de rodar. Move essas subpastas para fora.
 */
function migrateNestedBepInExFolders(profileRoot: string): number {
  const pluginsRoot = path.join(profileRoot, 'BepInEx', 'plugins')
  if (!fs.existsSync(pluginsRoot)) return 0
  let moved = 0
  for (const mod of fs.readdirSync(pluginsRoot)) {
    const modDir = path.join(pluginsRoot, mod)
    if (!fs.statSync(modDir).isDirectory()) continue
    for (const sub of ['config', 'patchers', 'monomod']) {
      const nested = path.join(modDir, sub)
      if (fs.existsSync(nested) && fs.statSync(nested).isDirectory()) {
        copyDirRecursive(nested, path.join(profileRoot, 'BepInEx', sub))
        fs.rmSync(nested, { recursive: true, force: true })
        moved++
      }
    }
  }
  return moved
}

/** Roda a migração acima em todos os perfis existentes (idempotente). */
function migrateAllProfiles() {
  try {
    const root = getProfilesRoot()
    if (!fs.existsSync(root)) return
    for (const profile of fs.readdirSync(root)) {
      const p = path.join(root, profile)
      try {
        if (fs.statSync(p).isDirectory()) {
          const n = migrateNestedBepInExFolders(p)
          if (n > 0) console.log(`[migrate] ${profile}: ${n} pasta(s) movida(s) de plugins/ para BepInEx/`)
        }
      } catch { /* ignora erros por perfil */ }
    }
  } catch { /* ignora */ }
}

/** Retorna a raiz de perfis: config.modsPath se definido, senão o default. */
function getProfilesRoot(): string {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
      if (cfg.modsPath) return cfg.modsPath
    }
  } catch { /* ignore */ }
  return PROFILES_ROOT
}

/** Sanitiza o id do modpack para usar como nome de pasta de perfil. */
function profileDir(profile: string): string {
  return path.join(getProfilesRoot(), safeName(profile || 'default'))
}

function ensureDirs(profile?: string) {
  const root = getProfilesRoot()
  const dirs = [DATA_PATH, root]
  if (profile) {
    const p = profileDir(profile)
    dirs.push(p, path.join(p, 'BepInEx', 'plugins'), path.join(p, 'BepInEx', 'config'))
  }
  dirs.forEach(p => {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
  })
}

function autoDetectValheim(): string {
  const possiblePaths = [
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Valheim',
    'C:\\Program Files\\Steam\\steamapps\\common\\Valheim',
    'D:\\Steam\\steamapps\\common\\Valheim',
    'D:\\SteamLibrary\\steamapps\\common\\Valheim',
    'E:\\Steam\\steamapps\\common\\Valheim',
    'E:\\SteamLibrary\\steamapps\\common\\Valheim',
  ]
  for (const p of possiblePaths) {
    if (fs.existsSync(path.join(p, 'valheim.exe'))) return p
  }
  return ''
}

function loadConfig() {
  ensureDirs()
  if (!fs.existsSync(CONFIG_FILE)) {
    const detected = autoDetectValheim()
    const defaultConfig = {
      valheimPath: detected,
      installedMods: [],
      backendUrl: '',
      modpackRepo: '',
      modpackBranch: 'main',
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2))
    registerConfiguredRoots(defaultConfig)
    return defaultConfig
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
  if (!config.valheimPath) {
    config.valheimPath = autoDetectValheim()
    saveConfig(config)
  }
  registerConfiguredRoots(config)
  return config
}

function saveConfig(newValues: object) {
  ensureDirs()
  let current: any = {}
  if (fs.existsSync(CONFIG_FILE)) {
    current = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
  }
  const merged = { ...current, ...newValues }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2))
  registerConfiguredRoots(merged)
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0d1520',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Sandbox do Chromium: isola o renderer em processo próprio sem acesso ao SO. O preload só
      // usa contextBridge/ipcRenderer (compatíveis com sandbox), então liga sem quebrar a ponte.
      sandbox: true,
    },
  })

  // Em produção carrega o bundle local diretamente. NUNCA tenta o servidor de dev primeiro:
  // um processo qualquer escutando em localhost:5173 na máquina do usuário seria carregado
  // com a ponte IPC (glitnir) anexada. O dev server só é usado em builds não-empacotados.
  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  } else {
    win.loadURL('http://localhost:5173').catch(() => {
      win.loadFile(path.join(__dirname, '../dist/index.html'))
    })
  }

  // Trava de navegação: impede a janela principal de sair da própria origem. Sem isso, se o
  // renderer fosse induzido a navegar para uma página remota, ela herdaria a ponte glitnir
  // (fs read/write, game.launch). Links externos legítimos passam por shell.openExternal.
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  return win
}

app.whenReady().then(() => {
  // Content-Security-Policy só em produção (o dev server do Vite usa inline scripts + WS de HMR,
  // que uma CSP estrita quebraria). Restringe scripts à própria origem e conexões/imagens a HTTPS,
  // servindo de rede de segurança contra XSS. Ajuste as fontes se o app passar a buscar outros hosts.
  if (app.isPackaged) {
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; " +
            "script-src 'self'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' https: data:; " +
            "font-src 'self' data:; " +
            "connect-src 'self' https:; " +
            "object-src 'none'; " +
            "frame-src 'none'",
          ],
        },
      })
    })
  }

  // Corrige instalações antigas com config/ aninhado dentro de plugins/ (duplicatas).
  migrateAllProfiles()

  const win = createWindow()

  // Auto-updater — only runs in packaged builds
  if (app.isPackaged) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('update-available', () => {
      win.webContents.send('updater:status', { status: 'available' })
    })

    autoUpdater.on('download-progress', (info) => {
      win.webContents.send('updater:progress', {
        percent: Math.round(info.percent),
        transferred: info.transferred,
        total: info.total,
      })
    })

    autoUpdater.on('update-downloaded', () => {
      win.webContents.send('updater:status', { status: 'downloaded' })
    })

    autoUpdater.on('error', (err) => {
      console.error('Auto-updater error:', err)
      win.webContents.send('updater:status', { status: 'error', message: err.message })
    })

    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {})
    }, 3000)
  }

  ipcMain.handle('updater:check', () => {
    if (app.isPackaged) autoUpdater.checkForUpdates().catch(() => {})
  })

  ipcMain.handle('updater:install', () => {
    if (app.isPackaged) autoUpdater.quitAndInstall()
  })

  ipcMain.on('window:minimize', () => win.minimize())
  ipcMain.on('window:maximize', () => win.isMaximized() ? win.unmaximize() : win.maximize())
  ipcMain.on('window:close', () => win.close())

  ipcMain.handle('config:load', () => loadConfig())

  ipcMain.handle('config:save', (_e, newValues) => {
    console.log('config:save recebido:', JSON.stringify(newValues))
    saveConfig(newValues)
    return true
  })

  ipcMain.handle('valheim:autoDetect', () => autoDetectValheim())

  ipcMain.handle('mods:defaultPath', () => PROFILES_ROOT)

  ipcMain.handle('dialog:selectValheimPath', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Selecione a pasta do Valheim',
      properties: ['openDirectory'],
    })
    if (!result.canceled && result.filePaths[0]) {
      allowedFsRoots.add(path.resolve(result.filePaths[0]))
      return result.filePaths[0]
    }
    return null
  })

  ipcMain.handle('mods:install', async (_e, { zipPath, modName, profile }) => {
    try {
      ensureDirs(profile)
      // Sanitiza o nome do mod: ele vira segmento de caminho (plugins/<mod>) e vem do manifesto.
      // Sem isso, um nome com `../` gravaria fora do perfil (path traversal).
      const mod = safeName(modName)
      const ext = path.extname(zipPath).toLowerCase()
      const modFolder = path.join(profileDir(profile), 'BepInEx', 'plugins', mod)

      if (ext === '.dll') {
        // DLL: copy directly into the mod's own plugin folder so BepInEx can find it
        fs.mkdirSync(modFolder, { recursive: true })
        fs.copyFileSync(zipPath, path.join(modFolder, path.basename(zipPath)))
        // Sem arquivos em pastas compartilhadas: manifesto vazio (remoção só apaga o plugin).
        writeModManifest(profileDir(profile), mod, [])
      } else {
        // ZIP (default): extract to a staging dir first, then route the package the same
        // way r2modman does — special top-level folders (config/, patchers/, monomod/,
        // core/, plugins/) go to their BepInEx locations instead of being dumped inside
        // plugins/<modName>/.
        const AdmZip = require('adm-zip')
        const zip = new AdmZip(zipPath)
        const staging = path.join(os.tmpdir(), `glitnir-mod-${mod}-${Date.now()}`)
        zip.extractAllTo(staging, true)

        // Detect BepInExPack: ZIP contains winhttp.dll → promote ALL framework files to profile root.
        // R2ModManager copies winhttp.dll, doorstop_config.ini, doorstop_libs/, BepInEx/core/, etc.
        // to the profile root, then does NOT keep BepInExPack in plugins/.
        const winhttpInStaging = findFileInDir(staging, 'winhttp.dll')
        if (winhttpInStaging) {
          // Copy everything at the BepInExPack root level to the profile root
          // (winhttp.dll, doorstop_config.ini, doorstop_libs/, BepInEx/core/, etc.)
          copyDirRecursive(path.dirname(winhttpInStaging), profileDir(profile))
        } else {
          // Normal Thunderstore mod: route config/ → BepInEx/config/, etc.
          const external = routeModContents(staging, profileDir(profile), mod)
          // Registra os arquivos roteados p/ pastas compartilhadas para o mods:remove limpá-los.
          writeModManifest(profileDir(profile), mod, external)
        }
        fs.rmSync(staging, { recursive: true, force: true })
      }

      fs.unlinkSync(zipPath)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('mods:download', async (_e, { url, modName, headers, sha256 }: { url: string; modName: string; headers?: Record<string, string>; sha256?: string }) => {
    try {
      // Só baixa de http/https (bloqueia file:// e outros esquemas vindos do renderer).
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
        return { success: false, error: 'URL de download inválida' }
      }
      const axios = require('axios')
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: headers || undefined,
        maxRedirects: 5,
        timeout: 120000,
        maxContentLength: 512 * 1024 * 1024, // teto de 512MB contra payloads gigantes
        maxBodyLength: 512 * 1024 * 1024,
      })
      const buf = Buffer.from(response.data)

      // Verificação de integridade (defense-in-depth): se o manifesto trouxer um sha256, o
      // download só é aceito se o hash bater. Protege contra um repositório/mirror adulterado.
      // Retrocompatível: mods sem sha256 no manifesto seguem sem verificação.
      if (sha256) {
        const digest = crypto.createHash('sha256').update(buf).digest('hex')
        if (digest.toLowerCase() !== String(sha256).toLowerCase()) {
          return { success: false, error: `Integridade falhou para ${modName}: hash não confere (esperado ${sha256}, obtido ${digest}).` }
        }
      }

      // Preserve the real file extension so mods:install can detect the file type
      const urlExt = path.extname(url.split('?')[0]).toLowerCase() || '.zip'
      const tempPath = path.join(os.tmpdir(), `${safeName(modName)}-${Date.now()}${urlExt}`)
      fs.writeFileSync(tempPath, buf)
      return { success: true, tempPath }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('mods:applyConfig', async (_e, { profile, installPath, content }) => {
    try {
      ensureDirs(profile)
      const base = path.resolve(profileDir(profile))
      // Impede path traversal para fora do perfil. O separador no prefixo evita que uma pasta
      // IRMÃ com o mesmo prefixo (ex.: <perfil>_evil) passe no teste.
      const target = path.resolve(base, installPath)
      if (target !== base && !target.startsWith(base + path.sep)) {
        return { success: false, error: 'Caminho de config inválido' }
      }

      fs.mkdirSync(path.dirname(target), { recursive: true })

      const trimmed = (content || '').trim()
      if (/^https?:\/\//i.test(trimmed)) {
        // Config referenciado por URL (usado para binários — ex.: spritesheet .png —
        // que não cabem como string no modpack.json). Baixa como arraybuffer e grava
        // os BYTES crus: preserva binário E texto (bytes UTF-8 de um .cfg saem iguais).
        // http/https-only + timeout (a URL vem de dados remotos do manifesto).
        const axios = require('axios')
        const res = await axios.get(trimmed, { responseType: 'arraybuffer', timeout: 30000, maxRedirects: 5 })
        fs.writeFileSync(target, Buffer.from(res.data))
      } else {
        fs.writeFileSync(target, content)
      }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('fs:pickImage', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Selecionar imagem',
      filters: [{ name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const filePath = result.filePaths[0]
    const stat = fs.statSync(filePath)
    const content = fs.readFileSync(filePath).toString('base64')
    return {
      filename: path.basename(filePath),
      content,
      size: stat.size,
    }
  })

  ipcMain.handle('mods:pickAndRead', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Selecione o arquivo do mod',
      filters: [
        { name: 'Arquivos de Mod', extensions: ['zip', 'dll'] },
        { name: 'Todos os arquivos', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const filePath = result.filePaths[0]
    const stat = fs.statSync(filePath)
    const content = fs.readFileSync(filePath).toString('base64')
    return {
      filename: path.basename(filePath),
      content,
      size: stat.size,
    }
  })

  ipcMain.handle('mods:readConfigsFromZip', async (_e, { url }: { url: string }) => {
    try {
      // Só busca de http/https (bloqueia file:// e outros esquemas locais vindos do renderer),
      // igual ao mods:download — a url pode vir de dados remotos (manifesto do modpack).
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
        return { success: false, error: 'URL inválida' }
      }
      const axios = require('axios')
      const AdmZip = require('adm-zip')
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        maxRedirects: 5,
        timeout: 30000,
      })
      const zip = new AdmZip(Buffer.from(response.data))
      const found: { filename: string; installPath: string; content: string }[] = []
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue
        const name = entry.entryName.replace(/\\/g, '/')
        if (!name.endsWith('.cfg')) continue
        // Preserva a estrutura relativa a uma pasta config/ (ex.: config/Sub/x.cfg →
        // BepInEx/config/Sub/x.cfg). Assim o config casa com onde o mod realmente instala,
        // sem gerar cópia duplicada num caminho achatado. Fora de config/, vai pra raiz.
        const idx = name.indexOf('config/')
        const rel = idx >= 0 ? name.slice(idx + 'config/'.length) : path.posix.basename(name)
        if (!rel || rel.includes('..')) continue
        const installPath = `BepInEx/config/${rel}`
        try {
          const content = entry.getData().toString('utf-8')
          found.push({ filename: path.posix.basename(rel), installPath, content })
        } catch {
          // Skip unreadable entries
        }
      }
      return { success: true, configs: found }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('mods:bepinexOk', (_e, { profile }: { profile: string }) => {
    const dll = path.join(profileDir(profile), 'BepInEx', 'core', 'BepInEx.dll')
    return fs.existsSync(dll)
  })

  ipcMain.handle('mods:openLog', async (_e, { valheimPath, profile }: { valheimPath: string; profile?: string }) => {
    try {
      // No modelo r2modman o BepInEx roda a partir do perfil, então o LogOutput.log fica lá.
      // Ordem: log do BepInEx no perfil → log do BepInEx no jogo (instalações antigas por cópia)
      // → output_log.txt bruto do Unity (redirect_output_log) para crashes precoces.
      const candidates: string[] = []
      if (profile) candidates.push(path.join(profileDir(profile), 'BepInEx', 'LogOutput.log'))
      if (valheimPath) {
        candidates.push(path.join(valheimPath, 'BepInEx', 'LogOutput.log'))
        candidates.push(path.join(valheimPath, 'output_log.txt'))
      }
      const logPath = candidates.find(p => fs.existsSync(p))
      if (!logPath) {
        return { success: false, error: 'Nenhum log encontrado ainda. Jogue no modo modado pelo menos uma vez.' }
      }
      const err = await shell.openPath(logPath)
      if (err) return { success: false, error: err }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('mods:list', (_e, profile: string) => {
    const pluginsPath = path.join(profileDir(profile), 'BepInEx', 'plugins')
    if (!fs.existsSync(pluginsPath)) return []
    return fs.readdirSync(pluginsPath).filter(f =>
      fs.statSync(path.join(pluginsPath, f)).isDirectory()
    )
  })

  ipcMain.handle('mods:remove', (_e, { modName, profile }) => {
    const profileRoot = profileDir(profile)
    const modPath = path.join(profileRoot, 'BepInEx', 'plugins', safeName(modName))
    const existed = fs.existsSync(modPath)
    if (existed) fs.rmSync(modPath, { recursive: true, force: true })

    // Além do plugin, apaga o que o mod roteou para pastas compartilhadas (patchers/monomod/core),
    // registrado no manifesto do install. Sem isso, um patcher removido continua carregando no jogo.
    // Configs não entram no manifesto — preservados de propósito, como no r2modman.
    const mf = modManifestPath(profileRoot, modName)
    let removedExternal = 0
    if (fs.existsSync(mf)) {
      try {
        const { external = [] } = JSON.parse(fs.readFileSync(mf, 'utf-8')) as { external?: string[] }
        const bepinex = path.join(profileRoot, 'BepInEx')
        for (const rel of external) {
          // Segurança: só apaga dentro do perfil (bloqueia path traversal em manifesto adulterado).
          const target = path.resolve(profileRoot, rel)
          if (target !== profileRoot && !target.startsWith(path.resolve(profileRoot) + path.sep)) continue
          if (fs.existsSync(target)) {
            fs.rmSync(target, { force: true })
            removedExternal++
            pruneEmptyParents(target, bepinex)
          }
        }
        fs.rmSync(mf, { force: true })
      } catch { /* manifesto corrompido: plugin já foi removido, segue o jogo */ }
    }

    if (existed || removedExternal > 0) return { success: true }
    return { success: false, error: 'Mod não encontrado' }
  })

  // Liga/desliga um mod opcional MOVENDO os arquivos (estilo r2modman), sem apagar/re-baixar.
  ipcMain.handle('mods:setOptionalEnabled', (_e, { profile, modName, enabled, version }: { profile: string; modName: string; enabled: boolean; version?: string }) => {
    try {
      const profileRoot = profileDir(profile)
      const r = enabled ? enableModFiles(profileRoot, modName) : disableModFiles(profileRoot, modName, version)
      return { success: true, ...r }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('game:launch', async (_e, { valheimPath, mode, profile }) => {
    try {
      const exe = path.join(valheimPath, 'valheim.exe')
      if (!fs.existsSync(exe)) {
        return { success: false, error: 'valheim.exe não encontrado no caminho configurado.' }
      }
      if (mode === 'vanilla') {
        spawn(exe, [], { detached: true, stdio: 'ignore', cwd: valheimPath }).unref()
      } else {
        const profileRoot = profileDir(profile)

        // Corrige config/ aninhado em plugins/ neste perfil.
        migrateNestedBepInExFolders(profileRoot)

        // ── Modelo r2modman ─────────────────────────────────────────────────────────────
        // NÃO copiamos o BepInEx para a pasta do jogo. Deixamos só o proxy do doorstop
        // (winhttp.dll) na pasta do Steam e apontamos o target para o BepInEx.Preloader.dll
        // DENTRO do perfil. O BepInEx deriva plugins/config/patchers do local do Preloader
        // (confirmado no Entrypoint.cs do BepInEx: BepInExRootPath = 2 níveis acima do
        // Preloader), então tudo carrega direto do perfil — sem cópia pesada a cada launch e
        // sem lixo/configs duplicadas acumulando na pasta do jogo.
        const coreDir = path.join(profileRoot, 'BepInEx', 'core')
        const preloaderSrc = findPreloaderDll(coreDir)
        if (!preloaderSrc) {
          return { success: false, error: `BepInEx.Preloader.dll não encontrado em ${coreDir} — Certifique-se de que o BepInExPack está no modpack e reinstale os mods.` }
        }

        function tryCopy(src: string, dest: string) {
          if (!fs.existsSync(src)) return
          try { fs.copyFileSync(src, dest) } catch (e: any) {
            if (e.code !== 'EBUSY') throw e
          }
        }

        // Proxy do doorstop na pasta do jogo (leve: só winhttp.dll + doorstop_libs).
        // Prefere doorstop_libs/x64/winhttp.dll (proxy 64-bit garantido para o Valheim).
        const winhttpX64 = path.join(profileRoot, 'doorstop_libs', 'x64', 'winhttp.dll')
        const winhttpRoot = path.join(profileRoot, 'winhttp.dll')
        const winhttpSrc = fs.existsSync(winhttpX64) ? winhttpX64 : winhttpRoot
        tryCopy(winhttpSrc, path.join(valheimPath, 'winhttp.dll'))
        try { syncDir(path.join(profileRoot, 'doorstop_libs'), path.join(valheimPath, 'doorstop_libs'), false) }
        catch (e: any) { if (e.code !== 'EBUSY') throw e }

        if (!fs.existsSync(path.join(valheimPath, 'winhttp.dll'))) {
          return { success: false, error: 'winhttp.dll não encontrado. Certifique-se de que o BepInExPack está no modpack e reinstale os mods.' }
        }

        // Limpeza única: versões antigas COPIAVAM o BepInEx para a pasta do jogo. Agora ele
        // carrega do perfil, então esse BepInEx na pasta do Steam é lixo ignorado — e era a
        // fonte das configs duplicadas (traduções em dois caminhos). Remove uma vez; best-effort
        // (ignora se o jogo estiver aberto/arquivo em uso).
        const gameBepinex = path.join(valheimPath, 'BepInEx')
        if (fs.existsSync(gameBepinex)) {
          try { fs.rmSync(gameBepinex, { recursive: true, force: true }) } catch { /* em uso? ignora */ }
        }

        // doorstop_config.ini apontando para o Preloader do PERFIL (caminho absoluto),
        // compatível com doorstop v3 e v4. redirect_output_log grava output_log.txt na pasta do
        // jogo (captura crashes antes do logger do BepInEx subir).
        const iniPath = path.join(valheimPath, 'doorstop_config.ini')
        if (fs.existsSync(iniPath)) fs.unlinkSync(iniPath)
        const doorstopIni = [
          '[General]',
          'enabled = true',
          `target_assembly = ${preloaderSrc}`,
          'redirect_output_log = true',
          'boot_config_override =',
          'ignore_disable_switch = false',
          '',
          '[UnityDoorstop]',
          'enabled=true',
          `targetAssembly=${preloaderSrc}`,
          'redirect_output_log=true',
          'ignore_disable_switch=false',
          '',
        ].join('\r\n')
        fs.writeFileSync(iniPath, doorstopIni, { encoding: 'utf8' })

        console.log('[launch] winhttp.dll size:', fs.statSync(path.join(valheimPath, 'winhttp.dll')).size, 'bytes')
        console.log('[launch] preloader (perfil):', preloaderSrc)
        console.log('[launch] ini written:', doorstopIni.replace(/\r\n/g, '↵'))

        // Use shell.openPath (ShellExecuteEx) — identical to double-clicking from Explorer.
        // Write a launch bat to the game dir and open it; this ensures correct CWD and
        // Windows-native DLL loading without any WSL2 spawn quirks.
        const batPath = path.join(valheimPath, 'glitnir_launch.bat')
        const batContent = [
          '@echo off',
          `cd /d "${valheimPath}"`,
          `start "" "${exe}"`,
          '',
        ].join('\r\n')
        fs.writeFileSync(batPath, batContent)
        shell.openPath(batPath)
      }
      win.minimize()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.on('shell:openExternal', (_e, url: string) => {
    // Só http/https. Bloqueia file://, protocolos perigosos do Windows etc. — o url pode vir de
    // dados remotos (links de notícias/modpack), então um esquema malicioso viraria execução.
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url)
  })

  // ── Local filesystem helpers (config editor) ──────────────────────────────
  ipcMain.handle('fs:pickDir', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Selecionar pasta BepInEx/config',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    // A pasta escolhida no diálogo passa a ser uma raiz liberada para fs:read/write/listDir
    // nesta sessão. Só caminhos dentro de raízes escolhidas explicitamente pelo usuário (ou da
    // raiz de perfis) podem ser lidos/gravados — o renderer não consegue mais tocar arquivos arbitrários.
    allowedFsRoots.add(path.resolve(result.filePaths[0]))
    return result.filePaths[0]
  })

  ipcMain.handle('fs:openInExplorer', async (_e, { dirPath }: { dirPath: string }) => {
    try {
      if (!dirPath) return { success: false, error: 'Caminho não definido' }
      // Confina a raízes liberadas (perfis + pastas escolhidas em diálogo). Sem isso, o renderer
      // poderia criar/abrir pastas arbitrárias no disco via este handler.
      if (!isPathAllowed(dirPath)) return { success: false, error: 'Acesso negado a esta pasta' }
      if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true })
      const err = await shell.openPath(dirPath)
      if (err) return { success: false, error: err }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('fs:listDir', async (_e, { dir }: { dir: string }) => {
    try {
      if (!isPathAllowed(dir)) return { success: false, error: 'Acesso negado a esta pasta' }
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        return { success: false, error: 'Pasta não encontrada' }
      }
      // Percorre subpastas: vários mods guardam configs em pastas próprias dentro de
      // BepInEx/config/ (ex.: config/DistantOrigins/Translations/Mod.yml). Sem recursão esses
      // arquivos nunca apareciam no editor. Retornamos caminhos RELATIVOS em estilo posix (/),
      // que o frontend concatena com o dir (readFile/writeFile) e usa como installPath.
      // Texto (editável inline) + binários que alguns mods guardam em config/ (ex.:
      // spritesheet .png de emoji, músicas .ogg/.mp3, gifs, fontes). Os binários
      // aparecem na lista para o admin enviá-los ao R2; o frontend detecta pelo
      // installPath (isBinaryConfigPath). A parte binária espelha BINARY_CONFIG_EXT_RE
      // em src/utils/modManager.ts — manter em sincronia.
      const CONFIG_RE =
        /\.(cfg|json|yaml|yml|ini|toml|txt|png|jpe?g|gif|webp|bmp|ico|tga|dds|mp3|ogg|wav|flac|aac|m4a|mp4|webm|mov|mkv|ttf|otf|woff2?|zip|dll|bin|dat|pdf|unity3d|assetbundle|bundle)$/i
      const files: string[] = []
      const walk = (current: string, rel: string) => {
        for (const name of fs.readdirSync(current)) {
          const abs = path.join(current, name)
          const relPath = rel ? `${rel}/${name}` : name
          let stat: fs.Stats
          try { stat = fs.statSync(abs) } catch { continue }
          if (stat.isDirectory()) walk(abs, relPath)
          else if (CONFIG_RE.test(name)) files.push(relPath)
        }
      }
      walk(dir, '')
      files.sort()
      return { success: true, files }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('fs:readFile', async (_e, { filePath }: { filePath: string }) => {
    try {
      if (!isPathAllowed(filePath)) return { success: false, error: 'Acesso negado a este arquivo' }
      const content = fs.readFileSync(filePath, 'utf-8')
      return { success: true, content }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('fs:readFileBase64', async (_e, { filePath }: { filePath: string }) => {
    // Lê um arquivo como base64 (bytes crus), sem decodificar como UTF-8. Usado para
    // configs binários (ex.: .png de emoji) que serão enviados ao R2 — ler como texto
    // corromperia os bytes. Mesmo confinamento de caminho do fs:readFile.
    try {
      if (!isPathAllowed(filePath)) return { success: false, error: 'Acesso negado a este arquivo' }
      const content = fs.readFileSync(filePath).toString('base64')
      return { success: true, content }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('fs:writeFile', async (_e, { filePath, content }: { filePath: string; content: string }) => {
    try {
      if (!isPathAllowed(filePath)) return { success: false, error: 'Acesso negado a este arquivo' }
      fs.writeFileSync(filePath, content, 'utf-8')
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('mods:importR2Code', async (_e, { code }: { code: string }) => {
    // A "código R2ModManager" pasted by the user is NOT the profile data itself — it's a
    // short lookup key. r2modman uploads the exported profile to Thunderstore and the code
    // just references it; the actual data has to be fetched from Thunderstore's API.
    // Response body is plain text: "#r2modman" + base64(r2z zip bytes).
    // Source: https://github.com/ebkr/r2modmanPlus (src/r2mm/mods/ProfileImportExport.ts,
    // src/r2mm/profiles/ProfilesClient.ts, src/utils/ProfileUtils.ts)
    try {
      const axios = require('axios')
      const trimmedCode = code.trim()
      let profileData: string
      try {
        const response = await axios.get(
          `https://thunderstore.io/api/experimental/legacyprofile/get/${encodeURIComponent(trimmedCode)}/`,
          { timeout: 15000, responseType: 'text', transformResponse: (data: any) => data },
        )
        profileData = response.data
      } catch (err: any) {
        if (err.response?.status === 404) {
          return { success: false, error: 'Código não encontrado ou expirado. Códigos do R2ModManager valem só algumas horas — peça um novo.' }
        }
        return { success: false, error: `Falha ao buscar o código no Thunderstore: ${err.message}` }
      }

      const PREFIX = '#r2modman'
      if (typeof profileData !== 'string' || !profileData.startsWith(PREFIX)) {
        return { success: false, error: 'Código inválido — a resposta do Thunderstore não tem o formato esperado.' }
      }
      const zipBuffer = Buffer.from(profileData.slice(PREFIX.length).trim(), 'base64')

      return parseR2ProfileZip(zipBuffer)
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('mods:pickAndImportR2File', async () => {
    // Importa um perfil exportado do R2ModManager como ARQUIVO (.r2z). O r2z é um ZIP
    // binário (export.r2x + config/), diferente do .glitnir que é JSON texto — por isso
    // tem seu próprio picker e lê os bytes crus, sem passar por JSON.parse.
    try {
      const result = await dialog.showOpenDialog(win, {
        title: 'Importar perfil do R2ModManager (.r2z)',
        filters: [
          { name: 'Perfil R2ModManager', extensions: ['r2z', 'zip'] },
          { name: 'Todos os arquivos', extensions: ['*'] },
        ],
        properties: ['openFile'],
      })
      if (result.canceled || !result.filePaths[0]) return null
      const zipBuffer = fs.readFileSync(result.filePaths[0])
      return parseR2ProfileZip(zipBuffer)
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('fs:pickJsonFile', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Importar modpack',
      filters: [{ name: 'Glitnir Modpack', extensions: ['glitnir', 'json'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return fs.readFileSync(result.filePaths[0], 'utf-8')
  })

  ipcMain.handle('fs:saveFileDialog', async (_e, { filename, content }: { filename: string; content: string }) => {
    const result = await dialog.showSaveDialog(win, {
      title: 'Exportar modpack',
      defaultPath: filename,
      filters: [
        { name: 'Glitnir Modpack', extensions: ['glitnir'] },
        { name: 'JSON', extensions: ['json'] },
      ],
    })
    if (result.canceled || !result.filePath) return { success: false }
    fs.writeFileSync(result.filePath, content, 'utf-8')
    return { success: true }
  })

  ipcMain.handle('thunderstore:fetchAll', async () => {
    const axios = require('axios')
    const response = await axios.get('https://thunderstore.io/c/valheim/api/v1/package/', {
      timeout: 60000,
      headers: { 'Accept-Encoding': 'gzip, deflate' },
    })
    const raw: any[] = response.data
    if (!Array.isArray(raw)) {
      throw new Error('Resposta inesperada do Thunderstore')
    }
    // Normalize in the main process before IPC transfer:
    // raw response is ~156MB uncompressed; trimming to essential fields reduces it to ~5MB
    // Note: Thunderstore API no longer includes total_downloads at package level — sum from versions
    return raw
      .filter((pkg: any) => Array.isArray(pkg.versions) && pkg.versions.length > 0)
      .map((pkg: any) => {
        const v = pkg.versions[0]
        const total_downloads = pkg.versions.reduce((sum: number, ver: any) => sum + (ver.downloads || 0), 0)
        return {
          name: pkg.name,
          full_name: pkg.full_name,
          owner: pkg.owner,
          package_url: pkg.package_url,
          date_created: pkg.date_created,
          date_updated: pkg.date_updated,
          rating_score: pkg.rating_score,
          is_pinned: pkg.is_pinned,
          is_deprecated: pkg.is_deprecated,
          total_downloads,
          categories: pkg.categories,
          latest: {
            name: v.name,
            full_name: v.full_name,
            description: v.description,
            icon: v.icon,
            version_number: v.version_number,
            download_url: v.download_url,
            downloads: v.downloads,
            date_created: v.date_created,
            website_url: v.website_url,
            is_active: v.is_active,
            file_size: v.file_size,
            dependencies: v.dependencies || [],
          },
          // Only version_number per version (~8 bytes each) — URL reconstructed via getDownloadUrl
          versions: (pkg.versions as any[]).map((ver: any) => ({ version_number: ver.version_number })),
        }
      })
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})