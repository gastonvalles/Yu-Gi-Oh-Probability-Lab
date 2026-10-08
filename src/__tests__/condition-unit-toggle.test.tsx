// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPattern } from '../app/pattern-factory'
import { ConditionBlock } from '../components/probability/rule-builder/ConditionBlock'
import type { PatternEditorActions } from '../components/probability/pattern-editor-actions'
import type { CardEntry } from '../types'

afterEach(cleanup)

const cards: CardEntry[] = [
  { id: 'card-1', name: 'Ash', copies: 3, source: 'manual', apiCard: null, origin: 'non_engine', roles: ['handtrap'], needsReview: false },
]

function renderCondition(quantity: number, distinct: boolean) {
  const pattern = createPattern('Regla', 'card-1')
  const condition = { ...pattern.conditions[0]!, quantity, distinct }
  const actions = { setRequirementDistinct: vi.fn(), setRequirementCount: vi.fn(), setRequirementKind: vi.fn() } as unknown as PatternEditorActions

  render(
    <ConditionBlock index={0} patternId={pattern.id} pattern={{ ...pattern, conditions: [condition] }} condition={condition} derivedMainCards={cards} actions={actions} onRemove={vi.fn()} />,
  )

  return actions
}

describe('condición: copias o nombres distintos', () => {
  it('se ofrece cuando se piden varias copias y al tocarlo pasa a nombres', () => {
    const actions = renderCondition(2, false)
    const toggle = screen.getByRole('button', { name: /copias\. Cambiar a nombres/ })

    fireEvent.click(toggle)
    expect(actions.setRequirementDistinct).toHaveBeenCalledWith(expect.any(String), expect.any(String), true)
  })

  it('sigue visible en "nombres" aunque la cantidad haya bajado a 1, para poder volver', () => {
    renderCondition(1, true)
    expect(screen.getByRole('button', { name: /nombres distintos\. Cambiar a copias/ })).toBeInTheDocument()
  })

  it('no aparece si no cambia nada (una copia, contando copias)', () => {
    renderCondition(1, false)
    expect(screen.queryByRole('button', { name: /Cambiar a nombres/ })).not.toBeInTheDocument()
  })

  it('"Al menos" alterna a "Sin" y la cantidad tiene − y +', () => {
    const actions = renderCondition(2, false)

    fireEvent.click(screen.getByRole('button', { name: /Al menos\. Cambiar a Sin/ }))
    expect(actions.setRequirementKind).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'exclude')

    fireEvent.click(screen.getByRole('button', { name: 'Uno más' }))
    expect(actions.setRequirementCount).toHaveBeenCalledWith(expect.any(String), expect.any(String), '3')
  })
})
