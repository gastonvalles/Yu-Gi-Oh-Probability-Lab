// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { fromPortableConfig } from '../app/app-state-codec'
import { KNOWN_CARDS_MAP, deriveOrigin } from '../app/classification-engine'
import { normalizeCardOriginKey, normalizeCardRoleKey, normalizeStoredRoles } from '../app/deck-groups'
import { loadClassificationOverrides } from '../app/persistence'
import { readSavedBuilds } from '../app/saved-builds'

afterEach(() => localStorage.clear())

const apiCard = { ygoprodeckId: 1, cardType: 'Effect Monster', frameType: 'effect' }

describe('roles y orígenes que ya no existen (Board Breaker, Removal, Combo Piece, Tech, Hybrid, non-engine)', () => {
  it('ya no se leen: se descartan', () => {
    for (const viejo of ['board_breaker', 'removal', 'combo_piece', 'tech', 'inventado']) expect(normalizeCardRoleKey(viejo)).toBeNull()
    expect(normalizeCardRoleKey('floodgate')).toBe('floodgate')
    expect(normalizeStoredRoles(['floodgate', 'disruption', 'tech', 'removal', 'boardbreaker'])).toEqual(['floodgate', 'disruption', 'boardbreaker'])
    expect(normalizeCardOriginKey('hybrid')).toBeNull()
    expect(normalizeCardOriginKey('non-engine')).toBeNull()
    expect(normalizeCardOriginKey('non_engine')).toBe('non_engine')
  })

  it('una configuración guardada con ellos carga sin romper: la carta queda sin ese rol ni origen y para revisar, y la regla sin ese filtro', () => {
    const restored = fromPortableConfig({
      version: 16,
      handSize: 5,
      deckFormat: 'tcg',
      patternsSeedVersion: 9,
      deckBuilder: {
        deckName: 'Viejo',
        main: [
          { name: 'Ash', apiCard, origin: 'hybrid', roles: ['handtrap', 'draw', 'combo_piece', 'tech'] },
          { name: 'Nibiru', apiCard, origin: 'non_engine', roles: ['handtrap'] },
        ],
        extra: [],
        side: [],
      },
      patterns: [
        {
          name: 'Con combo piece',
          kind: 'opening',
          logic: 'all',
          conditions: [{ matcher: { type: 'role', value: 'combo_piece' }, quantity: 1, kind: 'include', distinct: false }],
        },
      ],
    })

    expect(restored.deckBuilder.main[0]).toMatchObject({ origin: null, roles: ['handtrap', 'draw'], needsReview: true })
    expect(restored.deckBuilder.main[1]).toMatchObject({ origin: 'non_engine', roles: ['handtrap'], needsReview: false })
    expect(restored.patterns[0]).toMatchObject({ name: 'Con combo piece', needsReview: true, conditions: [{ matcher: null }] })
  })

  it('las builds guardadas y las clasificaciones propias cargan sin romper', () => {
    localStorage.setItem(
      'ygo-lab:saved-builds',
      JSON.stringify([
        {
          id: 'b1',
          name: 'Vieja',
          savedAt: '2026-01-01',
          main: [{ instanceId: 'x', name: 'Ash', apiCard, origin: 'hybrid', roles: ['combo_piece', 'removal', 'tech', 'starter'] }],
          extra: [],
          side: [],
        },
      ]),
    )
    localStorage.setItem(
      'ygo-probability-lab:classification-overrides:v1',
      JSON.stringify([['ash', { origin: 'hybrid', roles: ['handtrap', 'tech'] }], ['nibiru', { origin: 'non_engine', roles: ['handtrap', 'tech'] }]]),
    )

    expect(readSavedBuilds()[0]!.main[0]).toMatchObject({ origin: null, roles: ['starter'] })
    expect([...loadClassificationOverrides().entries()]).toEqual([['nibiru', { origin: 'non_engine', roles: ['handtrap'] }]])
  })
})

describe('clasificación automática con los roles actuales', () => {
  it('una handtrap conocida sigue siendo Handtrap (Non-engine)', () => {
    expect(KNOWN_CARDS_MAP.get('ash blossom & joyous spring')).toEqual({ origin: 'non_engine', roles: ['handtrap'] })
  })

  it('una carta que juega tu plan y además interactúa es Engine', () => {
    expect(deriveOrigin(['starter', 'handtrap'])).toBe('engine')
    expect(deriveOrigin(['handtrap', 'boardbreaker'])).toBe('non_engine')
    expect(deriveOrigin(['garnet'])).toBe('engine')
  })
})
