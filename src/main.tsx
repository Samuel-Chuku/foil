import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { loadAppConfig } from './config/remote'
import './index.css'
import DemoApp from './demo/DemoApp.tsx'

// Remote Config is settled before anything reads bank rules or model names.
await loadAppConfig()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DemoApp />
  </StrictMode>,
)
