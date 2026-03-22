import { buildGenesysCardInfo } from './app/genesys-format'
import { requestCardInfo } from './ygoprodeck/client'
import { parseSearchResponse, readApiErrorMessage } from './ygoprodeck/parser'
import type { ApiCardSearchResult, ApiSearchPage } from './ygoprodeck/types'

export type { ApiCardSearchResult, ApiSearchPage } from './ygoprodeck/types'

export async function searchCardsByName(
  query: string,
  limit = 24,
  offset = 0,
): Promise<ApiSearchPage> {
  const params = new URLSearchParams({
    fname: query,
    num: String(limit),
    offset: String(offset),
  })

  const payload = await requestCardInfo(params)
  return attachGenesysInfo(parseSearchResponse(payload))
}

export async function fetchCardsByIds(ids: number[]): Promise<ApiCardSearchResult[]> {
  if (ids.length === 0) {
    return []
  }

  const params = new URLSearchParams({
    id: ids.join(','),
  })

  const payload = await requestCardInfo(params)
  const parsedResponse = attachGenesysInfo(parseSearchResponse(payload))
  const cardsById = new Map(parsedResponse.results.map((card) => [card.ygoprodeckId, card]))

  return ids.flatMap((id) => {
    const card = cardsById.get(id)
    return card ? [card] : []
  })
}

export async function fetchCardByExactName(name: string): Promise<ApiCardSearchResult | null> {
  const trimmedName = name.trim()

  if (trimmedName.length === 0) {
    return null
  }

  const params = new URLSearchParams({
    name: trimmedName,
  })

  try {
    const payload = await requestCardInfo(params)
    const parsedResponse = attachGenesysInfo(parseSearchResponse(payload))
    return parsedResponse.results[0] ?? null
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('no card matching your query')) {
      return null
    }

    throw error
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
