// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { fromPortableConfig } from '../app/app-state-codec'
import { KNOWN_CARDS_MAP, deriveOrigin } from '../app/classification-engine'
import { normalizeCardRoleKey, normalizeStoredRoles, resolveStoredCardOrigin } from '../app/deck-groups'
import { loadClassificationOverrides } from '../app/persistence'
import { readSavedBuilds } from '../app/saved-builds'

afterEach(() => localStorage.clear())

const apiCard = { ygoprodeckId: 1, cardType: 'Effect Monster', frameType: 'effect' }

describe('roles unificados, Tech eliminado y sin Hybrid: datos guardados antes del cambio', () => {
  it('los roles que se unificaron pasan a su equivalente y Tech se descarta', () => {
    expect(normalizeCardRoleKey('floodgate')).toBe('disruption')
    expect(normalizeCardRoleKey('removal')).toBe('boardbreaker')
    expect(normalizeCardRoleKey('combo_piece')).toBe('enabler')
    expect(normalizeCardRoleKey('tech')).toBeNull()
    expect(normalizeCardRoleKey('inventado')).toBeNull()
    // Handtrap, Draw y Garnet siguen existiendo por separado.
    expect(normalizeCardRoleKey('handtrap')).toBe('handtrap')
    expect(normalizeCardRoleKey('draw')).toBe('draw')
    expect(normalizeCardRoleKey('garnet')).toBe('garnet')
    expect(normalizeStoredRoles(['floodgate', 'disruption', 'tech', 'removal', 'boardbreaker'])).toEqual(['disruption', 'boardbreaker'])
  })

  it('Hybrid pasa a Engine si la carta tiene un rol de tu plan y a Non-engine si no', () => {
    expect(resolveStoredCardOrigin('hybrid', ['extender', 'boardbreaker'])).toBe('engine')
    expect(resolveStoredCardOrigin('hybrid', ['draw'])).toBe('engine')
    expect(resolveStoredCardOrigin('hybrid', ['handtrap'])).toBe('non_engine')
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
        main: [{ name: 'Ash', apiCard, origin: 'hybrid', roles: ['handtrap', 'draw', 'floodgate', 'tech'] }],
        extra: [],
        side: [],
      },
      patterns: [
        {
          name: 'Con floodgate',
          kind: 'opening',
          logic: 'all',
          conditions: [{ matcher: { type: 'role', value: 'floodgate' }, quantity: 1, kind: 'include', distinct: false }],
        },
      ],
    })

    // Tech se descarta sin pedir revisión; Floodgate pasa a Disruption.
    expect(restored.deckBuilder.main[0]).toMatchObject({ origin: 'engine', roles: ['handtrap', 'draw', 'disruption'], needsReview: false })
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
          main: [{ instanceId: 'x', name: 'Ash', apiCard, origin: 'hybrid', roles: ['floodgate', 'removal', 'tech'] }],
          extra: [],
          side: [],
        },
      ]),
    )
    localStorage.setItem('ygo-probability-lab:classification-overrides:v1', JSON.stringify([['ash', { origin: 'hybrid', roles: ['handtrap', 'tech'] }]]))

    expect(readSavedBuilds()[0]!.main[0]).toMatchObject({ origin: 'non_engine', roles: ['disruption', 'boardbreaker'] })
    expect([...loadClassificationOverrides().values()]).toEqual([{ origin: 'non_engine', roles: ['handtrap'] }])
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
