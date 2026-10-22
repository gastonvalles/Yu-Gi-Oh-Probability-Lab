// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createMatcherPattern } from '../app/pattern-factory'
import { LabDisclaimerDialog } from '../components/probability/LabDisclaimerDialog'
import { LabRuleList } from '../components/probability/LabRuleList'
import { QuickCalculator } from '../components/probability/QuickCalculator'
import { KPI_TONE_LABELS, formatOdds } from '../components/probability/lab-copy'
import { buildRuleEntryGroups, type RuleEntry } from '../components/probability/probability-lab-helpers'
import { buildReadiness } from '../components/probability/use-probability-lab'
import { applyLocale } from '../i18n'
import type { CardEntry } from '../types'

const card = (id: string, origin: CardEntry['origin'], roles: CardEntry['roles']): CardEntry => ({ id, name: `Card ${id}`, copies: 3, source: 'manual', apiCard: null, origin, roles, needsReview: false })

function entry(overrides: Partial<RuleEntry>): RuleEntry {
  return {
    patternId: 'p1',
    presetId: null,
    tier: 'custom',
    kind: 'opening',
    name: 'Rule',
    defaultName: null,
    summary: '1+ Starter',
    description: null,
    turnContext: 'either',
    enabled: true,
    appliesToView: true,
    isComplete: true,
    probability: 0.5,
    possible: true,
    turnLean: null,
    missingCards: false,
    ...overrides,
  }
}

const noop = () => {}
const mockMedia = (matches: boolean) => {
  window.matchMedia = vi.fn().mockReturnValue({ matches, addEventListener: noop, removeEventListener: noop }) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  applyLocale('en')
})

afterEach(() => {
  cleanup()
  applyLocale('es')
})

describe('el Lab en inglés', () => {
  it('las frases de probabilidad concuerdan con el sujeto (una regla o varias manos) y con la cantidad', () => {
    expect(formatOdds(0.0413)).toBe('It happens in 1 out of 24 hands (4.1%).')
    expect(formatOdds(0.62, false)).toBe('It happens in 6 out of 10 hands.')
    expect(formatOdds(0.999)).toBe('It happens in almost every hand (99.9%).')
    expect(formatOdds(0.5, true, true)).toBe('It happens in 1 out of 2 hands (50.0%).')
    // La tabla exportada se lee en el idioma de ese momento (getters), no en el de cuando se cargó el módulo.
    expect(Object.values(KPI_TONE_LABELS)).toEqual(['Excellent', 'Solid', 'Improvable', 'Critical'])
  })

  it('el motivo por el que el Lab no calcula sale en inglés', () => {
    expect(buildReadiness([card('a', null, ['starter'])])).toEqual({ status: 'needs-classification', message: 'Some cards have no origin.' })
    expect(buildReadiness([card('a', 'engine', [])])).toEqual({ status: 'needs-classification', message: 'Some cards have no roles.' })
  })

  it('los nombres y avisos de las reglas se arman en inglés', () => {
    const unnamed = createMatcherPattern('', 'problem', [{ matcher: { type: 'role', value: 'brick' }, quantity: 1, kind: 'include' }])
    const missing = createMatcherPattern('', 'opening', [{ matcher: { type: 'card', value: 'gone' }, quantity: 1, kind: 'include' }])
    const groups = buildRuleEntryGroups({
      presets: [],
      customPatterns: [unnamed],
      unavailablePatterns: [missing],
      disabledGenericRuleIds: [],
      derivedMainCards: [],
      patternResults: [],
      viewPatternResults: { first: [], second: [] },
      view: 'average',
    })

    expect(groups.custom.map((rule) => rule.name)).toEqual(['Unnamed problem', 'Unnamed opening'])
    expect(groups.custom[1]?.description).toBe("Uses a card that's no longer in the deck, so it isn't evaluated. Edit it or add the card back.")
  })

  it('el aviso resalta la parte en negrita y se puede reconocer', () => {
    render(<LabDisclaimerDialog isOpen onClose={noop} />)

    expect(screen.getByText('not an irrefutable source').tagName).toBe('STRONG')
    expect(screen.getByText('your').tagName).toBe('STRONG')
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument()
  })

  it('la calculadora rápida dice cuántas copias hacen falta, con su singular y su plural', () => {
    mockMedia(true)
    render(<QuickCalculator isOpen onClose={noop} deckSize={42} handSize={5} />)

    expect(screen.getByRole('spinbutton', { name: 'Cards in the deck' })).toHaveValue(42)
    expect(screen.getByRole('radio', { name: 'Going second' })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Cards in the deck' }), { target: { value: '40' } })
    expect(screen.getByRole('button', { name: 'Use my deck (42 cards)' })).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'At least 1: 33.8%' })).toBeInTheDocument()
    expect(screen.getByTestId('needed-copies')).toHaveTextContent('you need 7 copies (63.9%).')

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Target percentage' }), { target: { value: '1' } })
    expect(screen.getByTestId('needed-copies')).toHaveTextContent('you need 1 copy (12.5%).')
  })

  it('la lista de reglas habla en inglés: las dos columnas, avisos de turno, apagadas y reglas sin carta', () => {
    const groups = {
      universal: [entry({ patternId: 'u', tier: 'universal', presetId: 'starter_opening', name: 'Basic opening', turnLean: { favored: 'first', first: 0.7, second: 0.4 } })],
      generic: [entry({ patternId: 'g', tier: 'generic', presetId: 'no_answer', name: 'No answer', kind: 'problem', enabled: false, probability: null })],
      custom: [entry({ patternId: 'm', name: 'Missing card rule', kind: 'problem', missingCards: true, probability: null })],
    }

    mockMedia(false)
    render(<LabRuleList groups={groups} onEditRule={noop} onToggleGenericRule={noop} onEditGenericRule={noop} onRenameSystemRule={noop} onCreate={noop} onDuplicateRule={noop} onDeleteRule={noop} />)

    expect(screen.getByRole('region', { name: 'Openings' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Problems' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rename rule Basic opening: 50.0%, more often going first' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Enable No answer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit rule No answer: Off' })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Rules without a card' })).getByRole('button', { name: 'Edit rule Missing card rule: Card missing' })).toBeInTheDocument()
    expect(screen.getByText('Universal: always on')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create an opening' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create a problem' })).toBeInTheDocument()
  })
})
