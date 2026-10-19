import { describe, expect, it } from 'vitest'

import {
  MAX_CARDS,
  MAX_TIERS,
  TIER_PALETTE,
  addCards,
  addTier,
  countCards,
  duplicateList,
  listToText,
  moveCard,
  moveTier,
  newList,
  parseStore,
  placeOf,
  removeCard,
  removeTier,
  resetPlacements,
  updateTier,
  type MakerCard,
} from '../app/tierlist-maker'

const card = (id: number, name = `Carta ${id}`): MakerCard => ({ id, name, image: `https://images.ygoprodeck.com/images/cards_small/${id}.jpg` })
const withCards = () => addCards(newList('Mi lista'), [card(1, 'Ash Blossom'), card(2, 'Maxx "C"'), card(3)])
const tierId = (list: ReturnType<typeof newList>, label: string) => list.tiers.find((tier) => tier.label === label)?.id ?? ''

describe('una lista nueva', () => {
  it('arranca con las filas S a F de siempre, cada una con su color, y vacía', () => {
    const list = newList('Mi lista')

    expect(list.tiers.map((tier) => tier.label)).toEqual(['S', 'A', 'B', 'C', 'D', 'E', 'F'])
    expect(list.tiers[0]?.color).toBe('#ff7f7f')
    expect(list.tiers[6]?.color).toBe('#ff7fff')
    expect(list.tiers.every((tier) => tier.cards.length === 0)).toBe(true)
    expect(countCards(list)).toBe(0)
  })
})

describe('las cartas', () => {
  it('las nuevas van a la bandeja, sin repetir, y hay un tope', () => {
    const list = addCards(withCards(), [card(2), card(4)])

    expect(list.pool).toEqual([1, 2, 3, 4])
    expect(countCards(list)).toBe(4)

    const many = addCards(newList('x'), Array.from({ length: MAX_CARDS + 20 }, (_, index) => card(index + 1)))

    expect(countCards(many)).toBe(MAX_CARDS)
  })

  it('se mueven a una fila (al final, o antes de otra carta) y de ahí a otra o a la bandeja; siempre en un solo lugar', () => {
    let list = withCards()
    const s = tierId(list, 'S')
    const a = tierId(list, 'A')

    list = moveCard(list, 1, { kind: 'tier', id: s })
    list = moveCard(list, 2, { kind: 'tier', id: s })
    list = moveCard(list, 3, { kind: 'tier', id: s }, 1)

    expect(list.tiers[0]?.cards).toEqual([3, 1, 2])
    expect(list.pool).toEqual([])

    list = moveCard(list, 1, { kind: 'tier', id: a })
    expect(placeOf(list, 1)).toEqual({ kind: 'tier', id: a })
    expect(list.tiers[0]?.cards).toEqual([3, 2])

    list = moveCard(list, 3, { kind: 'pool' })
    expect(list.pool).toEqual([3])
    expect(placeOf(list, 3)).toEqual({ kind: 'pool' })
  })

  it('mover una carta que no es de la lista, o a una fila que no existe, no cambia nada; ordenar dentro de la misma fila funciona', () => {
    const list = withCards()
    const s = tierId(list, 'S')

    expect(moveCard(list, 99, { kind: 'tier', id: s })).toBe(list)
    expect(moveCard(list, 1, { kind: 'tier', id: 'no-existe' })).toBe(list)

    const ranked = ['1', '2', '3'].reduce((current, id) => moveCard(current, Number(id), { kind: 'tier', id: s }), list)
    const reordered = moveCard(ranked, 3, { kind: 'tier', id: s }, 1)

    expect(reordered.tiers[0]?.cards).toEqual([3, 1, 2])
    expect(moveCard(ranked, 2, { kind: 'tier', id: s }, 2).tiers[0]?.cards).toEqual([1, 2, 3])
  })

  it('se sacan de la lista, y «volver a empezar» las devuelve a todas a la bandeja con las filas intactas', () => {
    let list = withCards()
    const s = tierId(list, 'S')

    list = moveCard(moveCard(list, 1, { kind: 'tier', id: s }), 2, { kind: 'tier', id: s })
    expect(countCards(removeCard(list, 1))).toBe(2)
    expect(removeCard(list, 1).tiers[0]?.cards).toEqual([2])

    const reset = resetPlacements(list)

    expect([...reset.pool].sort()).toEqual([1, 2, 3])
    expect(reset.tiers.map((tier) => tier.label)).toEqual(list.tiers.map((tier) => tier.label))
    expect(reset.tiers.every((tier) => tier.cards.length === 0)).toBe(true)
  })
})

describe('las filas', () => {
  it('se agregan al final con el siguiente color, con un tope', () => {
    let list = addTier(newList('x'), '  Dios  ')

    expect(list.tiers.at(-1)).toMatchObject({ label: 'Dios', color: TIER_PALETTE[7 % TIER_PALETTE.length] })

    for (let index = 0; index < MAX_TIERS + 3; index += 1) list = addTier(list, 'X')

    expect(list.tiers).toHaveLength(MAX_TIERS)
  })

  it('se renombran, se pintan, suben y bajan (en las puntas no pasa nada) y, al borrarlas, sus cartas vuelven a la bandeja', () => {
    let list = withCards()
    const s = tierId(list, 'S')
    const f = tierId(list, 'F')

    list = updateTier(list, s, { label: 'Dios tier muy largo para entrar', color: '#7fffbf' })
    expect(list.tiers[0]?.label).toHaveLength(14)
    expect(list.tiers[0]?.color).toBe('#7fffbf')

    expect(moveTier(list, s, -1)).toBe(list)
    expect(moveTier(list, f, 1)).toBe(list)
    expect(moveTier(list, s, 1).tiers.map((tier) => tier.label).slice(0, 2)).toEqual(['A', list.tiers[0]?.label])

    list = moveCard(list, 2, { kind: 'tier', id: s })
    list = removeTier(list, s)
    expect(list.tiers).toHaveLength(6)
    expect(list.pool).toContain(2)
  })
})

describe('copias y texto', () => {
  it('una copia no comparte ids con la original y se puede tocar sin cambiarla', () => {
    const original = moveCard(withCards(), 1, { kind: 'tier', id: tierId(withCards(), 'S') })
    const copy = duplicateList(withCards(), 'Copia')

    expect(copy.id).not.toBe(original.id)
    expect(copy.tiers.map((tier) => tier.id)).not.toEqual(original.tiers.map((tier) => tier.id))
    expect(copy.title).toBe('Copia')
  })

  it('el texto trae el título, una línea por fila y la bandeja si tiene algo', () => {
    let list = withCards()

    list = moveCard(list, 1, { kind: 'tier', id: tierId(list, 'S') })
    list = moveCard(list, 2, { kind: 'tier', id: tierId(list, 'S') })

    const lines = listToText(list, 'Sin clasificar').split('\n')

    expect(lines[0]).toBe('Mi lista')
    expect(lines[1]).toBe('S: Ash Blossom, Maxx "C"')
    expect(lines[2]).toBe('A:')
    expect(lines.at(-1)).toBe('Sin clasificar: Carta 3')
    expect(listToText(resetPlacements(withCards()), 'Sin clasificar').split('\n').at(-1)).toBe('Sin clasificar: Ash Blossom, Maxx "C", Carta 3')
  })
})

describe('lo guardado', () => {
  it('ida y vuelta: lo que se guarda se lee igual', () => {
    let list = withCards()

    list = moveCard(list, 1, { kind: 'tier', id: tierId(list, 'A') })

    const store = { version: 1 as const, activeId: list.id, lists: [list] }
    const back = parseStore(JSON.stringify(store), 'Nueva')

    expect(back).toEqual(store)
  })

  it('un guardado roto, de otra versión o vacío arranca una lista nueva con el título de reserva', () => {
    for (const raw of [null, '', 'no es json', '{}', '{"version":2,"lists":[]}', '{"version":1,"lists":[]}', '[1,2]']) {
      const store = parseStore(raw, 'Nueva')

      expect(store.lists).toHaveLength(1)
      expect(store.lists[0]?.title).toBe('Nueva')
      expect(store.activeId).toBe(store.lists[0]?.id)
    }
  })

  it('se leen con tolerancia: cartas repetidas en dos filas quedan en una, las que no están en ningún lado vuelven a la bandeja y lo ilegible se descarta', () => {
    const raw = JSON.stringify({
      version: 1,
      activeId: 'no-existe',
      lists: [
        {
          id: 'l1',
          title: 'Mía',
          cards: { 1: card(1), 2: card(2), 3: card(3), 4: { id: 4, name: '' }, x: 'basura' },
          tiers: [
            { id: 't1', label: 'S', color: '#ff7f7f', cards: [1, 2, 99] },
            { id: 't2', label: 'A', color: 'rojo', cards: [2, 1] },
            { nada: true },
          ],
          pool: [],
        },
        'no es una lista',
      ],
    })
    const store = parseStore(raw, 'Nueva')
    const list = store.lists[0]

    expect(store.lists).toHaveLength(1)
    expect(store.activeId).toBe('l1')
    expect(list?.tiers).toHaveLength(2)
    expect(list?.tiers[0]?.cards).toEqual([1, 2])
    expect(list?.tiers[1]?.cards).toEqual([])
    expect(list?.tiers[1]?.color).toBe(TIER_PALETTE[0])
    expect(list?.pool).toEqual([3])
    expect(Object.keys(list?.cards ?? {})).toEqual(['1', '2', '3'])
  })
})
