// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { createElement, type ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MatAction } from '../app/practice-mat'
import { createSavedCombo, writeSavedCombos } from '../app/saved-combos'
import { Harness, INITIAL, render } from './support/practice-mat-harness'

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []) }))

// El tablero chico de cada ficha, contado y sin su `memo`: se dibuja cada vez que se dibuja su ficha (`StepTile`, que sí es `memo`).
const spy = vi.hoisted(() => ({ snapshots: 0 }))
vi.mock('../components/probability/MatSnapshot', async () => {
  const actual = await vi.importActual<typeof import('../components/probability/MatSnapshot')>('../components/probability/MatSnapshot')
  return {
    ...actual,
    MatSnapshot: (props: ComponentProps<typeof actual.MatSnapshot>) => {
      spy.snapshots += 1
      return createElement(actual.MatSnapshot, props)
    },
  }
})

const draw: MatAction = { type: 'draw', count: 1 }
const mill: MatAction = { type: 'mill', count: 1 }
const ash = 'rival.card-1-1'
// La base roba, manda una al cementerio y roba; la variante roba y ahí el rival usa la Ash (se separan en la jugada 1: el paso 2).
const base = createSavedCombo({ name: 'Base', deckName: 'Test', initial: INITIAL, actions: [draw, mill, draw, mill], nameOf: () => 'Ash Blossom' }, [], new Date('2026-10-01T00:00:00Z'))
const variant = createSavedCombo({ name: 'Contra Ash', deckName: 'Test', initial: { ...INITIAL, rival: { hand: [ash], used: [] } }, actions: [draw, { type: 'rivalUse', id: ash }, draw], nameOf: () => 'Ash Blossom' }, [], new Date('2026-10-02T00:00:00Z'))

beforeEach(() => {
  localStorage.clear()
  writeSavedCombos([base, variant])
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  window.requestAnimationFrame = (callback) => {
    callback(0)
    return 1
  }
  window.cancelAnimationFrame = () => {}
})

const panel = () => screen.getByRole('region', { name: 'Pasos y combos' })
const tab = (name: string) => fireEvent.click(within(panel()).getByRole('radio', { name }))
const current = () => within(panel()).getByRole('button', { current: 'step' })

describe('ramas: una variante ligada a su combo base', () => {
  it('la lista lo dice en las dos fichas; repasando el base, «Rama» abre la variante parada en el paso donde se separan, y de ahí se vuelve', () => {
    render(<Harness />)
    tab('Combos')
    expect(within(panel()).getByText('“Base” · desde el paso 2')).toBeInTheDocument()
    expect(within(panel()).getByText('1 variante con handtrap')).toBeInTheDocument()

    fireEvent.click(within(panel()).getByRole('button', { name: 'Cargar Base' }))
    tab('Pasos')
    // Sólo el paso donde se separan lleva la rama.
    expect(within(panel()).getAllByRole('button', { name: /^Ver “/ })).toHaveLength(1)
    expect(within(panel()).getByText('Rama: “Contra Ash”')).toBeInTheDocument()
    fireEvent.click(within(panel()).getByRole('button', { name: 'Ver “Contra Ash” desde el paso 2' }))

    // La variante, en el paso 2 (el rival usa la Ash): se ve la diferencia sin tocar «Siguiente».
    expect(current()).toHaveTextContent(/^2/)
    expect(within(panel()).getAllByRole('button', { name: /^\d/ })).toHaveLength(4)
    expect(within(panel()).getByText('Se separa de “Base”')).toBeInTheDocument()
    fireEvent.click(within(panel()).getByRole('button', { name: 'Ver “Base” desde el paso 2' }))

    expect(current()).toHaveTextContent(/^2/)
    expect(within(panel()).getAllByRole('button', { name: /^\d/ })).toHaveLength(5)
    expect(within(panel()).getByText('Rama: “Contra Ash”')).toBeInTheDocument()
  })

  it('con la rama, pasar al paso siguiente vuelve a dibujar sólo las dos fichas que cambian (la de la rama, no)', () => {
    render(<Harness />)
    tab('Combos')
    fireEvent.click(within(panel()).getByRole('button', { name: 'Cargar Base' }))
    tab('Pasos')
    fireEvent.click(within(panel()).getByRole('button', { name: /^3/ }))
    const before = spy.snapshots
    fireEvent.click(within(panel()).getByRole('button', { name: /^4/ }))

    expect(current()).toHaveTextContent(/^4/)
    expect(spy.snapshots - before).toBe(2)
  })
})
