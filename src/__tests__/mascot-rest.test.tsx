// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { activeMascotIds, resetMascotChoiceForTests, resetMascotForTests } from '../app/mascot'
import { Mascot } from '../components/mascot/Mascot'

beforeEach(() => {
  localStorage.clear()
  // La mascota saluda sola la primera vez: acá ya la saludaron.
  localStorage.setItem('ygo-lab:mascot-greeted', '1')
  resetMascotChoiceForTests()
  resetMascotForTests()
  HTMLElement.prototype.setPointerCapture = () => {}
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const press = () => fireEvent.pointerDown(screen.getByRole('button', { name: 'Saludar a Cupsy' }), { button: 0, pointerId: 1, clientX: 20, clientY: 20 })
const release = () => fireEvent.pointerUp(screen.getByRole('button', { name: 'Saludar a Cupsy' }), { button: 0, pointerId: 1, clientX: 20, clientY: 20 })

describe('dejar a la mascota descansar', () => {
  it('a los cinco segundos apretada pregunta si querés darle un descanso, y aceptar la saca', () => {
    render(<Mascot />)

    press()
    act(() => vi.advanceTimersByTime(4999))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('¿Darle un descanso a Cupsy?')).toBeInTheDocument()

    // Soltar después de la pregunta no cuenta como un toque que la salude.
    release()

    fireEvent.click(screen.getByRole('button', { name: 'Darle un descanso' }))

    expect(activeMascotIds()).toEqual([])
    expect(screen.queryByRole('button', { name: 'Saludar a Cupsy' })).not.toBeInTheDocument()
  })

  it('"Seguir jugando" la deja afuera', () => {
    render(<Mascot />)

    press()
    act(() => vi.advanceTimersByTime(5000))
    fireEvent.click(screen.getByRole('button', { name: 'Seguir jugando' }))

    expect(activeMascotIds()).toEqual(['cupsy'])
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Saludar a Cupsy' })).toBeInTheDocument()
  })

  it('soltarla antes de los cinco segundos no pregunta nada', () => {
    render(<Mascot />)

    press()
    act(() => vi.advanceTimersByTime(3000))
    release()
    act(() => vi.advanceTimersByTime(10_000))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(activeMascotIds()).toEqual(['cupsy'])
  })
})
