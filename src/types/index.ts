import { NewsItem } from '../components/News/NewsCard'

export interface User {
  username: string
  role: 'player' | 'admin'
}

/** Payload publicado/lido de {backendUrl}/news — home page + aviso fixado + notícias + status. */
export interface NewsData {
  featured?: {
    title: string
    subtitle?: string
    image?: string
    link?: string
    cta?: string
  }
  pinnedAlert?: { text: string; link?: string }
  news: NewsItem[]
  serverInfo?: { ip?: string; uptime?: string; version?: string }
}

export type ModSource = 'thunderstore' | 'private'

export interface Mod {
  name: string
  source: ModSource
  /** Thunderstore namespace/owner (source: 'thunderstore') */
  namespace?: string
  version?: string
  /** Nome do arquivo do mod privado (source: 'private') */
  filename?: string
  /**
   * URL de download. Para thunderstore é a URL absoluta do pacote.
   * Para privados é um caminho relativo resolvido pelo backend (ex: /mods/private/Foo.zip).
   */
  downloadUrl: string
  /** Hash SHA-256 (hex) do arquivo baixado. Quando presente, o download é verificado. Opcional. */
  sha256?: string
  description?: string
  /** Se true, o jogador pode escolher não instalar esse mod (ver ModsView). */
  optional?: boolean
  // runtime
  installed?: boolean
  outdated?: boolean
  /** true quando é opcional e o jogador desativou. Calculado em checkOutdated. */
  optionalDisabled?: boolean
}

export interface ModConfig {
  /** Nome do mod ao qual a config pertence (informativo) */
  mod: string
  filename: string
  /** Caminho relativo ao perfil onde o arquivo será escrito (ex: BepInEx/config/foo.cfg) */
  installPath: string
  /** Conteúdo literal do config OU uma URL http(s) de onde buscar o conteúdo */
  content: string
}

export interface Modpack {
  version: string
  name: string
  description: string
  mods: Mod[]
  configs?: ModConfig[]
  updatedAt?: string
  battlemetricsId?: string
}

/** Identifica um modpack na barra lateral. */
export interface ModpackEntry {
  id: string
  name: string
  type: 'vanilla' | 'public' | 'admin'
  builtin?: boolean
}

export interface Config {
  valheimPath: string
  installedMods: { name: string; version: string }[]
  /** Mods instalados por perfil/modpack (id -> lista). */
  installedByProfile?: Record<string, { name: string; version: string }[]>
  /**
   * Mods opcionais que o jogador ATIVOU, por perfil/modpack (id -> nomes dos mods).
   * Opcional é opt-in: fica desativado (não instala) até o player ligar o toggle.
   */
  optionalModsEnabled?: Record<string, string[]>
  /**
   * Hash do conjunto de configs do modpack já aplicado por perfil (id -> hash).
   * Permite reaplicar os configs quando o admin muda SÓ os configs (sem bump de
   * versão de mod), sem reescrever os arquivos — e apagar ajustes locais — a cada launch.
   */
  configsHashByProfile?: Record<string, string>
  selectedModpack?: string
  /** URL base do backend (Cloudflare Worker). */
  backendUrl?: string
  /** Repositório do modpack público no formato owner/repo. */
  modpackRepo?: string
  /** Branch do repositório do modpack (default: main). */
  modpackBranch?: string
  /** URL raw do news.json (opcional). */
  newsUrl?: string
  /** Status do servidor exibido na tela inicial. */
  serverOnline?: boolean
  /** Pasta onde os perfis/mods são instalados. Default: %APPDATA%\GlitnirLauncher\profiles */
  modsPath?: string
  /** Caminho da pasta BepInEx/config do perfil (r2modman ou outro). Usado pelo editor de configs do admin. */
  adminProfilePath?: string
}

export interface PrivateModDownload {
  url: string
  headers?: Record<string, string>
}

declare global {
  interface Window {
    glitnir: {
      window: {
        minimize: () => void
        maximize: () => void
        close: () => void
      }
      config: {
        load: () => Promise<Config>
        save: (config: Partial<Config>) => Promise<boolean>
      }
      dialog: {
        selectValheimPath: () => Promise<string | null>
      }
      valheim: {
        autoDetect: () => Promise<string>
      }
      mods: {
        defaultPath: () => Promise<string>
        install: (args: { zipPath: string; modName: string; profile: string }) => Promise<{ success: boolean; error?: string }>
        bepinexOk: (args: { profile: string }) => Promise<boolean>
        download: (args: { url: string; modName: string; headers?: Record<string, string>; sha256?: string }) => Promise<{ success: boolean; tempPath?: string; error?: string }>
        list: (profile: string) => Promise<string[]>
        remove: (args: { modName: string; profile: string }) => Promise<{ success: boolean; error?: string }>
        setOptionalEnabled: (args: { profile: string; modName: string; enabled: boolean; version?: string }) => Promise<{ success: boolean; moved?: boolean; version?: string; error?: string }>
        applyConfig: (args: { profile: string; installPath: string; content: string }) => Promise<{ success: boolean; error?: string }>
        applyConfigs: (args: { profile: string; configs: { installPath: string; content: string; filename?: string }[] }) => Promise<{ success: boolean; total?: number; applied?: number; skipped?: number; failed?: number; error?: string }>
        onApplyConfigProgress: (callback: (data: { done: number; total: number; filename: string }) => void) => void
        offApplyConfigProgress: () => void
        readConfigsFromZip: (args: { url: string }) => Promise<{ success: boolean; configs?: { filename: string; installPath: string; content: string }[]; error?: string }>
        pickAndRead: () => Promise<{ filename: string; content: string; size: number } | null>
        pickModFile: () => Promise<{ token: string; filename: string; size: number } | null>
        uploadPrivateModStream: (args: { token: string; backendUrl: string; authToken: string }) => Promise<{ success: boolean; filename?: string; downloadUrl?: string; error?: string }>
        onUploadProgress: (callback: (data: { filename: string; sent: number; total: number }) => void) => void
        offUploadProgress: () => void
        importR2Code: (args: { code: string }) => Promise<{ success: boolean; mods?: { namespace: string; name: string; version: string }[]; configs?: { filename: string; installPath: string; content?: string; contentBase64?: string }[]; error?: string }>
        pickAndImportR2File: () => Promise<{ success: boolean; mods?: { namespace: string; name: string; version: string }[]; configs?: { filename: string; installPath: string; content?: string; contentBase64?: string }[]; error?: string } | null>
        openLog: (args: { valheimPath: string; profile?: string }) => Promise<{ success: boolean; error?: string }>
      }
      game: {
        launch: (args: { valheimPath: string; mode: 'vanilla' | 'modded'; profile: string }) => Promise<{ success: boolean; error?: string }>
      }
      shell: {
        openExternal: (url: string) => void
      }
      fs: {
        pickDir: () => Promise<string | null>
        openInExplorer: (args: { dirPath: string }) => Promise<{ success: boolean; error?: string }>
        pickImage: () => Promise<{ filename: string; content: string; size: number } | null>
        listDir: (args: { dir: string }) => Promise<{ success: boolean; files?: string[]; error?: string }>
        readFile: (args: { filePath: string }) => Promise<{ success: boolean; content?: string; error?: string }>
        readFileBase64: (args: { filePath: string }) => Promise<{ success: boolean; content?: string; error?: string }>
        writeFile: (args: { filePath: string; content: string }) => Promise<{ success: boolean; error?: string }>
        pickJsonFile: () => Promise<string | null>
        saveFileDialog: (args: { filename: string; content: string }) => Promise<{ success: boolean }>
      }
      thunderstore: {
        fetchAll: () => Promise<any[]>
      }
      updater: {
        check: () => Promise<void>
        install: () => Promise<void>
        onStatus: (callback: (data: { status: string }) => void) => void
        onProgress: (callback: (data: { percent: number; transferred: number; total: number }) => void) => void
      }
    }
  }
}
