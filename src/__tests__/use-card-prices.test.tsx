// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useCardPrices } from '../app/use-card-prices'

const INDEX = { updated: '2026-10-11', shards: 4, groups: [[1, 'Set uno', '2020-01-01'], [2, 'Set dos', '2024-01-01']] }

let urls: string[]
let failing: boolean

beforeEach(() => {
  urls = []
  failing = false
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url)

      if (failing) return { ok: false, status: 500, json: async () => ({}) }

      const data = url.endsWith('/index.json') ? INDEX : { '9101': [['A-EN001', 'Common', 'Normal', 1, 11, 1], ['B-EN001', 'Rare', 'Normal', 2, 12, 2]] }

      return { ok: true, status: 200, json: async () => data }
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('precios de la carta', () => {
  it('sin carta no pide nada', () => {
    const { result } = renderHook(() => useCardPrices(null))

    expect(result.current.status).toBe('idle')
    expect(urls).toEqual([])
  })

  it('carga una vez: el índice y el archivo de la carta, con todas sus impresiones', async () => {
    const { result } = renderHook(() => useCardPrices(9101))

    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))

    if (result.current.status !== 'ready') throw new Error('se esperaba ready')

    expect(result.current.prices.map((price) => price.set)).toEqual(['Set dos', 'Set uno'])
    expect(result.current.updated).toBe('2026-10-11')
    expect(urls).toHaveLength(2)
  })

  it('volver a abrir la misma carta no vuelve a pedir nada', async () => {
    const first = renderHook(() => useCardPrices(9101))

    await waitFor(() => expect(first.result.current.status).toBe('ready'))
    first.unmount()

    const requests = urls.length
    const second = renderHook(() => useCardPrices(9101))

    expect(second.result.current.status).toBe('ready')
    expect(urls).toHaveLength(requests)
  })

  it('si el pedido falla muestra el error', async () => {
    failing = true

    const { result } = renderHook(() => useCardPrices(9102))

    await waitFor(() => expect(result.current.status).toBe('error'))
  })
})
