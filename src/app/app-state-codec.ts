import { buildGenesysCardInfo } from './genesys-format'
import { parseCardAttribute } from './card-attributes'
import {
  createMatcherFromGroupKey,
  createCardPoolMatcher,
  normalizeHandPatternCategory,
  normalizePatternLogic,
  normalizeReusePolicy,
} from './patterns'
import {
  normalizeCardOriginKey,
  normalizeCardRoleKey,
  parseStoredGroupKey,
} from './deck-groups'
import type {
  ApiCardReference,
  CardOrigin,
  CardRole,
  HandPattern,
  HandPatternCategory,
  Matcher,
  PatternCondition,
  RequirementKind,
  RequirementSource,
} from '../types'
import type { AppState, PortableCondition, PortableConfig } from './model'
import { deriveMainDeckCardsFromZone } from './calculator-state'
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

export function toPortableConfig(state: AppState): PortableConfig {
  return {
    version: 15,
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
        origin: card.origin,
        roles: [...card.roles],
        needsReview: card.needsReview === true,
      })),
      extra: state.deckBuilder.extra.map((card) => ({
        name: card.name,
        apiCard: { ...card.apiCard },
        origin: card.origin,
        roles: [...card.roles],
        needsReview: card.needsReview === true,
      })),
      side: state.deckBuilder.side.map((card) => ({
        name: card.name,
        apiCard: { ...card.apiCard },
        origin: card.origin,
        roles: [...card.roles],
        needsReview: card.needsReview === true,
      })),
    },
    patterns: state.patterns.map((pattern) => ({
      name: pattern.name,
      kind: pattern.kind,
      logic: pattern.logic,
      minimumConditionMatches: pattern.minimumConditionMatches,
      reusePolicy: pattern.reusePolicy,
      needsReview: pattern.needsReview === true,
      conditions: pattern.conditions.map<PortableCondition>((condition) => ({
        matcher: condition.matcher,
        quantity: condition.quantity,
        kind: condition.kind,
        distinct: condition.distinct,
      })),
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
    isEditingDeck: true,
  }

  const derivedMainCards = deriveMainDeckCardsFromZone(deckBuilder.main)
  const cardIdsByName = new Map(derivedMainCards.map((card) => [normalizeName(card.name), card.id]))
  const patternsRaw = parseArray(value.patterns, 'patterns')

  const patterns = patternsRaw.map((rawPattern, index) => {
    if (!isRecord(rawPattern)) {
      throw new Error(`El patrón #${index + 1} es inválido.`)
    }

    const patternName = parseRequiredString(rawPattern.name, `patterns[${index}].name`)
    const kind = parsePatternKind(rawPattern.kind ?? rawPattern.category)
    const { logic, minimumConditionMatches } = parsePatternLogicFields(rawPattern)
    const reusePolicy = parsePatternReusePolicy(rawPattern)
    const conditionsRaw = parseArray(
      rawPattern.conditions ?? rawPattern.requirements,
      `patterns[${index}].conditions`,
    )
    let needsReview = rawPattern.needsReview === true

    const conditions = conditionsRaw.map<PatternCondition>((rawCondition, conditionIndex) => {
      if (!isRecord(rawCondition)) {
        throw new Error(`La condición #${conditionIndex + 1} del patrón #${index + 1} es inválida.`)
      }

      const { matcher, needsReview: matcherNeedsReview } = parseConditionMatcher(
        rawCondition,
        cardIdsByName,
        patternName,
      )
      needsReview = needsReview || matcherNeedsReview

      return {
        id: createId('req'),
        matcher,
        quantity: parseRequiredInteger(
          rawCondition.quantity ?? rawCondition.count,
          `patterns[${index}].conditions[${conditionIndex}].quantity`,
        ),
        kind: rawCondition.kind === 'exclude' ? 'exclude' : 'include',
        distinct: rawCondition.distinct === true,
      }
    })

    return {
      id: createId('pattern'),
      name: patternName,
      kind,
      logic,
      minimumConditionMatches,
      reusePolicy,
      needsReview,
      conditions,
    }
  })

  return {
    mode,
    handSize,
    deckFormat,
    patternsSeeded: value.patternsSeeded === true || patternsSeedVersion > 0 || patterns.length > 0,
    patternsSeedVersion,
    deckBuilder,
    patterns,
  }
}

function parseDeckZone(value: unknown, fieldName: string) {
  const items = parseArray(value, fieldName)

  return items.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`"${fieldName}[${index}]" es inválido.`)
    }

    const name = parseRequiredString(item.name, `${fieldName}[${index}].name`)
    const { roles, needsReview: hasRoleReviewPending } = parseCardRoles(item.roles)
    const { origin, needsReview: hasOriginReviewPending } = parseCardOrigin(item.origin)

    return {
      instanceId: createId('deck-card'),
      name,
      apiCard: parseApiCardReference(item.apiCard, `${fieldName}[${index}].apiCard`, name),
      origin,
      roles,
      needsReview: item.needsReview === true || hasRoleReviewPending || hasOriginReviewPending,
    }
  })
}

function parseApiCardReference(value: unknown, fieldName: string, cardName: string): ApiCardReference {
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
    genesys: parseGenesysInfo(value.genesys, cardName),
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

function parseGenesysInfo(value: unknown, cardName: string): ApiCardReference['genesys'] {
  if (!isRecord(value)) {
    return buildGenesysCardInfo(cardName)
  }

  return {
    points:
      typeof value.points === 'number' && Number.isInteger(value.points)
        ? value.points
        : buildGenesysCardInfo(cardName).points,
  }
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

function parseCardRoles(value: unknown): { roles: CardRole[]; needsReview: boolean } {
  if (!Array.isArray(value)) {
    return {
      roles: [],
      needsReview: false,
    }
  }

  const roles: CardRole[] = []
  let needsReview = false

  for (const entry of value) {
    const normalizedRole = normalizeCardRoleKey(entry)

    if (!normalizedRole) {
      needsReview = true
      continue
    }

    if (!roles.includes(normalizedRole)) {
      roles.push(normalizedRole)
    }
  }

  return {
    roles,
    needsReview,
  }
}

function parseCardOrigin(value: unknown): { origin: CardOrigin | null; needsReview: boolean } {
  const origin = normalizeCardOriginKey(value)

  return {
    origin,
    needsReview: origin === null,
  }
}

function parsePatternKind(value: unknown): HandPatternCategory {
  return normalizeHandPatternCategory(value as HandPatternCategory | 'good' | 'bad' | null | undefined)
}

function parsePatternLogicFields(
  pattern: Record<string, unknown>,
): Pick<HandPattern, 'logic' | 'minimumConditionMatches'> {
  const legacyMatchMode = pattern.matchMode
  const logic =
    legacyMatchMode === 'all'
      ? 'all'
      : legacyMatchMode === 'any' || legacyMatchMode === 'at-least'
        ? 'any'
        : normalizePatternLogic(pattern.logic)

  if (legacyMatchMode === 'all') {
    return {
      logic,
      minimumConditionMatches: parseOptionalInteger(pattern.minimumConditionMatches ?? pattern.minimumMatches, 1),
    }
  }

  if (legacyMatchMode === 'at-least') {
    return {
      logic: 'any',
      minimumConditionMatches: Math.max(2, parseOptionalInteger(pattern.minimumMatches, 2)),
    }
  }

  if (legacyMatchMode === 'any') {
    return {
      logic: 'any',
      minimumConditionMatches: 1,
    }
  }

  return {
    logic,
    minimumConditionMatches: parseOptionalInteger(pattern.minimumConditionMatches, 1),
  }
}

function parsePatternReusePolicy(pattern: Record<string, unknown>): HandPattern['reusePolicy'] {
  if (typeof pattern.reusePolicy === 'string') {
    return normalizeReusePolicy(pattern.reusePolicy)
  }

  return pattern.allowSharedCards === true ? 'allow' : 'forbid'
}

function parseConditionMatcher(
  rawCondition: Record<string, unknown>,
  cardIdsByName: Map<string, string>,
  patternName: string,
): { matcher: Matcher | null; needsReview: boolean } {
  const directMatcher = parseMatcher(rawCondition.matcher)

  if (directMatcher) {
    return {
      matcher: directMatcher,
      needsReview: false,
    }
  }

  const source = parseRequirementSource(rawCondition.source)

  if (source === 'group') {
    const parsedGroupKey = parseStoredGroupKey(rawCondition.groupKey)

    return {
      matcher: parsedGroupKey.groupKey ? createMatcherFromGroupKey(parsedGroupKey.groupKey) : null,
      needsReview: parsedGroupKey.groupKey === null,
    }
  }

  if (source === 'attribute') {
    return {
      matcher: parseCardAttribute(rawCondition.attribute)
        ? { type: 'attribute', value: parseCardAttribute(rawCondition.attribute)! }
        : null,
      needsReview: false,
    }
  }

  if (source === 'level') {
    const level = parseNullableInteger(rawCondition.level)
    return {
      matcher: level !== null ? { type: 'level', value: level } : null,
      needsReview: false,
    }
  }

  if (source === 'type') {
    const monsterType = parseNullableString(rawCondition.monsterType)
    return {
      matcher: monsterType ? { type: 'monster_type', value: monsterType } : null,
      needsReview: false,
    }
  }

  if (source === 'atk') {
    const atk = parseNullableInteger(rawCondition.atk)
    return {
      matcher: atk !== null ? { type: 'atk', value: atk } : null,
      needsReview: false,
    }
  }

  if (source === 'def') {
    const def = parseNullableInteger(rawCondition.def)
    return {
      matcher: def !== null ? { type: 'def', value: def } : null,
      needsReview: false,
    }
  }

  const cardNames = parseRequirementCardNames(rawCondition, `${patternName}.cards`)
  const cardIds = cardNames.map((cardName) => {
    const cardId = cardIdsByName.get(normalizeName(cardName))

    if (!cardId) {
      throw new Error(`El patrón "${patternName}" referencia "${cardName}", pero no existe en el Main Deck.`)
    }

    return cardId
  })

  return {
    matcher: createCardPoolMatcher(cardIds),
    needsReview: false,
  }
}

function parseRequirementSource(value: unknown): RequirementSource {
  return value === 'group'
    ? 'group'
    : value === 'attribute'
      ? 'attribute'
      : value === 'level'
        ? 'level'
        : value === 'type'
          ? 'type'
          : value === 'atk'
            ? 'atk'
            : value === 'def'
              ? 'def'
              : 'cards'
}

function parseMatcher(value: unknown): Matcher | null {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return null
  }

  if (value.type === 'origin') {
    const origin = normalizeCardOriginKey(value.value)
    return origin ? { type: 'origin', value: origin } : null
  }

  if (value.type === 'role') {
    const role = normalizeCardRoleKey(value.value)
    return role ? { type: 'role', value: role } : null
  }

  if (value.type === 'card' && typeof value.value === 'string') {
    return { type: 'card', value: value.value }
  }

  if (value.type === 'card_pool' && Array.isArray(value.value)) {
    return createCardPoolMatcher(
      value.value.filter((entry): entry is string => typeof entry === 'string'),
    )
  }

  if (value.type === 'attribute') {
    const attribute = parseCardAttribute(value.value)
    return attribute ? { type: 'attribute', value: attribute } : null
  }

  if (value.type === 'level' && typeof value.value === 'number' && Number.isInteger(value.value)) {
    return { type: 'level', value: value.value }
  }

  if (value.type === 'monster_type' && typeof value.value === 'string') {
    return { type: 'monster_type', value: value.value }
  }

  if (value.type === 'atk' && typeof value.value === 'number' && Number.isInteger(value.value)) {
    return { type: 'atk', value: value.value }
  }

  if (value.type === 'def' && typeof value.value === 'number' && Number.isInteger(value.value)) {
    return { type: 'def', value: value.value }
  }

  return null
}
