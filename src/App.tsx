import { lazy, Suspense, useEffect, useState, useTransition } from 'react'

import { markEntered, readLandingInput, shouldShowLanding } from './app/landing'

/** El catálogo de componentes vive en su propio archivo: la app no lo baja si no se pide `/playground`. */
const Playground = lazy(() => import('./components/playground/Playground'))

/** El tablero del departamento de TI, sólo en `npm run dev`: en el build `import.meta.env.DEV` es `false`, el import se cae y `/ti` es una ruta más. */
const TiDashboard = import.meta.env.DEV ? lazy(() => import('./components/ti/TiDashboard')) : null

/** La app y la landing, cada una en su archivo: quien llega por primera vez baja sólo la landing (y la app, precargada cuando el navegador está libre). */
const loadMainApp = () => import('./MainApp')
const MainApp = lazy(loadMainApp)
const Landing = lazy(() => import('./components/landing/Landing'))

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
        <MainApp>
          <Playground />
        </MainApp>
      </Suspense>
    )
  }

  return <Home />
}

/** `/`: la landing para quien llega por primera vez (`shouldShowLanding`) o la app. */
function Home() {
  const [landing, setLanding] = useState(() => shouldShowLanding(readLandingInput()))
  const [entering, startEntering] = useTransition()

  useEffect(() => {
    if (!landing) {
      markEntered()
      return
    }

    // Cualquier enlace de la landing que cambia el hash («Medir mi deck», «Jugar ahora», «Ver todas las novedades») entra a la app sin recargar.
    // En una transición: la landing queda a la vista hasta que la app llegó.
    const enter = () => {
      if (window.location.hash.length > 1) startEntering(() => setLanding(false))
    }

    window.addEventListener('hashchange', enter)

    return () => window.removeEventListener('hashchange', enter)
  }, [landing])

  return <Suspense fallback={null}>{landing ? <Landing entering={entering} onPrefetch={loadMainApp} /> : <MainApp />}</Suspense>
}
