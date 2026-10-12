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

describe('las reglas con cartas que ya no están en el deck', () => {
  it('van aparte, plegadas, y no en "Tus reglas"; tocarlas abre el editor', () => {
    const onEditRule = vi.fn()
    const live = entry({ patternId: 'viva', name: 'Abrir Ash' })
    const orphan = entry({ patternId: 'huerfana', name: 'Hornet + Engage', kind: 'problem', probability: null, missingCards: true })

    render(<LabRuleList groups={{ universal: [], generic: [], custom: [live, orphan] }} onEditRule={onEditRule} onToggleGenericRule={noop} onEditGenericRule={noop} onRenameSystemRule={noop} onCreateCustom={noop} />)

    const custom = screen.getByRole('region', { name: 'Tus reglas' })
    expect(within(custom).getByRole('button', { name: /Abrir Ash/ })).toBeInTheDocument()
    expect(within(custom).queryByRole('button', { name: /Hornet/ })).not.toBeInTheDocument()

    const orphans = screen.getByRole('group', { name: 'Reglas sin carta' })
    expect(within(orphans).getByText('1')).toBeInTheDocument()
    expect(within(orphans).getByRole('button', { name: /Hornet \+ Engage: Falta carta/ })).toBeInTheDocument()
    fireEvent.click(within(orphans).getByRole('button', { name: /Hornet \+ Engage/ }))
    expect(onEditRule).toHaveBeenCalledWith('huerfana')

    // El filtro por tipo también las filtra.
    fireEvent.click(screen.getByRole('radio', { name: 'Salidas' }))
    expect(screen.queryByRole('group', { name: 'Reglas sin carta' })).not.toBeInTheDocument()
  })

  it('con sólo reglas huérfanas, "Tus reglas" invita a crear una', () => {
    render(<LabRuleList groups={{ universal: [], generic: [], custom: [entry({ missingCards: true, probability: null })] }} onEditRule={noop} onToggleGenericRule={noop} onEditGenericRule={noop} onRenameSystemRule={noop} onCreateCustom={noop} />)

    expect(within(screen.getByRole('region', { name: 'Tus reglas' })).getByText('Todavía no creaste reglas')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Reglas sin carta' })).toBeInTheDocument()
  })
})
