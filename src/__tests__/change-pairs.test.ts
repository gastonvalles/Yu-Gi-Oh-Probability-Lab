import { describe, expect, it } from 'vitest'

import { pairChanges, type MainChange } from '../app/change-pairs'
import { copies, fillerCards } from './support/deck-fixtures'

// El ejemplo de las maquetas de Comparar: A es un deck Fire King; B saca 2 Purulia y 1 Dominus al Side, sube 2 Ghost Ogre y 1 Rangbali
// del Side, y cambia 1 Jurrac Megalo (sale del deck) por una 3.ª Fire King Island (nueva).
const purulia = (n: number) => copies(101, 'Mulcharmy Purulia', n, ['handtrap', 'draw'], { origin: 'non_engine' })
const dominus = (n: number) => copies(102, 'Dominus Impulse', n, ['handtrap'], { origin: 'non_engine' })
const megalo = (n: number) => copies(103, 'Jurrac Megalo', n, ['draw'], { origin: 'non_engine' })
const ogre = (n: number) => copies(201, 'Ghost Ogre & Snow Rabbit', n, ['handtrap'], { origin: 'non_engine' })
const rangbali = (n: number) => copies(202, 'Fire King Avatar Rangbali', n, ['extender'])
const island = (n: number) => copies(203, 'Fire King Island', n, ['starter'])
const solemn = (n: number) => copies(301, 'Solemn Accusation', n, ['disruption'], { origin: 'non_engine' })
const extra = copies(400, 'Fire King Sanctuary Link', 2, [])

const A = {
  main: [...purulia(2), ...dominus(1), ...megalo(1), ...island(2), ...fillerCards(34)],
  extra,
  side: [...ogre(2), ...rangbali(1), ...solemn(1)],
}
const B = {
  main: [...ogre(2), ...rangbali(1), ...island(3), ...fillerCards(34)],
  extra,
  side: [...purulia(2), ...dominus(1), ...solemn(1)],
}

const describeChange = (change: MainChange) =>
  `${change.copies}× ${change.out?.card.name ?? '—'} (${change.out?.place ?? '—'}) → ${change.in?.card.name ?? '—'} (${change.in?.place ?? '—'})`

describe('pairChanges', () => {
  it('empareja lo que sale del Main con lo que entra, como un jugador: los cambios con el Side y lo nuevo por lo que se va', () => {
    const { main, identical } = pairChanges(A, B)

    expect(identical).toBe(false)
    expect(main.map(describeChange)).toEqual([
      '1× Dominus Impulse (side) → Ghost Ogre & Snow Rabbit (side)',
      '1× Mulcharmy Purulia (side) → Ghost Ogre & Snow Rabbit (side)',
      '1× Mulcharmy Purulia (side) → Fire King Avatar Rangbali (side)',
      '1× Jurrac Megalo (outside) → Fire King Island (outside)',
    ])
    expect(main.every((change) => change.out && change.in && !change.pending)).toBe(true)
  })

  it('dice cuántas copias quedan y cuántas hay después («nueva · 3.ª copia»)', () => {
    const island = pairChanges(A, B).main.find((change) => change.in?.card.name === 'Fire King Island')!

    expect(island.in).toMatchObject({ copiesA: 2, copiesB: 3, place: 'outside' })
    expect(island.out).toMatchObject({ copiesA: 1, copiesB: 0, place: 'outside' })
  })

  it('junta las copias del mismo cambio en uno solo', () => {
    const a = { main: [...purulia(2), ...fillerCards(38)], extra: [], side: [] }
    const b = { main: [...ogre(2), ...fillerCards(38)], extra: [], side: [] }

    expect(pairChanges(a, b).main.map(describeChange)).toEqual(['2× Mulcharmy Purulia (outside) → Ghost Ogre & Snow Rabbit (outside)'])
  })

  it('antes que el orden, la familia: un starter que sale se cambia por el starter que entra', () => {
    const a = { main: [...copies(1, 'A starter', 1, ['starter']), ...copies(2, 'B brick', 1, ['brick'], { origin: 'non_engine' }), ...fillerCards(38)], extra: [], side: [] }
    const b = { main: [...copies(3, 'Z starter', 1, ['starter']), ...copies(4, 'Y brick', 1, ['brick'], { origin: 'non_engine' }), ...fillerCards(38)], extra: [], side: [] }

    expect(pairChanges(a, b).main.map(describeChange)).toEqual([
      '1× A starter (outside) → Z starter (outside)',
      '1× B brick (outside) → Y brick (outside)',
    ])
  })

  it('si los decks no miden lo mismo, lo que sobra queda sin pareja', () => {
    const a = { main: fillerCards(40), extra: [], side: [] }
    const b = { main: [...fillerCards(40), ...island(1)], extra: [], side: [] }

    expect(pairChanges(a, b).main.map(describeChange)).toEqual(['1× — (—) → Fire King Island (outside)'])
  })

  it('resume el Extra y el Side: qué baja, qué sube, qué sale, y lo que no cambia', () => {
    const { zones } = pairChanges(A, B)

    expect(zones.extra.unchanged).toBe(true)
    expect(zones.side).toMatchObject({ sizeA: 4, sizeB: 4, outCopies: 3, inCopies: 3, unchanged: false })
    expect(zones.side.in.map((move) => `${move.copies} ${move.card.name} ${move.from}`)).toEqual(['2 Mulcharmy Purulia main', '1 Dominus Impulse main'])
    expect(zones.side.out.map((move) => `${move.copies} ${move.card.name} ${move.to}`)).toEqual(['2 Ghost Ogre & Snow Rabbit main', '1 Fire King Avatar Rangbali main'])
    expect(zones.main).toMatchObject({ sizeA: 40, sizeB: 40, outCopies: 4, inCopies: 4 })
  })

  it('marca como pendiente un cambio con una carta sin clasificar (su efecto se mide al clasificarla)', () => {
    const a = { main: [...purulia(1), ...fillerCards(39)], extra: [], side: [] }
    const b = { main: [...copies(5, 'Bystial Druiswurm', 1, [], { origin: null }), ...fillerCards(39)], extra: [], side: [] }

    expect(pairChanges(a, b).main[0]?.pending).toBe(true)
  })

  it('es determinista y no depende del orden de las cartas', () => {
    const shuffled = { ...B, main: [...B.main].reverse(), side: [...B.side].reverse() }

    expect(pairChanges(A, shuffled).main.map((change) => change.key)).toEqual(pairChanges(A, B).main.map((change) => change.key))
    expect(pairChanges(A, A)).toMatchObject({ identical: true, main: [] })
  })
})
