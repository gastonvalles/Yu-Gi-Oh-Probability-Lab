// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

describe('TurnViewToggle (isolation)', () => {
  it('renders three radios with labels "Promedio", "Yendo 1º", "Yendo 2º" (in that order)', () => {
    /** **Validates: Requirements 3.2, 3.4** */
    render(<TurnViewToggle activeView="average" onChange={() => {}} />)

    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('aria-label'))).toEqual(['Promedio', 'Yendo 1º', 'Yendo 2º'])
  })

  it('con los valores, cada opción no elegida lleva su anillo y su número en el nombre; la elegida dice cuántas cartas mira', () => {
    render(<TurnViewToggle activeView="average" onChange={() => {}} values={{ average: 0.57, first: 0.41, second: 0.73 }} details={{ average: '5 y 6 cartas' }} />)

    expect(screen.getByRole('radio', { name: 'Promedio' })).toHaveTextContent('5 y 6 cartas')
    expect(screen.getByRole('radio', { name: 'Yendo 1º: 41 de cada 100' })).toHaveTextContent('41')
    expect(screen.getByRole('radio', { name: 'Yendo 2º: 73 de cada 100' })).toHaveTextContent('73')
    // La elegida se enmarca (ámbar, sin relleno) y no repite su número: su número es el grande del veredicto.
    expect(screen.getByRole('radio', { name: 'Promedio' })).toHaveClass('inset-ring-info')
    expect(screen.getByRole('radio', { name: 'Promedio' })).not.toHaveTextContent('57')
  })

  it('emits onChange with the clicked view value', () => {
    const onChange = vi.fn()
    render(<TurnViewToggle activeView="average" onChange={onChange} />)

    fireEvent.click(screen.getByRole('radio', { name: 'Yendo 1º' }))
    expect(onChange).toHaveBeenLastCalledWith('first')

    fireEvent.click(screen.getByRole('radio', { name: 'Yendo 2º' }))
    expect(onChange).toHaveBeenLastCalledWith('second')

    fireEvent.click(screen.getByRole('radio', { name: 'Promedio' }))
    expect(onChange).toHaveBeenLastCalledWith('average')
  })

  it('marks the active view as aria-checked="true" and others as "false"', () => {
    const { rerender } = render(<TurnViewToggle activeView="first" onChange={() => {}} />)

    expect(screen.getByRole('radio', { name: 'Yendo 1º' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('radio', { name: 'Yendo 2º' })).toHaveAttribute(
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
  it('muestra el veredicto de la vista activa (un reparto, con la nota) y la lente con el número de cada turno', async () => {
    const onViewChange = vi.fn()
    const { rerender } = render(<LabScoreCard results={RESULTS} view="average" onViewChange={onViewChange} isRecalculating={false} handSize={5} onOpenDisclaimer={() => {}} />)

    // El número es «de cada 100», entero, sin % y con su unidad adentro del anillo; la frase de al lado sólo dice qué son.
    expect(screen.getByText('manos son buenas')).toBeInTheDocument()
    expect(screen.getByText('según tus reglas')).toBeInTheDocument()
    expect(screen.getByText('Mejorable')).toBeInTheDocument()
    // El 57 del anillo grande cuenta de 0 junto con su arco verde: se espera a que llegue al valor. El reparto, con el decimal, va en su nombre.
    const verdict = screen.getByRole('img', { name: /^Manos buenas: 57\.0%; con problema: 0\.0%; sin salida: 43\.0%/ })
    await waitFor(() => expect(verdict).toHaveTextContent(/^57de cada 100$/), { timeout: 2000 })
    // La lente: cada turno con su número; la elegida, con cuántas cartas mira.
    expect(screen.getByRole('radio', { name: 'Promedio' })).toHaveTextContent('5 y 6 cartas')
    expect(screen.getByRole('radio', { name: 'Yendo 1º: 41 de cada 100' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Yendo 2º: 73 de cada 100' }))
    expect(onViewChange).toHaveBeenCalledWith('second')

    rerender(<LabScoreCard results={RESULTS} view="second" onViewChange={onViewChange} isRecalculating={false} handSize={5} onOpenDisclaimer={() => {}} />)
    expect(screen.getByRole('img', { name: /^Manos buenas: 73\.0%/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Yendo 2º' })).toHaveTextContent('6 cartas')
  })

  it('«Sin salida» y «Con problema» son filas que se abren con los problemas de esas manos', () => {
    const withRules: LabResults = {
      ...RESULTS,
      average: { ...RESULTS.average, segmentRules: { clean: [], withProblem: [], noOpening: [{ patternId: 'p', name: 'Sin respuesta yendo 2º', kind: 'problem', share: 0.004, jointProbability: 0.001 }] } },
    }
    render(<LabScoreCard results={withRules} view="average" onViewChange={() => {}} isRecalculating={false} handSize={5} onOpenDisclaimer={() => {}} />)
    const noOpening = screen.getByRole('button', { name: /^Sin salida/ })

    expect(noOpening).toHaveAttribute('aria-expanded', 'false')
    expect(noOpening).toHaveTextContent('43')
    fireEvent.click(noOpening)
    expect(noOpening).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('meter', { name: 'Sin respuesta yendo 2º: 0.4%' })).toHaveTextContent('<1')
    expect(screen.getByText('Una mano puede tener varios problemas.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Con problema/ }))
    expect(screen.getByText('Ninguna mano con salida tiene problemas.')).toBeInTheDocument()
  })
})

describe('la ficha «Cómo se calcula» del resultado', () => {
  it('se abre con la ⓘ y cuenta las manos de cada turno, el promedio y lo que el número no dice', () => {
    render(<LabScoreCard results={RESULTS} view="average" onViewChange={() => {}} isRecalculating={false} handSize={5} onOpenDisclaimer={() => {}} />)

    expect(screen.queryByRole('dialog', { name: 'Cómo se calcula' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cómo se calcula: abrir la ficha' }))

    const sheet = screen.getByRole('dialog', { name: 'Cómo se calcula' })
    expect(sheet).toHaveTextContent('Una mano buena')
    expect(sheet).toHaveTextContent('Yendo 1º · mano de 5')
    expect(sheet).toHaveTextContent('Yendo 2º · mano de 6')
    expect(sheet).toHaveTextContent('Promedio · la media de las dos')
    expect(sheet).toHaveTextContent('57.0%')
    expect(sheet).toHaveTextContent('Lo que no dice')

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog', { name: 'Cómo se calcula' })).not.toBeInTheDocument()
  })

  it('«Cómo leer estos porcentajes» cierra la ficha y abre el aviso', () => {
    const onOpenDisclaimer = vi.fn()

    render(<LabScoreCard results={RESULTS} view="average" onViewChange={() => {}} isRecalculating={false} handSize={5} onOpenDisclaimer={onOpenDisclaimer} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cómo se calcula: abrir la ficha' }))
    fireEvent.click(screen.getByRole('button', { name: /Cómo leer estos porcentajes/ }))

    expect(onOpenDisclaimer).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', { name: 'Cómo se calcula' })).not.toBeInTheDocument()
  })
})

describe('LabRuleList', () => {
  const groups = {
    universal: [entry({ patternId: 'u', tier: 'universal', presetId: 'starter_opening', name: 'Salida básica', defaultName: 'Salida básica' })],
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
        onEditGenericRule={() => {}}
        onRenameSystemRule={() => {}}
        onCreateCustom={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Editar regla Mi combo/ }))
    expect(onEditRule).toHaveBeenCalledWith('c')

    // Las reglas universales y genéricas se ven siempre: no hay nada que desplegar.
    expect(screen.getByText('Salida básica')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Genéricas/, expanded: false })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'Desactivar Sin respuesta' }))
    expect(onToggleGenericRule).toHaveBeenCalledWith('no_answer_second_problem', false)

    expect(screen.queryByRole('button', { name: /Editar regla Salida básica/ })).not.toBeInTheDocument()
    expect(screen.getByText('Siempre activas')).toBeInTheDocument()
  })

  it('las universales sólo permiten cambiar el nombre', () => {
    const onRenameSystemRule = vi.fn()
    render(
      <LabRuleList
        groups={groups}
        onEditRule={() => {}}
        onToggleGenericRule={() => {}}
        onEditGenericRule={() => {}}
        onRenameSystemRule={onRenameSystemRule}
        onCreateCustom={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Renombrar regla Salida básica/ }))

    const input = screen.getByRole('textbox')
    const save = screen.getByRole('button', { name: 'Guardar' })
    expect(save).toBeDisabled()

    fireEvent.change(input, { target: { value: '  Arranque   mínimo ' } })
    fireEvent.click(save)

    expect(onRenameSystemRule).toHaveBeenCalledWith('starter_opening', 'Arranque mínimo')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('filtra por tipo de regla', () => {
    render(
      <LabRuleList
        groups={groups}
        onEditRule={() => {}}
        onToggleGenericRule={() => {}}
        onEditGenericRule={() => {}}
        onRenameSystemRule={() => {}}
        onCreateCustom={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'Problemas' }))
    expect(screen.queryByText('Mi combo')).not.toBeInTheDocument()
    expect(screen.getByText('Sin respuesta')).toBeInTheDocument()
  })
})
