// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CardPrices, PrintingPrice } from '../app/card-prices'
import { cheapestPrice, computeDeckPrice } from '../app/deck-price'
import { createInitialState, type DeckBuilderState, type DeckCardInstance } from '../app/model'
import { DeckPriceModal } from '../components/deck-mode/DeckPriceModal'
import { applyLocale } from '../i18n'

const printing = (market: number | null, rarity = 'Common'): PrintingPrice => ({ set: 'Set', code: 'AAA-EN001', rarity, edition: 'Unlimited', market, url: '', productId: 1, expansionId: 1, variant: '' })
const prices = (...markets: Array<number | null>): CardPrices => ({ prices: markets.map((market) => printing(market)), updated: '2026-10-11' })

function instance(id: number, name: string, index: number): DeckCardInstance {
  return { instanceId: `${id}-${index}`, name, origin: null, roles: [], needsReview: false, apiCard: { ygoprodeckId: id } as DeckCardInstance['apiCard'] }
}

function deck(): DeckBuilderState {
  const state = createInitialState().deckBuilder

  return {
    ...state,
    // Ash ×3 (Main), Nibiru ×1 (Main) y la misma Ash ×1 en el Side: las copias se cuentan entre las tres zonas.
    main: [instance(1, 'Ash', 0), instance(1, 'Ash', 1), instance(1, 'Ash', 2), instance(2, 'Nibiru', 0), instance(3, 'Rara sin precio', 0)],
    extra: [],
    side: [instance(1, 'Ash', 3)],
  }
}

const PRICES = new Map<number, CardPrices | null>([
  [1, prices(25, 7.5, 12)],
  [2, prices(3.2)],
  [3, prices(null)],
])

describe('el precio del deck', () => {
  it('la impresión más barata con precio de cada carta (sin contar las que no tienen)', () => {
    expect(cheapestPrice([printing(25), printing(7.5), printing(null), printing(12)])).toBe(7.5)
    expect(cheapestPrice([printing(null)])).toBeNull()
    expect(cheapestPrice([])).toBeNull()
  })

  it('suma copias × la más barata, cuenta las copias de las tres zonas y deja aparte lo que no tiene precio', () => {
    const price = computeDeckPrice(deck(), PRICES)

    // Ash: 4 × 7,50 = 30; Nibiru: 1 × 3,20.
    expect(price.total).toBe(33.2)
    expect(price.pricedCopies).toBe(5)
    expect(price.unpricedCopies).toBe(1)
    expect(price.lines.map((line) => [line.name, line.copies, line.total])).toEqual([
      ['Ash', 4, 30],
      ['Nibiru', 1, 3.2],
      ['Rara sin precio', 1, null],
    ])
  })
})

vi.mock('../app/use-card-prices', () => ({
  loadCardPrices: vi.fn(async (id: number) => {
    const data = PRICES.get(id)

    if (!data) throw new Error('sin datos')
    return data
  }),
}))

describe('la ventana del precio del deck', () => {
  beforeEach(() => applyLocale('es'))

  it('muestra el total, el detalle por carta y avisa de las copias sin precio', async () => {
    render(<DeckPriceModal isOpen onClose={() => {}} deckBuilder={{ ...deck(), main: deck().main.filter((card) => card.apiCard.ygoprodeckId !== 3) }} />)

    const dialog = screen.getByRole('dialog', { name: 'Precio del deck' })

    expect(await within(dialog).findByText(/33[.,]20/, { selector: 'strong' })).toBeInTheDocument()
    expect(within(dialog).getByText('Con la impresión más barata de cada carta (Main, Extra y Side).')).toBeInTheDocument()
    expect(within(dialog).getByText('4×')).toBeInTheDocument()
    expect(within(dialog).getByText(/30[.,]00/)).toBeInTheDocument()
    expect(within(dialog).queryByText(/no tiene precio/)).not.toBeInTheDocument()
  })

  it('con el deck vacío dice que falta sumar cartas', () => {
    render(<DeckPriceModal isOpen onClose={() => {}} deckBuilder={{ ...deck(), main: [], side: [] }} />)

    expect(screen.getByText('Todavía no hay cartas')).toBeInTheDocument()
  })

  it('si alguna carta no se puede traer, no dice un total a medias', async () => {
    render(<DeckPriceModal isOpen onClose={() => {}} deckBuilder={{ ...deck(), main: [instance(99, 'Desconocida', 0)], side: [] }} />)

    expect(await screen.findByText('No pude traer los precios ahora. Probá de nuevo más tarde.')).toBeInTheDocument()
  })
})
