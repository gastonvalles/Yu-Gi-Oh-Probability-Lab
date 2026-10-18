import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import genesysCardData from '../data/genesys-card-data.json'
import { POOL_BITS } from '../ygoprodeck/release'
import type { ApiCardSearchResult } from '../ygoprodeck/types'

const CATALOG_CACHE = 'ygoprodeck-catalog-v2'
// La copia de la versión anterior (sin escala, año ni formatos): no se lee y se borra al guardar la primera página.
const OLD_CATALOG_CACHE = 'ygoprodeck-catalog-v1'
const RAW_CACHE = 'ygoprodeck-cardinfo-v1'
const PAGE_URL = (offset: number) => `https://db.ygoprodeck.com/__catalog/v1?offset=${offset}`
const RAW_CATALOG_URL = (offset: number) => `https://db.ygoprodeck.com/api/v7/cardinfo.php?num=1000&offset=${offset}`
const RAW_CARD_URL = 'https://db.ygoprodeck.com/api/v7/cardinfo.php?id=14558127'
const DAY_MS = 24 * 60 * 60 * 1000

/** Una Cache API mínima en memoria: nombre de la caché -> (url -> cuerpo). */
function stubCaches(failPut = false) {
  const stores = new Map<string, Map<string, string>>()

  vi.stubGlobal('caches', {
    open: async (name: string) => {
      const store = stores.get(name) ?? new Map<string, string>()
      stores.set(name, store)

      return {
        match: async (url: string) => (store.has(url) ? new Response(store.get(url)) : undefined),
        put: async (url: string, response: Response) => {
          if (failPut) {
            throw new DOMException('Quota exceeded', 'QuotaExceededError')
          }

          store.set(url, await response.text())
        },
        keys: async () => [...store.keys()].map((url) => new Request(url)),
        delete: async (request: Request) => store.delete(request.url),
      }
    },
    delete: async (name: string) => stores.delete(name),
  })

  return stores
}

// Una carta con puntos de Genesys en los datos reales: sirve para ver que se calculan al leer.
const [RATED_NAME, RATED_POINTS] = Object.entries(genesysCardData.cards as Record<string, number>).find(([, points]) => points > 0)!

function card(id: number, name: string): ApiCardSearchResult {
  return {
    ygoprodeckId: id, name, cardType: 'Effect Monster', frameType: 'effect', description: `Texto de ${name}`, race: 'Zombie', attribute: 'FIRE',
    level: 3, linkValue: null, atk: '0', def: '1800', archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null,
    banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: 999 },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// El estado de módulo (una sola limpieza de crudas por sesión, el catálogo en memoria) arranca limpio en cada prueba.
beforeEach(() => {
  vi.resetModules()
})

describe('catalog-cache', () => {
  it('guarda la página sin los puntos de Genesys y los calcula al leerla', async () => {
    const stores = stubCaches()
    const { readCatalogPage, writeCatalogPage } = await import('../ygoprodeck/catalog-cache')

    await writeCatalogPage(1000, { results: [card(1, RATED_NAME), card(2, 'Carta sin puntos')], hasMore: true })

    const stored = JSON.parse(stores.get(CATALOG_CACHE)!.get(PAGE_URL(1000))!) as { results: Array<Record<string, unknown>> }
    expect(stored.results.every((entry) => !('genesys' in entry))).toBe(true)

    const read = await readCatalogPage(1000)
    expect(read?.page.hasMore).toBe(true)
    expect(read?.page.results.map((entry) => [entry.name, entry.genesys.points])).toEqual([[RATED_NAME, RATED_POINTS], ['Carta sin puntos', null]])
    expect(read?.page.results[0]).toEqual({ ...card(1, RATED_NAME), genesys: { points: RATED_POINTS } })
    // Las claves quedan en el orden del parser (genesys al final), como en una página recién bajada.
    expect(Object.keys(read!.page.results[0]!)).toEqual(Object.keys(card(1, RATED_NAME)))
  })

  it('devuelve la edad de lo guardado, y una hora del futuro cuenta como vencida', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    stubCaches()
    const { readCatalogPage, writeCatalogPage } = await import('../ygoprodeck/catalog-cache')

    vi.setSystemTime(new Date('2026-10-01T10:00:00Z'))
    await writeCatalogPage(0, { results: [card(1, 'Una')], hasMore: false })

    vi.setSystemTime(new Date('2026-10-01T10:00:00Z').getTime() + DAY_MS + 5)
    expect((await readCatalogPage(0))?.ageMs).toBe(DAY_MS + 5)

    vi.setSystemTime(new Date('2026-09-01T10:00:00Z'))
    expect((await readCatalogPage(0))?.ageMs).toBe(Number.POSITIVE_INFINITY)
  })

  it('no hay página, o no sirve: null en vez de romper', async () => {
    const stores = stubCaches()
    const { readCatalogPage } = await import('../ygoprodeck/catalog-cache')
    const good = card(1, 'Una')
    const stored = stores.set(CATALOG_CACHE, new Map()).get(CATALOG_CACHE)!

    expect(await readCatalogPage(0)).toBeNull()

    const corrupt: Record<string, string> = {
      'no es JSON': '{"savedAt": 1, "hasMore": tr',
      'JSON null': 'null',
      'un número': '7',
      'sin savedAt': JSON.stringify({ hasMore: false, results: [good] }),
      'savedAt como texto': JSON.stringify({ savedAt: 'ayer', hasMore: false, results: [good] }),
      'hasMore como texto': JSON.stringify({ savedAt: Date.now(), hasMore: 'no', results: [good] }),
      'results que no es lista': JSON.stringify({ savedAt: Date.now(), hasMore: false, results: { 0: good } }),
      'una carta nula': JSON.stringify({ savedAt: Date.now(), hasMore: false, results: [good, null] }),
      'una carta sin nombre': JSON.stringify({ savedAt: Date.now(), hasMore: false, results: [good, { ...good, name: 5 }] }),
      'una carta sin id': JSON.stringify({ savedAt: Date.now(), hasMore: false, results: [{ ...good, ygoprodeckId: '1' }] }),
    }

    for (const [label, body] of Object.entries(corrupt)) {
      stored.set(PAGE_URL(0), body)
      expect(await readCatalogPage(0), label).toBeNull()
    }
  })

  it('sin Cache API (o si abrirla o guardar falla) no rompe nada', async () => {
    const { readCatalogPage, writeCatalogPage } = await import('../ygoprodeck/catalog-cache')
    const page = { results: [card(1, 'Una')], hasMore: false }

    vi.stubGlobal('caches', undefined)
    await expect(writeCatalogPage(0, page)).resolves.toBeUndefined()
    await expect(readCatalogPage(0)).resolves.toBeNull()

    vi.stubGlobal('caches', { open: async () => { throw new DOMException('Denegado', 'SecurityError') } })
    await expect(writeCatalogPage(0, page)).resolves.toBeUndefined()
    await expect(readCatalogPage(0)).resolves.toBeNull()

    stubCaches(true)
    await expect(writeCatalogPage(0, page)).resolves.toBeUndefined()
    await expect(readCatalogPage(0)).resolves.toBeNull()
  })

  it('al guardar la primera página borra las crudas del catálogo y deja las fichas sueltas', async () => {
    const stores = stubCaches()
    stores.set(RAW_CACHE, new Map([[RAW_CATALOG_URL(0), '{}'], [RAW_CATALOG_URL(1000), '{}'], [RAW_CARD_URL, '{}']]))
    const { writeCatalogPage } = await import('../ygoprodeck/catalog-cache')

    await writeCatalogPage(0, { results: [card(1, 'Una')], hasMore: true })

    await vi.waitFor(() => expect([...stores.get(RAW_CACHE)!.keys()]).toEqual([RAW_CARD_URL]))
    expect([...stores.get(CATALOG_CACHE)!.keys()]).toEqual([PAGE_URL(0)])
  })

  it('la copia procesada de la versión anterior no se lee y se borra al guardar la primera página nueva', async () => {
    const stores = stubCaches()
    stores.set(OLD_CATALOG_CACHE, new Map([[PAGE_URL(0), JSON.stringify({ savedAt: Date.now(), hasMore: false, results: [card(9, 'Vieja')] })]]))
    const { readCatalogPage, writeCatalogPage } = await import('../ygoprodeck/catalog-cache')

    expect(await readCatalogPage(0)).toBeNull()

    await writeCatalogPage(0, { results: [card(1, 'Una')], hasMore: true })

    await vi.waitFor(() => expect(stores.has(OLD_CATALOG_CACHE)).toBe(false))
    expect(stores.has(CATALOG_CACHE)).toBe(true)
  })

  it('si no pudo guardar la procesada, las crudas quedan (siguen sirviendo sin red)', async () => {
    const stores = stubCaches(true)
    stores.set(RAW_CACHE, new Map([[RAW_CATALOG_URL(0), '{}']]))
    const { writeCatalogPage } = await import('../ygoprodeck/catalog-cache')

    await writeCatalogPage(0, { results: [card(1, 'Una')], hasMore: true })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect([...stores.get(RAW_CACHE)!.keys()]).toEqual([RAW_CATALOG_URL(0)])
  })
})

describe('loadCardCatalog con la copia procesada', () => {
  const rawCard = (id: number, name: string) => ({
    id, name, type: 'Effect Monster', frameType: 'effect', desc: `Texto de ${name}`, race: 'Zombie', attribute: 'FIRE', level: 3, atk: 0, def: 1800,
    card_images: [{ id, image_url: `https://images.ygoprodeck.com/images/cards/${id}.jpg`, image_url_small: `https://images.ygoprodeck.com/images/cards_small/${id}.jpg` }],
    // Sólo la primera trae escala y los datos de `misc=yes`: las demás, como una respuesta que no los pidió.
    ...(id === 1 ? { scale: 4, misc_info: [{ tcg_date: '2002-03-08', ocg_date: '2001-12-01', formats: ['TCG', 'OCG', 'Edison'] }] } : {}),
  })
  const PAGES: Record<number, unknown> = {
    0: { data: [rawCard(1, RATED_NAME), rawCard(2, 'Ash Blossom & Joyous Spring')], meta: { rows_remaining: 1 } },
    2: { data: [rawCard(3, 'Nibiru, the Primal Being')], meta: { rows_remaining: 0 } },
  }

  function mockApi() {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const body = PAGES[Number(new URL(String(input)).searchParams.get('offset'))]
      return new Response(JSON.stringify(body), { status: body ? 200 : 404, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  const load = async () => (await import('../ygoprodeck')).loadCardCatalog()

  it('la primera vez baja las páginas y las guarda procesadas; la segunda sale de la copia, sin red y con lo mismo', async () => {
    const stores = stubCaches()
    stores.set(RAW_CACHE, new Map([[RAW_CATALOG_URL(0), '{}'], [RAW_CARD_URL, '{}']]))
    const fetchMock = mockApi()

    const first = await load()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(first.map((entry) => entry.ygoprodeckId)).toEqual([1, 2, 3])
    expect(first[0]!.genesys.points).toBe(RATED_POINTS)
    // El catálogo se pide con `misc=yes` (año y formatos) y la escala, el año y los formatos de una carta quedan en la copia; sin esos datos, la carta no lleva los campos.
    expect(fetchMock.mock.calls.every(([url]) => new URL(String(url)).searchParams.get('misc') === 'yes')).toBe(true)
    expect(first[0]).toMatchObject({ scale: 4, year: 2001, pools: POOL_BITS.tcg | POOL_BITS.ocg })
    expect(first[1]).not.toHaveProperty('year')
    expect(first[1]).not.toHaveProperty('scale')
    expect([...stores.get(CATALOG_CACHE)!.keys()]).toEqual([PAGE_URL(0), PAGE_URL(2)])
    await vi.waitFor(() => expect([...stores.get(RAW_CACHE)!.keys()]).toEqual([RAW_CARD_URL]))

    vi.resetModules()
    fetchMock.mockClear()
    const second = await load()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(second).toEqual(first)
    expect(second.map((entry) => Object.keys(entry))).toEqual(first.map((entry) => Object.keys(entry)))
  })

  it('una copia vencida se renueva, y si la API no responde sirve la vencida', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-01T10:00:00Z'))
    const stores = stubCaches()
    const fetchMock = mockApi()
    const first = await load()

    vi.setSystemTime(new Date('2026-10-02T10:00:01Z'))
    vi.resetModules()
    fetchMock.mockClear()
    expect(await load()).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(stores.get(CATALOG_CACHE)!.get(PAGE_URL(0))!)).toMatchObject({ savedAt: Date.now() })

    vi.setSystemTime(new Date('2026-10-04T10:00:00Z'))
    vi.resetModules()
    fetchMock.mockClear()
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await load()).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('una copia corrupta se ignora y se vuelve a pedir; sin copia y sin red, falla como antes', async () => {
    const stores = stubCaches()
    stores.set(CATALOG_CACHE, new Map([[PAGE_URL(0), '{"savedAt": 1']]))
    const fetchMock = mockApi()

    expect(await load()).toHaveLength(3)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    stores.get(CATALOG_CACHE)!.set(PAGE_URL(0), 'null')
    vi.resetModules()
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(load()).rejects.toThrow('No se pudo conectar con YGOPRODeck')
  })

  it('sin Cache API carga igual', async () => {
    vi.stubGlobal('caches', undefined)
    const fetchMock = mockApi()

    expect(await load()).toHaveLength(3)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
