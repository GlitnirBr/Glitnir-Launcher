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
  username
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
        />
        <main className="layout-main">
          {children}
        </main>
      </div>
    </div>
  )
}
