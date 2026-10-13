import { useEffect, useState } from 'react'

import { fetchCardArts, type CardArtOption } from '../ygoprodeck'

/** Los artes no cambian de un día para otro: uno en el dispositivo evita volver a pedirlos. */
const PERSIST_MS = 24 * 60 * 60 * 1000
const NONE: readonly CardArtOption[] = []

/** Lo ya consultado en esta sesión, y lo que se está pidiendo ahora (dos detalles de la misma carta comparten el pedido). */
const cache = new Map<number, readonly CardArtOption[]>()
const inFlight = new Map<number, Promise<readonly CardArtOption[]>>()

function request(cardId: number, name: string): Promise<readonly CardArtOption[]> {
  let pending = inFlight.get(cardId)

  if (!pending) {
    pending = fetchCardArts(name, { persistForMs: PERSIST_MS })
      .then((arts) => {
        cache.set(cardId, arts)
        return arts
      })
      .finally(() => inFlight.delete(cardId))
    inFlight.set(cardId, pending)
  }

  return pending
}

/**
 * Los artes de la carta (el original y los alternativos). Mientras llegan, o si el pedido falla, ninguno: el selector de artes es un extra
 * del detalle y no tiene que estorbarlo. Sin id no pide nada. Se piden por el nombre (la API da todos los artes por nombre, y sólo uno por id).
 */
export function useCardArts(cardId: number | null, name: string): readonly CardArtOption[] {
  const [loaded, setLoaded] = useState<{ id: number; arts: readonly CardArtOption[] } | null>(null)

  useEffect(() => {
    if (cardId === null || cache.has(cardId)) {
      return
    }

    let cancelled = false

    request(cardId, name).then(
      (arts) => !cancelled && setLoaded({ id: cardId, arts }),
      () => {
        // Sin los artes alternativos se sigue con el de siempre.
      },
    )

    return () => {
      cancelled = true
    }
  }, [cardId, name])

  if (cardId === null) {
    return NONE
  }

  return cache.get(cardId) ?? (loaded?.id === cardId ? loaded.arts : NONE)
}
