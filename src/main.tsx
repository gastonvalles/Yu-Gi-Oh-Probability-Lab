import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { UI_ANIMATION_MS } from './app/motion'
import { getLocale, loadLocale, syncSiteMeta } from './i18n'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import './index.css'

const appRoot = document.querySelector<HTMLDivElement>('#app')

if (!appRoot) {
  throw new Error('No se encontró el contenedor principal.') // i18n-ignore: error de programación, no llega a la pantalla
}

document.documentElement.style.setProperty('--motion-duration', `${UI_ANIMATION_MS}ms`)

const root = createRoot(appRoot)

// Los textos del idioma de la página: el español viene con el archivo principal (listo al instante); el inglés es otro archivo chico que se baja antes de pintar. Si no se pudo bajar, la página sale en español.
// Sin un `await` de nivel superior: en un módulo que llega al build fragmentaría el archivo principal.
// El store y las tablas de formato no van acá: son de la app (`MainApp.tsx`, que se carga aparte), y la landing de una visita nueva no los necesita.
void loadLocale(getLocale())
  .catch(() => {})
  .then(() => {
    syncSiteMeta()
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    )
  })
