import { useState } from 'react'
import logoImg from '../../assets/logo.png'
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
  isAdmin,
}: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const selectedModpackData = modpacks.find(m => m.id === selectedModpack)

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-icon">
          <img src={logoImg} alt="Glitnir" className="logo-img" />
        </div>
        <div className="logo-text">
          <span className="logo-title">GLITNIR</span>
          <span className="logo-subtitle">Valheim Server</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <NavItem
          active={currentView === 'home'}
          onClick={() => onViewChange('home')}
          icon={<HomeIcon />}
          label="Início"
        />
        <NavItem
          active={currentView === 'mods'}
          onClick={() => onViewChange('mods')}
          icon={<ModsIcon />}
          label="Mods"
        />
        <NavItem
          active={currentView === 'settings'}
          onClick={() => onViewChange('settings')}
          icon={<SettingsIcon />}
          label="Configurações"
        />
        {isAdmin && (
          <NavItem
            active={currentView === 'admin'}
            onClick={() => onViewChange('admin')}
            icon={<AdminIcon />}
            label="Admin"
            accent
          />
        )}
      </nav>

      <div className="sidebar-divider" />

      {/* Modpack + Play */}
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
                    onClick={() => { onModpackChange(mp.id); setDropdownOpen(false) }}
                  >
                    {mp.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <button className="btn-play" onClick={onPlay} disabled={isPlaying}>
          {isPlaying ? (
            'Iniciando...'
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <polygon points="5,3 19,12 5,21" />
              </svg>
              Jogar
            </>
          )}
        </button>

        {modpackVersion && selectedModpack !== 'vanilla' && (
          <span className="version-label">v{modpackVersion}</span>
        )}
      </div>

      {/* Bottom links */}
      <div className="sidebar-links">
        <a className="sidebar-link" onClick={() => window.glitnir.shell.openExternal('https://discord.gg/glitnir')} title="Discord">
          <DiscordIcon />
        </a>
        <a className="sidebar-link" onClick={() => window.glitnir.shell.openExternal('https://glitnir.gg')} title="Site">
          <WebIcon />
        </a>
      </div>
    </aside>
  )
}

function NavItem({ active, onClick, icon, label, accent }: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  accent?: boolean
}) {
  return (
    <button className={`nav-item ${active ? 'active' : ''} ${accent ? 'accent' : ''}`} onClick={onClick}>
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
      {active && <span className="nav-indicator" />}
    </button>
  )
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9,22 9,12 15,12 15,22" />
    </svg>
  )
}

function ModsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27,6.96 12,12.01 20.73,6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function AdminIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.032.055a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.11 13.11 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
  )
}

function WebIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}
