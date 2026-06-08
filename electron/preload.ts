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
    install: (args: { zipPath: string; modName: string; profile: string }) =>
      ipcRenderer.invoke('mods:install', args),
    download: (args: { url: string; modName: string; headers?: Record<string, string> }) =>
      ipcRenderer.invoke('mods:download', args),
    list: (profile: string) => ipcRenderer.invoke('mods:list', profile),
    remove: (args: { modName: string; profile: string }) =>
      ipcRenderer.invoke('mods:remove', args),
    applyConfig: (args: { profile: string; installPath: string; content: string }) =>
      ipcRenderer.invoke('mods:applyConfig', args),
  },

  game: {
    launch: (args: { valheimPath: string; mode: 'vanilla' | 'modded'; profile: string }) =>
      ipcRenderer.invoke('game:launch', args),
  },

  shell: {
    openExternal: (url: string) => ipcRenderer.send('shell:openExternal', url),
  },

  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatus: (callback: (data: { status: string }) => void) => {
      ipcRenderer.on('updater:status', (_e, data) => callback(data))
    },
  },
})