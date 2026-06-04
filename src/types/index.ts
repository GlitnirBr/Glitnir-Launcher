export interface User {
  username: string
  role: 'player' | 'admin'
}

export interface Mod {
  name: string
  version: string
  thunderstoreId: string
  description?: string
  installed?: boolean
  outdated?: boolean
}

export interface ChangelogEntry {
  version: string
  date: string
  changes: string[]
}

export interface Modpack {
  version: string
  updatedAt: string
  changelog: ChangelogEntry[]
  mods: Mod[]
}

export interface Config {
  valheimPath: string
  installedMods: { name: string; version: string }[]
  adminHash: string
  glitnirGistUrl: string
  vanillaGistUrl: string
  selectedModpack?: string
  newsGistUrl?: string
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
        install: (args: { zipPath: string; modName: string }) => Promise<{ success: boolean; error?: string }>
        download: (args: { url: string; modName: string }) => Promise<{ success: boolean; tempPath?: string; error?: string }>
        list: () => Promise<string[]>
        remove: (modName: string) => Promise<{ success: boolean; error?: string }>
      }
      game: {
        launch: (args: { valheimPath: string; mode: 'vanilla' | 'glitnir' }) => Promise<{ success: boolean; error?: string }>
      }
      shell: {
        openExternal: (url: string) => void
      }
    }
  }
}