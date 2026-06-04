import { useState } from 'react'
import './AdminLoginModal.css'

interface Props {
  onSuccess: () => void
  onClose: () => void
  adminPassword?: string
}

const DEFAULT_PASSWORD = 'glitnir2024'

export default function AdminLoginModal({ onSuccess, onClose, adminPassword }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const correctPassword = adminPassword || DEFAULT_PASSWORD

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password === correctPassword) {
      onSuccess()
    } else {
      setError('Senha incorreta')
      setPassword('')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3>Acesso Administrativo</h3>
        <p>Digite a senha para acessar o painel admin.</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Senha admin"
            autoFocus
          />
          {error && <p className="modal-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-confirm" disabled={!password}>Entrar</button>
          </div>
        </form>
      </div>
    </div>
  )
}