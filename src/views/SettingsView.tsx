import { useState, useEffect } from 'react'
import { Config } from '../types'
import './SettingsView.css'

interface Props {
  config: Config
  onSave: (updates: Partial<Config>) => Promise<void>
}

export default function SettingsView({ config, onSave }: Props) {
  const [valheimPath, setValheimPath] = useState(config.valheimPath)
  const [modsPath, setModsPath] = useState(config.modsPath || '')
  const [defaultModsPath, setDefaultModsPath] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.glitnir.mods.defaultPath().then(p => setDefaultModsPath(p))
  }, [])

  async function handleSelectValheimPath() {
    const p = await window.glitnir.dialog.selectValheimPath()
    if (p) setValheimPath(p)
  }

  async function handleAutoDetect() {
    const p = await window.glitnir.valheim.autoDetect()
    if (p) setValheimPath(p)
  }

  async function handleSelectModsPath() {
    const p = await window.glitnir.fs.pickDir()
    if (p) setModsPath(p)
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      await onSave({ valheimPath, modsPath: modsPath || undefined })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const hasChanges =
    valheimPath !== config.valheimPath ||
    modsPath !== (config.modsPath || '')

  return (
    <div className="settings-view">
      <div className="settings-header">
        <h1>Configuracoes</h1>
        <p className="text-secondary">Ajuste as opcoes do launcher.</p>
      </div>

      <div className="settings-section card">
        <div className="card-header">
          <h3>Caminho do Valheim</h3>
        </div>
        <div className="card-body">
          <p className="setting-description">
            Selecione a pasta onde o Valheim esta instalado.
          </p>
          <div className="path-input-group">
            <input
              type="text"
              value={valheimPath}
              onChange={e => setValheimPath(e.target.value)}
              placeholder="C:\Program Files\Steam\steamapps\common\Valheim"
              className="path-input"
            />
            <button className="btn-secondary" onClick={handleSelectValheimPath}>
              Procurar...
            </button>
            <button className="btn-ghost" onClick={handleAutoDetect}>
              Auto-detectar
            </button>
          </div>
        </div>
      </div>

      <div className="settings-section card">
        <div className="card-header">
          <h3>Pasta de instalacao de mods</h3>
        </div>
        <div className="card-body">
          <p className="setting-description">
            Pasta onde os perfis e mods serao instalados (ex: <code>F:\Games\Glitnir</code>).
            Ao trocar o caminho, os mods serao reinstalados na nova localizacao.
          </p>
          <div className="path-input-group">
            <input
              type="text"
              value={modsPath}
              onChange={e => setModsPath(e.target.value)}
              placeholder={defaultModsPath || '%APPDATA%\\GlitnirLauncher\\profiles'}
              className="path-input"
            />
            <button className="btn-secondary" onClick={handleSelectModsPath}>
              Procurar...
            </button>
            {modsPath && (
              <button className="btn-ghost" onClick={() => setModsPath('')}>
                Usar padrao
              </button>
            )}
          </div>
          {defaultModsPath && (
            <p className="setting-hint">
              Padrao: {defaultModsPath}
            </p>
          )}
        </div>
      </div>

      <div className="settings-actions">
        <button
          className="btn-play"
          style={{ width: 'auto', padding: '12px 32px' }}
          onClick={handleSave}
          disabled={!hasChanges || saving}
        >
          {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}
