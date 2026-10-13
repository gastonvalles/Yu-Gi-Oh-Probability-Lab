import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { beginMascotActivity, computeMascotState, getMascotState, playMascotSocial, reactMascot, resetMascotForTests } from '../app/mascot'

describe('las mascotas: qué animación va según lo que pasa', () => {
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

  it('lo social (saludarse, chocarse) va después del paso y antes del reposo: no tapa nada de lo que la mascota está haciendo', () => {
    const base = { reaction: null, loading: false, computing: false, step: null }

    expect(computeMascotState({ ...base, social: 'waving' })).toBe('waving')
    expect(computeMascotState({ ...base, social: 'waving', step: 'categorization' })).toBe('review')
    expect(computeMascotState({ ...base, social: 'waving', computing: true })).toBe('running')
    expect(computeMascotState({ ...base, social: 'waving', loading: true })).toBe('waiting')
    expect(computeMascotState({ ...base, social: 'waving', reaction: 'failed' })).toBe('failed')
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

  it('una reacción de una mascota no es de las otras; una de todas, sí, y la que empezó después gana', () => {
    reactMascot('waving', 1000, 'cupsy')
    expect(getMascotState('cupsy')).toBe('waving')
    expect(getMascotState('winged-kuriboh')).toBe('idle')

    vi.advanceTimersByTime(10)
    reactMascot('jumping', 1000)
    expect(getMascotState('winged-kuriboh')).toBe('jumping')
    expect(getMascotState('cupsy')).toBe('jumping')

    vi.advanceTimersByTime(1100)
    expect(getMascotState('cupsy')).toBe('idle')
  })

  it('lo social se ve sólo en reposo y se va solo; la carga, el cálculo y una reacción lo tapan', () => {
    playMascotSocial('cupsy', 'waving', 1000)
    expect(getMascotState('cupsy')).toBe('waving')
    expect(getMascotState('winged-kuriboh')).toBe('idle')

    const endLab = beginMascotActivity('computing')
    expect(getMascotState('cupsy')).toBe('running')
    endLab()
    expect(getMascotState('cupsy')).toBe('waving')

    reactMascot('failed', 1000, 'cupsy')
    expect(getMascotState('cupsy')).toBe('failed')

    vi.advanceTimersByTime(1100)
    expect(getMascotState('cupsy')).toBe('idle')
  })
})
