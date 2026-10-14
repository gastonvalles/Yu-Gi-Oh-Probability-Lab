import { buildGenesysCardInfo } from './app/genesys-format'
import { beginMascotActivity } from './app/mascot'
import { readCatalogPage, writeCatalogPage } from './ygoprodeck/catalog-cache'
import { requestCardInfo } from './ygoprodeck/client'
import { parseCardArts, parseSearchResponse } from './ygoprodeck/parser'
import type { ApiCardSearchResult, ApiSearchPage, CardArtOption } from './ygoprodeck/types'

export type { ApiCardSearchResult, CardArtOption } from './ygoprodeck/types'

const CARD_CATALOG_PAGE_SIZE = 1000

let cardCatalogPromise: Promise<ApiCardSearchResult[]> | null = null
let cardCatalogSnapshot: ApiCardSearchResult[] | null = null

interface SearchCardsOptions {
  query?: string
  archetype?: string
  exactType?: string
  attribute?: string
  race?: string
  level?: string
  format?: string
}

// Nombre del parámetro de la API de YGOPRODeck para cada filtro de búsqueda.
const SEARCH_PARAM_BY_OPTION: Record<keyof SearchCardsOptions, string> = {
  query: 'fname',
  archetype: 'archetype',
  exactType: 'type',
  attribute: 'attribute',
  race: 'race',
  level: 'level',
  format: 'format',
}

export async function searchCards(
  options: SearchCardsOptions,
  limit = 24,
  offset = 0,
  requestOptions: Parameters<typeof requestCardInfo>[1] = {},
): Promise<ApiSearchPage> {
  const params = new URLSearchParams({
    num: String(limit),
    offset: String(offset),
  })

  for (const [option, paramName] of Object.entries(SEARCH_PARAM_BY_OPTION)) {
    const value = options[option as keyof SearchCardsOptions]?.trim()

    if (value) {
      params.set(paramName, value)
    }
  }

  const payload = await requestCardInfo(params, requestOptions)
  return attachGenesysInfo(parseSearchResponse(payload))
}

// El catálogo completo cambia con cada set nuevo, no cada media hora: un día en el dispositivo alcanza.
const CARD_CATALOG_PERSIST_MS = 24 * 60 * 60 * 1000

export async function loadCardCatalog(): Promise<ApiCardSearchResult[]> {
  if (cardCatalogSnapshot) {
    return cardCatalogSnapshot
  }

  if (cardCatalogPromise) {
    return cardCatalogPromise
  }

  // Son ~20 MB la primera vez: Cupsy espera mientras bajan.
  const endMascotActivity = beginMascotActivity('loading')
  cardCatalogPromise = fetchCardCatalog()

  try {
    cardCatalogSnapshot = await cardCatalogPromise
    return cardCatalogSnapshot
  } finally {
    cardCatalogPromise = null
    endMascotActivity()
  }
}

// El catálogo tiene ~14 páginas de 1000: un tope evita que una API rota que siempre dice "hay más" nos tenga pidiendo para siempre.
const MAX_CARD_CATALOG_PAGES = 40

/**
 * Una página del catálogo: la copia ya procesada si es de hoy, y si no la de la API (que renueva la copia).
 * Si la API falla, la copia vencida sigue siendo mejor que nada.
 */
async function loadCatalogPage(offset: number): Promise<ApiSearchPage> {
  const stored = await readCatalogPage(offset)

  if (stored && stored.ageMs < CARD_CATALOG_PERSIST_MS) {
    return stored.page
  }

  try {
    // Sin persistForMs: lo que se guarda es la página procesada (catalog-cache), no los ~1,5 MB crudos.
    const page = await searchCards({}, CARD_CATALOG_PAGE_SIZE, offset)
    await writeCatalogPage(offset, page)
    return page
  } catch (error) {
    if (stored) {
      return stored.page
    }

    throw error
  }
}

async function fetchCardCatalog(): Promise<ApiCardSearchResult[]> {
  const cardsById = new Map<number, ApiCardSearchResult>()
  let offset = 0

  for (let pageIndex = 0; pageIndex < MAX_CARD_CATALOG_PAGES; pageIndex += 1) {
    const knownBefore = cardsById.size
    const page = await loadCatalogPage(offset)

    for (const card of page.results) {
      cardsById.set(card.ygoprodeckId, card)
    }

    // Sin cartas nuevas en la página (ids repetidos) también se corta: no hay más que traer.
    if (!page.hasMore || page.results.length === 0 || cardsById.size === knownBefore) {
      break
    }

    offset += page.results.length
  }

  return [...cardsById.values()]
}

function attachGenesysInfo(searchPage: ApiSearchPage): ApiSearchPage {
  return {
    ...searchPage,
    results: searchPage.results.map((card) => ({
      ...card,
      genesys: buildGenesysCardInfo(card.name),
    })),
  }
}

/** Cartas por id de YGOPRODeck (una sola consulta para varias). */
export async function fetchCardsByIds(
  ids: number[],
  requestOptions: Parameters<typeof requestCardInfo>[1] = {},
): Promise<ApiCardSearchResult[]> {
  if (ids.length === 0) {
    return []
  }

  const payload = await requestCardInfo(new URLSearchParams({ id: ids.join(',') }), requestOptions)
  return attachGenesysInfo(parseSearchResponse(payload)).results
}

/**
 * Los artes de una carta (el original y los alternativos). Se piden por nombre exacto: por id la API devuelve sólo el arte de ese código, y por nombre,
 * todos. Sin respuesta válida, ninguno: el selector de artes es un extra, no rompe el detalle.
 */
export async function fetchCardArts(name: string, requestOptions: Parameters<typeof requestCardInfo>[1] = {}): Promise<CardArtOption[]> {
  return parseCardArts(await requestCardInfo(new URLSearchParams({ name }), requestOptions))
}

/** Nombres de cartas por id de YGOPRODeck (una sola consulta para varias). */
export async function fetchCardNamesByIds(ids: number[]): Promise<Map<number, string>> {
  return new Map((await fetchCardsByIds(ids)).map((card) => [card.ygoprodeckId, card.name]))
}
