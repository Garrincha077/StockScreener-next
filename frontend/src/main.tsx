import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './deepvue/legacyConfirmationUi'
import App from './App'
import './styles.css'
import './terminal.css'
import './datafirst.css'
import './deepvue.css'
import './grid-watchlist.css'
import './mobile-tradingview.css'
import './fundamental-evidence.css'
import './mobile-layer-fix.css'
import './mobile-grid-scroll.css'

// Pages redeploy trigger: 2026-08-20 LEGACY shadow confirmation UI
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
