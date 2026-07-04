import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './overhaul.css'
import App from './App.jsx'
import { AuthProvider } from './auth-context.jsx'
import { AuthGate } from './auth-ui.jsx'
import { warmUpBackend } from './api-core.js'

// Ping /health sớm để đánh thức backend Render free-tier trước khi user bấm AI.
warmUpBackend()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </AuthProvider>
  </StrictMode>,
)
