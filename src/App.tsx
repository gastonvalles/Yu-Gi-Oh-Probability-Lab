import { lazy, Suspense, useEffect, useState, useTransition } from 'react'

import { HOME_HASH, markEntered, readLandingInput, shouldShowLanding } from './app/landing'

/** El catálogo de componentes vive en su propio archivo: la app no lo baja si no se pide `/playground`. */
const Playground = lazy(() => import('./components/playground/Playground'))

/** El tablero del departamento de TI, sólo en `npm run dev`: en el build `import.meta.env.DEV` es `false`, el import se cae y `/ti` es una ruta más. */
const TiDashboard = import.meta.env.DEV ? lazy(() => import('./components/ti/TiDashboard')) : null

/** PROTOTIPO de TI-113 (propuesta B, «Inicio» adentro de la app), sólo en `npm run dev`: `/?landing=b`. */
const InicioPrototype = import.meta.env.DEV ? lazy(() => import('./components/landing/InicioPrototype')) : null

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

  if (InicioPrototype && new URLSearchParams(window.location.search).get('landing') === 'b') {
    return (
      <Suspense fallback={null}>
        <MainApp>
          <InicioPrototype />
        </MainApp>
      </Suspense>
    )
  }

  return <Home />
}

/**
 * `/`: la landing para quien llega por primera vez (`shouldShowLanding`) o la app. «Inicio» (`#inicio`) vuelve a la landing **encima** de la app, que queda montada y escondida:
 * no se recarga nada, así que un duelo en curso, la mesa o lo que no se guardó siguen ahí. Cualquier otro hash (un enlace de la landing, el botón Atrás) la saca.
 */
function Home() {
  const [landing, setLanding] = useState(() => shouldShowLanding(readLandingInput()))
  // La app, una vez montada, no se desmonta más: la landing de «Inicio» la tapa.
  const [appMounted, setAppMounted] = useState(!landing)
  const [entering, startEntering] = useTransition()

  useEffect(() => {
    if (!landing) markEntered()
  }, [landing])

  useEffect(() => {
    // En una transición: la landing queda a la vista hasta que la app llegó.
    const onHash = () => {
      if (window.location.hash === HOME_HASH) setLanding(true)
      else if (window.location.hash.length > 1) {
        startEntering(() => {
          setAppMounted(true)
          setLanding(false)
        })
      }
    }

    window.addEventListener('hashchange', onHash)

    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <Suspense fallback={null}>
      {appMounted ? (
        <div hidden={landing}>
          <MainApp />
        </div>
      ) : null}
      {landing ? <Landing entering={entering} onPrefetch={loadMainApp} /> : null}
    </Suspense>
  )
}
