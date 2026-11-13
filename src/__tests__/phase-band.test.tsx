// @vitest-environment jsdom
// La banda de la fase (`PhaseBand`): sale con el color de quien juega, no ataja toques, lleva su propio reloj y, si las fases van rápido, no se apila.
import { act, fireEvent, render } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PHASE_BAND_HOLD_MS, PHASE_BAND_MS, PHASE_BAND_SETTLE_MS, PhaseBand, TURN_BAND_HOLD_MS, TURN_BAND_MS, type PhaseCue } from '../components/duel/PhaseBand'

const bands = () => document.querySelectorAll('[data-fx="banner"]')
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
/** Lo que se queda y la salida, en dos pasos, como en el navegador: la salida cuenta desde que empieza (jsdom no transiciona: termina el reloj de red). */
const leave = (hold: number, total: number) => {
  advance(hold)
  advance(total - hold)
}

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
    leave(PHASE_BAND_HOLD_MS, PHASE_BAND_MS)
    expect(bands()).toHaveLength(0)
  })

  it('las fases rápidas no se apilan: la misma banda cambia de texto y vuelve a contar', () => {
    const cue = (key: number, phase: PhaseCue['phase']): PhaseCue => ({ key, phase, side: 'mine' })
    const view = render(<PhaseBand cue={cue(1, 'draw')} />)
    const first = bands()[0]!.firstElementChild

    advance(250)
    view.rerender(<PhaseBand cue={cue(2, 'standby')} />)
    advance(250)
    view.rerender(<PhaseBand cue={cue(3, 'main1')} />)
    expect(bands()).toHaveLength(1)
    expect(bands()[0]).toHaveTextContent(/^Main Phase 1$/)
    // Es la misma banda (no vuelve a entrar), y se queda su rato contado desde la última.
    expect(bands()[0]!.firstElementChild).toBe(first)
    advance(PHASE_BAND_HOLD_MS)
    advance(PHASE_BAND_MS - PHASE_BAND_HOLD_MS - 1)
    expect(bands()).toHaveLength(1)
    advance(1)
    expect(bands()).toHaveLength(0)
  })

  it('con una carta grande en el centro (hold) espera invisible y montada (no se corta ni vuelve a entrar desde cero), y su reloj sigue', () => {
    const cue: PhaseCue = { key: 1, phase: 'battle', side: 'mine' }
    const view = render(<PhaseBand cue={cue} />)
    const band = bands()[0]!.firstElementChild

    view.rerender(<PhaseBand cue={cue} hold />)
    expect(bands()).toHaveLength(1)
    expect(bands()[0]).toHaveClass('opacity-0', 'transition-opacity')
    view.rerender(<PhaseBand cue={null} hold={false} />)
    expect(bands()[0]).not.toHaveClass('opacity-0')
    // La misma banda: sigue donde iba, sin volver a entrar.
    expect(bands()[0]!.firstElementChild).toBe(band)
    leave(PHASE_BAND_HOLD_MS, PHASE_BAND_MS)
    expect(bands()).toHaveLength(0)
  })

  it('la salida termina con su transición; si el hilo principal se atrasa, igual sale (el reloj de red cuenta desde que empieza a salir)', () => {
    render(<PhaseBand cue={{ key: 1, phase: 'main1', side: 'theirs' }} />)

    // Un atraso: los dos plazos pasan de una vez. Antes, la banda se iba sin salida; ahora queda saliendo.
    advance(PHASE_BAND_MS + 400)
    expect(bands()).toHaveLength(1)
    expect(bands()[0]!.firstElementChild).toHaveClass('opacity-0')
    // Termina la transición de su opacidad: se va.
    const end = new Event('transitionend', { bubbles: true })

    Object.assign(end, { propertyName: 'opacity' })
    fireEvent(bands()[0]!.firstElementChild!, end)
    expect(bands()).toHaveLength(0)
  })

  it('al pasar el turno al rival sale antes «Cambio de turno», más alta y lima, y enseguida su fase más nueva (su turno se ve fase por fase); el primer turno no la tiene', () => {
    const view = render(<PhaseBand cue={{ key: 1, phase: 'draw', side: 'mine' }} />)

    // El primer turno: sólo su fase.
    expect(bands()[0]).toHaveTextContent(/^Draw Phase$/)
    leave(PHASE_BAND_HOLD_MS, PHASE_BAND_MS)
    view.rerender(<PhaseBand cue={{ key: 2, phase: 'draw', side: 'theirs', turn: true }} />)
    expect(bands()).toHaveLength(1)
    expect(bands()[0]).toHaveAttribute('data-turn')
    expect(bands()[0]).toHaveAttribute('data-side', 'theirs')
    expect(bands()[0]).toHaveTextContent(/^Cambio de turno$/)
    expect(bands()[0]).toHaveClass('h-20', 'pointer-events-none')
    // Una fase que llega mientras se ve espera su turno (no se apilan): sale la más nueva, apenas se va «Cambio de turno».
    advance(500)
    view.rerender(<PhaseBand cue={{ key: 3, phase: 'standby', side: 'theirs' }} />)
    expect(bands()).toHaveLength(1)
    expect(bands()[0]).toHaveTextContent(/^Cambio de turno$/)
    leave(TURN_BAND_HOLD_MS - 500, TURN_BAND_MS - 500)
    expect(bands()).toHaveLength(1)
    expect(bands()[0]).not.toHaveAttribute('data-turn')
    expect(bands()[0]).toHaveTextContent(/^Standby Phase$/)
    leave(PHASE_BAND_HOLD_MS, PHASE_BAND_MS)
    expect(bands()).toHaveLength(0)
  })

  it('en tu turno, tras «Cambio de turno» entra enseguida tu Draw Phase (el robo no llega sin su cartel) y tus fases siguen en la misma banda', () => {
    const view = render(<PhaseBand cue={{ key: 1, phase: 'draw', side: 'mine', turn: true }} />)

    leave(TURN_BAND_HOLD_MS, TURN_BAND_MS)
    // «Cambio de turno» se fue y, sin demora, la Draw Phase, violeta; la Standby cambia el texto de la misma banda.
    expect(bands()).toHaveLength(1)
    expect(bands()[0]).not.toHaveAttribute('data-turn')
    expect(bands()[0]).toHaveAttribute('data-side', 'mine')
    expect(bands()[0]).toHaveTextContent(/^Draw Phase$/)
    const band = bands()[0]!.firstElementChild

    advance(500)
    view.rerender(<PhaseBand cue={{ key: 2, phase: 'standby', side: 'mine' }} />)
    expect(bands()[0]).toHaveTextContent(/^Standby Phase$/)
    expect(bands()[0]!.firstElementChild).toBe(band)
    leave(PHASE_BAND_HOLD_MS, PHASE_BAND_MS)
    expect(bands()).toHaveLength(0)
  })

  it('tu End Phase en un duelo (settle) espera: si pasa el turno no sale (entra «Cambio de turno» sin demora) y, si te quedás, entra entera', () => {
    const view = render(<PhaseBand cue={{ key: 1, phase: 'end', side: 'mine', settle: true }} />)

    expect(bands()).toHaveLength(0)
    advance(250)
    view.rerender(<PhaseBand cue={{ key: 2, phase: 'draw', side: 'theirs', turn: true }} />)
    expect(bands()).toHaveLength(1)
    expect(bands()[0]).toHaveTextContent(/^Cambio de turno$/)
    leave(TURN_BAND_HOLD_MS, TURN_BAND_MS)
    // La End Phase no vuelve: detrás de «Cambio de turno» va la fase del rival.
    expect(bands()[0]).toHaveTextContent(/^Draw Phase$/)
    expect(bands()[0]).toHaveAttribute('data-side', 'theirs')
    leave(PHASE_BAND_HOLD_MS, PHASE_BAND_MS)

    view.rerender(<PhaseBand cue={{ key: 3, phase: 'end', side: 'mine', settle: true }} />)
    advance(PHASE_BAND_SETTLE_MS)
    expect(bands()[0]).toHaveTextContent(/^End Phase$/)
    advance(PHASE_BAND_HOLD_MS + 50)
    expect(bands()).toHaveLength(1)
  })
})
