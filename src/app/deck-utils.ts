import type {
  ApiCardReference,
  BanlistStatus,
  CalculatorState,
  CardEntry,
  CardGroupKey,
  CardRole,
  DeckFormat,
  HandPattern,
  HandPatternCategory,
  PatternMatchMode,
  PatternRequirement,
  RequirementKind,
  RequirementSource,
} from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'
import type { DerivedDeckGroup } from './deck-groups'
import type { AppState, DeckBuilderState, DeckCardInstance, DeckZone } from './model'
import { createId, formatInteger } from './utils'

const DECK_ZONE_LIMITS: Record<DeckZone, number> = {
  main: 60,
  extra: 15,
  side: 15,
}

const MAX_COPIES_PER_CARD = 3

export function buildCalculatorState(
  derivedMainCards: CardEntry[],
  state: Pick<AppState, 'handSize' | 'patterns'>,
): CalculatorState {
  return {
    deckSize: derivedMainCards.reduce((total, card) => total + card.copies, 0),
    handSize: state.handSize,
    cards: derivedMainCards,
    patterns: state.patterns,
  }
}

export function getDerivedCardId(ygoprodeckId: number): string {
  return `card-${ygoprodeckId}`
}

export function deriveMainDeckCardsFromZone(mainDeck: DeckCardInstance[]): CardEntry[] {
  const groupedCards = new Map<number, CardEntry>()

  for (const instance of mainDeck) {
    const existingCard = groupedCards.get(instance.apiCard.ygoprodeckId)

    if (existingCard) {
      existingCard.copies += 1
      existingCard.roles = [...new Set([...existingCard.roles, ...instance.roles])]
      continue
    }

    groupedCards.set(instance.apiCard.ygoprodeckId, {
      id: getDerivedCardId(instance.apiCard.ygoprodeckId),
      name: instance.name,
      copies: 1,
      source: 'ygoprodeck',
      apiCard: instance.apiCard,
      roles: [...instance.roles],
    })
  }

  return [...groupedCards.values()].map((card) => ({
    ...card,
    roles: [...new Set(card.roles)],
  }))
}

export function createPattern(
  name: string,
  firstCardId?: string,
  category: HandPatternCategory = 'good',
): HandPattern {
  return {
    id: createId('pattern'),
    name,
    category,
    matchMode: 'all',
    minimumMatches: 1,
    allowSharedCards: false,
    requirements: [
      createPatternRequirement(firstCardId, category),
    ],
  }
}

export function buildDefaultPatternsFromGroups(groups: DerivedDeckGroup[]): HandPattern[] {
  const groupByKey = new Map(groups.map((group) => [group.key, group]))
  const starterCopies = groupByKey.get('starter')?.copies ?? 0
  const extenderCopies = groupByKey.get('extender')?.copies ?? 0
  const brickCopies = groupByKey.get('brick')?.copies ?? 0
  const handtrapCopies = groupByKey.get('handtrap')?.copies ?? 0
  const boardbreakerCopies = groupByKey.get('boardbreaker')?.copies ?? 0
  const nonEngineCopies = groupByKey.get('non-engine')?.copies ?? 0
  const starterCardIds = new Set(groupByKey.get('starter')?.cardIds ?? [])
  const extenderOnlyCardIds = (groupByKey.get('extender')?.cardIds ?? []).filter((cardId) => !starterCardIds.has(cardId))

  const patterns: HandPattern[] = []

  if (starterCopies > 0) {
    patterns.push(
      createGroupPattern('Mínimo 1 Starter', 'good', [
        { groupKey: 'starter', count: 1, kind: 'include' },
      ]),
    )
  }

  if (starterCopies > 0 && extenderCopies > 0) {
    patterns.push(
      createGroupPattern(
        'Starter + Extender',
        'good',
        [
          { groupKey: 'starter', count: 1, kind: 'include' },
          { groupKey: 'extender', count: 1, kind: 'include' },
        ],
        {
          allowSharedCards: false,
          matchMode: 'all',
          minimumMatches: 2,
        },
      ),
    )
  }

  if (starterCopies > 0 && nonEngineCopies > 0) {
    patterns.push(
      createGroupPattern(
        'Starter + Non-engine',
        'good',
        [
          { groupKey: 'starter', count: 1, kind: 'include' },
          { groupKey: 'non-engine', count: 1, kind: 'include' },
        ],
        {
          allowSharedCards: false,
          matchMode: 'all',
          minimumMatches: 2,
        },
      ),
    )
  }

  patterns.push(
    createGroupPattern('Sin starter', 'bad', [
      { groupKey: 'starter', count: 1, kind: 'exclude' },
    ]),
  )

  if (extenderOnlyCardIds.length > 0 && starterCopies > 0) {
    patterns.push(
      createGroupPattern(
        'Extender sin starter',
        'bad',
        [
          { groupKey: 'extender', count: 1, kind: 'include' },
          { groupKey: 'starter', count: 1, kind: 'exclude' },
        ],
        {
          allowSharedCards: false,
          matchMode: 'all',
          minimumMatches: 2,
        },
      ),
    )
  }

  if (brickCopies >= 2) {
    patterns.push(
      createGroupPattern('2 o más Bricks', 'bad', [
        { groupKey: 'brick', count: 2, kind: 'include' },
      ]),
    )
  }

  if (handtrapCopies >= 3) {
    patterns.push(
      createGroupPattern('3 o más HT en mano', 'bad', [
        { groupKey: 'handtrap', count: 3, kind: 'include' },
      ]),
    )
  }

  if (boardbreakerCopies >= 3) {
    patterns.push(
      createGroupPattern('3 o más BBs en mano', 'bad', [
        { groupKey: 'boardbreaker', count: 3, kind: 'include' },
      ]),
    )
  }

  if (nonEngineCopies >= 4) {
    patterns.push(
      createGroupPattern('4 o más Non-engine', 'bad', [
        { groupKey: 'non-engine', count: 4, kind: 'include' },
      ]),
    )
  }

  return patterns
}

export function addRequirement(
  patterns: HandPattern[],
  patternId: string,
  derivedMainCards: CardEntry[],
): HandPattern[] {
  return patterns.map((pattern) => {
    if (pattern.id !== patternId) {
      return pattern
    }

    const requirements = [...pattern.requirements, createPatternRequirement(derivedMainCards[0]?.id, pattern.category)]

    return {
      ...pattern,
      matchMode: 'all',
      minimumMatches: Math.max(requirements.length, 1),
      requirements,
    }
  })
}

export function removeRequirement(
  patterns: HandPattern[],
  patternId: string,
  requirementId: string,
): HandPattern[] {
  return patterns.map((pattern) =>
    pattern.id !== patternId
      ? pattern
      : {
          ...pattern,
          matchMode: 'all',
          requirements: pattern.requirements.filter((requirement) => requirement.id !== requirementId),
          minimumMatches: Math.max(
            pattern.requirements.filter((requirement) => requirement.id !== requirementId).length,
            1,
          ),
        },
  )
}

export function updatePatternName(
  patterns: HandPattern[],
  patternId: string,
  name: string,
): HandPattern[] {
  return patterns.map((pattern) =>
    pattern.id !== patternId
      ? pattern
      : {
          ...pattern,
          name,
        },
  )
}

export function updatePatternCategory(
  patterns: HandPattern[],
  patternId: string,
  category: HandPatternCategory,
): HandPattern[] {
  return patterns.map((pattern) =>
    pattern.id !== patternId
      ? pattern
      : {
          ...pattern,
          category,
        },
  )
}

export function updatePatternMatchMode(
  patterns: HandPattern[],
  patternId: string,
  matchMode: PatternMatchMode,
): HandPattern[] {
  return patterns.map((pattern) => {
    if (pattern.id !== patternId) {
      return pattern
    }

    const maxRequirementCount = Math.max(pattern.requirements.length, 1)

    return {
      ...pattern,
      matchMode,
      minimumMatches:
        matchMode === 'all'
          ? pattern.requirements.length
          : matchMode === 'any'
            ? 1
            : Math.max(2, Math.min(Math.max(pattern.minimumMatches, 2), maxRequirementCount)),
    }
  })
}

export function updatePatternMinimumMatches(
  patterns: HandPattern[],
  patternId: string,
  minimumMatches: number,
): HandPattern[] {
  return patterns.map((pattern) =>
    pattern.id !== patternId
      ? pattern
      : {
          ...pattern,
          minimumMatches:
            pattern.matchMode === 'at-least'
              ? Math.max(2, Math.min(minimumMatches, Math.max(pattern.requirements.length, 1)))
              : Math.max(1, Math.min(minimumMatches, Math.max(pattern.requirements.length, 1))),
        },
  )
}

export function updatePatternAllowSharedCards(
  patterns: HandPattern[],
  patternId: string,
  allowSharedCards: boolean,
): HandPattern[] {
  return patterns.map((pattern) =>
    pattern.id !== patternId
      ? pattern
      : {
          ...pattern,
          allowSharedCards,
        },
  )
}

export function addRequirementCardToPool(
  patterns: HandPattern[],
  patternId: string,
  requirementId: string,
  cardId: string,
): HandPattern[] {
  if (!cardId) {
    return patterns
  }

  return patterns.map((pattern) =>
    pattern.id !== patternId
      ? pattern
      : {
          ...pattern,
          requirements: pattern.requirements.map((requirement) =>
            requirement.id !== requirementId
              ? requirement
              : {
                  ...requirement,
                  cardIds: requirement.cardIds.includes(cardId) ? requirement.cardIds : [...requirement.cardIds, cardId],
                },
          ),
        },
  )
}

export function removeRequirementCardFromPool(
  patterns: HandPattern[],
  patternId: string,
  requirementId: string,
  cardId: string,
): HandPattern[] {
  return patterns.map((pattern) =>
    pattern.id !== patternId
      ? pattern
      : {
          ...pattern,
          requirements: pattern.requirements.map((requirement) =>
            requirement.id !== requirementId
              ? requirement
              : {
                  ...requirement,
                  cardIds: requirement.cardIds.filter((entry) => entry !== cardId),
                },
          ),
        },
  )
}

export function updateRequirementKind(
  patterns: HandPattern[],
  patternId: string,
  requirementId: string,
  kind: RequirementKind,
): HandPattern[] {
  return patterns.map((pattern) =>
    pattern.id !== patternId
      ? pattern
      : {
          ...pattern,
          requirements: pattern.requirements.map((requirement) =>
            requirement.id !== requirementId
              ? requirement
              : {
                  ...requirement,
                  kind,
                },
          ),
        },
  )
}

export function updateRequirementDistinct(
  patterns: HandPattern[],
  patternId: string,
  requirementId: string,
  distinct: boolean,
): HandPattern[] {
  return patterns.map((pattern) =>
    pattern.id !== patternId
      ? pattern
      : {
          ...pattern,
          requirements: pattern.requirements.map((requirement) =>
            requirement.id !== requirementId
              ? requirement
              : {
                  ...requirement,
                  distinct,
                },
          ),
        },
  )
}

export function updateRequirementCount(
  patterns: HandPattern[],
  patternId: string,
  requirementId: string,
  count: number,
): HandPattern[] {
  return patterns.map((pattern) =>
    pattern.id !== patternId
      ? pattern
      : {
          ...pattern,
          requirements: pattern.requirements.map((requirement) =>
            requirement.id !== requirementId
              ? requirement
              : {
                  ...requirement,
                  count,
                },
          ),
        },
  )
}

export function removePattern(patterns: HandPattern[], patternId: string): HandPattern[] {
  return patterns.filter((pattern) => pattern.id !== patternId)
}

function createPatternRequirement(
  firstCardId?: string,
  category: HandPatternCategory = 'good',
): PatternRequirement {
  return {
    id: createId('req'),
    source: 'cards',
    cardIds: firstCardId ? [firstCardId] : [],
    groupKey: null,
    count: 1,
    kind: category === 'bad' ? 'exclude' : 'include',
    distinct: false,
  }
}

function createGroupPattern(
  name: string,
  category: HandPatternCategory,
  requirements: Array<{
    groupKey: CardGroupKey
    count: number
    kind: RequirementKind
    distinct?: boolean
  }>,
  options?: {
    matchMode?: PatternMatchMode
    minimumMatches?: number
    allowSharedCards?: boolean
  },
): HandPattern {
  return {
    id: createId('pattern'),
    name,
    category,
    matchMode: options?.matchMode ?? 'all',
    minimumMatches: options?.minimumMatches ?? requirements.length,
    allowSharedCards: options?.allowSharedCards ?? false,
    requirements: requirements.map((requirement) => ({
      id: createId('req'),
      source: 'group',
      cardIds: [],
      groupKey: requirement.groupKey,
      count: requirement.count,
      kind: requirement.kind,
      distinct: requirement.distinct ?? false,
    })),
  }
}

export function updateRequirementSource(
  patterns: HandPattern[],
  patternId: string,
  requirementId: string,
  source: RequirementSource,
  defaultGroupKey: CardGroupKey | null,
): HandPattern[] {
  return patterns.map((pattern) =>
    pattern.id !== patternId
      ? pattern
      : {
          ...pattern,
          requirements: pattern.requirements.map((requirement) =>
            requirement.id !== requirementId
              ? requirement
              : {
                  ...requirement,
                  source,
                  groupKey: source === 'group' ? requirement.groupKey ?? defaultGroupKey : requirement.groupKey,
                },
          ),
        },
  )
}

export function updateRequirementGroup(
  patterns: HandPattern[],
  patternId: string,
  requirementId: string,
  groupKey: CardGroupKey | null,
): HandPattern[] {
  return patterns.map((pattern) =>
    pattern.id !== patternId
      ? pattern
      : {
          ...pattern,
          requirements: pattern.requirements.map((requirement) =>
            requirement.id !== requirementId
              ? requirement
              : {
                  ...requirement,
                  source: 'group',
                  groupKey,
                },
          ),
        },
  )
}

export function addSearchResultToZone(
  deckBuilder: DeckBuilderState,
  searchResults: ApiCardSearchResult[],
  apiCardId: number,
  zone: DeckZone,
  targetIndex: number,
  format: DeckFormat = 'unlimited',
): DeckBuilderState {
  const searchResult = searchResults.find((result) => result.ygoprodeckId === apiCardId)

  if (!searchResult) {
    return deckBuilder
  }

  if (deckBuilder[zone].length >= DECK_ZONE_LIMITS[zone]) {
    return deckBuilder
  }

  if (countCardCopies(deckBuilder, searchResult.name) >= getCardCopyLimit(searchResult, format)) {
    return deckBuilder
  }

  const nextDeckBuilder = cloneDeckBuilder(deckBuilder)

  insertDeckCard(nextDeckBuilder[zone], targetIndex, {
    instanceId: createId('deck-card'),
    name: searchResult.name,
    apiCard: cloneApiCardReference(searchResult),
    roles: [],
  })

  return nextDeckBuilder
}

export function addSearchResultToDefaultZone(
  deckBuilder: DeckBuilderState,
  searchResults: ApiCardSearchResult[],
  apiCardId: number,
  format: DeckFormat = 'unlimited',
): DeckBuilderState {
  const searchResult = searchResults.find((result) => result.ygoprodeckId === apiCardId)

  if (!searchResult) {
    return deckBuilder
  }

  const zone = getDefaultDeckZoneForCard(searchResult)
  return addSearchResultToZone(deckBuilder, searchResults, apiCardId, zone, deckBuilder[zone].length, format)
}

export function addSearchResultCopiesToDefaultZone(
  deckBuilder: DeckBuilderState,
  searchResults: ApiCardSearchResult[],
  apiCardId: number,
  copies: number,
  format: DeckFormat = 'unlimited',
): DeckBuilderState {
  let nextDeckBuilder = deckBuilder

  for (let index = 0; index < copies; index += 1) {
    const updatedDeckBuilder = addSearchResultToDefaultZone(nextDeckBuilder, searchResults, apiCardId, format)

    if (updatedDeckBuilder === nextDeckBuilder) {
      break
    }

    nextDeckBuilder = updatedDeckBuilder
  }

  return nextDeckBuilder
}

export function moveDeckCard(
  deckBuilder: DeckBuilderState,
  instanceId: string,
  targetZone: DeckZone,
  targetIndex: number,
): DeckBuilderState {
  const location = findDeckCardLocation(deckBuilder, instanceId)

  if (!location) {
    return deckBuilder
  }

  if (location.zone !== targetZone && deckBuilder[targetZone].length >= DECK_ZONE_LIMITS[targetZone]) {
    return deckBuilder
  }

  const nextDeckBuilder = cloneDeckBuilder(deckBuilder)
  const [movedCard] = nextDeckBuilder[location.zone].splice(location.index, 1)
  let adjustedIndex = targetIndex

  if (location.zone === targetZone && location.index < targetIndex) {
    adjustedIndex -= 1
  }

  insertDeckCard(nextDeckBuilder[targetZone], adjustedIndex, movedCard)
  return nextDeckBuilder
}

export function removeDeckCard(deckBuilder: DeckBuilderState, instanceId: string): DeckBuilderState {
  const location = findDeckCardLocation(deckBuilder, instanceId)

  if (!location) {
    return deckBuilder
  }

  const nextDeckBuilder = cloneDeckBuilder(deckBuilder)
  nextDeckBuilder[location.zone].splice(location.index, 1)
  return nextDeckBuilder
}

export function findDeckCard(deckBuilder: DeckBuilderState, instanceId: string): DeckCardInstance | null {
  const location = findDeckCardLocation(deckBuilder, instanceId)

  if (!location) {
    return null
  }

  return deckBuilder[location.zone][location.index] ?? null
}

function findDeckCardLocation(
  deckBuilder: DeckBuilderState,
  instanceId: string,
): { zone: DeckZone; index: number } | null {
  const zones: DeckZone[] = ['main', 'extra', 'side']

  for (const zone of zones) {
    const index = deckBuilder[zone].findIndex((card) => card.instanceId === instanceId)

    if (index !== -1) {
      return { zone, index }
    }
  }

  return null
}

function countCardCopies(deckBuilder: DeckBuilderState, cardName: string): number {
  const normalizedCardName = normalizeCardName(cardName)
  const zones: DeckZone[] = ['main', 'extra', 'side']
  let copies = 0

  for (const zone of zones) {
    for (const card of deckBuilder[zone]) {
      if (normalizeCardName(card.name) === normalizedCardName) {
        copies += 1
      }
    }
  }

  return copies
}

function normalizeCardName(cardName: string): string {
  return cardName.trim().toLocaleLowerCase()
}

function insertDeckCard(cards: DeckCardInstance[], index: number, card: DeckCardInstance): void {
  const safeIndex = Math.max(0, Math.min(index, cards.length))
  cards.splice(safeIndex, 0, card)
}

function cloneDeckBuilder(deckBuilder: DeckBuilderState): DeckBuilderState {
  return {
    deckName: deckBuilder.deckName,
    main: deckBuilder.main.map(cloneDeckCard),
    extra: deckBuilder.extra.map(cloneDeckCard),
    side: deckBuilder.side.map(cloneDeckCard),
  }
}

function cloneDeckCard(card: DeckCardInstance): DeckCardInstance {
  return {
    instanceId: card.instanceId,
    name: card.name,
    apiCard: card.apiCard,
    roles: [...card.roles],
  }
}

function cloneApiCardReference(card: ApiCardReference | ApiCardSearchResult): ApiCardReference {
  return {
    ygoprodeckId: card.ygoprodeckId,
    cardType: card.cardType,
    frameType: card.frameType,
    description: card.description,
    race: card.race,
    attribute: card.attribute,
    level: card.level,
    linkValue: card.linkValue,
    atk: card.atk,
    def: card.def,
    archetype: card.archetype,
    ygoprodeckUrl: card.ygoprodeckUrl,
    imageUrl: card.imageUrl,
    imageUrlSmall: card.imageUrlSmall,
    banlist: {
      tcg: card.banlist.tcg,
      ocg: card.banlist.ocg,
      goat: card.banlist.goat,
    },
  }
}

export function buildCompactSearchDescription(card: ApiCardReference | ApiCardSearchResult): string {
  const typeLabel = typeof card.cardType === 'string' && card.cardType.trim().length > 0 ? card.cardType : 'Carta'
  return [typeLabel, card.archetype ? `Arquetipo: ${card.archetype}` : ''].filter(Boolean).join(' · ')
}

export function toggleRoleForCard(
  deckBuilder: DeckBuilderState,
  ygoprodeckId: number,
  role: CardRole,
): DeckBuilderState {
  const nextDeckBuilder = cloneDeckBuilder(deckBuilder)
  const zones: DeckZone[] = ['main', 'extra', 'side']
  let hasAnyChange = false

  for (const zone of zones) {
    const matchingCards = nextDeckBuilder[zone].filter((card) => card.apiCard.ygoprodeckId === ygoprodeckId)

    if (matchingCards.length === 0) {
      continue
    }

    const shouldAddRole = matchingCards.some((card) => !card.roles.includes(role))

    for (const card of matchingCards) {
      card.roles = shouldAddRole
        ? [...new Set([...card.roles, role])]
        : card.roles.filter((entry) => entry !== role)
    }

    hasAnyChange = true
  }

  return hasAnyChange ? nextDeckBuilder : deckBuilder
}

export function getCardCopyLimit(card: ApiCardReference | ApiCardSearchResult, format: DeckFormat): number {
  if (format === 'unlimited') {
    return MAX_COPIES_PER_CARD
  }

  const status =
    format === 'tcg'
      ? card.banlist?.tcg ?? null
      : format === 'ocg'
        ? card.banlist?.ocg ?? null
        : card.banlist?.goat ?? null
  return mapBanlistStatusToCopyLimit(status)
}

function mapBanlistStatusToCopyLimit(status: BanlistStatus | null): number {
  if (status === 'forbidden') {
    return 0
  }

  if (status === 'limited') {
    return 1
  }

  if (status === 'semi-limited') {
    return 2
  }

  return MAX_COPIES_PER_CARD
}

export function getDeckFormatLabel(format: DeckFormat): string {
  if (format === 'tcg') {
    return 'TCG'
  }

  if (format === 'ocg') {
    return 'OCG'
  }

  if (format === 'goat') {
    return 'GOAT'
  }

  return 'Sin límite'
}

export function buildFormatLimitLabel(card: ApiCardReference | ApiCardSearchResult, format: DeckFormat): string | null {
  if (format === 'unlimited') {
    return null
  }

  const limit = getCardCopyLimit(card, format)

  if (limit === 0) {
    return `${getDeckFormatLabel(format)}: prohibida`
  }

  return `${getDeckFormatLabel(format)}: ${formatInteger(limit)}x`
}

export function buildDeckFormatIssues(deckBuilder: DeckBuilderState, format: DeckFormat): string[] {
  if (format === 'unlimited') {
    return []
  }

  const countsByName = new Map<string, { copies: number; card: ApiCardReference; name: string }>()
  const zones: DeckZone[] = ['main', 'extra', 'side']

  for (const zone of zones) {
    for (const card of deckBuilder[zone]) {
      const normalizedName = normalizeCardName(card.name)
      const existingEntry = countsByName.get(normalizedName)

      if (existingEntry) {
        existingEntry.copies += 1
        continue
      }

      countsByName.set(normalizedName, {
        copies: 1,
        card: card.apiCard,
        name: card.name,
      })
    }
  }

  return [...countsByName.values()]
    .filter((entry) => entry.copies > getCardCopyLimit(entry.card, format))
    .map((entry) => {
      const limit = getCardCopyLimit(entry.card, format)

      if (limit === 0) {
        return `${entry.name} está prohibida en ${getDeckFormatLabel(format)}.`
      }

      return `${entry.name} supera el límite de ${formatInteger(limit)} copia${limit === 1 ? '' : 's'} en ${getDeckFormatLabel(format)}.`
    })
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

export function getDefaultDeckZoneForCard(card: ApiCardReference | ApiCardSearchResult): DeckZone {
  const frameType = card.frameType.toLowerCase()

  if (
    frameType.includes('fusion') ||
    frameType.includes('synchro') ||
    frameType.includes('xyz') ||
    frameType.includes('link')
  ) {
    return 'extra'
  }

  return 'main'
}

export function buildDeckZoneBreakdown(zone: DeckZone, cards: DeckCardInstance[]): string {
  if (zone === 'extra') {
    const counts = {
      link: 0,
      xyz: 0,
      synchro: 0,
      fusion: 0,
    }

    for (const card of cards) {
      const frameType = card.apiCard.frameType.toLowerCase()

      if (frameType.includes('link')) {
        counts.link += 1
        continue
      }

      if (frameType.includes('xyz')) {
        counts.xyz += 1
        continue
      }

      if (frameType.includes('synchro')) {
        counts.synchro += 1
        continue
      }

      if (frameType.includes('fusion')) {
        counts.fusion += 1
      }
    }

    return [
      counts.link > 0 ? `${formatInteger(counts.link)} link` : '',
      counts.xyz > 0 ? `${formatInteger(counts.xyz)} xyz` : '',
      counts.synchro > 0 ? `${formatInteger(counts.synchro)} synchro` : '',
      counts.fusion > 0 ? `${formatInteger(counts.fusion)} fusion` : '',
    ]
      .filter(Boolean)
      .join(' · ')
  }

  if (zone === 'side') {
    const counts = {
      link: 0,
      xyz: 0,
      synchro: 0,
      fusion: 0,
      ritual: 0,
      effect: 0,
      vanilla: 0,
      spells: 0,
      traps: 0,
      others: 0,
    }

    for (const card of cards) {
      const cardType = card.apiCard.cardType.toLowerCase()
      const frameType = card.apiCard.frameType.toLowerCase()

      if (cardType.includes('spell') || frameType.includes('spell')) {
        counts.spells += 1
        continue
      }

      if (cardType.includes('trap') || frameType.includes('trap')) {
        counts.traps += 1
        continue
      }

      if (frameType.includes('link')) {
        counts.link += 1
        continue
      }

      if (frameType.includes('xyz')) {
        counts.xyz += 1
        continue
      }

      if (frameType.includes('synchro')) {
        counts.synchro += 1
        continue
      }

      if (frameType.includes('fusion')) {
        counts.fusion += 1
        continue
      }

      if (frameType.includes('ritual') || cardType.includes('ritual')) {
        counts.ritual += 1
        continue
      }

      if (
        frameType.includes('normal') ||
        (cardType.includes('normal') && !cardType.includes('spell') && !cardType.includes('trap'))
      ) {
        counts.vanilla += 1
        continue
      }

      if (frameType.includes('effect') || cardType.includes('effect')) {
        counts.effect += 1
        continue
      }

      counts.others += 1
    }

    return [
      counts.link > 0 ? `${formatInteger(counts.link)} link` : '',
      counts.xyz > 0 ? `${formatInteger(counts.xyz)} xyz` : '',
      counts.synchro > 0 ? `${formatInteger(counts.synchro)} synchro` : '',
      counts.fusion > 0 ? `${formatInteger(counts.fusion)} fusion` : '',
      counts.ritual > 0 ? `${formatInteger(counts.ritual)} ritual` : '',
      counts.effect > 0 ? `${formatInteger(counts.effect)} effect` : '',
      counts.vanilla > 0 ? `${formatInteger(counts.vanilla)} vanilla` : '',
      counts.spells > 0 ? `${formatInteger(counts.spells)} magias` : '',
      counts.traps > 0 ? `${formatInteger(counts.traps)} trampas` : '',
      counts.others > 0 ? `${formatInteger(counts.others)} otros` : '',
    ]
      .filter(Boolean)
      .join(' · ')
  }

  const counts = {
    monsters: 0,
    spells: 0,
    traps: 0,
  }

  for (const card of cards) {
    const cardType = card.apiCard.cardType.toLowerCase()
    const frameType = card.apiCard.frameType.toLowerCase()

    if (cardType.includes('spell') || frameType.includes('spell')) {
      counts.spells += 1
      continue
    }

    if (cardType.includes('trap') || frameType.includes('trap')) {
      counts.traps += 1
      continue
    }

    counts.monsters += 1
  }

  return [
    counts.monsters > 0 ? `${formatInteger(counts.monsters)} monstruos` : '',
    counts.spells > 0 ? `${formatInteger(counts.spells)} magias` : '',
    counts.traps > 0 ? `${formatInteger(counts.traps)} trampas` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

export function buildHoverPreviewDetailLine(card: ApiCardReference): string {
  if (card.race) {
    return `[${card.race}/${card.cardType}]`
  }

  return card.cardType
}

export function buildHoverPreviewStatLine(card: ApiCardReference): string {
  const parts: string[] = []

  if (card.attribute) {
    parts.push(card.attribute)
  }

  if (card.linkValue !== null) {
    parts.push(`LINK ${card.linkValue}`)
  } else if (card.level !== null) {
    parts.push(`NIVEL ${card.level}`)
  }

  if (card.atk) {
    parts.push(`ATK ${card.atk}`)
  }

  if (card.def) {
    parts.push(`DEF ${card.def}`)
  }

  return parts.join(' / ')
}

export function getHoverPreviewPosition(
  anchorRect: DOMRect,
  previewWidth = 560,
  previewHeight = 300,
): { top: number; left: number } {
  const gap = 12
  const viewportPadding = 12

  let left = anchorRect.right + gap

  if (left + previewWidth > window.innerWidth - viewportPadding) {
    left = anchorRect.left - previewWidth - gap
  }

  left = Math.max(viewportPadding, Math.min(left, window.innerWidth - previewWidth - viewportPadding))

  let top = anchorRect.top
  top = Math.max(viewportPadding, Math.min(top, window.innerHeight - previewHeight - viewportPadding))

  return { top, left }
}
