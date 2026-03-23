import { normalizeHandPatternCategory } from './patterns'
import { buildGenesysCardInfo } from './genesys-format'
import { parseCardAttribute } from './card-attributes'
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
import type { AppState, PortableConfig, PortableRequirement } from './model'
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
    version: 12,
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
    const minimumMatches = parseOptionalInteger(rawPattern.minimumMatches, 1)
    const allowSharedCards = rawPattern.allowSharedCards === true
    const requirementsRaw = parseArray(rawPattern.requirements, `patterns[${index}].requirements`)

    const requirements = requirementsRaw.map((rawRequirement, requirementIndex) => {
      if (!isRecord(rawRequirement)) {
        throw new Error(`El requisito #${requirementIndex + 1} del patrón #${index + 1} es inválido.`)
      }

      const source: RequirementSource =
        rawRequirement.source === 'group'
          ? 'group'
          : rawRequirement.source === 'attribute'
            ? 'attribute'
            : rawRequirement.source === 'level'
              ? 'level'
              : rawRequirement.source === 'type'
                ? 'type'
                : rawRequirement.source === 'atk'
                  ? 'atk'
                  : rawRequirement.source === 'def'
                    ? 'def'
            : 'cards'
      const groupKey = parseOptionalGroupKey(rawRequirement.groupKey)
      const attribute = parseCardAttribute(rawRequirement.attribute)
      const level = parseNullableInteger(rawRequirement.level)
      const monsterType = parseNullableString(rawRequirement.monsterType)
      const atk = parseNullableInteger(rawRequirement.atk)
      const def = parseNullableInteger(rawRequirement.def)
      const cardNames =
        source === 'group' ||
        source === 'attribute' ||
        source === 'level' ||
        source === 'type' ||
        source === 'atk' ||
        source === 'def'
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
        attribute,
        level,
        monsterType,
        atk,
        def,
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

    return {
      instanceId: createId('deck-card'),
      name,
      apiCard: parseApiCardReference(item.apiCard, `${fieldName}[${index}].apiCard`, name),
      roles: parseCardRoles(item.roles),
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
    points: typeof value.points === 'number' && Number.isInteger(value.points) ? value.points : buildGenesysCardInfo(cardName).points,
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
    value === 'floodgate' ||
    value === 'draw'
  )
}

function parseOptionalGroupKey(value: unknown): CardGroupKey | null {
  return value === 'starter' ||
    value === 'extender' ||
    value === 'brick' ||
    value === 'handtrap' ||
    value === 'boardbreaker' ||
    value === 'floodgate' ||
    value === 'draw' ||
    value === 'engine' ||
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
        attribute: null,
        level: null,
        monsterType: null,
        atk: null,
        def: null,
        count: requirement.count,
        kind: requirement.kind,
        distinct: requirement.distinct,
      })
      return exported
    }

    if (requirement.source === 'attribute' && requirement.attribute) {
      exported.push({
        cards: [],
        source: 'attribute',
        groupKey: null,
        attribute: requirement.attribute,
        level: null,
        monsterType: null,
        atk: null,
        def: null,
        count: requirement.count,
        kind: requirement.kind,
        distinct: requirement.distinct,
      })
      return exported
    }

    if (requirement.source === 'level' && requirement.level !== null) {
      exported.push({
        cards: [],
        source: 'level',
        groupKey: null,
        attribute: null,
        level: requirement.level,
        monsterType: null,
        atk: null,
        def: null,
        count: requirement.count,
        kind: requirement.kind,
        distinct: requirement.distinct,
      })
      return exported
    }

    if (requirement.source === 'type' && requirement.monsterType) {
      exported.push({
        cards: [],
        source: 'type',
        groupKey: null,
        attribute: null,
        level: null,
        monsterType: requirement.monsterType,
        atk: null,
        def: null,
        count: requirement.count,
        kind: requirement.kind,
        distinct: requirement.distinct,
      })
      return exported
    }

    if (requirement.source === 'atk' && requirement.atk !== null) {
      exported.push({
        cards: [],
        source: 'atk',
        groupKey: null,
        attribute: null,
        level: null,
        monsterType: null,
        atk: requirement.atk,
        def: null,
        count: requirement.count,
        kind: requirement.kind,
        distinct: requirement.distinct,
      })
      return exported
    }

    if (requirement.source === 'def' && requirement.def !== null) {
      exported.push({
        cards: [],
        source: 'def',
        groupKey: null,
        attribute: null,
        level: null,
        monsterType: null,
        atk: null,
        def: requirement.def,
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
      attribute: null,
      level: null,
      monsterType: null,
      atk: null,
      def: null,
      count: requirement.count,
      kind: requirement.kind,
      distinct: requirement.distinct,
    })
    return exported
  }, [])
}
