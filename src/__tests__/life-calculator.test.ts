// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import {
  LIFE_STORAGE_KEY,
  MAX_LP,
  ROUND_LIMIT_MS,
  createLifeState,
  formatClock,
  impliedZeros,
  interpretAmount,
  lifeReducer,
  readLifeState,
  timerElapsed,
  timerRemaining,
  writeLifeState,
  type Duelist,
  type LifeState,
} from '../app/life-calculator'

const run = (state: LifeState, ...actions: Parameters<typeof lifeReducer>[1][]) => actions.reduce(lifeReducer, state)
const change = (player: Duelist, delta: number) => ({ type: 'change', player, delta, now: 0 }) as const

describe('calculadora de LP', () => {
  it('resta y suma sin bajar de 0 ni pasar el tope', () => {
    const state = run(createLifeState(), change(1, -2500), change(0, 1000))

    expect(state.lp).toEqual([9000, 5500])
    expect(run(state, change(1, -9000)).lp[1]).toBe(0)
    expect(run(state, change(0, 5_000_000)).lp[0]).toBe(MAX_LP)
  })

  it('un cambio que no cambia nada no se registra', () => {
    const zero = run(createLifeState(), change(0, -8000))

    expect(run(zero, change(0, -500))).toBe(zero)
    expect(run(zero, { type: 'halve', player: 0, now: 0 })).toBe(zero)
  })

  it('registra cada cambio con el reloj del duelo y deshace el último', () => {
    const running = run(createLifeState(), { type: 'timer-toggle', now: 1000 })
    const state = run(running, { type: 'change', player: 1, delta: -3000, now: 61_000 }, { type: 'halve', player: 1, now: 90_000 })

    expect(state.log).toEqual([
      { at: 60_000, player: 1, delta: -3000, from: 8000, to: 5000 },
      { at: 89_000, player: 1, delta: -2500, from: 5000, to: 2500 },
    ])

    const undone = run(state, { type: 'undo' })

    expect(undone.lp).toEqual([8000, 5000])
    expect(undone.log).toHaveLength(1)
    // Sin registro no hay nada que deshacer.
    expect(run(createLifeState(), { type: 'undo' })).toEqual(createLifeState())
  })

  it('a la mitad redondea para abajo', () => {
    const odd = run(createLifeState(), change(0, -3995))

    expect(run(odd, { type: 'halve', player: 0, now: 0 }).lp[0]).toBe(2002)
  })

  it('como en Neuron: uno o dos dígitos sin ningún 0 son centenas; con un 0 o desde tres dígitos, literal', () => {
    const cases: [string, number][] = [
      ['', 0],
      ['5', 500],
      ['55', 5500],
      ['8', 800],
      ['25', 2500],
      ['50', 50],
      ['500', 500],
      ['100', 100],
      ['185', 185],
      ['015', 15],
      ['10', 10],
      ['05', 5],
      ['1000', 1000],
      ['0', 0],
      // La tecla «00» y la «000» suman ceros tecleados: 5 y «00» es 500, 5 y «000» es 5000.
      ['5' + '00', 500],
      ['5' + '000', 5000],
    ]

    expect(cases.map(([digits]) => interpretAmount(digits))).toEqual(cases.map(([, amount]) => amount))
  })

  it('los ceros que se sobreentienden: «00» sólo con uno o dos dígitos sin ningún 0', () => {
    expect(['', '5', '55', '50', '05', '0', '185', '1850'].map(impliedZeros)).toEqual(['', '00', '00', '', '', '', '', ''])
  })

  it('la ronda cuenta 50 minutos para atrás y acumula entre pausas', () => {
    expect(ROUND_LIMIT_MS).toBe(50 * 60 * 1000)

    const paused = run(createLifeState(), { type: 'timer-toggle', now: 0 }, { type: 'timer-toggle', now: 5000 })

    expect(paused.timer).toEqual({ running: false, startedAt: 0, elapsedMs: 5000 })
    expect(timerElapsed(paused.timer, 99_000)).toBe(5000)

    const resumed = run(paused, { type: 'timer-toggle', now: 10_000 })

    expect(timerElapsed(resumed.timer, 12_500)).toBe(7500)
    expect(timerRemaining(resumed.timer, 12_500)).toBe(ROUND_LIMIT_MS - 7500)
    // Pasado el límite no queda tiempo negativo.
    expect(timerRemaining(resumed.timer, 10_000 + ROUND_LIMIT_MS + 1)).toBe(0)
  })

  it('reiniciar el duelo deja el reloj como está; el reloj se reinicia aparte', () => {
    const state = run(createLifeState(), { type: 'timer-toggle', now: 0 }, change(0, -100))

    expect(run(state, { type: 'reset' })).toEqual({ ...createLifeState(), timer: state.timer })
    expect(run(state, { type: 'timer-reset' }).timer).toEqual(createLifeState().timer)
    expect(run(state, { type: 'timer-reset' }).lp).toEqual([7900, 8000])
  })

  it('formatea mm:ss y, pasada la hora, h:mm:ss', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(65_999)).toBe('01:05')
    expect(formatClock(3_600_000 + 61_000)).toBe('1:01:01')
  })

  describe('persistencia', () => {
    beforeEach(() => localStorage.clear())

    it('guarda y vuelve a leer el duelo', () => {
      const state = run(createLifeState(), { type: 'timer-toggle', now: 1 }, { type: 'change', player: 0, delta: -700, now: 2 })

      writeLifeState(state)

      expect(readLifeState()).toEqual(state)
    })

    it('con datos rotos o ajenos arranca un duelo nuevo', () => {
      localStorage.setItem(LIFE_STORAGE_KEY, '{"lp":[8000,-1],"log":[],"timer":{}}')
      expect(readLifeState()).toEqual(createLifeState())

      localStorage.setItem(LIFE_STORAGE_KEY, 'no es json')
      expect(readLifeState()).toEqual(createLifeState())
    })
  })
})
