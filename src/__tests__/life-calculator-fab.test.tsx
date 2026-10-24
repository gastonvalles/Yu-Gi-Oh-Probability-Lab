// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ROUND_LIMIT_MS } from '../app/life-calculator'
import { dispatchLife } from '../app/life-store'
import { LifeCalculatorFab } from '../components/life/LifeCalculatorFab'

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
    render(<LifeCalculatorFab onOpen={() => {}} />)

    expect(screen.queryByRole('button', { name: /Calculadora de LP/ })).not.toBeInTheDocument()
  })

  it('con el reloj corriendo y fuera de la calculadora aparece, con lo que queda de la ronda, y tocarlo lleva a ella', () => {
    const onOpen = vi.fn()

    startRound()
    render(<LifeCalculatorFab onOpen={onOpen} />)

    const fab = screen.getByRole('button', { name: FAB })

    expect(fab).toHaveTextContent('50:00')
    fireEvent.click(fab)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('en la mesa de un duelo no aparece, aunque el reloj de la ronda corra: ahí está el reloj del duelo y el botón lo duplicaría y le competiría', () => {
    startRound()

    const { rerender } = render(<LifeCalculatorFab onOpen={() => {}} hidden />)

    expect(screen.queryByRole('button', { name: FAB })).not.toBeInTheDocument()

    rerender(<LifeCalculatorFab onOpen={() => {}} hidden={false} />)
    expect(screen.getByRole('button', { name: FAB })).toBeInTheDocument()
  })

  it('dentro de la calculadora (una vista) no está, aunque el reloj siga corriendo; al salir de ella vuelve', () => {
    startRound()

    const { rerender } = render(<LifeCalculatorFab onOpen={() => {}} hidden />)

    expect(screen.queryByRole('button', { name: FAB })).not.toBeInTheDocument()

    rerender(<LifeCalculatorFab onOpen={() => {}} hidden={false} />)
    expect(screen.getByRole('button', { name: FAB })).toBeInTheDocument()
  })

  it('al acabarse la ronda se queda en 00:00 (la alarma suena hasta que se reinicie el reloj, y por ahí se llega a hacerlo) y al reiniciarlo se va', () => {
    startRound()
    render(<LifeCalculatorFab onOpen={() => {}} />)
    act(() => vi.advanceTimersByTime(ROUND_LIMIT_MS))

    expect(screen.getByRole('button', { name: FAB })).toHaveTextContent('00:00')

    act(() => dispatchLife({ type: 'timer-reset' }))
    expect(screen.queryByRole('button', { name: /Calculadora de LP/ })).not.toBeInTheDocument()
  })

  it('al pausar el reloj el botón se va', () => {
    startRound()
    render(<LifeCalculatorFab onOpen={() => {}} />)
    expect(screen.getByRole('button', { name: FAB })).toBeInTheDocument()

    startRound()
    expect(screen.queryByRole('button', { name: /Calculadora de LP/ })).not.toBeInTheDocument()
  })
})
