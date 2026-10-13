// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useCardArts } from '../app/use-card-arts'
import { parseCardArts } from '../ygoprodeck/parser'

const image = (id: number) => ({
  id,
  image_url: `https://images.ygoprodeck.com/images/cards/${id}.jpg`,
  image_url_small: `https://images.ygoprodeck.com/images/cards_small/${id}.jpg`,
})

describe('los artes de una carta (parser)', () => {
  it('lee todos los artes, el original y los alternativos', () => {
    const arts = parseCardArts({ data: [{ id: 89631139, card_images: [image(89631139), image(89631140), image(89631141)] }] })

    expect(arts.map((art) => art.id)).toEqual([89631139, 89631140, 89631141])
    expect(arts[1]).toEqual({
      id: 89631140,
      imageUrl: 'https://images.ygoprodeck.com/images/cards/89631140.jpg',
      imageUrlSmall: 'https://images.ygoprodeck.com/images/cards_small/89631140.jpg',
    })
  })

  it('descarta lo que no es una imagen de YGOPRODeck y no se rompe con lo que no esperaba', () => {
    const outsider = { id: 2, image_url: 'https://example.com/a.jpg', image_url_small: 'https://example.com/b.jpg' }

    expect(parseCardArts({ data: [{ card_images: [image(1), outsider, { id: 'x' }, null, 7] }] }).map((art) => art.id)).toEqual([1])
    expect(parseCardArts(null)).toEqual([])
    expect(parseCardArts({ error: 'no hay' })).toEqual([])
    expect(parseCardArts({ data: [] })).toEqual([])
    expect(parseCardArts({ data: [{ card_images: 'nada' }] })).toEqual([])
  })
})

describe('useCardArts', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sin carta no pide nada, y con una trae sus artes (una sola vez por carta)', async () => {
    const fetchMock = vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => ({ data: [{ card_images: [image(555001), image(555002)] }] }) }))

    vi.stubGlobal('fetch', fetchMock)

    expect(renderHook(() => useCardArts(null, '')).result.current).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()

    const { result, rerender } = renderHook(() => useCardArts(555001, 'Blue-Eyes Test'))

    expect(result.current).toEqual([])
    await waitFor(() => expect(result.current.map((art) => art.id)).toEqual([555001, 555002]))
    expect(fetchMock.mock.calls[0]![0]).toContain('name=Blue-Eyes+Test')

    rerender()
    renderHook(() => useCardArts(555001, 'Blue-Eyes Test'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('si el pedido falla, no hay artes alternativos y nada se rompe', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('sin red'))))

    const { result } = renderHook(() => useCardArts(555003, 'Otra Carta'))

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(result.current).toEqual([])
  })
})
