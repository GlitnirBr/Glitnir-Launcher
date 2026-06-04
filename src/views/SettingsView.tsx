import { useState } from 'react'
import { Config } from '../types'
import './SettingsView.css'

interface Props {
  config: Config
  onSave: (updates: Partial<Config>) => Promise<void>
}

export default function SettingsView({ config, onSave }: Props) {
  const [valheimPath, setValheimPath] = useState(config.valheimPath)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSelectPath() {
    const path = await window.glitnir.dialog.selectValheimPath()
    if (path) {
      setValheimPath(path)
    }
  }

  async function handleAutoDetect() {
    const path = await window.glitnir.valheim.autoDetect()
    if (path) {
      setValheimPath(path)
    }
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      await onSave({ valheimPath })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const hasChanges = valheimPath !== config.valheimPath

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
            <button className="btn-secondary" onClick={handleSelectPath}>
              Procurar...
            </button>
            <button className="btn-ghost" onClick={handleAutoDetect}>
              Auto-detectar
            </button>
          </div>
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
