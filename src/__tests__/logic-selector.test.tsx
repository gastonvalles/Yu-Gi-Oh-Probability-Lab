// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PatternEditorActions } from '../components/probability/pattern-editor-actions'
import { LogicSelector } from '../components/probability/rule-builder/LogicSelector'

afterEach(cleanup)

const actions = { setPatternMatchMode: vi.fn(), setPatternMinimumMatches: vi.fn() } as unknown as PatternEditorActions

describe('LogicSelector', () => {
  it('dice con palabras cómo se combinan: «Con 3 condiciones, la mano cumple: Todas · Alguna · Un mínimo»', () => {
    render(<LogicSelector patternId="p" currentMode="all" conditionCount={3} minimumConditionMatches={3} actions={actions} />)

    expect(screen.getByText('Con 3 condiciones, la mano cumple:')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Todas' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: 'Alguna' }))
    expect(actions.setPatternMatchMode).toHaveBeenCalledWith('p', 'any')
    expect(screen.queryByRole('group', { name: 'Mínimo de condiciones a cumplir' })).not.toBeInTheDocument()

    // Pasar a «Un mínimo» arranca en una menos que todas (si no, sería lo mismo que «Todas»).
    fireEvent.click(screen.getByRole('radio', { name: 'Un mínimo' }))
    expect(actions.setPatternMatchMode).toHaveBeenLastCalledWith('p', 'at-least')
    expect(actions.setPatternMinimumMatches).toHaveBeenLastCalledWith('p', '2')
  })

  it('con «Un mínimo» pide «al menos [N] de las M» (de 2 a M)', () => {
    render(<LogicSelector patternId="p" currentMode="at-least" conditionCount={3} minimumConditionMatches={2} actions={actions} />)

    expect(screen.getByRole('radio', { name: 'Un mínimo' })).toBeChecked()
    expect(screen.getByText(/de las 3/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Uno más' }))
    expect(actions.setPatternMinimumMatches).toHaveBeenCalledWith('p', '3')
    expect(screen.getByRole('button', { name: 'Uno menos' })).toBeDisabled()
  })
})
