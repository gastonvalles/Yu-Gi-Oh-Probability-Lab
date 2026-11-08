import { lazy, Suspense, useEffect } from 'react'

import { loadCardRules } from './app/card-rules'
import { DeckModeScreen } from './components/deck-mode/DeckModeScreen'
import { Mascot } from './components/mascot/Mascot'
import { AppToaster } from './components/ui/AppToaster'

/** El catálogo de componentes vive en su propio archivo: la app no lo baja si no se pide `/playground`. */
const Playground = lazy(() => import('./components/playground/Playground'))

/** El tablero del departamento de TI, sólo en `npm run dev`: en el build `import.meta.env.DEV` es `false`, el import se cae y `/ti` es una ruta más. */
const TiDashboard = import.meta.env.DEV ? lazy(() => import('./components/ti/TiDashboard')) : null

function isPlaygroundPath(): boolean {
  return typeof window !== 'undefined' && /^\/playground(\/|$)/.test(window.location.pathname)
}

export default function App() {
  if (TiDashboard && typeof window !== 'undefined' && /^\/ti(\/|$)/.test(window.location.pathname)) {
    return (
      <Suspense fallback={null}>
        <TiDashboard />
      </Suspense>
    )
  }

  if (isPlaygroundPath()) {
    return (
      <Suspense fallback={null}>
        <Playground />
      </Suspense>
    )
  }

  return <MainApp />
}

function MainApp() {
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
