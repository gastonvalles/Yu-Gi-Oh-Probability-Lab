import type { ApiCardReference, CardRole, DeckFormat } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'
import { getCardCopyLimit } from './deck-format'
import { EDISON_FORMAT_LABEL, getEdisonCardStatus, isEdisonCardInPool } from './edison-format'
import { GENESYS_POINT_CAP, calculateGenesysDeckPointTotal, isGenesysLegalCardName } from './genesys-format'
import type { DeckBuilderState, DeckCardInstance, DeckZone } from './model'
import { createId, formatInteger } from './utils'

const DECK_ZONE_LIMITS: Record<DeckZone, number> = {
  main: 60,
  extra: 15,
  side: 15,
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

  if (getAddSearchResultIssue(deckBuilder, searchResult, zone, format)) {
    return deckBuilder
  }

  const nextDeckBuilder = copyDeckBuilderForZones(deckBuilder, [zone])

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

export function getAddSearchResultIssue(
  deckBuilder: DeckBuilderState,
  searchResult: ApiCardSearchResult,
  zone: DeckZone,
  format: DeckFormat = 'unlimited',
): string | null {
  if (format === 'genesys' && !isGenesysLegalCardName(searchResult.name)) {
    return `${searchResult.name} no figura como carta legal en Genesys.`
  }

  if (format === 'edison' && !isEdisonCardInPool(searchResult)) {
    return `${searchResult.name} no es legal en ${EDISON_FORMAT_LABEL}.`
  }

  if (deckBuilder[zone].length >= DECK_ZONE_LIMITS[zone]) {
    const zoneLabel = zone === 'extra' ? 'Extra Deck' : zone === 'side' ? 'Side Deck' : 'Main Deck'
    return `${zoneLabel} ya alcanzó su tamaño máximo.`
  }

  const limit = getCardCopyLimit(searchResult, format)

  if (countCardCopies(deckBuilder, searchResult.name) >= limit) {
    if (limit === 0 && format === 'edison' && getEdisonCardStatus(searchResult) === 'forbidden') {
      return `${searchResult.name} está prohibida en ${EDISON_FORMAT_LABEL}.`
    }

    return limit === 0
      ? `${searchResult.name} no se puede jugar en este formato.`
      : `${searchResult.name} ya alcanzó el límite de ${formatInteger(limit)} copia${limit === 1 ? '' : 's'} en este formato.`
  }

  if (format === 'genesys') {
    const nextPointTotal = calculateGenesysDeckPointTotal(deckBuilder) + (searchResult.genesys.points ?? 0)

    if (nextPointTotal > GENESYS_POINT_CAP) {
      return `${searchResult.name} llevaría el deck a ${formatInteger(nextPointTotal)} puntos y supera el cap estándar de ${formatInteger(GENESYS_POINT_CAP)} en Genesys.`
    }
  }

  return null
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
    }

    hasAnyChange = true
  }

  return hasAnyChange ? nextDeckBuilder : deckBuilder
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
    genesys: {
      points: card.genesys.points,
    },
  }
}
