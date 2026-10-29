import { lazy, Suspense, useEffect } from 'react'

import { loadCardRules } from './app/card-rules'
import { DeckModeScreen } from './components/deck-mode/DeckModeScreen'
import { Mascot } from './components/mascot/Mascot'
import { AppToaster } from './components/ui/AppToaster'

/** El catálogo de componentes vive en su propio archivo: la app no lo baja si no se pide `/playground`. */
const Playground = lazy(() => import('./components/playground/Playground'))

function isPlaygroundPath(): boolean {
  return typeof window !== 'undefined' && /^\/playground(\/|$)/.test(window.location.pathname)
}

export default function App() {
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
