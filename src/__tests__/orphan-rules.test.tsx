// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import { LabRuleList } from '../components/probability/LabRuleList'
import type { RuleEntry } from '../components/probability/probability-lab-helpers'

function entry(overrides: Partial<RuleEntry>): RuleEntry {
  return {
    patternId: 'p1',
    presetId: null,
    tier: 'custom',
    kind: 'opening',
    name: 'Regla',
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
const list = (custom: RuleEntry[], onEditRule = noop) => (
  <LabRuleList groups={{ universal: [], generic: [], custom }} onEditRule={onEditRule} onToggleGenericRule={noop} onEditGenericRule={noop} onRenameSystemRule={noop} onCreate={noop} onDuplicateRule={noop} onDeleteRule={noop} />
)

describe('las reglas con cartas que ya no están en el deck', () => {
  it('van aparte, plegadas, y no en su columna; tocarlas abre el editor', () => {
    const onEditRule = vi.fn()
    const live = entry({ patternId: 'viva', name: 'Abrir Ash' })
    const orphan = entry({ patternId: 'huerfana', name: 'Hornet + Engage', kind: 'problem', probability: null, missingCards: true })

    render(list([live, orphan], onEditRule))

    expect(within(screen.getByRole('region', { name: 'Salidas' })).getByRole('button', { name: /Editar regla Abrir Ash/ })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Problemas' })).queryByRole('button', { name: /Hornet/ })).not.toBeInTheDocument()

    const orphans = screen.getByRole('group', { name: 'Reglas sin carta' })
    expect(within(orphans).getByText('1')).toBeInTheDocument()
    expect(within(orphans).getByRole('button', { name: /Hornet \+ Engage: Falta carta/ })).toBeInTheDocument()
    fireEvent.click(within(orphans).getByRole('button', { name: /Hornet \+ Engage/ }))
    expect(onEditRule).toHaveBeenCalledWith('huerfana')
  })

  it('con sólo reglas huérfanas, cada columna sigue invitando a crear una', () => {
    render(list([entry({ missingCards: true, probability: null })]))

    expect(within(screen.getByRole('region', { name: 'Salidas' })).getByRole('button', { name: 'Crear una salida' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Reglas sin carta' })).toBeInTheDocument()
  })
})
