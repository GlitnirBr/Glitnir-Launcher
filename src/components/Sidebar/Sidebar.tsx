import { useState } from 'react'
import './Sidebar.css'

interface Props {
  currentView: string
  onViewChange: (view: string) => void
  selectedModpack: string
  modpacks: { id: string; name: string }[]
  onModpackChange: (id: string) => void
  onPlay: () => void
  isPlaying: boolean
  modpackVersion?: string
  isAdmin: boolean
}

export default function Sidebar({
  currentView,
  onViewChange,
  selectedModpack,
  modpacks,
  onModpackChange,
  onPlay,
  isPlaying,
  modpackVersion,
  isAdmin
}: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const selectedModpackData = modpacks.find(m => m.id === selectedModpack)

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">
          <span className="logo-letter">G</span>
        </div>
        <div className="logo-text">
          <span className="logo-title">Glitnir</span>
          <span className="logo-subtitle">Valheim Server</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <button
          className={`nav-item ${currentView === 'home' ? 'active' : ''}`}
          onClick={() => onViewChange('home')}
        >
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9,22 9,12 15,12 15,22" />
          </svg>
          <span>Inicio</span>
        </button>

        <button
          className={`nav-item ${currentView === 'mods' ? 'active' : ''}`}
          onClick={() => onViewChange('mods')}
        >
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27,6.96 12,12.01 20.73,6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
          <span>Mods</span>
        </button>

        <button
          className={`nav-item ${currentView === 'settings' ? 'active' : ''}`}
          onClick={() => onViewChange('settings')}
        >
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>Configuracoes</span>
        </button>

        {isAdmin && (
          <button
            className={`nav-item ${currentView === 'admin' ? 'active' : ''}`}
            onClick={() => onViewChange('admin')}
          >
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>Admin</span>
          </button>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="modpack-selector">
          <label className="selector-label">Modpack</label>
          <div className="dropdown">
            <button
              className="dropdown-trigger"
              onClick={() => setDropdownOpen(!dropdownOpen)}
            >
              <span>{selectedModpackData?.name || 'Selecionar...'}</span>
              <svg className="dropdown-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6,9 12,15 18,9" />
              </svg>
            </button>
            {dropdownOpen && (
              <div className="dropdown-menu">
                {modpacks.map(mp => (
                  <button
                    key={mp.id}
                    className={`dropdown-item ${mp.id === selectedModpack ? 'active' : ''}`}
                    onClick={() => {
                      onModpackChange(mp.id)
                      setDropdownOpen(false)
                    }}
                  >
                    {mp.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          className="btn-play"
          onClick={onPlay}
          disabled={isPlaying}
        >
          {isPlaying ? 'Iniciando...' : 'Jogar'}
        </button>

        {modpackVersion && selectedModpack !== 'vanilla' && (
          <span className="version-label">v{modpackVersion}</span>
        )}
      </div>
    </aside>
  )
}
