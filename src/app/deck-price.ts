import type { CardPrices, PrintingPrice } from './card-prices'
import type { DeckBuilderState } from './model'

/** Una carta del deck con lo que cuesta: cuántas copias lleva (en las tres zonas) y el precio de la impresión más barata. */
export interface DeckPriceLine {
  cardId: number
  name: string
  copies: number
  /** El precio de mercado más bajo entre las impresiones de la carta; `null` si ninguna tiene precio. */
  unit: number | null
  /** `unit × copies`; `null` si no hay precio. */
  total: number | null
}

export interface DeckPrice {
  /** La suma de las cartas con precio. */
  total: number
  /** Cartas (copias) con precio y sin él. */
  pricedCopies: number
  unpricedCopies: number
  /** Las cartas con precio, de la más cara a la más barata, y después las que no tienen. */
  lines: DeckPriceLine[]
}

/** La impresión más barata con precio de mercado: lo que cuesta tener la carta jugando, sin pagar de más por una rareza o un arte especial. */
export function cheapestPrice(printings: readonly PrintingPrice[]): number | null {
  const prices = printings.flatMap((printing) => (printing.market !== null && printing.market > 0 ? [printing.market] : []))

  return prices.length === 0 ? null : Math.min(...prices)
}

/** Las cartas distintas del deck (Main, Extra y Side juntos) con sus copias, en el orden en que aparecen. */
export function deckCardCopies(deckBuilder: DeckBuilderState): Array<{ cardId: number; name: string; copies: number }> {
  const byId = new Map<number, { cardId: number; name: string; copies: number }>()

  for (const card of [...deckBuilder.main, ...deckBuilder.extra, ...deckBuilder.side]) {
    const entry = byId.get(card.apiCard.ygoprodeckId)

    if (entry) {
      entry.copies += 1
    } else {
      byId.set(card.apiCard.ygoprodeckId, { cardId: card.apiCard.ygoprodeckId, name: card.name, copies: 1 })
    }
  }

  return [...byId.values()]
}

/**
 * El precio del deck: por cada carta, copias × la impresión más barata en TCGplayer (precio de mercado, en dólares). Las que no tienen precio no suman y
 * se cuentan aparte, para no decir un total que parece completo y no lo es. Pura: los precios los trae quien la llama.
 */
export function computeDeckPrice(deckBuilder: DeckBuilderState, pricesById: ReadonlyMap<number, CardPrices | null>): DeckPrice {
  const lines: DeckPriceLine[] = deckCardCopies(deckBuilder).map(({ cardId, name, copies }) => {
    const unit = cheapestPrice(pricesById.get(cardId)?.prices ?? [])

    return { cardId, name, copies, unit, total: unit === null ? null : Math.round(unit * copies * 100) / 100 }
  })
  const priced = lines.filter((line) => line.total !== null)

  return {
    total: Math.round(priced.reduce((sum, line) => sum + (line.total ?? 0), 0) * 100) / 100,
    pricedCopies: priced.reduce((sum, line) => sum + line.copies, 0),
    unpricedCopies: lines.filter((line) => line.total === null).reduce((sum, line) => sum + line.copies, 0),
    lines: [...priced.sort((a, b) => (b.total ?? 0) - (a.total ?? 0) || a.name.localeCompare(b.name)), ...lines.filter((line) => line.total === null)],
  }
}
