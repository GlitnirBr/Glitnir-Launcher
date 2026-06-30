export interface User {
  username: string
  role: 'player' | 'admin'
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
  description?: string
  // runtime
  installed?: boolean
  outdated?: boolean
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
        download: (args: { url: string; modName: string; headers?: Record<string, string> }) => Promise<{ success: boolean; tempPath?: string; error?: string }>
        list: (profile: string) => Promise<string[]>
        remove: (args: { modName: string; profile: string }) => Promise<{ success: boolean; error?: string }>
        applyConfig: (args: { profile: string; installPath: string; content: string }) => Promise<{ success: boolean; error?: string }>
        readConfigsFromZip: (args: { url: string }) => Promise<{ success: boolean; configs?: { filename: string; installPath: string; content: string }[]; error?: string }>
        pickAndRead: () => Promise<{ filename: string; content: string; size: number } | null>
      }
      game: {
        launch: (args: { valheimPath: string; mode: 'vanilla' | 'modded'; profile: string }) => Promise<{ success: boolean; error?: string }>
      }
      shell: {
        openExternal: (url: string) => void
      }
      fs: {
        pickDir: () => Promise<string | null>
        pickImage: () => Promise<{ filename: string; content: string; size: number } | null>
        listDir: (args: { dir: string }) => Promise<{ success: boolean; files?: string[]; error?: string }>
        readFile: (args: { filePath: string }) => Promise<{ success: boolean; content?: string; error?: string }>
        writeFile: (args: { filePath: string; content: string }) => Promise<{ success: boolean; error?: string }>
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
