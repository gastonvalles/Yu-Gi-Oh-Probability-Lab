// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { fromPortableConfig } from '../app/app-state-codec'
import { KNOWN_CARDS_MAP, deriveOrigin } from '../app/classification-engine'
import { normalizeCardRoleKey, normalizeStoredRoles, resolveStoredCardOrigin } from '../app/deck-groups'
import { loadClassificationOverrides } from '../app/persistence'
import { readSavedBuilds } from '../app/saved-builds'

afterEach(() => localStorage.clear())

const apiCard = { ygoprodeckId: 1, cardType: 'Effect Monster', frameType: 'effect' }

describe('roles unificados y sin Hybrid: datos guardados antes del cambio', () => {
  it('los roles que se unificaron pasan a su equivalente, sin repetidos', () => {
    expect(normalizeCardRoleKey('handtrap')).toBe('disruption')
    expect(normalizeCardRoleKey('floodgate')).toBe('disruption')
    expect(normalizeCardRoleKey('removal')).toBe('boardbreaker')
    expect(normalizeCardRoleKey('draw')).toBe('searcher')
    expect(normalizeCardRoleKey('combo_piece')).toBe('enabler')
    expect(normalizeCardRoleKey('garnet')).toBe('brick')
    expect(normalizeCardRoleKey('inventado')).toBeNull()
    expect(normalizeStoredRoles(['handtrap', 'disruption', 'garnet', 'brick'])).toEqual(['disruption', 'brick'])
  })

  it('Hybrid pasa a Engine si la carta tiene un rol de tu plan y a Non-engine si no', () => {
    expect(resolveStoredCardOrigin('hybrid', ['extender', 'boardbreaker'])).toBe('engine')
    expect(resolveStoredCardOrigin('hybrid', ['disruption'])).toBe('non_engine')
    expect(resolveStoredCardOrigin('engine', [])).toBe('engine')
    expect(resolveStoredCardOrigin('algo', [])).toBeNull()
  })

  it('al cargar una configuración vieja, las cartas y las reglas quedan con los roles nuevos', () => {
    const restored = fromPortableConfig({
      version: 16,
      handSize: 5,
      deckFormat: 'tcg',
      patternsSeedVersion: 9,
      deckBuilder: {
        deckName: 'Viejo',
        main: [{ name: 'Ash', apiCard, origin: 'hybrid', roles: ['handtrap', 'draw', 'disruption'] }],
        extra: [],
        side: [],
      },
      patterns: [
        {
          name: 'Con handtrap',
          kind: 'opening',
          logic: 'all',
          conditions: [{ matcher: { type: 'role', value: 'handtrap' }, quantity: 1, kind: 'include', distinct: false }],
        },
      ],
    })

    expect(restored.deckBuilder.main[0]).toMatchObject({ origin: 'engine', roles: ['disruption', 'searcher'] })
    expect(restored.patterns[0]!.conditions[0]!.matcher).toEqual({ type: 'role', value: 'disruption' })
  })

  it('las builds guardadas y las clasificaciones propias también se migran', () => {
    localStorage.setItem(
      'ygo-lab:saved-builds',
      JSON.stringify([
        {
          id: 'b1',
          name: 'Vieja',
          savedAt: '2026-01-01',
          main: [{ instanceId: 'x', name: 'Ash', apiCard, origin: 'hybrid', roles: ['floodgate', 'garnet'] }],
          extra: [],
          side: [],
        },
      ]),
    )
    localStorage.setItem('ygo-probability-lab:classification-overrides:v1', JSON.stringify([['ash', { origin: 'hybrid', roles: ['handtrap'] }]]))

    expect(readSavedBuilds()[0]!.main[0]).toMatchObject({ origin: 'non_engine', roles: ['disruption', 'brick'] })
    expect([...loadClassificationOverrides().values()]).toEqual([{ origin: 'non_engine', roles: ['disruption'] }])
  })
})

describe('clasificación automática con los roles nuevos', () => {
  it('una handtrap conocida queda como Disruption (Non-engine)', () => {
    expect(KNOWN_CARDS_MAP.get('ash blossom & joyous spring')).toEqual({ origin: 'non_engine', roles: ['disruption'] })
  })

  it('una carta que juega tu plan y además interactúa es Engine', () => {
    expect(deriveOrigin(['starter', 'disruption'])).toBe('engine')
    expect(deriveOrigin(['disruption', 'boardbreaker'])).toBe('non_engine')
    expect(deriveOrigin(['tech'])).toBe('non_engine')
  })
})
