// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { KindBadge } from '../components/probability/KindBadge'
import { PatternEditorDrawer, type PatternEditorDrawerProps } from '../components/probability/PatternEditorDrawer'
import type { PatternEditorActions } from '../components/probability/pattern-editor-actions'
import { KindToggle } from '../components/probability/rule-builder/KindToggle'
import type { CardEntry, HandPattern, PatternCondition } from '../types'

/**
 * Gastón (2026-10-23): «el usuario no debe ver un error apenas entra a crear una regla. salida verde con texto blanco. problema rojo con texto blanco».
 * Faltar elegir qué cuenta es el paso que sigue: se marca en rojo recién cuando se intenta crear la regla así.
 */

afterEach(cleanup)

const deck: CardEntry[] = [
  { id: 'ash', name: 'Ash Blossom', copies: 3, source: 'manual', apiCard: null, origin: 'non_engine', roles: ['handtrap'], needsReview: false },
  { id: 'fki', name: 'Fire King Island', copies: 3, source: 'manual', apiCard: null, origin: 'engine', roles: ['starter'], needsReview: false },
]

const handtrap = { type: 'role', value: 'handtrap' } as const
const condition = (id: string, matcher: PatternCondition['matcher']): PatternCondition => ({ id, matcher, quantity: 1, kind: 'include', distinct: false })
const rule = (conditions: PatternCondition[], overrides: Partial<HandPattern> = {}): HandPattern => ({
  id: 'regla',
  name: '',
  kind: 'opening',
  turnContext: 'either',
  logic: 'all',
  minimumConditionMatches: 1,
  reusePolicy: 'forbid',
  needsReview: false,
  conditions,
  ...overrides,
})
const actions = { addRequirement: vi.fn(), setRequirementCount: vi.fn(), setRequirementMatcher: vi.fn() } as unknown as PatternEditorActions

/** Como en el Lab (`LabRules`): se guarda cuando cada condición dice qué cuenta; si no, el pie dice qué falta. */
function drawerProps(pattern: HandPattern, overrides: Partial<PatternEditorDrawerProps> = {}): PatternEditorDrawerProps {
  const complete = pattern.conditions.every((entry) => entry.matcher !== null)

  return {
    isOpen: true,
    mode: 'create',
    showExamples: false,
    pattern,
    actions,
    derivedMainCards: deck,
    impact: { impact: null, pending: false },
    canSave: complete,
    blockReason: complete ? null : 'Falta elegir qué cuenta',
    duplicateOf: null,
    onPickExample: () => null,
    onClose: vi.fn(),
    onSave: vi.fn(),
    ...overrides,
  }
}

const dialog = () => screen.getByRole('dialog')
const footerText = () => dialog().querySelector('footer [aria-live]')!
const readback = () => dialog().querySelector('header b')!
const pickOf = (id: string) => dialog().querySelector<HTMLElement>(`[data-condition-pick="${id}"]`)!
const create = () => screen.getByRole('button', { name: 'Crear regla' })
/** Todo lo que va en rojo dentro del cajón (texto, borde o ícono) sale de las clases del tono `danger`. */
const redThings = () => [...dialog().querySelectorAll('[class*="danger"]')]

describe('crear una regla: sin errores al entrar', () => {
  it('recién abierta y en blanco no hay nada en rojo: lo que falta es una pista y «Crear regla» se ve apagado pero se enfoca', () => {
    render(<PatternEditorDrawer {...drawerProps(rule([condition('c1', null)]))} />)

    expect(redThings()).toEqual([])
    expect(pickOf('c1')).toHaveAccessibleName('Elegí qué cuenta')
    expect(pickOf('c1')).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText('Falta elegir qué cuenta esta condición')).not.toBeInTheDocument()
    expect(footerText()).toHaveTextContent('Falta elegir qué cuenta')
    expect(footerText()).toHaveClass('text-muted')
    expect(footerText()).not.toHaveClass('font-semibold')
    expect(readback()).toHaveTextContent('(falta elegir qué cuenta)')
    expect(readback()).toHaveClass('text-muted', 'font-normal')
    expect(create()).toBeEnabled()
    expect(create()).toHaveAttribute('aria-disabled', 'true')
    expect(create()).toHaveClass('opacity-40')
  })

  it('tocar «Crear regla» a medias no guarda: marca en rojo lo que falta y lleva el foco a esa condición', () => {
    const props = drawerProps(rule([condition('c1', null)]))
    render(<PatternEditorDrawer {...props} />)

    fireEvent.click(create())

    expect(props.onSave).not.toHaveBeenCalled()
    expect(pickOf('c1')).toHaveAttribute('aria-invalid', 'true')
    expect(pickOf('c1')).toHaveAccessibleDescription('Falta elegir qué cuenta esta condición')
    expect(pickOf('c1')).toHaveClass('text-danger-soft')
    expect(pickOf('c1')).toHaveFocus()
    expect(footerText()).toHaveClass('font-semibold', 'text-danger-soft')
    expect(readback()).toHaveClass('font-semibold', 'text-danger-soft')
  })

  it('al elegir qué cuenta el error se va, el botón se habilita y guarda; una condición que se suma después tampoco nace en rojo', () => {
    const onSave = vi.fn()
    const { rerender } = render(<PatternEditorDrawer {...drawerProps(rule([condition('c1', null)]), { onSave })} />)
    fireEvent.click(create())

    rerender(<PatternEditorDrawer {...drawerProps(rule([condition('c1', handtrap)]), { onSave })} />)
    expect(redThings()).toEqual([])
    expect(pickOf('c1')).not.toHaveAttribute('aria-invalid')
    expect(footerText()).toBeEmptyDOMElement()
    expect(create()).not.toHaveAttribute('aria-disabled')
    fireEvent.click(create())
    expect(onSave).toHaveBeenCalledTimes(1)

    rerender(<PatternEditorDrawer {...drawerProps(rule([condition('c1', handtrap), condition('c2', null)]), { onSave })} />)
    expect(redThings()).toEqual([])
    expect(pickOf('c2')).not.toHaveAttribute('aria-invalid')
  })

  it('con dos condiciones y la primera completa, la segunda vacía no se pinta de rojo hasta un intento; ahí, sólo ella', () => {
    render(<PatternEditorDrawer {...drawerProps(rule([condition('c1', handtrap), condition('c2', null)]))} />)

    expect(redThings()).toEqual([])
    fireEvent.click(create())

    expect(pickOf('c2')).toHaveAttribute('aria-invalid', 'true')
    expect(pickOf('c2')).toHaveFocus()
    expect(pickOf('c1')).not.toHaveAttribute('aria-invalid')
    expect(screen.getAllByText('Falta elegir qué cuenta esta condición')).toHaveLength(1)
  })

  it('cerrar el cajón apaga el intento: al volver a abrir la misma regla, no hay nada en rojo', () => {
    const props = drawerProps(rule([condition('c1', null)]))
    const { rerender } = render(<PatternEditorDrawer {...props} />)
    fireEvent.click(create())

    rerender(<PatternEditorDrawer {...props} isOpen={false} />)
    rerender(<PatternEditorDrawer {...props} />)

    expect(redThings()).toEqual([])
  })

  it('un duplicado nace de lo que se eligió: va en rojo desde el principio y el botón queda apagado', () => {
    const props = drawerProps(rule([condition('c1', handtrap)]), { canSave: false, blockReason: 'Es igual a otra regla', duplicateOf: 'Mi regla' })
    render(<PatternEditorDrawer {...props} />)

    expect(footerText()).toHaveClass('font-semibold', 'text-danger-soft')
    expect(screen.getByText(/Es igual a “Mi regla”/)).toHaveClass('text-danger-soft')
    expect(create()).toBeDisabled()
  })
})

describe('Salida verde y Problema rojo, con el texto blanco', () => {
  it('en «Qué es», la elegida va llena: verde si es salida, roja si es problema', () => {
    const { rerender } = render(<KindToggle patternId="p" currentKind="opening" actions={actions} />)

    expect(screen.getByRole('radio', { name: 'Salida' })).toHaveClass('bg-success-solid', 'text-white')
    expect(screen.getByRole('radio', { name: 'Problema' })).not.toHaveClass('bg-danger')

    rerender(<KindToggle patternId="p" currentKind="problem" actions={actions} />)
    expect(screen.getByRole('radio', { name: 'Problema' })).toHaveClass('bg-danger', 'text-white')
    expect(screen.getByRole('radio', { name: 'Salida' })).not.toHaveClass('bg-success-solid')
  })

  it('la etiqueta de la regla va llena, del mismo color, en vez de teñida', () => {
    render(
      <>
        <KindBadge kind="opening" />
        <KindBadge kind="problem" />
      </>,
    )

    expect(screen.getByText('Salida')).toHaveClass('bg-success-solid', 'text-white')
    expect(screen.getByText('Salida')).not.toHaveClass('text-success-soft')
    expect(screen.getByText('Problema')).toHaveClass('bg-danger', 'text-white')
    expect(screen.getByText('Problema')).not.toHaveClass('text-danger-soft')
  })
})
