import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'

import App from './App'
import { UI_ANIMATION_MS } from './app/motion'
import { store } from './app/store'
import './index.css'

const appRoot = document.querySelector<HTMLDivElement>('#app')

if (!appRoot) {
  throw new Error('No se encontró el contenedor principal.')
}

document.documentElement.style.setProperty('--motion-duration', `${UI_ANIMATION_MS}ms`)

createRoot(appRoot).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
)
