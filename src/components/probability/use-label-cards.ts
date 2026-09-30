import { useEffect, useMemo, useRef, useState } from 'react'

import {
  createAbsentCardEntry,
  parseYgoprodeckId,
  readCardNames,
  rememberCardNames,
} from '../../app/card-name-registry'
import type { CardEntry, HandPattern } from '../../types'
import { fetchCardNamesByIds } from '../../ygoprodeck'

function collectReferencedCardIds(patterns: HandPattern[]): string[] {
  return [
    ...new Set(
      patterns.flatMap((pattern) =>
        pattern.conditions.flatMap(({ matcher }) =>
          matcher?.type === 'card' ? [matcher.value] : matcher?.type === 'card_pool' ? matcher.value : [],
        ),
      ),
    ),
  ]
}

/**
 * Cartas para mostrar nombres en las reglas: las del deck más, con 0 copias, las que
 * una regla pide pero ya no están (nombre recordado o buscado una vez en YGOPRODeck).
 * No sirve para calcular: sólo para textos.
 */
export function useLabelCards(patterns: HandPattern[], cards: CardEntry[]): CardEntry[] {
  const [names, setNames] = useState(readCardNames)
  const requestedRef = useRef(new Set<string>())
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    setNames(rememberCardNames(cards))
  }, [cards])

  const missingIds = useMemo(() => {
    const inDeck = new Set(cards.map((card) => card.id))
    return collectReferencedCardIds(patterns).filter((id) => !inDeck.has(id))
  }, [cards, patterns])

  useEffect(() => {
    const unknown = missingIds.filter((id) => !names[id] && !requestedRef.current.has(id))
    const apiIds = unknown.map(parseYgoprodeckId).filter((id): id is number => id !== null)

    if (apiIds.length === 0) {
      return
    }

    // Cada id se pide una sola vez; la respuesta no se descarta aunque cambien los nombres.
    unknown.forEach((id) => requestedRef.current.add(id))

    fetchCardNamesByIds(apiIds)
      .then((found) => {
        if (mountedRef.current && found.size > 0) {
          setNames(rememberCardNames([...found].map(([apiId, name]) => ({ id: `card-${apiId}`, name }))))
        }
      })
      .catch(() => {
        // Sin conexión: queda el texto genérico hasta la próxima vez.
      })
  }, [missingIds, names])

  return useMemo(() => {
    const absent = missingIds.filter((id) => names[id]).map((id) => createAbsentCardEntry(id, names[id]!))
    return absent.length > 0 ? [...cards, ...absent] : cards
  }, [cards, missingIds, names])
}
