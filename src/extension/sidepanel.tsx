import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { loadAppConfig } from '../config/remote'
import '../index.css'
import ExtensionApp from './ExtensionApp'
import { startMarket } from '../ui/marketChoice'

// The shop's market and Remote Config are settled before anything reads
// currency, bank rules or model names.
startMarket()
await loadAppConfig()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ExtensionApp />
  </StrictMode>,
)
