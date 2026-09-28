import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'

import faviconUrl from './assets/pngaaa.com-426342.png'
import App from './App'
import { store } from './app/store'
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
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
)
