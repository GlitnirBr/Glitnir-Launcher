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
          <h1>Modo Vanilla</h1>
          <p className="text-secondary">Jogue Valheim sem modificacoes.</p>
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
          <h1>Mods do Modpack</h1>
          {modpack && (
            <p className="text-secondary">
              Versao {modpack.version} — {installedCount}/{totalCount} instalados
            </p>
          )}
        </div>
        {needsUpdate && !installing && (
          <button className="btn-secondary" onClick={handleInstall}>
            Atualizar Mods
          </button>
        )}
      </div>

      {installing && (
        <div className="install-progress card">
          <div className="card-body">
            <div className="progress-info">
              <span>{installStatus}</span>
              <span>{installProgress}%</span>
            </div>
            <div className="progress-container">
              <div className="progress-bar" style={{ width: `${installProgress}%` }} />
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="error-banner">
          <span>{error}</span>
        </div>
      )}

      {modpack && modpack.changelog && modpack.changelog.length > 0 && (
        <div className="changelog-card card">
          <div className="card-header">
            <h3>Changelog — v{modpack.changelog[0].version}</h3>
            <span className="text-muted">
              {new Date(modpack.changelog[0].date).toLocaleDateString('pt-BR')}
            </span>
          </div>
          <div className="card-body">
            <ul className="changelog-list">
              {modpack.changelog[0].changes.map((change, i) => (
                <li key={i}>{change}</li>
              ))}
            </ul>
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
              Nenhum mod carregado. Configure a URL do modpack no painel admin.
            </p>
          )}
          <div className="mod-items">
            {mods.map(mod => (
              <div key={mod.name} className="mod-item">
                <div className="mod-info">
                  <span className="mod-name">{mod.name}</span>
                  <span className="mod-version">v{mod.version}</span>
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
