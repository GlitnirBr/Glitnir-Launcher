import { useState } from 'react'
import { Config } from '../types'
import './AdminView.css'

interface ModpackConfig {
  id: string
  name: string
  gistUrl: string | null
  builtin?: boolean
}

interface Props {
  config: Config
  modpacks: ModpackConfig[]
  onSave: (updates: Partial<Config>) => Promise<void>
  onUpdateModpacks: (modpacks: ModpackConfig[]) => Promise<void>
}

export default function AdminView({ config, modpacks, onSave, onUpdateModpacks }: Props) {
  const [glitnirGistUrl, setGlitnirGistUrl] = useState(config.glitnirGistUrl)
  const [newsGistUrl, setNewsGistUrl] = useState((config as any).newsGistUrl || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      await onSave({
        glitnirGistUrl,
        ...({ newsGistUrl } as any)
      })

      const updatedModpacks = modpacks.map(mp => {
        if (mp.id === 'glitnir') {
          return { ...mp, gistUrl: glitnirGistUrl }
        }
        return mp
      })
      await onUpdateModpacks(updatedModpacks)

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const hasChanges =
    glitnirGistUrl !== config.glitnirGistUrl ||
    newsGistUrl !== ((config as any).newsGistUrl || '')

  return (
    <div className="admin-view">
      <div className="admin-header">
        <h1>Painel Admin</h1>
        <p className="text-secondary">Configure o servidor e modpacks.</p>
      </div>

      <div className="admin-section card">
        <div className="card-header">
          <h3>URLs dos Gists</h3>
        </div>
        <div className="card-body">
          <div className="form-group">
            <label>URL do Modpack Glitnir</label>
            <input
              type="text"
              value={glitnirGistUrl}
              onChange={e => setGlitnirGistUrl(e.target.value)}
              placeholder="https://gist.githubusercontent.com/.../modpack.json"
            />
            <span className="form-hint">URL raw do arquivo modpack.json no Gist.</span>
          </div>

          <div className="form-group">
            <label>URL das Noticias</label>
            <input
              type="text"
              value={newsGistUrl}
              onChange={e => setNewsGistUrl(e.target.value)}
              placeholder="https://gist.githubusercontent.com/.../news.json"
            />
            <span className="form-hint">URL raw do arquivo news.json no Gist (opcional).</span>
          </div>
        </div>
      </div>

      <div className="admin-section card">
        <div className="card-header">
          <h3>Informacoes do Sistema</h3>
        </div>
        <div className="card-body">
          <div className="info-row">
            <span className="info-label">Caminho do Valheim</span>
            <span className="info-value">{config.valheimPath || 'Nao configurado'}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Modpacks configurados</span>
            <span className="info-value">{modpacks.length}</span>
          </div>
        </div>
      </div>

      <div className="admin-actions">
        <button
          className="btn-play"
          style={{ width: 'auto', padding: '12px 32px' }}
          onClick={handleSave}
          disabled={!hasChanges || saving}
        >
          {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar Configuracoes'}
        </button>
      </div>
    </div>
  )
}
