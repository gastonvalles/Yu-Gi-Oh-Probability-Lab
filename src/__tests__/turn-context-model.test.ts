import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { normalizeTurnContext, getPatternDefinitionKey } from '../app/patterns'
import type {
  Matcher,
  PatternCondition,
  PatternKind,
  PatternLogic,
  RequirementKind,
  ReusePolicy,
  TurnContext,
} from '../types'

// ---------------------------------------------------------------------------
// Helpers / arbitraries
// ---------------------------------------------------------------------------

type PatternShape = {
  kind: PatternKind
  turnContext: TurnContext
  logic: PatternLogic
  minimumConditionMatches: number
  reusePolicy: ReusePolicy
  conditions: Pick<PatternCondition, 'matcher' | 'quantity' | 'kind' | 'distinct'>[]
}

const arbPatternKind: fc.Arbitrary<PatternKind> = fc.constantFrom('opening', 'problem')
const arbPatternLogic: fc.Arbitrary<PatternLogic> = fc.constantFrom('all', 'any')
const arbReusePolicy: fc.Arbitrary<ReusePolicy> = fc.constantFrom('allow', 'forbid')
const arbRequirementKind: fc.Arbitrary<RequirementKind> = fc.constantFrom('include', 'exclude')

const arbMatcher: fc.Arbitrary<Matcher | null> = fc.oneof(
  fc.constant(null),
  fc
    .record({ value: fc.constantFrom('engine', 'non_engine', 'hybrid') })
    .map((m) => ({ type: 'origin', value: m.value }) as Matcher),
  fc
    .record({ value: fc.string({ minLength: 1, maxLength: 6 }) })
    .map((m) => ({ type: 'card', value: m.value }) as Matcher),
)

const arbCondition: fc.Arbitrary<
  Pick<PatternCondition, 'matcher' | 'quantity' | 'kind' | 'distinct'>
> = fc.record({
  matcher: arbMatcher,
  quantity: fc.integer({ min: 1, max: 5 }),
  kind: arbRequirementKind,
  distinct: fc.boolean(),
})

// A pattern shape without turnContext — callers layer turnContext on top.
type BaseShape = Omit<PatternShape, 'turnContext'>

function arbBasePatternShape(): fc.Arbitrary<BaseShape> {
  return fc
    .record({
      kind: arbPatternKind,
      logic: arbPatternLogic,
      minimumConditionMatches: fc.integer({ min: 1, max: 5 }),
      reusePolicy: arbReusePolicy,
      conditions: fc.array(arbCondition, { minLength: 1, maxLength: 4 }),
    })
    .map((base) => base)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Turn-context model', () => {
  describe('normalizeTurnContext', () => {
    it("1.5.1: returns the value verbatim for first/second/either, 'either' otherwise", () => {
      /** Validates: Requirements 1.2 */
      fc.assert(
        fc.property(fc.anything(), (input) => {
          const result = normalizeTurnContext(input)
          if (input === 'first' || input === 'second' || input === 'either') {
            expect(result).toBe(input)
          } else {
            expect(result).toBe('either')
          }
        }),
        { numRuns: 500 },
      )
    })

    it('edge: returns input when it is exactly one of the three valid values', () => {
      expect(normalizeTurnContext('first')).toBe('first')
      expect(normalizeTurnContext('second')).toBe('second')
      expect(normalizeTurnContext('either')).toBe('either')
    })

    it("edge: returns 'either' for undefined, null, and other invalid values", () => {
      expect(normalizeTurnContext(undefined)).toBe('either')
      expect(normalizeTurnContext(null)).toBe('either')
      expect(normalizeTurnContext('')).toBe('either')
      expect(normalizeTurnContext(42)).toBe('either')
      expect(normalizeTurnContext({})).toBe('either')
    })
  })

  describe('getPatternDefinitionKey', () => {
    it('1.5.2: different turnContext values produce different signatures', () => {
      /** Validates: Requirements 1.3, 1.4 */
      fc.assert(
        fc.property(arbBasePatternShape(), (base) => {
          const first: PatternShape = { ...base, turnContext: 'first' }
          const second: PatternShape = { ...base, turnContext: 'second' }
          expect(getPatternDefinitionKey(first)).not.toBe(getPatternDefinitionKey(second))
        }),
      )
    })

    it("1.5.3: explicit 'either' and defaulted 'either' produce identical signatures", () => {
      /** Validates: Requirements 1.3, 1.4 */
      fc.assert(
        fc.property(arbBasePatternShape(), (base) => {
          const explicit: PatternShape = { ...base, turnContext: 'either' }
          // Simulate a legacy pattern whose turnContext is missing/undefined and
          // gets defaulted through normalizeTurnContext inside getPatternDefinitionKey.
          const legacy = {
            ...base,
            turnContext: undefined as unknown as TurnContext,
          }
          expect(getPatternDefinitionKey(explicit)).toBe(getPatternDefinitionKey(legacy))
        }),
      )
    })
  })
})
