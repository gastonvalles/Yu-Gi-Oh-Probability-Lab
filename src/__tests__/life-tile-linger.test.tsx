// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { DELTA_MS } from '../app/life-effects'
import { LifeTile, SIGNAL_MS } from '../components/duel/DuelBar'

// Lo pasajero (el −N de las vidas y el globo de una señal) se va con un fundido: `animate-linger`, con la duración de su temporizador (la que lo quita del DOM).
describe('lo pasajero de las vidas', () => {
  afterEach(cleanup)

  it('el −N dura lo que su temporizador y se funde', () => {
    const { container, rerender } = render(<LifeTile name="Ana" life={8000} mine />)

    rerender(<LifeTile name="Ana" life={7000} mine />)

    const delta = [...container.querySelectorAll('span')].find((span) => /^[−+-]1000$/.test(span.textContent ?? ''))

    expect(delta).toHaveClass('animate-linger')
    expect(delta!.style.animationDuration).toBe(`${DELTA_MS}ms`)
  })

  it('el globo dura lo que su temporizador y, si llega otra señal aunque diga lo mismo, vuelve a entrar (es otro nodo)', () => {
    const { rerender } = render(<LifeTile name="Ana" life={8000} mine bubble="👍" bubbleKey={1} />)
    const primero = screen.getByRole('status')

    expect(primero).toHaveClass('animate-linger')
    expect(primero.style.animationDuration).toBe(`${SIGNAL_MS}ms`)

    // Sin señal nueva, el mismo globo (no vuelve a entrar).
    rerender(<LifeTile name="Ana" life={8000} mine bubble="👍" bubbleKey={1} />)
    expect(screen.getByRole('status')).toBe(primero)

    // Otra señal, con su propia clave: un globo nuevo, que entra de nuevo y se va con su fundido.
    rerender(<LifeTile name="Ana" life={8000} mine bubble="👍" bubbleKey={2} />)
    expect(screen.getByRole('status')).not.toBe(primero)
  })
})
