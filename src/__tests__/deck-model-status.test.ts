import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { getDeckModelStatus } from '../app/deck-model-status'
import type { CardEntry, HandPattern, CardOrigin, CardRole } from '../types'

// ── Helpers ──

const ALL_ORIGINS: CardOrigin[] = ['engine', 'non_engine', 'hybrid']
const ALL_ROLES: CardRole[] = [
  'starter', 'extender', 'enabler', 'handtrap', 'disruption',
  'boardbreaker', 'floodgate', 'removal', 'searcher', 'draw',
  'recovery', 'combo_piece', 'payoff', 'brick', 'garnet', 'tech',
]

function makeCard(overrides: Partial<CardEntry> = {}): CardEntry {
  return {
    id: 'card-1',
    name: 'Test Card',
    copies: 1,
    source: 'manual',
    apiCard: null,
    origin: 'engine',
    roles: ['starter'],
    needsReview: false,
    ...overrides,
  }
}

function makePattern(overrides: Partial<HandPattern> = {}): HandPattern {
  return {
    id: 'pattern-1',
    name: 'Test Pattern',
    kind: 'opening',
    logic: 'all',
    minimumConditionMatches: 1,
    reusePolicy: 'forbid',
    needsReview: false,
    conditions: [],
    ...overrides,
  }
}

// ── Arbitraries ──

const arbCardOrigin: fc.Arbitrary<CardOrigin | null> = fc.constantFrom(
  'engine', 'non_engine', 'hybrid', null,
)

const arbCardRoles: fc.Arbitrary<CardRole[]> = fc.subarray(ALL_ROLES, { minLength: 0, maxLength: 4 })

const arbCardEntry: fc.Arbitrary<CardEntry> = fc
  .tuple(
    fc.uuid(),
    fc.stringMatching(/^[A-Z][a-z]{2,8}$/),
    fc.integer({ min: 1, max: 3 }),
    arbCardOrigin,
    arbCardRoles,
    fc.boolean(),
  )
  .map(([id, name, copies, origin, roles, needsReview]) => ({
    id,
    name,
    copies,
    source: 'manual' as const,
    apiCard: null,
    origin,
    roles,
    needsReview,
  }))

const arbHandPattern: fc.Arbitrary<HandPattern> = fc
  .tuple(
    fc.uuid(),
    fc.stringMatching(/^Pattern[A-Z][a-z]{2,6}$/),
    fc.constantFrom('opening' as const, 'problem' as const),
  )
  .map(([id, name, kind]) => makePattern({ id, name, kind }))

const arbDeck: fc.Arbitrary<CardEntry[]> = fc.array(arbCardEntry, { minLength: 0, maxLength: 15 })
const arbPatterns: fc.Arbitrary<HandPattern[]> = fc.array(arbHandPattern, { minLength: 0, maxLength: 5 })

// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('getDeckModelStatus — Unit Tests', () => {
  it('empty deck returns status incomplete with totalCards=0 and completionPercentage=0', () => {
    /** **Validates: Requirements 1.8, 1.10** */
    const result = getDeckModelStatus([], [])

    expect(result.status).toBe('incomplete')
    expect(result.totalCards).toBe(0)
    expect(result.completionPercentage).toBe(0)
    expect(result.categorizedCards).toBe(0)
    expect(result.missingOriginCount).toBe(0)
    expect(result.missingRolesCount).toBe(0)
    expect(result.needsReviewCount).toBe(0)
    expect(result.activePatternCount).toBe(0)
  })

  it('fully categorized deck (origin + roles + needsReview=false) returns status complete', () => {
    /** **Validates: Requirements 1.3, 1.9** */
    const cards: CardEntry[] = [
      makeCard({ id: '1', name: 'Card A', copies: 3, origin: 'engine', roles: ['starter'], needsReview: false }),
      makeCard({ id: '2', name: 'Card B', copies: 2, origin: 'non_engine', roles: ['handtrap', 'disruption'], needsReview: false }),
    ]
    const patterns = [makePattern()]

    const result = getDeckModelStatus(cards, patterns)

    expect(result.status).toBe('complete')
    expect(result.totalCards).toBe(5)
    expect(result.categorizedCards).toBe(5)
    expect(result.completionPercentage).toBe(1)
    expect(result.missingOriginCount).toBe(0)
    expect(result.missingRolesCount).toBe(0)
    expect(result.needsReviewCount).toBe(0)
    expect(result.activePatternCount).toBe(1)
  })

  it('deck with cards missing origin returns correct missingOriginCount and status incomplete', () => {
    /** **Validates: Requirements 1.4, 1.10** */
    const cards: CardEntry[] = [
      makeCard({ id: '1', name: 'Card A', copies: 2, origin: null, roles: ['starter'], needsReview: false }),
      makeCard({ id: '2', name: 'Card B', copies: 3, origin: 'engine', roles: ['extender'], needsReview: false }),
    ]

    const result = getDeckModelStatus(cards, [])

    expect(result.status).toBe('incomplete')
    expect(result.missingOriginCount).toBe(2)
    expect(result.totalCards).toBe(5)
    expect(result.categorizedCards).toBe(3)
  })

  it('deck with cards missing roles returns correct missingRolesCount and status incomplete', () => {
    /** **Validates: Requirements 1.5, 1.10** */
    const cards: CardEntry[] = [
      makeCard({ id: '1', name: 'Card A', copies: 1, origin: 'engine', roles: [], needsReview: false }),
      makeCard({ id: '2', name: 'Card B', copies: 2, origin: 'hybrid', roles: ['draw'], needsReview: false }),
    ]

    const result = getDeckModelStatus(cards, [])

    expect(result.status).toBe('incomplete')
    expect(result.missingRolesCount).toBe(1)
    expect(result.totalCards).toBe(3)
    expect(result.categorizedCards).toBe(2)
  })

  it('deck with cards needsReview=true returns correct needsReviewCount and status incomplete', () => {
    /** **Validates: Requirements 1.6, 1.10** */
    const cards: CardEntry[] = [
      makeCard({ id: '1', name: 'Card A', copies: 2, origin: 'engine', roles: ['starter'], needsReview: true }),
      makeCard({ id: '2', name: 'Card B', copies: 1, origin: 'non_engine', roles: ['handtrap'], needsReview: false }),
    ]

    const result = getDeckModelStatus(cards, [])

    expect(result.status).toBe('incomplete')
    expect(result.needsReviewCount).toBe(2)
    expect(result.totalCards).toBe(3)
    expect(result.categorizedCards).toBe(1)
  })

  it('card with origin and roles but needsReview=true does NOT count as categorized', () => {
    /** **Validates: Requirements 1.3** */
    const cards: CardEntry[] = [
      makeCard({ id: '1', name: 'Card A', copies: 3, origin: 'engine', roles: ['starter', 'searcher'], needsReview: true }),
    ]

    const result = getDeckModelStatus(cards, [])

    expect(result.categorizedCards).toBe(0)
    expect(result.totalCards).toBe(3)
    expect(result.completionPercentage).toBe(0)
    expect(result.status).toBe('incomplete')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Property-Based Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('getDeckModelStatus — Property Tests', () => {
  it('completionPercentage is always in [0, 1]', () => {
    /** **Validates: Requirements 1.8** */
    fc.assert(
      fc.property(arbDeck, arbPatterns, (cards, patterns) => {
        const result = getDeckModelStatus(cards, patterns)
        expect(result.completionPercentage).toBeGreaterThanOrEqual(0)
        expect(result.completionPercentage).toBeLessThanOrEqual(1)
      }),
      { numRuns: 200 },
    )
  })

  it('if status is complete then completionPercentage===1 and all missing metrics are 0', () => {
    /** **Validates: Requirements 1.9** */
    fc.assert(
      fc.property(arbDeck, arbPatterns, (cards, patterns) => {
        const result = getDeckModelStatus(cards, patterns)
        if (result.status === 'complete') {
          expect(result.completionPercentage).toBe(1)
          expect(result.missingOriginCount).toBe(0)
          expect(result.missingRolesCount).toBe(0)
          expect(result.needsReviewCount).toBe(0)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('categorizedCards never exceeds totalCards', () => {
    /** **Validates: Requirements 1.3, 1.2** */
    fc.assert(
      fc.property(arbDeck, arbPatterns, (cards, patterns) => {
        const result = getDeckModelStatus(cards, patterns)
        expect(result.categorizedCards).toBeLessThanOrEqual(result.totalCards)
      }),
      { numRuns: 200 },
    )
  })

  it('activePatternCount always equals patterns.length', () => {
    /** **Validates: Requirements 1.7** */
    fc.assert(
      fc.property(arbDeck, arbPatterns, (cards, patterns) => {
        const result = getDeckModelStatus(cards, patterns)
        expect(result.activePatternCount).toBe(patterns.length)
      }),
      { numRuns: 200 },
    )
  })
})
