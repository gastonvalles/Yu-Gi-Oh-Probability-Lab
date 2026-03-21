import { getPatternDedupKey, normalizeHandPatternCategory } from './patterns'
import type {
  ApiCardReference,
  CardGroupKey,
  CardRole,
  HandPattern,
  HandPatternCategory,
  PatternMatchMode,
  RequirementKind,
  RequirementSource,
} from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'
import type {
  AppState,
  PortableConfig,
  PortableRequirement,
  SearchCacheEntry,
} from './model'
import {
  createInitialState,
  SEARCH_CACHE_KEY,
  SEARCH_CACHE_LIMIT,
  SEARCH_CACHE_TTL_MS,
  STORAGE_KEY,
} from './model'
import { deriveMainDeckCardsFromZone } from './deck-utils'
import {
  createId,
  isRecord,
  normalizeName,
  parseArray,
  parseDeckFormat,
  parseMode,
  parseNullableDisplayString,
  parseNullableInteger,
  parseNullableString,
  parseRequiredInteger,
  parseRequiredString,
} from './utils'

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return createInitialState()
    }

    return fromPortableConfig(JSON.parse(raw))
  } catch {
    return createInitialState()
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toPortableConfig(state)))
  } catch {
    return
  }
}

export function toPortableConfig(state: AppState): PortableConfig {
  return {
    version: 9,
    mode: state.mode,
    handSize: state.handSize,
    deckFormat: state.deckFormat,
    patternsSeeded: state.patternsSeeded,
    patternsSeedVersion: state.patternsSeedVersion,
    deckBuilder: {
      deckName: state.deckBuilder.deckName,
      main: state.deckBuilder.main.map((card) => ({
        name: card.name,
        apiCard: { ...card.apiCard },
        roles: [...card.roles],
      })),
      extra: state.deckBuilder.extra.map((card) => ({
        name: card.name,
        apiCard: { ...card.apiCard },
        roles: [...card.roles],
      })),
      side: state.deckBuilder.side.map((card) => ({
        name: card.name,
        apiCard: { ...card.apiCard },
        roles: [...card.roles],
      })),
    },
    patterns: state.patterns.map((pattern) => ({
      name: pattern.name,
      category: normalizeHandPatternCategory(pattern.category),
      matchMode: pattern.matchMode,
      minimumMatches: pattern.minimumMatches,
      allowSharedCards: pattern.allowSharedCards,
      requirements: aggregateRequirementsForExport(pattern, state),
    })),
  }
}

export function fromPortableConfig(value: unknown): AppState {
  if (!isRecord(value)) {
    throw new Error('La configuración debe ser un objeto JSON.')
  }

  const mode = parseMode(value.mode)
  const handSize = parseRequiredInteger(value.handSize, 'handSize')
  const deckFormat = parseDeckFormat(value.deckFormat)
  const patternsSeedVersion = parseOptionalInteger(value.patternsSeedVersion, 0)

  if (!isRecord(value.deckBuilder)) {
    throw new Error('"deckBuilder" debe ser un objeto.')
  }

  const deckBuilder = {
    deckName: parseRequiredString(value.deckBuilder.deckName, 'deckBuilder.deckName'),
    main: parseDeckZone(value.deckBuilder.main, 'deckBuilder.main'),
    extra: parseDeckZone(value.deckBuilder.extra, 'deckBuilder.extra'),
    side: parseDeckZone(value.deckBuilder.side, 'deckBuilder.side'),
  }

  const derivedMainCards = deriveMainDeckCardsFromZone(deckBuilder.main)
  const cardIdsByName = new Map(derivedMainCards.map((card) => [normalizeName(card.name), card.id]))
  const patternsRaw = parseArray(value.patterns, 'patterns')

  const patterns = patternsRaw.map((rawPattern, index) => {
    if (!isRecord(rawPattern)) {
      throw new Error(`El patrón #${index + 1} es inválido.`)
    }

    const patternName = parseRequiredString(rawPattern.name, `patterns[${index}].name`)
    const category = parsePatternCategory(rawPattern.category)
    const matchMode: PatternMatchMode =
      rawPattern.matchMode === 'all' || rawPattern.matchMode === 'any' || rawPattern.matchMode === 'at-least'
        ? rawPattern.matchMode
        : 'all'
    const minimumMatches = isRecord(rawPattern) ? parseOptionalInteger(rawPattern.minimumMatches, 1) : 1
    const allowSharedCards = rawPattern.allowSharedCards === true
    const requirementsRaw = parseArray(rawPattern.requirements, `patterns[${index}].requirements`)

    const requirements = requirementsRaw.map((rawRequirement, requirementIndex) => {
      if (!isRecord(rawRequirement)) {
        throw new Error(`El requisito #${requirementIndex + 1} del patrón #${index + 1} es inválido.`)
      }

      const source: RequirementSource = rawRequirement.source === 'group' ? 'group' : 'cards'
      const groupKey = parseOptionalGroupKey(rawRequirement.groupKey)
      const cardNames =
        source === 'group'
          ? []
          : parseRequirementCardNames(rawRequirement, `patterns[${index}].requirements[${requirementIndex}]`)
      const cardIds = cardNames.map((cardName) => {
        const cardId = cardIdsByName.get(normalizeName(cardName))

        if (!cardId) {
          throw new Error(`El patrón "${patternName}" referencia "${cardName}", pero no existe en el Main Deck.`)
        }

        return cardId
      })
      const kind: RequirementKind = rawRequirement.kind === 'exclude' ? 'exclude' : 'include'

      return {
        id: createId('req'),
        source,
        cardIds,
        groupKey,
        count: parseRequiredInteger(
          rawRequirement.count,
          `patterns[${index}].requirements[${requirementIndex}].count`,
        ),
        kind,
        distinct: rawRequirement.distinct === true,
      }
    })

    return {
      id: createId('pattern'),
      name: patternName,
      category,
      matchMode,
      minimumMatches,
      allowSharedCards,
      requirements,
    }
  })

  const dedupedPatterns = patterns.filter((pattern, index, entries) => {
    const patternKey = getPatternDedupKey(pattern)

    return entries.findIndex((entry) => getPatternDedupKey(entry) === patternKey) === index
  })

  return {
    mode,
    handSize,
    deckFormat,
    patternsSeeded: value.patternsSeeded === true || patternsSeedVersion > 0 || dedupedPatterns.length > 0,
    patternsSeedVersion,
    deckBuilder,
    patterns: dedupedPatterns,
  }
}

function parseDeckZone(value: unknown, fieldName: string) {
  const items = parseArray(value, fieldName)

  return items.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`"${fieldName}[${index}]" es inválido.`)
    }

    return {
      instanceId: createId('deck-card'),
      name: parseRequiredString(item.name, `${fieldName}[${index}].name`),
      apiCard: parseApiCardReference(item.apiCard, `${fieldName}[${index}].apiCard`),
      roles: parseCardRoles(item.roles),
    }
  })
}

function parseApiCardReference(value: unknown, fieldName: string): ApiCardReference {
  if (!isRecord(value)) {
    throw new Error(`"${fieldName}" debe ser un objeto.`)
  }

  return {
    ygoprodeckId: parseRequiredInteger(value.ygoprodeckId, `${fieldName}.ygoprodeckId`),
    cardType: parseRequiredString(value.cardType, `${fieldName}.cardType`),
    frameType: parseRequiredString(value.frameType, `${fieldName}.frameType`),
    description: parseNullableString(value.description),
    race: parseNullableString(value.race),
    attribute: parseNullableString(value.attribute),
    level: parseNullableInteger(value.level),
    linkValue: parseNullableInteger(value.linkValue),
    atk: parseNullableDisplayString(value.atk),
    def: parseNullableDisplayString(value.def),
    archetype: parseNullableString(value.archetype),
    ygoprodeckUrl: parseNullableString(value.ygoprodeckUrl),
    imageUrl: parseNullableString(value.imageUrl),
    imageUrlSmall: parseNullableString(value.imageUrlSmall),
    banlist: parseCardBanlistInfo(value.banlist),
  }
}

function parseCardBanlistInfo(value: unknown): ApiCardReference['banlist'] {
  if (!isRecord(value)) {
    return {
      tcg: null,
      ocg: null,
      goat: null,
    }
  }

  return {
    tcg: parseBanlistStatus(value.tcg),
    ocg: parseBanlistStatus(value.ocg),
    goat: parseBanlistStatus(value.goat),
  }
}

function parseBanlistStatus(value: unknown): ApiCardReference['banlist']['tcg'] {
  if (
    value === 'forbidden' ||
    value === 'limited' ||
    value === 'semi-limited' ||
    value === 'unlimited'
  ) {
    return value
  }

  return null
}

function parseRequirementCardNames(value: Record<string, unknown>, fieldName: string): string[] {
  if (typeof value.card === 'string') {
    return [parseRequiredString(value.card, `${fieldName}.card`)]
  }

  const cards = parseArray(value.cards, `${fieldName}.cards`)
  return cards.map((card, index) => parseRequiredString(card, `${fieldName}.cards[${index}]`))
}

function parseOptionalInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback
}

function parseCardRoles(value: unknown): CardRole[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter(isCardRole)
}

function isCardRole(value: unknown): value is CardRole {
  return (
    value === 'starter' ||
    value === 'extender' ||
    value === 'brick' ||
    value === 'handtrap' ||
    value === 'boardbreaker' ||
    value === 'floodgate'
  )
}

function parseOptionalGroupKey(value: unknown): CardGroupKey | null {
  return value === 'starter' ||
    value === 'extender' ||
    value === 'brick' ||
    value === 'handtrap' ||
    value === 'boardbreaker' ||
    value === 'floodgate' ||
    value === 'non-engine'
    ? value
    : null
}

function parsePatternCategory(value: unknown): HandPatternCategory {
  return value === 'bad' ? 'bad' : 'good'
}

function aggregateRequirementsForExport(pattern: HandPattern, state: AppState): PortableRequirement[] {
  const cardNameById = new Map(
    deriveMainDeckCardsFromZone(state.deckBuilder.main).map((card) => [card.id, card.name]),
  )

  return pattern.requirements.reduce<PortableRequirement[]>((exported, requirement) => {
    if (requirement.source === 'group' && requirement.groupKey) {
      exported.push({
        cards: [],
        source: 'group',
        groupKey: requirement.groupKey,
        count: requirement.count,
        kind: requirement.kind,
        distinct: requirement.distinct,
      })
      return exported
    }

    const cardNames = requirement.cardIds
      .map((cardId) => cardNameById.get(cardId))
      .filter((cardName): cardName is string => Boolean(cardName))

    if (cardNames.length === 0) {
      return exported
    }

    exported.push({
      cards: cardNames,
      source: 'cards',
      groupKey: null,
      count: requirement.count,
      kind: requirement.kind,
      distinct: requirement.distinct,
    })
    return exported
  }, [])
}

export function loadApiSearchCache(): Record<string, SearchCacheEntry<ApiCardSearchResult>> {
  try {
    const raw = localStorage.getItem(SEARCH_CACHE_KEY)

    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw) as unknown

    if (!isRecord(parsed)) {
      return {}
    }

    const cache: Record<string, SearchCacheEntry<ApiCardSearchResult>> = {}

    for (const [key, entry] of Object.entries(parsed)) {
      if (
        !isRecord(entry) ||
        !Array.isArray(entry.results) ||
        typeof entry.savedAt !== 'number' ||
        typeof entry.hasMore !== 'boolean'
      ) {
        continue
      }

      cache[key] = {
        savedAt: entry.savedAt,
        results: entry.results.filter(isApiCardSearchResult),
        hasMore: entry.hasMore,
      }
    }

    return cache
  } catch {
    return {}
  }
}

export function getCachedApiSearch(
  cache: Record<string, SearchCacheEntry<ApiCardSearchResult>>,
  query: string,
  page: number,
): SearchCacheEntry<ApiCardSearchResult> | null {
  const normalizedQuery = buildSearchCacheKey(query, page)
  const cachedEntry = cache[normalizedQuery]

  if (!cachedEntry) {
    return null
  }

  if (Date.now() - cachedEntry.savedAt > SEARCH_CACHE_TTL_MS) {
    delete cache[normalizedQuery]
    saveApiSearchCache(cache)
    return null
  }

  return cachedEntry
}

export function storeCachedApiSearch(
  cache: Record<string, SearchCacheEntry<ApiCardSearchResult>>,
  query: string,
  page: number,
  results: SearchCacheEntry<ApiCardSearchResult>,
): Record<string, SearchCacheEntry<ApiCardSearchResult>> {
  const nextCache = {
    ...cache,
    [buildSearchCacheKey(query, page)]: {
      savedAt: Date.now(),
      results: results.results,
      hasMore: results.hasMore,
    },
  }

  const trimmedEntries = Object.entries(nextCache)
    .sort((left, right) => right[1].savedAt - left[1].savedAt)
    .slice(0, SEARCH_CACHE_LIMIT)

  const trimmedCache = Object.fromEntries(trimmedEntries)
  saveApiSearchCache(trimmedCache)
  return trimmedCache
}

export function saveApiSearchCache(cache: Record<string, SearchCacheEntry<ApiCardSearchResult>>): void {
  try {
    localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(cache))
  } catch {
    return
  }
}

function buildSearchCacheKey(query: string, page: number): string {
  return `${normalizeName(query)}::${page}`
}

function isApiCardSearchResult(value: unknown): value is ApiCardSearchResult {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.name === 'string' &&
    typeof value.cardType === 'string' &&
    typeof value.frameType === 'string' &&
    typeof value.ygoprodeckId === 'number' &&
    isRecord(value.banlist)
  )
}
