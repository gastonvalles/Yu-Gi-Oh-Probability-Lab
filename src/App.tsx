import { lazy, Suspense, useState } from 'react'

import { HOME_HASH, markEntered, readLandingInput, shouldShowLanding } from './app/landing'

/** El catálogo de componentes vive en su propio archivo: la app no lo baja si no se pide `/playground`. */
const Playground = lazy(() => import('./components/playground/Playground'))

/** El tablero del departamento de TI, sólo en `npm run dev`: en el build `import.meta.env.DEV` es `false`, el import se cae y `/ti` es una ruta más. */
const TiDashboard = import.meta.env.DEV ? lazy(() => import('./components/ti/TiDashboard')) : null

/** La app va en su propio archivo (`MainApp`): el arranque baja sólo esto y la pide al dibujarse. */
const MainApp = lazy(() => import('./MainApp'))

function isPlaygroundPath(): boolean {
  return typeof window !== 'undefined' && /^\/playground(\/|$)/.test(window.location.pathname)
}

/**
 * Antes de montar la app: la primera carga de la sesión en `/` (`shouldShowLanding`) y `?landing=1` llegan a «Inicio» (`#inicio`), un paso más de la app. El hash se reemplaza sin sumar una
 * entrada al historial, y la marca de la sesión queda puesta: en esta pestaña, `/` sin hash vuelve al paso de siempre.
 */
function routeToHome(): void {
  if (shouldShowLanding(readLandingInput())) {
    const url = new URL(window.location.href)

    url.searchParams.delete('landing')
    url.hash = HOME_HASH
    window.history.replaceState(null, '', url)
  }

  markEntered()
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
        <MainApp>
          <Playground />
        </MainApp>
      </Suspense>
    )
  }

  return <Home />
}

function Home() {
  // Una vez, antes que la app lea el hash (es perezosa: se dibuja después). Repetirla no cambia nada: el hash ya es `#inicio`.
  useState(routeToHome)

  return (
    <Suspense fallback={null}>
      <MainApp />
    </Suspense>
  )
}
