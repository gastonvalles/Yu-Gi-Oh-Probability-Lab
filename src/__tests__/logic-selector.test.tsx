// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PatternEditorActions } from '../components/probability/pattern-editor-actions'
import { LogicSelector } from '../components/probability/rule-builder/LogicSelector'

afterEach(cleanup)

const actions = { setPatternMatchMode: vi.fn() } as unknown as PatternEditorActions

describe('LogicSelector', () => {
  it('con condiciones normales dice "todas" y "una alcanza"', () => {
    render(<LogicSelector patternId="p" currentMode="all" conditionCount={2} minimumConditionMatches={2} actions={actions} />)

    expect(screen.getByRole('radio', { name: 'Y · todas' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'O · una alcanza' })).toBeInTheDocument()
  })

  it('con condiciones "Sin …" dice "ninguna está" y "falta alguna" (Y/O se invierten al negar)', () => {
    render(<LogicSelector patternId="p" currentMode="all" conditionCount={2} minimumConditionMatches={2} negated actions={actions} />)

    expect(screen.getByRole('radio', { name: 'Y · ninguna está' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'O · falta alguna' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Faltan al menos 2' })).toBeInTheDocument()
  })
})
