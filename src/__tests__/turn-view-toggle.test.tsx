// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

import type { LabResults, LabViewResult } from '../app/probability-lab'
import { LabRuleList } from '../components/probability/LabRuleList'
import { LabScoreCard } from '../components/probability/LabScoreCard'
import { TurnViewToggle } from '../components/probability/TurnViewToggle'
import type { RuleEntry } from '../components/probability/probability-lab-helpers'

function view(cleanProbability: number, handSize: number | null): LabViewResult {
  return {
    handSize,
    cleanProbability,
    noOpeningProbability: 1 - cleanProbability,
    withProblemProbability: 0,
    cleanHands: handSize ? 100 : null,
    totalHands: handSize ? 1000 : null,
    patternResults: [],
    segmentRules: { clean: [], withProblem: [], noOpening: [] },
  }
}

const RESULTS: LabResults = { first: view(0.41, 5), second: view(0.73, 6), average: view(0.57, null) }

function entry(overrides: Partial<RuleEntry>): RuleEntry {
  return {
    patternId: 'p1',
    presetId: null,
    tier: 'custom',
    kind: 'opening',
    name: 'Regla',
    summary: '1+ Starter',
    description: null,
    turnContext: 'either',
    enabled: true,
    appliesToView: true,
    isComplete: true,
    probability: 0.5,
    possible: true,
    turnLean: null,
    ...overrides,
  }
}

describe('TurnViewToggle (isolation)', () => {
  it('renders three radios with labels "Primero", "Segundo", "Promedio"', () => {
    /** **Validates: Requirements 3.2, 3.4** */
    render(<TurnViewToggle activeView="average" onChange={() => {}} />)

    expect(screen.getByRole('radio', { name: 'Primero' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Segundo' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Promedio' })).toBeInTheDocument()
  })

  it('emits onChange with the clicked view value', () => {
    const onChange = vi.fn()
    render(<TurnViewToggle activeView="average" onChange={onChange} />)

    fireEvent.click(screen.getByRole('radio', { name: 'Primero' }))
    expect(onChange).toHaveBeenLastCalledWith('first')

    fireEvent.click(screen.getByRole('radio', { name: 'Segundo' }))
    expect(onChange).toHaveBeenLastCalledWith('second')

    fireEvent.click(screen.getByRole('radio', { name: 'Promedio' }))
    expect(onChange).toHaveBeenLastCalledWith('average')
  })

  it('marks the active view as aria-checked="true" and others as "false"', () => {
    const { rerender } = render(<TurnViewToggle activeView="first" onChange={() => {}} />)

    expect(screen.getByRole('radio', { name: 'Primero' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('radio', { name: 'Segundo' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(screen.getByRole('radio', { name: 'Promedio' })).toHaveAttribute(
      'aria-checked',
      'false',
    )

    rerender(<TurnViewToggle activeView="average" onChange={() => {}} />)

    expect(screen.getByRole('radio', { name: 'Promedio' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })
})

describe('LabScoreCard', () => {
  it('muestra el KPI de la vista activa y, en promedio, el detalle por turno', () => {
    const { rerender } = render(<LabScoreCard results={RESULTS} view="average" isRecalculating={false} />)

    expect(screen.getByText('57.00%')).toBeInTheDocument()
    expect(screen.getByText('41.0%')).toBeInTheDocument()
    expect(screen.getByText('73.0%')).toBeInTheDocument()

    rerender(<LabScoreCard results={RESULTS} view="second" isRecalculating={false} />)
    expect(screen.getByText('73.00%')).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'Manos limpias' })).toHaveAttribute('aria-valuenow', '73')
  })
})

describe('LabRuleList', () => {
  const groups = {
    universal: [entry({ patternId: 'u', tier: 'universal', presetId: 'starter_opening', name: 'Salida básica' })],
    generic: [entry({ patternId: 'g', tier: 'generic', presetId: 'no_answer_second_problem', name: 'Sin respuesta', kind: 'problem' })],
    custom: [entry({ patternId: 'c', name: 'Mi combo' })],
  }

  it('edita reglas propias con un toque y prende o apaga las genéricas', () => {
    const onEditRule = vi.fn()
    const onToggleGenericRule = vi.fn()
    render(
      <LabRuleList
        groups={groups}
        onEditRule={onEditRule}
        onToggleGenericRule={onToggleGenericRule}
        onCreateCustom={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Editar regla Mi combo/ }))
    expect(onEditRule).toHaveBeenCalledWith('c')

    fireEvent.click(screen.getByRole('switch', { name: 'Desactivar Sin respuesta' }))
    expect(onToggleGenericRule).toHaveBeenCalledWith('no_answer_second_problem', false)

    expect(screen.queryByRole('button', { name: /Editar regla Salida básica/ })).not.toBeInTheDocument()
    expect(screen.getByText('Siempre activas')).toBeInTheDocument()
  })

  it('filtra por tipo de regla', () => {
    render(
      <LabRuleList
        groups={groups}
        onEditRule={() => {}}
        onToggleGenericRule={() => {}}
        onCreateCustom={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'Problemas' }))
    expect(screen.queryByText('Mi combo')).not.toBeInTheDocument()
    expect(screen.getByText('Sin respuesta')).toBeInTheDocument()
  })
})
