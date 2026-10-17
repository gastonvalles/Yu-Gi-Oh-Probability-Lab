import { describe, expect, it, vi } from 'vitest'

import { createRoomsApi, httpUrlOf, parseLiveDuels, parsePublicRooms } from '../app/duel-rooms'

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

describe('los duelos en vivo desde la página', () => {
  const live = { code: 'M3QX7K2P', host: 'Beto', match: false, siding: false, format: 'tcg', limitMin: 40, watchers: 1, since: 5000 }

  it('de lo que contesta el relay sólo se muestran los duelos en vivo bien formados (cuántos miran, hasta dos)', () => {
    expect(parseLiveDuels({ rooms: [], live: [live, { ...live, code: 'mal' }, { ...live, watchers: 3 }, { ...live, watchers: '1' }, { ...live, since: 'ayer' }, { ...live, host: '' }, null, 'x'] })).toEqual([live])
    expect(parseLiveDuels({ rooms: [] })).toEqual([])
    expect(parseLiveDuels({ live: 'no' })).toEqual([])
    expect(parseLiveDuels(null)).toEqual([])
  })

  it('el rival de un duelo en vivo se lee con su nombre limpio (y sin él, el duelo se muestra igual)', () => {
    expect(parseLiveDuels({ live: [{ ...live, guest: '  Ana\u0000  María ' }] })).toEqual([{ ...live, guest: 'Ana María' }])
    expect(parseLiveDuels({ live: [{ ...live, guest: 7 }] })).toEqual([live])
    expect(parseLiveDuels({ live: [live] })[0]).not.toHaveProperty('guest')
  })

  it('pide las dos listas de una vez; con un relay de antes (sin `live`) no hay duelos en vivo que mostrar', async () => {
    const news = createRoomsApi('wss://relay.test', (async () => new Response(JSON.stringify({ rooms: [room], live: [live] }))) as unknown as typeof fetch)

    await expect(news.overview()).resolves.toEqual({ rooms: [room], live: [live] })
    await expect(news.list()).resolves.toEqual([room])

    const old = createRoomsApi('wss://relay.test', (async () => new Response(JSON.stringify({ rooms: [room] }))) as unknown as typeof fetch)

    await expect(old.overview()).resolves.toEqual({ rooms: [room], live: [] })

    const down = createRoomsApi('wss://relay.test', (async () => {
      throw new Error('sin red')
    }) as unknown as typeof fetch)

    await expect(down.overview()).resolves.toEqual({ rooms: [], live: [] })
  })

  it('avisa el duelo en vivo con su token y cuántos lo miran; sólo cuenta si el relay lo registró de verdad (uno de antes contesta 200 a lo que no conoce)', async () => {
    const calls: Array<[string, string | undefined]> = []
    const registers = createRoomsApi('wss://relay.test', (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([String(input), init?.body as string | undefined])

      return new Response(JSON.stringify({ result: 'ok' }), { status: 200 })
    }) as unknown as typeof fetch)

    await expect(registers.live('K7QF2M9X', info, 2, token)).resolves.toBe(true)
    expect(calls[0]).toEqual(['https://relay.test/rooms/live?room=K7QF2M9X', JSON.stringify({ token, info, watchers: 2 })])
    // Con el nombre de quien juega contra el anfitrión.
    await expect(registers.live('K7QF2M9X', info, 2, token, 'Ana')).resolves.toBe(true)
    expect(calls[1]).toEqual(['https://relay.test/rooms/live?room=K7QF2M9X', JSON.stringify({ token, info, watchers: 2, guest: 'Ana' })])

    const full = createRoomsApi('wss://relay.test', (async () => new Response(JSON.stringify({ result: 'full' }), { status: 409 })) as unknown as typeof fetch)
    const old = createRoomsApi('wss://relay.test', (async () => new Response('ygo-lab duel relay', { status: 200 })) as unknown as typeof fetch)
    const down = createRoomsApi('wss://relay.test', (async () => {
      throw new Error('sin red')
    }) as unknown as typeof fetch)

    await expect(full.live('K7QF2M9X', info, 0, token)).resolves.toBe(false)
    await expect(old.live('K7QF2M9X', info, 0, token)).resolves.toBe(false)
    await expect(down.live('K7QF2M9X', info, 0, token)).resolves.toBe(false)
  })
})
