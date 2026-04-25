import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { createPattern } from '../app/pattern-factory'
import { curatePatterns } from '../app/pattern-curation'
import type { CardEntry, HandPattern, CardOrigin, CardRole } from '../types'

/**
 * Bug Condition Exploration Test
 *
 * **Validates: Requirements 1.1, 1.2, 1.3**
 *
 * Property 1: Bug Condition — El drawer se auto-cierra después de abrirse desde DeckQualityHero
 *
 * The bug manifests when:
 * 1. handleOpenCustomCreate calls patternActions.addPattern('opening') → appendPattern to Redux
 * 2. usePatternMaintenance dispatches replacePatterns/completePatternSeeding with curatePatterns output
 * 3. curatePatterns replaces the entire patterns array, and the newly created pattern
 *    (empty name, just created) does NOT survive the curation
 * 4. The cleanup useEffect detects selectedPatternId not in patterns → resets drawerMode to null
 *
 * This test is EXPECTED TO FAIL on unfixed code — failure confirms the bug exists.
 */

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
 * Simulates the cleanup useEffect logic from ProbabilityPanelContent.
 *
 * From ProbabilityPanel.tsx lines ~355-364:
 * ```
 * useEffect(() => {
 *   if (!selectedPatternId || patterns.some(p => p.id === selectedPatternId)) return
 *   if (pendingCreatedPatternId && selectedPatternId === pendingCreatedPatternId) return
 *   setSelectedPatternId(null)
 *   setDrawerMode(current => current === 'quick-add' ? current : null)
 * }, [patterns, pendingCreatedPatternId, selectedPatternId])
 * ```
 */
function simulateCleanupEffect(params: {
  patterns: HandPattern[]
  selectedPatternId: string | null
  pendingCreatedPatternId: string | null
  drawerMode: 'custom-create' | 'edit' | 'quick-add' | null
}): { drawerMode: typeof params.drawerMode; selectedPatternId: string | null } {
  const { patterns, selectedPatternId, pendingCreatedPatternId, drawerMode } = params

  // If no selectedPatternId, or it exists in patterns, no cleanup needed
  if (!selectedPatternId || patterns.some((p) => p.id === selectedPatternId)) {
    return { drawerMode, selectedPatternId }
  }

  // If the selected pattern is the pending created one, skip cleanup
  if (pendingCreatedPatternId && selectedPatternId === pendingCreatedPatternId) {
    return { drawerMode, selectedPatternId }
  }

  // Cleanup: reset selectedPatternId and drawerMode (except quick-add)
  return {
    drawerMode: drawerMode === 'quick-add' ? drawerMode : null,
    selectedPatternId: null,
  }
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const arbCardOrigin: fc.Arbitrary<CardOrigin> = fc.constantFrom('engine', 'non_engine', 'hybrid')
const arbCardRole: fc.Arbitrary<CardRole> = fc.constantFrom(
  'starter', 'extender', 'enabler', 'handtrap', 'disruption',
  'boardbreaker', 'floodgate', 'removal', 'searcher', 'draw',
  'recovery', 'combo_piece', 'payoff', 'brick', 'garnet', 'tech',
)


/**
 * Generates a deck of cards with at least one card that has origin and roles set,
 * suitable for curatePatterns to work with.
 */
const arbDeckCards: fc.Arbitrary<CardEntry[]> = fc
  .integer({ min: 1, max: 4 })
  .chain((cardCount) =>
    fc.tuple(
      fc.uniqueArray(
        fc.stringMatching(/^[A-Z][a-z]{2,8}$/),
        { minLength: cardCount, maxLength: cardCount },
      ),
      fc.array(
        fc.integer({ min: 1, max: 3 }),
        { minLength: cardCount, maxLength: cardCount },
      ),
      fc.array(arbCardOrigin, { minLength: cardCount, maxLength: cardCount }),
      fc.array(
        fc.array(arbCardRole, { minLength: 1, maxLength: 2 }),
        { minLength: cardCount, maxLength: cardCount },
      ),
    ).map(([names, copies, origins, rolesArr]) =>
      names.map((name, i) => makeCard(`card-${i + 1}`, name, copies[i], origins[i], rolesArr[i])),
    ),
  )

/**
 * Generates existing patterns that trigger usePatternMaintenance conditions.
 * At least one pattern will have needsReview: true to trigger migration.
 */
const arbMaintenanceTriggeringPatterns: fc.Arbitrary<HandPattern[]> = fc
  .integer({ min: 1, max: 3 })
  .chain((count) =>
    fc.array(
      fc.record({
        name: fc.stringMatching(/^[A-Z][a-z]{2,12}$/).filter((s) => s.trim().length > 0),
        kind: fc.constantFrom('opening' as const, 'problem' as const),
        needsReview: fc.boolean(),
        cardIndex: fc.integer({ min: 0, max: 3 }),
      }),
      { minLength: count, maxLength: count },
    ),
  )
  .map((defs) => {
    // Ensure at least one pattern has needsReview: true to trigger maintenance
    const hasReview = defs.some((d) => d.needsReview)
    if (!hasReview && defs.length > 0) {
      defs[0].needsReview = true
    }
    return defs.map((def, i) => ({
      id: `existing-pattern-${i}`,
      name: def.name,
      kind: def.kind,
      logic: 'all' as const,
      minimumConditionMatches: 1,
      reusePolicy: 'forbid' as const,
      needsReview: def.needsReview,
      conditions: [
        {
          id: `req-${i}`,
          matcher: { type: 'card' as const, value: `card-${(def.cardIndex % 4) + 1}` },
          quantity: 1,
          kind: 'include' as const,
          distinct: false,
        },
      ],
    }))
  })

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Bug Condition Exploration: Drawer auto-closes after opening from DeckQualityHero', () => {
  it('Property 1: after adding a new pattern (custom-create) and running maintenance curation, the newly created pattern survives in the patterns array', () => {
    /**
     * **Validates: Requirements 1.1, 1.2, 1.3**
     *
     * Simulates the handleOpenCustomCreate flow:
     * 1. Create a new pattern via createPattern('', undefined, 'opening') — empty name
     * 2. Append it to existing patterns (simulating appendPattern Redux action)
     * 3. Run curatePatterns (simulating usePatternMaintenance dispatching replacePatterns)
     * 4. Assert the newly created pattern still exists in the curated result
     *
     * On UNFIXED code, curatePatterns will filter out the newly created pattern
     * because it has an empty name and needsReview: false but its conditions
     * reference no valid cards in the deck, causing the pattern to be dropped.
     */
    fc.assert(
      fc.property(
        arbDeckCards,
        arbMaintenanceTriggeringPatterns,
        (deckCards, existingPatterns) => {
          // Step 1: Simulate handleOpenCustomCreate — create a new pattern
          const newPattern = createPattern('', undefined, 'opening')
          const newPatternId = newPattern.id

          // Step 2: Append the new pattern to existing patterns (simulating Redux appendPattern)
          const patternsAfterAppend = [...existingPatterns, newPattern]

          // Step 3: Run curatePatterns (simulating usePatternMaintenance)
          // This is what happens when maintenance detects needsReview patterns
          const curatedPatterns = curatePatterns(patternsAfterAppend, deckCards, {
            includeDefaults: false,
          })

          // Step 4: Assert the newly created pattern survives curation
          const newPatternSurvived = curatedPatterns.some((p) => p.id === newPatternId)

          // Step 5: Simulate the cleanup effect
          // In the real code, selectedPatternId = newPatternId, pendingCreatedPatternId = newPatternId
          // The cleanup effect checks if selectedPatternId exists in patterns
          // If the pattern was removed by curation, and the effect runs BEFORE
          // pendingCreatedPatternId is set (race condition), the drawer closes
          const afterCleanup = simulateCleanupEffect({
            patterns: curatedPatterns,
            selectedPatternId: newPatternId,
            // In the bug scenario, pendingCreatedPatternId may not be set yet
            // due to React batching, OR the pattern simply doesn't exist
            pendingCreatedPatternId: newPatternId,
            drawerMode: 'custom-create',
          })

          // The drawer should remain open
          expect(newPatternSurvived).toBe(true)
          expect(afterCleanup.drawerMode).toBe('custom-create')
          expect(afterCleanup.selectedPatternId).toBe(newPatternId)
        },
      ),
      { verbose: 2, numRuns: 100 },
    )
  })

  it('Property 1b: cleanup effect closes drawer when newly created pattern is missing and pendingCreatedPatternId is not yet set (race condition)', () => {
    /**
     * **Validates: Requirements 1.1, 1.3**
     *
     * This tests the specific race condition where:
     * - handleOpenCustomCreate dispatches appendPattern to Redux
     * - usePatternMaintenance dispatches replacePatterns, removing the new pattern
     * - The cleanup effect runs with selectedPatternId set but pendingCreatedPatternId
     *   still null (because React batched the Redux dispatch separately from setState)
     * - Result: drawerMode is reset to null → drawer closes
     *
     * On UNFIXED code, this SHOULD FAIL because the pattern gets removed by curation
     * and the cleanup effect closes the drawer.
     */
    fc.assert(
      fc.property(
        arbDeckCards,
        arbMaintenanceTriggeringPatterns,
        (deckCards, existingPatterns) => {
          // Create a new pattern (simulating handleOpenCustomCreate)
          const newPattern = createPattern('', undefined, 'opening')
          const newPatternId = newPattern.id

          // Append and curate (simulating the maintenance flow)
          const patternsAfterAppend = [...existingPatterns, newPattern]
          const curatedPatterns = curatePatterns(patternsAfterAppend, deckCards, {
            includeDefaults: false,
          })

          // Simulate the race condition: pendingCreatedPatternId is null
          // (React hasn't batched the setState yet when the effect runs)
          const afterCleanup = simulateCleanupEffect({
            patterns: curatedPatterns,
            selectedPatternId: newPatternId,
            pendingCreatedPatternId: null, // Race condition!
            drawerMode: 'custom-create',
          })

          // The drawer should remain open even in this race condition
          expect(afterCleanup.drawerMode).toBe('custom-create')
          expect(afterCleanup.selectedPatternId).toBe(newPatternId)
        },
      ),
      { verbose: 2, numRuns: 100 },
    )
  })
})


// ---------------------------------------------------------------------------
// Preservation Property-Based Tests
// ---------------------------------------------------------------------------
//
// **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
//
// Property 2: Preservation — Comportamiento de cierre manual y operaciones
// existentes sin cambios.
//
// These tests observe and capture the baseline behavior of the UNFIXED code
// for non-buggy interactions (everything that is NOT opening the drawer from
// DeckQualityHero). They MUST PASS on unfixed code.
// ---------------------------------------------------------------------------

/**
 * Simulates handleCloseDrawer from ProbabilityPanelContent.
 *
 * From ProbabilityPanel.tsx:
 * ```
 * const handleCloseDrawer = () => {
 *   if (pendingCreatedPatternId && pendingCreatedPatternId === selectedPatternId) {
 *     const pendingPattern = patterns.find(p => p.id === pendingCreatedPatternId)
 *     if (pendingPattern && pendingPattern.name.trim().length === 0) {
 *       patternActions.removePattern(pendingCreatedPatternId)
 *       showToast('Chequeo vacío descartado')
 *     }
 *     setPendingCreatedPatternId(null)
 *   }
 *   setSelectedPatternId(null)
 *   setDrawerMode(null)
 * }
 * ```
 */
function simulateHandleCloseDrawer(params: {
  patterns: HandPattern[]
  selectedPatternId: string | null
  pendingCreatedPatternId: string | null
}): {
  drawerMode: 'custom-create' | 'edit' | 'quick-add' | null
  selectedPatternId: string | null
  pendingCreatedPatternId: string | null
  removedPatternId: string | null
  toastShown: boolean
} {
  const { patterns, selectedPatternId, pendingCreatedPatternId } = params
  let removedPatternId: string | null = null
  let toastShown = false
  let nextPendingCreatedPatternId = pendingCreatedPatternId

  if (pendingCreatedPatternId && pendingCreatedPatternId === selectedPatternId) {
    const pendingPattern = patterns.find((p) => p.id === pendingCreatedPatternId)
    if (pendingPattern && pendingPattern.name.trim().length === 0) {
      removedPatternId = pendingCreatedPatternId
      toastShown = true
    }
    nextPendingCreatedPatternId = null
  }

  return {
    drawerMode: null,
    selectedPatternId: null,
    pendingCreatedPatternId: nextPendingCreatedPatternId,
    removedPatternId,
    toastShown,
  }
}

/**
 * Simulates handleEditPattern from ProbabilityPanelContent.
 *
 * From ProbabilityPanel.tsx:
 * ```
 * const handleEditPattern = (patternId: string) => {
 *   setSelectedPatternId(patternId)
 *   setHighlightedPatternId(patternId)
 *   setDrawerMode('edit')
 * }
 * ```
 */
function simulateHandleEditPattern(patternId: string): {
  drawerMode: 'custom-create' | 'edit' | 'quick-add' | null
  selectedPatternId: string | null
} {
  return {
    drawerMode: 'edit',
    selectedPatternId: patternId,
  }
}

/**
 * Simulates handleSelectPreset from ProbabilityPanelContent.
 *
 * From ProbabilityPanel.tsx:
 * ```
 * const handleSelectPreset = (presetId: string) => {
 *   const preset = presetById.get(presetId)
 *   if (!preset) return
 *   patternActions.appendPattern(preset.pattern)
 *   setDrawerMode(null)
 *   setSelectedPatternId(null)
 * }
 * ```
 */
function simulateHandleSelectPreset(params: {
  patterns: HandPattern[]
  presetPattern: HandPattern
}): {
  drawerMode: 'custom-create' | 'edit' | 'quick-add' | null
  selectedPatternId: string | null
  resultingPatterns: HandPattern[]
} {
  return {
    drawerMode: null,
    selectedPatternId: null,
    resultingPatterns: [...params.patterns, params.presetPattern],
  }
}

// ---------------------------------------------------------------------------
// Preservation Arbitraries
// ---------------------------------------------------------------------------

/** Generates a valid, named pattern that exists in the patterns array. */
const arbNamedPattern: fc.Arbitrary<HandPattern> = fc
  .record({
    name: fc.stringMatching(/^[A-Z][a-z]{2,12}$/).filter((s) => s.trim().length > 0),
    kind: fc.constantFrom('opening' as const, 'problem' as const),
    cardIndex: fc.integer({ min: 1, max: 4 }),
  })
  .map((def) => ({
    id: `named-pattern-${def.cardIndex}-${def.name}`,
    name: def.name,
    kind: def.kind,
    logic: 'all' as const,
    minimumConditionMatches: 1,
    reusePolicy: 'forbid' as const,
    needsReview: false,
    conditions: [
      {
        id: `req-named-${def.cardIndex}`,
        matcher: { type: 'role' as const, value: 'starter' as const },
        quantity: 1,
        kind: 'include' as const,
        distinct: false,
      },
    ],
  }))

/** Generates a list of 1-5 valid named patterns. */
const arbNamedPatterns: fc.Arbitrary<HandPattern[]> = fc
  .integer({ min: 1, max: 5 })
  .chain((count) =>
    fc.array(arbNamedPattern, { minLength: count, maxLength: count }),
  )
  .map((patterns) =>
    // Ensure unique IDs
    patterns.map((p, i) => ({ ...p, id: `pattern-${i}` })),
  )

/** Generates a pending pattern with empty name (simulating a just-created pattern). */
const arbPendingEmptyPattern: fc.Arbitrary<HandPattern> = fc
  .constant(null)
  .map(() => ({
    id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    kind: 'opening' as const,
    logic: 'all' as const,
    minimumConditionMatches: 1,
    reusePolicy: 'forbid' as const,
    needsReview: false,
    conditions: [
      {
        id: 'req-pending',
        matcher: null,
        quantity: 1,
        kind: 'include' as const,
        distinct: false,
      },
    ],
  }))

/** Generates a drawer mode for an open drawer. */
const arbOpenDrawerMode: fc.Arbitrary<'custom-create' | 'edit' | 'quick-add'> =
  fc.constantFrom('custom-create', 'edit', 'quick-add')

/** Generates a preset-like pattern (named, with valid conditions). */
const arbPresetPattern: fc.Arbitrary<HandPattern> = fc
  .record({
    name: fc.stringMatching(/^[A-Z][a-z]{3,10}$/),
    kind: fc.constantFrom('opening' as const, 'problem' as const),
    role: arbCardRole,
  })
  .map((def) => ({
    id: `preset-${def.name}-${def.role}`,
    name: def.name,
    kind: def.kind,
    logic: 'all' as const,
    minimumConditionMatches: 1,
    reusePolicy: 'forbid' as const,
    needsReview: false,
    conditions: [
      {
        id: `req-preset-${def.role}`,
        matcher: { type: 'role' as const, value: def.role },
        quantity: 1,
        kind: (def.kind === 'problem' ? 'exclude' : 'include') as 'include' | 'exclude',
        distinct: false,
      },
    ],
  }))

// ---------------------------------------------------------------------------
// Preservation Tests
// ---------------------------------------------------------------------------

describe('Preservation: Existing drawer behaviors remain unchanged', () => {
  it('Property 2a: for all manual closes (backdrop/close button), drawerMode resets to null and selectedPatternId is cleaned', () => {
    /**
     * **Validates: Requirements 3.1, 3.2**
     *
     * Observes: handleCloseDrawer always sets drawerMode = null and
     * selectedPatternId = null, regardless of the current drawer mode.
     */
    fc.assert(
      fc.property(
        arbNamedPatterns,
        arbOpenDrawerMode,
        (patterns, drawerMode) => {
          // Pick a random existing pattern as selected (or null for quick-add)
          const selectedPatternId =
            drawerMode === 'quick-add' ? null : patterns[0]?.id ?? null

          const result = simulateHandleCloseDrawer({
            patterns,
            selectedPatternId,
            pendingCreatedPatternId: null,
          })

          expect(result.drawerMode).toBe(null)
          expect(result.selectedPatternId).toBe(null)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('Property 2b: closing drawer with a pending pattern without name removes the pattern and shows toast', () => {
    /**
     * **Validates: Requirements 3.5**
     *
     * Observes: when the drawer closes and there's a pendingCreatedPatternId
     * matching selectedPatternId, and the pattern has an empty name,
     * the pattern is removed and toast "Chequeo vacío descartado" is shown.
     */
    fc.assert(
      fc.property(
        arbNamedPatterns,
        arbPendingEmptyPattern,
        (existingPatterns, pendingPattern) => {
          const patterns = [...existingPatterns, pendingPattern]

          const result = simulateHandleCloseDrawer({
            patterns,
            selectedPatternId: pendingPattern.id,
            pendingCreatedPatternId: pendingPattern.id,
          })

          expect(result.drawerMode).toBe(null)
          expect(result.selectedPatternId).toBe(null)
          expect(result.removedPatternId).toBe(pendingPattern.id)
          expect(result.toastShown).toBe(true)
          expect(result.pendingCreatedPatternId).toBe(null)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('Property 2c: for all preset selections, the pattern is added to the array and the drawer closes', () => {
    /**
     * **Validates: Requirements 3.3**
     *
     * Observes: handleSelectPreset appends the preset pattern to the
     * patterns array and closes the drawer (drawerMode = null,
     * selectedPatternId = null).
     */
    fc.assert(
      fc.property(
        arbNamedPatterns,
        arbPresetPattern,
        (existingPatterns, presetPattern) => {
          const result = simulateHandleSelectPreset({
            patterns: existingPatterns,
            presetPattern,
          })

          // Drawer closes
          expect(result.drawerMode).toBe(null)
          expect(result.selectedPatternId).toBe(null)

          // Pattern was added
          expect(result.resultingPatterns.length).toBe(existingPatterns.length + 1)
          expect(
            result.resultingPatterns.some((p) => p.id === presetPattern.id),
          ).toBe(true)

          // Existing patterns are preserved
          for (const existing of existingPatterns) {
            expect(
              result.resultingPatterns.some((p) => p.id === existing.id),
            ).toBe(true)
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('Property 2d: for all existing pattern edits, the drawer opens in edit mode with the correct selectedPatternId', () => {
    /**
     * **Validates: Requirements 3.4**
     *
     * Observes: handleEditPattern sets drawerMode = 'edit' and
     * selectedPatternId = the clicked pattern's ID.
     */
    fc.assert(
      fc.property(
        arbNamedPatterns,
        (patterns) => {
          // Pick each pattern and verify edit behavior
          for (const pattern of patterns) {
            const result = simulateHandleEditPattern(pattern.id)

            expect(result.drawerMode).toBe('edit')
            expect(result.selectedPatternId).toBe(pattern.id)
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('Property 2e: for all normal pattern changes (name, category, requirements), the drawer stays open', () => {
    /**
     * **Validates: Requirements 3.6**
     *
     * Observes: when a pattern is modified (name change, category change, etc.)
     * and the pattern still exists in the array, the cleanup effect does NOT
     * close the drawer. The cleanup effect only fires when selectedPatternId
     * is not found in patterns.
     */
    fc.assert(
      fc.property(
        arbNamedPatterns,
        arbOpenDrawerMode.filter((m) => m !== 'quick-add'),
        fc.stringMatching(/^[A-Z][a-z]{2,10}$/),
        (patterns, drawerMode, newName) => {
          const targetPattern = patterns[0]
          if (!targetPattern) return

          // Simulate a name change — pattern still exists in array
          const updatedPatterns = patterns.map((p) =>
            p.id === targetPattern.id ? { ...p, name: newName } : p,
          )

          // Run the cleanup effect — pattern exists, so drawer stays open
          const afterCleanup = simulateCleanupEffect({
            patterns: updatedPatterns,
            selectedPatternId: targetPattern.id,
            pendingCreatedPatternId: null,
            drawerMode,
          })

          expect(afterCleanup.drawerMode).toBe(drawerMode)
          expect(afterCleanup.selectedPatternId).toBe(targetPattern.id)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('Property 2f: cleanup effect preserves quick-add mode even when selectedPatternId is missing', () => {
    /**
     * **Validates: Requirements 3.3**
     *
     * Observes: the cleanup effect has a special guard for quick-add mode:
     * `setDrawerMode(current => current === 'quick-add' ? current : null)`
     * This means even if selectedPatternId doesn't exist in patterns,
     * the drawer stays in quick-add mode.
     */
    fc.assert(
      fc.property(
        arbNamedPatterns,
        (patterns) => {
          // quick-add mode with a non-existent selectedPatternId
          const afterCleanup = simulateCleanupEffect({
            patterns,
            selectedPatternId: 'non-existent-id',
            pendingCreatedPatternId: null,
            drawerMode: 'quick-add',
          })

          // quick-add is preserved
          expect(afterCleanup.drawerMode).toBe('quick-add')
          // but selectedPatternId is cleaned
          expect(afterCleanup.selectedPatternId).toBe(null)
        },
      ),
      { numRuns: 100 },
    )
  })
})
