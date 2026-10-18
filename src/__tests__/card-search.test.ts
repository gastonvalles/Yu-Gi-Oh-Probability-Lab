import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  buildSearchableCardIndex,
  DEFAULT_CARD_SEARCH_FILTERS,
  searchCardCatalog,
  sortSearchResults,
  type CardSearchFilters,
} from '../app/card-search'
import { abilitiesOf, frameOf, limitOf, matchesEffect, spellTrapKindOf, type EffectKey } from '../app/card-filters'
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

const isMonster = (card: ApiCardSearchResult) => card.cardType.toLowerCase().includes('monster')
const bound = (text: string) => (text.trim() === '' ? null : Number(text))
const within = (value: number | null, range: { min: string; max: string }) => {
  const min = bound(range.min)
  const max = bound(range.max)

  if (min === null && max === null) return true

  return value !== null && !Number.isNaN(value) && (min === null || value >= min) && (max === null || value <= max)
}
const stat = (value: string | null) => (value === null || Number.isNaN(Number(value)) ? null : Number(value))
const same = (left: string | null, right: string) => (left ?? '').toLowerCase() === right.toLowerCase()
// Los bits de `POOL_BITS` escritos a mano: tcg 1, ocg 2, master-duel 4, duel-links 8, speed-duel 16.
const inPool = (card: ApiCardSearchResult, key: string) => {
  const pools = card.pools ?? 0
  const tcg = (pools & 1) !== 0
  const ocg = (pools & 2) !== 0

  return key === 'tcg' ? tcg : key === 'ocg' ? ocg : key === 'tcg-only' ? tcg && !ocg : key === 'ocg-only' ? ocg && !tcg : (pools & ({ 'master-duel': 4, 'duel-links': 8, 'speed-duel': 16 }[key] ?? 0)) !== 0
}

/** Los filtros de chips, cotas y efectos, uno por uno y de la forma más directa: lo que el filtro compilado y la máscara de efectos tienen que seguir dando. */
function naiveLocalMatch(card: ApiCardSearchResult, filters: CardSearchFilters, deckFormat: DeckFormat): boolean {
  const hasLimits = deckFormat !== 'unlimited' && deckFormat !== 'genesys'

  return (
    (filters.frames.length === 0 || filters.frames.includes(frameOf(card))) &&
    (filters.attributes.length === 0 || filters.attributes.some((value) => same(card.attribute, value))) &&
    (filters.spellTrapKinds.length === 0 || filters.spellTrapKinds.some((value) => same(spellTrapKindOf(card), value))) &&
    (filters.races.length === 0 || (isMonster(card) && filters.races.some((value) => same(card.race, value)))) &&
    (filters.abilities.length === 0 || filters.abilities.some((ability) => (abilitiesOf(card) as string[]).includes(ability))) &&
    (filters.limits.length === 0 || !hasLimits || filters.limits.includes(limitOf(card, deckFormat))) &&
    (filters.pools.length === 0 || filters.pools.some((key) => inPool(card, key))) &&
    (filters.effects.length === 0 || filters.effects.some((key) => matchesEffect(key as EffectKey, card.description))) &&
    within(isMonster(card) ? (card.level ?? card.linkValue) : null, filters.level) &&
    within(stat(card.atk), filters.atk) &&
    within(stat(card.def), filters.def) &&
    within(card.scale ?? null, filters.scale) &&
    within(card.year ?? null, filters.year) &&
    (deckFormat !== 'genesys' || within(card.genesys.points, filters.genesysPoints))
  )
}

function legacySearch(
  cards: ApiCardSearchResult[],
  rawQuery: string,
  filters: CardSearchFilters,
  deckFormat: DeckFormat,
): ApiCardSearchResult[] {
  const query = legacyNormalize(rawQuery)
  const archetype = legacyNormalize(filters.archetype)
  const description = legacyNormalize(filters.description)

  return cards
    .filter(
      (card) =>
        (archetype.length === 0 || legacyNormalize(card.archetype ?? '') === archetype) &&
        (description.length === 0 || legacyNormalize(card.description ?? '').includes(description)) &&
        naiveLocalMatch(card, filters, deckFormat) &&
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

const SPELL = { cardType: 'Normal Spell Card', frameType: 'spell', race: 'Normal' }
const TRAP = { cardType: 'Normal Trap Card', frameType: 'trap', race: 'Normal' }

const BASE_CATALOG: ApiCardSearchResult[] = [
  card(1, 'Blue-Eyes White Dragon', { attribute: 'LIGHT', race: 'Dragon', level: 8, archetype: 'Blue-Eyes', description: 'This legendary dragon is a powerful engine of destruction.', banlist: { tcg: 'unlimited', ocg: 'limited', goat: 'forbidden' } }),
  card(2, 'Blue-Eyes Ultimate Dragon', { attribute: 'LIGHT', race: 'Dragon', level: 12, archetype: 'Blue-Eyes', cardType: 'Fusion Monster', frameType: 'fusion' }),
  card(3, 'Dark Magician', { attribute: 'DARK', race: 'Spellcaster', level: 7, archetype: 'Dark Magician', description: 'The ultimate wizard in terms of attack and defense.' }),
  card(4, 'Dark Magician Girl', { attribute: 'DARK', race: 'Spellcaster', level: 6, archetype: 'Dark Magician', banlist: { tcg: 'semi-limited', ocg: 'forbidden', goat: null } }),
  card(5, 'Magician of Dark Illusion', { attribute: 'DARK', race: 'Spellcaster', level: 7, archetype: 'Dark Magician', cardType: 'Pendulum Effect Monster', frameType: 'effect_pendulum' }),
  card(6, 'Red-Eyes Black Dragon', { attribute: 'DARK', race: 'Dragon', level: 7, archetype: 'Red-Eyes' }),
  card(7, 'Dragon Ruler of Blue Eyes', { attribute: 'WIND', race: 'Dragon', level: 7, description: 'Destroy this card to Special Summon a Dragon.' }),
  card(8, 'Pot of Greed', { ...SPELL, banlist: { tcg: 'forbidden', ocg: 'forbidden', goat: 'forbidden' }, description: 'Draw 2 cards.' }),
  card(9, 'Mystical Space Typhoon', { cardType: 'Quick-Play Spell Card', frameType: 'spell', race: 'Quick-Play', description: 'Destroy 1 Spell/Trap on the field.' }),
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
  // Para los filtros de habilidades, de efecto y de estadísticas.
  card(33, 'Toon Dragon', { cardType: 'Toon Monster', attribute: 'DARK', race: 'Dragon', level: 4, atk: '1800', def: '1200', description: 'Banish this card from your GY: Draw 1 card.', genesys: { points: 3 } }),
  card(34, 'Flip Warrior', { cardType: 'Flip Effect Monster', attribute: 'EARTH', race: 'Warrior', level: 4, atk: '1600', def: '1000', description: 'FLIP: Destroy 1 Spell/Trap on the field.' }),
  card(35, 'Vanilla Fairy', { cardType: 'Normal Monster', frameType: 'normal', attribute: 'LIGHT', race: 'Fairy', level: 3, atk: '1200', def: '1000' }),
  card(36, 'Tuner Beast', { cardType: 'Tuner Monster', attribute: 'EARTH', race: 'Beast', level: 2, atk: '500', def: '0', description: 'You can Special Summon this card from your hand. Take control of 1 monster your opponent controls.', genesys: { points: 5 } }),
  card(37, 'Counter Hole', { cardType: 'Counter Trap Card', frameType: 'trap', race: 'Counter', description: 'When a monster effect is activated: Negate the activation, and if you do, destroy it.' }),
  card(38, 'Spirit Token Maker', { cardType: 'Spirit Monster', attribute: 'WIND', race: 'Fairy', level: 4, atk: '?', def: '?', description: 'Special Summon 1 Token. Add 1 Spirit monster from your Deck to your hand.' }),
  card(39, 'Gemini Fighter', { cardType: 'Gemini Monster', attribute: 'EARTH', race: 'Warrior', level: 4, atk: '1900', def: '1700' }),
  card(40, 'Pendulum Sage', { cardType: 'Pendulum Normal Monster', frameType: 'normal_pendulum', attribute: 'LIGHT', race: 'Spellcaster', level: 6, atk: '2000', def: '1500' }),
]

// Estadísticas de algunas cartas de arriba (con «?» y sin datos, para las cotas).
const STATS: Record<number, Partial<ApiCardSearchResult>> = {
  6: { atk: '2400', def: '2000' },
  7: { atk: '2500', def: '1500' },
  20: { atk: '1000', def: '600' },
  26: { atk: '2300' },
  30: { atk: '?', def: '?' },
  // Escala, año y formatos (tcg 1, ocg 2, master-duel 4, duel-links 8, speed-duel 16) de algunas: el resto queda sin datos, como una carta que no vino del catálogo.
  1: { atk: '3000', def: '2500', genesys: { points: 8 }, year: 2002, pools: 1 | 2 | 4 },
  2: { atk: '4500', def: '3800', year: 2004, pools: 1 | 2 | 8 },
  3: { atk: '2500', def: '2100', year: 2019, pools: 1 },
  4: { atk: '2000', def: '1700', year: 2019, pools: 2 },
  5: { atk: '2500', def: '2100', year: 2021, pools: 2 | 4 },
  40: { scale: 1, year: 2014, pools: 1 | 2 },
}
const CATALOG: ApiCardSearchResult[] = BASE_CATALOG.map((entry) => ({ ...entry, ...STATS[entry.ygoprodeckId] }))

const QUERIES = [
  'dragon', 'dr', 'Dragon', 'DRAGON', 'blue-eyes', 'blue eyes', 'blue', 'eyes', 'dark mag', 'dark magician', 'magician', 'senor', 'señor',
  'SEÑOR', 'evocateur', 'uber', 'über', 'crepe', 'x', 'destruction', 'legendary dragon', '  dragon  ', 'dragon rider', 'dragon knight',
  'ra', 'of', 'the dark', 'a', 'fullwidth', 'sangan', '1500', 'zurich', '',
]

const range = (min: string, max: string) => ({ min, max })
const FILTERS: Array<Partial<CardSearchFilters>> = [
  {},
  { frames: ['effect'] },
  { frames: ['spell', 'trap'] },
  { frames: ['pendulum'] },
  { frames: ['normal', 'link', 'fusion'] },
  { spellTrapKinds: ['spell:Normal'] },
  { spellTrapKinds: ['spell:Quick-Play', 'trap:Counter'] },
  { attributes: ['dark'] },
  { attributes: ['DARK', 'LIGHT'], races: ['spellcaster'] },
  { races: ['Dragon'], level: range('7', '7') },
  { level: range('8', ''), frames: ['normal', 'effect', 'fusion'] },
  { level: range('', '4') },
  { atk: range('2500', '') },
  { atk: range('1000', '2000'), def: range('', '1700') },
  { abilities: ['toon', 'flip'] },
  { abilities: ['non-effect'] },
  { abilities: ['tuner', 'spirit', 'gemini'] },
  { limits: ['forbidden'] },
  { limits: ['limited', 'semi-limited'], legalOnly: true },
  { effects: ['banish'] },
  { effects: ['draw', 'search'] },
  { effects: ['destroy-spell-trap', 'destroy-monster', 'negate'] },
  { effects: ['special-summon'], attributes: ['EARTH', 'WIND'] },
  { genesysPoints: range('3', '5') },
  { pools: ['tcg'] },
  { pools: ['tcg-only'] },
  { pools: ['ocg-only', 'master-duel'] },
  { pools: ['duel-links', 'speed-duel'], frames: ['effect', 'normal'] },
  { scale: range('0', '3') },
  { scale: range('', '1'), frames: ['pendulum'] },
  { year: range('2019', '') },
  { year: range('2002', '2004'), pools: ['tcg'] },
  { archetype: 'blue-eyes' },
  { archetype: 'Évocateur' },
  { archetype: 'evocateur' },
  { description: 'dragon' },
  { description: 'DESTRUCTION' },
  { legalOnly: true },
  { legalOnly: true, frames: ['effect'], attributes: ['light'] },
  { description: 'destroy', frames: ['spell'], legalOnly: true },
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
    ['Quick-Play Spell Card', 'spell'],
    ['Normal Trap Card', 'trap'],
    ['Counter Trap Card', 'trap'],
    ['Skill Card', 'skill'],
    ['Token', 'token'],
    ['Link Monster', 'link'],
    ['Toon Monster', 'effect'],
    ['Flip Effect Monster', 'effect'],
    ['Normal Tuner Monster', 'normal'],
    ['Pendulum Effect Monster', 'effect_pendulum'],
    ['Normal Spell Card', 'monster'],
  ]
  const EFFECT_TEXTS = ['Banish 1 card.', 'Draw 2 cards.', 'Add 1 monster from your Deck to your hand.', 'Special Summon 1 Token.', 'Destroy 1 Spell/Trap.', 'Negate the activation.', 'Destroy 1 monster.', 'Send 1 card to the GY.']
  const status = fc.constantFrom<BanlistStatus | null>(null, 'forbidden', 'limited', 'semi-limited', 'unlimited')
  const nameArbitrary = fc
    .array(fc.tuple(fc.constantFrom(...WORDS), fc.constantFrom(' ', ' ', ' ', '  ', ' ')), { minLength: 1, maxLength: 4 })
    .map((parts) => parts.map(([word, gap], position) => (position === 0 ? word : gap + word)).join(''))
  const cardArbitrary = fc
    .record({
      id: fc.nat(20),
      name: nameArbitrary,
      type: fc.constantFrom(...TYPES),
      description: fc.option(fc.array(fc.constantFrom(...WORDS, ...EFFECT_TEXTS), { maxLength: 6 }).map((words) => words.join(' ')), { nil: null }),
      attribute: fc.constantFrom(null, 'DARK', 'LIGHT', 'EARTH'),
      race: fc.constantFrom(null, 'Dragon', 'Spellcaster', 'Warrior', 'Normal', 'Quick-Play', 'Counter'),
      level: fc.constantFrom(null, 1, 4, 7, 8),
      atk: fc.constantFrom(null, '0', '?', '1500', '2500'),
      def: fc.constantFrom(null, '?', '1000', '2000'),
      points: fc.constantFrom(null, 1, 3, 5),
      scale: fc.constantFrom(undefined, null, 0, 1, 4, 8),
      year: fc.constantFrom(undefined, null, 2002, 2014, 2019, 2023),
      pools: fc.constantFrom(undefined, 0, 1, 2, 3, 4, 8, 16, 3 | 4),
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
        atk: spec.atk,
        def: spec.def,
        genesys: { points: spec.points },
        ...(spec.scale !== undefined ? { scale: spec.scale } : {}),
        ...(spec.year !== undefined ? { year: spec.year } : {}),
        ...(spec.pools !== undefined ? { pools: spec.pools } : {}),
        archetype: spec.archetype,
        banlist: spec.banlist,
      }),
    )
  const queryArbitrary = fc.oneof(
    fc.constantFrom('dr', 'dragon', 'dark', 'blue-eyes', 'blue eyes', 'senor', 'über', 'uber', 'dark magician', 'a', 'of the', ' dragon ', 'x', 'fire', 'fi', 'ra', ''),
    fc.constantFrom(...WORDS).chain((word) => fc.nat(word.length).map((length) => word.slice(0, length))),
    fc.string({ maxLength: 5 }),
  )
  const subset = <T extends string>(values: T[]) => fc.subarray(values, { maxLength: 2 })
  const rangeArbitrary = fc.constantFrom(range('', ''), range('', ''), range('1', ''), range('', '4'), range('2', '8'), range('1000', '2500'), range('', '2000'), range('?', ''))
  const filtersArbitrary = fc.record({
    archetype: fc.constantFrom('', '', 'blue-eyes', 'Évocateur', 'evocateur'),
    description: fc.constantFrom('', '', 'dragon', 'señor', 'dark of'),
    legalOnly: fc.boolean(),
    frames: subset(['normal', 'effect', 'fusion', 'pendulum', 'link', 'spell', 'trap']),
    attributes: subset(['dark', 'LIGHT', 'EARTH']),
    spellTrapKinds: subset(['spell:Normal', 'spell:Quick-Play', 'trap:Counter', 'trap:Normal']),
    races: subset(['dragon', 'Warrior', 'Spellcaster']),
    abilities: subset(['toon', 'flip', 'tuner', 'non-effect']),
    limits: subset(['forbidden', 'limited', 'semi-limited', 'unlimited']),
    pools: subset(['tcg', 'ocg', 'tcg-only', 'ocg-only', 'master-duel', 'duel-links', 'speed-duel']),
    effects: subset(['banish', 'draw', 'search', 'special-summon', 'destroy-monster', 'destroy-spell-trap', 'negate', 'graveyard']),
    level: rangeArbitrary,
    atk: rangeArbitrary,
    def: rangeArbitrary,
    scale: rangeArbitrary,
    year: fc.constantFrom(range('', ''), range('', ''), range('2005', ''), range('', '2014'), range('2002', '2019'), range('2023', '2023')),
    genesysPoints: rangeArbitrary,
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
