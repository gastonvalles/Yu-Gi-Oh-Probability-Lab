import type { ApiCardReference, DeckFormat } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'
import { SEARCH_MIN_QUERY_LENGTH } from './model'
import { getCardCopyLimit } from './deck-format'
import { normalizeName } from './utils'

export type SearchQuickTypeFilter = 'all' | 'monster' | 'spell' | 'trap' | 'extra'

export interface CardSearchFilters {
  quickType: SearchQuickTypeFilter
  archetype: string
  exactType: string
  attribute: string
  race: string
  level: string
  description: string
  legalOnly: boolean
}

export interface CardSearchRequest {
  query: string
  archetype: string
  exactType: string
  attribute: string
  race: string
  level: string
}

export const DEFAULT_CARD_SEARCH_FILTERS: CardSearchFilters = {
  quickType: 'all',
  archetype: '',
  exactType: '',
  attribute: '',
  race: '',
  level: '',
  description: '',
  legalOnly: false,
}

export function buildCompactSearchDescription(card: ApiCardReference | ApiCardSearchResult): string {
  const typeLabel = typeof card.cardType === 'string' && card.cardType.trim().length > 0 ? card.cardType : 'Carta'
  return [typeLabel, card.archetype ? `Arquetipo: ${card.archetype}` : ''].filter(Boolean).join(' · ')
}

export function formatSearchError(message: string): string {
  const normalizedMessage = message.toLowerCase()

  if (normalizedMessage.includes('no card matching your query')) {
    return 'No se encontraron cartas para esa búsqueda.'
  }

  return 'No se pudo completar la búsqueda.'
}

export function sortSearchResults(results: ApiCardSearchResult[]): ApiCardSearchResult[] {
  return [...results].sort((left, right) => {
    const rankDifference = getSearchTypeRank(left) - getSearchTypeRank(right)

    if (rankDifference !== 0) {
      return rankDifference
    }

    const nameDifference = left.name.localeCompare(right.name)

    if (nameDifference !== 0) {
      return nameDifference
    }

    return left.ygoprodeckId - right.ygoprodeckId
  })
}

export function buildRemoteCardSearchRequest(
  query: string,
  filters: CardSearchFilters,
): CardSearchRequest {
  const trimmedQuery = query.trim()
  const hasRemoteFilters = hasRemoteCardSearchFilters(filters)

  return {
    query:
      trimmedQuery.length >= SEARCH_MIN_QUERY_LENGTH ||
      (trimmedQuery.length > 0 && hasRemoteFilters)
        ? trimmedQuery
        : '',
    archetype: filters.archetype.trim(),
    exactType: filters.exactType.trim(),
    attribute: filters.attribute.trim(),
    race: filters.race.trim(),
    level: filters.level.trim(),
  }
}

export function hasCardSearchCriteria(query: string, filters: CardSearchFilters): boolean {
  return hasCardSearchRequestCriteria(buildRemoteCardSearchRequest(query, filters))
}

export function hasCardSearchRequestCriteria(request: CardSearchRequest): boolean {
  return Object.values(request).some((value) => normalizeName(value).length > 0)
}

export function buildCardSearchActiveFilterCount(
  filters: CardSearchFilters,
  deckFormat: DeckFormat,
): number {
  let count = 0

  if (filters.quickType !== 'all') {
    count += 1
  }

  if (filters.archetype.trim().length > 0) {
    count += 1
  }

  if (filters.exactType.trim().length > 0) {
    count += 1
  }

  if (filters.attribute.trim().length > 0) {
    count += 1
  }

  if (filters.race.trim().length > 0) {
    count += 1
  }

  if (filters.level.trim().length > 0) {
    count += 1
  }

  if (filters.description.trim().length > 0) {
    count += 1
  }

  if (filters.legalOnly && deckFormat !== 'unlimited' && deckFormat !== 'genesys') {
    count += 1
  }

  return count
}

export function applyLocalCardSearchFilters(
  results: ApiCardSearchResult[],
  filters: CardSearchFilters,
  deckFormat: DeckFormat,
): ApiCardSearchResult[] {
  const descriptionFilter = normalizeName(filters.description)

  return results.filter((card) => {
    if (deckFormat === 'genesys' && card.genesys.points === null) {
      return false
    }

    if (!matchesQuickTypeFilter(card, filters.quickType)) {
      return false
    }

    if (
      descriptionFilter.length > 0 &&
      !normalizeName(card.description ?? '').includes(descriptionFilter)
    ) {
      return false
    }

    if (
      filters.legalOnly &&
      deckFormat !== 'unlimited' &&
      deckFormat !== 'genesys' &&
      getCardCopyLimit(card, deckFormat) === 0
    ) {
      return false
    }

    return true
  })
}

function hasRemoteCardSearchFilters(filters: CardSearchFilters): boolean {
  return (
    filters.archetype.trim().length > 0 ||
    filters.exactType.trim().length > 0 ||
    filters.attribute.trim().length > 0 ||
    filters.race.trim().length > 0 ||
    filters.level.trim().length > 0
  )
}

function getSearchTypeRank(card: ApiCardReference | ApiCardSearchResult): number {
  const frameType = typeof card.frameType === 'string' ? card.frameType.toLowerCase() : ''
  const cardType = typeof card.cardType === 'string' ? card.cardType.toLowerCase() : ''

  if (frameType.includes('link')) {
    return 0
  }

  if (frameType.includes('fusion')) {
    return 1
  }

  if (frameType.includes('xyz')) {
    return 2
  }

  if (frameType.includes('synchro')) {
    return 3
  }

  if (frameType.includes('ritual')) {
    return 4
  }

  if (frameType.includes('effect') || cardType.includes('effect')) {
    return 5
  }

  if (frameType.includes('normal') || cardType.includes('normal')) {
    return 6
  }

  if (frameType.includes('spell') || cardType.includes('spell')) {
    return 7
  }

  if (frameType.includes('trap') || cardType.includes('trap')) {
    return 8
  }

  return 9
}

function matchesQuickTypeFilter(
  card: ApiCardReference | ApiCardSearchResult,
  quickType: SearchQuickTypeFilter,
): boolean {
  if (quickType === 'all') {
    return true
  }

  const cardType = typeof card.cardType === 'string' ? card.cardType.toLowerCase() : ''
  const frameType = typeof card.frameType === 'string' ? card.frameType.toLowerCase() : ''

  if (quickType === 'monster') {
    return cardType.includes('monster')
  }

  if (quickType === 'spell') {
    return cardType.includes('spell')
  }

  if (quickType === 'trap') {
    return cardType.includes('trap')
  }

  return (
    frameType.includes('fusion') ||
    frameType.includes('synchro') ||
    frameType.includes('xyz') ||
    frameType.includes('link')
  )
}
