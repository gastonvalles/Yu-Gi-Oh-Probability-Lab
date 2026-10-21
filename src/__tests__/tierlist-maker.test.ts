import { describe, expect, it } from 'vitest'

import {
  MAX_CARDS,
  MAX_TIERS,
  TIER_PALETTE,
  addCards,
  addTier,
  addTierAt,
  clearTier,
  countCards,
  moveCard,
  moveTierTo,
  newList,
  parseStore,
  placeOf,
  prefersLightText,
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

  it('se renombran, se pintan, suben y bajan de a un lugar (en las puntas no pasa nada) y, al borrarlas, sus cartas vuelven a la bandeja', () => {
    let list = withCards()
    const s = tierId(list, 'S')
    const f = tierId(list, 'F')

    list = updateTier(list, s, { label: 'Dios tier muy largo para entrar', color: '#7fffbf' })
    expect(list.tiers[0]?.label).toHaveLength(14)
    expect(list.tiers[0]?.color).toBe('#7fffbf')

    // Lo que hacen ↑ y ↓ en el agarre: un lugar más arriba o más abajo.
    expect(moveTierTo(list, s, -1)).toBe(list)
    expect(moveTierTo(list, f, 7)).toBe(list)
    expect(moveTierTo(list, s, 1).tiers.map((tier) => tier.label).slice(0, 2)).toEqual(['A', list.tiers[0]?.label])

    list = moveCard(list, 2, { kind: 'tier', id: s })
    list = removeTier(list, s)
    expect(list.tiers).toHaveLength(6)
    expect(list.pool).toContain(2)
  })

  it('una fila va a cualquier lugar (soltarla al arrastrar), con sus cartas; fuera de la lista va a la punta, y una que no existe o que ya está ahí no cambia nada', () => {
    const start = withCards()
    const b = tierId(start, 'B')
    const list = moveCard(start, 1, { kind: 'tier', id: b })
    const labels = (next: typeof list) => next.tiers.map((tier) => tier.label).join('')

    expect(labels(moveTierTo(list, b, 0))).toBe('BSACDEF')
    expect(labels(moveTierTo(list, b, 5))).toBe('SACDEBF')
    expect(labels(moveTierTo(list, b, 99))).toBe('SACDEFB')
    expect(labels(moveTierTo(list, b, -3))).toBe('BSACDEF')
    expect(moveTierTo(list, b, 0).tiers[0]?.cards).toEqual([1])
    expect(moveTierTo(list, b, 2)).toBe(list)
    expect(moveTierTo(list, 'no-existe', 0)).toBe(list)
  })

  it('vaciar una fila manda sus cartas al final de la bandeja, en su orden, y la fila queda con su nombre y su color', () => {
    let list = withCards()
    const a = tierId(list, 'A')

    list = moveCard(moveCard(list, 3, { kind: 'tier', id: a }), 1, { kind: 'tier', id: a })

    const cleared = clearTier(list, a)

    expect(cleared.tiers.find((tier) => tier.id === a)).toMatchObject({ label: 'A', color: list.tiers[1]?.color, cards: [] })
    expect(cleared.pool).toEqual([2, 3, 1])
    expect(cleared.tiers).toHaveLength(7)
    expect(clearTier(cleared, a)).toBe(cleared)
    expect(clearTier(list, 'no-existe')).toBe(list)
  })

  it('se agrega una fila arriba o abajo de otra (o en las puntas), vacía y con el siguiente color, hasta el tope', () => {
    const list = newList('x')
    const labels = (next: typeof list) => next.tiers.map((tier) => tier.label).join(' ')

    expect(labels(addTierAt(list, 1, ' Nueva '))).toBe('S Nueva A B C D E F')
    expect(labels(addTierAt(list, 0, 'Nueva'))).toBe('Nueva S A B C D E F')
    expect(labels(addTierAt(list, 7, 'Nueva'))).toBe('S A B C D E F Nueva')
    expect(labels(addTierAt(list, 40, 'Nueva'))).toBe('S A B C D E F Nueva')
    expect(addTierAt(list, 1, 'Nueva').tiers[1]).toMatchObject({ color: TIER_PALETTE[7], cards: [] })

    let full = list

    for (let index = 0; index < MAX_TIERS; index += 1) full = addTierAt(full, 0, 'X')

    expect(full.tiers).toHaveLength(MAX_TIERS)
    expect(addTierAt(full, 3, 'Una más')).toBe(full)
  })
})

describe('los colores de las filas', () => {
  // Contraste WCAG entre dos `#rrggbb`, para comprobar la letra de cada color.
  const channel = (value: number) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  const luminance = (hex: string) => [1, 3, 5].map((at) => channel(Number.parseInt(hex.slice(at, at + 2), 16) / 255)).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0)
  const ratio = (a: string, b: string) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]

    return (high + 0.05) / (low + 0.05)
  }

  it('son catorce (dos renglones de siete), distintos y válidos, y siguen los ocho de antes', () => {
    expect(TIER_PALETTE).toHaveLength(14)
    expect(new Set(TIER_PALETTE).size).toBe(14)
    expect(TIER_PALETTE.every((color) => /^#[0-9a-f]{6}$/.test(color))).toBe(true)

    for (const old of ['#ff7f7f', '#ffbf7f', '#ffdf7f', '#ffff7f', '#bfff7f', '#7fffbf', '#7fbfff', '#ff7fff']) expect(TIER_PALETTE).toContain(old)
  })

  it('la letra de la fila se lee (AA, 4,5:1) sobre cada color: oscura sobre los pasteles y clara sólo sobre el gris oscuro', () => {
    for (const color of TIER_PALETTE) {
      const ink = prefersLightText(color) ? '#fdffff' : '#150a24'

      expect(ratio(color, ink), color).toBeGreaterThanOrEqual(4.5)
    }

    expect(TIER_PALETTE.filter(prefersLightText)).toEqual(['#3b3b3b'])
  })

  it('lo guardado con los colores de antes y con los nuevos se lee igual; uno que no es `#rrggbb` vuelve al rojo de la S', () => {
    const list = newList('Mía', 'l1')
    const colors = ['#ff7fff', '#3b3b3b', '#f7f7f7', 'violeta']
    const raw = JSON.stringify({ version: 1, activeId: 'l1', lists: [{ ...list, tiers: list.tiers.slice(0, 4).map((tier, index) => ({ ...tier, color: colors[index] })) }] })

    expect(parseStore(raw, 'Nueva').lists[0]?.tiers.map((tier) => tier.color)).toEqual(['#ff7fff', '#3b3b3b', '#f7f7f7', TIER_PALETTE[0]])
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
