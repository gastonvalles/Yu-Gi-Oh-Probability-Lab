// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { atLeastProbability } from '../app/quick-odds'
import { formatShortPercent } from '../app/utils'
import { QuickCalculator } from '../components/probability/QuickCalculator'

const pct = (deck: number, copies: number, hand: number, atLeast: number) => formatShortPercent(atLeastProbability(deck, copies, hand, atLeast))

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
})

describe('la calculadora rápida', () => {
  it('arranca con el deck actual y 3 copias, cambia con lo tecleado y con el turno, y dice cuántas copias hacen falta', () => {
    render(<QuickCalculator isOpen onClose={() => {}} deckSize={42} handSize={5} />)

    expect(screen.getByRole('spinbutton', { name: 'Cartas en el deck' })).toHaveValue(42)
    expect(screen.getByRole('meter', { name: `Al menos 1: ${pct(42, 3, 5, 1)}` })).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: `Al menos 3: ${pct(42, 3, 5, 3)}` })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Usar mi deck/ })).not.toBeInTheDocument()

    // Los vectores de la auditoría: 3 en 40, mano de 5 → 33.8 / 3.6 / 0.1; para el 60 % hacen falta 7 (63.9 %).
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Cartas en el deck' }), { target: { value: '40' } })
    expect(screen.getByRole('meter', { name: 'Al menos 1: 33.8%' })).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'Al menos 2: 3.6%' })).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'Al menos 3: 0.1%' })).toBeInTheDocument()
    expect(screen.getByTestId('needed-copies')).toHaveTextContent('hacen falta 7 copias (63.9%).')

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Porcentaje buscado' }), { target: { value: '70' } })
    expect(screen.getByTestId('needed-copies')).toHaveTextContent('hacen falta 9 copias (74.2%).')
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Porcentaje buscado' }), { target: { value: '100' } })
    expect(screen.getByTestId('needed-copies')).toHaveTextContent('hacen falta 36 copias (100.0%).')

    // Yendo 2º la mano es de 6.
    fireEvent.click(screen.getByRole('radio', { name: /Yendo 2º/ }))
    expect(screen.getByRole('meter', { name: `Al menos 1: ${pct(40, 3, 6, 1)}` })).toBeInTheDocument()

    // "Usar mi deck" vuelve al Main actual; lo tecleado fuera de rango se acota.
    fireEvent.click(screen.getByRole('button', { name: 'Usar mi deck (42 cartas)' }))
    expect(screen.getByRole('spinbutton', { name: 'Cartas en el deck' })).toHaveValue(42)
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Copias' }), { target: { value: '999' } })
    expect(screen.getByRole('meter', { name: 'Al menos 1: 100.0%' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Copias' }), { target: { value: '' } })
    expect(screen.getByRole('meter', { name: 'Al menos 1: 0.0%' })).toBeInTheDocument()
  })

  it('sin deck arranca en 40 cartas y no ofrece "Usar mi deck"', () => {
    render(<QuickCalculator isOpen onClose={() => {}} deckSize={0} handSize={5} />)

    expect(screen.getByRole('spinbutton', { name: 'Cartas en el deck' })).toHaveValue(40)
    expect(screen.queryByRole('button', { name: /Usar mi deck/ })).not.toBeInTheDocument()
  })
})
