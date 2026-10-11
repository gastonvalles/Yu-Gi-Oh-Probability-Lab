// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CardDetailModal } from '../components/card-detail/CardDetailModal'
import type { ApiCardSearchResult } from '../ygoprodeck'

vi.mock('../components/CardArt', () => ({
  CardArt: ({ name }: { name: string }) => <img alt={name} />,
}))

const { useCardPrices } = vi.hoisted(() => ({
  useCardPrices: vi.fn((_cardId: number | null) => ({
    status: 'ready' as const,
    updated: '2026-10-11',
    prices: [
      { set: 'Justice Hunters', code: 'JUSH-EN016', rarity: "Collector's Rare", edition: '1st Edition', market: 5.86, low: null, url: 'https://www.tcgplayer.com/product/1' },
      { set: 'Justice Hunters', code: 'JUSH-EN016', rarity: 'Ultra Rare', edition: '1st Edition', market: 1.33, low: null, url: 'https://www.tcgplayer.com/product/2' },
      { set: 'Rarity Collection 5', code: 'RA05-EN091', rarity: 'Starlight Rare', edition: '1st Edition', market: 20.12, low: null, url: 'https://www.tcgplayer.com/product/3' },
    ],
  })),
}))

vi.mock('../app/use-card-prices', () => ({ useCardPrices }))

afterEach(() => {
  cleanup()
  useCardPrices.mockClear()
})

const card: ApiCardSearchResult = {
  name: 'Mulcharmy Purulia',
  ygoprodeckId: 84192580,
  cardType: 'Effect Monster',
  frameType: 'effect',
  description: 'If you control no cards (Quick Effect): You can discard this card.',
  race: 'Aqua',
  attribute: 'WATER',
  level: 4,
  linkValue: null,
  atk: '100',
  def: '600',
  archetype: null,
  ygoprodeckUrl: null,
  imageUrl: null,
  imageUrlSmall: null,
  banlist: { tcg: null, ocg: null, goat: null },
  genesys: { points: null },
}

function openPrices(onClose = vi.fn()) {
  render(<CardDetailModal card={card} deckFormat="unlimited" isOpen onAddToZone={() => false} onClose={onClose} />)
  fireEvent.click(screen.getByRole('button', { name: 'Ver precios en TCGplayer' }))
  return onClose
}

describe('precios en el detalle de la carta', () => {
  it('no se ven hasta tocar la moneda de la esquina de la carta', () => {
    render(<CardDetailModal card={card} deckFormat="unlimited" isOpen onAddToZone={() => false} onClose={vi.fn()} />)

    expect(screen.queryByText('Justice Hunters')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ver precios en TCGplayer' }))

    const prices = screen.getByRole('dialog', { name: card.name })
    expect(prices).toHaveTextContent("Collector's Rare · 1st Edition")
    expect(prices).toHaveTextContent('JUSH-EN016')
    expect(prices).toHaveTextContent('5,86')
    expect(prices).toHaveTextContent('11/10/2026')
  })

  it('agrupa las impresiones por expansión, cada una con el sobre de fondo', () => {
    openPrices()

    const headings = screen.getAllByRole('heading', { level: 4 })
    expect(headings.map((heading) => heading.textContent)).toEqual(['Justice Hunters', 'Rarity Collection 5'])
    expect(headings[0]!.closest('header')).toHaveTextContent('2 impresiones')
    expect(headings[1]!.closest('header')).toHaveTextContent('1 impresión')
    expect(headings[0]!.closest('header')!.style.backgroundImage).toContain('https://images.ygoprodeck.com/images/sets/JUSH.jpg')
    expect(headings[1]!.closest('header')!.style.backgroundImage).toContain('https://images.ygoprodeck.com/images/sets/RA05.jpg')
  })

  it('los precios se piden recién al tocar la moneda, no al abrir la carta', () => {
    render(<CardDetailModal card={card} deckFormat="unlimited" isOpen onAddToZone={() => false} onClose={vi.fn()} />)

    expect(useCardPrices).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Ver precios en TCGplayer' }))

    expect(useCardPrices).toHaveBeenCalledWith(card.ygoprodeckId)
  })

  it('tocar la moneda no agranda la carta ni cierra el detalle', () => {
    const onClose = openPrices()

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Ver la carta en grande' })).toBeInTheDocument()
  })

  it('tocar dentro del modal de precios no cierra la carta, y Escape cierra primero el modal', () => {
    const onClose = openPrices()
    const prices = screen.getByRole('dialog', { name: card.name })

    fireEvent.click(prices)
    fireEvent.click(screen.getByText('Justice Hunters'))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: card.name })).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
