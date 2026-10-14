import { t } from '../i18n'
import type { ApiCardReference, DeckFormat } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'
import { SEARCH_MIN_QUERY_LENGTH } from './model'
import { getCardCopyLimit } from './deck-format'
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
  normalizedCardType: string
  normalizedAttribute: string
  normalizedRace: string
  normalizedLevel: string
  /** `getSearchTypeRank` de la carta: monstruo, mágica, trampa u otra. */
  typeRank: number
  /** Qué filtros rápidos cumple, un bit por tipo (`QUICK_TYPE_BITS`). */
  quickTypes: number
  /** Posición por nombre y, si empatan, por id: reemplaza a `localeCompare` al ordenar. Se completa al cerrar el índice. */
  nameRank: number
}

interface SearchMatch {
  entry: SearchableCardIndexEntry
  score: number
}

const QUICK_TYPE_BITS = { monster: 1, spell: 2, trap: 4 } as const

// Misma regla que `localeCompare` sin argumentos, pero con el Collator armado una sola vez.
const nameCollator = new Intl.Collator()

// El índice son ~14,6 mil cartas: se arma en rebanadas de este tamaño para no dejar el hilo principal ocupado más de un cuadro.
const INDEX_SLICE_MS = 8

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
  const typeLabel = typeof card.cardType === 'string' && card.cardType.trim().length > 0 ? card.cardType : t('search.card.fallbackType')
  return [typeLabel, card.archetype ? t('search.card.archetype', { name: card.archetype }) : ''].filter(Boolean).join(' · ')
}

export function formatSearchError(message: string): string {
  const normalizedMessage = message.toLowerCase()

  if (normalizedMessage.includes('no card matching your query')) {
    return t('search.error.noResults')
  }

  return t('search.error.failed')
}

function buildIndexEntry(card: ApiCardSearchResult): SearchableCardIndexEntry {
  return {
    card,
    normalizedName: normalizeSearchText(card.name),
    normalizedDescription: normalizeSearchText(card.description ?? ''),
    normalizedArchetype: normalizeSearchText(card.archetype ?? ''),
    normalizedCardType: normalizeSearchText(card.cardType),
    normalizedAttribute: normalizeSearchText(card.attribute ?? ''),
    normalizedRace: normalizeSearchText(card.race ?? ''),
    normalizedLevel: normalizeSearchText(card.level === null ? '' : String(card.level)),
    typeRank: getSearchTypeRank(card),
    quickTypes:
      (matchesQuickTypeFilter(card, 'monster') ? QUICK_TYPE_BITS.monster : 0) |
      (matchesQuickTypeFilter(card, 'spell') ? QUICK_TYPE_BITS.spell : 0) |
      (matchesQuickTypeFilter(card, 'trap') ? QUICK_TYPE_BITS.trap : 0),
    nameRank: 0,
  }
}

// El desempate por nombre (y por id) se resuelve una sola vez al cerrar el índice, no en cada búsqueda.
function rankIndexByName(entries: SearchableCardIndexEntry[]): SearchableCardIndexEntry[] {
  const byName = [...entries].sort(
    (left, right) =>
      nameCollator.compare(left.card.name, right.card.name) || left.card.ygoprodeckId - right.card.ygoprodeckId,
  )

  byName.forEach((entry, position) => {
    entry.nameRank = position
  })

  return entries
}

export function buildSearchableCardIndex(cards: ApiCardSearchResult[]): SearchableCardIndexEntry[] {
  return rankIndexByName(cards.map(buildIndexEntry))
}

/** Lo mismo que `buildSearchableCardIndex`, pero cede el hilo entre rebanadas; devuelve `null` si se canceló mientras tanto. */
export async function buildSearchableCardIndexInSlices(
  cards: ApiCardSearchResult[],
  isCancelled: () => boolean,
): Promise<SearchableCardIndexEntry[] | null> {
  const entries: SearchableCardIndexEntry[] = []
  let sliceStart = performance.now()

  for (const card of cards) {
    entries.push(buildIndexEntry(card))

    // En una pestaña oculta los timers se frenan (uno por segundo o peor) y nadie está mirando: se sigue de largo.
    if (performance.now() - sliceStart > INDEX_SLICE_MS && !document.hidden) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))

      if (isCancelled()) {
        return null
      }

      sliceStart = performance.now()
    }
  }

  return rankIndexByName(entries)
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
  const quickTypeBit = filters.quickType === 'all' ? 0 : QUICK_TYPE_BITS[filters.quickType]
  const rankedMatches: SearchMatch[] = []

  for (const entry of searchIndex) {
    const { card } = entry

    if (quickTypeBit !== 0 && (entry.quickTypes & quickTypeBit) === 0) {
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
      entry.normalizedCardType !== normalizedExactTypeFilter
    ) {
      continue
    }

    if (
      normalizedAttributeFilter.length > 0 &&
      entry.normalizedAttribute !== normalizedAttributeFilter
    ) {
      continue
    }

    if (
      normalizedRaceFilter.length > 0 &&
      entry.normalizedRace !== normalizedRaceFilter
    ) {
      continue
    }

    if (
      normalizedLevelFilter.length > 0 &&
      entry.normalizedLevel !== normalizedLevelFilter
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
      entry,
      score,
    })
  }

  return rankedMatches
    .sort(compareSearchMatches)
    .map(({ entry }) => entry.card)
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
  _deckFormat: DeckFormat,
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
    format: '',
  }
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

function compareSearchMatches(left: SearchMatch, right: SearchMatch): number {
  const scoreDifference = right.score - left.score

  if (scoreDifference !== 0) {
    return scoreDifference
  }

  const rankDifference = left.entry.typeRank - right.entry.typeRank

  if (rankDifference !== 0) {
    return rankDifference
  }

  return left.entry.nameRank - right.entry.nameRank
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

  // Una palabra posterior del nombre empieza con la consulta. Las palabras no llevan espacios: una consulta de varias no calza con ninguna.
  if (!normalizedQuery.includes(' ') && normalizedName.includes(` ${normalizedQuery}`)) {
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

function getSearchTypeRank(card: ApiCardReference | ApiCardSearchResult): number {
  const frameType = typeof card.frameType === 'string' ? card.frameType.toLowerCase() : ''
  const cardType = typeof card.cardType === 'string' ? card.cardType.toLowerCase() : ''

  if (cardType.includes('monster') || frameType.includes('monster')) {
    return 0
  }

  if (cardType.includes('spell') || frameType.includes('spell')) {
    return 1
  }

  if (cardType.includes('trap') || frameType.includes('trap')) {
    return 2
  }

  return 3
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
