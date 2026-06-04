import { useState } from 'react'
import './AdminLoginModal.css'

interface Props {
  onSuccess: () => void
  onClose: () => void
}

const ADMIN_PASSWORD = 'glitnir2024'

export default function AdminLoginModal({ onSuccess, onClose }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password === ADMIN_PASSWORD) {
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