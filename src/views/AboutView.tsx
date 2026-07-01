import { Modpack } from '../types'
import { DISCORD_URL, WEBSITE_URL } from '../constants/links'
import './AboutView.css'

interface Props {
  modpack: Modpack | null
}

const RULES = [
  'Respeite os outros jogadores — sem assédio, discurso de ódio ou toxicidade.',
  'Proibido griefing, roubo ou destruição de construções de outros jogadores sem consentimento.',
  'Proibido uso de cheats, exploits ou qualquer vantagem indevida.',
  'Divulgação de servidores concorrentes não é permitida no Discord.',
]

export default function AboutView({ modpack }: Props) {
  return (
    <div className="about-view">
      <div className="about-header">
        <h1>Sobre o servidor</h1>
        <p className="text-secondary">Tudo o que você precisa saber sobre o Glitnir Fantasy.</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Descrição</h3>
        </div>
        <div className="card-body">
          <p className="text-secondary">
            {modpack?.description || 'Servidor de Valheim com raças, classes e aventuras épicas. Junte-se a nós!'}
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Regras</h3>
        </div>
        <div className="card-body">
          <ul className="about-rules">
            {RULES.map((rule, i) => (
              <li key={i}>{rule}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Informações</h3>
        </div>
        <div className="card-body">
          <div className="about-info-row">
            <span className="about-info-label">Modpack</span>
            <span className="about-info-value">{modpack?.name || 'Vanilla'}</span>
          </div>
          {modpack?.version && (
            <div className="about-info-row">
              <span className="about-info-label">Versão</span>
              <span className="about-info-value">{modpack.version}</span>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Links úteis</h3>
        </div>
        <div className="card-body about-links">
          <button className="btn-secondary" onClick={() => window.glitnir.shell.openExternal(DISCORD_URL)}>
            Discord
          </button>
          <button className="btn-secondary" onClick={() => window.glitnir.shell.openExternal(WEBSITE_URL)}>
            Site
          </button>
        </div>
      </div>
    </div>
  )
}
