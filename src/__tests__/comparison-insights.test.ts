import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  computeRoleDensity,
  sortAndGroupRoles,
  deriveProsCons,
} from '../app/build-comparison'
import type {
  RoleDensityEntry,
  GroupedRoleDensity,
  ProConResult,
  InsightPriority,
  InsightCategory,
  Insight,
} from '../app/build-comparison'
import type { CardEntry, CardRole } from '../types'

// ── Constants ──

const ALL_ROLES: CardRole[] = [
  'starter', 'extender', 'enabler', 'handtrap', 'disruption',
  'boardbreaker', 'floodgate', 'removal', 'searcher', 'draw',
  'recovery', 'combo_piece', 'payoff', 'brick', 'garnet', 'tech',
]

const ALL_INSIGHT_CATEGORIES: InsightCategory[] = [
  'starters', 'bricks', 'extenders', 'handtraps', 'engine', 'openings', 'problems', 'boardbreakers',
]

const ALL_PRIORITIES: InsightPriority[] = ['critical', 'high', 'normal']

const PRIORITY_ORDER: Record<InsightPriority, number> = {
  critical: 3,
  high: 2,
  normal: 1,
}

const MORE_IS_BETTER: Set<InsightCategory> = new Set([
  'starters', 'extenders', 'handtraps', 'boardbreakers', 'openings',
])

const LESS_IS_BETTER: Set<InsightCategory> = new Set([
  'bricks', 'problems',
])

// ── Generators ──

const arbCardRole: fc.Arbitrary<CardRole> = fc.constantFrom(...ALL_ROLES)

/** Generates a CardEntry with random roles and copies */
const arbCardEntry: fc.Arbitrary<CardEntry> = fc
  .tuple(
    fc.stringMatching(/^[A-Z][a-z]{2,8}$/),
    fc.integer({ min: 1, max: 3 }),
    fc.subarray(ALL_ROLES, { minLength: 1, maxLength: 4 }),
  )
  .map(([name, copies, roles]) => ({
    id: name.toLowerCase(),
    name,
    copies,
    source: 'manual' as const,
    apiCard: null,
    origin: 'engine' as const,
    roles: roles as CardRole[],
    needsReview: false,
  }))

/** Generates an array of CardEntry[] with random roles and copies */
const arbCardEntryArray: fc.Arbitrary<CardEntry[]> = fc.array(arbCardEntry, { minLength: 0, maxLength: 10 })

/** Generates a RoleDensityEntry */
const arbRoleDensityEntry: fc.Arbitrary<RoleDensityEntry> = fc
  .tuple(
    arbCardRole,
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 20, max: 60 }),
  )
  .map(([role, count, deckSize]) => ({
    role,
    count,
    density: count / deckSize,
  }))

/** Generates a pair of RoleDensityEntry[] for Build A and Build B */
const arbRoleDensityPair: fc.Arbitrary<[RoleDensityEntry[], RoleDensityEntry[]]> = fc
  .tuple(
    fc.uniqueArray(arbRoleDensityEntry, { minLength: 1, maxLength: 8, selector: (e) => e.role }),
    fc.uniqueArray(arbRoleDensityEntry, { minLength: 1, maxLength: 8, selector: (e) => e.role }),
  )

/** Generates a single Insight with random priority, text, delta, and category */
const arbInsight: fc.Arbitrary<Insight> = fc
  .tuple(
    fc.constantFrom(...ALL_PRIORITIES),
    fc.stringMatching(/^[a-z]{3,12} → [a-z]{3,12}$/),
    fc.integer({ min: -5, max: 5 }).filter((d) => d !== 0),
    fc.constantFrom(...ALL_INSIGHT_CATEGORIES),
  )
  .map(([priority, text, delta, category]) => ({
    priority,
    text,
    delta,
    category,
  }))

/** Generates an array of 0–10 random insights */
const arbInsightArray: fc.Arbitrary<Insight[]> = fc.array(arbInsight, { minLength: 0, maxLength: 10 })

// ══════════════════════════════════════════════════════════════════════════════
// Property Tests: computeRoleDensity
// ══════════════════════════════════════════════════════════════════════════════

describe('computeRoleDensity — Property Tests', () => {
  describe('Property 6: computeRoleDensity includes all roles with copies > 0', () => {
    it('every role with at least one copy appears in the result and no role with 0 copies appears', () => {
      /** Feature: comparison-insights-layer, Property 6: computeRoleDensity incluye todos los roles con copias > 0
       *  **Validates: Requirements 3.5, 5.1** */
      fc.assert(
        fc.property(
          arbCardEntryArray,
          fc.integer({ min: 1, max: 60 }),
          (cards, deckSize) => {
            const result = computeRoleDensity(cards, deckSize)

            // Compute expected role counts manually
            const expectedCounts = new Map<CardRole, number>()
            for (const card of cards) {
              for (const role of card.roles) {
                expectedCounts.set(role, (expectedCounts.get(role) ?? 0) + card.copies)
              }
            }

            // Every role with count > 0 must appear in result
            for (const [role, count] of expectedCounts) {
              if (count > 0) {
                const entry = result.find((e) => e.role === role)
                expect(entry).toBeDefined()
                expect(entry!.count).toBe(count)
              }
            }

            // No role with 0 copies should appear
            for (const entry of result) {
              expect(entry.count).toBeGreaterThan(0)
            }

            // Verify density formula
            for (const entry of result) {
              expect(entry.density).toBeCloseTo(entry.count / deckSize, 10)
            }
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Property Tests: sortAndGroupRoles
// ══════════════════════════════════════════════════════════════════════════════

describe('sortAndGroupRoles — Property Tests', () => {
  describe('Property 7: Stable role order between Build A and Build B', () => {
    it('the order of visible roles in Build B matches Build A order', () => {
      /** Feature: comparison-insights-layer, Property 7: Orden estable de roles entre Build A y Build B
       *  **Validates: Requirements 4.6** */
      fc.assert(
        fc.property(
          arbRoleDensityPair,
          fc.integer({ min: 2, max: 8 }),
          ([densityA, densityB], maxVisible) => {
            const { groupedA, groupedB } = sortAndGroupRoles(densityA, densityB, maxVisible)

            // groupedB should not be null since we passed a non-null densityB
            expect(groupedB).not.toBeNull()

            // The order of roles in groupedB.visible must match groupedA.visible
            const rolesA = groupedA.visible.map((e) => e.role)
            const rolesB = groupedB!.visible.map((e) => e.role)

            expect(rolesA.length).toBe(rolesB.length)
            for (let i = 0; i < rolesA.length; i++) {
              expect(rolesB[i]).toBe(rolesA[i])
            }

            // visible.length <= maxVisible
            expect(groupedA.visible.length).toBeLessThanOrEqual(maxVisible)
            expect(groupedB!.visible.length).toBeLessThanOrEqual(maxVisible)
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Property Tests: deriveProsCons
// ══════════════════════════════════════════════════════════════════════════════

describe('deriveProsCons — Property Tests', () => {
  describe('Property 1: Correct classification of pros/contras by delta and category', () => {
    it('insights are classified correctly based on delta sign and category type', () => {
      /** Feature: comparison-insights-layer, Property 1: Clasificación correcta de pros/contras según delta y categoría
       *  **Validates: Requirements 1.1, 2.3, 2.4** */
      fc.assert(
        fc.property(arbInsightArray, (insights) => {
          const result = deriveProsCons(insights)

          // For each insight that has a non-zero delta and a classifiable category,
          // verify it ends up in the correct lists
          for (const insight of insights) {
            if (insight.delta === 0) continue
            if (!MORE_IS_BETTER.has(insight.category) && !LESS_IS_BETTER.has(insight.category)) continue

            const inProsA = result.prosA.some((e) => e.text === insight.text && e.delta === insight.delta)
            const inContrasA = result.contrasA.some((e) => e.text === insight.text && e.delta === insight.delta)
            const inProsB = result.prosB.some((e) => e.text === insight.text && e.delta === insight.delta)
            const inContrasB = result.contrasB.some((e) => e.text === insight.text && e.delta === insight.delta)

            if (MORE_IS_BETTER.has(insight.category)) {
              if (insight.delta > 0) {
                // Pro for A, contra for B (may be truncated to 3)
                // If it appears, it must be in the right list
                if (inProsA) expect(inContrasB).toBe(true)
                if (inContrasB) expect(inProsA).toBe(true)
                expect(inContrasA).toBe(false)
                expect(inProsB).toBe(false)
              } else {
                // Contra for A, pro for B
                if (inContrasA) expect(inProsB).toBe(true)
                if (inProsB) expect(inContrasA).toBe(true)
                expect(inProsA).toBe(false)
                expect(inContrasB).toBe(false)
              }
            } else if (LESS_IS_BETTER.has(insight.category)) {
              if (insight.delta > 0) {
                // A has more of something bad → contra A, pro B
                if (inContrasA) expect(inProsB).toBe(true)
                if (inProsB) expect(inContrasA).toBe(true)
                expect(inProsA).toBe(false)
                expect(inContrasB).toBe(false)
              } else {
                // B has more of something bad → pro A, contra B
                if (inProsA) expect(inContrasB).toBe(true)
                if (inContrasB) expect(inProsA).toBe(true)
                expect(inContrasA).toBe(false)
                expect(inProsB).toBe(false)
              }
            }
          }
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('Property 2: Limit of 3 entries per list', () => {
    it('each of the four lists has at most 3 entries', () => {
      /** Feature: comparison-insights-layer, Property 2: Límite de 3 entradas por lista
       *  **Validates: Requirements 1.2, 2.6** */
      fc.assert(
        fc.property(arbInsightArray, (insights) => {
          const result = deriveProsCons(insights)

          expect(result.prosA.length).toBeLessThanOrEqual(3)
          expect(result.contrasA.length).toBeLessThanOrEqual(3)
          expect(result.prosB.length).toBeLessThanOrEqual(3)
          expect(result.contrasB.length).toBeLessThanOrEqual(3)
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('Property 3: Preservation of text from original insights', () => {
    it('every ProConEntry text exists in the original insights array', () => {
      /** Feature: comparison-insights-layer, Property 3: Preservación de texto desde insights originales
       *  **Validates: Requirements 1.4** */
      fc.assert(
        fc.property(arbInsightArray, (insights) => {
          const result = deriveProsCons(insights)
          const originalTexts = new Set(insights.map((i) => i.text))

          const allEntries = [
            ...result.prosA,
            ...result.contrasA,
            ...result.prosB,
            ...result.contrasB,
          ]

          for (const entry of allEntries) {
            expect(originalTexts.has(entry.text)).toBe(true)
          }
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('Property 4: Ordering by priority descending', () => {
    it('each list is ordered by priority descending (critical > high > normal)', () => {
      /** Feature: comparison-insights-layer, Property 4: Ordenamiento por prioridad descendente
       *  **Validates: Requirements 1.7, 2.5** */
      fc.assert(
        fc.property(arbInsightArray, (insights) => {
          const result = deriveProsCons(insights)

          const checkOrder = (list: typeof result.prosA) => {
            for (let i = 0; i < list.length - 1; i++) {
              expect(PRIORITY_ORDER[list[i].priority]).toBeGreaterThanOrEqual(
                PRIORITY_ORDER[list[i + 1].priority],
              )
            }
          }

          checkOrder(result.prosA)
          checkOrder(result.contrasA)
          checkOrder(result.prosB)
          checkOrder(result.contrasB)
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('Property 5: Explicit symmetry between builds', () => {
    it('prosA texts match contrasB texts exactly, contrasA texts match prosB texts exactly', () => {
      /** Feature: comparison-insights-layer, Property 5: Simetría explícita entre builds
       *  **Validates: Requirements 2.2** */
      fc.assert(
        fc.property(arbInsightArray, (insights) => {
          const result = deriveProsCons(insights)

          // prosA texts must match contrasB texts exactly (same order)
          const prosATexts = result.prosA.map((e) => e.text)
          const contrasBTexts = result.contrasB.map((e) => e.text)
          expect(prosATexts).toEqual(contrasBTexts)

          // contrasA texts must match prosB texts exactly (same order)
          const contrasATexts = result.contrasA.map((e) => e.text)
          const prosBTexts = result.prosB.map((e) => e.text)
          expect(contrasATexts).toEqual(prosBTexts)
        }),
        { numRuns: 100 },
      )
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests: Edge Cases
// ══════════════════════════════════════════════════════════════════════════════

describe('Edge Cases — Unit Tests', () => {
  it('deriveProsCons([]) returns four empty lists', () => {
    const result = deriveProsCons([])
    expect(result.prosA).toEqual([])
    expect(result.contrasA).toEqual([])
    expect(result.prosB).toEqual([])
    expect(result.contrasB).toEqual([])
  })

  it('computeRoleDensity([], 0) returns empty array', () => {
    const result = computeRoleDensity([], 0)
    expect(result).toEqual([])
  })

  it('insights with delta === 0 do not generate entries in pros or contras', () => {
    const insights: Insight[] = [
      { priority: 'critical', text: 'zero delta insight', delta: 0, category: 'starters' },
      { priority: 'high', text: 'another zero', delta: 0, category: 'bricks' },
    ]
    const result = deriveProsCons(insights)
    expect(result.prosA).toEqual([])
    expect(result.contrasA).toEqual([])
    expect(result.prosB).toEqual([])
    expect(result.contrasB).toEqual([])
  })

  it('sortAndGroupRoles with densityB = null returns groupedB = null', () => {
    const densityA: RoleDensityEntry[] = [
      { role: 'starter', count: 10, density: 0.25 },
      { role: 'handtrap', count: 6, density: 0.15 },
    ]
    const { groupedA, groupedB } = sortAndGroupRoles(densityA, null, 5)
    expect(groupedB).toBeNull()
    expect(groupedA.visible.length).toBeGreaterThan(0)
  })
})


// ══════════════════════════════════════════════════════════════════════════════
// 8.3: Integration Tests — Density Chart data pipeline
// ══════════════════════════════════════════════════════════════════════════════

describe('Density Chart Integration — computeRoleDensity + sortAndGroupRoles', () => {
  it('produces correct data for an example deck', () => {
    const exampleDeck: CardEntry[] = [
      { id: '1', name: 'Ash Blossom', copies: 3, source: 'manual', apiCard: null, origin: 'non_engine', roles: ['handtrap'], needsReview: false },
      { id: '2', name: 'Nibiru', copies: 2, source: 'manual', apiCard: null, origin: 'non_engine', roles: ['handtrap', 'boardbreaker'], needsReview: false },
      { id: '3', name: 'Starter A', copies: 3, source: 'manual', apiCard: null, origin: 'engine', roles: ['starter', 'searcher'], needsReview: false },
      { id: '4', name: 'Extender A', copies: 3, source: 'manual', apiCard: null, origin: 'engine', roles: ['extender'], needsReview: false },
      { id: '5', name: 'Brick Card', copies: 1, source: 'manual', apiCard: null, origin: 'engine', roles: ['brick'], needsReview: false },
      { id: '6', name: 'Tech Card', copies: 2, source: 'manual', apiCard: null, origin: 'non_engine', roles: ['tech'], needsReview: false },
      { id: '7', name: 'Draw Card', copies: 2, source: 'manual', apiCard: null, origin: 'engine', roles: ['draw'], needsReview: false },
      { id: '8', name: 'Recovery', copies: 1, source: 'manual', apiCard: null, origin: 'engine', roles: ['recovery'], needsReview: false },
      { id: '9', name: 'Combo Piece', copies: 2, source: 'manual', apiCard: null, origin: 'engine', roles: ['combo_piece'], needsReview: false },
      { id: '10', name: 'Removal', copies: 2, source: 'manual', apiCard: null, origin: 'non_engine', roles: ['removal'], needsReview: false },
      { id: '11', name: 'Floodgate', copies: 1, source: 'manual', apiCard: null, origin: 'non_engine', roles: ['floodgate'], needsReview: false },
    ]

    const deckSize = exampleDeck.reduce((sum, c) => sum + c.copies, 0) // 22
    const density = computeRoleDensity(exampleDeck, deckSize)

    // Verify expected role counts
    const handtrapEntry = density.find((e) => e.role === 'handtrap')
    expect(handtrapEntry).toBeDefined()
    expect(handtrapEntry!.count).toBe(5) // 3 Ash + 2 Nibiru
    expect(handtrapEntry!.density).toBeCloseTo(5 / 22, 10)

    const starterEntry = density.find((e) => e.role === 'starter')
    expect(starterEntry).toBeDefined()
    expect(starterEntry!.count).toBe(3)

    const boardbreakerEntry = density.find((e) => e.role === 'boardbreaker')
    expect(boardbreakerEntry).toBeDefined()
    expect(boardbreakerEntry!.count).toBe(2) // Nibiru only

    // Now group with maxVisible = 5
    const { groupedA, groupedB } = sortAndGroupRoles(density, null, 5)

    // groupedB should be null since densityB is null
    expect(groupedB).toBeNull()

    // groupedA should have at most 5 visible roles
    expect(groupedA.visible.length).toBeLessThanOrEqual(5)

    // The top roles by density should be visible (handtrap has highest density at 5/22)
    const visibleRoles = groupedA.visible.map((e) => e.role)
    expect(visibleRoles).toContain('handtrap')

    // Remaining roles should be in "Otros"
    const totalRolesInDeck = density.length
    if (totalRolesInDeck > 5) {
      expect(groupedA.otherCount).toBeGreaterThan(0)
    }
  })

  it('groups excess roles into "Otros" bucket correctly', () => {
    // Create a deck with many roles (more than maxVisible)
    const manyRolesDeck: CardEntry[] = [
      { id: '1', name: 'Card1', copies: 5, source: 'manual', apiCard: null, origin: 'engine', roles: ['starter'], needsReview: false },
      { id: '2', name: 'Card2', copies: 4, source: 'manual', apiCard: null, origin: 'engine', roles: ['extender'], needsReview: false },
      { id: '3', name: 'Card3', copies: 3, source: 'manual', apiCard: null, origin: 'non_engine', roles: ['handtrap'], needsReview: false },
      { id: '4', name: 'Card4', copies: 3, source: 'manual', apiCard: null, origin: 'engine', roles: ['searcher'], needsReview: false },
      { id: '5', name: 'Card5', copies: 2, source: 'manual', apiCard: null, origin: 'non_engine', roles: ['boardbreaker'], needsReview: false },
      { id: '6', name: 'Card6', copies: 2, source: 'manual', apiCard: null, origin: 'engine', roles: ['draw'], needsReview: false },
      { id: '7', name: 'Card7', copies: 1, source: 'manual', apiCard: null, origin: 'engine', roles: ['brick'], needsReview: false },
      { id: '8', name: 'Card8', copies: 1, source: 'manual', apiCard: null, origin: 'non_engine', roles: ['tech'], needsReview: false },
      { id: '9', name: 'Card9', copies: 1, source: 'manual', apiCard: null, origin: 'engine', roles: ['recovery'], needsReview: false },
    ]

    const deckSize = manyRolesDeck.reduce((sum, c) => sum + c.copies, 0) // 22
    const density = computeRoleDensity(manyRolesDeck, deckSize)

    // Group with maxVisible = 4 (so 5 roles go to "Otros")
    const { groupedA } = sortAndGroupRoles(density, null, 4)

    expect(groupedA.visible.length).toBe(4)

    // "Otros" should contain the remaining roles
    const excessRoles = density.length - 4
    expect(excessRoles).toBeGreaterThan(0)
    expect(groupedA.otherCount).toBeGreaterThan(0)
    expect(groupedA.otherDensity).toBeGreaterThan(0)

    // Verify that otherCount equals the sum of counts of non-visible roles
    const visibleRoles = new Set(groupedA.visible.map((e) => e.role))
    const expectedOtherCount = density
      .filter((e) => !visibleRoles.has(e.role))
      .reduce((sum, e) => sum + e.count, 0)
    expect(groupedA.otherCount).toBe(expectedOtherCount)

    const expectedOtherDensity = density
      .filter((e) => !visibleRoles.has(e.role))
      .reduce((sum, e) => sum + e.density, 0)
    expect(groupedA.otherDensity).toBeCloseTo(expectedOtherDensity, 10)
  })

  it('sortAndGroupRoles with densityB = null returns groupedB = null', () => {
    const densityA: RoleDensityEntry[] = [
      { role: 'starter', count: 8, density: 0.2 },
      { role: 'handtrap', count: 6, density: 0.15 },
      { role: 'extender', count: 4, density: 0.1 },
    ]

    const { groupedA, groupedB } = sortAndGroupRoles(densityA, null, 5)

    expect(groupedB).toBeNull()
    expect(groupedA).not.toBeNull()
    expect(groupedA.visible.length).toBe(3) // all 3 fit within maxVisible=5
    expect(groupedA.otherCount).toBe(0)
  })
})
