import { describe, expect, it } from 'vitest'

import { mainRole, per100Delta } from '../app/lab-change'

describe('lo que el Lab dice de un cambio de una carta', () => {
  it('el ▲ / ▼ es la diferencia de los enteros «de cada 100» que se ven, y no inventa una que el anillo no muestra', () => {
    expect(per100Delta(0.8129, 0.8456)).toBe(4) // 81 → 85
    expect(per100Delta(0.8456, 0.8129)).toBe(-4)
    expect(per100Delta(0.5, 0.5)).toBe(0)
    // «>99» y «>99», «<1» y «<1»: se ven iguales, así que no hay ▲.
    expect(per100Delta(0.996, 0.998)).toBe(0)
    expect(per100Delta(0.003, 0.004)).toBe(0)
    // De «<1» a «1» sí se ve.
    expect(per100Delta(0.004, 0.006)).toBe(1)
  })

  it('cada carta del cambio se nombra por lo que hace en el deck, no por su primer rol guardado', () => {
    // Fire King Island tiene Searcher primero, pero entra como Starter.
    expect(mainRole(['searcher', 'starter', 'enabler', 'payoff', 'extender'])).toBe('starter')
    // Una Mulcharmy es una Handtrap aunque también robe.
    expect(mainRole(['handtrap', 'draw', 'floodgate', 'disruption', 'payoff'])).toBe('handtrap')
    expect(mainRole(['disruption', 'extender'])).toBe('extender')
    expect(mainRole(['recovery'])).toBe('recovery')
    expect(mainRole([])).toBeNull()
  })
})
