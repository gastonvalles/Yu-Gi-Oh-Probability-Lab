import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GENESYS_POINT_CAP, refreshStoredGenesysPoints } from '../app/genesys-format'
import type { DeckBuilderState, DeckCardInstance } from '../app/model'
import { EDISON_CARD_POOL_IDS, EDISON_FORBIDDEN_IDS, EDISON_LIMITED_IDS, EDISON_SEMI_LIMITED_IDS } from '../data/edison-format-data'
import genesysCardData from '../data/genesys-card-data.json'
import type { ApiCardReference } from '../types'

const POINTS_BY_NAME = genesysCardData.cards as Record<string, number>
// Cartas de los datos reales: una con puntos, una con cero (la mayoría) y una que no figura.
const [RATED_NAME, RATED_POINTS] = Object.entries(POINTS_BY_NAME).find(([, points]) => points > 0)!
const [ZERO_NAME] = Object.entries(POINTS_BY_NAME).find(([, points]) => points === 0)!
const UNKNOWN_NAME = 'Esta carta no existe'

const edisonCard = (ygoprodeckId: number) => ({ ygoprodeckId }) as ApiCardReference

function deckCard(name: string, points: number | null): DeckCardInstance {
  return {
    instanceId: `${name}-${points}`, name, origin: null, roles: [], needsReview: false,
    apiCard: {
      ygoprodeckId: 1, cardType: 'Effect Monster', frameType: 'effect', description: null, race: null, attribute: null, level: null, linkValue: null, atk: null, def: null,
      archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null, banlist: { tcg: null, ocg: null, goat: null }, genesys: { points },
    },
  }
}

const deck = (partial: Partial<DeckBuilderState>): DeckBuilderState => ({ deckName: 'Gatos', main: [], extra: [], side: [], isEditingDeck: false, ...partial })

const searchPayload = { data: [{ id: 1, name: RATED_NAME, type: 'Effect Monster', frameType: 'effect' }] }
const stubFetch = () => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(searchPayload), { status: 200, headers: { 'Content-Type': 'application/json' } })))
/** Una Cache API con la página 0 del catálogo ya procesada (sin los puntos de Genesys, como se guarda). */
const stubCatalogCache = () => {
  const stored = { savedAt: Date.now(), hasMore: false, results: [{ ygoprodeckId: 1, name: RATED_NAME }, { ygoprodeckId: 2, name: UNKNOWN_NAME }] }
  vi.stubGlobal('caches', { open: async () => ({ match: async () => new Response(JSON.stringify(stored)) }) })
}
/** El archivo con las tablas no se puede bajar (por ejemplo, un deploy nuevo borró el viejo). */
const breakFormatTables = () =>
  vi.doMock('../app/format-tables', () => {
    throw new Error('sin red')
  })

describe('puntos de Genesys', () => {
  it('el tope escrito en el código es el de los datos (que escribe scripts/sync-genesys-card-data.mjs)', () => {
    expect(GENESYS_POINT_CAP).toBe(genesysCardData.pointCap)
  })

  it('refreshStoredGenesysPoints completa sólo los que están en null y no toca el resto', () => {
    const unresolved = deck({
      main: [deckCard(RATED_NAME, null), deckCard(UNKNOWN_NAME, null), deckCard(RATED_NAME, 7)],
      extra: [deckCard(ZERO_NAME, null)],
      side: [deckCard(RATED_NAME, null)],
    })
    const refreshed = refreshStoredGenesysPoints(unresolved)

    expect(refreshed.main.map((card) => card.apiCard.genesys.points)).toEqual([RATED_POINTS, null, 7])
    // Un cero es un dato (la carta figura sin costo), no un faltante.
    expect(refreshed.extra[0]!.apiCard.genesys.points).toBe(0)
    expect(refreshed.side[0]!.apiCard.genesys.points).toBe(RATED_POINTS)
    expect(refreshed.main[1]).toBe(unresolved.main[1])
    expect(refreshed.main[2]).toBe(unresolved.main[2])
    expect(refreshed.deckName).toBe('Gatos')
  })

  it('devuelve el mismo deck cuando no hay nada que completar (ni un guardado ni un dibujo de más)', () => {
    const untouched = deck({ main: [deckCard(RATED_NAME, 3), deckCard(UNKNOWN_NAME, null)] })
    const empty = deck({})
    const once = refreshStoredGenesysPoints(deck({ main: [deckCard(RATED_NAME, null)] }))

    expect(refreshStoredGenesysPoints(untouched)).toBe(untouched)
    expect(refreshStoredGenesysPoints(empty)).toBe(empty)
    expect(refreshStoredGenesysPoints(once)).toBe(once)
  })
})

// Estas pruebas parten de un registro de módulos limpio: las tablas arrancan sin cargar, como en la app.
describe('las tablas de Genesys y Edison bajo demanda', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.doUnmock('../app/format-tables')
    vi.unstubAllGlobals()
  })

  it('sin cargar, leerlas no falla: ninguna carta figura. Cargadas, dan lo que dicen los datos', async () => {
    const { formatDataLoaded, loadFormatData } = await import('../app/format-data')
    const genesys = await import('../app/genesys-format')
    const edison = await import('../app/edison-format')

    expect(formatDataLoaded()).toBe(false)
    expect(genesys.buildGenesysCardInfo(RATED_NAME)).toEqual({ points: null })
    expect(genesys.isGenesysLegalCardName(RATED_NAME)).toBe(false)
    expect(genesys.calculateGenesysDeckPointTotal(deck({ main: [deckCard(RATED_NAME, null)] }))).toBe(0)
    expect(genesys.refreshStoredGenesysPoints(deck({ main: [deckCard(RATED_NAME, null)] })).main[0]!.apiCard.genesys.points).toBeNull()
    expect(edison.getEdisonCardStatus(edisonCard(EDISON_LIMITED_IDS[0]!))).toBe('unavailable')
    expect(edison.getEdisonCardCopyLimit(edisonCard(EDISON_CARD_POOL_IDS[0]!))).toBe(0)
    expect(edison.EDISON_FORMAT_LABEL).toBe('Edison')

    await loadFormatData()

    const inOtherLists = new Set([...EDISON_FORBIDDEN_IDS, ...EDISON_LIMITED_IDS, ...EDISON_SEMI_LIMITED_IDS])
    expect(formatDataLoaded()).toBe(true)
    expect(genesys.buildGenesysCardInfo(RATED_NAME)).toEqual({ points: RATED_POINTS })
    expect(genesys.isGenesysLegalCardName(UNKNOWN_NAME)).toBe(false)
    expect(genesys.refreshStoredGenesysPoints(deck({ main: [deckCard(RATED_NAME, null)] })).main[0]!.apiCard.genesys.points).toBe(RATED_POINTS)
    expect(edison.getEdisonCardStatus(edisonCard(EDISON_FORBIDDEN_IDS[0]!))).toBe('forbidden')
    expect(edison.getEdisonCardStatus(edisonCard(EDISON_LIMITED_IDS[0]!))).toBe('limited')
    expect(edison.getEdisonCardStatus(edisonCard(EDISON_SEMI_LIMITED_IDS[0]!))).toBe('semi-limited')
    expect(edison.getEdisonCardStatus(edisonCard(EDISON_CARD_POOL_IDS.find((id) => !inOtherLists.has(id))!))).toBe('unlimited')
    expect(edison.getEdisonCardStatus(edisonCard(-1))).toBe('unavailable')
  })

  it('baja una sola vez y, si falla, el próximo llamado vuelve a intentar', async () => {
    breakFormatTables()

    const { formatDataLoaded, loadFormatData } = await import('../app/format-data')

    await expect(loadFormatData()).rejects.toThrow()
    expect(formatDataLoaded()).toBe(false)

    vi.doUnmock('../app/format-tables')

    const retry = loadFormatData()
    expect(loadFormatData()).toBe(retry)
    await retry
    expect(formatDataLoaded()).toBe(true)
    expect(loadFormatData()).toBe(retry)
  })

  it('una página del catálogo leída de la copia procesada sale con sus puntos aunque las tablas no estuvieran cargadas', async () => {
    stubCatalogCache()

    const { formatDataLoaded } = await import('../app/format-data')
    const { readCatalogPage } = await import('../ygoprodeck/catalog-cache')

    expect(formatDataLoaded()).toBe(false)

    const read = await readCatalogPage(0)

    expect(read?.page.results.map((card) => card.genesys.points)).toEqual([RATED_POINTS, null])
    expect(formatDataLoaded()).toBe(true)
  })

  it('si las tablas no bajan, la copia procesada cuenta como ausente: nunca sale una página con todos los puntos en null', async () => {
    breakFormatTables()
    stubCatalogCache()

    const { readCatalogPage } = await import('../ygoprodeck/catalog-cache')

    await expect(readCatalogPage(0)).resolves.toBeNull()
  })

  it('searchCards y fetchCardsByIds ponen los puntos con las tablas que bajan en paralelo a la consulta', async () => {
    stubFetch()

    const { formatDataLoaded } = await import('../app/format-data')
    const { fetchCardsByIds, searchCards } = await import('../ygoprodeck')

    expect(formatDataLoaded()).toBe(false)
    expect((await searchCards({ query: 'ash' })).results.map((card) => card.genesys.points)).toEqual([RATED_POINTS])
    expect(formatDataLoaded()).toBe(true)
    expect((await fetchCardsByIds([1])).map((card) => card.genesys.points)).toEqual([RATED_POINTS])
  })

  it('si las tablas no bajan, la búsqueda falla en vez de devolver cartas sin puntos (que se guardarían así)', async () => {
    breakFormatTables()
    stubFetch()

    const { fetchCardsByIds, searchCards } = await import('../ygoprodeck')

    await expect(searchCards({ query: 'ash' })).rejects.toThrow()
    await expect(fetchCardsByIds([1])).rejects.toThrow()
  })
})
