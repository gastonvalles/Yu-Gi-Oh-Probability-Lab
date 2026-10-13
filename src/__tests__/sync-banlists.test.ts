import { describe, expect, it } from 'vitest'

import { banlistsFile, buildBanlists, buildCardLookup, listDate, parseLflist, regionOf } from '../../scripts/sync-banlists.mjs'

const SAMPLE = `#[2026.10][2026.9 TCG]
#[2026.5 TCG][2013.3.1]
!2026.10
#forbidden
20292186 0 --アーティファクト－デスサイズ
#limit
4280258 1 --Apollousa
#semi limit
62320425 2 --Agido
!2026.9 TCG
#forbidden
4280258 0 --Apollousa, Bow of the Goddess
4280259 0 --Apollousa, Bow of the Goddess
#limit
#semi limit
99999999 2 --Carta desconocida

!2013.10.11 TCG
#forbidden
62320425 0 --Agido
!2013.3.1
#forbidden
20292186 0 --Death Scythe
`

describe('scripts/sync-banlists.mjs: de lflist.conf a las banlists', () => {
  it('la fecha de una lista sale de su encabezado, con el mes siempre de dos dígitos y el día sólo si lo trae', () => {
    expect(listDate('2026.9 TCG')).toBe('2026-09')
    expect(listDate('2026.10')).toBe('2026-10')
    expect(listDate('2013.10.11 TCG')).toBe('2013-10-11')
    expect(listDate('2013.3.1')).toBe('2013-03-01')
    expect(listDate('Goat Format')).toBeNull()
    expect(listDate('')).toBeNull()
  })

  it('es del TCG si el encabezado lo dice o es una de las cuatro primeras (sin etiqueta); si no, del OCG', () => {
    expect(regionOf('2026.9 TCG')).toBe('tcg')
    expect(regionOf('2014.1.1 TCG')).toBe('tcg')
    expect(regionOf('2011.9.1')).toBe('tcg')
    expect(regionOf('2013.3.1')).toBe('tcg')
    expect(regionOf('2026.10')).toBe('ocg')
    expect(regionOf('2013.9')).toBe('ocg')
  })

  it('lee cada lista con sus prohibidas (0), limitadas (1) y semi-limitadas (2), ignorando comentarios y líneas en blanco', () => {
    const lists = parseLflist(SAMPLE)

    expect(lists.map((list) => [list.header, list.region, list.date])).toEqual([
      ['2026.10', 'ocg', '2026-10'],
      ['2026.9 TCG', 'tcg', '2026-09'],
      ['2013.10.11 TCG', 'tcg', '2013-10-11'],
      ['2013.3.1', 'tcg', '2013-03-01'],
    ])
    expect(lists[0]).toMatchObject({ forbidden: [20292186], limited: [4280258], semiLimited: [62320425] })
    expect(lists[1]).toMatchObject({ forbidden: [4280258, 4280259], limited: [], semiLimited: [99999999] })
    expect(parseLflist('')).toEqual([])
    // Un encabezado que no es una fecha (un formato como Goat) no abre una lista: sus cartas no se mezclan en la anterior.
    expect(parseLflist('!2026.9 TCG\n1 0 --A\n!Goat\n2 0 --B\n').map((list) => list.forbidden)).toEqual([[1]])
  })

  it('el catálogo lleva de cada código de imagen (el de la carta y los de sus artes alternativos) a la carta', () => {
    const lookup = buildCardLookup([
      { id: 4280258, name: 'Apollousa, Bow of the Goddess', card_images: [{ id: 4280258 }, { id: 4280259 }] },
      { id: 20292186, name: 'Artifact Scythe' },
    ])

    expect(lookup.get(4280259)).toEqual({ id: 4280258, name: 'Apollousa, Bow of the Goddess' })
    expect(lookup.get(4280258)).toEqual({ id: 4280258, name: 'Apollousa, Bow of the Goddess' })
    expect(lookup.get(20292186)).toEqual({ id: 20292186, name: 'Artifact Scythe' })
    expect(lookup.has(1)).toBe(false)
  })

  it('las listas quedan con cada carta una vez (aunque tenga dos códigos), por id, y las más viejas primero en cada región; lo desconocido se descarta', () => {
    const lookup = buildCardLookup([
      { id: 4280258, name: 'Apollousa, Bow of the Goddess', card_images: [{ id: 4280258 }, { id: 4280259 }] },
      { id: 20292186, name: 'Artifact Scythe' },
      { id: 62320425, name: 'Agido the Ancient Sentry' },
    ])
    const { lists, names, unknown } = buildBanlists(parseLflist(SAMPLE), lookup)

    expect(lists.map((list: { region: string; date: string }) => [list.region, list.date])).toEqual([
      ['ocg', '2026-10'],
      ['tcg', '2013-03-01'],
      ['tcg', '2013-10-11'],
      ['tcg', '2026-09'],
    ])
    expect(lists[3]).toMatchObject({ forbidden: [4280258], semiLimited: [] })
    expect([...unknown]).toEqual([99999999])
    expect([...names]).toEqual([
      [4280258, 'Apollousa, Bow of the Goddess'],
      [20292186, 'Artifact Scythe'],
      [62320425, 'Agido the Ancient Sentry'],
    ])
  })

  it('el archivo trae una carta por línea y una lista por línea, y es JSON válido', () => {
    const text = banlistsFile(
      {
        lists: [{ region: 'tcg', date: '2026-09', forbidden: [2, 5], limited: [3], semiLimited: [] }],
        names: new Map([[2, 'Dos'], [3, 'Tres "con comillas"'], [5, 'Cinco']]),
      },
      '2026-10-13',
    )

    expect(text.split('\n')).toEqual([
      '{',
      '"fetchedAt":"2026-10-13",',
      '"cards":{',
      '"2":"Dos",',
      '"3":"Tres \\"con comillas\\"",',
      '"5":"Cinco"',
      '},',
      '"lists":[',
      '{"region":"tcg","date":"2026-09","forbidden":[2,5],"limited":[3],"semiLimited":[]}',
      ']',
      '}',
      '',
    ])
    expect(JSON.parse(text).cards['3']).toBe('Tres "con comillas"')
  })
})
