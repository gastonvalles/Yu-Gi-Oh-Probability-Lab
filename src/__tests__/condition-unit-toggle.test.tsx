// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildDerivedDeckGroupMap } from '../app/deck-groups'
import { createPattern } from '../app/pattern-factory'
import { ConditionBlock } from '../components/probability/rule-builder/ConditionBlock'
import type { PatternEditorActions } from '../components/probability/pattern-editor-actions'
import type { CardEntry, PatternCondition } from '../types'

afterEach(cleanup)

const cards: CardEntry[] = [
  { id: 'card-1', name: 'Ash', copies: 3, source: 'manual', apiCard: null, origin: 'non_engine', roles: ['handtrap'], needsReview: false },
]

function renderCondition(overrides: Partial<PatternCondition>, count = 1, showError = false) {
  const pattern = createPattern('Regla', 'card-1')
  const condition = { ...pattern.conditions[0]!, ...overrides }
  const actions = { setRequirementDistinct: vi.fn(), setRequirementCount: vi.fn(), setRequirementKind: vi.fn() } as unknown as PatternEditorActions
  const handlers = { onPick: vi.fn(), onMoveBy: vi.fn(), onDragStart: vi.fn(), onRemove: vi.fn() }

  render(
    <ConditionBlock
      index={0}
      count={count}
      patternId={pattern.id}
      pattern={{ ...pattern, conditions: [condition] }}
      condition={condition}
      derivedMainCards={cards}
      groupsByKey={buildDerivedDeckGroupMap(cards)}
      actions={actions}
      showError={showError}
      {...handlers}
    />,
  )

  return { actions, handlers }
}

describe('condición: copias o nombres distintos', () => {
  it('se ofrece cuando se piden varias copias y al elegir «Nombres distintos» pasa a nombres', () => {
    const { actions } = renderCondition({ quantity: 2, distinct: false })

    fireEvent.click(screen.getByRole('radio', { name: 'Nombres distintos' }))
    expect(actions.setRequirementDistinct).toHaveBeenCalledWith(expect.any(String), expect.any(String), true)
  })

  it('sigue visible en "nombres" aunque la cantidad haya bajado a 1, para poder volver', () => {
    renderCondition({ quantity: 1, distinct: true })
    expect(screen.getByRole('radio', { name: 'Copias' })).toBeInTheDocument()
  })

  it('no aparece si no cambia nada (una copia, contando copias)', () => {
    renderCondition({ quantity: 1, distinct: false })
    expect(screen.queryByRole('radio', { name: 'Nombres distintos' })).not.toBeInTheDocument()
  })
})

describe('condición: se lee como una frase', () => {
  it('«Tiene» pasa a «No tiene» (ninguna: la cantidad vuelve a 1) y la cantidad tiene − y +', () => {
    const { actions } = renderCondition({ quantity: 2 })

    fireEvent.click(screen.getByRole('button', { name: 'Uno más' }))
    expect(actions.setRequirementCount).toHaveBeenCalledWith(expect.any(String), expect.any(String), '3')

    fireEvent.click(screen.getByRole('radio', { name: 'No tiene' }))
    expect(actions.setRequirementKind).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'exclude')
    expect(actions.setRequirementCount).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), '1')
  })

  it('«No tiene» con una sola no muestra la cantidad (se lee «ninguna»)', () => {
    renderCondition({ kind: 'exclude', quantity: 1 })

    expect(screen.queryByRole('group', { name: 'Cantidad' })).not.toBeInTheDocument()
  })

  // Antes iba en rojo apenas se creaba; ahora faltar qué cuenta es el paso que sigue y el rojo llega sólo con `showError` (se intentó guardar así).
  it('qué cuenta es un botón con su nombre y sus copias; sin elegir es el paso que sigue, y en rojo con qué falta sólo con showError', () => {
    const { handlers } = renderCondition({})

    fireEvent.click(screen.getByRole('button', { name: 'Qué cuenta: Ash. Cambiar' }))
    expect(handlers.onPick).toHaveBeenCalled()
    expect(screen.getByText('×3')).toBeInTheDocument()

    cleanup()
    renderCondition({ matcher: null })
    const fresh = screen.getByRole('button', { name: 'Elegí qué cuenta' })
    expect(fresh).not.toHaveAttribute('aria-invalid')
    expect(fresh).not.toHaveAccessibleDescription()
    expect(fresh).not.toHaveClass('text-danger-soft')
    expect(screen.queryByText('Falta elegir qué cuenta esta condición')).not.toBeInTheDocument()

    cleanup()
    renderCondition({ matcher: null }, 1, true)
    const pick = screen.getByRole('button', { name: 'Elegí qué cuenta' })
    expect(pick).toHaveAttribute('aria-invalid', 'true')
    expect(pick).toHaveAccessibleDescription('Falta elegir qué cuenta esta condición')
    expect(pick).toHaveClass('text-danger-soft')
  })

  it('con dos o más condiciones lleva el agarre: ↑ ↓ la mueven y el puntero la arrastra', () => {
    const { handlers } = renderCondition({}, 2)
    const handle = screen.getByRole('button', { name: /Mover la condición 1/ })

    fireEvent.keyDown(handle, { key: 'ArrowDown' })
    expect(handlers.onMoveBy).toHaveBeenCalledWith(0, 1)
    fireEvent.pointerDown(handle, { button: 0 })
    expect(handlers.onDragStart).toHaveBeenCalled()

    cleanup()
    renderCondition({}, 1)
    expect(screen.queryByRole('button', { name: /Mover la condición/ })).not.toBeInTheDocument()
  })
})
