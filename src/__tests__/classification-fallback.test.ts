import { describe, expect, it } from 'vitest'

import { classifyCard } from '../app/classification-engine'
import type { ApiCardReference } from '../types'

const card = (overrides: Partial<ApiCardReference>): ApiCardReference => ({
  ygoprodeckId: 1, cardType: 'Effect Monster', frameType: 'effect', description: null, race: null, attribute: null, level: 4,
  linkValue: null, atk: '0', def: '0', archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null,
  banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null },
  ...overrides,
})

describe('clasificador: ninguna carta queda sin rol', () => {
  it('una Magia Ritual sin pistas en el texto es enabler del engine', () => {
    const suggestion = classifyCard(card({ cardType: 'Ritual Spell', frameType: 'spell', description: 'This card is used to Ritual Summon "Mitsurugi" monsters.' }), 'Mitsurugi Mirror')

    expect(suggestion).toEqual({ origin: 'engine', roles: ['enabler'] })
  })

  it('una Quick-Play que sólo invoca de tu lado es extender; si apunta al rival, disruption', () => {
    expect(classifyCard(card({ cardType: 'Quick-Play Spell', frameType: 'spell', description: 'Special Summon 1 Token.' })).roles).toEqual(['extender'])
    expect(classifyCard(card({ cardType: 'Quick-Play Spell', frameType: 'spell', description: 'Change 1 monster your opponent controls to Defense Position.' }))).toEqual({
      origin: 'non_engine',
      roles: ['disruption'],
    })
  })

  it('una magia normal que invoca es starter; una que apunta al rival, boardbreaker; el resto, enabler', () => {
    expect(classifyCard(card({ cardType: 'Spell Card', frameType: 'spell', description: 'Special Summon 1 Level 4 monster from your hand.' })).roles).toEqual(['starter'])
    expect(classifyCard(card({ cardType: 'Spell Card', frameType: 'spell', description: 'Change the battle position of 1 monster your opponent controls.' })).roles).toEqual(['boardbreaker'])
    expect(classifyCard(card({ cardType: 'Spell Card', frameType: 'spell', description: 'Gain 1000 LP.' })).roles).toEqual(['enabler'])
  })

  it('una trampa desconocida es disruption y un monstruo del Main sin pistas es enabler', () => {
    expect(classifyCard(card({ cardType: 'Trap Card', frameType: 'trap', description: 'Change the battle positions of all monsters you control.' })).roles).toEqual(['disruption'])
    expect(classifyCard(card({ description: 'Gains 300 ATK during the Battle Phase.' }))).toEqual({ origin: 'engine', roles: ['enabler'] })
    expect(classifyCard(card({ cardType: 'Normal Monster', frameType: 'normal', description: 'A warrior.' })).roles).toEqual(['enabler'])
  })

  it('las reglas con pista siguen ganando al fallback', () => {
    expect(classifyCard(card({}), 'Ash Blossom & Joyous Spring').roles).toEqual(['handtrap'])
    expect(classifyCard(card({ cardType: 'Link Monster', frameType: 'link', level: null })).roles).toEqual(['payoff'])
    expect(classifyCard(card({ level: 8, description: 'Big.' })).roles).toEqual(['brick'])
    expect(classifyCard(card({ cardType: 'Spell Card', frameType: 'spell', description: 'Add 1 "Yummy" card from your Deck to your hand.' })).roles).toEqual(['searcher'])
  })
})
