// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dispatchLife } from '../app/life-store'
import { LifeCalculatorFab } from '../components/life/LifeCalculatorFab'

// La calculadora entera no es lo que se prueba acá.
vi.mock('../components/deck-mode/lazy-steps', () => ({ LazyLifeCalculatorScreen: () => <p>Calculadora abierta</p> }))

const FAB = /^Calculadora de LP\. Quedan/

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  act(() => dispatchLife({ type: 'timer-reset' }))
})

afterEach(() => {
  act(() => dispatchLife({ type: 'timer-reset' }))
  cleanup()
  vi.useRealTimers()
})

const startRound = () => act(() => dispatchLife({ type: 'timer-toggle', now: Date.now() }))

describe('el botón flotante de la calculadora de LP', () => {
  it('sin el reloj de la ronda corriendo no hay botón: la calculadora se abre desde el menú', () => {
    render(<LifeCalculatorFab open={false} onOpen={() => {}} onClose={() => {}} />)

    expect(screen.queryByRole('button', { name: /Calculadora de LP/ })).not.toBeInTheDocument()
  })

  it('con el reloj corriendo y la calculadora cerrada aparece, con lo que queda de la ronda, y tocarlo la abre', () => {
    const onOpen = vi.fn()

    startRound()
    render(<LifeCalculatorFab open={false} onOpen={onOpen} onClose={() => {}} />)

    const fab = screen.getByRole('button', { name: FAB })

    expect(fab).toHaveTextContent('50:00')
    fireEvent.click(fab)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('con la calculadora abierta no está, aunque el reloj siga corriendo; al cerrarla vuelve', () => {
    startRound()

    const { rerender } = render(<LifeCalculatorFab open onOpen={() => {}} onClose={() => {}} />)

    expect(screen.getByText('Calculadora abierta')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: FAB })).not.toBeInTheDocument()

    rerender(<LifeCalculatorFab open={false} onOpen={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: FAB })).toBeInTheDocument()
  })

  it('al pausar el reloj el botón se va', () => {
    startRound()
    render(<LifeCalculatorFab open={false} onOpen={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: FAB })).toBeInTheDocument()

    startRound()
    expect(screen.queryByRole('button', { name: /Calculadora de LP/ })).not.toBeInTheDocument()
  })
})
