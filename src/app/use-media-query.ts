import { useCallback, useSyncExternalStore } from 'react'

// Breakpoint a partir del cual el deck builder usa el layout de escritorio.
export const DESKTOP_DECK_BUILDER_MEDIA_QUERY = '(min-width: 1101px)'
// El complemento exacto de la de arriba (`max-[1101px]` de Tailwind): sin hueco entre 1100 y 1101 px, que con zoom también existe.
export const MOBILE_DECK_BUILDER_MEDIA_QUERY = '(width < 1101px)'
/** Desde acá, la mesa del duelo tiene lugar para el detalle de la carta fijo a su izquierda (además del chat a la derecha): con menos, la barra de arriba de la mesa no entra. */
export const DUEL_DETAIL_DOCK_MEDIA_QUERY = '(min-width: 1440px)'

function canMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

/** Si la consulta se cumple, y se actualiza al cambiar. Con `null` no escucha nada y da `false` (lo que sólo a veces depende del ancho, como el asa de un `Modal lowerable`). */
export function useMediaQuery(query: string | null): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (query === null || !canMatchMedia()) {
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
    () => query !== null && canMatchMedia() && window.matchMedia(query).matches,
    () => false,
  )
}
