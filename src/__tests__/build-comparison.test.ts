import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { compareBuild } from '../app/build-comparison'
import { getPatternDefinitionKey } from '../app/patterns'
import type { PortableConfig, PortableDeckCard, PortablePattern } from '../app/model'
import type { CardRole, CardOrigin, PatternKind, ApiCardReference } from '../types'

// ── Helpers ──

const ALL_ROLES: CardRole[] = [
  'starter', 'extender', 'enabler', 'handtrap', 'disruption',
  'boardbreaker', 'floodgate', 'removal', 'searcher', 'draw',
  'recovery', 'combo_piece', 'payoff', 'brick', 'garnet', 'tech',
]

function makeApiCard(id: number): ApiCardReference {
  return {
    ygoprodeckId: id,
    cardType: 'Effect Monster',
    frameType: 'effect',
    description: null,
    race: null,
    attribute: null,
    level: 4,
    linkValue: null,
    atk: '1800',
    def: '1200',
    archetype: null,
    ygoprodeckUrl: null,
    imageUrl: null,
    imageUrlSmall: null,
    banlist: { tcg: null, ocg: null, goat: null },
    genesys: { points: null },
  }
}

function makeDeckCard(
  name: string,
  id: number,
  roles: CardRole[] = ['starter'],
  origin: CardOrigin | null = 'engine',
): PortableDeckCard {
  return {
    name,
    apiCard: makeApiCard(id),
    origin,
    roles,
    needsReview: false,
  }
}

function makeConfig(overrides: Partial<PortableConfig> = {}): PortableConfig {
  return {
    version: 15,
    handSize: 5,
    deckFormat: 'unlimited',
    patternsSeeded: true,
    patternsSeedVersion: 1,
    deckBuilder: {
      deckName: 'Test Deck',
      main: [],
      extra: [],
      side: [],
    },
    patterns: [],
    ...overrides,
  }
}

function makePattern(
  name: string,
  kind: PatternKind = 'opening',
  cardValue?: string,
): PortablePattern {
  return {
    name,
    kind,
    logic: 'all',
    minimumConditionMatches: 1,
    reusePolicy: 'forbid',
    needsReview: false,
    conditions: [
      {
        matcher: cardValue ? { type: 'card', value: cardValue } : { type: 'role', value: 'starter' },
        quantity: 1,
        kind: 'include',
        distinct: false,
      },
    ],
  }
}

// ── Arbitraries ──

const arbCardRole: fc.Arbitrary<CardRole> = fc.constantFrom(...ALL_ROLES)
const arbCardOrigin: fc.Arbitrary<CardOrigin> = fc.constantFrom('engine', 'non_engine', 'hybrid')
const arbPatternKind: fc.Arbitrary<PatternKind> = fc.constantFrom('opening', 'problem')

const arbPortableDeckCard: fc.Arbitrary<PortableDeckCard> = fc
  .tuple(
    fc.integer({ min: 1, max: 200 }),
    fc.stringMatching(/^[A-Z][a-z]{2,8}$/),
    fc.subarray(ALL_ROLES, { minLength: 1, maxLength: 3 }),
    arbCardOrigin,
  )
  .map(([id, name, roles, origin]) => makeDeckCard(name, id, roles as CardRole[], origin))


const arbPortablePattern: fc.Arbitrary<PortablePattern> = fc
  .tuple(
    fc.stringMatching(/^Pattern[A-Z][a-z]{2,6}$/),
    arbPatternKind,
    fc.constantFrom('all' as const, 'any' as const),
    fc.constantFrom('allow' as const, 'forbid' as const),
  )
  .map(([name, kind, logic, reusePolicy]) => ({
    name,
    kind,
    logic,
    minimumConditionMatches: 1,
    reusePolicy,
    needsReview: false,
    conditions: [
      {
        matcher: { type: 'role' as const, value: 'starter' as CardRole },
        quantity: 1,
        kind: 'include' as const,
        distinct: false,
      },
    ],
  }))

/**
 * Generates a valid PortableConfig with 1-10 main deck cards (each repeated 1-3 times)
 * and 0-3 patterns.
 */
const arbPortableConfig: fc.Arbitrary<PortableConfig> = fc
  .tuple(
    fc.integer({ min: 1, max: 7 }),
    fc.uniqueArray(
      fc.tuple(
        fc.integer({ min: 1, max: 500 }),
        fc.stringMatching(/^[A-Z][a-z]{2,8}$/),
        fc.subarray(ALL_ROLES, { minLength: 1, maxLength: 3 }),
        arbCardOrigin,
        fc.integer({ min: 1, max: 3 }),
      ),
      { minLength: 1, maxLength: 10, selector: (t) => t[0] },
    ),
    fc.array(arbPortablePattern, { minLength: 0, maxLength: 3 }),
  )
  .map(([handSize, cardTuples, patterns]) => {
    const main: PortableDeckCard[] = []
    for (const [id, name, roles, origin, copies] of cardTuples) {
      for (let i = 0; i < copies; i++) {
        main.push(makeDeckCard(name, id, roles as CardRole[], origin))
      }
    }
    return makeConfig({
      handSize,
      deckBuilder: { deckName: 'Gen Deck', main, extra: [], side: [] },
      patterns,
    })
  })

/**
 * Generates a pair of PortableConfigs that share some cards and patterns
 * for realistic comparison testing.
 */
const arbPortableConfigPair: fc.Arbitrary<[PortableConfig, PortableConfig]> = fc
  .tuple(
    // Shared cards (present in both)
    fc.uniqueArray(
      fc.tuple(
        fc.integer({ min: 1, max: 200 }),
        fc.stringMatching(/^[A-Z][a-z]{2,8}$/),
        fc.subarray(ALL_ROLES, { minLength: 1, maxLength: 3 }),
        arbCardOrigin,
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 1, max: 3 }),
      ),
      { minLength: 0, maxLength: 5, selector: (t) => t[0] },
    ),
    // Cards only in A
    fc.uniqueArray(
      fc.tuple(
        fc.integer({ min: 201, max: 400 }),
        fc.stringMatching(/^[A-Z][a-z]{2,8}$/),
        fc.subarray(ALL_ROLES, { minLength: 1, maxLength: 3 }),
        arbCardOrigin,
        fc.integer({ min: 1, max: 3 }),
      ),
      { minLength: 0, maxLength: 5, selector: (t) => t[0] },
    ),
    // Cards only in B
    fc.uniqueArray(
      fc.tuple(
        fc.integer({ min: 401, max: 600 }),
        fc.stringMatching(/^[A-Z][a-z]{2,8}$/),
        fc.subarray(ALL_ROLES, { minLength: 1, maxLength: 3 }),
        arbCardOrigin,
        fc.integer({ min: 1, max: 3 }),
      ),
      { minLength: 0, maxLength: 5, selector: (t) => t[0] },
    ),
    // Shared patterns
    fc.array(arbPortablePattern, { minLength: 0, maxLength: 2 }),
    // Patterns only in A
    fc.array(arbPortablePattern, { minLength: 0, maxLength: 1 }),
    // Patterns only in B
    fc.array(arbPortablePattern, { minLength: 0, maxLength: 1 }),
    fc.integer({ min: 1, max: 7 }),
  )
  .filter(([shared, onlyA, onlyB]) => shared.length + onlyA.length > 0 && shared.length + onlyB.length > 0)
  .map(([shared, onlyA, onlyB, sharedPatterns, patternsA, patternsB, handSize]) => {
    const mainA: PortableDeckCard[] = []
    const mainB: PortableDeckCard[] = []

    for (const [id, name, roles, origin, copiesA, copiesB] of shared) {
      for (let i = 0; i < copiesA; i++) mainA.push(makeDeckCard(name, id, roles as CardRole[], origin))
      for (let i = 0; i < copiesB; i++) mainB.push(makeDeckCard(name, id, roles as CardRole[], origin))
    }
    for (const [id, name, roles, origin, copies] of onlyA) {
      for (let i = 0; i < copies; i++) mainA.push(makeDeckCard(name, id, roles as CardRole[], origin))
    }
    for (const [id, name, roles, origin, copies] of onlyB) {
      for (let i = 0; i < copies; i++) mainB.push(makeDeckCard(name, id, roles as CardRole[], origin))
    }

    const configA = makeConfig({
      handSize,
      deckBuilder: { deckName: 'Deck A', main: mainA, extra: [], side: [] },
      patterns: [...sharedPatterns, ...patternsA],
    })
    const configB = makeConfig({
      handSize,
      deckBuilder: { deckName: 'Deck B', main: mainB, extra: [], side: [] },
      patterns: [...sharedPatterns, ...patternsB],
    })

    return [configA, configB] as [PortableConfig, PortableConfig]
  })

// ══════════════════════════════════════════════════════════════════════════════
// Property Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('Build Comparison — compareBuild', () => {
  describe('Property 9: Card_Diff correctness', () => {
    it('each CardDiff has correct changeType and delta = copiesA - copiesB', () => {
      /** Feature: build-comparison, Property 9: Correctitud del Card_Diff
       *  **Validates: Requirements 5.1, 5.2** */
      fc.assert(
        fc.property(arbPortableConfigPair, ([configA, configB]) => {
          const result = compareBuild(configA, configB)

          for (const diff of result.cardDiffs) {
            // delta = copiesA - copiesB
            expect(diff.delta).toBe(diff.copiesA - diff.copiesB)

            // changeType correctness
            if (diff.copiesA > 0 && diff.copiesB === 0) {
              expect(diff.changeType).toBe('added')
            } else if (diff.copiesA === 0 && diff.copiesB > 0) {
              expect(diff.changeType).toBe('removed')
            } else if (diff.copiesA > 0 && diff.copiesB > 0 && diff.copiesA !== diff.copiesB) {
              expect(diff.changeType).toBe('modified')
            }
          }
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('Property 10: Role_Distribution multi-role support', () => {
    it('each role of each card is counted independently multiplied by copies', () => {
      /** Feature: build-comparison, Property 10: Role_Distribution con soporte multi-rol
       *  **Validates: Requirements 6.1, 6.4** */
      fc.assert(
        fc.property(arbPortableConfig, (config) => {
          const result = compareBuild(config, makeConfig())

          // Manually compute expected role distribution for build A
          const expectedRoles: Record<string, number> = {}
          for (const role of ALL_ROLES) expectedRoles[role] = 0

          // Group cards by ygoprodeckId to count copies and roles
          const cardGroups = new Map<number, { roles: Set<string>; copies: number }>()
          for (const card of config.deckBuilder.main) {
            const existing = cardGroups.get(card.apiCard.ygoprodeckId)
            if (existing) {
              existing.copies += 1
              for (const role of card.roles) existing.roles.add(role)
            } else {
              cardGroups.set(card.apiCard.ygoprodeckId, {
                roles: new Set(card.roles),
                copies: 1,
              })
            }
          }

          for (const { roles, copies } of cardGroups.values()) {
            for (const role of roles) {
              expectedRoles[role] += copies
            }
          }

          for (const role of ALL_ROLES) {
            expect(result.rolesA[role]).toBe(expectedRoles[role])
          }
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('Property 11: Pattern exclusivity classification', () => {
    it('exclusiveTo is A, B, or null based on pattern presence', () => {
      /** Feature: build-comparison, Property 11: Clasificación de exclusividad de patrones
       *  **Validates: Requirements 7.1, 7.2** */
      fc.assert(
        fc.property(arbPortableConfigPair, ([configA, configB]) => {
          const result = compareBuild(configA, configB)

          // Build sets of definition keys for each config
          const keysA = new Set(configA.patterns.map((p) => getPatternDefinitionKey(p)))
          const keysB = new Set(configB.patterns.map((p) => getPatternDefinitionKey(p)))

          for (const pc of result.patternComparisons) {
            const inA = keysA.has(pc.definitionKey)
            const inB = keysB.has(pc.definitionKey)

            if (inA && !inB) {
              expect(pc.exclusiveTo).toBe('A')
            } else if (!inA && inB) {
              expect(pc.exclusiveTo).toBe('B')
            } else {
              expect(pc.exclusiveTo).toBeNull()
            }
          }
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('Property 12: Card order independence', () => {
    it('shuffling Main Deck cards produces identical CardDiff[]', () => {
      /** Feature: build-comparison, Property 12: Independencia del orden de cartas
       *  **Validates: Requirements 8.2** */
      fc.assert(
        fc.property(
          arbPortableConfigPair,
          fc.context(),
          ([configA, configB], _ctx) => {
            const resultOriginal = compareBuild(configA, configB)

            // Shuffle main deck of A
            const shuffledMainA = [...configA.deckBuilder.main].reverse()
            const shuffledConfigA: PortableConfig = {
              ...configA,
              deckBuilder: { ...configA.deckBuilder, main: shuffledMainA },
            }

            const resultShuffled = compareBuild(shuffledConfigA, configB)

            // CardDiffs should be identical (sorted by name)
            expect(resultShuffled.cardDiffs).toEqual(resultOriginal.cardDiffs)
            expect(resultShuffled.rolesA).toEqual(resultOriginal.rolesA)
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('Property 13: Identity comparison', () => {
    it('comparing a build against itself returns buildsAreIdentical=true and empty diffs', () => {
      /** Feature: build-comparison, Property 13: Comparación identidad
       *  **Validates: Requirements 8.3** */
      fc.assert(
        fc.property(arbPortableConfig, (config) => {
          const result = compareBuild(config, config)

          expect(result.buildsAreIdentical).toBe(true)
          expect(result.cardDiffs).toEqual([])
          expect(result.openingDelta).toBe(0)
          expect(result.problemDelta).toBe(0)

          // All role deltas should be zero
          for (const role of ALL_ROLES) {
            expect(result.rolesA[role]).toBe(result.rolesB[role])
          }

          // All pattern comparisons should have delta 0 or null
          for (const pc of result.patternComparisons) {
            if (pc.delta !== null) {
              expect(pc.delta).toBe(0)
            }
            expect(pc.exclusiveTo).toBeNull()
          }
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('Property 14: Symmetry', () => {
    it('delta(A,B) = -delta(B,A) and added↔removed', () => {
      /** Feature: build-comparison, Property 14: Simetría de la comparación
       *  **Validates: Requirements 8.4** */
      fc.assert(
        fc.property(arbPortableConfigPair, ([configA, configB]) => {
          const resultAB = compareBuild(configA, configB)
          const resultBA = compareBuild(configB, configA)

          // For each card diff in AB, there should be a corresponding diff in BA with negated delta
          for (const diffAB of resultAB.cardDiffs) {
            const diffBA = resultBA.cardDiffs.find(
              (d) => d.cardName.toLowerCase() === diffAB.cardName.toLowerCase(),
            )
            expect(diffBA).toBeDefined()
            expect(diffBA!.delta).toBe(-diffAB.delta)

            // added ↔ removed
            if (diffAB.changeType === 'added') {
              expect(diffBA!.changeType).toBe('removed')
            } else if (diffAB.changeType === 'removed') {
              expect(diffBA!.changeType).toBe('added')
            } else {
              expect(diffBA!.changeType).toBe('modified')
            }
          }

          // Opening delta should be negated
          expect(resultBA.openingDelta).toBeCloseTo(-resultAB.openingDelta, 10)
          expect(resultBA.problemDelta).toBeCloseTo(-resultAB.problemDelta, 10)
        }),
        { numRuns: 100 },
      )
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // Unit Tests — Edge Cases
  // ══════════════════════════════════════════════════════════════════════════

  describe('Unit tests: edge cases', () => {
    it('two empty builds → empty result', () => {
      const emptyA = makeConfig()
      const emptyB = makeConfig()
      const result = compareBuild(emptyA, emptyB)

      expect(result.cardDiffs).toEqual([])
      expect(result.deckSizeA).toBe(0)
      expect(result.deckSizeB).toBe(0)
      expect(result.buildsAreIdentical).toBe(true)
      expect(result.patternComparisons).toEqual([])
      expect(result.totalOpeningProbabilityA).toBe(0)
      expect(result.totalOpeningProbabilityB).toBe(0)
    })

    it('build with one card added → CardDiff with changeType "added"', () => {
      const buildA = makeConfig({
        deckBuilder: {
          deckName: 'A',
          main: [makeDeckCard('Ash Blossom', 1, ['handtrap'], 'non_engine')],
          extra: [],
          side: [],
        },
      })
      const buildB = makeConfig()
      const result = compareBuild(buildA, buildB)

      expect(result.cardDiffs.length).toBe(1)
      expect(result.cardDiffs[0].changeType).toBe('added')
      expect(result.cardDiffs[0].copiesA).toBe(1)
      expect(result.cardDiffs[0].copiesB).toBe(0)
      expect(result.cardDiffs[0].delta).toBe(1)
    })

    it('build with card removed → CardDiff with changeType "removed"', () => {
      const buildA = makeConfig()
      const buildB = makeConfig({
        deckBuilder: {
          deckName: 'B',
          main: [makeDeckCard('Maxx C', 2, ['handtrap'], 'non_engine')],
          extra: [],
          side: [],
        },
      })
      const result = compareBuild(buildA, buildB)

      expect(result.cardDiffs.length).toBe(1)
      expect(result.cardDiffs[0].changeType).toBe('removed')
      expect(result.cardDiffs[0].copiesA).toBe(0)
      expect(result.cardDiffs[0].copiesB).toBe(1)
      expect(result.cardDiffs[0].delta).toBe(-1)
    })

    it('build with card modified (2→3 copies) → CardDiff with changeType "modified" and delta 1', () => {
      const buildA = makeConfig({
        deckBuilder: {
          deckName: 'A',
          main: [
            makeDeckCard('Effect Veiler', 3, ['handtrap'], 'non_engine'),
            makeDeckCard('Effect Veiler', 3, ['handtrap'], 'non_engine'),
            makeDeckCard('Effect Veiler', 3, ['handtrap'], 'non_engine'),
          ],
          extra: [],
          side: [],
        },
      })
      const buildB = makeConfig({
        deckBuilder: {
          deckName: 'B',
          main: [
            makeDeckCard('Effect Veiler', 3, ['handtrap'], 'non_engine'),
            makeDeckCard('Effect Veiler', 3, ['handtrap'], 'non_engine'),
          ],
          extra: [],
          side: [],
        },
      })
      const result = compareBuild(buildA, buildB)

      expect(result.cardDiffs.length).toBe(1)
      expect(result.cardDiffs[0].changeType).toBe('modified')
      expect(result.cardDiffs[0].copiesA).toBe(3)
      expect(result.cardDiffs[0].copiesB).toBe(2)
      expect(result.cardDiffs[0].delta).toBe(1)
    })

    it('build without patterns → patternComparisons empty', () => {
      const buildA = makeConfig({
        deckBuilder: {
          deckName: 'A',
          main: [makeDeckCard('Card A', 1)],
          extra: [],
          side: [],
        },
        patterns: [],
      })
      const buildB = makeConfig({
        deckBuilder: {
          deckName: 'B',
          main: [makeDeckCard('Card B', 2)],
          extra: [],
          side: [],
        },
        patterns: [],
      })
      const result = compareBuild(buildA, buildB)

      expect(result.patternComparisons).toEqual([])
    })

    it('build with summary: null (blocking issues) → probabilities are 0', () => {
      // A build with 0 cards in main deck will produce blocking issues
      const buildA = makeConfig({
        deckBuilder: { deckName: 'A', main: [], extra: [], side: [] },
        patterns: [makePattern('Test Opening')],
      })
      const buildB = makeConfig({
        deckBuilder: { deckName: 'B', main: [], extra: [], side: [] },
        patterns: [makePattern('Test Opening')],
      })
      const result = compareBuild(buildA, buildB)

      expect(result.totalOpeningProbabilityA).toBe(0)
      expect(result.totalOpeningProbabilityB).toBe(0)
      expect(result.totalProblemProbabilityA).toBe(0)
      expect(result.totalProblemProbabilityB).toBe(0)
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// interpretComparison Tests
// ══════════════════════════════════════════════════════════════════════════════

import {
  interpretComparison,
  SIGNIFICANCE_THRESHOLD,
  MAX_INSIGHTS,
} from '../app/build-comparison'
import type {
  ComparisonResult,
  RoleDistribution,
  InsightPriority,
} from '../app/build-comparison'

// ── arbitraryComparisonResult generator ──

function createEmptyRoleDistribution(): RoleDistribution {
  return {
    starter: 0,
    extender: 0,
    enabler: 0,
    handtrap: 0,
    disruption: 0,
    boardbreaker: 0,
    floodgate: 0,
    removal: 0,
    searcher: 0,
    draw: 0,
    recovery: 0,
    combo_piece: 0,
    payoff: 0,
    brick: 0,
    garnet: 0,
    tech: 0,
  }
}

const arbRoleDistribution: fc.Arbitrary<RoleDistribution> = fc
  .record({
    starter: fc.integer({ min: 0, max: 12 }),
    extender: fc.integer({ min: 0, max: 12 }),
    enabler: fc.integer({ min: 0, max: 12 }),
    handtrap: fc.integer({ min: 0, max: 12 }),
    disruption: fc.integer({ min: 0, max: 12 }),
    boardbreaker: fc.integer({ min: 0, max: 12 }),
    floodgate: fc.integer({ min: 0, max: 12 }),
    removal: fc.integer({ min: 0, max: 12 }),
    searcher: fc.integer({ min: 0, max: 12 }),
    draw: fc.integer({ min: 0, max: 12 }),
    recovery: fc.integer({ min: 0, max: 12 }),
    combo_piece: fc.integer({ min: 0, max: 12 }),
    payoff: fc.integer({ min: 0, max: 12 }),
    brick: fc.integer({ min: 0, max: 6 }),
    garnet: fc.integer({ min: 0, max: 6 }),
    tech: fc.integer({ min: 0, max: 12 }),
  })

/**
 * Generates a valid ComparisonResult with consistent deltas.
 */
const arbComparisonResult: fc.Arbitrary<ComparisonResult> = fc
  .tuple(
    arbRoleDistribution,
    arbRoleDistribution,
    fc.double({ min: 0, max: 1, noNaN: true }),
    fc.double({ min: 0, max: 1, noNaN: true }),
    fc.double({ min: 0, max: 1, noNaN: true }),
    fc.double({ min: 0, max: 1, noNaN: true }),
    fc.integer({ min: 20, max: 60 }),
    fc.integer({ min: 20, max: 60 }),
  )
  .map(([rolesA, rolesB, openA, openB, probA, probB, deckSizeA, deckSizeB]) => ({
    cardDiffs: [],
    deckSizeA,
    deckSizeB,
    rolesA,
    rolesB,
    patternComparisons: [],
    totalOpeningProbabilityA: openA,
    totalOpeningProbabilityB: openB,
    totalProblemProbabilityA: probA,
    totalProblemProbabilityB: probB,
    openingDelta: openA - openB,
    problemDelta: probA - probB,
    buildsAreIdentical: false,
  }))

/**
 * Generates a ComparisonResult where all deltas are below SIGNIFICANCE_THRESHOLD.
 */
const arbComparisonResultBelowThreshold: fc.Arbitrary<ComparisonResult> = fc
  .tuple(
    fc.double({ min: 0, max: 1, noNaN: true }),
    fc.double({ min: 0, max: 1, noNaN: true }),
  )
  .map(([openA, probA]) => {
    const roles = createEmptyRoleDistribution()
    return {
      cardDiffs: [],
      deckSizeA: 40,
      deckSizeB: 40,
      rolesA: { ...roles },
      rolesB: { ...roles },
      patternComparisons: [],
      totalOpeningProbabilityA: openA,
      totalOpeningProbabilityB: openA, // same → delta = 0
      totalProblemProbabilityA: probA,
      totalProblemProbabilityB: probA, // same → delta = 0
      openingDelta: 0,
      problemDelta: 0,
      buildsAreIdentical: true,
    }
  })

/**
 * Generates a ComparisonResult with significant starter or brick changes.
 */
const arbComparisonResultWithStartersOrBricks: fc.Arbitrary<ComparisonResult> = fc
  .tuple(
    arbRoleDistribution,
    arbRoleDistribution,
    fc.double({ min: 0, max: 1, noNaN: true }),
    fc.double({ min: 0, max: 1, noNaN: true }),
    fc.boolean(), // true = starters change, false = bricks change
  )
  .map(([rolesA, rolesB, openA, probA, useStarters]) => {
    // Ensure significant change in starters or bricks
    if (useStarters) {
      rolesA.starter = rolesB.starter + 2 // +2 starters difference
      // Equalize bricks/garnets so they don't produce a critical insight instead
      rolesA.brick = rolesB.brick
      rolesA.garnet = rolesB.garnet
    } else {
      rolesA.brick = rolesB.brick + 2 // +2 bricks difference (combined brick+garnet will differ)
      rolesA.garnet = rolesB.garnet // equalize garnet so combined delta = +2
      // Equalize starters so they don't produce a critical insight instead
      rolesA.starter = rolesB.starter
    }
    return {
      cardDiffs: [],
      deckSizeA: 40,
      deckSizeB: 40,
      rolesA,
      rolesB,
      patternComparisons: [],
      totalOpeningProbabilityA: openA,
      totalOpeningProbabilityB: openA,
      totalProblemProbabilityA: probA,
      totalProblemProbabilityB: probA,
      openingDelta: 0,
      problemDelta: 0,
      buildsAreIdentical: false,
    }
  })

/**
 * Generates a ComparisonResult with significant extender or handtrap changes.
 */
const arbComparisonResultWithExtendersOrHandtraps: fc.Arbitrary<ComparisonResult> = fc
  .tuple(
    arbRoleDistribution,
    arbRoleDistribution,
    fc.double({ min: 0, max: 1, noNaN: true }),
    fc.double({ min: 0, max: 1, noNaN: true }),
    fc.boolean(), // true = extenders, false = handtraps
  )
  .map(([rolesA, rolesB, openA, probA, useExtenders]) => {
    // Zero out starters and bricks to avoid critical insights dominating
    rolesA.starter = rolesB.starter
    rolesA.brick = rolesB.brick
    rolesA.garnet = rolesB.garnet
    if (useExtenders) {
      rolesA.extender = rolesB.extender + 2
    } else {
      rolesA.handtrap = rolesB.handtrap + 2
    }
    return {
      cardDiffs: [],
      deckSizeA: 40,
      deckSizeB: 40,
      rolesA,
      rolesB,
      patternComparisons: [],
      totalOpeningProbabilityA: openA,
      totalOpeningProbabilityB: openA,
      totalProblemProbabilityA: probA,
      totalProblemProbabilityB: probA,
      openingDelta: 0,
      problemDelta: 0,
      buildsAreIdentical: false,
    }
  })

/**
 * Generates a ComparisonResult where openings improve for A but bricks also increase for A.
 * This should trigger a trade-off verdict.
 */
const arbComparisonResultTradeoff: fc.Arbitrary<ComparisonResult> = fc
  .tuple(
    arbRoleDistribution,
    arbRoleDistribution,
    fc.double({ min: 0.5, max: 0.9, noNaN: true }), // openA (higher)
    fc.double({ min: 0.1, max: 0.4, noNaN: true }), // openB (lower)
  )
  .map(([rolesA, rolesB, openA, openB]) => {
    // A has better openings (openingDelta > 0) but more bricks (bricksDelta > 0)
    rolesA.brick = rolesB.brick + 2
    rolesA.garnet = rolesB.garnet
    return {
      cardDiffs: [],
      deckSizeA: 40,
      deckSizeB: 40,
      rolesA,
      rolesB,
      patternComparisons: [],
      totalOpeningProbabilityA: openA,
      totalOpeningProbabilityB: openB,
      totalProblemProbabilityA: 0.1,
      totalProblemProbabilityB: 0.1,
      openingDelta: openA - openB,
      problemDelta: 0,
      buildsAreIdentical: false,
    }
  })

const PRIORITY_ORDER: Record<InsightPriority, number> = {
  critical: 3,
  high: 2,
  normal: 1,
}

describe('Build Comparison — interpretComparison', () => {
  describe('Property 1: Máximo 3 Insights', () => {
    it('interpretComparison returns at most 3 insights', () => {
      /** Feature: build-comparison, Property 1: Máximo 3 Insights
       *  **Validates: Requirements 2.3, 3.1, 3.12** */
      fc.assert(
        fc.property(arbComparisonResult, (result) => {
          const interpretation = interpretComparison(result)
          expect(interpretation.insights.length).toBeLessThanOrEqual(MAX_INSIGHTS)
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('Property 2: Insights ordenados por prioridad', () => {
    it('insights are ordered by priority (critical > high > normal)', () => {
      /** Feature: build-comparison, Property 2: Insights ordenados por prioridad
       *  **Validates: Requirements 3.2** */
      fc.assert(
        fc.property(arbComparisonResult, (result) => {
          const interpretation = interpretComparison(result)
          const { insights } = interpretation

          for (let i = 0; i < insights.length - 1; i++) {
            expect(PRIORITY_ORDER[insights[i].priority]).toBeGreaterThanOrEqual(
              PRIORITY_ORDER[insights[i + 1].priority],
            )
          }
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('Property 3: Filtrado por umbral de significancia', () => {
    it('when all deltas are below threshold, no insights are generated', () => {
      /** Feature: build-comparison, Property 3: Filtrado por umbral de significancia
       *  **Validates: Requirements 3.13** */
      fc.assert(
        fc.property(arbComparisonResultBelowThreshold, (result) => {
          const interpretation = interpretComparison(result)
          expect(interpretation.insights.length).toBe(0)
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('Property 4: Insights críticos para cambios de starters y bricks', () => {
    it('significant starter or brick changes produce at least one critical insight', () => {
      /** Feature: build-comparison, Property 4: Insights críticos para cambios de starters y bricks
       *  **Validates: Requirements 3.3, 3.4, 3.5, 3.6** */
      fc.assert(
        fc.property(arbComparisonResultWithStartersOrBricks, (result) => {
          const interpretation = interpretComparison(result)
          const hasCritical = interpretation.insights.some((i) => i.priority === 'critical')
          expect(hasCritical).toBe(true)
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('Property 5: Prioridad correcta según tipo de rol', () => {
    it('extender/handtrap changes produce high priority insights', () => {
      /** Feature: build-comparison, Property 5: Insights de prioridad correcta según tipo de rol
       *  **Validates: Requirements 3.7, 3.8, 3.9** */
      fc.assert(
        fc.property(arbComparisonResultWithExtendersOrHandtraps, (result) => {
          const interpretation = interpretComparison(result)
          const hasHigh = interpretation.insights.some((i) => i.priority === 'high')
          expect(hasHigh).toBe(true)
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('Property 6: Cadena de prioridad del Verdict', () => {
    it('verdict follows the priority chain: openings > bricks > problems > equivalent', () => {
      /** Feature: build-comparison, Property 6: Cadena de prioridad del Verdict
       *  **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 2.5** */
      fc.assert(
        fc.property(arbComparisonResult, (result) => {
          const interpretation = interpretComparison(result)
          const { verdict } = interpretation

          const bricksA = result.rolesA.brick + result.rolesA.garnet
          const bricksB = result.rolesB.brick + result.rolesB.garnet
          const bricksDelta = bricksA - bricksB

          if (Math.abs(result.openingDelta) >= SIGNIFICANCE_THRESHOLD) {
            // If there's a trade-off (openings improve but bricks increase), verdict is tradeoff
            const isTradeoff =
              (result.openingDelta > 0 && bricksDelta > 0) ||
              (result.openingDelta < 0 && bricksDelta < 0)
            if (isTradeoff) {
              expect(verdict.type).toBe('tradeoff')
            } else {
              // Openings dominate
              if (result.openingDelta > 0) {
                expect(verdict.type).toBe('a_better')
              } else {
                expect(verdict.type).toBe('b_better')
              }
            }
          } else if (bricksDelta !== 0) {
            // Bricks dominate (fewer bricks is better)
            if (bricksDelta < 0) {
              expect(verdict.type).toBe('a_better')
            } else {
              expect(verdict.type).toBe('b_better')
            }
          } else if (Math.abs(result.problemDelta) >= SIGNIFICANCE_THRESHOLD) {
            // Problems dominate (fewer problems is better)
            if (result.problemDelta < 0) {
              expect(verdict.type).toBe('a_better')
            } else {
              expect(verdict.type).toBe('b_better')
            }
          } else {
            expect(verdict.type).toBe('equivalent')
          }
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('Property 7: Detección de trade-offs', () => {
    it('when openings improve but bricks increase, verdict is tradeoff with tradeoffDetail', () => {
      /** Feature: build-comparison, Property 7: Detección de trade-offs en el Verdict
       *  **Validates: Requirements 4.6** */
      fc.assert(
        fc.property(arbComparisonResultTradeoff, (result) => {
          const interpretation = interpretComparison(result)
          expect(interpretation.verdict.type).toBe('tradeoff')
          expect(interpretation.verdict.tradeoffDetail).not.toBeNull()
          expect(interpretation.verdict.tradeoffDetail!.length).toBeGreaterThan(0)
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('Property 8: Formato del Verdict', () => {
    it('verdict includes formatted openingDelta, integer bricksDelta, and non-null recommendation', () => {
      /** Feature: build-comparison, Property 8: Formato del Verdict incluye deltas y recommendation
       *  **Validates: Requirements 4.7, 4.8** */
      fc.assert(
        fc.property(arbComparisonResult, (result) => {
          const interpretation = interpretComparison(result)
          const { verdict } = interpretation

          // openingDeltaFormatted is a string
          expect(typeof verdict.openingDeltaFormatted).toBe('string')
          expect(verdict.openingDeltaFormatted).toMatch(/^[+-]?\d+\.\d+%$/)

          // bricksDelta is an integer
          expect(Number.isInteger(verdict.bricksDelta)).toBe(true)

          // recommendation is always non-null
          expect(verdict.recommendation).not.toBeNull()
          expect(typeof verdict.recommendation).toBe('string')
          expect(verdict.recommendation!.length).toBeGreaterThan(0)
        }),
        { numRuns: 100 },
      )
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // Unit Tests — Edge Cases for interpretComparison
  // ══════════════════════════════════════════════════════════════════════════

  describe('Unit tests: interpretComparison edge cases', () => {
    function makeComparisonResult(overrides: Partial<ComparisonResult> = {}): ComparisonResult {
      const roles = createEmptyRoleDistribution()
      return {
        cardDiffs: [],
        deckSizeA: 40,
        deckSizeB: 40,
        rolesA: { ...roles },
        rolesB: { ...roles },
        patternComparisons: [],
        totalOpeningProbabilityA: 0.5,
        totalOpeningProbabilityB: 0.5,
        totalProblemProbabilityA: 0.1,
        totalProblemProbabilityB: 0.1,
        openingDelta: 0,
        problemDelta: 0,
        buildsAreIdentical: false,
        ...overrides,
      }
    }

    it('result with +3 starters → critical insight with causa → efecto text', () => {
      // starterDelta (A-B) = -3 → B gained 3 starters → text: "+3 starters → más manos jugables"
      const rolesA = createEmptyRoleDistribution()
      const rolesB = createEmptyRoleDistribution()
      rolesB.starter = rolesA.starter + 3

      const result = makeComparisonResult({ rolesA, rolesB })
      const interpretation = interpretComparison(result)

      const starterInsight = interpretation.insights.find((i) => i.category === 'starters')
      expect(starterInsight).toBeDefined()
      expect(starterInsight!.priority).toBe('critical')
      expect(starterInsight!.text).toContain('starters')
      expect(starterInsight!.text).toContain('→')
      expect(starterInsight!.text).toContain('+3')
      expect(starterInsight!.text).toContain('más manos jugables')
    })

    it('result with -2 handtraps → high insight with causa → efecto text', () => {
      // handtrapDelta (A-B) = 2 → B lost 2 handtraps → text: "-2 handtraps → menos interacción going second"
      const rolesA = createEmptyRoleDistribution()
      const rolesB = createEmptyRoleDistribution()
      rolesA.handtrap = 5
      rolesB.handtrap = 3

      const result = makeComparisonResult({ rolesA, rolesB })
      const interpretation = interpretComparison(result)

      const handtrapInsight = interpretation.insights.find((i) => i.category === 'handtraps')
      expect(handtrapInsight).toBeDefined()
      expect(handtrapInsight!.priority).toBe('high')
      expect(handtrapInsight!.text).toContain('handtraps')
      expect(handtrapInsight!.text).toContain('→')
      expect(handtrapInsight!.text).toContain('-2')
      expect(handtrapInsight!.text).toContain('menos interacción going second')
    })

    it('result with trade-off (better openings, more bricks) → verdict tradeoff', () => {
      const rolesA = createEmptyRoleDistribution()
      const rolesB = createEmptyRoleDistribution()
      rolesA.brick = 4
      rolesB.brick = 2

      const result = makeComparisonResult({
        rolesA,
        rolesB,
        totalOpeningProbabilityA: 0.7,
        totalOpeningProbabilityB: 0.5,
        openingDelta: 0.2,
      })
      const interpretation = interpretComparison(result)

      expect(interpretation.verdict.type).toBe('tradeoff')
      expect(interpretation.verdict.tradeoffDetail).not.toBeNull()
      expect(interpretation.verdict.recommendation).not.toBeNull()
      expect(interpretation.verdict.recommendation).toContain('consistencia')
      expect(interpretation.verdict.recommendation).toContain('bricks')
    })

    it('result with marginal differences (< 1pp) → verdict equivalent, no insights', () => {
      const result = makeComparisonResult({
        openingDelta: 0,
        problemDelta: 0,
      })
      const interpretation = interpretComparison(result)

      expect(interpretation.verdict.type).toBe('equivalent')
      expect(interpretation.insights.length).toBe(0)
      expect(interpretation.verdict.recommendation).toContain('marginales')
    })

    it('verdict a_better by openings → recommendation about consistency', () => {
      const result = makeComparisonResult({
        totalOpeningProbabilityA: 0.7,
        totalOpeningProbabilityB: 0.5,
        openingDelta: 0.2,
      })
      const interpretation = interpretComparison(result)

      expect(interpretation.verdict.type).toBe('a_better')
      expect(interpretation.verdict.recommendation).toBe('Recomendado si priorizás consistencia')
    })

    it('verdict a_better by bricks → recommendation about reducing dead hands', () => {
      const rolesA = createEmptyRoleDistribution()
      const rolesB = createEmptyRoleDistribution()
      rolesA.brick = 1
      rolesB.brick = 3

      const result = makeComparisonResult({ rolesA, rolesB })
      const interpretation = interpretComparison(result)

      expect(interpretation.verdict.type).toBe('a_better')
      expect(interpretation.verdict.recommendation).toBe('Recomendado si querés reducir manos muertas')
    })

    it('insight texts follow Copy Guidelines (causa → efecto, short phrases, player language)', () => {
      const rolesA = createEmptyRoleDistribution()
      const rolesB = createEmptyRoleDistribution()
      rolesA.starter = 6
      rolesB.starter = 3
      rolesA.handtrap = 2
      rolesB.handtrap = 5

      const result = makeComparisonResult({
        rolesA,
        rolesB,
      })
      const interpretation = interpretComparison(result)

      for (const insight of interpretation.insights) {
        // Role-based insights use causa → efecto format
        if (['starters', 'bricks', 'extenders', 'handtraps'].includes(insight.category)) {
          expect(insight.text).toContain('→')
        }
        // Probability insights use "+X.X% label" format
        if (['openings', 'problems'].includes(insight.category)) {
          expect(insight.text).toMatch(/^[+-]\d+\.\d+%/)
        }
        // No technical jargon in any insight
        expect(insight.text).not.toContain('delta')
        expect(insight.text).not.toContain('threshold')
        expect(insight.text).not.toContain('distribución')
      }
    })
  })
})
