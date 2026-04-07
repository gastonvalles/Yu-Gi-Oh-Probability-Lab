import type { ApiCardReference, DeckFormat } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'
import { SEARCH_MIN_QUERY_LENGTH } from './model'
import { getCardCopyLimit } from './deck-format'
import { isEdisonCardInPool } from './edison-format'
import { normalizeSearchText } from './utils'

export type SearchQuickTypeFilter = 'all' | 'monster' | 'spell' | 'trap'

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
  format: string
}

export interface SearchableCardIndexEntry {
  card: ApiCardSearchResult
  normalizedName: string
  normalizedDescription: string
  normalizedArchetype: string
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

export function buildSearchableCardIndex(cards: ApiCardSearchResult[]): SearchableCardIndexEntry[] {
  return cards.map((card) => ({
    card,
    normalizedName: normalizeSearchText(card.name),
    normalizedDescription: normalizeSearchText(card.description ?? ''),
    normalizedArchetype: normalizeSearchText(card.archetype ?? ''),
  }))
}

export function searchCardCatalog(
  searchIndex: SearchableCardIndexEntry[],
  query: string,
  filters: CardSearchFilters,
  deckFormat: DeckFormat,
): ApiCardSearchResult[] {
  const normalizedQuery = normalizeSearchText(query)
  const normalizedArchetypeFilter = normalizeSearchText(filters.archetype)
  const normalizedExactTypeFilter = normalizeSearchText(filters.exactType)
  const normalizedAttributeFilter = normalizeSearchText(filters.attribute)
  const normalizedRaceFilter = normalizeSearchText(filters.race)
  const normalizedLevelFilter = normalizeSearchText(filters.level)
  const normalizedDescriptionFilter = normalizeSearchText(filters.description)
  const rankedMatches: Array<{ card: ApiCardSearchResult; score: number }> = []

  for (const entry of searchIndex) {
    const { card } = entry

    if (!matchesDeckFormatFilter(card, deckFormat)) {
      continue
    }

    if (!matchesQuickTypeFilter(card, filters.quickType)) {
      continue
    }

    if (
      normalizedArchetypeFilter.length > 0 &&
      entry.normalizedArchetype !== normalizedArchetypeFilter
    ) {
      continue
    }

    if (
      normalizedExactTypeFilter.length > 0 &&
      normalizeSearchText(card.cardType) !== normalizedExactTypeFilter
    ) {
      continue
    }

    if (
      normalizedAttributeFilter.length > 0 &&
      normalizeSearchText(card.attribute ?? '') !== normalizedAttributeFilter
    ) {
      continue
    }

    if (
      normalizedRaceFilter.length > 0 &&
      normalizeSearchText(card.race ?? '') !== normalizedRaceFilter
    ) {
      continue
    }

    if (
      normalizedLevelFilter.length > 0 &&
      normalizeSearchText(card.level === null ? '' : String(card.level)) !== normalizedLevelFilter
    ) {
      continue
    }

    if (
      normalizedDescriptionFilter.length > 0 &&
      !entry.normalizedDescription.includes(normalizedDescriptionFilter)
    ) {
      continue
    }

    if (
      filters.legalOnly &&
      deckFormat !== 'unlimited' &&
      deckFormat !== 'genesys' &&
      getCardCopyLimit(card, deckFormat) === 0
    ) {
      continue
    }

    const score = normalizedQuery.length > 0 ? getCardSearchScore(entry, normalizedQuery) : 0

    if (normalizedQuery.length > 0 && score === 0) {
      continue
    }

    rankedMatches.push({
      card,
      score,
    })
  }

  return rankedMatches
    .sort((left, right) => compareSearchResults(left.card, right.card, left.score, right.score))
    .map(({ card }) => card)
}

export function sortSearchResults(
  results: ApiCardSearchResult[],
  query = '',
): ApiCardSearchResult[] {
  const normalizedQuery = normalizeSearchText(query)

  return [...results].sort((left, right) => {
    const scoreDifference =
      getCardSearchScore(left, normalizedQuery) - getCardSearchScore(right, normalizedQuery)

    if (scoreDifference !== 0) {
      return scoreDifference * -1
    }

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
  deckFormat: DeckFormat,
): CardSearchRequest {
  const trimmedQuery = query.trim()
  const trimmedDescription = filters.description.trim()
  const hasRemoteFilters = hasRemoteCardSearchFilters(filters)

  // Si no hay query pero hay description, usar description como query para buscar
  const effectiveQuery =
    trimmedQuery.length >= SEARCH_MIN_QUERY_LENGTH ||
    (trimmedQuery.length > 0 && hasRemoteFilters) ||
    (trimmedQuery.length === 0 && trimmedDescription.length > 0)
      ? trimmedQuery || trimmedDescription
      : ''

  return {
    query: effectiveQuery,
    archetype: filters.archetype.trim(),
    exactType: filters.exactType.trim(),
    attribute: filters.attribute.trim(),
    race: filters.race.trim(),
    level: filters.level.trim(),
    format: deckFormat === 'edison' ? 'edison' : '',
  }
}

export function hasCardSearchCriteria(query: string, filters: CardSearchFilters, deckFormat: DeckFormat): boolean {
  return hasCardSearchRequestCriteria(buildRemoteCardSearchRequest(query, filters, deckFormat))
}

export function hasCardSearchRequestCriteria(request: CardSearchRequest): boolean {
  return [
    request.query,
    request.archetype,
    request.exactType,
    request.attribute,
    request.race,
    request.level,
  ].some((value) => normalizeSearchText(value).length > 0)
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
  const descriptionFilter = normalizeSearchText(filters.description)

  return results.filter((card) => {
    if (!matchesDeckFormatFilter(card, deckFormat)) {
      return false
    }

    if (!matchesQuickTypeFilter(card, filters.quickType)) {
      return false
    }

    if (
      descriptionFilter.length > 0 &&
      !normalizeSearchText(card.description ?? '').includes(descriptionFilter)
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

function compareSearchResults(
  left: ApiCardSearchResult,
  right: ApiCardSearchResult,
  leftScore: number,
  rightScore: number,
): number {
  const scoreDifference = rightScore - leftScore

  if (scoreDifference !== 0) {
    return scoreDifference
  }

  const rankDifference = getSearchTypeRank(left) - getSearchTypeRank(right)

  if (rankDifference !== 0) {
    return rankDifference
  }

  const nameDifference = left.name.localeCompare(right.name)

  if (nameDifference !== 0) {
    return nameDifference
  }

  return left.ygoprodeckId - right.ygoprodeckId
}

function matchesDeckFormatFilter(card: ApiCardReference | ApiCardSearchResult, deckFormat: DeckFormat): boolean {
  if (deckFormat === 'edison') {
    return isEdisonCardInPool(card)
  }

  if (deckFormat === 'genesys') {
    return card.genesys.points !== null
  }

  return true
}

function getCardSearchScore(
  card: ApiCardSearchResult | SearchableCardIndexEntry,
  normalizedQuery: string,
): number {
  if (normalizedQuery.length === 0) {
    return 0
  }

  const normalizedName =
    'normalizedName' in card ? card.normalizedName : normalizeSearchText(card.name)
  const normalizedDescription =
    'normalizedDescription' in card
      ? card.normalizedDescription
      : normalizeSearchText(card.description ?? '')

  if (normalizedName === normalizedQuery) {
    return 400
  }

  if (normalizedName.startsWith(normalizedQuery)) {
    return 340
  }

  if (matchesNameWord(normalizedName, normalizedQuery)) {
    return 300
  }

  if (normalizedName.includes(normalizedQuery)) {
    return 240
  }

  if (normalizedDescription.includes(normalizedQuery)) {
    return 120
  }

  return 0
}

function matchesNameWord(normalizedName: string, normalizedQuery: string): boolean {
  return normalizedName.split(' ').some((word) => word === normalizedQuery || word.startsWith(normalizedQuery))
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
  if (quickType === 'monster') {
    return cardType.includes('monster')
  }

  if (quickType === 'spell') {
    return cardType.includes('spell')
  }

  if (quickType === 'trap') {
    return cardType.includes('trap')
  }

  return false
}
