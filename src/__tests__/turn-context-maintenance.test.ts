import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { curatePatterns } from '../app/pattern-curation'
import { buildPatternPresets, isLegacySystemRule } from '../app/pattern-presets'
import type {
  CardEntry,
  CardOrigin,
  CardRole,
  HandPattern,
  Matcher,
  TurnContext,
} from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCard(
  id: string,
  name: string,
  copies: number,
  origin: CardOrigin | null = 'engine',
  roles: CardRole[] = ['starter'],
): CardEntry {
  return {
    id,
    name,
    copies,
    source: 'manual',
    apiCard: null,
    origin,
    roles,
    needsReview: false,
  }
}

/**
 * A small deck that supports every auto-seed default pattern (starter_opening,
 * no_starter_problem, double_brick_problem) so all three survive curation.
 */
function makeFixedDeck(): CardEntry[] {
  return [
    makeCard('c-starter-1', 'Starter A', 3, 'engine', ['starter']),
    makeCard('c-starter-2', 'Starter B', 3, 'engine', ['starter']),
    makeCard('c-extender-1', 'Extender A', 3, 'engine', ['extender']),
    makeCard('c-handtrap-1', 'Handtrap A', 3, 'non_engine', ['handtrap']),
    makeCard('c-brick-1', 'Brick A', 2, 'engine', ['brick']),
    makeCard('c-brick-2', 'Brick B', 1, 'engine', ['brick']),
  ]
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const arbTurnContext: fc.Arbitrary<TurnContext> = fc.constantFrom('first', 'second', 'either')

/** Junk values used to represent legacy patterns with missing/invalid turnContext. */
const arbJunkTurnContext: fc.Arbitrary<unknown> = fc.oneof(
  arbTurnContext,
  fc.constant(undefined),
  fc.constant(null),
  fc.constant(''),
  fc.constant('Both'),
  fc.constant('FIRST'),
  fc.integer(),
)

const arbRoleMatcher: fc.Arbitrary<Matcher> = fc.constantFrom<Matcher>(
  { type: 'role', value: 'starter' },
  { type: 'role', value: 'extender' },
  { type: 'role', value: 'brick' },
  { type: 'role', value: 'handtrap' },
)

function arbLegacyPattern(): fc.Arbitrary<HandPattern> {
  return fc
    .tuple(
      fc.string({ minLength: 3, maxLength: 8 }).map((s) => `p-${s}`),
      fc.stringMatching(/^[A-Z][a-z]{2,10}$/),
      fc.constantFrom('opening' as const, 'problem' as const),
      arbRoleMatcher,
      fc.integer({ min: 1, max: 2 }),
      arbJunkTurnContext,
    )
    .map(([id, name, kind, matcher, quantity, tc]) => ({
      id,
      name,
      kind,
      // Cast is intentional: simulating legacy/malformed state that
      // curation + migration must normalize at runtime.
      turnContext: tc as TurnContext,
      logic: 'all' as const,
      minimumConditionMatches: 1,
      reusePolicy: 'forbid' as const,
      needsReview: false,
      conditions: [
        {
          id: `req-${id}`,
          matcher,
          quantity,
          kind: 'include' as const,
          distinct: false,
        },
      ],
    }))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Turn-context maintenance migration', () => {
  it('9.5.1: la migración reconoce las copias de reglas del sistema guardadas por versiones anteriores', () => {
    const cards = makeFixedDeck()
    const legacyCopies: HandPattern[] = buildPatternPresets(cards).map((preset) => ({
      ...preset.pattern,
      id: `legacy-${preset.id}`,
    }))
    const renamedLegacy = { ...legacyCopies[0]!, name: 'Mano sin Starter' }

    for (const pattern of [...legacyCopies, renamedLegacy]) {
      expect(isLegacySystemRule(pattern, cards)).toBe(true)
    }
  })

  it('9.5.2: after migration every pattern has a valid turnContext', () => {
    /** Validates: Requirements 7.6, 9.3 */
    fc.assert(
      fc.property(
        fc.array(arbLegacyPattern(), { minLength: 0, maxLength: 4 }),
        (legacyPatterns) => {
          const cards = makeFixedDeck()
          // Simulate the migration path: includeDefaults merges the auto-seeds,
          // curation normalizes turnContext for legacy and newly added items.
          const result = curatePatterns(legacyPatterns, cards)

          for (const pattern of result) {
            expect(['first', 'second', 'either']).toContain(pattern.turnContext)
          }
        },
      ),
    )
  })
})
