import { t } from '../i18n'
import type { ApiCardReference, DeckFormat } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'
import { compileLocalCardFilters, effectMaskOf, EMPTY_RANGE, formatHasLimits, isRangeActive, type LocalCardFilters, type NumberRange } from './card-filters'
import { SEARCH_MIN_QUERY_LENGTH } from './model'
import { getCardCopyLimit } from './deck-format'
import { normalizeSearchText } from './utils'

export type { NumberRange } from './card-filters'

/**
 * Lo que se filtra en el cajón de filtros. Los chips (marco, atributo, tipo…) son listas: dentro de un grupo vale cualquiera, entre grupos tienen que cumplirse todos
 * (ver `card-filters.ts`). Los de texto —arquetipo y texto del efecto— y «ocultar prohibidas» se resuelven acá.
 */
export interface CardSearchFilters extends LocalCardFilters {
  archetype: string
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
  /** Qué efectos dice el texto de la carta (`effectMaskOf`), calculado una sola vez al armar el índice: filtrar por efecto es un AND, no una pasada de expresiones por carta. */
  effectMask: number
  /** `getSearchTypeRank` de la carta: monstruo, mágica, trampa u otra. */
  typeRank: number
  /** Posición por nombre y, si empatan, por id: reemplaza a `localeCompare` al ordenar. Se completa al cerrar el índice. */
  nameRank: number
}

interface SearchMatch {
  entry: SearchableCardIndexEntry
  score: number
}

// Misma regla que `localeCompare` sin argumentos, pero con el Collator armado una sola vez.
const nameCollator = new Intl.Collator()

// El índice son ~14,6 mil cartas: se arma en rebanadas de este tamaño para no dejar el hilo principal ocupado más de un cuadro.
const INDEX_SLICE_MS = 8

export const DEFAULT_CARD_SEARCH_FILTERS: CardSearchFilters = {
  archetype: '',
  description: '',
  legalOnly: false,
  frames: [],
  attributes: [],
  spellTrapKinds: [],
  races: [],
  abilities: [],
  limits: [],
  effects: [],
  level: EMPTY_RANGE,
  atk: EMPTY_RANGE,
  def: EMPTY_RANGE,
  genesysPoints: EMPTY_RANGE,
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
    effectMask: effectMaskOf(card.description),
    typeRank: getSearchTypeRank(card),
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

/** «Ocultar prohibidas»: sólo vale en los formatos que tienen lista (en el libre y en Genesys no hay nada que ocultar). */
const hidesBanned = (filters: CardSearchFilters, deckFormat: DeckFormat) => filters.legalOnly && formatHasLimits(deckFormat)

export function searchCardCatalog(
  searchIndex: SearchableCardIndexEntry[],
  query: string,
  filters: CardSearchFilters,
  deckFormat: DeckFormat,
): ApiCardSearchResult[] {
  const normalizedQuery = normalizeSearchText(query)
  const normalizedArchetypeFilter = normalizeSearchText(filters.archetype)
  const normalizedDescriptionFilter = normalizeSearchText(filters.description)
  const matchesLocal = compileLocalCardFilters(filters, deckFormat)
  const hideBanned = hidesBanned(filters, deckFormat)
  const rankedMatches: SearchMatch[] = []

  for (const entry of searchIndex) {
    const { card } = entry

    if (normalizedArchetypeFilter.length > 0 && entry.normalizedArchetype !== normalizedArchetypeFilter) {
      continue
    }

    if (normalizedDescriptionFilter.length > 0 && !entry.normalizedDescription.includes(normalizedDescriptionFilter)) {
      continue
    }

    if (matchesLocal && !matchesLocal(card, entry.effectMask)) {
      continue
    }

    if (hideBanned && getCardCopyLimit(card, deckFormat) === 0) {
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

/** Lo único del cajón que la API entiende: el arquetipo y, si hay uno solo elegido, el atributo y el tipo de monstruo. Lo demás se filtra acá, con los datos de la carta. */
function remoteFilterValues(filters: CardSearchFilters): Pick<CardSearchRequest, 'archetype' | 'attribute' | 'race'> {
  return {
    archetype: filters.archetype.trim(),
    attribute: filters.attributes.length === 1 ? (filters.attributes[0] ?? '') : '',
    race: filters.races.length === 1 ? (filters.races[0] ?? '') : '',
  }
}

export function buildRemoteCardSearchRequest(
  query: string,
  filters: CardSearchFilters,
  _deckFormat: DeckFormat,
): CardSearchRequest {
  const trimmedQuery = query.trim()
  const trimmedDescription = filters.description.trim()
  const remote = remoteFilterValues(filters)
  const hasRemoteFilters = remote.archetype.length > 0 || remote.attribute.length > 0 || remote.race.length > 0

  // Si no hay query pero hay description, usar description como query para buscar
  const effectiveQuery =
    trimmedQuery.length >= SEARCH_MIN_QUERY_LENGTH ||
    (trimmedQuery.length > 0 && hasRemoteFilters) ||
    (trimmedQuery.length === 0 && trimmedDescription.length > 0)
      ? trimmedQuery || trimmedDescription
      : ''

  return {
    query: effectiveQuery,
    ...remote,
    exactType: '',
    level: '',
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

/** ¿Hay filtros que sólo se pueden resolver con los datos de la carta (marco, límite, efecto, estadísticas…)? Sin la API que los entienda, la búsqueda necesita el catálogo. */
export function hasLocalCardSearchCriteria(filters: CardSearchFilters, deckFormat: DeckFormat): boolean {
  return compileLocalCardFilters(filters, deckFormat) !== null || hidesBanned(filters, deckFormat)
}

/** Cuántos filtros hay puestos, contando cada grupo de chips o de cotas como uno (es lo que dice la insignia del botón de filtros). */
export function buildCardSearchActiveFilterCount(
  filters: CardSearchFilters,
  deckFormat: DeckFormat,
): number {
  const ranges: NumberRange[] = [filters.level, filters.atk, filters.def, ...(deckFormat === 'genesys' ? [filters.genesysPoints] : [])]
  const groups = [filters.frames, filters.attributes, filters.spellTrapKinds, filters.races, filters.abilities, filters.effects, ...(formatHasLimits(deckFormat) ? [filters.limits] : [])]

  return (
    (filters.archetype.trim().length > 0 ? 1 : 0) +
    (filters.description.trim().length > 0 ? 1 : 0) +
    (hidesBanned(filters, deckFormat) ? 1 : 0) +
    groups.filter((group) => group.length > 0).length +
    ranges.filter(isRangeActive).length
  )
}

/** Lo que se aplica a las cartas que ya devolvió la API (mientras el catálogo no está): todo menos lo que la API ya resolvió con el arquetipo. */
export function applyLocalCardSearchFilters(
  results: ApiCardSearchResult[],
  filters: CardSearchFilters,
  deckFormat: DeckFormat,
): ApiCardSearchResult[] {
  const descriptionFilter = normalizeSearchText(filters.description)
  const matchesLocal = compileLocalCardFilters(filters, deckFormat)
  const hideBanned = hidesBanned(filters, deckFormat)

  return results.filter((card) => {
    if (descriptionFilter.length > 0 && !normalizeSearchText(card.description ?? '').includes(descriptionFilter)) {
      return false
    }

    if (matchesLocal && !matchesLocal(card)) {
      return false
    }

    return !hideBanned || getCardCopyLimit(card, deckFormat) !== 0
  })
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
