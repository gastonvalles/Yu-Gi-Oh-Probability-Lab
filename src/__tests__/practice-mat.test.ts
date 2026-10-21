import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  allMatIds,
  cardKindOf,
  createMatState,
  describeMatAction,
  describeMatSteps,
  freeTargets,
  listCardActions,
  listDropActions,
  locateCard,
  matReducer,
  replayMat,
  shuffleWithSeed,
  TOKEN_KIND,
  tributesFor,
  type MatAction,
  type MatCardKind,
  type MatPos,
  type MatState,
} from '../app/practice-mat'
import type { ApiCardReference } from '../types'

const MONSTER: MatCardKind = { monster: true, spell: false, trap: false, extra: false, effect: true, fieldSpell: false, pendulum: false, fusion: false, synchro: false, xyz: false, link: false, level: 4 }
const XYZ: MatCardKind = { ...MONSTER, extra: true, xyz: true }
const LINK: MatCardKind = { ...MONSTER, extra: true, link: true, level: null }
const SPELL: MatCardKind = { ...MONSTER, monster: false, spell: true, level: null }
const TRAP: MatCardKind = { ...MONSTER, monster: false, trap: true, level: null }

const DECK = ['a1', 'a2', 'b1', 'c1', 'd1', 'e1', 'f1']
const EXTRA = ['x1', 'x2']
// c1 es de Nivel 7 (pide 2 Sacrificios) y e1 de Nivel 5 (pide 1).
const KINDS: Record<string, MatCardKind> = { a1: MONSTER, a2: MONSTER, b1: SPELL, c1: { ...MONSTER, level: 7 }, d1: TRAP, e1: { ...MONSTER, level: 5 }, f1: MONSTER, x1: XYZ, x2: LINK }
const kindOf = (id: string) => KINDS[id] ?? TOKEN_KIND
const nameOf = (id: string) => id.toUpperCase()

const start = () => createMatState(DECK, EXTRA, 5)
const run = (actions: MatAction[], from = start()) => replayMat(from, actions)

describe('la mesa de práctica', () => {
  it('arranca con la mano y el resto del deck en orden, el Extra completo y el campo vacío', () => {
    const state = start()

    expect(state.hand).toEqual(['a1', 'a2', 'b1', 'c1', 'd1'])
    expect(state.deck).toEqual(['e1', 'f1'])
    expect(state.extra).toEqual(EXTRA)
    expect(state.mz).toEqual([null, null, null, null, null])
    expect(state.emz).toEqual([null, null])
    expect(state.st).toHaveLength(5)
    expect(state.field).toBeNull()
  })

  it('roba y manda al cementerio desde el tope del deck, sin pasarse', () => {
    const drawn = run([{ type: 'draw', count: 1 }])
    expect(drawn.hand.at(-1)).toBe('e1')
    expect(drawn.deck).toEqual(['f1'])

    const milled = run([{ type: 'mill', count: 5 }], drawn)
    expect(milled.gy).toEqual(['f1'])
    expect(milled.deck).toEqual([])
    expect(matReducer(milled, { type: 'draw', count: 1 })).toBe(milled)
  })

  it('invoca desde la mano a una zona vacía; una zona ocupada no cambia nada', () => {
    const state = run([{ type: 'place', id: 'a1', zone: 'mz', index: 2, pos: 'atk' }])

    expect(state.mz[2]).toEqual({ id: 'a1', pos: 'atk', counters: 0, materials: [] })
    expect(state.hand).not.toContain('a1')
    expect(matReducer(state, { type: 'place', id: 'a2', zone: 'mz', index: 2, pos: 'def' })).toBe(state)
    expect(matReducer(state, { type: 'place', id: 'zzz', zone: 'mz', index: 0, pos: 'atk' })).toBe(state)
    expect(matReducer(state, { type: 'place', id: 'a2', zone: 'mz', index: 9, pos: 'atk' })).toBe(state)
  })

  it('al cambiar de zona conserva contadores y materiales; al dejar el campo los materiales van al cementerio', () => {
    const state = run([
      { type: 'place', id: 'x1', zone: 'emz', index: 0, pos: 'atk' },
      { type: 'attach', id: 'a1', to: 'x1' },
      { type: 'attach', id: 'a2', to: 'x1' },
      { type: 'counter', id: 'x1', delta: 2 },
      { type: 'place', id: 'x1', zone: 'mz', index: 0, pos: 'def' },
    ])

    expect(state.emz[0]).toBeNull()
    expect(state.mz[0]).toEqual({ id: 'x1', pos: 'def', counters: 2, materials: ['a1', 'a2'] })
    expect(locateCard(state, 'a1')).toEqual({ kind: 'material', of: 'x1' })

    const gone = matReducer(state, { type: 'move', id: 'x1', to: 'extra' })
    expect(gone.mz[0]).toBeNull()
    expect(gone.gy).toEqual(['a1', 'a2'])
    expect(gone.extra).toEqual(['x2', 'x1'])

    // Desacoplar un material lo manda a donde se pida sin tocar al dueño.
    const detached = matReducer(state, { type: 'move', id: 'a2', to: 'hand' })
    expect(detached.mz[0]?.materials).toEqual(['a1'])
    expect(detached.hand).toContain('a2')
  })

  it('la Invocación Normal con Sacrificios manda los sacrificios al cementerio y saca la carta, incluso a la zona que se liberó', () => {
    const two = run([{ type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'atk' }, { type: 'place', id: 'a2', zone: 'mz', index: 1, pos: 'def' }])
    const summoned = matReducer(two, { type: 'tribute', id: 'c1', tributes: ['a1', 'a2'], zone: 'mz', index: 0, pos: 'atk' })

    expect(summoned.gy).toEqual(['a1', 'a2'])
    expect(summoned.mz[0]?.id).toBe('c1')
    expect(summoned.mz[1]).toBeNull()
    expect(summoned.hand).not.toContain('c1')
    expect(describeMatAction(two, { type: 'tribute', id: 'c1', tributes: ['a1', 'a2'], zone: 'mz', index: 0, pos: 'atk' }, nameOf)).toBe('Invocación Normal de C1 (sacrificás A1 y A2)')
    expect(describeMatAction(two, { type: 'tribute', id: 'c1', tributes: ['a1'], zone: 'mz', index: 2, pos: 'set' }, nameOf)).toBe('Colocás C1 boca abajo sacrificando A1')

    // Un sacrificio que no está en el campo, o sin sacrificios, no hace nada.
    expect(matReducer(two, { type: 'tribute', id: 'c1', tributes: ['b1'], zone: 'mz', index: 2, pos: 'atk' })).toBe(two)
    expect(matReducer(two, { type: 'tribute', id: 'c1', tributes: [], zone: 'mz', index: 2, pos: 'atk' })).toBe(two)
  })

  it('el turno empieza en la Draw Phase (en el turno 1 sin robar); cambiar de fase queda anotado y de la End Phase a la Draw Phase empieza otro turno robando 1', () => {
    const state = start()
    expect([state.phase, state.turn]).toEqual(['draw', 1])
    expect(state.hand).toHaveLength(5)

    const battle = matReducer(state, { type: 'phase', phase: 'battle' })
    expect(battle.phase).toBe('battle')
    expect(describeMatAction(state, { type: 'phase', phase: 'battle' }, nameOf)).toBe('Pasás a la Battle Phase')
    expect(matReducer(battle, { type: 'phase', phase: 'battle' })).toBe(battle)

    const end = matReducer(battle, { type: 'phase', phase: 'end' })
    const next = matReducer(end, { type: 'phase', phase: 'draw' })
    expect([next.phase, next.turn]).toEqual(['draw', 2])
    expect(next.hand).toEqual([...end.hand, 'e1'])
    expect(next.deck).toEqual(['f1'])
    expect(describeMatAction(end, { type: 'phase', phase: 'draw' }, nameOf)).toBe('Turno 2: Draw Phase, robás E1')
    // Sin cartas en el deck el turno igual empieza (robar es imposible: en el juego real se pierde).
    const empty = matReducer({ ...end, deck: [] }, { type: 'phase', phase: 'draw' })
    expect([empty.phase, empty.turn, empty.hand.length]).toEqual(['draw', 2, end.hand.length])
    // Volver atrás dentro del turno no cambia el turno; una fase inválida no hace nada.
    expect(matReducer(next, { type: 'phase', phase: 'main1' }).turn).toBe(2)
    expect(matReducer(next, { type: 'phase', phase: 'nope' as 'draw' })).toBe(next)
  })

  it('las fichas se numeran, salen en ataque o en defensa y desaparecen al salir del campo', () => {
    const state = run([
      { type: 'token', zone: 'mz', index: 0 },
      { type: 'token', zone: 'mz', index: 1, pos: 'def' },
    ])

    expect(state.mz[0]?.id).toBe('token-1')
    expect(state.mz[1]?.id).toBe('token-2')
    // Sin posición (las fichas de los combos guardados antes) salen en ataque, y una ficha no se coloca boca abajo.
    expect([state.mz[0]?.pos, state.mz[1]?.pos]).toEqual(['atk', 'def'])
    expect(matReducer(state, { type: 'token', zone: 'mz', index: 2, pos: 'set' as 'def' }).mz[2]?.pos).toBe('atk')
    expect(matReducer(state, { type: 'token', zone: 'mz', index: 0 })).toBe(state)

    const removed = matReducer(state, { type: 'move', id: 'token-1', to: 'gy' })
    expect(removed.mz[0]).toBeNull()
    expect(removed.gy).toEqual([])
    expect(allMatIds(removed)).not.toContain('token-1')
    expect(matReducer(state, { type: 'attach', id: 'token-2', to: 'token-1' })).toBe(state)
  })

  it('sacar una carta mirando el deck baraja el resto en la misma jugada, y queda dicho', () => {
    const state = createMatState(DECK, EXTRA, 2)
    const rest = shuffleWithSeed(['b1', 'c1', 'e1', 'f1'], 5)
    expect(state.deck).toEqual(['b1', 'c1', 'd1', 'e1', 'f1'])

    const searched = matReducer(state, { type: 'move', id: 'd1', to: 'hand', shuffle: 5 })
    expect(searched.hand).toEqual(['a1', 'a2', 'd1'])
    expect(searched.deck).toEqual(rest)
    expect(describeMatAction(state, { type: 'move', id: 'd1', to: 'hand', shuffle: 5 }, nameOf)).toBe('Buscás D1 del deck a la mano y barajás')
    // Arriba del deck: se baraja el resto y la carta queda en el tope.
    expect(matReducer(state, { type: 'move', id: 'd1', to: 'deck', shuffle: 5 }).deck).toEqual(['d1', ...rest])

    const placed = matReducer(state, { type: 'place', id: 'd1', zone: 'mz', index: 0, pos: 'atk', how: 'special', shuffle: 5 })
    expect([placed.mz[0]?.id, placed.deck]).toEqual(['d1', rest])
    expect(describeMatAction(state, { type: 'place', id: 'd1', zone: 'mz', index: 0, pos: 'atk', how: 'special', shuffle: 5 }, nameOf)).toBe('Invocación Especial de D1 en ataque y barajás')
    // Sin semilla el deck queda en su orden.
    expect(matReducer(state, { type: 'move', id: 'd1', to: 'hand' }).deck).toEqual(['b1', 'c1', 'e1', 'f1'])
  })

  it('"Al deck" pregunta cómo (al azar, arriba o abajo): una carta de afuera se pone y se baraja todo el deck; una que ya estaba en el deck sólo cambia de lugar', () => {
    const state = createMatState(DECK, EXTRA, 2)
    expect(state.hand).toEqual(['a1', 'a2'])
    expect(state.deck).toEqual(['b1', 'c1', 'd1', 'e1', 'f1'])

    // El menú: una sola jugada que pregunta; "Al azar" lleva la marca para que la mesa le ponga la semilla.
    const toDeck = listCardActions(state, 'a1', kindOf, nameOf).find((item) => item.label === 'Al deck')!
    expect(toDeck.choices?.map((choice) => [choice.label, choice.shuffleDeck ?? false])).toEqual([['Al azar', true], ['Arriba', false], ['Abajo', false]])
    // Mirando el deck, una carta de adentro sigue con Arriba / Abajo (no vuelve "al deck": ya está).
    expect(listCardActions(state, 'c1', kindOf, nameOf).map((item) => item.label).slice(-2)).toEqual(['Arriba del deck', 'Abajo del deck'])

    // Arriba y abajo, sin barajar.
    expect(matReducer(state, { type: 'move', id: 'a1', to: 'deck' }).deck).toEqual(['a1', 'b1', 'c1', 'd1', 'e1', 'f1'])
    expect(matReducer(state, { type: 'move', id: 'a1', to: 'deck-bottom' }).deck).toEqual(['b1', 'c1', 'd1', 'e1', 'f1', 'a1'])

    // Al azar: se pone y se baraja TODO con la semilla (la carta incluida), y queda dicho.
    const mixed = matReducer(state, { type: 'move', id: 'a1', to: 'deck', shuffle: 5 })
    expect(mixed.hand).toEqual(['a2'])
    expect(mixed.deck).toEqual(shuffleWithSeed(['a1', 'b1', 'c1', 'd1', 'e1', 'f1'], 5))
    expect(describeMatAction(state, { type: 'move', id: 'a1', to: 'deck', shuffle: 5 }, nameOf)).toBe('Barajás A1 dentro del deck')
    // Del campo también, y la misma semilla da el mismo deck en los dos lados.
    const onField = run([{ type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'atk' }], state)
    expect(matReducer(onField, { type: 'move', id: 'a1', to: 'deck', shuffle: 5 }).deck).toEqual(mixed.deck)
  })

  it('la misma semilla baraja igual, y otra semilla distinto', () => {
    const items = Array.from({ length: 40 }, (_, index) => `c${index}`)

    expect(shuffleWithSeed(items, 7)).toEqual(shuffleWithSeed(items, 7))
    expect(shuffleWithSeed(items, 7)).not.toEqual(shuffleWithSeed(items, 8))
    expect([...shuffleWithSeed(items, 7)].sort()).toEqual([...items].sort())
    expect(run([{ type: 'shuffle', seed: 3 }])).toEqual(run([{ type: 'shuffle', seed: 3 }]))
  })

  it('describe cada jugada según de dónde viene la carta', () => {
    const state = start()
    const describe = (action: MatAction, from: MatState = state) => describeMatAction(from, action, nameOf)

    expect(describe({ type: 'draw', count: 1 })).toBe('Robás E1')
    expect(describe({ type: 'draw', count: 2 })).toBe('Robás 2 cartas')
    expect(describe({ type: 'mill', count: 1 })).toBe('Mandás E1 del deck al cementerio')
    expect(describe({ type: 'shuffle', seed: 1 })).toBe('Barajás el deck')
    expect(describe({ type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'atk', how: 'normal' })).toBe('Invocación Normal de A1')
    expect(describe({ type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'def', how: 'special' })).toBe('Invocación Especial de A1 en defensa')
    expect(describe({ type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'atk' })).toBe('A1 sale al campo en ataque')
    expect(describe({ type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'set' })).toBe('Colocás A1 boca abajo')
    expect(describe({ type: 'place', id: 'a1', zone: 'st', index: 0, pos: 'atk', how: 'scale' })).toBe('Activás A1 como escala')
    expect(describe({ type: 'place', id: 'b1', zone: 'st', index: 0, pos: 'atk' })).toBe('Activás B1')
    expect(describe({ type: 'place', id: 'b1', zone: 'st', index: 0, pos: 'set' })).toBe('Colocás B1')
    expect(describe({ type: 'move', id: 'e1', to: 'hand' })).toBe('Buscás E1 del deck a la mano')
    expect(describe({ type: 'move', id: 'a1', to: 'gy' })).toBe('A1 va al cementerio')
    expect(describe({ type: 'move', id: 'a1', to: 'banished' })).toBe('Desterrás A1')
    expect(describe({ type: 'move', id: 'a1', to: 'deck-bottom' })).toBe('Ponés A1 abajo del deck')
    expect(describe({ type: 'activate', id: 'a1' })).toBe('Activás el efecto de A1')
    expect(describe({ type: 'activate', id: 'a1', cost: 'discard' })).toBe('Activás el efecto de A1 descartándola')
    expect(describe({ type: 'reveal', id: 'a1' })).toBe('Revelás A1')

    const played = run([{ type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'set' }, { type: 'move', id: 'a2', to: 'gy' }, { type: 'place', id: 'b1', zone: 'st', index: 1, pos: 'set' }])
    expect(describe({ type: 'position', id: 'a1', pos: 'atk' }, played)).toBe('Invocación por Volteo de A1')
    expect(describe({ type: 'position', id: 'a1', pos: 'def' }, played)).toBe('Volteás A1 boca arriba')
    expect(describe({ type: 'position', id: 'b1', pos: 'atk' }, played)).toBe('Activás B1')
    expect(describe({ type: 'move', id: 'a2', to: 'hand' }, played)).toBe('Recuperás A2 del cementerio')
    expect(describe({ type: 'move', id: 'a1', to: 'hand' }, played)).toBe('A1 vuelve a la mano')
    expect(describe({ type: 'token', zone: 'mz', index: 1 }, played)).toBe('Ficha en ataque, zona 2')
    expect(describe({ type: 'token', zone: 'emz', index: 0, pos: 'def' }, played)).toBe('Ficha en defensa, zona extra 1')

    // Activar con costo mueve la carta; sin costo y revelar sólo quedan anotados.
    expect(matReducer(state, { type: 'activate', id: 'a1', cost: 'discard' }).gy).toEqual(['a1'])
    expect(matReducer(state, { type: 'activate', id: 'a1' })).toBe(state)
    expect(matReducer(state, { type: 'reveal', id: 'a1' })).toBe(state)
    expect(matReducer(state, { type: 'declare', id: 'a1' })).toBe(state)

    // Objetivo: se marca y desmarca, queda anotado, y se pierde al cambiar de lugar.
    const aimed = matReducer(state, { type: 'target', id: 'a1' })
    expect(aimed.targeted).toEqual(['a1'])
    expect(describe({ type: 'target', id: 'a1' })).toBe('Marcás A1 como target')
    expect(describe({ type: 'target', id: 'a1' }, aimed)).toBe('Sacás el target de A1')
    expect(listCardActions(aimed, 'a1', kindOf, nameOf).map((item) => item.label)).toContain('Quitar target')
    expect(matReducer(aimed, { type: 'target', id: 'a1' }).targeted).toEqual([])
    expect(matReducer(aimed, { type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'atk' }).targeted).toEqual([])
    expect(matReducer(state, { type: 'target', id: 'zzz' })).toBe(state)
    expect(describe({ type: 'declare', id: 'a1' })).toBe('Declarás A1')

    // Desterrar boca abajo se recuerda hasta que la carta deja el destierro.
    const hidden = matReducer(state, { type: 'move', id: 'a1', to: 'banished', faceDown: true })
    expect(hidden.facedown).toEqual(['a1'])
    expect(describe({ type: 'move', id: 'a1', to: 'banished', faceDown: true })).toBe('Desterrás A1 boca abajo')
    expect(matReducer(hidden, { type: 'move', id: 'a1', to: 'hand' }).facedown).toEqual([])
    expect(matReducer(state, { type: 'move', id: 'a1', to: 'gy', faceDown: true }).facedown).toEqual([])

    expect(describeMatSteps(state, [{ type: 'draw', count: 1 }, { type: 'draw', count: 1 }], nameOf)).toEqual(['Robás E1', 'Robás F1'])
  })

  it('la Invocación desde el Extra Deck usa materiales del campo: Xyz los pone debajo, Enlace los manda al cementerio', () => {
    const two = run([{ type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'atk' }, { type: 'place', id: 'a2', zone: 'mz', index: 1, pos: 'atk' }])
    const xyzSummon: MatAction = { type: 'summon', id: 'x1', how: 'xyz', materials: ['a1', 'a2'], zone: 'emz', index: 0, pos: 'atk' }
    const xyz = matReducer(two, xyzSummon)
    expect(xyz.emz[0]).toEqual({ id: 'x1', pos: 'atk', counters: 0, materials: ['a1', 'a2'] })
    expect([xyz.mz[0], xyz.mz[1], xyz.gy, xyz.extra]).toEqual([null, null, [], ['x2']])
    expect(describeMatAction(two, xyzSummon, nameOf)).toBe('Invocación Xyz de X1 (materiales: A1 y A2)')

    const linkSummon: MatAction = { type: 'summon', id: 'x2', how: 'link', materials: ['a1'], zone: 'mz', index: 0, pos: 'atk' }
    const link = matReducer(two, linkSummon)
    expect([link.mz[0]?.id, link.gy]).toEqual(['x2', ['a1']])
    expect(describeMatAction(two, linkSummon, nameOf)).toBe('Invocación de Enlace de X2 (materiales: A1)')

    // Con una carta que no está en el Extra o con una ficha como material Xyz no pasa nada; una ficha sí sirve de material de Enlace.
    // Sin materiales también se invoca (son una opción, no un requisito): sale sola, sin nada debajo.
    expect(matReducer(two, { ...xyzSummon, materials: [] }).emz[0]).toMatchObject({ id: 'x1', materials: [] })
    expect(matReducer(two, { ...xyzSummon, id: 'a1', materials: ['a2'] })).toBe(two)
    const withToken = matReducer(two, { type: 'token', zone: 'mz', index: 2 })
    expect(matReducer(withToken, { ...xyzSummon, materials: ['token-1'] })).toBe(withToken)
    expect(matReducer(withToken, { ...linkSummon, materials: ['token-1'], zone: 'emz' }).emz[0]?.id).toBe('x2')

    // El menú del Extra: con monstruos en el campo la Invocación Especial pide materiales (un Link no pregunta la posición); sin monstruos, sale directo.
    const fromExtra = listCardActions(two, 'x1', kindOf, nameOf)[0]!
    expect(fromExtra.label).toBe('Invocación Especial')
    expect(fromExtra.choices?.map((choice) => [choice.label, choice.materials, choice.action.type === 'summon' && choice.action.how])).toEqual([['En ataque', true, 'xyz'], ['En defensa', true, 'xyz']])
    const linkItem = listCardActions(two, 'x2', kindOf, nameOf)[0]!
    expect([linkItem.materials, linkItem.choices, linkItem.action.type]).toEqual([true, undefined, 'summon'])
    expect(listCardActions(start(), 'x1', kindOf, nameOf)[0]!.action.type).toBe('place')
  })

  describe('un Xyz con materiales que pasa a ser material de otro Xyz (Invocación Xyz o Rank-Up) o se adjunta a otro se lleva lo que tenía debajo', () => {
    // X1 es un Xyz con A1 y A2 debajo, en la zona de monstruo; X2 es un Enlace del Extra y X3 otro Xyz del Extra.
    const deckWithExtra = createMatState(DECK, ['x1', 'x2', 'x3'], 5)
    const underX1 = run(
      [
        { type: 'place', id: 'x1', zone: 'mz', index: 0, pos: 'atk' },
        { type: 'attach', id: 'a1', to: 'x1' },
        { type: 'attach', id: 'a2', to: 'x1' },
      ],
      deckWithExtra,
    )
    const rankUp = matReducer(underX1, { type: 'summon', id: 'x3', how: 'xyz', materials: ['x1'], zone: 'emz', index: 0, pos: 'atk' })

    it('la Invocación Xyz con un Xyz de material: el nuevo queda con el viejo y con lo que el viejo tenía debajo, y el cementerio no recibe nada', () => {
      expect(rankUp.emz[0]).toEqual({ id: 'x3', pos: 'atk', counters: 0, materials: ['x1', 'a1', 'a2'] })
      expect([rankUp.mz[0], rankUp.gy, rankUp.extra]).toEqual([null, [], ['x2']])
      expect([...allMatIds(rankUp)].sort()).toEqual([...DECK, 'x1', 'x2', 'x3'].sort())
    })

    it('adjuntar un Xyz con materiales a otro Xyz: se lleva lo que tenía debajo y el cementerio no recibe nada', () => {
      const attached = matReducer(run([{ type: 'place', id: 'x3', zone: 'emz', index: 0, pos: 'atk' }], underX1), { type: 'attach', id: 'x1', to: 'x3' })

      expect([attached.mz[0], attached.gy]).toEqual([null, []])
      expect(attached.emz[0]).toEqual({ id: 'x3', pos: 'atk', counters: 0, materials: ['x1', 'a1', 'a2'] })
    })

    it('desacoplar uno de los que pasaron debajo lo manda al cementerio y los demás se quedan (también el Xyz que se usó de material)', () => {
      const detached = matReducer(rankUp, { type: 'move', id: 'a1', to: 'gy' })
      expect([detached.emz[0]?.materials, detached.gy]).toEqual([['x1', 'a2'], ['a1']])

      const again = matReducer(detached, { type: 'move', id: 'x1', to: 'gy' })
      expect([again.emz[0]?.materials, again.gy]).toEqual([['a2'], ['a1', 'x1']])
    })

    it('un Xyz con materiales que sale del campo (al cementerio, por Sacrificio o como material de un Enlace) manda todos sus materiales al cementerio, como antes', () => {
      expect(matReducer(underX1, { type: 'move', id: 'x1', to: 'gy' }).gy).toEqual(['a1', 'a2', 'x1'])
      expect(matReducer(underX1, { type: 'tribute', id: 'c1', tributes: ['x1'], zone: 'mz', index: 1, pos: 'atk' }).gy).toEqual(['a1', 'a2', 'x1'])

      const link = matReducer(underX1, { type: 'summon', id: 'x2', how: 'link', materials: ['x1'], zone: 'mz', index: 0, pos: 'atk' })
      expect([link.mz[0]?.id, link.mz[0]?.materials, link.gy]).toEqual(['x2', [], ['a1', 'a2', 'x1']])
    })

    it('una ficha que estuviera debajo no se transfiere: desaparece al pasar a otro Xyz', () => {
      // Jugando no se llega ahí (una ficha no es material Xyz): el caso se arma a mano para ver que la regla no la cuela.
      const withToken: MatState = { ...underX1, mz: underX1.mz.map((card) => (card?.id === 'x1' ? { ...card, materials: [...card.materials, 'token-1'] } : card)) }
      const summoned = matReducer(withToken, { type: 'summon', id: 'x3', how: 'xyz', materials: ['x1'], zone: 'emz', index: 0, pos: 'atk' })
      const attached = matReducer(run([{ type: 'place', id: 'x3', zone: 'emz', index: 0, pos: 'atk' }], withToken), { type: 'attach', id: 'x1', to: 'x3' })

      expect([summoned.emz[0]?.materials, attached.emz[0]?.materials, summoned.gy, attached.gy]).toEqual([['x1', 'a1', 'a2'], ['x1', 'a1', 'a2'], [], []])
      expect(allMatIds(summoned)).not.toContain('token-1')
      expect(allMatIds(attached)).not.toContain('token-1')
    })
  })

  describe('las Zonas Extra de un duelo (no son de nadie hasta que alguien invoca en una: la otra pasa a ser del rival)', () => {
    const free = (state: MatState, rivalEmz?: boolean[]) => freeTargets(state, ['emz'], rivalEmz).map((target) => target.index)
    const inEmz = (index: number, id = 'x1') => ({ type: 'place', id, zone: 'emz', index, pos: 'atk', how: 'special' }) as const

    it('sin nadie en ninguna valen las dos; con un monstruo del rival, la que no es la suya; con uno propio, la otra es del rival', () => {
      const empty = start()

      // Solo (la práctica): valen las dos, sin regla.
      expect(free(empty)).toEqual([0, 1])
      expect(free(empty, [false, false])).toEqual([0, 1])
      // La Zona Extra 0 del rival es la 1 de acá (están enfrentadas), y al revés.
      expect(free(empty, [true, false])).toEqual([0])
      expect(free(empty, [false, true])).toEqual([1])
      // Ya tengo uno en la 0: la 1 es del rival, y yo no tengo otra.
      const mine = run([inEmz(0)])
      expect(free(mine, [false, false])).toEqual([])
      // Si ese monstruo se va (se usa de material), vuelven a estar las dos.
      expect(free(run([{ type: 'move', id: 'x1', to: 'gy' }], mine), [false, false])).toEqual([0, 1])
    })

    it('la Invocación del Extra con materiales se ofrece aunque no quede una zona libre (los materiales la liberan), y soltar una carta en una Zona Extra del rival no ofrece nada', () => {
      const full = run([
        ...['a1', 'a2', 'b1', 'c1', 'd1'].map((id, index) => ({ type: 'place', id, zone: 'mz', index, pos: 'atk' }) as const),
        inEmz(0),
      ])

      // Cinco zonas de monstruo llenas y la Extra 1 bloqueada (hay un monstruo propio en la 0): antes no había salida y no se ofrecía.
      const linkItem = listCardActions(full, 'x2', kindOf, nameOf, [], [false, false])[0]!
      expect([linkItem.label, linkItem.materials, linkItem.targets]).toEqual(['Invocación Especial', true, []])

      const empty = start()
      expect(listDropActions(empty, 'x2', kindOf, nameOf, { zone: 'emz', index: 1 }, [false, false]).length).toBeGreaterThan(0)
      // El rival ocupa su Zona Extra 0, que es la 1 de acá.
      expect(listDropActions(empty, 'x2', kindOf, nameOf, { zone: 'emz', index: 1 }, [true, false])).toEqual([])
    })
  })

  it('el menú ofrece lo que se puede hacer desde donde está la carta', () => {
    const labels = (state: MatState, id: string) => listCardActions(state, id, kindOf, nameOf).map((item) => item.label)

    // Desde la mano, las jugadas de DuelingBook: Invocación Normal, Colocar, Especial, activar, revelar, objetivo, descartar, desterrar (boca arriba o abajo), arriba/abajo del deck.
    expect(labels(start(), 'a1')).toEqual([
      'Invocación Normal',
      'Colocar',
      'Invocación Especial',
      'Activar efecto',
      'Revelar',
      'Target',
      'Descartar',
      'Desterrar',
      'Al deck',
    ])
    // Una Magia se activa o se coloca; una Trampa sólo se coloca desde la mano.
    expect(labels(start(), 'b1')).toEqual(['Activar', 'Colocar', 'Revelar', 'Target', 'Descartar', 'Desterrar', 'Al deck'])
    expect(labels(start(), 'd1')).toEqual(['Activar efecto', 'Colocar', 'Revelar', 'Target', 'Descartar', 'Desterrar', 'Al deck'])
    // "Activar efecto" de una Trampa en mano = sale boca arriba a la zona de Mágicas y Trampas (destella).
    expect(listCardActions(start(), 'd1', kindOf, nameOf)[0]!.action).toMatchObject({ type: 'place', zone: 'st', pos: 'atk' })
    // Desde el Extra sólo Invocación Especial; un Link no va a defensa.
    expect(labels(start(), 'x1')).toEqual(['Invocación Especial', 'Revelar', 'Al cementerio', 'Desterrar'])
    expect(labels(start(), 'x2')).toEqual(['Invocación Especial', 'Revelar', 'Al cementerio', 'Desterrar'])
    // Un Link no pregunta: sale en ataque.
    const link = listCardActions(start(), 'x2', kindOf, nameOf)[0]!
    expect(link.choices).toBeUndefined()
    expect(link.action.type === 'place' && link.action.pos).toBe('atk')
    // La Invocación Normal (siempre en ataque) y Colocar (boca abajo) no preguntan nada; la Especial pregunta en ataque o en defensa después.
    const [normal, set, special] = listCardActions(start(), 'a1', kindOf, nameOf)
    expect([normal, set].map((item) => [item!.label, item!.choices, item!.action.type === 'place' && [item!.action.pos, item!.action.how]])).toEqual([
      ['Invocación Normal', undefined, ['atk', 'normal']],
      ['Colocar', undefined, ['set', 'normal']],
    ])
    expect(special!.label).toBe('Invocación Especial')
    expect(special!.choices?.map((choice) => [choice.label, choice.action.type === 'place' && choice.action.pos])).toEqual([['En ataque', 'atk'], ['En defensa', 'def']])
    // Desde la mano sólo las cinco zonas principales; la Extra Monster Zone es para lo que viene del Extra Deck.
    expect(special!.choices?.[1]?.targets?.map((target) => target.zone)).toEqual(['mz', 'mz', 'mz', 'mz', 'mz'])
    expect(normal!.targets).toHaveLength(5)
    expect(listCardActions(start(), 'x1', kindOf, nameOf)[0]!.choices?.[0]?.targets?.map((target) => target.zone)).toEqual(['mz', 'mz', 'mz', 'mz', 'mz', 'emz', 'emz'])
    // Nivel 7 sin monstruos en el campo: ni Invocación Normal ni Colocar (no hay a quién sacrificar).
    expect(labels(start(), 'c1').slice(0, 1)).toEqual(['Invocación Especial'])
    expect(labels(start(), 'c1')).not.toContain('Invocación Normal')

    const played = run([
      { type: 'place', id: 'x1', zone: 'emz', index: 0, pos: 'atk' },
      { type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'atk' },
      { type: 'attach', id: 'a2', to: 'x1' },
      { type: 'place', id: 'c1', zone: 'mz', index: 1, pos: 'set' },
      { type: 'move', id: 'e1', to: 'gy' },
    ])
    expect(labels(played, 'a1')).toEqual(['Activar efecto', 'Pasar a defensa', 'Poner boca abajo', 'Adjuntar a X1', 'Target', 'A la zona de Mágicas y Trampas', 'A la mano', 'Al cementerio', 'Desterrar', 'Al deck'])
    expect(labels(played, 'x1')).toEqual(['Activar efecto', 'Pasar a defensa', 'Poner boca abajo', 'Desacoplar A2', 'Target', 'A la zona de Mágicas y Trampas', 'A la mano', 'Al cementerio', 'Desterrar', 'Al Extra Deck'])
    expect(labels(played, 'a2')).toEqual(['Desacoplar al cementerio', 'Desterrar', 'A la mano'])
    // Boca abajo: Invocación por Volteo (a ataque) o voltear boca arriba (queda en defensa).
    expect(labels(played, 'c1').slice(0, 2)).toEqual(['Invocación por Volteo', 'Voltear boca arriba'])
    // Desde el cementerio: Invocación Especial (a una zona principal), a Mágicas/Trampas, a la mano, destierro y de vuelta al deck (arriba o abajo).
    expect(labels(played, 'e1')).toEqual(['Invocación Especial', 'A la zona de Mágicas y Trampas', 'Activar efecto', 'A la mano', 'Target', 'Desterrar', 'Al deck'])
    expect(listCardActions(played, 'e1', kindOf, nameOf)[0]!.choices?.[0]?.targets?.every((target) => target.zone === 'mz')).toBe(true)
    expect(labels(played, 'zzz')).toEqual([])

    // Desterrar es una sola opción, desde donde esté la carta (mano, campo, material, cementerio, Extra), y pregunta boca arriba o boca abajo.
    for (const [state, id] of [[start(), 'a1'], [start(), 'x1'], [played, 'a1'], [played, 'a2'], [played, 'e1']] as const) {
      const banish = listCardActions(state, id, kindOf, nameOf).filter((item) => item.label === 'Desterrar')

      expect(banish.map((item) => item.choices?.map((choice) => choice.label))).toEqual([['Boca arriba', 'Boca abajo']])
      expect(banish[0]!.choices?.map((choice) => choice.action)).toEqual([{ type: 'move', id, to: 'banished' }, { type: 'move', id, to: 'banished', faceDown: true }])
      expect(banish[0]!.action).toEqual({ type: 'move', id, to: 'banished' })
    }

    // Con dos monstruos en el campo, el Nivel 7 ofrece la Invocación Normal y Colocar de siempre (por Sacrificio es una Invocación Normal, no otra jugada); la mesa pide los Sacrificios y la zona al elegirlas.
    const two = run([{ type: 'place', id: 'x1', zone: 'emz', index: 0, pos: 'atk' }, { type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'atk' }])
    const [bySacrifice, setBySacrifice] = listCardActions(two, 'c1', kindOf, nameOf)
    expect([bySacrifice, setBySacrifice].map((item) => [item!.label, item!.tributes, item!.choices, item!.action.type === 'tribute' && item!.action.pos])).toEqual([
      ['Invocación Normal', 2, undefined, 'atk'],
      ['Colocar', 2, undefined, 'set'],
    ])
    expect(bySacrifice!.action).toEqual({ type: 'tribute', id: 'c1', tributes: [], zone: 'mz', index: 0, pos: 'atk' })
    // Con un solo monstruo alcanza para el Nivel 5 pero no para el 7.
    const one = run([{ type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'atk' }, { type: 'move', id: 'e1', to: 'hand' }])
    expect(listCardActions(one, 'e1', kindOf, nameOf)[0]).toMatchObject({ label: 'Invocación Normal', tributes: 1 })
    expect(labels(one, 'c1')).not.toContain('Invocación Normal')

    // Una Mágica de Campo en el deck se puede activar directo (sale a la zona de campo); otra Mágica, no.
    const fieldSpell: MatCardKind = { ...SPELL, fieldSpell: true }
    const withField = (id: string) => (id === 'f1' ? fieldSpell : kindOf(id))
    const inDeck = matReducer(start(), { type: 'move', id: 'b1', to: 'deck' })
    expect(listCardActions(inDeck, 'f1', withField, nameOf).slice(0, 2).map((item) => [item.label, item.action.type === 'place' && item.action.zone])).toEqual([['A la mano', false], ['Activar', 'field']])
    expect(listCardActions(inDeck, 'b1', withField, nameOf).map((item) => item.label)).not.toContain('Activar')

    // Colocar boca abajo directo desde el Deck: la Mágica o Trampa a su zona (la de Campo, a la de campo) y el monstruo a una Zona de Monstruo; la carta sale sin revelarse.
    const setOf = (state: MatState, id: string) => listCardActions(state, id, withField, nameOf).find((item) => item.label === 'Colocar')
    expect(setOf(inDeck, 'f1')?.action).toMatchObject({ type: 'place', id: 'f1', zone: 'field', pos: 'set' })
    expect(setOf(inDeck, 'b1')?.action).toMatchObject({ type: 'place', id: 'b1', zone: 'st', pos: 'set' })
    const monsterInDeck = matReducer(start(), { type: 'move', id: 'a1', to: 'deck' })
    expect(setOf(monsterInDeck, 'a1')?.action).toMatchObject({ type: 'place', id: 'a1', zone: 'mz', pos: 'set' })
    expect(describeMatAction(monsterInDeck, setOf(monsterInDeck, 'a1')!.action, nameOf)).toBe('Colocás A1 boca abajo')
    expect(describeMatAction(inDeck, setOf(inDeck, 'b1')!.action, nameOf)).toBe('Colocás B1')
    // Desde el Extra no: los monstruos del Extra no se colocan.
    expect(listCardActions(start(), 'x1', withField, nameOf).map((item) => item.label)).not.toContain('Colocar')

    // Sin zonas de monstruo libres no se ofrece invocar.
    const fillers: MatAction[] = [
      ...[0, 1, 2, 3, 4].map((index): MatAction => ({ type: 'token', zone: 'mz', index })),
      ...[0, 1].map((index): MatAction => ({ type: 'token', zone: 'emz', index })),
    ]
    const full = run(fillers)
    expect(labels(full, 'a1')).not.toContain('Invocación Normal')
    expect(labels(full, 'a1')).not.toContain('Invocación Especial')
    // Las fichas no se colocan boca abajo ni tienen efecto.
    expect(labels(full, 'token-1')).toEqual(['Pasar a defensa', 'Target', 'Quitar la ficha'])
  })

  it('soltar una carta en una zona ofrece el mismo menú que al tocarla, apuntado a esa zona y con las preguntas para después', () => {
    const drop = (state: MatState, id: string, zone: 'mz' | 'emz' | 'st' | 'field', index: number) => listDropActions(state, id, kindOf, nameOf, { zone, index })
    const labels = (items: ReturnType<typeof drop>) => items.map((item) => item.label)

    // Un monstruo de la mano en una zona principal: Invocación Normal, Colocar y la Especial, que pregunta la posición cuando se la elige.
    const items = drop(start(), 'a1', 'mz', 2)
    expect(labels(items)).toEqual(['Invocación Normal', 'Colocar', 'Invocación Especial'])
    expect(items.map((item) => [item.action.type === 'place' && [item.action.zone, item.action.index, item.action.pos, item.action.how], item.targets])).toEqual([
      [['mz', 2, 'atk', 'normal'], [{ zone: 'mz', index: 2 }]],
      [['mz', 2, 'set', 'normal'], [{ zone: 'mz', index: 2 }]],
      [['mz', 2, 'atk', 'special'], undefined],
    ])
    expect(items[2]!.choices?.map((choice) => [choice.label, choice.action.type === 'place' && [choice.action.zone, choice.action.index, choice.action.pos], choice.targets])).toEqual([
      ['En ataque', ['mz', 2, 'atk'], [{ zone: 'mz', index: 2 }]],
      ['En defensa', ['mz', 2, 'def'], [{ zone: 'mz', index: 2 }]],
    ])

    // Sólo lo que la saca ahí: de la mano no se cae en la Extra Monster Zone ni en la zona de Mágicas y Trampas, y no se ofrecen descartes ni otros destinos.
    expect(drop(start(), 'a1', 'emz', 0)).toEqual([])
    expect(drop(start(), 'a1', 'st', 1)).toEqual([])
    expect(drop(start(), 'b1', 'mz', 0)).toEqual([])
    expect(labels(drop(start(), 'b1', 'st', 1))).toEqual(['Activar', 'Colocar'])
    expect(labels(drop(start(), 'd1', 'st', 3))).toEqual(['Activar efecto', 'Colocar'])

    // Nivel 7: sin monstruos para sacrificar sólo la Especial (que pregunta directo); con dos, la Invocación Normal y Colocar de siempre, ya en la zona.
    expect(labels(drop(start(), 'c1', 'mz', 0))).toEqual(['Invocación Especial'])
    const two = run([{ type: 'place', id: 'x1', zone: 'emz', index: 0, pos: 'atk' }, { type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'atk' }])
    const sacrifice = drop(two, 'c1', 'mz', 3)
    expect(labels(sacrifice)).toEqual(['Invocación Normal', 'Colocar', 'Invocación Especial'])
    expect(sacrifice.map((item) => [item.tributes, item.action.type === 'tribute' && [item.action.zone, item.action.index, item.action.pos]])).toEqual([[2, ['mz', 3, 'atk']], [2, ['mz', 3, 'set']], [undefined, false]])
    expect(drop(two, 'c1', 'st', 0)).toEqual([])

    // Un Link del Extra no pregunta la posición: una sola jugada, ya apuntada a la zona.
    const link = drop(start(), 'x2', 'mz', 1)
    expect(link).toHaveLength(1)
    expect([link[0]!.label, link[0]!.choices, link[0]!.action]).toEqual(['Invocación Especial', undefined, expect.objectContaining({ type: 'place', zone: 'mz', index: 1, pos: 'atk', how: 'special' })])
    // Una zona ocupada no ofrece nada (la mesa no deja soltar ahí).
    expect(drop(run([{ type: 'place', id: 'a2', zone: 'mz', index: 1, pos: 'atk' }]), 'a1', 'mz', 1)).toEqual([])
  })

  it('reconoce el tipo de carta por el marco y el subtipo', () => {
    const card = (frameType: string, race = '', level: number | null = 4): ApiCardReference => ({ frameType, race, level } as ApiCardReference)

    expect(cardKindOf(card('effect'))).toEqual(MONSTER)
    expect(cardKindOf(card('effect', '', 7))).toEqual({ ...MONSTER, level: 7 })
    expect(cardKindOf(card('normal'))).toEqual({ ...MONSTER, effect: false })
    expect(cardKindOf(card('xyz'))).toEqual(XYZ)
    expect(cardKindOf(card('link', '', null))).toEqual(LINK)
    expect(cardKindOf(card('effect_pendulum'))).toEqual({ ...MONSTER, pendulum: true })
    expect(cardKindOf(card('spell', '', null))).toEqual(SPELL)
    expect(cardKindOf(card('spell', 'Field', null))).toEqual({ ...SPELL, fieldSpell: true })
    expect(cardKindOf(card('trap', '', null))).toEqual(TRAP)
    expect(cardKindOf(null)).toEqual({ ...SPELL, spell: false, effect: false })
    expect(tributesFor(4)).toBe(0)
    expect(tributesFor(5)).toBe(1)
    expect(tributesFor(6)).toBe(1)
    expect(tributesFor(7)).toBe(2)
    expect(tributesFor(12)).toBe(2)
    expect(tributesFor(null)).toBe(0)
  })

  it('ninguna secuencia de jugadas pierde ni duplica cartas', () => {
    const ids = [...DECK, ...EXTRA]
    const id = fc.constantFrom(...ids, 'token-1', 'token-2', 'nope')
    const pos = fc.constantFrom<MatPos>('atk', 'def', 'set')
    const action: fc.Arbitrary<MatAction> = fc.oneof(
      fc.record({ type: fc.constant('draw' as const), count: fc.integer({ min: 0, max: 3 }) }),
      fc.record({ type: fc.constant('mill' as const), count: fc.integer({ min: 0, max: 3 }) }),
      fc.record({ type: fc.constant('shuffle' as const), seed: fc.integer({ min: 0, max: 1000 }) }),
      fc.record({ type: fc.constant('move' as const), id, to: fc.constantFrom('deck', 'deck-bottom', 'extra', 'hand', 'gy', 'banished'), faceDown: fc.boolean(), shuffle: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }) }),
      fc.record({ type: fc.constant('declare' as const), id }),
      fc.record({ type: fc.constant('target' as const), id }),
      fc.record({ type: fc.constant('place' as const), id, zone: fc.constantFrom('mz', 'emz', 'st', 'field'), index: fc.integer({ min: -1, max: 5 }), pos, shuffle: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }) }),
      fc.record({ type: fc.constant('attach' as const), id, to: id }),
      fc.record({ type: fc.constant('position' as const), id, pos }),
      fc.record({ type: fc.constant('counter' as const), id, delta: fc.integer({ min: -2, max: 2 }) }),
      fc.record({ type: fc.constant('token' as const), zone: fc.constantFrom('mz', 'emz', 'st'), index: fc.integer({ min: -1, max: 5 }), pos: fc.constantFrom<'atk' | 'def' | undefined>('atk', 'def', undefined) }),
      fc.record({ type: fc.constant('activate' as const), id, cost: fc.constantFrom(undefined, 'discard' as const, 'banish' as const) }),
      fc.record({ type: fc.constant('reveal' as const), id }),
      fc.record({ type: fc.constant('tribute' as const), id, tributes: fc.array(id, { maxLength: 2 }), zone: fc.constantFrom('mz', 'emz'), index: fc.integer({ min: -1, max: 5 }), pos }),
      fc.record({ type: fc.constant('phase' as const), phase: fc.constantFrom('draw', 'standby', 'main1', 'battle', 'main2', 'end') }),
    )

    fc.assert(
      fc.property(fc.array(action, { maxLength: 40 }), (actions) => {
        const state = run(actions)
        const live = allMatIds(state)
        const cards = live.filter((card) => !card.startsWith('token-')).sort()

        expect(cards).toEqual([...ids].sort())
        expect(new Set(live).size).toBe(live.length)
        // Lo boca abajo es siempre un subconjunto del destierro.
        expect(state.facedown.every((card) => state.banished.includes(card))).toBe(true)
        expect(state.targeted.every((card) => live.includes(card))).toBe(true)
        expect(state.deck.length + state.hand.length + state.gy.length).toBeLessThanOrEqual(ids.length)
      }),
    )
  })
})
