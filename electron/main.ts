import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawn } from 'child_process'

const DATA_PATH = path.join(app.getPath('appData'), 'GlitnirLauncher')
const CONFIG_FILE = path.join(DATA_PATH, 'config.json')
const PROFILES_ROOT = path.join(DATA_PATH, 'profiles')

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
  const safe = (profile || 'default').replace(/[^a-zA-Z0-9_-]/g, '_')
  return path.join(getProfilesRoot(), safe)
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
    backgroundColor: '#0d1520',
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
      return result.filePaths[0]
    }
    return null
  })

  ipcMain.handle('mods:install', async (_e, { zipPath, modName, profile }) => {
    try {
      ensureDirs(profile)
      const ext = path.extname(zipPath).toLowerCase()
      const modFolder = path.join(profileDir(profile), 'BepInEx', 'plugins', modName)

      if (ext === '.dll') {
        // DLL: copy directly into the mod's own plugin folder so BepInEx can find it
        fs.mkdirSync(modFolder, { recursive: true })
        fs.copyFileSync(zipPath, path.join(modFolder, path.basename(zipPath)))
      } else {
        // ZIP (default): extract entire archive into the mod folder
        const AdmZip = require('adm-zip')
        const zip = new AdmZip(zipPath)
        zip.extractAllTo(modFolder, true)

        // Detect BepInExPack: ZIP contains winhttp.dll → promote ALL framework files to profile root.
        // R2ModManager copies winhttp.dll, doorstop_config.ini, doorstop_libs/, BepInEx/core/, etc.
        // to the profile root, then does NOT keep BepInExPack in plugins/.
        const winhttpInMod = findFileInDir(modFolder, 'winhttp.dll')
        if (winhttpInMod) {
          const bepinexRoot = path.dirname(winhttpInMod)
          const profileRoot = profileDir(profile)
          // Copy everything at the BepInExPack root level to the profile root
          // (winhttp.dll, doorstop_config.ini, doorstop_libs/, BepInEx/core/, etc.)
          copyDirRecursive(bepinexRoot, profileRoot)
          // Remove BepInExPack from plugins/ — it lives at profile root, not in plugins
          fs.rmSync(modFolder, { recursive: true, force: true })
        }
      }

      fs.unlinkSync(zipPath)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('mods:download', async (_e, { url, modName, headers }) => {
    try {
      const axios = require('axios')
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: headers || undefined,
        maxRedirects: 5,
      })
      // Preserve the real file extension so mods:install can detect the file type
      const urlExt = path.extname(url.split('?')[0]).toLowerCase() || '.zip'
      const tempPath = path.join(os.tmpdir(), `${modName}-${Date.now()}${urlExt}`)
      fs.writeFileSync(tempPath, Buffer.from(response.data))
      return { success: true, tempPath }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('mods:applyConfig', async (_e, { profile, installPath, content }) => {
    try {
      ensureDirs(profile)
      const base = profileDir(profile)
      // Impede path traversal para fora do perfil.
      const target = path.resolve(base, installPath)
      if (!target.startsWith(path.resolve(base))) {
        return { success: false, error: 'Caminho de config inválido' }
      }

      let finalContent = content
      if (/^https?:\/\//i.test((content || '').trim())) {
        const axios = require('axios')
        const res = await axios.get(content.trim(), { responseType: 'text' })
        finalContent = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
      }

      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, finalContent)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
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
        const filename = path.basename(name)
        // Normalize to BepInEx/config/<filename> regardless of where in the zip it lives
        const installPath = `BepInEx/config/${filename}`
        try {
          const content = entry.getData().toString('utf-8')
          found.push({ filename, installPath, content })
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

  ipcMain.handle('mods:list', (_e, profile: string) => {
    const pluginsPath = path.join(profileDir(profile), 'BepInEx', 'plugins')
    if (!fs.existsSync(pluginsPath)) return []
    return fs.readdirSync(pluginsPath).filter(f =>
      fs.statSync(path.join(pluginsPath, f)).isDirectory()
    )
  })

  ipcMain.handle('mods:remove', (_e, { modName, profile }) => {
    const modPath = path.join(profileDir(profile), 'BepInEx', 'plugins', modName)
    if (fs.existsSync(modPath)) {
      fs.rmSync(modPath, { recursive: true })
      return { success: true }
    }
    return { success: false, error: 'Mod não encontrado' }
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

        // Validate BepInExPack is installed in the profile
        const bepinexCoreSrc = path.join(profileRoot, 'BepInEx', 'core')
        const bepinexDllSrc = path.join(bepinexCoreSrc, 'BepInEx.dll')
        if (!fs.existsSync(bepinexDllSrc)) {
          return { success: false, error: `BepInEx.dll não encontrado em ${bepinexDllSrc} — Certifique-se de que o BepInExPack está no modpack e reinstale os mods.` }
        }

        // Copy profile → game dir (same as manual BepInEx install).
        function tryCopy(src: string, dest: string) {
          if (!fs.existsSync(src)) return
          try { fs.copyFileSync(src, dest) } catch (e: any) {
            if (e.code !== 'EBUSY') throw e
          }
        }
        function tryCopyDir(src: string, dest: string) {
          if (!fs.existsSync(src)) return
          try { copyDirRecursive(src, dest) } catch (e: any) {
            if (e.code !== 'EBUSY') throw e
          }
        }

        // Prefer doorstop_libs/x64/winhttp.dll (guaranteed 64-bit proxy for Valheim).
        // Fall back to profile root winhttp.dll if x64 version not present.
        const winhttpX64 = path.join(profileRoot, 'doorstop_libs', 'x64', 'winhttp.dll')
        const winhttpRoot = path.join(profileRoot, 'winhttp.dll')
        const winhttpSrc = fs.existsSync(winhttpX64) ? winhttpX64 : winhttpRoot
        tryCopy(winhttpSrc, path.join(valheimPath, 'winhttp.dll'))
        tryCopyDir(path.join(profileRoot, 'doorstop_libs'), path.join(valheimPath, 'doorstop_libs'))
        tryCopyDir(path.join(profileRoot, 'BepInEx'), path.join(valheimPath, 'BepInEx'))

        if (!fs.existsSync(path.join(valheimPath, 'winhttp.dll'))) {
          return { success: false, error: 'winhttp.dll não encontrado. Certifique-se de que o BepInExPack está no modpack e reinstale os mods.' }
        }

        const bepinexDllDest = path.join(valheimPath, 'BepInEx', 'core', 'BepInEx.dll')
        if (!fs.existsSync(bepinexDllDest)) {
          return { success: false, error: `BepInEx.dll não chegou à pasta do Valheim: ${bepinexDllDest}` }
        }

        // Write doorstop_config.ini compatible with BOTH doorstop v3 and v4.
        // The game dir may have either proxy version; writing both sections ensures it works regardless.
        // v3: reads [UnityDoorstop] → targetAssembly → BepInEx.dll
        // v4: reads [General]       → target_assembly → BepInEx.Preloader.dll
        const preloaderDll = 'BepInEx\\core\\BepInEx.Preloader.dll'
        const coreDll = 'BepInEx\\core\\BepInEx.dll'
        const iniPath = path.join(valheimPath, 'doorstop_config.ini')
        if (fs.existsSync(iniPath)) fs.unlinkSync(iniPath)
        const doorstopIni = [
          '[General]',
          'enabled = true',
          `target_assembly = ${preloaderDll}`,
          'redirect_output_log = false',
          'boot_config_override =',
          'ignore_disable_switch = false',
          '',
          '[UnityDoorstop]',
          'enabled=true',
          `targetAssembly=${coreDll}`,
          'redirect_output_log=false',
          'ignore_disable_switch=false',
          '',
        ].join('\r\n')
        fs.writeFileSync(iniPath, doorstopIni, { encoding: 'utf8' })

        // Verify BepInEx.Preloader.dll (needed by doorstop v4) is in the game dir
        const preloaderDest = path.join(valheimPath, 'BepInEx', 'core', 'BepInEx.Preloader.dll')
        const hasPreloader = fs.existsSync(preloaderDest)

        const winhttpSize = fs.statSync(path.join(valheimPath, 'winhttp.dll')).size
        console.log('[launch] winhttp.dll size:', winhttpSize, 'bytes')
        console.log('[launch] BepInEx.dll exists:', fs.existsSync(bepinexDllDest))
        console.log('[launch] BepInEx.Preloader.dll exists:', hasPreloader)
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
    shell.openExternal(url)
  })

  // ── Local filesystem helpers (config editor) ──────────────────────────────
  ipcMain.handle('fs:pickDir', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Selecionar pasta BepInEx/config',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('fs:listDir', async (_e, { dir }: { dir: string }) => {
    try {
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        return { success: false, error: 'Pasta não encontrada' }
      }
      const files = fs.readdirSync(dir)
        .filter(f => !fs.statSync(path.join(dir, f)).isDirectory())
        .filter(f => /\.(cfg|json|yaml|yml|ini|toml|txt)$/i.test(f))
        .sort()
      return { success: true, files }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('fs:readFile', async (_e, { filePath }: { filePath: string }) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      return { success: true, content }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('fs:writeFile', async (_e, { filePath, content }: { filePath: string; content: string }) => {
    try {
      fs.writeFileSync(filePath, content, 'utf-8')
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
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