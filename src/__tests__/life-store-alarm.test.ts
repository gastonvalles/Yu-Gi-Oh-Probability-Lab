// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ROUND_LIMIT_MS } from '../app/life-calculator'
import { dispatchLife } from '../app/life-store'

const END_PATTERN = [300, 150, 300, 150, 600]
const EVERY_MS = 3000

const vibrate = vi.fn()
/** Cuántas veces vibró con la alarma del final (no cuenta el corte, `vibrate(0)`). */
const endCues = () => vibrate.mock.calls.filter(([pattern]) => Array.isArray(pattern) && pattern.join() === END_PATTERN.join()).length

/** Corre el reloj de la ronda hasta cero: la alarma del final suena la primera vez. */
const endRound = () => {
  dispatchLife({ type: 'timer-toggle', now: Date.now() })
  vi.advanceTimersByTime(ROUND_LIMIT_MS)
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  dispatchLife({ type: 'timer-reset' })
  vibrate.mockClear()
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
})

afterEach(() => {
  dispatchLife({ type: 'timer-reset' })
  vi.useRealTimers()
  Reflect.deleteProperty(navigator, 'vibrate')
})

describe('la alarma del final de la ronda', () => {
  it('suena y vibra tres veces y se calla sola: el teléfono no vibra para siempre', () => {
    endRound()
    expect(endCues()).toBe(1)

    vi.advanceTimersByTime(EVERY_MS)
    expect(endCues()).toBe(2)
    vi.advanceTimersByTime(EVERY_MS)
    expect(endCues()).toBe(3)

    vi.advanceTimersByTime(20 * EVERY_MS)
    expect(endCues()).toBe(3)
    // Al terminar sola no corta la última vibración.
    expect(vibrate).not.toHaveBeenCalledWith(0)
  })

  it('el primer toque en cualquier parte la corta y frena la vibración en curso', () => {
    endRound()
    vi.advanceTimersByTime(EVERY_MS)
    expect(endCues()).toBe(2)

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(vibrate).toHaveBeenCalledWith(0)

    vi.advanceTimersByTime(20 * EVERY_MS)
    expect(endCues()).toBe(2)
  })

  it('reiniciar el reloj la corta y no la revive', () => {
    endRound()
    dispatchLife({ type: 'timer-reset' })
    expect(vibrate).toHaveBeenCalledWith(0)

    vi.advanceTimersByTime(20 * EVERY_MS)
    expect(endCues()).toBe(1)
  })

  it('un toque cuando ya no suena no vuelve a cortar nada', () => {
    endRound()
    vi.advanceTimersByTime(2 * EVERY_MS)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))

    expect(vibrate).not.toHaveBeenCalledWith(0)
  })

  it('sin navigator.vibrate (iOS, escritorio) no falla al sonar ni al cortarla', () => {
    Reflect.deleteProperty(navigator, 'vibrate')

    expect(() => {
      endRound()
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      vi.advanceTimersByTime(5 * EVERY_MS)
    }).not.toThrow()
  })
})
