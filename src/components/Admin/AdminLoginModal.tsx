import { useState } from 'react'
import { login } from '../../utils/backendApi'
import './AdminLoginModal.css'

interface Props {
  backendUrl?: string
  onSuccess: (token: string) => void
  onClose: () => void
}

export default function AdminLoginModal({ backendUrl, onSuccess, onClose }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const token = await login(password, backendUrl)
      onSuccess(token)
    } catch (err: any) {
      setError(err.message || 'Falha na autenticação')
      setPassword('')
    } finally {
      setLoading(false)
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
            <button type="submit" className="btn-confirm" disabled={!password || loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
