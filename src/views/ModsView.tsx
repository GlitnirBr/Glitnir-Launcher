import { useState } from 'react'
import { Modpack, Mod } from '../types'
import './ModsView.css'

interface Props {
  modpack: Modpack | null
  mods: (Mod & { installed?: boolean; outdated?: boolean })[]
  selectedModpackId: string
  onInstallMods: () => Promise<void>
  installing: boolean
  installProgress: number
  installStatus: string
}

export default function ModsView({
  modpack,
  mods,
  selectedModpackId,
  onInstallMods,
  installing,
  installProgress,
  installStatus
}: Props) {
  const [error, setError] = useState('')

  const isVanilla = selectedModpackId === 'vanilla'
  const needsUpdate = mods.some(m => m.outdated || !m.installed)
  const installedCount = mods.filter(m => m.installed && !m.outdated).length
  const totalCount = mods.length

  async function handleInstall() {
    setError('')
    try {
      await onInstallMods()
    } catch (err: any) {
      setError(err.message || 'Erro ao instalar mods')
    }
  }

  if (isVanilla) {
    return (
      <div className="mods-view">
        <div className="mods-header">
          <div>
            <h1>Modo Vanilla</h1>
            <p className="text-secondary">Jogue Valheim sem modificacoes.</p>
          </div>
        </div>
        <div className="vanilla-info card">
          <div className="card-body">
            <p>O modo vanilla executa o Valheim original, sem nenhum mod instalado.</p>
            <p className="text-muted">Ideal para jogar em servidores oficiais ou testar o jogo base.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mods-view">
      <div className="mods-header">
        <div>
          <h1>{modpack?.name || 'Mods do Modpack'}</h1>
          {modpack && (
            <p className="text-secondary">
              Versao {modpack.version} — <span className="status-count">{installedCount}/{totalCount} instalados</span>
            </p>
          )}
        </div>
        {needsUpdate && !installing && (
          <button className="btn-secondary btn-update" onClick={handleInstall}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7,10 12,15 17,10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Baixar e Instalar Mods
          </button>
        )}
        {!needsUpdate && !installing && totalCount > 0 && (
          <div className="status-badge status-ok">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20,6 9,17 4,12" />
            </svg>
            Todos instalados
          </div>
        )}
      </div>

      {installing && (
        <div className="install-progress card">
          <div className="card-body">
            <div className="progress-header">
              <div className="progress-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7,10 12,15 17,10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>
              <div className="progress-info">
                <span className="progress-title">{installStatus}</span>
                <span className="progress-percent">{installProgress}%</span>
              </div>
            </div>
            <div className="progress-container">
              <div className="progress-bar" style={{ width: `${installProgress}%` }} />
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="error-banner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {modpack && modpack.description && (
        <div className="changelog-card card">
          <div className="card-header">
            <h3>Sobre o modpack</h3>
          </div>
          <div className="card-body">
            <p className="text-secondary">{modpack.description}</p>
          </div>
        </div>
      )}

      <div className="mods-list card">
        <div className="card-header">
          <h3>Lista de Mods</h3>
          <span className="text-muted">{mods.length} mods</span>
        </div>
        <div className="card-body">
          {mods.length === 0 && (
            <p className="text-muted">
              Nenhum mod no modpack. Adicione mods no painel admin e publique.
            </p>
          )}
          <div className="mod-items">
            {mods.map((mod, i) => (
              <div key={`${mod.name}-${i}`} className={`mod-item ${mod.installed && !mod.outdated ? 'installed' : ''}`}>
                <div className="mod-info">
                  <span className="mod-name">
                    {mod.name}
                    {mod.source === 'private' && <span className="badge badge-warning" style={{ marginLeft: 8 }}>privado</span>}
                  </span>
                  <span className="mod-version">{mod.version ? `v${mod.version}` : mod.filename}</span>
                </div>
                <div className="mod-status">
                  {mod.outdated && <span className="badge badge-warning">Desatualizado</span>}
                  {!mod.installed && !mod.outdated && <span className="badge badge-announcement">Nao instalado</span>}
                  {mod.installed && !mod.outdated && <span className="badge badge-update">Instalado</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
