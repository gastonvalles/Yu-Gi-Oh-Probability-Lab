import { useEffect, useMemo, useState } from 'react'

import { fetchExpansionCards, fetchExpansions, type Expansion } from '../../app/card-prices'
import { SEARCH_DEBOUNCE_MS } from '../../app/model'
import { normalizeSearchText } from '../../app/utils'
import { fetchCardsByIds, searchCards, type ApiCardSearchResult } from '../../ygoprodeck'
import { findExpansionResults, findPrintResults, FINDER_MIN_LENGTH, setCodePrefix, type FinderResult } from './finder-sources'

interface Settled<T> {
  /** Lo escrito a lo que corresponde `value`: si ya no es lo que se escribió, el resultado es viejo y no se muestra. */
  key: string
  value: T
}

/** Una consulta de YGOPRODeck: una carta por su id («46986414») o por su nombre (la API busca por fragmento). Sin red o sin coincidencias, ninguna. */
async function loadCards(text: string): Promise<ApiCardSearchResult[]> {
  try {
    return /^\d{5,10}$/.test(text) ? await fetchCardsByIds([Number(text)]) : (await searchCards({ query: text }, 6)).results
  } catch {
    return []
  }
}

/**
 * Lo que el buscador de la app trae de afuera mientras se escribe: las cartas (por nombre o por id de YGOPRODeck), las expansiones (el índice de los precios, que se baja al abrirlo y se queda
 * para la sesión) y, si lo escrito es un código («LOB-EN00»), las impresiones de esa expansión. Lo que va a la red espera a que se deje de escribir (`SEARCH_DEBOUNCE_MS`) y sólo cuenta lo último escrito.
 */
export function useFinderData(query: string, isOpen: boolean): { cards: ApiCardSearchResult[]; sets: FinderResult[]; busy: boolean } {
  const text = query.trim()
  const [settledText, setSettledText] = useState('')
  const [expansions, setExpansions] = useState<Expansion[]>([])
  const [cardsOf, setCardsOf] = useState<Settled<ApiCardSearchResult[]> | null>(null)
  const [printsOf, setPrintsOf] = useState<Settled<FinderResult[]> | null>(null)
  const qualifies = normalizeSearchText(settledText).length >= FINDER_MIN_LENGTH

  useEffect(() => {
    const timer = window.setTimeout(() => setSettledText(text), SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [text])

  // El índice de las expansiones: una vez por sesión, recién cuando se abre el buscador.
  useEffect(() => {
    if (!isOpen) {
      return
    }

    let cancelled = false

    fetchExpansions().then(
      (data) => !cancelled && setExpansions(data.expansions),
      () => {},
    )

    return () => {
      cancelled = true
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !qualifies) {
      return
    }

    let cancelled = false

    void loadCards(settledText).then((cards) => !cancelled && setCardsOf({ key: settledText, value: cards }))

    return () => {
      cancelled = true
    }
  }, [isOpen, qualifies, settledText])

  // Un código con algo después del guion («LOB-E»): las impresiones de la expansión con ese prefijo (el archivo de cada una se baja una vez).
  useEffect(() => {
    const prefix = setCodePrefix(settledText)

    if (!isOpen || prefix === null || settledText.length <= prefix.length + 1) {
      return
    }

    const matching = expansions.filter((expansion) => expansion.code.toLowerCase() === prefix).slice(0, 2)
    let cancelled = false

    void Promise.all(matching.map((expansion) => fetchExpansionCards(expansion.id).then((cards) => findPrintResults(expansion, cards, settledText), () => []))).then(
      // Una misma carta con la misma rareza sale en varias expansiones con el mismo código (la 25.º Aniversario, las ediciones): se lista una vez.
      (found) => !cancelled && setPrintsOf({ key: settledText, value: [...new Map(found.flat().map((print) => [`${print.label}|${print.hint}`, print])).values()].slice(0, 4) }),
    )

    return () => {
      cancelled = true
    }
  }, [isOpen, expansions, settledText])

  const cards = qualifies && cardsOf?.key === settledText ? cardsOf.value : []
  const sets = useMemo(
    () => (qualifies ? [...(printsOf?.key === settledText ? printsOf.value : []), ...findExpansionResults(expansions, settledText)] : []),
    [expansions, printsOf, qualifies, settledText],
  )
  const busy = normalizeSearchText(text).length >= FINDER_MIN_LENGTH && (text !== settledText || cardsOf?.key !== settledText)

  return { cards, sets, busy }
}
