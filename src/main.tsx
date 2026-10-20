import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'

import App from './App'
import { replaceDeckBuilder } from './app/deck-builder-slice'
import { loadFormatData } from './app/format-data'
import { refreshStoredGenesysPoints } from './app/genesys-format'
import { UI_ANIMATION_MS } from './app/motion'
import { getLocale, loadLocale, syncSiteMeta } from './i18n'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { store } from './app/store'
import './index.css'

const appRoot = document.querySelector<HTMLDivElement>('#app')

if (!appRoot) {
  throw new Error('No se encontró el contenedor principal.') // i18n-ignore: error de programación, no llega a la pantalla
}

document.documentElement.style.setProperty('--motion-duration', `${UI_ANIMATION_MS}ms`)

const root = createRoot(appRoot)

// Los textos del idioma de la página: el español viene con el archivo principal (listo al instante); el inglés es otro archivo chico que se baja antes de pintar. Si no se pudo bajar, la página sale en español.
// Sin un `await` de nivel superior: en un módulo que llega al build fragmentaría el archivo principal.
const localeReady = loadLocale(getLocale()).catch(() => {})

const start = () =>
  void localeReady.then(() => {
    syncSiteMeta()
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <Provider store={store}>
            <App />
          </Provider>
        </ErrorBoundary>
      </StrictMode>,
    )
  })

// Leer el deck guardado no espera las tablas de Genesys y Edison: los puntos que quedaron sin resolver (la mayoría de los decks tiene alguna carta así) se completan apenas llegan.
// Nunca rechaza: sin tablas el deck queda como estaba, y el próximo `loadFormatData` vuelve a intentar.
const loadTablesAndRefreshPoints = () =>
  loadFormatData().then(
    () => {
      const deckBuilder = store.getState().deckBuilder
      const refreshed = refreshStoredGenesysPoints(deckBuilder)

      if (refreshed !== deckBuilder) {
        store.dispatch(replaceDeckBuilder(refreshed))
      }
    },
    () => {},
  )

const { deckFormat } = store.getState().settings

if (deckFormat === 'edison' || deckFormat === 'genesys') {
  // Con uno de esos formatos guardado, el deck se valida al pintar: la primera pantalla espera las tablas.
  void loadTablesAndRefreshPoints().then(start)
} else {
  start()

  // Con cualquier otro formato las tablas no se necesitan hasta que alguien las pida: bajan después del primer pintado, en un momento ocioso.
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => void loadTablesAndRefreshPoints(), { timeout: 4000 })
  } else {
    window.setTimeout(() => void loadTablesAndRefreshPoints(), 1500)
  }
}
