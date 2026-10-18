import { describe, expect, it } from 'vitest'

import {
  abilitiesOf,
  compileLocalCardFilters,
  EFFECT_KEYS,
  effectMaskOf,
  EMPTY_RANGE,
  frameOf,
  hasLocalFilters,
  inRange,
  limitOf,
  matchesLocalCardFilters,
  spellTrapKindOf,
  type EffectKey,
  type LocalCardFilters,
} from '../app/card-filters'
import type { ApiCardReference } from '../types'

const card = (overrides: Partial<ApiCardReference> = {}): ApiCardReference => ({
  ygoprodeckId: 1, cardType: 'Effect Monster', frameType: 'effect', description: null, race: 'Dragon', attribute: 'DARK', level: 4, linkValue: null,
  atk: '1800', def: '1000', archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null, banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null }, ...overrides,
})

const NO_FILTERS: LocalCardFilters = { frames: [], attributes: [], spellTrapKinds: [], races: [], abilities: [], limits: [], effects: [], level: EMPTY_RANGE, atk: EMPTY_RANGE, def: EMPTY_RANGE, genesysPoints: EMPTY_RANGE }
const withFilters = (updates: Partial<LocalCardFilters>): LocalCardFilters => ({ ...NO_FILTERS, ...updates })

describe('el marco de la carta', () => {
  it('sale del marco que dice el dato, y un péndulo es un marco aparte sea cual sea su otra mitad', () => {
    expect(frameOf({ frameType: 'effect' })).toBe('effect')
    expect(frameOf({ frameType: 'XYZ' })).toBe('xyz')
    expect(frameOf({ frameType: 'effect_pendulum' })).toBe('pendulum')
    expect(frameOf({ frameType: 'synchro_pendulum' })).toBe('pendulum')
    expect(frameOf({ frameType: 'spell' })).toBe('spell')
  })
})

describe('habilidades, subtipos y límites', () => {
  it('las habilidades salen del tipo: un afinador normal es afinador y sin efecto; una mágica no tiene', () => {
    expect(abilitiesOf({ cardType: 'Toon Monster' })).toEqual(['toon'])
    expect(abilitiesOf({ cardType: 'Flip Effect Monster' })).toEqual(['flip'])
    expect(abilitiesOf({ cardType: 'Normal Tuner Monster' })).toEqual(['tuner', 'non-effect'])
    expect(abilitiesOf({ cardType: 'Union Effect Monster' })).toEqual(['union'])
    expect(abilitiesOf({ cardType: 'Effect Monster' })).toEqual([])
    expect(abilitiesOf({ cardType: 'Normal Spell Card' })).toEqual([])
  })

  it('el subtipo de mágica o trampa viene en la raza', () => {
    expect(spellTrapKindOf({ cardType: 'Quick-Play Spell Card', race: 'Quick-Play' })).toBe('spell:Quick-Play')
    expect(spellTrapKindOf({ cardType: 'Counter Trap Card', race: 'Counter' })).toBe('trap:Counter')
    expect(spellTrapKindOf({ cardType: 'Effect Monster', race: 'Dragon' })).toBeNull()
    expect(spellTrapKindOf({ cardType: 'Normal Spell Card', race: null })).toBeNull()
  })

  it('el límite es lo que deja la lista del formato: prohibida, limitada, semi-limitada o sin límite', () => {
    const banned = card({ banlist: { tcg: 'forbidden', ocg: 'limited', goat: null } })

    expect(limitOf(banned, 'tcg')).toBe('forbidden')
    expect(limitOf(banned, 'ocg')).toBe('limited')
    expect(limitOf(card({ banlist: { tcg: 'semi-limited', ocg: null, goat: null } }), 'tcg')).toBe('semi-limited')
    expect(limitOf(card(), 'tcg')).toBe('unlimited')
  })
})

describe('las cotas', () => {
  it('una cota vacía o que no es un número no pone límite; con una puesta, lo que no tiene el dato queda afuera', () => {
    expect(inRange(2500, { min: '2000', max: '3000' })).toBe(true)
    expect(inRange(1500, { min: '2000', max: '' })).toBe(false)
    expect(inRange(3500, { min: '', max: '3000' })).toBe(false)
    expect(inRange(null, { min: '1', max: '' })).toBe(false)
    expect(inRange(null, EMPTY_RANGE)).toBe(true)
    expect(inRange(5, { min: 'x', max: '' })).toBe(true)
    expect(inRange(0, { min: '0', max: '0' })).toBe(true)
  })
})

describe('los efectos por el texto de la carta', () => {
  // Textos de cartas conocidas: lo que las expresiones tienen que reconocer (y lo que no).
  const TEXT: Record<string, string> = {
    raigeki: 'Destroy all monsters your opponent controls.',
    feather: 'Destroy all Spells and Traps your opponent controls.',
    reborn: 'Target 1 monster in either GY; Special Summon it.',
    greed: 'Draw 2 cards.',
    burial: 'Send 1 monster from your Deck to the GY.',
    calledByTheGrave: "Target 1 monster in your opponent's GY; banish it, and if you do, until the end of the next turn, its effects are negated.",
    searcher: "Add 1 'Blue-Eyes' monster from your Deck to your hand.",
    bounce: 'Return 1 monster on the field to the hand.',
    shuffle: 'Shuffle 1 monster in your GY into the Deck.',
    control: 'Take control of 1 monster your opponent controls until the End Phase.',
    burn: 'Inflict 500 damage to your opponent.',
    heal: 'Gain 1000 LP.',
    tokens: 'Special Summon 2 Tokens.',
  }
  const effectsOf = (text: string) => EFFECT_KEYS.filter((key) => (effectMaskOf(text) & (1 << EFFECT_KEYS.indexOf(key))) !== 0)

  it('reconoce lo común de cada categoría', () => {
    expect(effectsOf(TEXT.raigeki!)).toEqual(['destroy-monster'])
    expect(effectsOf(TEXT.feather!)).toEqual(['destroy-spell-trap'])
    expect(effectsOf(TEXT.reborn!)).toEqual(['special-summon', 'graveyard'])
    expect(effectsOf(TEXT.greed!)).toEqual(['draw'])
    expect(effectsOf(TEXT.burial!)).toEqual(['graveyard'])
    expect(effectsOf(TEXT.calledByTheGrave!)).toEqual(['banish', 'graveyard', 'negate'])
    expect(effectsOf(TEXT.searcher!)).toEqual(['search'])
    expect(effectsOf(TEXT.bounce!)).toEqual(['back-to-hand'])
    expect(effectsOf(TEXT.shuffle!)).toEqual(['graveyard', 'back-to-deck'])
    expect(effectsOf(TEXT.control!)).toEqual(['control'])
    expect(effectsOf(TEXT.burn!)).toEqual(['damage'])
    expect(effectsOf(TEXT.heal!)).toEqual(['recover'])
    expect(effectsOf(TEXT.tokens!)).toEqual(['special-summon', 'token'])
  })

  it('un texto sin ese efecto, vacío o sin texto no marca nada', () => {
    expect(effectMaskOf('A legendary dragon with a body of white.')).toBe(0)
    expect(effectMaskOf('')).toBe(0)
    expect(effectMaskOf(null)).toBe(0)
  })

  it('cada categoría ocupa un bit propio (caben en un entero chico)', () => {
    expect(EFFECT_KEYS.length).toBeLessThanOrEqual(16)
    expect(new Set(EFFECT_KEYS.map((key) => 1 << EFFECT_KEYS.indexOf(key))).size).toBe(EFFECT_KEYS.length)
  })

  it('el texto de una carta larga, sin puntos ni nada que calce, no se traba', () => {
    const long = 'add '.repeat(300) + 'from your deck '.repeat(40)
    const started = performance.now()

    effectMaskOf(long)

    expect(performance.now() - started).toBeLessThan(200)
  })
})

describe('filtros compilados', () => {
  const effectKey = (key: EffectKey) => withFilters({ effects: [key] })

  it('sin ningún filtro no hay nada que compilar', () => {
    expect(compileLocalCardFilters(NO_FILTERS, 'tcg')).toBeNull()
    expect(hasLocalFilters(NO_FILTERS, 'tcg')).toBe(false)
    expect(matchesLocalCardFilters(card(), NO_FILTERS, 'tcg')).toBe(true)
  })

  it('dentro de un grupo vale cualquiera; entre grupos tienen que cumplirse todos', () => {
    const filters = withFilters({ attributes: ['DARK', 'LIGHT'], races: ['Dragon'] })

    expect(matchesLocalCardFilters(card({ attribute: 'LIGHT' }), filters, 'tcg')).toBe(true)
    expect(matchesLocalCardFilters(card({ attribute: 'FIRE' }), filters, 'tcg')).toBe(false)
    expect(matchesLocalCardFilters(card({ attribute: 'DARK', race: 'Warrior' }), filters, 'tcg')).toBe(false)
  })

  it('el tipo de monstruo no deja pasar a una mágica con esa raza', () => {
    expect(matchesLocalCardFilters(card({ cardType: 'Normal Spell Card', frameType: 'spell', race: 'Normal', attribute: null }), withFilters({ races: ['Normal'] }), 'tcg')).toBe(false)
  })

  it('el efecto usa la máscara que trae el índice, y si no la tiene, la calcula del texto', () => {
    const banisher = card({ description: 'Banish 1 card.' })
    const predicate = compileLocalCardFilters(effectKey('banish'), 'tcg')!

    expect(predicate(banisher)).toBe(true)
    expect(predicate(card({ description: 'Draw 1 card.' }))).toBe(false)
    // Con la máscara a mano no mira el texto: la que se pasa manda.
    expect(predicate(card({ description: 'Draw 1 card.' }), effectMaskOf('Banish 1 card.'))).toBe(true)
  })

  it('la limitación sólo vale en los formatos con lista; en el libre y en Genesys se ignora', () => {
    const filters = withFilters({ limits: ['forbidden'] })
    const banned = card({ banlist: { tcg: 'forbidden', ocg: null, goat: null } })

    expect(matchesLocalCardFilters(banned, filters, 'tcg')).toBe(true)
    expect(matchesLocalCardFilters(card(), filters, 'tcg')).toBe(false)
    expect(matchesLocalCardFilters(card(), filters, 'unlimited')).toBe(true)
    expect(hasLocalFilters(filters, 'genesys')).toBe(false)
  })

  it('el nivel de un enlace es su valor de enlace, y las cartas que no son monstruos no tienen nivel', () => {
    const link = card({ cardType: 'Link Monster', frameType: 'link', level: null, linkValue: 3 })

    expect(matchesLocalCardFilters(link, withFilters({ level: { min: '3', max: '3' } }), 'tcg')).toBe(true)
    expect(matchesLocalCardFilters(card({ cardType: 'Normal Spell Card', frameType: 'spell', level: null }), withFilters({ level: { min: '1', max: '' } }), 'tcg')).toBe(false)
  })

  it('un ATK «?» o ausente queda afuera cuando hay cota, y los puntos Genesys sólo cuentan en ese formato', () => {
    expect(matchesLocalCardFilters(card({ atk: '?' }), withFilters({ atk: { min: '0', max: '' } }), 'tcg')).toBe(false)
    expect(matchesLocalCardFilters(card({ atk: '0' }), withFilters({ atk: { min: '0', max: '0' } }), 'tcg')).toBe(true)

    const points = withFilters({ genesysPoints: { min: '3', max: '5' } })

    expect(matchesLocalCardFilters(card({ genesys: { points: 4 } }), points, 'genesys')).toBe(true)
    expect(matchesLocalCardFilters(card({ genesys: { points: 9 } }), points, 'genesys')).toBe(false)
    expect(matchesLocalCardFilters(card({ genesys: { points: 9 } }), points, 'tcg')).toBe(true)
  })
})
