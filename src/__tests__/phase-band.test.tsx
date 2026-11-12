// @vitest-environment jsdom
// La banda de la fase (`PhaseBand`): sale con el color de quien juega, no ataja toques, lleva su propio reloj y, si las fases van rápido, no se apila.
import { act, render } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PHASE_BAND_MS, PhaseBand, TURN_BAND_MS, type PhaseCue } from '../components/duel/PhaseBand'

const bands = () => document.querySelectorAll('[data-fx="banner"]')

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('PhaseBand', () => {
  it('la tuya violeta y la del rival lima, sólo con el nombre de la fase, sin atajar toques', () => {
    const view = render(<PhaseBand cue={{ key: 1, phase: 'battle', side: 'mine' }} />)
    const band = bands()[0]!

    expect(band).toHaveAttribute('data-side', 'mine')
    expect(band).toHaveTextContent(/^Battle Phase$/)
    expect(band).toHaveClass('pointer-events-none')
    expect(band.firstElementChild!.className).toContain('var(--color-primary)')

    view.rerender(<PhaseBand cue={{ key: 2, phase: 'end', side: 'theirs' }} />)
    expect(bands()).toHaveLength(1)
    expect(bands()[0]).toHaveAttribute('data-side', 'theirs')
    expect(bands()[0]!.firstElementChild!.className).toContain('var(--color-info)')
    expect(bands()[0]!.firstElementChild).toHaveClass('text-info-foreground')
  })

  it('se va sola aunque quien la monta no saque la fase, y que la saque antes no la corta', () => {
    const view = render(<PhaseBand cue={{ key: 1, phase: 'draw', side: 'mine' }} />)

    view.rerender(<PhaseBand cue={null} />)
    expect(bands()).toHaveLength(1)
    act(() => vi.advanceTimersByTime(PHASE_BAND_MS))
    expect(bands()).toHaveLength(0)
  })

  it('las fases rápidas no se apilan: la misma banda cambia de texto y vuelve a contar', () => {
    const cue = (key: number, phase: PhaseCue['phase']): PhaseCue => ({ key, phase, side: 'mine' })
    const view = render(<PhaseBand cue={cue(1, 'draw')} />)
    const first = bands()[0]!.firstElementChild

    act(() => vi.advanceTimersByTime(250))
    view.rerender(<PhaseBand cue={cue(2, 'standby')} />)
    act(() => vi.advanceTimersByTime(250))
    view.rerender(<PhaseBand cue={cue(3, 'main1')} />)
    expect(bands()).toHaveLength(1)
    expect(bands()[0]).toHaveTextContent(/^Main Phase 1$/)
    // Es la misma banda (no vuelve a entrar), y se queda su rato contado desde la última.
    expect(bands()[0]!.firstElementChild).toBe(first)
    act(() => vi.advanceTimersByTime(PHASE_BAND_MS - 1))
    expect(bands()).toHaveLength(1)
    act(() => vi.advanceTimersByTime(1))
    expect(bands()).toHaveLength(0)
  })

  it('con una carta grande en el centro (hold) espera: no se dibuja detrás de ella, y su reloj sigue', () => {
    const cue: PhaseCue = { key: 1, phase: 'battle', side: 'mine' }
    const view = render(<PhaseBand cue={cue} hold />)

    expect(bands()).toHaveLength(0)
    view.rerender(<PhaseBand cue={null} hold={false} />)
    expect(bands()).toHaveLength(1)
    act(() => vi.advanceTimersByTime(PHASE_BAND_MS))
    expect(bands()).toHaveLength(0)
  })

  it('al pasar el turno sale antes «Cambio de turno», más alta y del color de quien empieza, y después la fase más nueva; el primer turno no la tiene', () => {
    const view = render(<PhaseBand cue={{ key: 1, phase: 'draw', side: 'theirs' }} />)

    // El primer turno: sólo su fase.
    expect(bands()[0]).toHaveTextContent(/^Draw Phase$/)
    act(() => vi.advanceTimersByTime(PHASE_BAND_MS))
    view.rerender(<PhaseBand cue={{ key: 2, phase: 'draw', side: 'mine', turn: true }} />)
    expect(bands()).toHaveLength(1)
    expect(bands()[0]).toHaveAttribute('data-turn')
    expect(bands()[0]).toHaveAttribute('data-side', 'mine')
    expect(bands()[0]).toHaveTextContent(/^Cambio de turno$/)
    expect(bands()[0]).toHaveClass('h-20', 'pointer-events-none')
    // Una fase que llega mientras se ve espera su turno (no se apilan): sale la más nueva, después.
    act(() => vi.advanceTimersByTime(500))
    view.rerender(<PhaseBand cue={{ key: 3, phase: 'standby', side: 'mine' }} />)
    expect(bands()).toHaveLength(1)
    expect(bands()[0]).toHaveTextContent(/^Cambio de turno$/)
    act(() => vi.advanceTimersByTime(TURN_BAND_MS - 500))
    expect(bands()).toHaveLength(1)
    expect(bands()[0]).not.toHaveAttribute('data-turn')
    expect(bands()[0]).toHaveTextContent(/^Standby Phase$/)
    act(() => vi.advanceTimersByTime(PHASE_BAND_MS))
    expect(bands()).toHaveLength(0)
  })
})
