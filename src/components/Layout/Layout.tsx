import { ReactNode } from 'react'
import Sidebar from '../Sidebar/Sidebar'
import TitleBar from '../TitleBar/TitleBar'
import './Layout.css'

interface Props {
  children: ReactNode
  currentView: string
  onViewChange: (view: string) => void
  selectedModpack: string
  modpacks: { id: string; name: string }[]
  onModpackChange: (id: string) => void
  onPlay: () => void
  isPlaying: boolean
  modpackVersion?: string
  isAdmin: boolean
  onAdminClick: () => void
  username: string
  serverOnline?: boolean
  serverPlayers?: number
  serverMaxPlayers?: number
  hasBattlemetrics?: boolean
}

export default function Layout({
  children,
  currentView,
  onViewChange,
  selectedModpack,
  modpacks,
  onModpackChange,
  onPlay,
  isPlaying,
  modpackVersion,
  isAdmin,
  onAdminClick,
  username,
  serverOnline,
  serverPlayers,
  serverMaxPlayers,
  hasBattlemetrics,
}: Props) {
  return (
    <div className="layout">
      <TitleBar
        isAdmin={isAdmin}
        onAdminClick={onAdminClick}
        username={username}
      />
      <div className="layout-body">
        <Sidebar
          currentView={currentView}
          onViewChange={onViewChange}
          selectedModpack={selectedModpack}
          modpacks={modpacks}
          onModpackChange={onModpackChange}
          onPlay={onPlay}
          isPlaying={isPlaying}
          modpackVersion={modpackVersion}
          isAdmin={isAdmin}
          serverOnline={serverOnline}
          serverPlayers={serverPlayers}
          serverMaxPlayers={serverMaxPlayers}
          hasBattlemetrics={hasBattlemetrics}
        />
        <main className="layout-main">
          {children}
        </main>
      </div>
    </div>
  )
}
