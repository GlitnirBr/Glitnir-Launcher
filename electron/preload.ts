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
    install: (args: { zipPath: string; modName: string }) =>
      ipcRenderer.invoke('mods:install', args),
    download: (args: { url: string; modName: string }) =>
      ipcRenderer.invoke('mods:download', args),
    list: () => ipcRenderer.invoke('mods:list'),
    remove: (modName: string) => ipcRenderer.invoke('mods:remove', modName),
  },

  game: {
    launch: (args: { valheimPath: string; mode: 'vanilla' | 'glitnir' }) =>
      ipcRenderer.invoke('game:launch', args),
  },

  shell: {
    openExternal: (url: string) => ipcRenderer.send('shell:openExternal', url),
  },
})