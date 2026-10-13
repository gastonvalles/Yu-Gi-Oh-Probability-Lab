import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getMascotState, resetMascotForTests } from '../app/mascot'
import { NEAR_AIR, REPLY_DELAY_MS, airBetween, forgetMascotBody, reportMascotBody, resetMascotInterplayForTests } from '../app/mascot-interplay'

const body = (x: number, y = 500, dragging = false) => ({ x, y, size: 104, dragging })

beforeEach(() => {
  vi.useFakeTimers()
  resetMascotForTests()
  resetMascotInterplayForTests()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('el aire entre dos mascotas', () => {
  it('es la distancia entre sus bordes: negativa si se pisan', () => {
    expect(airBetween(body(100), body(230))).toBeCloseTo(26)
    expect(airBetween(body(100), body(100))).toBe(-104)
  })
})

describe('mascotas que se juntan', () => {
  it('se saludan: la que llegó, ya, y la otra le contesta un instante después', () => {
    reportMascotBody('cupsy', body(100))
    reportMascotBody('winged-kuriboh', body(600))
    reportMascotBody('winged-kuriboh', body(230))

    expect(getMascotState('winged-kuriboh')).toBe('waving')
    expect(getMascotState('cupsy')).toBe('idle')

    vi.advanceTimersByTime(REPLY_DELAY_MS)
    expect(getMascotState('cupsy')).toBe('waving')

    vi.advanceTimersByTime(3000)
    expect(getMascotState('cupsy')).toBe('idle')
    expect(getMascotState('winged-kuriboh')).toBe('idle')
  })

  it('no se saludan si ya estaban juntas cuando aparecieron, ni dos veces en el mismo encuentro; al separarse y volver, sí', () => {
    reportMascotBody('cupsy', body(100))
    reportMascotBody('winged-kuriboh', body(212))
    vi.advanceTimersByTime(REPLY_DELAY_MS)
    expect(getMascotState('winged-kuriboh')).toBe('idle')
    expect(getMascotState('cupsy')).toBe('idle')

    // Se mueven sin separarse: es el mismo encuentro.
    reportMascotBody('winged-kuriboh', body(230))
    expect(getMascotState('winged-kuriboh')).toBe('idle')

    // Se separan y vuelven.
    reportMascotBody('winged-kuriboh', body(100 + 104 + NEAR_AIR + 30))
    reportMascotBody('winged-kuriboh', body(230))
    expect(getMascotState('winged-kuriboh')).toBe('waving')
  })

  it('si una se está arrastrando esperan a que la suelten para saludarse', () => {
    reportMascotBody('cupsy', body(100))
    reportMascotBody('winged-kuriboh', body(600))
    reportMascotBody('winged-kuriboh', body(230, 500, true))

    expect(getMascotState('winged-kuriboh')).toBe('idle')
    expect(getMascotState('cupsy')).toBe('idle')

    reportMascotBody('winged-kuriboh', body(230))
    expect(getMascotState('winged-kuriboh')).toBe('waving')
  })

  it('una que se va a descansar deja de contar: al volver a salir junto a otra, aparece, no se acerca', () => {
    reportMascotBody('cupsy', body(100))
    reportMascotBody('winged-kuriboh', body(600))
    reportMascotBody('winged-kuriboh', body(230))
    forgetMascotBody('winged-kuriboh')

    resetMascotForTests()
    reportMascotBody('winged-kuriboh', body(230))
    expect(getMascotState('winged-kuriboh')).toBe('idle')
    expect(getMascotState('cupsy')).toBe('idle')
  })
})

describe('mascotas que chocan', () => {
  it('a la que empuja otra que se arrastra no le gusta, y no se enoja más seguido que cada tres segundos', () => {
    reportMascotBody('cupsy', body(100))
    reportMascotBody('winged-kuriboh', body(600, 500, true))
    expect(getMascotState('cupsy')).toBe('idle')

    // La que se arrastra llega y la toca.
    reportMascotBody('winged-kuriboh', body(210, 500, true))
    expect(getMascotState('cupsy')).toBe('failed')
    expect(getMascotState('winged-kuriboh')).toBe('idle')

    vi.advanceTimersByTime(1600)
    expect(getMascotState('cupsy')).toBe('idle')

    // La siguen empujando enseguida: todavía no se vuelve a enojar.
    reportMascotBody('winged-kuriboh', body(208, 500, true))
    expect(getMascotState('cupsy')).toBe('idle')

    vi.advanceTimersByTime(1500)
    reportMascotBody('winged-kuriboh', body(206, 500, true))
    expect(getMascotState('cupsy')).toBe('failed')
  })

  it('si no se arrastra ninguna, estar pegadas no es un choque', () => {
    reportMascotBody('cupsy', body(100))
    reportMascotBody('winged-kuriboh', body(600))
    reportMascotBody('winged-kuriboh', body(208))

    expect(getMascotState('cupsy')).toBe('idle')
  })
})
