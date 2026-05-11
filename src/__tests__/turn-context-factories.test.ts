import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  createPattern,
  createMatcherPattern,
  createGroupPattern,
} from '../app/pattern-factory'
import { PATTERN_PRESET_DEFINITIONS } from '../app/pattern-presets'
import type { CardEntry, TurnContext } from '../types'

const arbTurnContext: fc.Arbitrary<TurnContext> = fc.constantFrom('first', 'second', 'either')
const arbCategory: fc.Arbitrary<'opening' | 'problem'> = fc.constantFrom('opening', 'problem')

// Build a minimal card list for preset build(cards) calls so that presets
// dependent on certain roles (e.g. board breakers, handtraps) do not short
// circuit and return null.
function makeCardsWithRoles(): CardEntry[] {
  return [
    {
      id: 'c1',
      name: 'Starter',
      copies: 3,
      source: 'manual',
      apiCard: null,
      origin: 'engine',
      roles: ['starter'],
      needsReview: false,
    },
    {
      id: 'c2',
      name: 'Extender',
      copies: 3,
      source: 'manual',
      apiCard: null,
      origin: 'engine',
      roles: ['extender'],
      needsReview: false,
    },
    {
      id: 'c3',
      name: 'Handtrap',
      copies: 3,
      source: 'manual',
      apiCard: null,
      origin: 'non_engine',
      roles: ['handtrap'],
      needsReview: false,
    },
    {
      id: 'c4',
      name: 'BoardBreaker',
      copies: 3,
      source: 'manual',
      apiCard: null,
      origin: 'non_engine',
      roles: ['boardbreaker'],
      needsReview: false,
    },
    {
      id: 'c5',
      name: 'Brick',
      copies: 1,
      source: 'manual',
      apiCard: null,
      origin: 'engine',
      roles: ['brick'],
      needsReview: false,
    },
    {
      id: 'c6',
      name: 'Garnet',
      copies: 1,
      source: 'manual',
      apiCard: null,
      origin: 'engine',
      roles: ['garnet'],
      needsReview: false,
    },
    {
      id: 'c7',
      name: 'Disruption',
      copies: 2,
      source: 'manual',
      apiCard: null,
      origin: 'non_engine',
      roles: ['disruption'],
      needsReview: false,
    },
  ]
}

describe('Pattern factory turnContext defaults', () => {
  it('2.2.1: createPattern without turnContext defaults to either', () => {
    /** Validates: Requirements 1.1, 9.1 */
    fc.assert(
      fc.property(arbCategory, (category) => {
        const p = createPattern('test', undefined, category)
        expect(p.turnContext).toBe('either')
      }),
    )
  })

  it('2.2.1: createMatcherPattern without turnContext defaults to either', () => {
    /** Validates: Requirements 1.1, 9.1 */
    fc.assert(
      fc.property(arbCategory, (category) => {
        const p = createMatcherPattern('test', category, [
          { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
        ])
        expect(p.turnContext).toBe('either')
      }),
    )
  })

  it('2.2.1: createGroupPattern without turnContext defaults to either', () => {
    /** Validates: Requirements 1.1, 9.1 */
    fc.assert(
      fc.property(arbCategory, (category) => {
        const p = createGroupPattern('test', category, [
          { groupKey: { type: 'role', value: 'starter' }, count: 1, kind: 'include' },
        ])
        expect(p.turnContext).toBe('either')
      }),
    )
  })

  it('2.2.2: createPattern assigns passed turnContext', () => {
    /** Validates: Requirements 1.1, 9.1 */
    fc.assert(
      fc.property(arbTurnContext, arbCategory, (tc, category) => {
        const p = createPattern('test', undefined, category, tc)
        expect(p.turnContext).toBe(tc)
      }),
    )
  })

  it('2.2.2: createMatcherPattern assigns passed turnContext', () => {
    /** Validates: Requirements 1.1, 9.1 */
    fc.assert(
      fc.property(arbTurnContext, arbCategory, (tc, category) => {
        const p = createMatcherPattern(
          'test',
          category,
          [{ matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' }],
          { turnContext: tc },
        )
        expect(p.turnContext).toBe(tc)
      }),
    )
  })

  it('2.2.2: createGroupPattern assigns passed turnContext', () => {
    /** Validates: Requirements 1.1, 9.1 */
    fc.assert(
      fc.property(arbTurnContext, arbCategory, (tc, category) => {
        const p = createGroupPattern(
          'test',
          category,
          [{ groupKey: { type: 'role', value: 'starter' }, count: 1, kind: 'include' }],
          { turnContext: tc },
        )
        expect(p.turnContext).toBe(tc)
      }),
    )
  })

  it('2.2.3: all presets build patterns with turnContext = either (unless explicitly overridden)', () => {
    /** Validates: Requirements 1.1, 9.1 */
    // Presets with explicit turnContext overrides (see pattern-presets.ts).
    const PRESETS_WITH_EXPLICIT_TURN_CONTEXT = new Set<string>([
      'starter_with_boardbreaker_opening',
    ])
    const cards = makeCardsWithRoles()
    for (const def of PATTERN_PRESET_DEFINITIONS) {
      const p = def.build(cards)
      if (p !== null && !PRESETS_WITH_EXPLICIT_TURN_CONTEXT.has(def.id)) {
        expect(p.turnContext, `preset ${def.id} should have turnContext 'either'`).toBe('either')
      }
    }
  })
})
