import { useEffect, useState } from 'react'

import { searchCards } from '../ygoprodeck'
import { findCardsByCode, type CardHit, type Expansion } from './card-prices'

/** Con menos letras la búsqueda trae media base de datos: no se pide. */
const MIN_QUERY_LENGTH = 3
/** Espera después de la última tecla: se busca lo que quedó escrito, no cada letra. */
const TYPING_PAUSE_MS = 350
/** Cuántas cartas se ofrecen: es una forma de llegar a los precios, no un segundo buscador de cartas. */
const MAX_CARD_HITS = 8
/** "LAVD-EN001", "lob en001": un código no se busca por nombre (la API contestaría que no hay ninguna). */
const LOOKS_LIKE_CODE = /^[a-z0-9]{2,6}[- ]?[a-z]{0,3}\d{1,4}$/i

export interface CardHitsState {
  /** loading: se está buscando lo escrito (las cartas de antes siguen a la vista hasta que lleguen las nuevas). */
  status: 'idle' | 'loading' | 'ready'
  hits: CardHit[]
}

const IDLE: CardHitsState = { status: 'idle', hits: [] }

/**
 * Las cartas que coinciden con lo escrito en el buscador de Expansiones: por nombre (la búsqueda de YGOPRODeck) y por código de impresión (los archivos de las
 * expansiones, que la pantalla ya baja). Con el código completo salen primero las que coinciden con él. Si algo falla, esa parte no suma cartas: el buscador de
 * expansiones sigue funcionando.
 */
export function useCardHits(query: string, expansions: Expansion[]): CardHitsState {
  const typed = query.trim()
  const active = typed.length >= MIN_QUERY_LENGTH
  const [result, setResult] = useState<{ query: string; hits: CardHit[] } | null>(null)

  useEffect(() => {
    if (!active) {
      setResult(null)

      return
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      const byCode = findCardsByCode(expansions, typed).catch((): CardHit[] => [])
      const byName = LOOKS_LIKE_CODE.test(typed)
        ? Promise.resolve<CardHit[]>([])
        : searchCards({ query: typed }, MAX_CARD_HITS).then(
            (page) => page.results.map((card) => ({ cardId: card.ygoprodeckId, name: card.name, code: '' })),
            (): CardHit[] => [],
          )
      const found = [...(await byCode), ...(await byName)]
      const hits = found.filter((hit, at) => found.findIndex((other) => other.cardId === hit.cardId) === at).slice(0, MAX_CARD_HITS)

      if (!cancelled) {
        setResult({ query: typed, hits })
      }
    }, TYPING_PAUSE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [active, typed, expansions])

  if (!active) {
    return IDLE
  }

  return { status: result?.query === typed ? 'ready' : 'loading', hits: result?.hits ?? [] }
}
