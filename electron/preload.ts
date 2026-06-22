import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('glitnir', {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close:    () => ipcRenderer.send('window:close'),
  },

  config: {
    load: () => ipcRenderer.invoke('config:load'),
    save: (config: object) => ipcRenderer.invoke('config:save', config),
  },

  dialog: {
    selectValheimPath: () => ipcRenderer.invoke('dialog:selectValheimPath'),
  },

  valheim: {
    autoDetect: () => ipcRenderer.invoke('valheim:autoDetect'),
  },

  mods: {
    defaultPath: () => ipcRenderer.invoke('mods:defaultPath'),
    install: (args: { zipPath: string; modName: string; profile: string }) =>
      ipcRenderer.invoke('mods:install', args),
    bepinexOk: (args: { profile: string }) =>
      ipcRenderer.invoke('mods:bepinexOk', args),
    download: (args: { url: string; modName: string; headers?: Record<string, string> }) =>
      ipcRenderer.invoke('mods:download', args),
    list: (profile: string) => ipcRenderer.invoke('mods:list', profile),
    remove: (args: { modName: string; profile: string }) =>
      ipcRenderer.invoke('mods:remove', args),
    applyConfig: (args: { profile: string; installPath: string; content: string }) =>
      ipcRenderer.invoke('mods:applyConfig', args),
    readConfigsFromZip: (args: { url: string }) =>
      ipcRenderer.invoke('mods:readConfigsFromZip', args),
    pickAndRead: () =>
      ipcRenderer.invoke('mods:pickAndRead'),
  },

  game: {
    launch: (args: { valheimPath: string; mode: 'vanilla' | 'modded'; profile: string }) =>
      ipcRenderer.invoke('game:launch', args),
  },

  shell: {
    openExternal: (url: string) => ipcRenderer.send('shell:openExternal', url),
  },

  fs: {
    pickDir: () => ipcRenderer.invoke('fs:pickDir'),
    listDir: (args: { dir: string }) => ipcRenderer.invoke('fs:listDir', args),
    readFile: (args: { filePath: string }) => ipcRenderer.invoke('fs:readFile', args),
    writeFile: (args: { filePath: string; content: string }) => ipcRenderer.invoke('fs:writeFile', args),
  },

  thunderstore: {
    fetchAll: () => ipcRenderer.invoke('thunderstore:fetchAll'),
  },

  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatus: (callback: (data: { status: string }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, data: { status: string }) => callback(data)
      ipcRenderer.removeAllListeners('updater:status')
      ipcRenderer.on('updater:status', handler)
    },
    onProgress: (callback: (data: { percent: number; transferred: number; total: number }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, data: { percent: number; transferred: number; total: number }) => callback(data)
      ipcRenderer.removeAllListeners('updater:progress')
      ipcRenderer.on('updater:progress', handler)
    },
  },
})