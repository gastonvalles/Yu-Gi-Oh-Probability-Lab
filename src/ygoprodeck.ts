import { buildGenesysCardInfo } from './app/genesys-format'
import { requestCardInfo } from './ygoprodeck/client'
import { parseSearchResponse } from './ygoprodeck/parser'
import type { ApiCardSearchResult, ApiSearchPage } from './ygoprodeck/types'

export type { ApiCardSearchResult, ApiSearchPage } from './ygoprodeck/types'

const CARD_CATALOG_PAGE_SIZE = 1000

let cardCatalogPromise: Promise<ApiCardSearchResult[]> | null = null
let cardCatalogSnapshot: ApiCardSearchResult[] | null = null

export interface SearchCardsOptions {
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

  const payload = await requestCardInfo(params)
  return attachGenesysInfo(parseSearchResponse(payload))
}

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

async function fetchCardCatalog(): Promise<ApiCardSearchResult[]> {
  const cardsById = new Map<number, ApiCardSearchResult>()
  let offset = 0

  while (true) {
    const page = await searchCards({}, CARD_CATALOG_PAGE_SIZE, offset)

    for (const card of page.results) {
      cardsById.set(card.ygoprodeckId, card)
    }

    if (!page.hasMore || page.results.length === 0) {
      return [...cardsById.values()]
    }

    offset += page.results.length
  }
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
