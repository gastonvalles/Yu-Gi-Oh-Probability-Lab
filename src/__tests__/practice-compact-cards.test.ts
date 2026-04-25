import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Bug Condition Exploration Test — Property 1
 *
 * **Validates: Requirements 1.1, 1.2, 1.3**
 *
 * These tests encode the EXPECTED (correct) behavior for PracticeMatchCard
 * and PracticeMatchGroup. On unfixed code they FAIL, confirming the bug exists.
 * After the fix they PASS, confirming the bug is resolved.
 *
 * Bug: PracticeMatchCard renders excessive content (requirementLabel,
 * explanation text, assignment rows) when it should only show name + status badge.
 * PracticeMatchGroup uses a single-column grid instead of 2 columns.
 */

const PRACTICE_SECTION_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../components/probability/PracticeSection.tsx'),
  'utf-8',
)

/**
 * Extract the full body of a named function component from the source code.
 * Skips past the parameter list to find the actual function body braces.
 */
function extractFunctionBody(source: string, functionName: string): string {
  const startPattern = new RegExp(`function\\s+${functionName}\\s*\\(`)
  const match = startPattern.exec(source)
  if (!match) return ''

  // First, skip past the parameter list by matching parentheses
  let parenCount = 0
  let parenStarted = false
  let afterParams = match.index + match[0].length

  for (let i = match.index + match[0].length - 1; i < source.length; i++) {
    if (source[i] === '(') {
      parenStarted = true
      parenCount++
    } else if (source[i] === ')') {
      parenCount--
      if (parenStarted && parenCount === 0) {
        afterParams = i + 1
        break
      }
    }
  }

  // Now find the function body braces (the first { after the closing ) )
  let braceCount = 0
  let started = false
  let bodyStart = afterParams
  let bodyEnd = afterParams

  for (let i = afterParams; i < source.length; i++) {
    if (source[i] === '{') {
      if (!started) {
        started = true
        bodyStart = i
      }
      braceCount++
    } else if (source[i] === '}') {
      braceCount--
      if (started && braceCount === 0) {
        bodyEnd = i + 1
        break
      }
    }
  }

  return source.slice(bodyStart, bodyEnd)
}

const practiceMatchCardBody = extractFunctionBody(PRACTICE_SECTION_SOURCE, 'PracticeMatchCard')
const practiceMatchGroupBody = extractFunctionBody(PRACTICE_SECTION_SOURCE, 'PracticeMatchGroup')

// ---------------------------------------------------------------------------
// Arbitrary generators for property-based tests
// ---------------------------------------------------------------------------

const arbMatchKind = fc.constantFrom('opening' as const, 'problem' as const)

describe('Bug Condition Exploration — PracticeMatchCard compact format (Property 1)', () => {
  describe('PracticeMatchCard uses probability-check-card class', () => {
    it('should use probability-check-card class instead of surface-card-success/danger', () => {
      // Expected behavior: the card uses 'probability-check-card' class directly
      // Bug: it uses getPracticeMatchCardClass() which returns surface-card-success/danger
      expect(practiceMatchCardBody).toContain('probability-check-card')
      expect(practiceMatchCardBody).not.toContain('getPracticeMatchCardClass')
    })

    it('should have data-kind attribute on the article element', () => {
      // Expected behavior: article has data-kind={match.kind}
      expect(practiceMatchCardBody).toContain('data-kind')
    })

    it('should have data-active attribute on the article element', () => {
      // Expected behavior: article has data-active="true"
      expect(practiceMatchCardBody).toContain('data-active')
    })
  })

  describe('PracticeMatchCard renders only name + badge (no excessive content)', () => {
    it('should NOT render requirementLabel inside the card', () => {
      // Expected behavior: no requirementLabel in the compact card
      // Bug: the card renders <small> with match.requirementLabel
      expect(practiceMatchCardBody).not.toContain('requirementLabel')
    })

    it('should NOT render explanation text inside the card', () => {
      // Expected behavior: no explanation paragraph
      // Bug: the card renders getPracticeMatchExplanation(match)
      expect(practiceMatchCardBody).not.toContain('getPracticeMatchExplanation')
    })

    it('should NOT render assignment rows inside the card', () => {
      // Expected behavior: no assignment summary rows
      // Bug: the card renders PracticeAssignmentSummaryRow for each assignment
      expect(practiceMatchCardBody).not.toContain('PracticeAssignmentSummaryRow')
      expect(practiceMatchCardBody).not.toContain('assignments')
    })
  })

  describe('PracticeMatchGroup uses 2-column grid', () => {
    it('should use grid-cols-2 for the match cards container', () => {
      // Expected behavior: 2-column grid like CardSection in DeckQualityHero
      // Bug: uses single-column grid (grid min-w-0 gap-2)
      expect(practiceMatchGroupBody).toContain('grid-cols-2')
    })
  })

  describe('Property: for any match kind, PracticeMatchCard should be compact', () => {
    it('for all match kinds, the card body should not contain excessive content markers', () => {
      /**
       * **Validates: Requirements 1.1, 1.2, 1.3**
       *
       * For any generated match kind (opening or problem), the PracticeMatchCard
       * component source should not contain markers of excessive content.
       */
      fc.assert(
        fc.property(arbMatchKind, (_kind) => {
          // The card body is the same regardless of kind — it's a static component.
          // For ANY kind, the card should be compact:
          // 1. No requirementLabel rendering
          expect(practiceMatchCardBody).not.toContain('requirementLabel')
          // 2. No explanation text
          expect(practiceMatchCardBody).not.toContain('getPracticeMatchExplanation')
          // 3. No assignment rows
          expect(practiceMatchCardBody).not.toContain('PracticeAssignmentSummaryRow')
          // 4. Uses probability-check-card class
          expect(practiceMatchCardBody).toContain('probability-check-card')
        }),
      )
    })
  })
})


// ---------------------------------------------------------------------------
// Preservation Tests — Property 2
// ---------------------------------------------------------------------------

/**
 * Preservation Property-Based Tests
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 *
 * These tests verify that components and functions that should NOT change
 * after the fix still work correctly. They establish a baseline on unfixed
 * code and MUST PASS both before and after the fix.
 */

// Extract bodies for preservation targets
const practiceTechnicalDetailsBody = extractFunctionBody(PRACTICE_SECTION_SOURCE, 'PracticeTechnicalDetails')
const practiceNearMissCardBody = extractFunctionBody(PRACTICE_SECTION_SOURCE, 'PracticeNearMissCard')
const practiceCardBadgeBody = extractFunctionBody(PRACTICE_SECTION_SOURCE, 'PracticeCardBadge')
const getPracticeMatchStateLabelBody = extractFunctionBody(PRACTICE_SECTION_SOURCE, 'getPracticeMatchStateLabel')
const getPracticeMatchStateBadgeClassBody = extractFunctionBody(PRACTICE_SECTION_SOURCE, 'getPracticeMatchStateBadgeClass')
const getAssignmentStateLabelBody = extractFunctionBody(PRACTICE_SECTION_SOURCE, 'getAssignmentStateLabel')

// ---------------------------------------------------------------------------
// Arbitrary generators for preservation property-based tests
// ---------------------------------------------------------------------------

const arbPreservationMatchKind = fc.constantFrom('opening' as const, 'problem' as const)
const arbAssignmentKind = fc.constantFrom('include' as const, 'exclude' as const)

describe('Preservation — Lógica de evaluación y componentes no modificados (Property 2)', () => {
  describe('getPracticeMatchStateLabel returns correct values', () => {
    /**
     * **Validates: Requirements 3.2**
     */
    it('should return "Cumplida" for opening', () => {
      // Verify the function body contains the mapping: opening → 'Cumplida'
      expect(getPracticeMatchStateLabelBody).toContain('Cumplida')
      expect(getPracticeMatchStateLabelBody).toContain('opening')
    })

    it('should return "Detectado" for problem', () => {
      // Verify the function body contains the mapping: problem → 'Detectado'
      expect(getPracticeMatchStateLabelBody).toContain('Detectado')
    })

    it('property: for any match kind, getPracticeMatchStateLabel maps to the correct label', () => {
      /**
       * **Validates: Requirements 3.2**
       */
      fc.assert(
        fc.property(arbPreservationMatchKind, (kind) => {
          // The function source must contain both labels regardless of kind
          expect(getPracticeMatchStateLabelBody).toContain('Cumplida')
          expect(getPracticeMatchStateLabelBody).toContain('Detectado')
          // The function must check for 'opening' to branch
          expect(getPracticeMatchStateLabelBody).toContain('opening')

          // Verify the correct mapping by checking the function structure:
          // It should return 'Cumplida' when kind === 'opening', 'Detectado' otherwise
          if (kind === 'opening') {
            // The function must have a branch that returns 'Cumplida' for 'opening'
            expect(getPracticeMatchStateLabelBody).toMatch(/opening.*Cumplida|Cumplida.*opening/)
          }
        }),
      )
    })
  })

  describe('getPracticeMatchStateBadgeClass returns correct values', () => {
    /**
     * **Validates: Requirements 3.2**
     */
    it('should return success class for opening', () => {
      expect(getPracticeMatchStateBadgeClassBody).toContain('surface-card-success')
      expect(getPracticeMatchStateBadgeClassBody).toContain('text-accent')
    })

    it('should return danger class for problem', () => {
      expect(getPracticeMatchStateBadgeClassBody).toContain('surface-card-danger')
      expect(getPracticeMatchStateBadgeClassBody).toContain('text-destructive')
    })

    it('property: for any match kind, badge class function contains both tone classes', () => {
      /**
       * **Validates: Requirements 3.2**
       */
      fc.assert(
        fc.property(arbPreservationMatchKind, (kind) => {
          // The function must always contain both class sets
          expect(getPracticeMatchStateBadgeClassBody).toContain('surface-card-success')
          expect(getPracticeMatchStateBadgeClassBody).toContain('surface-card-danger')
          // It branches on 'opening'
          expect(getPracticeMatchStateBadgeClassBody).toContain('opening')

          if (kind === 'opening') {
            // The function checks kind === 'opening' and returns 'surface-card-success text-accent'
            expect(getPracticeMatchStateBadgeClassBody).toContain("'opening'")
            expect(getPracticeMatchStateBadgeClassBody).toContain('surface-card-success text-accent')
          } else {
            // For non-opening (problem), it returns 'surface-card-danger text-destructive'
            expect(getPracticeMatchStateBadgeClassBody).toContain('surface-card-danger text-destructive')
          }
        }),
      )
    })
  })

  describe('PracticeTechnicalDetails preserves full detail content', () => {
    /**
     * **Validates: Requirements 3.2**
     */
    it('should contain requirementLabel in the technical details', () => {
      expect(practiceTechnicalDetailsBody).toContain('requirementLabel')
    })

    it('should contain PracticeAssignmentDetailRow for card-by-card detail', () => {
      expect(practiceTechnicalDetailsBody).toContain('PracticeAssignmentDetailRow')
    })

    it('should contain getPracticeMatchStateBadgeClass for badge rendering', () => {
      expect(practiceTechnicalDetailsBody).toContain('getPracticeMatchStateBadgeClass')
    })

    it('should contain getPracticeMatchStateLabel for state label rendering', () => {
      expect(practiceTechnicalDetailsBody).toContain('getPracticeMatchStateLabel')
    })

    it('should contain the "Ver asignación completa" disclosure summary', () => {
      expect(practiceTechnicalDetailsBody).toContain('Ver asignación completa')
    })
  })

  describe('PracticeNearMissCard preserves its format', () => {
    /**
     * **Validates: Requirements 3.4**
     */
    it('should contain nearMiss.name', () => {
      expect(practiceNearMissCardBody).toContain('nearMiss.name')
    })

    it('should contain nearMiss.requirementLabel', () => {
      expect(practiceNearMissCardBody).toContain('nearMiss.requirementLabel')
    })

    it('should contain nearMiss.missingConditions', () => {
      expect(practiceNearMissCardBody).toContain('nearMiss.missingConditions')
    })

    it('should contain nearMiss.notes', () => {
      expect(practiceNearMissCardBody).toContain('nearMiss.notes')
    })
  })

  describe('getAssignmentStateLabel returns correct values', () => {
    /**
     * **Validates: Requirements 3.2**
     */
    it('should return "Libre" for exclude', () => {
      expect(getAssignmentStateLabelBody).toContain('Libre')
      expect(getAssignmentStateLabelBody).toContain('exclude')
    })

    it('should return "Usado" for include (default)', () => {
      expect(getAssignmentStateLabelBody).toContain('Usado')
    })

    it('property: for any assignment kind, getAssignmentStateLabel maps correctly', () => {
      /**
       * **Validates: Requirements 3.2**
       */
      fc.assert(
        fc.property(arbAssignmentKind, (kind) => {
          // The function must contain both labels
          expect(getAssignmentStateLabelBody).toContain('Libre')
          expect(getAssignmentStateLabelBody).toContain('Usado')
          // It branches on 'exclude'
          expect(getAssignmentStateLabelBody).toContain('exclude')

          if (kind === 'exclude') {
            expect(getAssignmentStateLabelBody).toMatch(/exclude.*Libre|Libre.*exclude/)
          }
        }),
      )
    })
  })

  describe('PracticeCardBadge component exists and renders card name', () => {
    /**
     * **Validates: Requirements 3.2, 3.5**
     */
    it('should exist as a function component', () => {
      expect(practiceCardBadgeBody.length).toBeGreaterThan(0)
    })

    it('should render card.name', () => {
      expect(practiceCardBadgeBody).toContain('card.name')
    })

    it('should render card.copies for multi-copy cards', () => {
      expect(practiceCardBadgeBody).toContain('card.copies')
    })
  })
})
