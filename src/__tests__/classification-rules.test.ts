import { afterEach, describe, expect, it } from 'vitest'

import { indexCardRules, setCardRulesForTests } from '../app/card-rules'
import { CARD_RULE } from '../app/card-script-rules'
import { classifyCard, deriveOrigin } from '../app/classification-engine'
import type { ApiCardReference } from '../types'

const card = (overrides: Partial<ApiCardReference>): ApiCardReference => ({
  ygoprodeckId: 1, cardType: 'Effect Monster', frameType: 'effect', description: null, race: null, attribute: null, level: 4,
  linkValue: null, atk: '0', def: '0', archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null,
  banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null },
  ...overrides,
})
const R = CARD_RULE
const rules = (flags: number) => setCardRulesForTests(new Map([[1, flags]]))

afterEach(() => setCardRulesForTests(null))

describe('clasificador con las reglas de la carta', () => {
  it('los roles que son reglas puras salen del script, según el tipo de carta', () => {
    rules(R.negate)
    expect(classifyCard(card({ cardType: 'Trap Card', frameType: 'trap' }))).toEqual({ origin: 'non_engine', roles: ['disruption'] })

    rules(R.hitsOpponent)
    expect(classifyCard(card({ cardType: 'Spell Card', frameType: 'spell' }))).toEqual({ origin: 'non_engine', roles: ['boardbreaker'] })

    rules(R.hitsEither)
    expect(classifyCard(card({ cardType: 'Spell Card', frameType: 'spell' })).roles).toEqual(['boardbreaker'])
    expect(classifyCard(card({ cardType: 'Quick-Play Spell', frameType: 'spell' })).roles).toEqual(['disruption'])

    rules(R.selfFromHand | R.search)
    expect(classifyCard(card({}))).toEqual({ origin: 'engine', roles: ['searcher', 'extender'] })

    // Una hand trap siempre frena (disruption); una pieza de engine siempre continúa la jugada (extender).
    rules(R.handtrap | R.draw)
    expect(classifyCard(card({}))).toEqual({ origin: 'engine', roles: ['handtrap', 'draw', 'disruption', 'extender'] })

    rules(R.quickFromField | R.negate)
    expect(classifyCard(card({})).roles).toEqual(['disruption'])

    rules(R.floodgate)
    expect(classifyCard(card({ cardType: 'Continuous Trap', frameType: 'trap' })).roles).toEqual(['floodgate'])

    // Lollipo☆Yummy: se invoca sola y al entrar baraja una carta del cementerio rival; como es de engine y de nivel bajo, con ella arrancás.
    rules(R.selfFromHand | R.usesHand | R.hitsGrave | R.mentions | R.onSummon)
    expect(classifyCard(card({ level: 1 }))).toEqual({ origin: 'engine', roles: ['extender', 'disruption', 'starter'] })
    // Una genérica con efecto al invocarse, o un monstruo de nivel alto, no.
    rules(R.onSummon | R.mentions | R.generic | R.hitsGrave)
    expect(classifyCard(card({ level: 1 })).roles).toEqual(['disruption'])
    rules(R.onSummon | R.mentions | R.hitsGrave)
    expect(classifyCard(card({ level: 8 })).roles).toEqual(['disruption'])
  })

  it('enabler y payoff según el criterio de Gastón: cuerpos de engine que buscan o recuperan, jefes rituales, magias de ritual y de campo', () => {
    // Cupsy: nivel 1 de engine que busca → enabler. Lollipo: sólo interactúa → no.
    rules(R.search | R.selfFromHand | R.usesHand | R.onSummon | R.mentions)
    expect(classifyCard(card({ level: 1 })).roles).toEqual(['searcher', 'extender', 'starter', 'enabler'])
    rules(R.hitsGrave | R.selfFromHand | R.usesHand | R.onSummon | R.mentions)
    expect(classifyCard(card({ level: 1 })).roles).toEqual(['extender', 'disruption', 'starter'])

    // Futsu: jefe ritual sin efecto de campo, igual payoff; Habakiri abre desde la mano, además enabler.
    rules(R.search | R.recovery | R.mentions)
    expect(classifyCard(card({ cardType: 'Ritual Effect Monster', frameType: 'ritual', level: 7 })).roles).toEqual(['searcher', 'recovery', 'payoff', 'extender'])
    rules(R.recruit | R.starts | R.search | R.usesHand | R.mentions)
    expect(classifyCard(card({ cardType: 'Ritual Effect Monster', frameType: 'ritual', level: 8 })).roles).toEqual(['searcher', 'starter', 'enabler', 'payoff', 'extender'])

    // Magia de ritual y magia de campo de un arquetipo: habilitan la línea y son su payoff.
    // Como vienen de la API: tipo "Spell Card" y subtipo en race.
    rules(R.mentions)
    expect(classifyCard(card({ cardType: 'Spell Card', race: 'Ritual', frameType: 'spell' })).roles).toEqual(['enabler', 'payoff', 'extender'])
    rules(R.recovery | R.mentions)
    expect(classifyCard(card({ cardType: 'Spell Card', race: 'Field', frameType: 'spell' })).roles).toEqual(['recovery', 'enabler', 'payoff', 'extender'])
    // Una magia de campo genérica no es enabler ni payoff de nadie.
    rules(R.generic)
    expect(classifyCard(card({ cardType: 'Spell Card', race: 'Field', frameType: 'spell' })).roles).toEqual(['enabler', 'extender'])
  })

  it('Mulcharmy, Droll y Maxx "C" frenan al rival: floodgate, y como toda hand trap disruption; al resolver te dejan arriba (payoff)', () => {
    expect(classifyCard(card({}), 'Droll & Lock Bird').roles).toEqual(['handtrap', 'floodgate', 'disruption', 'payoff'])
    expect(classifyCard(card({}), 'Mulcharmy Fuwalos').roles).toEqual(['handtrap', 'draw', 'floodgate', 'disruption', 'payoff'])
    expect(classifyCard(card({}), 'Maxx "C"').roles).toEqual(['handtrap', 'draw', 'floodgate', 'disruption', 'payoff'])
    expect(classifyCard(card({}), 'Ash Blossom & Joyous Spring').roles).toEqual(['handtrap', 'disruption'])
    expect(classifyCard(card({}), 'Called by the Grave').roles).toEqual(['disruption', 'boardbreaker', 'payoff'])
  })

  it('un Kaiju se invoca desde la mano pero al campo del rival: rompe el campo, no extiende, y no es engine por nombrar a los Kaiju', () => {
    rules(R.selfFromHand | R.givesToOpponent | R.mentions)
    expect(classifyCard(card({ level: 8 }))).toEqual({ origin: 'non_engine', roles: ['boardbreaker'] })

    rules(R.negate | R.mentions)
    expect(classifyCard(card({ cardType: 'Trap Card', frameType: 'trap' }))).toEqual({ origin: 'engine', roles: ['disruption'] })
  })

  it('con script pero sin pistas de reglas, siguen el texto para lo que falta y el rol por tipo', () => {
    rules(0)
    expect(classifyCard(card({ level: 8, description: 'Cannot be Normal Summoned.' })).roles).toEqual(['brick', 'extender'])
    expect(classifyCard(card({ description: 'Destroy all monsters your opponent controls.' })).roles).toEqual(['enabler', 'extender'])
    expect(classifyCard(card({ cardType: 'Trap Card', frameType: 'trap', description: 'Negate the activation.' })).roles).toEqual(['disruption'])
  })

  it('sin script, el texto decide como antes; el Extra no usa las reglas', () => {
    expect(classifyCard(card({ ygoprodeckId: 2, description: 'Destroy all monsters your opponent controls.' })).roles).toEqual(['boardbreaker'])

    rules(R.negate | R.quickFromField)
    expect(classifyCard(card({ ygoprodeckId: 2, cardType: 'Synchro Monster', frameType: 'synchro', level: 10 })).roles).toEqual(['payoff'])
  })

  it('el Extra es payoff y, con script, lo que la carta sabe hacer', () => {
    rules(R.negate | R.quickFromField)
    expect(classifyCard(card({ cardType: 'Synchro Monster', frameType: 'synchro', level: 10 }))).toEqual({ origin: 'engine', roles: ['payoff', 'disruption'] })

    rules(R.search | R.hitsOpponent)
    expect(classifyCard(card({ cardType: 'Link Monster', frameType: 'link', level: null, linkValue: 2 })).roles).toEqual(['payoff', 'boardbreaker', 'searcher'])
  })

  it('starter: el monstruo que saca ventaja al entrar y la magia que invoca; la Quick-Play que invoca es extender', () => {
    rules(R.starts | R.search)
    expect(classifyCard(card({}))).toEqual({ origin: 'engine', roles: ['searcher', 'starter', 'extender'] })
    expect(classifyCard(card({ cardType: 'Spell Card', frameType: 'spell' })).roles).toEqual(['searcher', 'starter', 'extender'])

    // Marshmao: se invoca sola y hace algo al entrar; Kusanagi (efecto al entrar que depende del cementerio) no abre.
    rules(R.selfFromHand | R.usesHand | R.onSummon | R.recovery | R.mentions)
    expect(classifyCard(card({ level: 1 })).roles).toEqual(['extender', 'starter', 'recovery', 'enabler'])
    rules(R.recovery | R.mentions)
    expect(classifyCard(card({ level: 4, archetype: 'Mitsurugi' })).roles).toEqual(['recovery', 'enabler', 'extender'])

    rules(R.starts)
    expect(classifyCard(card({ cardType: 'Quick-Play Spell', frameType: 'spell' })).roles).toEqual(['extender'])
    expect(classifyCard(card({ cardType: 'Trap Card', frameType: 'trap' })).roles).toEqual(['disruption'])
  })

  it('recovery, payoff del Main, y garnet contra brick', () => {
    rules(R.recovery)
    expect(classifyCard(card({ cardType: 'Spell Card', frameType: 'spell' }))).toEqual({ origin: 'engine', roles: ['recovery', 'extender'] })

    rules(R.quickFromField | R.negate)
    expect(classifyCard(card({ level: 8 })).roles).toEqual(['disruption', 'payoff', 'extender'])
    expect(classifyCard(card({ level: 4 })).roles).toEqual(['disruption'])

    // Ame no Habakiri: starter (recluta desde la mano), searcher, recovery y payoff (nivel 8 que debilita al rival).
    rules(R.recruit | R.starts | R.search | R.recovery | R.pressures | R.usesHand | R.mentions)
    expect(classifyCard(card({ cardType: 'Ritual Effect Monster', frameType: 'ritual', level: 8 }))).toEqual({
      origin: 'engine',
      roles: ['searcher', 'starter', 'recovery', 'enabler', 'payoff', 'extender'],
    })

    const locked = { level: 8, description: 'Cannot be Normal Summoned/Set. Must be Special Summoned by "Contract with Exodia".' }
    rules(R.referenced)
    expect(classifyCard(card(locked))).toEqual({ origin: 'engine', roles: ['garnet', 'extender'] })
    rules(0)
    expect(classifyCard(card(locked)).roles).toEqual(['brick', 'extender'])
    rules(R.referenced | R.usesHand | R.selfFromHand)
    expect(classifyCard(card(locked)).roles).toEqual(['extender'])
  })

  it('la lista conocida y tus correcciones siguen mandando', () => {
    rules(R.hitsOpponent)
    expect(classifyCard(card({}), 'Ash Blossom & Joyous Spring')).toEqual({ origin: 'non_engine', roles: ['handtrap', 'disruption'] })
    expect(classifyCard(card({}), 'Carta', new Map([['carta', { origin: 'engine', roles: ['starter'] }]]))).toEqual({ origin: 'engine', roles: ['starter'] })
  })
})

describe('origen con las reglas de la carta', () => {
  it('una carta que juegan decks de cualquier arquetipo es non-engine aunque robe; una trampa de su paquete es engine', () => {
    expect(deriveOrigin(['draw'], R.generic)).toBe('non_engine')
    expect(deriveOrigin(['draw', 'boardbreaker'], R.generic)).toBe('non_engine')
    expect(deriveOrigin(['searcher'], R.generic)).toBe('engine')
    expect(deriveOrigin(['disruption'], R.mentions)).toBe('engine')
    expect(deriveOrigin(['disruption'], R.mentions | R.generic)).toBe('non_engine')
    expect(deriveOrigin(['disruption'])).toBe('non_engine')
    expect(deriveOrigin([], R.mentions)).toBe('non_engine')
  })

  it('el índice del JSON agrupa ids por valor de bits', () => {
    expect([...indexCardRules({ scripts: 'abc', cards: { '0': [5], '3': [1, 2] } })]).toEqual([[5, 0], [1, 3], [2, 3]])
  })
})
