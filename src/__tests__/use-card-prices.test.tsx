// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useCardPrices, type CardPricesState } from '../app/use-card-prices'

// Una carta con 7 expansiones (Set 0 la más vieja, Set 6 la más nueva), cada una con una impresión.
const SETS = Array.from({ length: 7 }, (_, n) => ({ set_name: `Set ${n}`, set_code: `S${n}-EN001`, set_rarity: 'Common' }))
const INDEX = { updated: '2026-10-11', groups: SETS.map((set, n) => [100 + n, set.set_name, `S${n}`, `20${10 + n}-01-01`]) }

let urls: string[]
let failing: (url: string) => boolean

const respond = (data: unknown) => ({ ok: true, status: 200, json: async () => data })

beforeEach(() => {
  urls = []
  failing = () => false
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url)

      if (failing(url)) return { ok: false, status: 500, json: async () => ({}) }
      if (url.includes('cardinfo')) return respond({ data: [{ card_sets: SETS }] })
      if (url.endsWith('/index.json')) return respond(INDEX)

      const n = Number(url.split('/').pop()!.replace('.json', '')) - 100

      return respond({ rows: [[`S${n}-EN001`, 'Common', 'Normal', n + 1, null, 900 + n]] })
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

const setFiles = () => urls.filter((url) => /\/prices\/\d+\.json$/.test(url)).map((url) => url.split('/').pop())
const names = (state: CardPricesState) => (state.status === 'ready' ? state.prices.map((price) => price.set) : [])

function ready(state: CardPricesState) {
  if (state.status !== 'ready') throw new Error(`se esperaba ready y es ${state.status}`)
  return state
}

describe('precios de la carta, de a tres expansiones', () => {
  it('sin carta no pide nada', () => {
    const { result } = renderHook(() => useCardPrices(null))

    expect(result.current.status).toBe('idle')
    expect(urls).toEqual([])
  })

  it('trae las 3 expansiones más nuevas y no baja las demás hasta pedirlas', async () => {
    const { result } = renderHook(() => useCardPrices(9101))

    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))

    const state = ready(result.current)

    expect(names(state)).toEqual(['Set 6', 'Set 5', 'Set 4'])
    expect([state.total, state.remaining, state.loadingMore]).toEqual([7, 4, false])
    expect(setFiles()).toEqual(['106.json', '105.json', '104.json'])
  })

  it('"ver más" trae las siguientes 3 y después las que queden, sin repetir pedidos', async () => {
    const { result } = renderHook(() => useCardPrices(9102))

    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => ready(result.current).loadMore())
    expect(ready(result.current).loadingMore).toBe(true)
    await waitFor(() => expect(ready(result.current).loadingMore).toBe(false))
    expect(names(result.current)).toEqual(['Set 6', 'Set 5', 'Set 4', 'Set 3', 'Set 2', 'Set 1'])
    expect(ready(result.current).remaining).toBe(1)
    expect(setFiles()).toHaveLength(6)

    act(() => ready(result.current).loadMore())
    await waitFor(() => expect(ready(result.current).remaining).toBe(0))
    expect(names(result.current)).toHaveLength(7)
    expect(setFiles()).toHaveLength(7)

    // Sin nada que traer, pedir más no hace nada.
    const before = urls.length

    act(() => ready(result.current).loadMore())
    expect(urls).toHaveLength(before)
  })

  it('"loadAll" trae de una vez todas las que faltan', async () => {
    const { result } = renderHook(() => useCardPrices(9106))

    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => ready(result.current).loadAll())
    await waitFor(() => expect(ready(result.current).remaining).toBe(0))

    expect(names(result.current)).toEqual(['Set 6', 'Set 5', 'Set 4', 'Set 3', 'Set 2', 'Set 1', 'Set 0'])
    expect(setFiles()).toHaveLength(7)

    // Y si ya estaba trayendo, pedirlo de nuevo no duplica pedidos.
    const other = renderHook(() => useCardPrices(9107))

    await waitFor(() => expect(other.result.current.status).toBe('ready'))

    const before = urls.length

    act(() => {
      ready(other.result.current).loadAll()
      ready(other.result.current).loadAll()
    })
    await waitFor(() => expect(ready(other.result.current).remaining).toBe(0))
    expect(urls.length - before).toBe(4)
  })

  it('volver a abrir la misma carta conserva lo ya traído y no vuelve a pedir nada', async () => {
    const first = renderHook(() => useCardPrices(9103))

    await waitFor(() => expect(first.result.current.status).toBe('ready'))
    act(() => ready(first.result.current).loadMore())
    await waitFor(() => expect(ready(first.result.current).remaining).toBe(1))
    first.unmount()

    const requests = urls.length
    const second = renderHook(() => useCardPrices(9103))

    expect(second.result.current.status).toBe('ready')
    expect(names(second.result.current)).toHaveLength(6)
    expect(urls).toHaveLength(requests)
  })

  it('si falla el pedido muestra el error y reintenta al volver a abrir', async () => {
    failing = (url) => url.includes('cardinfo')

    const first = renderHook(() => useCardPrices(9104))

    await waitFor(() => expect(first.result.current.status).toBe('error'))
    first.unmount()

    failing = () => false

    const second = renderHook(() => useCardPrices(9104))

    await waitFor(() => expect(second.result.current.status).toBe('ready'))
    expect(names(second.result.current)).toHaveLength(3)
  })

  it('si falla un "ver más" avisa y deja reintentar, sin perder lo que ya estaba', async () => {
    const { result } = renderHook(() => useCardPrices(9105))

    await waitFor(() => expect(result.current.status).toBe('ready'))

    failing = (url) => url.endsWith('/103.json')
    act(() => ready(result.current).loadMore())
    await waitFor(() => expect(ready(result.current).moreFailed).toBe(true))
    expect(names(result.current)).toHaveLength(3)
    expect(ready(result.current).remaining).toBe(4)

    failing = () => false
    act(() => ready(result.current).loadMore())
    await waitFor(() => expect(ready(result.current).remaining).toBe(1))
    expect(ready(result.current).moreFailed).toBe(false)
    expect(names(result.current)).toHaveLength(6)
  })
})
