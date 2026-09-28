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

export async function searchCards(
  options: SearchCardsOptions,
  limit = 24,
  offset = 0,
): Promise<ApiSearchPage> {
  const params = new URLSearchParams({
    num: String(limit),
    offset: String(offset),
  })

  const trimmedQuery = options.query?.trim() ?? ''
  const trimmedArchetype = options.archetype?.trim() ?? ''
  const trimmedExactType = options.exactType?.trim() ?? ''
  const trimmedAttribute = options.attribute?.trim() ?? ''
  const trimmedRace = options.race?.trim() ?? ''
  const trimmedLevel = options.level?.trim() ?? ''
  const trimmedFormat = options.format?.trim() ?? ''

  if (trimmedQuery.length > 0) {
    params.set('fname', trimmedQuery)
  }

  if (trimmedArchetype.length > 0) {
    params.set('archetype', trimmedArchetype)
  }

  if (trimmedExactType.length > 0) {
    params.set('type', trimmedExactType)
  }

  if (trimmedAttribute.length > 0) {
    params.set('attribute', trimmedAttribute)
  }

  if (trimmedRace.length > 0) {
    params.set('race', trimmedRace)
  }

  if (trimmedLevel.length > 0) {
    params.set('level', trimmedLevel)
  }

  if (trimmedFormat.length > 0) {
    params.set('format', trimmedFormat)
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
