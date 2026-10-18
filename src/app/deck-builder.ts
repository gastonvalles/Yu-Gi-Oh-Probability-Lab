import { t } from '../i18n'
import type { ApiCardReference, CardOrigin, CardRole, DeckFormat } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'
import { classifyCard, normalizeCardNameForLookup, type ClassificationSuggestion } from './classification-engine'
import { getCardCopyLimit } from './deck-format'
import { EDISON_FORMAT_LABEL, getEdisonCardStatus, isEdisonCardInPool } from './edison-format'
import { GENESYS_POINT_CAP, calculateGenesysDeckPointTotal, isGenesysLegalCardName } from './genesys-format'
import type { DeckBuilderState, DeckCardInstance, DeckZone } from './model'
import { removeClassificationOverrides, saveClassificationOverride } from './persistence'
import { createId, formatInteger } from './utils'

/**
 * Extra y Side no tienen tope en el builder: es a propósito (se prueban más de 15 opciones y
 * después se recorta), no un descuido. El Main sí corta en 60.
 */
export const DECK_ZONE_LIMITS: Record<DeckZone, number> = {
  main: 60,
  extra: Infinity,
  side: Infinity,
}

export function isCardAllowedInDeckZone(
  card: ApiCardReference | ApiCardSearchResult,
  zone: DeckZone,
): boolean {
  if (isExtraDeckCard(card)) {
    return zone === 'extra' || zone === 'side'
  }

  return zone === 'main' || zone === 'side'
}

export function addSearchResultToZone(
  deckBuilder: DeckBuilderState,
  searchResults: ApiCardSearchResult[],
  apiCardId: number,
  zone: DeckZone,
  targetIndex: number,
  format: DeckFormat = 'unlimited',
  overrides?: ReadonlyMap<string, ClassificationSuggestion>,
): DeckBuilderState {
  const searchResult = searchResults.find((result) => result.ygoprodeckId === apiCardId)

  if (!searchResult) {
    return deckBuilder
  }

  if (getAddSearchResultIssue(deckBuilder, searchResult, zone, format)) {
    return deckBuilder
  }

  const nextDeckBuilder = copyDeckBuilderForZones(deckBuilder, [zone])
  // Una copia más de una carta que ya clasificaste hereda esa clasificación.
  const knownCopy = findClassifiedCopy(deckBuilder, searchResult.ygoprodeckId)
  const suggestion = knownCopy ?? classifyCard(cloneApiCardReference(searchResult), searchResult.name, overrides)
  const hasOverride = overrides ? overrides.has(normalizeCardNameForLookup(searchResult.name)) : false

  insertDeckCard(nextDeckBuilder[zone], targetIndex, {
    instanceId: createId('deck-card'),
    name: searchResult.name,
    apiCard: cloneApiCardReference(searchResult),
    origin: suggestion.origin,
    roles: [...suggestion.roles],
    needsReview: knownCopy ? false : !hasOverride,
  })

  return nextDeckBuilder
}

function findClassifiedCopy(
  deckBuilder: DeckBuilderState,
  ygoprodeckId: number,
): { origin: DeckCardInstance['origin']; roles: DeckCardInstance['roles'] } | null {
  const copy = [...deckBuilder.main, ...deckBuilder.extra, ...deckBuilder.side].find(
    (card) => card.apiCard.ygoprodeckId === ygoprodeckId && !card.needsReview && card.origin !== null && card.roles.length > 0,
  )
  return copy ? { origin: copy.origin, roles: copy.roles } : null
}

export function getAddSearchResultIssue(
  deckBuilder: DeckBuilderState,
  searchResult: ApiCardSearchResult,
  zone: DeckZone,
  format: DeckFormat = 'unlimited',
): string | null {
  if (format === 'genesys' && !isGenesysLegalCardName(searchResult.name)) {
    return t('deck.issue.genesysNotLegal', { name: searchResult.name })
  }

  if (format === 'edison' && !isEdisonCardInPool(searchResult)) {
    return t('deck.issue.notLegalIn', { name: searchResult.name, format: EDISON_FORMAT_LABEL })
  }

  if (!isCardAllowedInDeckZone(searchResult, zone)) {
    return t(zone === 'main' ? 'deck.issue.onlyExtraOrSide' : 'deck.issue.onlyMainOrSide', { name: searchResult.name })
  }

  if (deckBuilder[zone].length >= DECK_ZONE_LIMITS[zone]) {
    const zoneLabel = zone === 'extra' ? 'Extra Deck' : zone === 'side' ? 'Side Deck' : 'Main Deck'
    return t('deck.issue.zoneFull', { zone: zoneLabel })
  }

  const limit = getCardCopyLimit(searchResult, format)

  if (countCardCopies(deckBuilder, searchResult.name) >= limit) {
    if (limit === 0 && format === 'edison' && getEdisonCardStatus(searchResult) === 'forbidden') {
      return t('deck.issue.forbiddenIn', { name: searchResult.name, format: EDISON_FORMAT_LABEL })
    }

    return limit === 0
      ? t('deck.issue.cannotPlay', { name: searchResult.name })
      : t('deck.issue.copyLimitReached', { name: searchResult.name, count: limit })
  }

  if (format === 'genesys') {
    const nextPointTotal = calculateGenesysDeckPointTotal(deckBuilder) + (searchResult.genesys.points ?? 0)

    if (nextPointTotal > GENESYS_POINT_CAP) {
      return t('deck.issue.genesysOverCapAdding', {
        name: searchResult.name,
        points: formatInteger(nextPointTotal),
        cap: formatInteger(GENESYS_POINT_CAP),
      })
    }
  }

  return null
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

  const sourceCard = deckBuilder[location.zone][location.index]

  if (!sourceCard) {
    return deckBuilder
  }

  if (location.zone !== targetZone && !isCardAllowedInDeckZone(sourceCard.apiCard, targetZone)) {
    return deckBuilder
  }

  if (location.zone !== targetZone && deckBuilder[targetZone].length >= DECK_ZONE_LIMITS[targetZone]) {
    return deckBuilder
  }

  const nextDeckBuilder = copyDeckBuilderForZones(
    deckBuilder,
    location.zone === targetZone ? [location.zone] : [location.zone, targetZone],
  )
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

  const nextDeckBuilder = copyDeckBuilderForZones(deckBuilder, [location.zone])
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
      card.needsReview = false
    }

    hasAnyChange = true
  }

  if (hasAnyChange) {
    // Persist override for cards that are fully classified
    for (const zone of zones) {
      for (const card of nextDeckBuilder[zone]) {
        if (card.apiCard.ygoprodeckId === ygoprodeckId && !card.needsReview && card.origin !== null && card.roles.length > 0) {
          saveClassificationOverride(card.name, { origin: card.origin, roles: [...card.roles] })
          break
        }
      }
    }
  }

  return hasAnyChange ? nextDeckBuilder : deckBuilder
}

export function setOriginForCard(
  deckBuilder: DeckBuilderState,
  ygoprodeckId: number,
  origin: CardOrigin,
): DeckBuilderState {
  const nextDeckBuilder = cloneDeckBuilder(deckBuilder)
  const zones: DeckZone[] = ['main', 'extra', 'side']
  let hasAnyChange = false

  for (const zone of zones) {
    const matchingCards = nextDeckBuilder[zone].filter((card) => card.apiCard.ygoprodeckId === ygoprodeckId)

    if (matchingCards.length === 0) {
      continue
    }

    const nextOrigin = matchingCards.every((card) => card.origin === origin) ? null : origin

    for (const card of matchingCards) {
      card.origin = nextOrigin
      card.needsReview = false
    }

    hasAnyChange = true
  }

  if (hasAnyChange) {
    // Persist override for cards that are fully classified
    for (const zone of zones) {
      for (const card of nextDeckBuilder[zone]) {
        if (card.apiCard.ygoprodeckId === ygoprodeckId && !card.needsReview && card.origin !== null && card.roles.length > 0) {
          saveClassificationOverride(card.name, { origin: card.origin, roles: [...card.roles] })
          break
        }
      }
    }
  }

  return hasAnyChange ? nextDeckBuilder : deckBuilder
}

/** Marks a suggested classification as confirmed without changing origin/roles. */
export function confirmClassificationForCard(
  deckBuilder: DeckBuilderState,
  ygoprodeckId: number,
): DeckBuilderState {
  const nextDeckBuilder = cloneDeckBuilder(deckBuilder)
  const zones: DeckZone[] = ['main', 'extra', 'side']
  let hasAnyChange = false

  for (const zone of zones) {
    for (const card of nextDeckBuilder[zone]) {
      if (card.apiCard.ygoprodeckId !== ygoprodeckId || !card.needsReview || card.origin === null || card.roles.length === 0) {
        continue
      }

      card.needsReview = false
      saveClassificationOverride(card.name, { origin: card.origin, roles: [...card.roles] })
      hasAnyChange = true
    }
  }

  return hasAnyChange ? nextDeckBuilder : deckBuilder
}

/**
 * Confirma de una vez todas las sugerencias que ya tienen origen y roles (lo mismo que confirmar una por una, con cada una guardada como lo que el usuario decidió).
 * Las que todavía no tienen origen o roles no se tocan: hay que decidirlas a mano.
 */
export function confirmAllClassifications(deckBuilder: DeckBuilderState): DeckBuilderState {
  const nextDeckBuilder = cloneDeckBuilder(deckBuilder)
  const zones: DeckZone[] = ['main', 'extra', 'side']
  let hasAnyChange = false

  for (const zone of zones) {
    for (const card of nextDeckBuilder[zone]) {
      if (!card.needsReview || card.origin === null || card.roles.length === 0) {
        continue
      }

      card.needsReview = false
      saveClassificationOverride(card.name, { origin: card.origin, roles: [...card.roles] })
      hasAnyChange = true
    }
  }

  return hasAnyChange ? nextDeckBuilder : deckBuilder
}

export function reclassifyAll(
  deckBuilder: DeckBuilderState,
  overrides?: ReadonlyMap<string, ClassificationSuggestion>,
): DeckBuilderState {
  const nextDeckBuilder = cloneDeckBuilder(deckBuilder)
  const zones: DeckZone[] = ['main', 'extra', 'side']

  for (const zone of zones) {
    for (const card of nextDeckBuilder[zone]) {
      const suggestion = classifyCard(card.apiCard, card.name, overrides)

      // Una carta que el usuario ya tocó (needsReview false) no se pisa: sólo se completa lo que le falta.
      if (!card.needsReview) {
        if (card.origin === null) card.origin = suggestion.origin
        if (card.roles.length === 0) card.roles = [...suggestion.roles]
        continue
      }

      card.origin = suggestion.origin
      card.roles = [...suggestion.roles]
      const hasOverride = overrides ? overrides.has(normalizeCardNameForLookup(card.name)) : false
      card.needsReview = !hasOverride
    }
  }

  return nextDeckBuilder
}

/**
 * Vuelve a sugerir todas las cartas con las reglas de hoy, pisando confirmaciones y correcciones: cada carta
 * queda pendiente de revisión y sus overrides se olvidan, así lo que confirmes después vale de nuevo.
 */
export function resuggestAll(deckBuilder: DeckBuilderState): DeckBuilderState {
  const nextDeckBuilder = cloneDeckBuilder(deckBuilder)
  const zones: DeckZone[] = ['main', 'extra', 'side']
  const names = new Set<string>()

  for (const zone of zones) {
    for (const card of nextDeckBuilder[zone]) {
      const suggestion = classifyCard(card.apiCard, card.name)
      card.origin = suggestion.origin
      card.roles = [...suggestion.roles]
      card.needsReview = true
      names.add(card.name)
    }
  }

  removeClassificationOverrides(names)
  return nextDeckBuilder
}

export function getDefaultDeckZoneForCardInBuilder(
  deckBuilder: DeckBuilderState,
  card: ApiCardReference | ApiCardSearchResult,
): DeckZone {
  const defaultZone: DeckZone = isExtraDeckCard(card) ? 'extra' : 'main'

  if (deckBuilder[defaultZone].length < DECK_ZONE_LIMITS[defaultZone]) {
    return defaultZone
  }

  if (deckBuilder.side.length < DECK_ZONE_LIMITS.side) {
    return 'side'
  }

  return defaultZone
}

function isExtraDeckCard(card: ApiCardReference | ApiCardSearchResult): boolean {
  const frameType = card.frameType.toLowerCase()

  return (
    frameType.includes('fusion') ||
    frameType.includes('synchro') ||
    frameType.includes('xyz') ||
    frameType.includes('link')
  )
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

/** True once the deck already holds the max legal copies of this card for the given format. */
export function isCardAtCopyLimit(
  deckBuilder: DeckBuilderState,
  card: ApiCardSearchResult,
  format: DeckFormat,
): boolean {
  return countCardCopies(deckBuilder, card.name) >= getCardCopyLimit(card, format)
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
    isEditingDeck: deckBuilder.isEditingDeck,
  }
}

function copyDeckBuilderForZones(deckBuilder: DeckBuilderState, zonesToCopy: DeckZone[]): DeckBuilderState {
  const copiedZones = new Set(zonesToCopy)

  return {
    deckName: deckBuilder.deckName,
    main: copiedZones.has('main') ? [...deckBuilder.main] : deckBuilder.main,
    extra: copiedZones.has('extra') ? [...deckBuilder.extra] : deckBuilder.extra,
    side: copiedZones.has('side') ? [...deckBuilder.side] : deckBuilder.side,
    isEditingDeck: deckBuilder.isEditingDeck,
  }
}

function cloneDeckCard(card: DeckCardInstance): DeckCardInstance {
  return {
    instanceId: card.instanceId,
    name: card.name,
    apiCard: card.apiCard,
    origin: card.origin,
    roles: [...card.roles],
    needsReview: card.needsReview === true,
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
    genesys: {
      points: card.genesys.points,
    },
  }
}
