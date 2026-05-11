// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { TurnContextToggle } from '../components/probability/rule-builder/TurnContextToggle'
import type { PatternEditorActions } from '../components/probability/pattern-editor-actions'

// ── Helpers ──

function makeActions(): PatternEditorActions {
  // Only setPatternTurnContext is exercised by these tests. The rest of the
  // bag is stubbed to satisfy the PatternEditorActions contract.
  return {
    addPattern: vi.fn(),
    appendPattern: vi.fn(),
    removePattern: vi.fn(),
    replacePatterns: vi.fn(),
    setPatternCategory: vi.fn(),
    setPatternName: vi.fn(),
    setPatternTurnContext: vi.fn(),
    setPatternMatchMode: vi.fn(),
    setPatternMinimumMatches: vi.fn(),
    setPatternAllowSharedCards: vi.fn(),
    addRequirement: vi.fn(),
    removeRequirement: vi.fn(),
    addRequirementCard: vi.fn(),
    removeRequirementCard: vi.fn(),
    setRequirementKind: vi.fn(),
    setRequirementDistinct: vi.fn(),
    setRequirementCount: vi.fn(),
    setRequirementMatcher: vi.fn(),
    setRequirementSource: vi.fn(),
    setRequirementGroup: vi.fn(),
    setRequirementAttribute: vi.fn(),
    setRequirementLevel: vi.fn(),
    setRequirementMonsterType: vi.fn(),
    setRequirementAtk: vi.fn(),
    setRequirementDef: vi.fn(),
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TurnContextToggle Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('TurnContextToggle', () => {
  it('renders three buttons with labels "Going First", "Going Second", and "Ambos"', () => {
    /** **Validates: Requirement 2.1** */
    const actions = makeActions()

    render(
      <TurnContextToggle patternId="p1" currentTurnContext="either" actions={actions} />,
    )

    expect(screen.getByRole('radio', { name: 'Going First' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Going Second' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Ambos' })).toBeInTheDocument()
  })

  it('clicking a button invokes setPatternTurnContext with the correct value', () => {
    /** **Validates: Requirement 2.2** */
    const actions = makeActions()

    render(
      <TurnContextToggle patternId="p1" currentTurnContext="either" actions={actions} />,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'Going First' }))
    expect(actions.setPatternTurnContext).toHaveBeenCalledWith('p1', 'first')

    fireEvent.click(screen.getByRole('radio', { name: 'Going Second' }))
    expect(actions.setPatternTurnContext).toHaveBeenCalledWith('p1', 'second')

    fireEvent.click(screen.getByRole('radio', { name: 'Ambos' }))
    expect(actions.setPatternTurnContext).toHaveBeenCalledWith('p1', 'either')
  })

  it('marks the button matching currentTurnContext as aria-checked and others as unchecked', () => {
    /** **Validates: Requirement 2.4** */
    const actions = makeActions()

    render(
      <TurnContextToggle patternId="p1" currentTurnContext="first" actions={actions} />,
    )

    expect(screen.getByRole('radio', { name: 'Going First' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Going Second' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'Ambos' })).toHaveAttribute('aria-checked', 'false')
  })

  it('default "either" marks "Ambos" as the active option', () => {
    /** **Validates: Requirement 2.5** */
    const actions = makeActions()

    render(
      <TurnContextToggle patternId="p1" currentTurnContext="either" actions={actions} />,
    )

    expect(screen.getByRole('radio', { name: 'Ambos' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Going First' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'Going Second' })).toHaveAttribute('aria-checked', 'false')
  })
})
