import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './styles/tokens.css'
import './styles/base.css'
import './styles/profiles.css'
import App from './App.jsx'
import { initializeCustomNikkes } from './lib/customNikkeStore.js'

// Resolve persistent local identities before any route reads a character ID.
await initializeCustomNikkes().catch(error => console.warn('[自定义角色库]', error.message))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
