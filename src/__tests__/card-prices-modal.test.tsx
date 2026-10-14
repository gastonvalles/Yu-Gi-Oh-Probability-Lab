// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CardDetailModal } from '../components/card-detail/CardDetailModal'
import type { ApiCardSearchResult } from '../ygoprodeck'

vi.mock('../components/CardArt', () => ({
  CardArt: ({ name }: { name: string }) => <img alt={name} />,
}))

const PRICES = [
  { set: 'Justice Hunters', code: 'JUSH-EN016', rarity: "Collector's Rare", edition: '1st Edition', market: 5.86, url: 'https://www.tcgplayer.com/product/1', productId: 1, expansionId: 5, variant: '' },
  { set: 'Justice Hunters', code: 'JUSH-EN016', rarity: 'Ultra Rare', edition: '1st Edition', market: 1.33, url: 'https://www.tcgplayer.com/product/2', productId: 2, expansionId: 5, variant: '' },
  { set: 'Rarity Collection 5', code: 'RA05-EN091', rarity: 'Starlight Rare', edition: '1st Edition', market: 20.12, url: 'https://www.tcgplayer.com/product/3', productId: 3, expansionId: 6, variant: '' },
]

const { useCardPrices } = vi.hoisted(() => ({ useCardPrices: vi.fn() }))

vi.mock('../app/use-card-prices', () => ({ useCardPrices }))

beforeEach(() => {
  // Como el hook real, devuelve el mismo objeto mientras no cambie nada.
  const state = { status: 'ready', updated: '2026-10-11', prices: PRICES }

  useCardPrices.mockImplementation(() => state)
})

afterEach(() => {
  cleanup()
  useCardPrices.mockReset()
  window.history.replaceState(null, '', '#')
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
    // El sobre sale de YGOPRODeck, pero por nuestro proxy.
    expect(headings[0]!.closest('header')!.style.backgroundImage).toContain('/api/card-image/sets/JUSH.jpg')
    expect(headings[1]!.closest('header')!.style.backgroundImage).toContain('/api/card-image/sets/RA05.jpg')
  })

  it('muestra todas las expansiones juntas, sin botones de "ver más"', () => {
    openPrices()

    expect(screen.queryByRole('button', { name: /expansi/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument()
  })

  it('tocar una impresión lleva a la vista de Expansiones con esa carta (por el hash) y cierra el detalle; de ahí se va a TCGplayer', () => {
    const onClose = openPrices()

    // Ya no hay links a TCGplayer acá: cada impresión es un botón.
    expect(screen.queryAllByRole('link')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: /Starlight Rare · 1st Edition/ }))

    expect(window.location.hash).toBe('#expansions?set=6&print=3')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', { name: card.name })).not.toBeInTheDocument()
  })

  it('cada impresión avisa en su título adónde lleva', () => {
    openPrices()

    for (const row of screen.getAllByRole('button', { name: /1st Edition/ })) {
      expect(row).toHaveAttribute('title', 'Ver esta carta en Expansiones')
    }
  })

  describe('buscador por código o rareza', () => {
    const search = (text: string) => fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar por código, rareza o arte' }), { target: { value: text } })
    const headings = () => screen.queryAllByRole('heading', { level: 4 }).map((heading) => heading.textContent)

    it('filtra por rareza y deja sólo las expansiones que tienen coincidencias', () => {
      openPrices()
      search('starlight')

      expect(headings()).toEqual(['Rarity Collection 5'])
      expect(screen.queryByText('JUSH-EN016')).not.toBeInTheDocument()
    })

    it('filtra por código', () => {
      openPrices()
      search('jush-en016')

      expect(headings()).toEqual(['Justice Hunters'])
      expect(screen.getAllByText('JUSH-EN016')).toHaveLength(2)
    })

    it('al borrar lo escrito vuelven todas', () => {
      openPrices()
      search('ultra')
      expect(headings()).toEqual(['Justice Hunters'])

      search('')
      expect(headings()).toEqual(['Justice Hunters', 'Rarity Collection 5'])
    })

    it('si nada coincide lo dice', () => {
      openPrices()
      search('zzz')

      expect(headings()).toEqual([])
      expect(screen.getByText('Ninguna impresión coincide con “zzz”.')).toBeInTheDocument()
    })

    it('una carta con una sola impresión no muestra el buscador', () => {
      const state = { status: 'ready', updated: '2026-10-11', prices: PRICES.slice(0, 1) }

      useCardPrices.mockImplementation(() => state)
      openPrices()

      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    })
  })

  it('una carta sin precios lo dice', () => {
    const state = { status: 'ready', updated: '2026-10-11', prices: [] }

    useCardPrices.mockImplementation(() => state)
    openPrices()

    expect(screen.getByText('No hay precios de TCGplayer para esta carta.')).toBeInTheDocument()
  })

  it('los precios de la carta se piden al abrir su detalle (un solo archivo, que también trae los escaneos de sus impresiones para el selector de artes) y se muestran al tocar el botón', () => {
    render(<CardDetailModal card={card} deckFormat="unlimited" isOpen onAddToZone={() => false} onClose={vi.fn()} />)

    expect(useCardPrices).toHaveBeenCalledWith(card.ygoprodeckId)
    expect(screen.queryByRole('dialog', { name: 'Mulcharmy Purulia' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ver precios en TCGplayer' }))

    expect(screen.getByRole('dialog', { name: 'Mulcharmy Purulia' })).toBeInTheDocument()
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
