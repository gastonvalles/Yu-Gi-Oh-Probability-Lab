// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CardDetailModal } from '../components/card-detail/CardDetailModal'
import type { ApiCardSearchResult } from '../ygoprodeck'

vi.mock('../components/CardArt', () => ({
  CardArt: ({ name }: { name: string }) => <img alt={name} />,
}))

// El estado que devuelve el hook: 2 expansiones traídas de 7 en total. Cada test lo ajusta (queda `remaining`, carga, error).
const { useCardPrices, paging } = vi.hoisted(() => ({
  paging: { total: 7, remaining: 5, loadingMore: false, moreFailed: false, loadMore: vi.fn(), loadAll: vi.fn() },
  useCardPrices: vi.fn(),
}))

const PRICES = [
  { set: 'Justice Hunters', code: 'JUSH-EN016', rarity: "Collector's Rare", edition: '1st Edition', market: 5.86, low: null, url: 'https://www.tcgplayer.com/product/1' },
  { set: 'Justice Hunters', code: 'JUSH-EN016', rarity: 'Ultra Rare', edition: '1st Edition', market: 1.33, low: null, url: 'https://www.tcgplayer.com/product/2' },
  { set: 'Rarity Collection 5', code: 'RA05-EN091', rarity: 'Starlight Rare', edition: '1st Edition', market: 20.12, low: null, url: 'https://www.tcgplayer.com/product/3' },
]

vi.mock('../app/use-card-prices', () => ({ useCardPrices }))

beforeEach(() => {
  Object.assign(paging, { total: 7, remaining: 5, loadingMore: false, moreFailed: false })
  // Como el hook real, devuelve el mismo objeto mientras no cambie nada (si no, el efecto del buscador correría en cada render).
  let current: unknown

  useCardPrices.mockImplementation(() => (current ??= { status: 'ready', updated: '2026-10-11', prices: PRICES, ...paging }))
})

afterEach(() => {
  cleanup()
  useCardPrices.mockReset()
  paging.loadMore.mockClear()
  paging.loadAll.mockClear()
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

  it('ofrece ver de a 3 expansiones más y dice cuántas se muestran de cuántas hay', () => {
    openPrices()

    const more = screen.getByRole('button', { name: 'Ver 3 expansiones más' })

    expect(screen.getByText('Mostrando 2 de 7 expansiones')).toBeInTheDocument()

    fireEvent.click(more)
    expect(paging.loadMore).toHaveBeenCalledOnce()
  })

  it('en la última tanda dice cuántas faltan, en singular si es una', () => {
    paging.remaining = 1
    openPrices()

    expect(screen.getByRole('button', { name: 'Ver 1 expansión más' })).toBeInTheDocument()
  })

  it('sin expansiones por traer no hay botón', () => {
    paging.remaining = 0
    openPrices()

    expect(screen.queryByRole('button', { name: /expansi/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument()
  })

  it('mientras trae más, el botón queda deshabilitado y dice "Cargando…"', () => {
    paging.loadingMore = true
    openPrices()

    expect(screen.getByRole('button', { name: 'Cargando…' })).toBeDisabled()
  })

  it('si falla traer más, avisa y el botón pasa a ser un reintento', () => {
    paging.moreFailed = true
    openPrices()

    expect(screen.getByText('No pude traer más expansiones.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(paging.loadMore).toHaveBeenCalledOnce()
  })

  describe('buscador por código o rareza', () => {
    const search = (text: string) => fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar por código o rareza' }), { target: { value: text } })
    const headings = () => screen.queryAllByRole('heading', { level: 4 }).map((heading) => heading.textContent)

    it('filtra por rareza y deja sólo las expansiones que tienen coincidencias', () => {
      paging.remaining = 0
      openPrices()
      search('starlight')

      expect(headings()).toEqual(['Rarity Collection 5'])
      expect(screen.queryByText('JUSH-EN016')).not.toBeInTheDocument()
    })

    it('filtra por código', () => {
      paging.remaining = 0
      openPrices()
      search('jush-en016')

      expect(headings()).toEqual(['Justice Hunters'])
      expect(screen.getAllByText('JUSH-EN016')).toHaveLength(2)
    })

    it('al borrar lo escrito vuelven todas', () => {
      paging.remaining = 0
      openPrices()
      search('ultra')
      expect(headings()).toEqual(['Justice Hunters'])

      search('')
      expect(headings()).toEqual(['Justice Hunters', 'Rarity Collection 5'])
    })

    it('si nada coincide lo dice', () => {
      paging.remaining = 0
      openPrices()
      search('zzz')

      expect(headings()).toEqual([])
      expect(screen.getByText('Ninguna impresión coincide con “zzz”.')).toBeInTheDocument()
    })

    it('al empezar a buscar trae el resto de las expansiones, una sola vez, y esconde "ver más"', () => {
      openPrices()
      expect(paging.loadAll).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Ver 3 expansiones más' })).toBeInTheDocument()

      search('u')
      search('ul')
      expect(paging.loadAll).toHaveBeenCalledTimes(1)
      expect(screen.getByText('Buscando también en las 5 expansiones restantes…')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /expansiones más/ })).not.toBeInTheDocument()
    })

    it('no dice "ninguna coincide" mientras faltan expansiones por traer', () => {
      openPrices()
      search('zzz')

      expect(screen.queryByText(/Ninguna impresión coincide/)).not.toBeInTheDocument()
    })

    it('si falla traer el resto, deja reintentar la búsqueda', () => {
      paging.moreFailed = true
      openPrices()
      search('ultra')

      expect(screen.getByText('No pude traer el resto de las expansiones.')).toBeInTheDocument()
      // Con el error no reintenta solo: espera el botón.
      expect(paging.loadAll).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
      expect(paging.loadAll).toHaveBeenCalledOnce()
    })

    it('una carta con una sola impresión no muestra el buscador', () => {
      paging.total = 1
      paging.remaining = 0
      useCardPrices.mockImplementation(() => ({ status: 'ready', updated: '2026-10-11', prices: PRICES.slice(0, 1), ...paging }))
      openPrices()

      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    })
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
