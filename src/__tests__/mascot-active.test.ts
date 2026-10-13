// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MAX_ACTIVE_MASCOTS,
  activeMascotIds,
  freeMascotSlots,
  getMascotState,
  isMascotActive,
  mascotPositionKey,
  resetMascotChoiceForTests,
  resetMascotForTests,
  restMascot,
  sanitizeActiveMascots,
  setMaxActiveMascotsForTests,
  summonMascot,
  withMascot,
} from '../app/mascot'

beforeEach(() => {
  localStorage.clear()
  resetMascotChoiceForTests()
  resetMascotForTests()
})

describe('quiénes están afuera', () => {
  it('sumar una mascota la pone al final, sin repetirla, y no pasa del máximo', () => {
    expect(MAX_ACTIVE_MASCOTS).toBe(3)
    expect(withMascot(['cupsy'], 'winged-kuriboh')).toEqual(['cupsy', 'winged-kuriboh'])
    expect(withMascot(['cupsy'], 'cupsy')).toEqual(['cupsy'])
    // Con el máximo ya afuera, otra no entra.
    expect(withMascot(['cupsy'], 'winged-kuriboh', 1)).toEqual(['cupsy'])
  })

  it('lo guardado se limpia: sólo mascotas que existen, sin repetir y hasta el máximo', () => {
    expect(sanitizeActiveMascots(['winged-kuriboh', 'no-existe', 'cupsy', 'winged-kuriboh'])).toEqual(['winged-kuriboh', 'cupsy'])
    expect(sanitizeActiveMascots(['cupsy', 'winged-kuriboh'], 1)).toEqual(['cupsy'])
    expect(sanitizeActiveMascots('cupsy')).toEqual([])
    expect(sanitizeActiveMascots(null)).toEqual([])
  })

  it('sacar una mascota la suma a las de afuera, saluda al llegar y se acuerda; mandarla a descansar la saca', () => {
    expect(activeMascotIds()).toEqual(['cupsy'])
    expect(summonMascot('winged-kuriboh')).toBe(true)

    expect(activeMascotIds()).toEqual(['cupsy', 'winged-kuriboh'])
    expect(isMascotActive('winged-kuriboh')).toBe(true)
    expect(getMascotState('winged-kuriboh')).toBe('waving')
    expect(getMascotState('cupsy')).toBe('idle')
    expect(JSON.parse(localStorage.getItem('ygo-lab:mascots')!)).toEqual(['cupsy', 'winged-kuriboh'])

    restMascot('cupsy')
    expect(activeMascotIds()).toEqual(['winged-kuriboh'])
    expect(JSON.parse(localStorage.getItem('ygo-lab:mascots')!)).toEqual(['winged-kuriboh'])

    // Mandar a descansar a una que ya descansa no hace nada.
    restMascot('cupsy')
    expect(activeMascotIds()).toEqual(['winged-kuriboh'])
  })

  it('con el máximo afuera no sale otra hasta que una descansa', () => {
    setMaxActiveMascotsForTests(1)

    expect(freeMascotSlots()).toBe(0)
    expect(summonMascot('winged-kuriboh')).toBe(false)
    expect(activeMascotIds()).toEqual(['cupsy'])

    restMascot('cupsy')
    expect(freeMascotSlots()).toBe(1)
    expect(summonMascot('winged-kuriboh')).toBe(true)
    // Sacar a una que ya está afuera es verdadero y no cambia nada.
    expect(summonMascot('winged-kuriboh')).toBe(true)
    expect(activeMascotIds()).toEqual(['winged-kuriboh'])
  })

  it('las tres pueden estar afuera a la vez: es justo el máximo', () => {
    expect(summonMascot('winged-kuriboh')).toBe(true)
    expect(summonMascot('blue-eyes-white-dragon')).toBe(true)

    expect(activeMascotIds()).toEqual(['cupsy', 'winged-kuriboh', 'blue-eyes-white-dragon'])
    expect(freeMascotSlots()).toBe(0)
  })

  it('cada mascota recuerda su propia posición', () => {
    expect(new Set((['cupsy', 'winged-kuriboh', 'blue-eyes-white-dragon'] as const).map(mascotPositionKey)).size).toBe(3)
  })
})

describe('lo que se guardaba cuando había una sola mascota', () => {
  const load = async () => {
    vi.resetModules()
    return import('../app/mascot')
  }

  it('la que había sigue afuera, en el mismo lugar que la habían dejado, y lo viejo se borra al primer cambio', async () => {
    localStorage.setItem('ygo-lab:mascot-position', JSON.stringify({ x: 40, y: 200 }))

    const mascot = await load()

    expect(mascot.activeMascotIds()).toEqual(['cupsy'])
    expect(JSON.parse(localStorage.getItem(mascot.mascotPositionKey('cupsy'))!)).toEqual({ x: 40, y: 200 })

    mascot.summonMascot('winged-kuriboh')
    expect(localStorage.getItem('ygo-lab:mascot-position')).toBeNull()
    expect(localStorage.getItem('ygo-lab:mascot')).toBeNull()
  })

  it('si la habían mandado a descansar, no sale ninguna', async () => {
    localStorage.setItem('ygo-lab:mascot', 'off')

    expect((await load()).activeMascotIds()).toEqual([])
  })

  it('una lista guardada a mano con basura se limpia, y una lista vacía es "todas descansando"', async () => {
    localStorage.setItem('ygo-lab:mascots', JSON.stringify(['winged-kuriboh', 'fantasma', 'winged-kuriboh']))
    expect((await load()).activeMascotIds()).toEqual(['winged-kuriboh'])

    localStorage.setItem('ygo-lab:mascots', '[]')
    expect((await load()).activeMascotIds()).toEqual([])

    localStorage.setItem('ygo-lab:mascots', 'no es json')
    expect((await load()).activeMascotIds()).toEqual(['cupsy'])
  })
})
