import { describe, expect, it } from 'vitest'

import { buildCardSearchActiveFilterCount, DEFAULT_CARD_SEARCH_FILTERS, hasLocalCardSearchCriteria } from '../app/card-search'
import { parseSearchResponse } from '../ygoprodeck/parser'
import { POOL_BITS, readRelease } from '../ygoprodeck/release'

describe('readRelease', () => {
  it('el año es el de la primera salida, en el TCG o en el OCG, y los formatos son una máscara de bits', () => {
    expect(readRelease([{ tcg_date: '2002-03-08', ocg_date: '2001-12-01', formats: ['TCG', 'OCG', 'Master Duel'] }])).toEqual({
      year: 2001,
      pools: POOL_BITS.tcg | POOL_BITS.ocg | POOL_BITS['master-duel'],
    })
    expect(readRelease([{ tcg_date: '2019-07-11', formats: ['TCG', 'Duel Links', 'Speed Duel'] }])).toEqual({
      year: 2019,
      pools: POOL_BITS.tcg | POOL_BITS['duel-links'] | POOL_BITS['speed-duel'],
    })
  })

  it('las listas de prohibidas (Edison, GOAT, Common Charity) no son un pool de cartas', () => {
    expect(readRelease([{ tcg_date: '2004-01-01', formats: ['Edison', 'GOAT', 'OCG GOAT', 'Common Charity'] }])).toEqual({ year: 2004, pools: 0 })
  })

  it('una carta sin fechas (una Ficha) queda sin año, y sin `misc_info` no hay nada que leer', () => {
    expect(readRelease([{ formats: ['Common Charity'] }])).toEqual({ year: null, pools: 0 })
    expect(readRelease([{ tcg_date: 'sin fecha', ocg_date: '', formats: [] }])).toEqual({ year: null, pools: 0 })
    // El juego salió en 1999: la fecha de relleno 1990-01-01 de la API no es una salida.
    expect(readRelease([{ tcg_date: '1990-01-01', ocg_date: '1990-01-01', formats: ['TCG'] }])).toEqual({ year: null, pools: POOL_BITS.tcg })
    expect(readRelease(undefined)).toBeNull()
    expect(readRelease([])).toBeNull()
    expect(readRelease('basura')).toBeNull()
  })
})

describe('el parser lee la escala, el año y los formatos', () => {
  const entry = (extra: Record<string, unknown>) => ({ id: 1, name: 'Carta', type: 'Effect Monster', frameType: 'effect', desc: 'Texto', ...extra })
  const parse = (extra: Record<string, unknown>) => parseSearchResponse({ data: [entry(extra)] }).results[0]!

  it('la escala sale de `scale` (también la 0), y el año y los formatos de `misc_info`', () => {
    expect(parse({ frameType: 'effect_pendulum', scale: 0, misc_info: [{ tcg_date: '2014-05-01', formats: ['TCG'] }] })).toMatchObject({ scale: 0, year: 2014, pools: POOL_BITS.tcg })
  })

  it('sin esos datos la carta no lleva los campos (no son null: no se sabe)', () => {
    const card = parse({})

    expect(card).not.toHaveProperty('scale')
    expect(card).not.toHaveProperty('year')
    expect(card).not.toHaveProperty('pools')
  })
})

describe('los filtros nuevos en la búsqueda', () => {
  it('cuentan como filtros que sólo se resuelven con los datos de la carta (hace falta el catálogo) y suman uno cada grupo', () => {
    const range = { min: '1', max: '' }

    for (const updates of [{ pools: ['tcg'] }, { scale: range }, { year: range }]) {
      expect(hasLocalCardSearchCriteria({ ...DEFAULT_CARD_SEARCH_FILTERS, ...updates }, 'tcg')).toBe(true)
    }

    expect(buildCardSearchActiveFilterCount({ ...DEFAULT_CARD_SEARCH_FILTERS, pools: ['tcg', 'ocg'], scale: range, year: range }, 'tcg')).toBe(3)
    expect(buildCardSearchActiveFilterCount(DEFAULT_CARD_SEARCH_FILTERS, 'tcg')).toBe(0)
  })
})
