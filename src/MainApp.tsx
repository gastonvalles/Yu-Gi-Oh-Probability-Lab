import { use, useEffect, type ReactNode } from 'react'
import { Provider } from 'react-redux'

import { loadCardRules } from './app/card-rules'
import { replaceDeckBuilder } from './app/deck-builder-slice'
import { loadFormatData } from './app/format-data'
import { refreshStoredGenesysPoints } from './app/genesys-format'
import { store } from './app/store'
import { DeckModeScreen } from './components/deck-mode/DeckModeScreen'
import { Mascot } from './components/mascot/Mascot'
import { AppToaster } from './components/ui/AppToaster'

/**
 * La app entera, con su store: un archivo aparte que `App.tsx` carga con `lazy`, para que la landing no lo baje. Importarlo (la landing lo precarga) no arranca
 * nada: las tablas de formato se piden recién al dibujarla.
 */

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

let tablesBeforePaint: Promise<void> | null | undefined

/** Con Edison o Genesys guardado, el deck se valida al pintar: la primera pantalla espera las tablas. Con otro formato bajan después, en un momento ocioso. */
function startTables(): Promise<void> | null {
  if (tablesBeforePaint !== undefined) return tablesBeforePaint

  const { deckFormat } = store.getState().settings

  if (deckFormat === 'edison' || deckFormat === 'genesys') {
    tablesBeforePaint = loadTablesAndRefreshPoints()
  } else {
    tablesBeforePaint = null

    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => void loadTablesAndRefreshPoints(), { timeout: 4000 })
    } else {
      window.setTimeout(() => void loadTablesAndRefreshPoints(), 1500)
    }
  }

  return tablesBeforePaint
}

/** Con `children`, sólo el store (el catálogo `/playground`); sin nada, la app. */
export default function MainApp({ children }: { children?: ReactNode }) {
  return <Provider store={store}>{children ?? <AppBody />}</Provider>
}

function AppBody() {
  const tables = startTables()

  if (tables) use(tables)

  // Las reglas de las cartas se bajan de fondo: el clasificador las usa en cuanto están.
  useEffect(() => {
    void loadCardRules()
  }, [])

  return (
    <main className="min-h-dvh w-full bg-transparent p-0">
      <DeckModeScreen />
      <Mascot />
      <AppToaster />
    </main>
  )
}
