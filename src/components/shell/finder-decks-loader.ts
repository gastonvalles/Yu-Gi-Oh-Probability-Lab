import { useEffect, useState } from 'react'

export type FinderDecks = typeof import('./finder-decks')

let loaded: FinderDecks | null = null

/** Los decks de torneo y los replays del buscador (`finder-decks.ts`, con los datos de los torneos): una sola descarga por sesión. La app la precarga en un momento ocioso (`lazy-steps.ts`). */
export function loadFinderDecks(): Promise<FinderDecks> {
  return import('./finder-decks').then((module) => (loaded = module))
}

/** Los buscadores de decks y replays: ya están si se precargaron; si no, se piden al abrir el buscador y las filas aparecen apenas llegan. */
export function useFinderDecks(isOpen: boolean): FinderDecks | null {
  const [decks, setDecks] = useState<FinderDecks | null>(loaded)

  useEffect(() => {
    if (!isOpen || decks) {
      return
    }

    let cancelled = false

    loadFinderDecks().then(
      (module) => !cancelled && setDecks(module),
      () => {},
    )

    return () => {
      cancelled = true
    }
  }, [isOpen, decks])

  return decks
}
