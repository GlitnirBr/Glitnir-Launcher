import { useState } from 'react'
import { Config } from '../types'
import './AdminView.css'

interface Props {
  config: Config
  adminToken: string | null
  onSave: (updates: Partial<Config>) => Promise<void>
}

export default function AdminView({ config, onSave }: Props) {
  const [backendUrl, setBackendUrl] = useState(config.backendUrl || '')
  const [modpackRepo, setModpackRepo] = useState(config.modpackRepo || '')
  const [modpackBranch, setModpackBranch] = useState(config.modpackBranch || 'main')
  const [newsUrl, setNewsUrl] = useState(config.newsUrl || '')

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const hasChanges =
    backendUrl !== (config.backendUrl || '') ||
    modpackRepo !== (config.modpackRepo || '') ||
    modpackBranch !== (config.modpackBranch || 'main') ||
    newsUrl !== (config.newsUrl || '')

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      await onSave({ backendUrl, modpackRepo, modpackBranch, newsUrl })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-view">
      <div className="admin-header">
        <h1>Painel Admin</h1>
        <p className="text-secondary">Configurações de backend, repositório e notícias.</p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="admin-section card">
        <div className="card-header"><h3>Backend e Repositório</h3></div>
        <div className="card-body">
          <div className="form-group">
            <label>URL do Backend (Cloudflare)</label>
            <input type="text" value={backendUrl} onChange={e => setBackendUrl(e.target.value)}
              placeholder="https://glitnir-launcher-backend.workers.dev" />
            <span className="form-hint">Usado para login, publicar modpacks e mods privados.</span>
          </div>
          <div className="form-group">
            <label>Repositório do Modpack (owner/repo)</label>
            <input type="text" value={modpackRepo} onChange={e => setModpackRepo(e.target.value)}
              placeholder="GlitnirBr/glitnir-modpack" />
            <span className="form-hint">Onde fica o modpack.json público (lido via raw GitHub).</span>
          </div>
          <div className="form-group">
            <label>Branch</label>
            <input type="text" value={modpackBranch} onChange={e => setModpackBranch(e.target.value)}
              placeholder="main" style={{ width: '150px' }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>URL das Notícias (opcional)</label>
            <input type="text" value={newsUrl} onChange={e => setNewsUrl(e.target.value)}
              placeholder="https://raw.githubusercontent.com/.../news.json" />
          </div>
        </div>
      </div>

      <div className="admin-actions">
        <button className="btn-play" style={{ width: 'auto', padding: '12px 32px' }}
          onClick={handleSave} disabled={!hasChanges || saving}>
          {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}
