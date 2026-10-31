import { describe, expect, it } from 'vitest'

import { SUPPORT_PLACE, asksHow, inMenuBlocks, menuPlaceOf } from '../app/mat-menu-order'
import { createMatState, listBatchActions, listCardActions, listDropActions, replayMat, TOKEN_KIND, type MatAction, type MatCardKind, type MatMenuItem } from '../app/practice-mat'

const MONSTER: MatCardKind = { monster: true, spell: false, trap: false, extra: false, effect: true, fieldSpell: false, pendulum: false, fusion: false, synchro: false, xyz: false, link: false, level: 4 }
const KINDS: Record<string, MatCardKind> = {
  m1: MONSTER,
  m2: MONSTER,
  p1: { ...MONSTER, pendulum: true },
  s1: { ...MONSTER, monster: false, spell: true, level: null },
  t1: { ...MONSTER, monster: false, trap: true, level: null },
  d1: MONSTER,
  g1: MONSTER,
  g2: MONSTER,
  x1: { ...MONSTER, extra: true, xyz: true },
}
const kindOf = (id: string) => KINDS[id] ?? TOKEN_KIND
const nameOf = (id: string) => id.toUpperCase()
// La mano: dos monstruos, uno de Péndulo, una Mágica y una Trampa; en el deck queda d1, abajo del deck van g1 y g2 (al cementerio en `table`).
const start = createMatState(['m1', 'm2', 'p1', 's1', 't1', 'd1', 'g1', 'g2'], ['x1'], 5)
const table = replayMat(start, [
  { type: 'move', id: 'g1', to: 'gy' },
  { type: 'move', id: 'g2', to: 'gy' },
  { type: 'place', id: 'x1', zone: 'mz', index: 0, pos: 'atk', how: 'special' },
  { type: 'attach', id: 'm2', to: 'x1' },
  { type: 'place', id: 'p1', zone: 'mz', index: 1, pos: 'atk', how: 'normal' },
  { type: 'token', zone: 'mz', index: 2, pos: 'atk' },
] satisfies MatAction[])
const token = table.mz[2]!.id

const labels = (items: readonly MatMenuItem[]) => items.map((item) => item.label)

/** El menú de escritorio: los textos en orden, con «|» donde va la línea fina entre bloques. */
const desktop = (items: readonly MatMenuItem[], own: readonly string[]) =>
  inMenuBlocks(items.map((item) => ({ entry: { label: item.label } as { label: string; divider?: boolean }, place: menuPlaceOf(item, own) }))).flatMap((entry) => (entry.divider ? ['|', entry.label] : [entry.label]))

describe('el orden del menú pegado a la carta (escritorio)', () => {
  it('una carta de la mano: apoyo, envíos por destino y las jugadas al revés (la principal abajo); el motor no cambia su orden', () => {
    const items = listCardActions(start, 'm1', kindOf, nameOf)

    expect(labels(items)).toEqual(['Invocación Normal', 'Colocar', 'Invocación Especial', 'Activar efecto', 'Revelar', 'Target', 'Descartar', 'Desterrar', 'Al deck'])
    expect(desktop(items, ['m1'])).toEqual(['Revelar', 'Target', '|', 'Al deck', 'Descartar', 'Desterrar', '|', 'Activar efecto', 'Invocación Especial', 'Colocar', 'Invocación Normal'])
  })

  it('una Mágica y una Trampa de la mano: Activar o Colocar abajo, en el orden inverso al del motor', () => {
    expect(desktop(listCardActions(start, 's1', kindOf, nameOf), ['s1'])).toEqual(['Revelar', 'Target', '|', 'Al deck', 'Descartar', 'Desterrar', '|', 'Colocar', 'Activar'])
    expect(desktop(listCardActions(start, 't1', kindOf, nameOf), ['t1'])).toEqual(['Revelar', 'Target', '|', 'Al deck', 'Descartar', 'Desterrar', '|', 'Colocar', 'Activar efecto'])
  })

  it('un Monstruo de Péndulo de la mano: «Al Extra Deck boca arriba» va con el cementerio, antes de Desterrar', () => {
    const order = desktop(listCardActions(start, 'p1', kindOf, nameOf), ['p1'])

    expect(order.slice(0, order.indexOf('|', 3))).toEqual(['Revelar', 'Target', '|', 'Al deck', 'Descartar', 'Al Extra Deck boca arriba', 'Desterrar'])
  })

  it('un Xyz del campo: desacoplar un material (mover otra carta) es una jugada; mandarlo al Extra Deck, un envío; dar el control, el último envío', () => {
    const items = listCardActions(table, 'x1', kindOf, nameOf, [], undefined, { rival: 'Ana', rivalHasRoom: true })

    expect(desktop(items, ['x1'])).toEqual([
      'Target',
      '|',
      'Al cementerio',
      'Al Extra Deck',
      'Desterrar',
      'Dar el control a Ana',
      '|',
      'A la zona de Mágicas y Trampas',
      'Desacoplar M2',
      'Poner boca abajo',
      'Pasar a defensa',
      'Activar efecto',
    ])
  })

  it('un Monstruo de Péndulo del campo: «Al cementerio (al Extra Deck)» (que lo manda al Extra) va donde el cementerio', () => {
    const order = desktop(listCardActions(table, 'p1', kindOf, nameOf), ['p1'])

    expect(order.slice(0, order.indexOf('|', 2))).toEqual(['Target', '|', 'Al deck', 'A la mano', 'Al cementerio (al Extra Deck)', 'Desterrar'])
  })

  it('una ficha y un material: «Quitar la ficha» es un envío; el menú del material es todo de envíos (sin líneas)', () => {
    expect(desktop(listCardActions(table, token, kindOf, nameOf), [token])).toEqual(['Target', '|', 'Quitar la ficha', '|', 'Pasar a defensa'])
    expect(desktop(listCardActions(table, 'm2', kindOf, nameOf), ['m2'])).toEqual(['A la mano', 'Desacoplar al cementerio', 'Desterrar'])
  })

  it('una carta del deck: Arriba y Abajo del deck van primero entre los envíos', () => {
    const order = desktop(listCardActions(start, 'd1', kindOf, nameOf), ['d1'])

    expect(order.slice(0, order.indexOf('|', 2))).toEqual(['Revelar', '|', 'Arriba del deck', 'Abajo del deck', 'A la mano', 'Al cementerio', 'Desterrar'])
    // El motor ofrece Colocar y después Invocación Especial: Colocar queda abajo.
    expect(order.slice(order.lastIndexOf('|') + 1)).toEqual(['Invocación Especial', 'Colocar'])
  })

  it('soltada en una zona: sólo jugadas, sin líneas y con la Invocación Normal abajo', () => {
    expect(desktop(listDropActions(start, 'm1', kindOf, nameOf, { zone: 'mz', index: 0 }), ['m1'])).toEqual(['Invocación Especial', 'Colocar', 'Invocación Normal'])
  })

  it('varias cartas del cementerio: el lote se clasifica por su primera parte (cada parte mueve una de las elegidas; adjuntarlas al Xyz es una jugada)', () => {
    const items = listBatchActions(table, ['g1', 'g2'], kindOf, nameOf)

    expect(desktop(items, ['g1', 'g2'])).toEqual(['Target', '|', 'Al deck', 'A la mano', 'Desterrar', '|', 'Adjuntar a X1'])
  })

  it('lo que no es del motor (Señalar) va con el apoyo, en el lugar donde se puso', () => {
    const items = listCardActions(table, 'x1', kindOf, nameOf)
    const rows = items.map((item) => ({ entry: { label: item.label } as { label: string; divider?: boolean }, place: menuPlaceOf(item, ['x1']) }))

    rows.splice(rows.findIndex((row) => row.entry.label === 'Target'), 0, { entry: { label: 'Señalar' }, place: SUPPORT_PLACE })
    expect(inMenuBlocks(rows).slice(0, 3).map((entry) => (entry.divider ? `|${entry.label}` : entry.label))).toEqual(['Señalar', 'Target', '|Al cementerio'])
  })
})

describe('«Dar el control» de un monstruo del Extra Deck en la Zona de Monstruo Extra', () => {
  const inEmz = replayMat(start, [{ type: 'place', id: 'x1', zone: 'emz', index: 0, pos: 'atk', how: 'special' }])
  const give = (room: boolean | null) => listCardActions(inEmz, 'x1', kindOf, nameOf, [], undefined, room === null ? undefined : { rival: 'Ana', rivalHasRoom: room }).find((item) => item.action.type === 'give')

  it('con lugar en el rival, se ofrece; sin lugar, se ve apagada y dice por qué (en el mismo bloque); fuera de un duelo, no está', () => {
    expect(give(true)).toEqual({ label: 'Dar el control a Ana', action: { type: 'give', id: 'x1' } })
    expect(give(false)).toEqual({ label: 'Dar el control a Ana', action: { type: 'give', id: 'x1' }, disabled: 'Ana no tiene una zona de monstruo libre' })
    expect(menuPlaceOf(give(false)!, ['x1'])).toEqual(menuPlaceOf(give(true)!, ['x1']))
    expect(give(null)).toBeUndefined()
  })
})

describe('qué preguntas son de «cómo» (van en un submenú)', () => {
  const find = (items: readonly MatMenuItem[], label: string) => items.find((item) => item.label === label)!

  it('la posición, boca arriba o abajo y dónde del deck, sí; una jugada que no pregunta, no', () => {
    const hand = listCardActions(start, 'm1', kindOf, nameOf)

    expect(['Invocación Especial', 'Desterrar', 'Al deck'].map((label) => asksHow(find(hand, label)))).toEqual([true, true, true])
    expect(asksHow(find(hand, 'Invocación Normal'))).toBe(false)
  })

  it('a quién atacar, qué material o a qué Xyz, y qué efecto, no: siguen en el segundo paso', () => {
    const battle = replayMat(table, [{ type: 'phase', phase: 'battle' }, { type: 'attach', id: 'm1', to: 'x1' }])
    const field = listCardActions(battle, 'x1', kindOf, nameOf, [{ id: 'r1', label: 'Zona 1: Ash' }])
    const effect: MatMenuItem = { label: 'Activar efecto', action: { type: 'activate', id: 'x1' }, choices: [{ label: 'Robar 1', lead: 'Efecto 1', action: { type: 'activate', id: 'x1', effect: 0 }, preview: { start: 0, end: 5 } }] }

    expect(asksHow(find(field, 'Atacar'))).toBe(false)
    expect(asksHow(find(field, 'Desacoplar'))).toBe(false)
    expect(asksHow(effect)).toBe(false)
  })

  it('en un lote, una apagada o con una respuesta apagada, no', () => {
    const extra = listBatchActions(replayMat(start, [{ type: 'move', id: 'x1', to: 'gy' }, { type: 'move', id: 'g1', to: 'gy' }]), ['x1', 'g1'], kindOf, nameOf)
    const banish = find(extra, 'Desterrar')

    expect(asksHow(banish)).toBe(true)
    expect(asksHow({ ...banish, disabled: 'No va con G1' })).toBe(false)
    expect(asksHow({ ...banish, choices: [banish.choices![0]!, { ...banish.choices![1]!, disabled: 'No va con G1' }] })).toBe(false)
  })
})
