// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readLifeState, ROUND_LIMIT_MS, timerRemaining } from '../app/life-calculator'
import { CUE_PAUSE_MS, dispatchLife, repeatCue, testCue } from '../app/life-store'

/** Un audio falso: cuenta los tonos que arrancan y los cortes en seco (el volumen propio de cada vuelta que se desconecta). */
const audio = vi.hoisted(() => {
  const fake = {
    tones: 0,
    cuts: 0,
    state: 'running',
    currentTime: 0,
    destination: {},
    createOscillator: () => ({ type: '', frequency: { value: 0 }, connect: (node: unknown) => node, start: () => (fake.tones += 1), stop: () => {} }),
    createGain: () => ({ gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: (node: unknown) => node, disconnect: () => (fake.cuts += 1) }),
  }

  return fake
})

vi.mock('../app/audio', () => ({ audioContext: () => audio, unlockAudio: () => {} }))

/** Lo que dura una vuelta de cada aviso (sus tonos y los silencios entre ellos). */
const TEN_MS = 480
const FIVE_MS = 740
const END_MS = 1700
const END_PATTERN = [300, 150, 300, 150, 600]

const vibrate = vi.fn()
const endVibrations = () => vibrate.mock.calls.filter(([pattern]) => Array.isArray(pattern) && pattern.join() === END_PATTERN.join()).length
/** Arranca o pausa el reloj de la ronda. */
const toggle = () => dispatchLife({ type: 'timer-toggle', now: Date.now() })

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  dispatchLife({ type: 'timer-reset' })
  Object.assign(audio, { tones: 0, cuts: 0 })
  vibrate.mockClear()
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
})

afterEach(() => {
  dispatchLife({ type: 'timer-reset' })
  vi.useRealTimers()
  Reflect.deleteProperty(navigator, 'vibrate')
})

describe('el reproductor de avisos (repeatCue)', () => {
  const fakeSound = (ms: number) => {
    const rounds: number[] = []
    const cut = vi.fn()
    const play = () => {
      rounds.push(Date.now())
      return { ms, cut }
    }

    return { rounds, cut, play }
  }

  it('dos y tres vueltas seguidas: cada una empieza cuando termina la anterior, después de la pausa, y no hay una más', () => {
    for (const times of [2, 3]) {
      const sound = fakeSound(500)
      const t0 = Date.now()

      repeatCue(sound.play, times)
      vi.advanceTimersByTime(20_000)

      expect(sound.rounds.map((at) => at - t0)).toEqual(Array.from({ length: times }, (_, round) => round * (500 + CUE_PAUSE_MS)))
      expect(vi.getTimerCount()).toBe(0)
    }
  })

  it('sin parar hasta que se lo calla: callarlo corta la vuelta que suena y no queda nada programado', () => {
    const sound = fakeSound(1000)
    const stop = repeatCue(sound.play, Infinity)

    vi.advanceTimersByTime(10 * (1000 + CUE_PAUSE_MS))
    expect(sound.rounds).toHaveLength(11)

    stop()
    expect(sound.cut).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(60_000)
    expect(sound.rounds).toHaveLength(11)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('callarlo después de la última vuelta no corta nada', () => {
    const sound = fakeSound(500)
    const stop = repeatCue(sound.play, 2)

    vi.advanceTimersByTime(5000)
    stop()
    expect(sound.cut).not.toHaveBeenCalled()
  })
})

describe('los avisos del reloj de la ronda', () => {
  it('a los 10 minutos suena dos veces seguidas y a los 5, tres', () => {
    toggle()
    vi.advanceTimersByTime(ROUND_LIMIT_MS - 10 * 60_000)
    expect(audio.tones).toBe(2)
    vi.advanceTimersByTime(TEN_MS + CUE_PAUSE_MS)
    expect(audio.tones).toBe(4)
    vi.advanceTimersByTime(60_000)
    expect(audio.tones).toBe(4)

    vi.advanceTimersByTime(4 * 60_000 - TEN_MS - CUE_PAUSE_MS)
    expect(audio.tones).toBe(4 + 3)
    vi.advanceTimersByTime(2 * (FIVE_MS + CUE_PAUSE_MS))
    expect(audio.tones).toBe(4 + 9)
    vi.advanceTimersByTime(60_000)
    expect(audio.tones).toBe(4 + 9)
  })

  it('pausar y reanudar antes de un aviso no lo pierde ni lo repite', () => {
    toggle()
    vi.advanceTimersByTime(ROUND_LIMIT_MS - 10 * 60_000 - 5000)
    toggle()
    vi.advanceTimersByTime(60_000)
    toggle()
    vi.advanceTimersByTime(5000 + TEN_MS + CUE_PAUSE_MS)
    expect(audio.tones).toBe(4)

    // Pausar y reanudar después tampoco lo vuelve a disparar.
    toggle()
    toggle()
    vi.advanceTimersByTime(60_000)
    expect(audio.tones).toBe(4)
  })

  it('el final suena en loop hasta que se reinicia el reloj (un toque en cualquier parte ya no lo calla) y vibra sólo las tres primeras vueltas', () => {
    toggle()
    vi.advanceTimersByTime(ROUND_LIMIT_MS)
    const atEnd = audio.tones

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    vi.advanceTimersByTime(20 * (END_MS + CUE_PAUSE_MS))
    expect((audio.tones - atEnd) / 4).toBe(20)
    expect(endVibrations()).toBe(3)

    const cuts = audio.cuts
    dispatchLife({ type: 'timer-reset' })
    expect(audio.cuts).toBe(cuts + 1)
    expect(vibrate).toHaveBeenLastCalledWith(0)
    const silenced = audio.tones
    vi.advanceTimersByTime(10 * 60_000)
    expect(audio.tones).toBe(silenced)
  })

  it('al llegar el final el reloj queda parado en cero, aunque el temporizador salte un milisegundo antes', () => {
    const real = Date.now

    toggle()
    vi.advanceTimersByTime(ROUND_LIMIT_MS - 1)

    const early = vi.spyOn(Date, 'now').mockImplementation(() => real() - 1)

    vi.advanceTimersByTime(1)
    early.mockRestore()

    const { timer } = readLifeState()

    expect(timer.running).toBe(false)
    expect(timerRemaining(timer, Date.now())).toBe(0)
  })

  it('reiniciar y volver a llegar al final no suma una alarma encima de la otra', () => {
    toggle()
    vi.advanceTimersByTime(ROUND_LIMIT_MS)
    dispatchLife({ type: 'timer-reset' })

    toggle()
    vi.advanceTimersByTime(ROUND_LIMIT_MS)
    const atEnd = audio.tones
    vi.advanceTimersByTime(5 * (END_MS + CUE_PAUSE_MS))
    expect((audio.tones - atEnd) / 4).toBe(5)
  })

  it('probar un aviso también da sus vueltas (el del final, tres) y no calla la alarma de verdad', () => {
    testCue('ten')
    vi.advanceTimersByTime(10_000)
    expect(audio.tones).toBe(4)

    testCue('end')
    vi.advanceTimersByTime(60_000)
    expect(audio.tones).toBe(4 + 3 * 4)

    toggle()
    vi.advanceTimersByTime(ROUND_LIMIT_MS)
    const atEnd = audio.tones
    testCue('five')
    vi.advanceTimersByTime(3 * (END_MS + CUE_PAUSE_MS))
    expect(audio.tones - atEnd).toBe(3 * 4 + 3 * 3)
  })

  it('sin navigator.vibrate (iOS, escritorio) no falla al sonar ni al cortarla', () => {
    Reflect.deleteProperty(navigator, 'vibrate')

    expect(() => {
      toggle()
      vi.advanceTimersByTime(ROUND_LIMIT_MS + 5000)
      dispatchLife({ type: 'timer-reset' })
    }).not.toThrow()
  })
})
