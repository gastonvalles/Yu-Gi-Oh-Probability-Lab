import { useCallback, useSyncExternalStore } from 'react'

// Breakpoint a partir del cual el deck builder usa el layout de escritorio.
export const DESKTOP_DECK_BUILDER_MEDIA_QUERY = '(min-width: 1101px)'
/** Desde acá, la mesa del duelo tiene lugar para el detalle de la carta fijo a su izquierda (además del chat a la derecha): con menos, la barra de arriba de la mesa no entra. */
export const DUEL_DETAIL_DOCK_MEDIA_QUERY = '(min-width: 1440px)'

function canMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!canMatchMedia()) {
        return () => {}
      }

      const mediaQuery = window.matchMedia(query)
      mediaQuery.addEventListener('change', onChange)
      return () => mediaQuery.removeEventListener('change', onChange)
    },
    [query],
  )

  return useSyncExternalStore(
    subscribe,
    () => canMatchMedia() && window.matchMedia(query).matches,
    () => false,
  )
}
