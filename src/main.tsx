import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import faviconUrl from './assets/pngaaa.com-426342.png'
import App from './App'
import './index.css'

const appRoot = document.querySelector<HTMLDivElement>('#app')
const faviconLink = document.querySelector<HTMLLinkElement>('link[rel="icon"]') ?? document.createElement('link')

if (!appRoot) {
  throw new Error('No se encontró el contenedor principal.')
}

faviconLink.rel = 'icon'
faviconLink.type = 'image/png'
faviconLink.href = faviconUrl

if (!faviconLink.isConnected) {
  document.head.appendChild(faviconLink)
}

createRoot(appRoot).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
