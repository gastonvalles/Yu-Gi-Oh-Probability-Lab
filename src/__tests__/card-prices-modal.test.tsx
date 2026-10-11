// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CardDetailModal } from '../components/card-detail/CardDetailModal'
import type { ApiCardSearchResult } from '../ygoprodeck'

vi.mock('../components/CardArt', () => ({
  CardArt: ({ name }: { name: string }) => <img alt={name} />,
}))

vi.mock('../app/use-card-prices', () => ({
  useCardPrices: () => ({
    status: 'ready',
    updated: '2026-10-11',
    prices: [{ set: 'Justice Hunters', code: 'JUSH-EN016', rarity: "Collector's Rare", edition: '1st Edition', market: 5.86, low: null, url: 'https://www.tcgplayer.com/product/1' }],
  }),
}))

afterEach(cleanup)

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
    expect(prices).toHaveTextContent('Justice Hunters')
    expect(prices).toHaveTextContent('JUSH-EN016 · Collector\'s Rare · 1st Edition')
    expect(prices).toHaveTextContent('5,86')
    expect(prices).toHaveTextContent('11/10/2026')
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
