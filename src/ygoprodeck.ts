import { buildGenesysCardInfo } from './app/genesys-format'
import { requestCardInfo } from './ygoprodeck/client'
import { parseSearchResponse } from './ygoprodeck/parser'
import type { ApiCardSearchResult, ApiSearchPage } from './ygoprodeck/types'

export type { ApiCardSearchResult } from './ygoprodeck/types'

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

  cardCatalogPromise = fetchCardCatalog()

  try {
    cardCatalogSnapshot = await cardCatalogPromise
    return cardCatalogSnapshot
  } finally {
    cardCatalogPromise = null
  }
}

// El catálogo tiene ~14 páginas de 1000: un tope evita que una API rota que siempre dice "hay más" nos tenga pidiendo para siempre.
const MAX_CARD_CATALOG_PAGES = 40

async function fetchCardCatalog(): Promise<ApiCardSearchResult[]> {
  const cardsById = new Map<number, ApiCardSearchResult>()
  let offset = 0

  for (let pageIndex = 0; pageIndex < MAX_CARD_CATALOG_PAGES; pageIndex += 1) {
    const knownBefore = cardsById.size
    const page = await searchCards({}, CARD_CATALOG_PAGE_SIZE, offset, { persistForMs: CARD_CATALOG_PERSIST_MS })

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

/** Nombres de cartas por id de YGOPRODeck (una sola consulta para varias). */
export async function fetchCardNamesByIds(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) {
    return new Map()
  }

  const payload = await requestCardInfo(new URLSearchParams({ id: ids.join(',') }))
  return new Map(parseSearchResponse(payload).results.map((card) => [card.ygoprodeckId, card.name]))
}
