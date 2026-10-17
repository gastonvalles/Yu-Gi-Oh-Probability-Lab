import { beforeEach, describe, expect, it, vi } from 'vitest'

// El Worker importa `cloudflare:workers`, que sólo existe en Cloudflare: acá se le da una base mínima para probar la lógica de la lista de salas (`RoomIndex`) con un almacenamiento en memoria.
vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}))

import { RoomIndex } from '../../duel-relay/src/index'

const token = 'abcdefghijklmnop'
const other = 'ponmlkjihgfedcba'
const info = { host: 'Ana', match: false, siding: false, format: 'tcg', limitMin: 40 }

function makeIndex() {
  const store = new Map<string, unknown>()
  const ctx = { storage: { get: async (key: string) => store.get(key), put: async (key: string, value: unknown) => void store.set(key, JSON.parse(JSON.stringify(value))) } }
  const index = new RoomIndex(ctx as never, {} as never)
  let client = 0

  return {
    /** Un pedido a la lista, desde una dirección distinta cada vez (el ritmo por dirección no es lo que se prueba acá). */
    call: async (method: 'GET' | 'POST', path: string, body?: unknown) => {
      client += 1

      const response = await index.fetch(new Request(`https://relay.test${path}`, { method, headers: { 'CF-Connecting-IP': `10.0.0.${client}` }, body: body === undefined ? undefined : JSON.stringify(body) }))

      return { status: response.status, body: (await response.json()) as Record<string, unknown> }
    },
  }
}

describe('el Worker: la lista de salas y los duelos en vivo', () => {
  let index: ReturnType<typeof makeIndex>

  beforeEach(() => {
    index = makeIndex()
  })

  it('una sala anotada espera rival; al avisar que está en vivo pasa a `live` (aparte de `rooms`) con cuántos la miran', async () => {
    expect((await index.call('POST', '/rooms?room=K7QF2M9X', { token, info })).status).toBe(200)

    let list = (await index.call('GET', '/rooms')).body
    expect(list.rooms).toHaveLength(1)
    expect(list.live).toEqual([])

    const live = await index.call('POST', '/rooms/live?room=K7QF2M9X', { token, info, watchers: 1 })
    expect(live.status).toBe(200)
    expect(live.body).toEqual({ result: 'ok' })

    list = (await index.call('GET', '/rooms')).body
    // Un cliente de antes sólo lee `rooms`: ya no la ve (no la toma por una sala a la que entrar).
    expect(list.rooms).toEqual([])
    expect(list.live).toEqual([expect.objectContaining({ code: 'K7QF2M9X', host: 'Ana', watchers: 1 })])
    // Sin el token, y sin el nombre de nadie más.
    expect(JSON.stringify(list)).not.toContain(token)
    expect(Object.keys((list.live as object[])[0]!).sort()).toEqual(['code', 'format', 'host', 'limitMin', 'match', 'siding', 'since', 'watchers'])
  })

  it('el aviso se revisa: cuántos miran (0 a 2), un token con forma, la sala y un nombre bien formado; y con otro token no se pisa la de otro', async () => {
    await index.call('POST', '/rooms?room=K7QF2M9X', { token, info })

    for (const watchers of [3, -1, 1.5, '1', undefined]) {
      expect((await index.call('POST', '/rooms/live?room=K7QF2M9X', { token, info, watchers })).status, String(watchers)).toBe(400)
    }

    expect((await index.call('POST', '/rooms/live?room=mal', { token, info, watchers: 0 })).status).toBe(400)
    expect((await index.call('POST', '/rooms/live?room=K7QF2M9X', { token: 'corto', info, watchers: 0 })).status).toBe(400)
    expect((await index.call('POST', '/rooms/live?room=K7QF2M9X', { token, info: { ...info, format: 'otro' }, watchers: 0 })).status).toBe(400)

    const taken = await index.call('POST', '/rooms/live?room=K7QF2M9X', { token: other, info, watchers: 0 })
    expect(taken.status).toBe(409)
    expect(taken.body).toEqual({ result: 'taken' })
    expect((await index.call('GET', '/rooms')).body.live).toEqual([])
  })

  it('salir baja la sala estando en vivo o esperando, sólo con su token; y si el rival se va, vuelve a las que esperan', async () => {
    await index.call('POST', '/rooms/live?room=K7QF2M9X', { token, info, watchers: 0 })

    expect((await index.call('POST', '/rooms/close?room=K7QF2M9X', { token: other })).body).toEqual({ removed: false })
    expect((await index.call('GET', '/rooms')).body.live).toHaveLength(1)

    // El rival se fue: el anfitrión vuelve a anotarla como sala que espera.
    await index.call('POST', '/rooms?room=K7QF2M9X', { token, info })
    const back = (await index.call('GET', '/rooms')).body
    expect(back.rooms).toHaveLength(1)
    expect(back.live).toEqual([])

    await index.call('POST', '/rooms/live?room=K7QF2M9X', { token, info, watchers: 2 })
    expect((await index.call('POST', '/rooms/close?room=K7QF2M9X', { token })).body).toEqual({ removed: true })
    expect((await index.call('GET', '/rooms')).body).toEqual({ rooms: [], live: [] })
  })
})
