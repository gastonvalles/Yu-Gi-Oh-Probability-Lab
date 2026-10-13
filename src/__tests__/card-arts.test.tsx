// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CardDetailModal } from '../components/card-detail/CardDetailModal'
import type { ApiCardSearchResult, CardArtOption } from '../ygoprodeck'

const { arts, prices } = vi.hoisted(() => ({ arts: { current: [] as CardArtOption[] }, prices: { current: { status: 'idle' } as unknown } }))

vi.mock('../app/use-card-arts', () => ({ useCardArts: () => arts.current }))
vi.mock('../app/use-card-prices', () => ({ useCardPrices: () => prices.current }))

// El arte real lee el store (el aviso de la banlist): acá sólo importa de qué imagen es.
vi.mock('../components/CardArt', () => ({
  CardArt: ({ name, remoteUrl }: { name: string; remoteUrl: string | null }) => <img alt={name} src={remoteUrl ?? ''} />,
}))

const card: ApiCardSearchResult = {
  name: 'Blue-Eyes White Dragon',
  ygoprodeckId: 89631139,
  cardType: 'Normal Monster',
  frameType: 'normal',
  description: 'This legendary dragon is a powerful engine of destruction.',
  race: 'Dragon',
  attribute: 'LIGHT',
  level: 8,
  linkValue: null,
  atk: '3000',
  def: '2500',
  archetype: 'Blue-Eyes',
  ygoprodeckUrl: null,
  imageUrl: 'https://images.ygoprodeck.com/images/cards/89631139.jpg',
  imageUrlSmall: 'https://images.ygoprodeck.com/images/cards_small/89631139.jpg',
  banlist: { tcg: null, ocg: null, goat: null },
  genesys: { points: null },
}

const option = (id: number): CardArtOption => ({ id, imageUrl: `https://images.ygoprodeck.com/images/cards/${id}.jpg`, imageUrlSmall: `https://images.ygoprodeck.com/images/cards_small/${id}.jpg` })

describe('el detalle de la carta con artes alternativos', () => {
  beforeEach(() => {
    arts.current = [option(89631139), option(89631140), option(89631141)]
    prices.current = { status: 'idle' }
  })

  afterEach(cleanup)

  const open = () => render(<CardDetailModal card={card} deckFormat="unlimited" isOpen onAddToZone={() => false} onClose={() => {}} />)

  it('muestra las miniaturas y al tocar una cambia el arte grande', () => {
    open()

    const group = screen.getByRole('group', { name: 'Artes de la carta' })
    const main = () => screen.getByAltText('Blue-Eyes White Dragon')

    expect(group.querySelectorAll('button')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Arte 1 de 3' })).toHaveAttribute('aria-pressed', 'true')
    expect(main().getAttribute('src')).toContain('89631139.jpg')

    fireEvent.click(screen.getByRole('button', { name: 'Arte 3 de 3' }))

    expect(main().getAttribute('src')).toContain('89631141.jpg')
    expect(screen.getByRole('button', { name: 'Arte 3 de 3' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Arte 1 de 3' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('con un solo arte no hay selector', () => {
    arts.current = [option(89631139)]
    open()

    expect(screen.queryByRole('group', { name: 'Artes de la carta' })).not.toBeInTheDocument()
  })

  it('el botón de precios y las miniaturas quedan afuera de la carta que se inclina en 3D', () => {
    open()

    const tilting = screen.getByRole('button', { name: 'Ver la carta en grande' })

    expect(tilting.contains(screen.getByRole('button', { name: 'Ver precios en TCGplayer' }))).toBe(false)
    expect(tilting.contains(screen.getByRole('group', { name: 'Artes de la carta' }))).toBe(false)
  })

  it('tocar una miniatura no cierra el detalle', () => {
    const onClose = vi.fn()

    render(<CardDetailModal card={card} deckFormat="unlimited" isOpen onAddToZone={() => false} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Arte 2 de 3' }))

    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('el detalle de la carta con las impresiones como artes (overframe, extended art...)', () => {
  const printing = (productId: number, rarity: string, variant: string, edition = '1st Edition') => ({ set: 'Maze of Millennia', code: 'MAZE-EN003', rarity, edition, market: 1, url: `https://www.tcgplayer.com/product/${productId}`, productId, variant })

  beforeEach(() => {
    arts.current = [option(89631139)]
    prices.current = {
      status: 'ready',
      updated: '2026-10-11',
      // Dos ediciones del mismo producto (706) son un solo arte.
      prices: [printing(706, 'Ultra Rare', 'Extended Art'), printing(706, 'Ultra Rare', 'Extended Art', 'Unlimited'), printing(705, 'Ultra Rare', '')],
    }
  })

  afterEach(cleanup)

  const open = () => render(<CardDetailModal card={card} deckFormat="unlimited" isOpen onAddToZone={() => false} onClose={() => {}} />)

  it('se suman a los de YGOPRODeck, uno por producto, con el nombre de la impresión y su arte en el tooltip', () => {
    open()

    const group = screen.getByRole('group', { name: 'Artes de la carta' })
    const buttons = [...group.querySelectorAll('button')]

    expect(buttons).toHaveLength(3)
    expect(buttons[0]).not.toHaveAttribute('title')
    expect(buttons[1]).toHaveAttribute('title', 'Maze of Millennia · MAZE-EN003 · Ultra Rare · Extended Art')
    expect(buttons[2]).toHaveAttribute('title', 'Maze of Millennia · MAZE-EN003 · Ultra Rare')
  })

  it('tocar una impresión muestra su escaneo grande (el de 400 px de TCGplayer)', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Arte 2 de 3' }))

    expect(screen.getByAltText('Blue-Eyes White Dragon').getAttribute('src')).toBe('https://tcgplayer-cdn.tcgplayer.com/product/706_400w.jpg')
    expect(screen.getByRole('button', { name: 'Arte 2 de 3' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('una carta con una sola impresión y un solo arte no muestra selector', () => {
    prices.current = { status: 'ready', updated: '2026-10-11', prices: [] }
    open()

    expect(screen.queryByRole('group', { name: 'Artes de la carta' })).not.toBeInTheDocument()
  })
})
