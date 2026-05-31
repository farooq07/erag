import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Apply theme before first paint to avoid flash.
;(() => {
  const saved = localStorage.getItem('erag.theme') || 'system'
  const dark = saved === 'system'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : saved === 'dark'
  const html = document.documentElement
  html.classList.toggle('dark', dark)
  html.classList.toggle('light', !dark)
})()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
