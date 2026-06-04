import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFile } from 'child_process'

const DATA_PATH = path.join(app.getPath('appData'), 'GlitnirLauncher')
const CONFIG_FILE = path.join(DATA_PATH, 'config.json')
const PROFILE_PATH = path.join(DATA_PATH, 'profiles', 'Glitnir')

function ensureDirs() {
  [DATA_PATH, PROFILE_PATH, path.join(PROFILE_PATH, 'BepInEx', 'plugins')].forEach(p => {
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
      adminHash: '',
      glitnirGistUrl: '',
      vanillaGistUrl: '',
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2))
    return defaultConfig
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
  if (!config.valheimPath) {
    config.valheimPath = autoDetectValheim()
    saveConfig(config)
  }
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
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0a1628',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const devUrl = 'http://localhost:5173'
  win.loadURL(devUrl).catch(() => {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  })

  return win
}

app.whenReady().then(() => {
  const win = createWindow()

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

  ipcMain.handle('dialog:selectValheimPath', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Selecione a pasta do Valheim',
      properties: ['openDirectory'],
    })
    if (!result.canceled && result.filePaths[0]) {
      return result.filePaths[0]
    }
    return null
  })

  ipcMain.handle('mods:install', async (_e, { zipPath, modName }) => {
    try {
      const AdmZip = require('adm-zip')
      const zip = new AdmZip(zipPath)
      const pluginsPath = path.join(PROFILE_PATH, 'BepInEx', 'plugins', modName)
      zip.extractAllTo(pluginsPath, true)
      fs.unlinkSync(zipPath)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('mods:download', async (_e, { url, modName }) => {
    try {
      const axios = require('axios')
      const response = await axios.get(url, { responseType: 'arraybuffer' })
      const tempPath = path.join(os.tmpdir(), `${modName}-${Date.now()}.zip`)
      fs.writeFileSync(tempPath, Buffer.from(response.data))
      return { success: true, tempPath }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('mods:list', () => {
    const pluginsPath = path.join(PROFILE_PATH, 'BepInEx', 'plugins')
    if (!fs.existsSync(pluginsPath)) return []
    return fs.readdirSync(pluginsPath).filter(f =>
      fs.statSync(path.join(pluginsPath, f)).isDirectory()
    )
  })

  ipcMain.handle('mods:remove', (_e, modName: string) => {
    const modPath = path.join(PROFILE_PATH, 'BepInEx', 'plugins', modName)
    if (fs.existsSync(modPath)) {
      fs.rmSync(modPath, { recursive: true })
      return { success: true }
    }
    return { success: false, error: 'Mod não encontrado' }
  })

  ipcMain.handle('game:launch', async (_e, { valheimPath, mode }) => {
    try {
      const exe = path.join(valheimPath, 'valheim.exe')
      if (!fs.existsSync(exe)) {
        return { success: false, error: 'valheim.exe não encontrado no caminho configurado.' }
      }
      if (mode === 'vanilla') {
        execFile(exe, { detached: true } as any)
      } else {
        const doorstopDll = path.join(PROFILE_PATH, 'BepInEx', 'core', 'BepInEx.dll')
        const args = ['--doorstop-enable', 'true', '--doorstop-target', doorstopDll]
        execFile(exe, args as any, { detached: true } as any)
      }
      win.minimize()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.on('shell:openExternal', (_e, url: string) => {
    shell.openExternal(url)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})