import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { beginMascotActivity, computeMascotState, getMascotState, reactMascot, resetMascotForTests } from '../app/mascot'

describe('Cupsy: qué animación va según lo que pasa', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetMascotForTests()
  })

  afterEach(() => {
    resetMascotForTests()
    vi.useRealTimers()
  })

  it('una reacción gana a la carga, la carga al cálculo, el cálculo al paso, y si no, reposo', () => {
    const base = { reaction: null, loading: false, computing: false, step: null }

    expect(computeMascotState(base)).toBe('idle')
    expect(computeMascotState({ ...base, step: 'categorization' })).toBe('review')
    expect(computeMascotState({ ...base, step: 'categorization', computing: true })).toBe('running')
    expect(computeMascotState({ ...base, computing: true, loading: true })).toBe('waiting')
    expect(computeMascotState({ ...base, loading: true, reaction: 'failed' })).toBe('failed')
  })

  it('cuenta las actividades de fondo y terminar dos veces no rompe la cuenta', () => {
    const endCatalog = beginMascotActivity('loading')
    const endDeck = beginMascotActivity('loading')
    const endLab = beginMascotActivity('computing')

    expect(getMascotState()).toBe('waiting')
    endCatalog()
    expect(getMascotState()).toBe('waiting')
    endDeck()
    endDeck()
    expect(getMascotState()).toBe('running')
    endLab()
    expect(getMascotState()).toBe('idle')
  })

  it('una reacción dura lo que se pide y la última pisa a la anterior', () => {
    reactMascot('jumping', 1000)
    expect(getMascotState()).toBe('jumping')

    vi.advanceTimersByTime(500)
    reactMascot('failed', 1000)
    expect(getMascotState()).toBe('failed')

    vi.advanceTimersByTime(900)
    expect(getMascotState()).toBe('failed')
    vi.advanceTimersByTime(200)
    expect(getMascotState()).toBe('idle')
  })
})
