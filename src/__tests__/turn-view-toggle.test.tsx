// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

import type { LabResults, LabViewResult } from '../app/probability-lab'
import { LabRuleList } from '../components/probability/LabRuleList'
import { LabScoreCard } from '../components/probability/LabScoreCard'
import { TurnViewToggle } from '../components/probability/TurnViewToggle'
import type { ProbabilityCausalEntry } from '../components/probability/probability-lab-helpers'

function view(cleanProbability: number, handSize: number | null): LabViewResult {
  return {
    handSize,
    cleanProbability,
    noOpeningProbability: 1 - cleanProbability,
    blockedOpeningProbability: 0,
    cleanHands: handSize ? 100 : null,
    totalHands: handSize ? 1000 : null,
    patternResults: [],
  }
}

const RESULTS: LabResults = { first: view(0.41, 5), second: view(0.73, 6), average: view(0.57, null) }

function entry(overrides: Partial<ProbabilityCausalEntry>): ProbabilityCausalEntry {
  return {
    definitionKey: 'k',
    description: '',
    id: 'id',
    isCore: false,
    kind: 'opening',
    name: 'Regla',
    patternId: 'p1',
    possible: true,
    probability: 0.5,
    presetId: null,
    technicalSubtitle: 'con 1+ Starter',
    turnContext: 'either',
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
    const { rerender } = render(<LabScoreCard results={RESULTS} view="average" feedback={null} isRecalculating={false} />)

    expect(screen.getByText('57.00%')).toBeInTheDocument()
    expect(screen.getByText('41.0%')).toBeInTheDocument()
    expect(screen.getByText('73.0%')).toBeInTheDocument()

    rerender(<LabScoreCard results={RESULTS} view="second" feedback={null} isRecalculating={false} />)
    expect(screen.getByText('73.00%')).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'Manos limpias' })).toHaveAttribute('aria-valuenow', '73')
  })
})

describe('LabRuleList', () => {
  it('abre la edición con un toque en la regla, sin modo edición previo', () => {
    const onEditRule = vi.fn()
    render(
      <LabRuleList
        openings={[entry({ patternId: 'open', name: 'Salida básica' })]}
        problems={[entry({ patternId: 'bad', name: 'Mano sin Starter', kind: 'problem' })]}
        highlightedPatternId={null}
        onEditRule={onEditRule}
        onAddRecommended={() => {}}
        onCreateCustom={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Editar regla Mano sin Starter/ }))
    expect(onEditRule).toHaveBeenCalledWith('bad')
  })
})
