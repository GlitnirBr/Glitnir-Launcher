import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
import './App.css'

/**
 * Arquivo/pasta solto FORA de uma área de drop da aplicação não faz nada. Sem isto o Chromium
 * trata o drop como navegação para o arquivo (a trava de will-navigate no main já barraria a
 * navegação, mas o gesto viraria um nada silencioso e confuso). A única área que aceita drop
 * é a pasta de configs do editor, e ela chama preventDefault antes destes handlers.
 */
window.addEventListener('dragover', e => e.preventDefault())
window.addEventListener('drop', e => e.preventDefault())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
