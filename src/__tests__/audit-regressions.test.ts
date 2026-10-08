import { describe, expect, it } from 'vitest'

import { DECK_ZONE_LIMITS, addSearchResultToZone } from '../app/deck-builder'
import { buildDeckImportPreview } from '../app/deck-import'
import { buildCandidates, type Culprit } from '../app/lab-suggestion'
import type { DeckBuilderState } from '../app/model'
import { createMatcherPattern } from '../app/pattern-factory'
import { isLegacySystemRule } from '../app/pattern-presets'
import { removeRequirement } from '../app/pattern-updates'
import { getPatternMatchMode } from '../app/patterns'
import { computeLabResults } from '../app/probability-lab'
import type { CardEntry } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'

const card = (id: string, copies: number, roles: CardEntry['roles'], origin: CardEntry['origin'] = 'engine'): CardEntry => ({
  id, name: id, copies, source: 'manual', apiCard: null, origin, roles, needsReview: false,
})

const apiCard = (ygoprodeckId: number, name: string, frameType = 'effect'): ApiCardSearchResult => ({
  ygoprodeckId, name, cardType: 'Effect Monster', frameType, description: null, race: 'Zombie', attribute: 'FIRE', level: 3,
  linkValue: null, atk: '0', def: '0', archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null,
  banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null },
})

describe('quitar una condición conserva la lógica de la regla', () => {
  it('una regla "cualquiera" sigue siendo "cualquiera"', () => {
    const pattern = createMatcherPattern('any', 'opening', [
      { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
      { matcher: { type: 'role', value: 'extender' }, quantity: 1, kind: 'include' },
      { matcher: { type: 'role', value: 'handtrap' }, quantity: 1, kind: 'include' },
    ], { matchMode: 'any' })

    const [next] = removeRequirement([pattern], pattern.id, pattern.conditions[0].id)

    expect(next.conditions).toHaveLength(2)
    expect(getPatternMatchMode(next)).toBe('any')
  })

  it('una regla "al menos 2 de 3" pasa a "todas" al quedar con 2 (no hay otra lectura posible)', () => {
    const pattern = createMatcherPattern('atleast', 'opening', [
      { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
      { matcher: { type: 'role', value: 'extender' }, quantity: 1, kind: 'include' },
      { matcher: { type: 'role', value: 'handtrap' }, quantity: 1, kind: 'include' },
    ], { matchMode: 'at-least', minimumMatches: 2 })

    const [next] = removeRequirement([pattern], pattern.id, pattern.conditions[0].id)

    expect(next.minimumConditionMatches).toBe(2)
    expect(next.logic).not.toBe('all')
  })
})

describe('rescatar cartas no puede crear un problema', () => {
  // Salida "Starter + Handtrap" que rescata; problema "Sin handtrap" (condición exclude).
  const cards = [card('s', 10, ['starter']), card('h', 10, ['handtrap'], 'non_engine'), card('f', 20, ['enabler'])]
  const rescuer = {
    ...createMatcherPattern('S + H', 'opening', [
      { matcher: { type: 'card', value: 's' }, quantity: 1, kind: 'include' },
      { matcher: { type: 'card', value: 'h' }, quantity: 1, kind: 'include' },
    ]),
    rescuesCards: true,
  }
  const noHandtrap = createMatcherPattern('Sin handtrap', 'problem', [
    { matcher: { type: 'card', value: 'h' }, quantity: 1, kind: 'exclude' },
  ])

  it('el % de "sin handtrap" es el mismo con o sin rescate', () => {
    const run = (rescues: boolean) => {
      const lab = computeLabResults(cards, [{ ...rescuer, rescuesCards: rescues }, noHandtrap], 5)
      if (lab.status !== 'ok') throw new Error('blocked')
      return lab.results.first.patternResults.find((r) => r.name === 'Sin handtrap')!.probability
    }

    expect(run(true)).toBeCloseTo(run(false), 12)
  })
})

describe('sugerencia del Lab con cartas a 0 copias', () => {
  it('sacar la única copia de una carta referenciada por id no invalida el candidato', () => {
    const cards = [
      card('brick', 1, ['brick'], 'non_engine'),
      ...Array.from({ length: 20 }, (_, i) => card(`s${i}`, 1, ['starter'])),
      ...Array.from({ length: 19 }, (_, i) => card(`f${i}`, 1, ['recovery'], 'non_engine')),
    ]
    const problem = createMatcherPattern('Brick', 'problem', [{ matcher: { type: 'card_pool', value: ['brick'] }, quantity: 1, kind: 'include' }])
    const culprit: Culprit = { kind: 'problem', patternId: problem.id, name: problem.name, probability: 0.2 }

    const candidates = buildCandidates(culprit, cards, [problem])
    const removesBrick = candidates.find((c) => c.changes.some((ch) => ch.action === 'remove' && ch.card.id === 'brick'))

    expect(removesBrick).toBeDefined()
    expect(removesBrick!.cards.find((c) => c.id === 'brick')?.copies).toBe(0)
    expect(computeLabResults(removesBrick!.cards, [problem], 5).status).toBe('ok')
  })
})

describe('importación por texto', () => {
  const ash = apiCard(14558127, 'Ash Blossom & Joyous Spring')
  const knight = apiCard(29301450, 'S:P Little Knight', 'link')

  it('reconoce encabezados de sección con cantidad', () => {
    const preview = buildDeckImportPreview({
      deckFormat: 'unlimited',
      deckName: 'x',
      cards: [ash, knight],
      text: 'Main Deck (40)\n3 Ash Blossom & Joyous Spring\nExtra Deck: 15 cards\n1 S:P Little Knight',
    })

    expect(preview.missingEntries).toEqual([])
    expect(preview.importedTotals).toMatchObject({ main: 3, extra: 1 })
  })
})

describe('límites de zona', () => {
  it('Extra y Side no tienen tope en el builder (decisión de producto); el Main corta en 60', () => {
    expect(DECK_ZONE_LIMITS.main).toBe(60)
    expect(DECK_ZONE_LIMITS.extra).toBe(Infinity)
    expect(DECK_ZONE_LIMITS.side).toBe(Infinity)

    // 15 cartas distintas en el Extra (el límite de 3 copias por nombre no interfiere) y entra una 16ª.
    const knights = Array.from({ length: 16 }, (_, i) => apiCard(i + 1, `K${i + 1}`, 'link'))
    const full: DeckBuilderState = {
      deckName: '', main: [], side: [], isEditingDeck: false,
      extra: knights.slice(0, 15).map((card, i) => ({ instanceId: `e${i}`, name: card.name, apiCard: card, origin: null, roles: [], needsReview: true })),
    }

    expect(addSearchResultToZone(full, knights, 16, 'extra', 15).extra).toHaveLength(16)
  })
})

describe('mantenimiento de reglas', () => {
  it('una genérica editada por el usuario (con systemRuleId) no se borra como regla vieja', () => {
    const edited = { ...createMatcherPattern('Salida básica', 'opening', [{ matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' }]), systemRuleId: 'basic' }

    expect(isLegacySystemRule(edited, [card('s', 3, ['starter'])])).toBe(false)
    expect(isLegacySystemRule({ ...edited, systemRuleId: undefined }, [card('s', 3, ['starter'])])).toBe(true)
  })
})
