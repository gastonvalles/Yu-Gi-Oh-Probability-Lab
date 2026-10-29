// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readLifeState, ROUND_LIMIT_MS, timerRemaining } from '../app/life-calculator'
import { CUE_AHEAD_S, CUE_PAUSE_MS, cuePeriod, dispatchLife, planRounds, ringRounds, testCue, type CueAudio } from '../app/life-store'

/**
 * Un audio falso con el reloj de los temporizadores falsos: anota cada tono programado (cuándo arranca y si lo cortaron en seco) y los cortes del volumen
 * de cada aviso. Un tono «sonó» si su hora ya pasó y no lo cortaron antes.
 */
const audio = vi.hoisted(() => {
  const fake = {
    notes: [] as { at: number; cutAt?: number }[],
    cuts: 0,
    state: 'running',
    get currentTime() {
      return Date.now() / 1000
    },
    destination: {},
    createOscillator: () => {
      const note: { at: number; cutAt?: number } = { at: Infinity }

      return {
        type: '',
        frequency: { value: 0 },
        connect: (node: unknown) => node,
        start: (at: number) => {
          note.at = at
          fake.notes.push(note)
        },
        // Con hora, es el final de la nota; sin hora, el corte en seco.
        stop: (at?: number) => {
          if (at === undefined) note.cutAt = fake.currentTime
        },
      }
    },
    createGain: () => ({ gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: (node: unknown) => node, disconnect: () => (fake.cuts += 1) }),
    resume: async () => {},
  }

  return fake
})

vi.mock('../app/audio', () => ({ audioContext: () => audio, unlockAudio: () => {} }))

/** Los tonos que ya sonaron. */
const sounded = () => audio.notes.filter((note) => note.at <= audio.currentTime && !(note.cutAt !== undefined && note.cutAt < note.at)).length
const END_PATTERN = [300, 150, 300, 150, 600]
/** Lo que dura una vuelta del final (s): cuatro tonos de 0,35 s y tres silencios de 0,1 s. */
const END_LENGTH = 1.7
const END_GAP = 0.1

const vibrate = vi.fn()
const endVibrations = () => vibrate.mock.calls.filter(([pattern]) => Array.isArray(pattern) && pattern.join() === END_PATTERN.join()).length
/** Arranca o pausa el reloj de la ronda. */
const toggle = () => dispatchLife({ type: 'timer-toggle', now: Date.now() })
const seconds = (s: number) => vi.advanceTimersByTime(s * 1000)

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  dispatchLife({ type: 'timer-reset' })
  Object.assign(audio, { notes: [], cuts: 0 })
  vibrate.mockClear()
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
})

afterEach(() => {
  dispatchLife({ type: 'timer-reset' })
  vi.useRealTimers()
  Reflect.deleteProperty(navigator, 'vibrate')
})

describe('el programador de vueltas (planRounds)', () => {
  it('en el loop del final cada vuelta empieza justo el silencio entre notas después de que termina la anterior; los avisos previos conservan su pausa', () => {
    expect(cuePeriod('end')).toBeCloseTo(END_LENGTH + END_GAP, 12)
    expect(cuePeriod('ten')).toBeCloseTo(0.48 + CUE_PAUSE_MS / 1000, 12)
    expect(cuePeriod('five')).toBeCloseTo(0.74 + CUE_PAUSE_MS / 1000, 12)

    const { starts } = planRounds({ anchor: 0.02, next: 0 }, cuePeriod('end'), Infinity, 0)

    for (let round = 1; round < starts.length; round += 1) {
      expect(starts[round] - (starts[round - 1] + END_LENGTH)).toBeCloseTo(END_GAP, 9)
    }
  })

  it('programa por delante lo que entra en la ventana y, al rellenar, sólo lo que falta: nunca de más', () => {
    const period = cuePeriod('end')
    const first = planRounds({ anchor: 0.02, next: 0 }, period, Infinity, 0)

    expect(first.starts).toHaveLength(Math.ceil((CUE_AHEAD_S - 0.02) / period))
    expect(planRounds(first.plan, period, Infinity, 0).starts).toEqual([])

    let plan = first.plan

    for (let now = 1; now < 600; now += 1) {
      plan = planRounds(plan, period, Infinity, now).plan
      // Lo programado que todavía no empezó nunca pasa de la ventana.
      expect(plan.anchor + (plan.next - 1) * period).toBeLessThan(now + CUE_AHEAD_S)
    }
  })

  it('mil vueltas rellenando cada segundo no se corren: la vuelta n empieza en anchor + n · period', () => {
    const period = cuePeriod('end')
    let plan = { anchor: 0.02, next: 0 }
    const starts: number[] = []

    for (let now = 0; starts.length < 1000; now += 1) {
      const step = planRounds(plan, period, Infinity, now)

      plan = step.plan
      starts.push(...step.starts)
    }

    starts.forEach((at, round) => expect(at).toBe(0.02 + round * period))
    expect(Math.abs(starts[999] - starts[0] - 999 * period)).toBeLessThan(1 / 48_000)
  })

  it('con una cantidad fija de vueltas no programa una más', () => {
    const { starts, plan } = planRounds({ anchor: 0.02, next: 0 }, cuePeriod('five'), 3, 0)

    expect(starts).toEqual([0.02, 0.02 + cuePeriod('five'), 0.02 + 2 * cuePeriod('five')])
    expect(planRounds(plan, cuePeriod('five'), 3, 10).starts).toEqual([])
  })

  it('si el relleno se frenó más que lo programado, sigue desde ahora: ni vueltas en el pasado ni encimadas', () => {
    const period = cuePeriod('end')
    const { starts } = planRounds({ anchor: 0.02, next: 50 }, period, Infinity, 300)

    expect(starts[0]).toBeCloseTo(300.02, 9)
    expect(starts[1] - starts[0]).toBeCloseTo(period, 9)
  })
})

describe('el reproductor de vueltas (ringRounds)', () => {
  it('callarlo corta en seco lo que suena y todo lo programado, y no queda nada por rellenar', () => {
    const stop = ringRounds('end', Infinity)

    seconds(10)
    const cuts = audio.cuts
    const before = sounded()

    stop()
    expect(audio.cuts).toBe(cuts + 1)
    expect(audio.notes.filter((note) => note.at > audio.currentTime).every((note) => note.cutAt !== undefined)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    seconds(120)
    expect(sounded()).toBe(before)
  })

  it('sin audio desbloqueado no suena pero vibra; si el toque llega con la alarma del final sonando, desde ahí suena', () => {
    let unlocked = false
    const stop = ringRounds('end', Infinity, () => (unlocked ? (audio as unknown as CueAudio) : null))

    seconds(10)
    expect(audio.notes).toHaveLength(0)
    expect(endVibrations()).toBe(3)

    unlocked = true
    seconds(1 + 2 * cuePeriod('end'))
    expect(sounded()).toBe(8)
    stop()
  })

  it('un aviso previo sin audio no queda esperando un toque', () => {
    ringRounds('ten', 2, () => null)
    seconds(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('los avisos del reloj de la ronda', () => {
  it('a los 10 minutos suena dos veces seguidas y a los 5, tres, con su pausa', () => {
    toggle()
    vi.advanceTimersByTime(ROUND_LIMIT_MS - 10 * 60_000)
    seconds(0.5)
    expect(sounded()).toBe(2)
    seconds(1)
    expect(sounded()).toBe(4)
    seconds(60)
    expect(sounded()).toBe(4)

    seconds(5 * 60 - 61.5)
    seconds(0.6)
    expect(sounded()).toBe(4 + 3)
    seconds(3)
    expect(sounded()).toBe(4 + 9)
    seconds(60)
    expect(sounded()).toBe(4 + 9)
  })

  it('pausar y reanudar antes de un aviso no lo pierde ni lo repite', () => {
    toggle()
    vi.advanceTimersByTime(ROUND_LIMIT_MS - 10 * 60_000 - 5000)
    toggle()
    seconds(60)
    toggle()
    seconds(5 + 2)
    expect(sounded()).toBe(4)

    // Pausar y reanudar después tampoco lo vuelve a disparar.
    toggle()
    toggle()
    seconds(60)
    expect(sounded()).toBe(4)
  })

  it('el final suena en loop hasta que se reinicia el reloj (un toque en cualquier parte ya no lo calla) y vibra sólo las tres primeras vueltas', () => {
    toggle()
    vi.advanceTimersByTime(ROUND_LIMIT_MS)
    const atEnd = sounded()

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    seconds(20 * cuePeriod('end'))
    expect((sounded() - atEnd) / 4).toBe(20)
    expect(endVibrations()).toBe(3)

    const cuts = audio.cuts
    dispatchLife({ type: 'timer-reset' })
    expect(audio.cuts).toBe(cuts + 1)
    expect(vibrate).toHaveBeenLastCalledWith(0)
    const silenced = sounded()
    seconds(10 * 60)
    expect(sounded()).toBe(silenced)
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
    const atEnd = sounded()
    seconds(5 * cuePeriod('end'))
    expect((sounded() - atEnd) / 4).toBe(5)
  })

  it('probar un aviso también da sus vueltas (el del final, tres) y no calla la alarma de verdad', () => {
    testCue('ten')
    seconds(10)
    expect(sounded()).toBe(4)

    testCue('end')
    seconds(60)
    expect(sounded()).toBe(4 + 3 * 4)

    toggle()
    vi.advanceTimersByTime(ROUND_LIMIT_MS)
    const atEnd = sounded()
    testCue('five')
    seconds(3 * cuePeriod('end'))
    expect(sounded() - atEnd).toBe(3 * 4 + 3 * 3)
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
