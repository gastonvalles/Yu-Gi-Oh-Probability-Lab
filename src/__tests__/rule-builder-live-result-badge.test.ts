import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { getSemanticLabel } from '../components/probability/rule-builder/LiveResultBadge'
import { formatPercent } from '../app/utils'
import type { PatternKind } from '../types'

const arbPatternKind: fc.Arbitrary<PatternKind> = fc.constantFrom('opening', 'problem')

describe('LiveResultBadge utilities', () => {
  it('Property 9: probability formatting — formatPercent produces valid percentage string for any value in [0, 1]', () => {
    /** Feature: visual-rule-builder, Property 9: LiveResultBadge probability formatting */
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (probability) => {
        const result = formatPercent(probability)
        expect(result).toMatch(/^\d+\.\d{3}%$/)
      }),
      { numRuns: 200 },
    )
  })

  it('Property 11: semantic label matches probability thresholds for opening patterns', () => {
    /** Feature: visual-rule-builder, Property 11: Semantic label matches probability thresholds */
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (probability) => {
        const label = getSemanticLabel(probability, 'opening')

        if (probability >= 0.85) {
          expect(label.text).toBe('Alta consistencia')
          expect(label.tone).toBe('positive')
        } else if (probability >= 0.60) {
          expect(label.text).toBe('Consistencia media')
          expect(label.tone).toBe('neutral')
        } else if (probability >= 0.40) {
          expect(label.text).toBe('Consistencia baja')
          expect(label.tone).toBe('warning')
        } else {
          expect(label.text).toBe('Muy baja — revisá el deck')
          expect(label.tone).toBe('critical')
        }
      }),
      { numRuns: 200 },
    )
  })

  it('Property 11: semantic label matches probability thresholds for problem patterns', () => {
    /** Feature: visual-rule-builder, Property 11: Semantic label matches probability thresholds */
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (probability) => {
        const label = getSemanticLabel(probability, 'problem')

        if (probability < 0.05) {
          expect(label.text).toBe('Problema mínimo')
          expect(label.tone).toBe('positive')
        } else if (probability < 0.15) {
          expect(label.text).toBe('Problema moderado')
          expect(label.tone).toBe('neutral')
        } else if (probability < 0.30) {
          expect(label.text).toBe('Problema alto')
          expect(label.tone).toBe('warning')
        } else {
          expect(label.text).toBe('Problema crítico — revisá el deck')
          expect(label.tone).toBe('critical')
        }
      }),
      { numRuns: 200 },
    )
  })

  it('Property 11: semantic label covers all PatternKind values', () => {
    /** Feature: visual-rule-builder, Property 11: Semantic label matches probability thresholds */
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        arbPatternKind,
        (probability, kind) => {
          const label = getSemanticLabel(probability, kind)
          expect(label.text.length).toBeGreaterThan(0)
          expect(['positive', 'neutral', 'warning', 'critical']).toContain(label.tone)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('boundary: exact threshold values for opening', () => {
    expect(getSemanticLabel(0.85, 'opening').text).toBe('Alta consistencia')
    expect(getSemanticLabel(0.60, 'opening').text).toBe('Consistencia media')
    expect(getSemanticLabel(0.40, 'opening').text).toBe('Consistencia baja')
    expect(getSemanticLabel(0.39, 'opening').text).toBe('Muy baja — revisá el deck')
    expect(getSemanticLabel(0, 'opening').text).toBe('Muy baja — revisá el deck')
    expect(getSemanticLabel(1, 'opening').text).toBe('Alta consistencia')
  })

  it('boundary: exact threshold values for problem', () => {
    expect(getSemanticLabel(0.04, 'problem').text).toBe('Problema mínimo')
    expect(getSemanticLabel(0.05, 'problem').text).toBe('Problema moderado')
    expect(getSemanticLabel(0.14, 'problem').text).toBe('Problema moderado')
    expect(getSemanticLabel(0.15, 'problem').text).toBe('Problema alto')
    expect(getSemanticLabel(0.29, 'problem').text).toBe('Problema alto')
    expect(getSemanticLabel(0.30, 'problem').text).toBe('Problema crítico — revisá el deck')
    expect(getSemanticLabel(0, 'problem').text).toBe('Problema mínimo')
    expect(getSemanticLabel(1, 'problem').text).toBe('Problema crítico — revisá el deck')
  })
})
