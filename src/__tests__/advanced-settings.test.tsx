// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPattern } from '../app/pattern-factory'
import { AdvancedSettings } from '../components/probability/rule-builder/AdvancedSettings'
import type { PatternEditorActions } from '../components/probability/pattern-editor-actions'

afterEach(cleanup)

function renderSettings(quantity: number, distinct: boolean) {
  const pattern = createPattern('Regla', 'card-1')
  pattern.conditions[0] = { ...pattern.conditions[0]!, quantity, distinct }
  render(<AdvancedSettings pattern={pattern} actions={{ setRequirementDistinct: vi.fn() } as unknown as PatternEditorActions} derivedMainCards={[]} />)
}

describe('AdvancedSettings: copias o nombres', () => {
  it('se ofrece cuando se piden varias copias', () => {
    renderSettings(2, false)
    expect(screen.getByRole('radio', { name: 'Nombres' })).toBeInTheDocument()
  })

  it('sigue visible en "Nombres" aunque la cantidad haya bajado a 1, para poder volver', () => {
    renderSettings(1, true)
    expect(screen.getByRole('radio', { name: 'Copias' })).toBeInTheDocument()
  })

  it('no aparece si no cambia nada (una copia, contando copias)', () => {
    renderSettings(1, false)
    expect(screen.queryByRole('radio', { name: 'Nombres' })).not.toBeInTheDocument()
  })
})
