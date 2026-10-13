import { useSyncExternalStore } from 'react'

import type { MetaRegion } from './meta'

// La región que se mira vale para las dos pantallas (tier lists y decks de torneo): al pasar de una a la otra, o al tocar "ver los decks"
// de un tier list, no se pierde. Dura lo que dura la página: la región de arranque sale del formato del builder.
let chosen: MetaRegion | null = null
const listeners = new Set<() => void>()

export function setMetaRegion(next: MetaRegion): void {
  if (chosen === next) {
    return
  }

  chosen = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** La región elegida; mientras no se eligió ninguna, `fallback` (la del deck que pide el link o la del formato del builder). */
export function useMetaRegion(fallback: MetaRegion): MetaRegion {
  return useSyncExternalStore(
    subscribe,
    () => chosen ?? fallback,
    () => fallback,
  )
}
