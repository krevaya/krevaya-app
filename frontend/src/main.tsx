import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { resolveLocal } from './persistence/local'
import { setSourceResolver } from './render/assets'
import './style.css'

setSourceResolver(resolveLocal)

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
