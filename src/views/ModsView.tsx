import { useState } from 'react'
import { Modpack, Mod } from '../types'
import './ModsView.css'

interface Props {
  modpack: Modpack | null
  mods: (Mod & { installed?: boolean; outdated?: boolean; optionalDisabled?: boolean })[]
  selectedModpackId: string
  onInstallMods: () => Promise<void>
  installing: boolean
  onToggleOptionalMod: (modName: string, enabled: boolean) => void
}

export default function ModsView({
  modpack,
  mods,
  selectedModpackId,
  onInstallMods,
  installing,
  onToggleOptionalMod,
}: Props) {
  const [error, setError] = useState('')

  const isVanilla = selectedModpackId === 'vanilla'
  // Precisa agir quando: um mod ativo está faltando/desatualizado, OU um opcional foi desativado
  // mas ainda está instalado no disco (precisa ser removido — senão continua carregando no jogo).
  const needsUpdate = mods.some(m =>
    (!m.optionalDisabled && (m.outdated || !m.installed)) ||
    (m.optionalDisabled && m.installed)
  )
  const installedCount = mods.filter(m => m.optionalDisabled || (m.installed && !m.outdated)).length
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
          <span className="mod-count">{mods.length} mods</span>
        </div>
        <div className="card-body">
          {mods.length === 0 && (
            <p className="text-muted">
              Nenhum mod no modpack. Adicione mods no painel admin e publique.
            </p>
          )}
          <div className="mod-items">
            {mods.map((mod, i) => {
              const tsUrl = mod.source === 'thunderstore' && mod.namespace
                ? `https://thunderstore.io/c/valheim/p/${mod.namespace}/${mod.name}/`
                : null
              return (
                <div
                  key={`${mod.name}-${i}`}
                  className={`mod-item ${mod.installed && !mod.outdated ? 'installed' : ''} ${mod.optionalDisabled ? 'optional-disabled' : ''} ${tsUrl ? 'mod-item-clickable' : ''}`}
                  title={tsUrl ? 'Clique para ver no Thunderstore' : undefined}
                  onClick={() => tsUrl && (window as any).glitnir?.shell?.openExternal(tsUrl)}
                >
                  <div className="mod-info">
                    <span className="mod-name">
                      {mod.name}
                      {mod.source === 'private' && <span className="badge badge-warning" style={{ marginLeft: 8 }}>privado</span>}
                      {mod.optional && <span className="badge badge-announcement" style={{ marginLeft: 8 }}>opcional</span>}
                    </span>
                    <span className="mod-version">{mod.version ? `v${mod.version}` : mod.filename}</span>
                  </div>
                  <div className="mod-status">
                    {tsUrl && (
                      <span className="mod-ts-link" title="Ver no Thunderstore">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15,3 21,3 21,9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </span>
                    )}
                    {mod.optional && (
                      <label
                        className="mod-optional-switch"
                        title={mod.optionalDisabled ? 'Ativar mod opcional' : 'Desativar mod opcional'}
                        onClick={e => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={!mod.optionalDisabled}
                          onChange={e => onToggleOptionalMod(mod.name, e.target.checked)}
                        />
                        {mod.optionalDisabled ? 'Desativado' : 'Ativado'}
                      </label>
                    )}
                    {!mod.optionalDisabled && mod.outdated && <span className="badge badge-warning">Desatualizado</span>}
                    {!mod.optionalDisabled && !mod.installed && !mod.outdated && <span className="badge badge-announcement">Nao instalado</span>}
                    {!mod.optionalDisabled && mod.installed && !mod.outdated && <span className="badge badge-update">Instalado</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
