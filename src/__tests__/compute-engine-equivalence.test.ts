import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  getMatchedRequirementCount,
  matchesResolvedPattern,
  type CountOperations,
  type ResolvedRequirement,
} from '../app/pattern-engine'
import { createMatcherPattern } from '../app/pattern-factory'
import { buildCalculationSummary } from '../probability-summary'
import type { CalculatorState, CardEntry, CardRole, HandPattern } from '../types'

// El cálculo exacto va por atajos (condiciones sin cartas en común, búsqueda que corta, un solo repaso por mano
// para las reglas que no ignoran el robo). Acá se comprueba que dan lo mismo que el camino largo que sigue en el código.

const OPERATIONS: CountOperations<number[], number> = {
  cloneCounts: (counts) => [...counts],
  consumeCount: (counts, key, amount) => {
    counts[key] = Math.max(0, (counts[key] ?? 0) - amount)
  },
  getCount: (counts, key) => counts[key] ?? 0,
  serializeCounts: (counts) => counts.join(','),
}

const CLASSES = 9

const requirement = (index: number, keys: number[], quantity: number, kind: 'include' | 'exclude', distinct: boolean): ResolvedRequirement<number> => ({
  id: `r${index}`,
  sourceLabel: `r${index}`,
  source: 'cards',
  cardIds: [],
  quantity,
  kind,
  distinct,
  keys,
  names: [],
  possible: true,
})

const requirementArb = (index: number) =>
  fc.record({
    keys: fc.uniqueArray(fc.integer({ min: 0, max: CLASSES - 1 }), { minLength: 0, maxLength: 5 }),
    quantity: fc.integer({ min: 1, max: 3 }),
    kind: fc.constantFrom('include', 'include', 'include', 'exclude'),
    distinct: fc.boolean(),
  }).map(({ keys, quantity, kind, distinct }) => requirement(index, keys, quantity, kind, distinct))

describe('matchesResolvedPattern con condiciones que se pisan', () => {
  it('da lo mismo que repartir las cartas probando todo, también con otra mano para las condiciones "sin"', () => {
    const countsArb = fc.array(fc.integer({ min: 0, max: 3 }), { minLength: CLASSES, maxLength: CLASSES })

    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }).chain((count) => fc.tuple(...Array.from({ length: count }, (_, index) => requirementArb(index)))),
        countsArb,
        countsArb,
        fc.integer({ min: 0, max: 6 }),
        (requirements, counts, excludeCounts, required) => {
          const requiredMatches = Math.min(required, requirements.length)
          const pattern = { requirements, allowSharedCards: false, requiredMatches }
          const excludes = requirements.filter((candidate) => candidate.kind === 'exclude')
          const includes = requirements.filter((candidate) => candidate.kind === 'include')
          const matched =
            getMatchedRequirementCount(excludes, excludeCounts, false, OPERATIONS) +
            getMatchedRequirementCount(includes, counts, false, OPERATIONS)

          expect(matchesResolvedPattern(pattern, counts, OPERATIONS, excludeCounts)).toBe(matched >= requiredMatches)
        },
      ),
      { numRuns: 2500 },
    )
  })

  it('una carta que sirve a dos condiciones no alcanza para las dos, pero dos copias sí', () => {
    const pattern = {
      requirements: [requirement(0, [0, 1], 1, 'include', false), requirement(1, [0, 2], 1, 'include', false)],
      allowSharedCards: false,
      requiredMatches: 2,
    }

    expect(matchesResolvedPattern(pattern, [1, 0, 0], OPERATIONS)).toBe(false)
    expect(matchesResolvedPattern(pattern, [2, 0, 0], OPERATIONS)).toBe(true)
    expect(matchesResolvedPattern(pattern, [1, 1, 0], OPERATIONS)).toBe(true)
  })
})

describe('cálculo exacto yendo 2º con reglas que ignoran el robo', () => {
  const ROLES: CardRole[] = ['starter', 'extender', 'handtrap']
  const cardArb = fc.record({
    copies: fc.integer({ min: 1, max: 3 }),
    roles: fc.subarray(ROLES, { minLength: 1 }),
  })
  const ruleArb = fc.record({
    conditions: fc.array(
      fc.record({
        role: fc.constantFrom(...ROLES),
        quantity: fc.integer({ min: 1, max: 2 }),
        kind: fc.constantFrom('include', 'include', 'exclude'),
        distinct: fc.boolean(),
      }),
      { minLength: 1, maxLength: 3 },
    ),
    problem: fc.boolean(),
    matchMode: fc.constantFrom('all', 'any'),
    allowSharedCards: fc.boolean(),
    ignoresDraw: fc.boolean(),
  })

  it('evaluar una vez por mano las reglas que ven la mano completa da lo mismo que evaluarlas en cada división', () => {
    fc.assert(
      fc.property(
        fc.array(cardArb, { minLength: 3, maxLength: 8 }),
        fc.array(ruleArb, { minLength: 1, maxLength: 4 }),
        fc.integer({ min: 4, max: 6 }),
        (cardSpecs, ruleSpecs, handSize) => {
          const cards: CardEntry[] = cardSpecs.map((spec, index) => ({
            id: `c${index}`,
            name: `c${index}`,
            copies: spec.copies,
            source: 'manual',
            apiCard: null,
            origin: 'engine',
            roles: spec.roles,
            needsReview: false,
          }))
          const patterns: HandPattern[] = ruleSpecs.map((spec, index) => ({
            ...createMatcherPattern(
              `R${index}`,
              spec.problem ? 'problem' : 'opening',
              spec.conditions.map((condition) => ({
                matcher: { type: 'role' as const, value: condition.role },
                quantity: condition.quantity,
                kind: condition.kind,
                distinct: condition.distinct,
              })),
              { matchMode: spec.matchMode, allowSharedCards: spec.allowSharedCards },
            ),
            // Al menos una regla ignora el robo: es lo que activa la división por carta robada.
            ignoresDraw: index === 0 || spec.ignoresDraw,
          }))
          const deckSize = cards.reduce((total, card) => total + card.copies, 0) + 20
          const state: CalculatorState = { deckSize, handSize, cards, patterns, drawnCards: 1 }

          // Una salida que rescata y que ninguna carta cumple no cambia nada, pero apaga el atajo: queda el camino largo.
          const longPath = buildCalculationSummary({
            ...state,
            patterns: [
              ...patterns,
              {
                ...createMatcherPattern('Nunca', 'opening', [{ matcher: { type: 'role', value: 'floodgate' }, quantity: 1, kind: 'include' }]),
                rescuesCards: true,
              },
            ],
          })
          const shortcut = buildCalculationSummary(state)

          expect(shortcut).toEqual({
            ...longPath,
            patternResults: longPath.patternResults.slice(0, -1),
            segmentPatternHands: {
              clean: longPath.segmentPatternHands.clean.slice(0, -1),
              withProblem: longPath.segmentPatternHands.withProblem.slice(0, -1),
              noOpening: longPath.segmentPatternHands.noOpening.slice(0, -1),
            },
          })
        },
      ),
      { numRuns: 60 },
    )
  })
})
