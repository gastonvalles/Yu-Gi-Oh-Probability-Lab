import { describe, expect, it } from 'vitest'

import { buildDeckArchetypes, cardBelongsToArchetype } from '../app/card-archetypes'
import { createMatcherPattern } from '../app/pattern-factory'
import { computeLabResults } from '../app/probability-lab'
import { computeDraftImpact } from '../components/probability/use-draft-impact'
import { hypergeometric } from '../app/role-distribution'
import type { CardEntry } from '../types'

function card(id: string, name: string, copies: number, archetype: string | null): CardEntry {
  return {
    id,
    name,
    copies,
    source: 'manual',
    apiCard: archetype === null ? null : ({ archetype } as CardEntry['apiCard']),
    origin: 'engine',
    roles: ['starter'],
    needsReview: false,
  }
}

const PURULIA = card('p', 'Mulcharmy Purulia', 3, 'Mulcharmy')
const FUWALOS = card('f', 'Mulcharmy Fuwalos', 2, 'Mulcharmy')
// Soporte que nombra al arquetipo pero sin el campo cargado.
const SUPPORT = card('s', 'Mulcharmy Meowls', 1, null)
const FILLER = Array.from({ length: 34 }, (_, index) => card(`x${index}`, `Filler ${index}`, 1, null))

describe('arquetipos', () => {
  it('reconoce cartas por campo o por nombre y suma copias', () => {
    expect(cardBelongsToArchetype(SUPPORT, 'Mulcharmy')).toBe(true)
    expect(buildDeckArchetypes([PURULIA, FUWALOS, SUPPORT, ...FILLER])).toEqual([
      { name: 'Mulcharmy', cardIds: ['p', 'f', 's'], copies: 6 },
    ])
  })

  it('una sola regla "2+ del arquetipo" cuenta cualquier combinación', () => {
    const pattern = createMatcherPattern('2 Mulcharmy', 'opening', [
      { matcher: { type: 'archetype', value: 'Mulcharmy' }, quantity: 2, kind: 'include' },
    ])
    const computation = computeLabResults([PURULIA, FUWALOS, SUPPORT, ...FILLER], [pattern], 5)

    if (computation.status !== 'ok') {
      throw new Error('Se esperaba un resultado')
    }

    // 6 copias del arquetipo en 40: P(al menos 2 en 5 cartas).
    const expected = 1 - hypergeometric(40, 6, 5, 0) - hypergeometric(40, 6, 5, 1)
    expect(computation.results.first.patternResults[0]?.probability).toBeCloseTo(expected)
  })
})

describe('computeDraftImpact', () => {
  const draft = (turnContext: 'first' | 'second' | 'either') =>
    createMatcherPattern(
      '2+ Mulcharmy',
      'problem',
      [{ matcher: { type: 'archetype', value: 'Mulcharmy' }, quantity: 2, kind: 'include' }],
      { turnContext },
    )
  const base = { cards: [PURULIA, FUWALOS, SUPPORT, ...FILLER], customPatterns: [], disabledGenericRuleIds: [], handSize: 5, cleanBefore: null }

  it('una regla "Solo 1º" muestra su % yendo 1º (no queda bloqueada)', () => {
    const impact = computeDraftImpact({ ...base, draft: draft('first') })

    expect(impact?.rule.second).toBeNull()
    expect(impact?.rule.main).toBeCloseTo(1 - hypergeometric(40, 6, 5, 0) - hypergeometric(40, 6, 5, 1))
  })

  it('una regla incompleta no calcula nada', () => {
    const incomplete = { ...draft('either'), conditions: [{ ...draft('either').conditions[0]!, matcher: null }] }
    expect(computeDraftImpact({ ...base, draft: incomplete })).toBeNull()
  })
})
