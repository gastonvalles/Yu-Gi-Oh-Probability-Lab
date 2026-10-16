import { describe, expect, it, vi } from 'vitest'

import { createRoomsApi, httpUrlOf, parsePublicRooms } from '../app/duel-rooms'

const room = { code: 'K7QF2M9X', host: 'Ana', match: true, siding: false, format: 'tcg', limitMin: 40, createdAt: 1000 }
const info = { host: 'Ana', match: true, siding: false, format: 'tcg', limitMin: 40 }
const token = 'abcdefghijklmnop'

describe('las salas públicas desde la página', () => {
  it('la dirección web del relay sale de la de los WebSockets', () => {
    expect(httpUrlOf('wss://relay.example.workers.dev')).toBe('https://relay.example.workers.dev')
    expect(httpUrlOf('ws://127.0.0.1:8788/')).toBe('http://127.0.0.1:8788')
  })

  it('de lo que contesta el relay sólo se muestra lo bien formado', () => {
    expect(parsePublicRooms({ rooms: [room, { ...room, code: 'mal' }, { ...room, format: 'x' }, { ...room, host: '' }, { ...room, createdAt: 'ayer' }, null, 'x'] })).toEqual([room])
    expect(parsePublicRooms(null)).toEqual([])
    expect(parsePublicRooms({ rooms: 'no' })).toEqual([])
    // Un nombre con caracteres de control o larguísimo llega limpio.
    expect(parsePublicRooms({ rooms: [{ ...room, host: `  ${'x'.repeat(80)}\u0000 ` }] })[0]?.host).toHaveLength(40)
  })

  it('pide la lista, anota la sala con su token y la baja; si el relay falla, la lista queda vacía', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.endsWith('/rooms') && !init) return new Response(JSON.stringify({ rooms: [room] }))
      return new Response(JSON.stringify({ result: 'ok' }), { status: 200 })
    })
    const api = createRoomsApi('wss://relay.test', fetchMock as unknown as typeof fetch)

    await expect(api.list()).resolves.toEqual([room])
    await expect(api.register('K7QF2M9X', info, token)).resolves.toBe(true)
    api.unlist('K7QF2M9X', token)

    const calls = fetchMock.mock.calls.map(([url, init]) => [String(url), init?.method, init?.body])
    expect(calls[1]).toEqual(['https://relay.test/rooms?room=K7QF2M9X', 'POST', JSON.stringify({ token, info })])
    expect(calls[2]).toEqual(['https://relay.test/rooms/close?room=K7QF2M9X', 'POST', JSON.stringify({ token })])

    const down = createRoomsApi('wss://relay.test', (async () => {
      throw new Error('sin red')
    }) as unknown as typeof fetch)
    await expect(down.list()).resolves.toEqual([])
    await expect(down.register('K7QF2M9X', info, token)).resolves.toBe(false)
    expect(() => down.unlist('K7QF2M9X', token)).not.toThrow()
  })
})
