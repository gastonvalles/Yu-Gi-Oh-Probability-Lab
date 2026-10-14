import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  buildSearchableCardIndex,
  DEFAULT_CARD_SEARCH_FILTERS,
  searchCardCatalog,
  sortSearchResults,
  type CardSearchFilters,
} from '../app/card-search'
import { getCardCopyLimit } from '../app/deck-format'
import { normalizeSearchText } from '../app/utils'
import type { BanlistStatus, DeckFormat } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'

// Réplica del algoritmo de antes de precalcular el índice: lo que la búsqueda local tiene que seguir dando, carta por carta y en el mismo orden.
function legacyNormalize(value: string): string {
  return value.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function legacyTypeRank(card: ApiCardSearchResult): number {
  const frameType = card.frameType.toLowerCase()
  const cardType = card.cardType.toLowerCase()

  if (cardType.includes('monster') || frameType.includes('monster')) return 0
  if (cardType.includes('spell') || frameType.includes('spell')) return 1
  if (cardType.includes('trap') || frameType.includes('trap')) return 2

  return 3
}

function legacyScore(card: ApiCardSearchResult, query: string): number {
  if (query.length === 0) return 0

  const name = legacyNormalize(card.name)

  if (name === query) return 400
  if (name.startsWith(query)) return 340
  if (name.split(' ').some((word) => word === query || word.startsWith(query))) return 300
  if (name.includes(query)) return 240
  if (legacyNormalize(card.description ?? '').includes(query)) return 120

  return 0
}

function legacyCompare(left: ApiCardSearchResult, right: ApiCardSearchResult, query: string): number {
  return (
    legacyScore(right, query) - legacyScore(left, query) ||
    legacyTypeRank(left) - legacyTypeRank(right) ||
    left.name.localeCompare(right.name) ||
    left.ygoprodeckId - right.ygoprodeckId
  )
}

function legacyQuickType(card: ApiCardSearchResult, quickType: CardSearchFilters['quickType']): boolean {
  const cardType = card.cardType.toLowerCase()

  return quickType === 'all' || cardType.includes(quickType)
}

function legacySearch(
  cards: ApiCardSearchResult[],
  rawQuery: string,
  filters: CardSearchFilters,
  deckFormat: DeckFormat,
): ApiCardSearchResult[] {
  const query = legacyNormalize(rawQuery)
  const archetype = legacyNormalize(filters.archetype)
  const exactType = legacyNormalize(filters.exactType)
  const attribute = legacyNormalize(filters.attribute)
  const race = legacyNormalize(filters.race)
  const level = legacyNormalize(filters.level)
  const description = legacyNormalize(filters.description)

  return cards
    .filter(
      (card) =>
        legacyQuickType(card, filters.quickType) &&
        (archetype.length === 0 || legacyNormalize(card.archetype ?? '') === archetype) &&
        (exactType.length === 0 || legacyNormalize(card.cardType) === exactType) &&
        (attribute.length === 0 || legacyNormalize(card.attribute ?? '') === attribute) &&
        (race.length === 0 || legacyNormalize(card.race ?? '') === race) &&
        (level.length === 0 || legacyNormalize(card.level === null ? '' : String(card.level)) === level) &&
        (description.length === 0 || legacyNormalize(card.description ?? '').includes(description)) &&
        !(
          filters.legalOnly &&
          deckFormat !== 'unlimited' &&
          deckFormat !== 'genesys' &&
          getCardCopyLimit(card, deckFormat) === 0
        ) &&
        (query.length === 0 || legacyScore(card, query) > 0),
    )
    .sort((left, right) => legacyCompare(left, right, query))
}

function card(id: number, name: string, extra: Partial<ApiCardSearchResult> = {}): ApiCardSearchResult {
  return {
    ygoprodeckId: id,
    name,
    cardType: 'Effect Monster',
    frameType: 'effect',
    description: null,
    race: null,
    attribute: null,
    level: null,
    linkValue: null,
    atk: null,
    def: null,
    archetype: null,
    ygoprodeckUrl: null,
    imageUrl: null,
    imageUrlSmall: null,
    banlist: { tcg: null, ocg: null, goat: null },
    genesys: { points: null },
    ...extra,
  }
}

const SPELL = { cardType: 'Normal Spell Card', frameType: 'spell' }
const TRAP = { cardType: 'Normal Trap Card', frameType: 'trap' }

const CATALOG: ApiCardSearchResult[] = [
  card(1, 'Blue-Eyes White Dragon', { attribute: 'LIGHT', race: 'Dragon', level: 8, archetype: 'Blue-Eyes', description: 'This legendary dragon is a powerful engine of destruction.', banlist: { tcg: 'unlimited', ocg: 'limited', goat: 'forbidden' } }),
  card(2, 'Blue-Eyes Ultimate Dragon', { attribute: 'LIGHT', race: 'Dragon', level: 12, archetype: 'Blue-Eyes', cardType: 'Fusion Monster', frameType: 'fusion' }),
  card(3, 'Dark Magician', { attribute: 'DARK', race: 'Spellcaster', level: 7, archetype: 'Dark Magician', description: 'The ultimate wizard in terms of attack and defense.' }),
  card(4, 'Dark Magician Girl', { attribute: 'DARK', race: 'Spellcaster', level: 6, archetype: 'Dark Magician', banlist: { tcg: 'semi-limited', ocg: 'forbidden', goat: null } }),
  card(5, 'Magician of Dark Illusion', { attribute: 'DARK', race: 'Spellcaster', level: 7, archetype: 'Dark Magician', cardType: 'Pendulum Effect Monster', frameType: 'effect_pendulum' }),
  card(6, 'Red-Eyes Black Dragon', { attribute: 'DARK', race: 'Dragon', level: 7, archetype: 'Red-Eyes' }),
  card(7, 'Dragon Ruler of Blue Eyes', { attribute: 'WIND', race: 'Dragon', level: 7, description: 'Destroy this card to Special Summon a Dragon.' }),
  card(8, 'Pot of Greed', { ...SPELL, banlist: { tcg: 'forbidden', ocg: 'forbidden', goat: 'forbidden' }, description: 'Draw 2 cards.' }),
  card(9, 'Mystical Space Typhoon', { cardType: 'Quick-Play Spell Card', frameType: 'spell', description: 'Destroy 1 Spell/Trap on the field.' }),
  card(10, 'Mirror Force', { ...TRAP, banlist: { tcg: 'limited', ocg: null, goat: 'limited' }, description: 'Destroy all your opponent\'s Attack Position monsters.' }),
  card(11, 'Señor del Dragón', { attribute: 'EARTH', race: 'Beast', level: 4, description: 'Un monstruo con diéresis: Zürich.' }),
  card(12, 'Évocateur Über', { attribute: 'EARTH', race: 'Warrior', level: 4, archetype: 'Évocateur' }),
  card(13, 'Crêpe Dragon', { attribute: 'FIRE', race: 'Dragon', level: 3 }),
  card(14, 'Dragon Spirit of White', { attribute: 'LIGHT', race: 'Dragon', level: 1, description: 'Blue-Eyes related support.' }),
  card(15, 'Ａ Fullwidth Dragon', { attribute: 'EARTH', race: 'Dragon', level: 2 }),
  card(16, 'Dragon  Rider', { attribute: 'WIND', race: 'Warrior', level: 4 }),
  card(17, 'Dragon Knight', { attribute: 'EARTH', race: 'Warrior', level: 4 }),
  card(18, 'Magic Dragon', { attribute: 'DARK', race: 'Dragon', level: 5 }),
  card(19, 'Dragon Magic', { ...SPELL }),
  card(20, 'Sangan', { attribute: 'DARK', race: 'Fiend', level: 3, description: 'Search for a card with 1500 or less ATK.' }),
  card(21, 'Sangan', { attribute: 'DARK', race: 'Fiend', level: 3, banlist: { tcg: 'limited', ocg: 'limited', goat: 'limited' } }),
  card(22, 'Dragonic Magician', { attribute: 'DARK', race: 'Spellcaster', level: 6 }),
  card(23, 'Dragonfire', { ...TRAP }),
  card(24, 'Skill Dragon', { cardType: 'Skill Card', frameType: 'skill' }),
  card(25, 'Dragon Token', { cardType: 'Token', frameType: 'token', attribute: 'DARK', race: 'Dragon', level: 1 }),
  card(26, 'Link Dragon', { cardType: 'Link Monster', frameType: 'link', attribute: 'DARK', race: 'Dragon', level: null }),
  card(27, 'Dragon Spell Mismatch', { cardType: 'Normal Spell Card', frameType: 'monster' }),
  card(28, 'dragon', { description: 'Exact match on a lowercase name.' }),
  card(29, 'The Dark Dragon of the Dark', { attribute: 'DARK', race: 'Dragon', level: 8 }),
  card(30, 'Ra the Sun God', { attribute: 'DIVINE', race: 'Divine-Beast', level: 10, description: 'Dragon-like divine beast.' }),
  // Para 'blue eyes': los dos "contienen" la consulta (240); si "palabra" valiera para consultas de varias palabras, el segundo pasaría al primer lugar.
  card(31, 'Alpha Superblue Eyes'),
  card(32, 'Zeta Blue Eyes'),
]

const QUERIES = [
  'dragon', 'dr', 'Dragon', 'DRAGON', 'blue-eyes', 'blue eyes', 'blue', 'eyes', 'dark mag', 'dark magician', 'magician', 'senor', 'señor',
  'SEÑOR', 'evocateur', 'uber', 'über', 'crepe', 'x', 'destruction', 'legendary dragon', '  dragon  ', 'dragon rider', 'dragon knight',
  'ra', 'of', 'the dark', 'a', 'fullwidth', 'sangan', '1500', 'zurich', '',
]

const FILTERS: Array<Partial<CardSearchFilters>> = [
  {},
  { quickType: 'monster' },
  { quickType: 'spell' },
  { quickType: 'trap' },
  { exactType: 'Normal Spell Card' },
  { exactType: 'normal spell card' },
  { attribute: 'dark' },
  { attribute: 'DARK', race: 'spellcaster' },
  { race: 'Dragon', level: '7' },
  { level: '8', quickType: 'monster' },
  { archetype: 'blue-eyes' },
  { archetype: 'Évocateur' },
  { archetype: 'evocateur' },
  { description: 'dragon' },
  { description: 'DESTRUCTION' },
  { legalOnly: true },
  { legalOnly: true, quickType: 'monster', attribute: 'light' },
  { description: 'destroy', quickType: 'spell', legalOnly: true },
]

const FORMATS: DeckFormat[] = ['tcg', 'ocg', 'goat', 'edison', 'unlimited', 'genesys']

function positions(results: ApiCardSearchResult[], catalog: ApiCardSearchResult[]): number[] {
  return results.map((result) => catalog.indexOf(result))
}

describe('búsqueda local en el catálogo', () => {
  it('da las mismas cartas en el mismo orden que el algoritmo anterior, para cada consulta, filtro y formato', () => {
    const index = buildSearchableCardIndex(CATALOG)

    for (const query of QUERIES) {
      for (const updates of FILTERS) {
        const filters = { ...DEFAULT_CARD_SEARCH_FILTERS, ...updates }

        for (const format of FORMATS) {
          const expected = positions(legacySearch(CATALOG, query, filters, format), CATALOG)

          expect(positions(searchCardCatalog(index, query, filters, format), CATALOG), `${JSON.stringify(query)} ${JSON.stringify(updates)} ${format}`).toEqual(expected)
        }
      }
    }
  })

  it('una consulta con espacio no cuenta como palabra del nombre: "blue eyes" sólo "contiene" (240)', () => {
    const results = searchCardCatalog(buildSearchableCardIndex(CATALOG), 'blue eyes', DEFAULT_CARD_SEARCH_FILTERS, 'tcg')

    // Mismo puntaje, así que desempata el nombre: Alpha antes que Dragon antes que Zeta.
    expect(results.map((result) => result.ygoprodeckId)).toEqual([31, 7, 32])
  })

  it('el orden de la búsqueda remota (sortSearchResults) no cambia', () => {
    for (const query of QUERIES) {
      const expected = positions([...CATALOG].sort((left, right) => legacyCompare(left, right, legacyNormalize(query))), CATALOG)

      expect(positions(sortSearchResults(CATALOG, query), CATALOG), JSON.stringify(query)).toEqual(expected)
    }
  })

  const WORDS = ['Dark', 'Dragon', 'Blue-Eyes', 'Blue', 'Eyes', 'Magician', 'Girl', 'dark', 'Évocateur', 'Señor', 'Über', 'of', 'the', 'Crêpe', 'Ａ', 'ﬁre', 'Ra', 'a']
  const TYPES = [
    ['Effect Monster', 'effect'],
    ['Normal Monster', 'normal'],
    ['Normal Spell Card', 'spell'],
    ['Normal Trap Card', 'trap'],
    ['Skill Card', 'skill'],
    ['Token', 'token'],
    ['Link Monster', 'link'],
    ['Normal Spell Card', 'monster'],
  ]
  const status = fc.constantFrom<BanlistStatus | null>(null, 'forbidden', 'limited', 'semi-limited', 'unlimited')
  const nameArbitrary = fc
    .array(fc.tuple(fc.constantFrom(...WORDS), fc.constantFrom(' ', ' ', ' ', '  ', ' ')), { minLength: 1, maxLength: 4 })
    .map((parts) => parts.map(([word, gap], position) => (position === 0 ? word : gap + word)).join(''))
  const cardArbitrary = fc
    .record({
      id: fc.nat(20),
      name: nameArbitrary,
      type: fc.constantFrom(...TYPES),
      description: fc.option(fc.array(fc.constantFrom(...WORDS), { maxLength: 6 }).map((words) => words.join(' ')), { nil: null }),
      attribute: fc.constantFrom(null, 'DARK', 'LIGHT', 'EARTH'),
      race: fc.constantFrom(null, 'Dragon', 'Spellcaster', 'Warrior'),
      level: fc.constantFrom(null, 1, 4, 7, 8),
      archetype: fc.constantFrom(null, 'Blue-Eyes', 'Dark Magician', 'Évocateur'),
      banlist: fc.record({ tcg: status, ocg: status, goat: status }),
    })
    .map((spec) =>
      card(spec.id, spec.name, {
        cardType: spec.type[0],
        frameType: spec.type[1],
        description: spec.description,
        attribute: spec.attribute,
        race: spec.race,
        level: spec.level,
        archetype: spec.archetype,
        banlist: spec.banlist,
      }),
    )
  const queryArbitrary = fc.oneof(
    fc.constantFrom('dr', 'dragon', 'dark', 'blue-eyes', 'blue eyes', 'senor', 'über', 'uber', 'dark magician', 'a', 'of the', ' dragon ', 'x', 'fire', 'fi', 'ra', ''),
    fc.constantFrom(...WORDS).chain((word) => fc.nat(word.length).map((length) => word.slice(0, length))),
    fc.string({ maxLength: 5 }),
  )
  const filtersArbitrary = fc.record({
    quickType: fc.constantFrom<CardSearchFilters['quickType']>('all', 'all', 'monster', 'spell', 'trap'),
    archetype: fc.constantFrom('', '', 'blue-eyes', 'Évocateur', 'evocateur'),
    exactType: fc.constantFrom('', '', 'Normal Spell Card', 'effect monster'),
    attribute: fc.constantFrom('', '', 'dark', 'LIGHT'),
    race: fc.constantFrom('', '', 'dragon', 'Warrior'),
    level: fc.constantFrom('', '', '4', '7'),
    description: fc.constantFrom('', '', 'dragon', 'señor', 'dark of'),
    legalOnly: fc.boolean(),
  })

  it('con catálogos al azar (nombres repetidos, ids repetidos, tipos cruzados) sigue dando el orden de antes', () => {
    fc.assert(
      fc.property(
        fc.array(cardArbitrary, { maxLength: 30 }),
        queryArbitrary,
        filtersArbitrary,
        fc.constantFrom(...FORMATS),
        (catalog, query, filters, format) => {
          const expected = positions(legacySearch(catalog, query, filters, format), catalog)

          expect(positions(searchCardCatalog(buildSearchableCardIndex(catalog), query, filters, format), catalog)).toEqual(expected)
          expect(positions(sortSearchResults(catalog, query), catalog)).toEqual(
            positions([...catalog].sort((left, right) => legacyCompare(left, right, legacyNormalize(query))), catalog),
          )
        },
      ),
      { numRuns: 300 },
    )
  })
})

describe('normalizeSearchText', () => {
  const SPECIALS = ['a', 'B', 'é', 'é', '̈', '¨', 'Ａ', 'ﬁ', 'Ǆ', ' ', ' ', '  ', '\t', '\n', '\r\n', ' ', '﻿', ' ', '　', '-', '’', '●', '😀']

  it('da lo mismo que la versión de antes (NFKD, sin marcas, espacios colapsados, minúsculas) en casos de borde', () => {
    const cases = [
      '', ' ', '  ', 'a  b', ' a', 'a ', ' a ', 'a\tb', 'a\nb', 'a b', '﻿a', 'a b', 'é', 'Crêpe', 'Señor', 'Ａ', 'ﬁre',
      // `¨` se descompone en un espacio más una marca: el espacio aparece recién después de normalizar.
      '¨a', 'a¨b', 'a¨ b', 'a ¨b', 'Dragon  Knight', 'Blue-Eyes  White Dragon', 'ABC', 'abc', 'Dark Magician',
    ]

    for (const value of cases) {
      expect(normalizeSearchText(value), JSON.stringify(value)).toBe(legacyNormalize(value))
    }
  })

  it('da lo mismo que la versión de antes con cualquier texto', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ maxLength: 40 }),
          fc.string({ unit: 'binary', maxLength: 40 }),
          fc.array(fc.constantFrom(...SPECIALS), { maxLength: 12 }).map((parts) => parts.join('')),
        ),
        (value) => {
          expect(normalizeSearchText(value)).toBe(legacyNormalize(value))
        },
      ),
      { numRuns: 1000 },
    )
  })
})
