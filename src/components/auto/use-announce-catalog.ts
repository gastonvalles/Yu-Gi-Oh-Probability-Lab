import { useEffect, useState } from 'react'

import { loadAnnounceCatalog, type AnnounceCatalog } from '../../app/auto/announce'

/** El catálogo para declarar una carta, recién cuando se pregunta (`active`): mientras baja, `loading`; si no baja, `error` (la próxima pregunta lo vuelve a intentar). */
export function useAnnounceCatalog(active: boolean): { status: 'loading' | 'ready' | 'error'; catalog: AnnounceCatalog | null } {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; catalog: AnnounceCatalog | null }>({ status: 'loading', catalog: null })

  useEffect(() => {
    if (!active) return
    let alive = true

    loadAnnounceCatalog().then(
      (catalog) => alive && setState({ status: 'ready', catalog }),
      () => alive && setState({ status: 'error', catalog: null }),
    )

    return () => {
      alive = false
    }
  }, [active])

  return state
}
