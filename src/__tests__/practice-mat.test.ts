import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  allMatIds,
  cardKindOf,
  createMatState,
  describeMatAction,
  describeMatSteps,
  listCardActions,
  locateCard,
  matReducer,
  replayMat,
  shuffleWithSeed,
  TOKEN_KIND,
  type MatAction,
  type MatCardKind,
  type MatPos,
  type MatState,
} from '../app/practice-mat'
import type { ApiCardReference } from '../types'

const MONSTER: MatCardKind = { monster: true, extra: false, fieldSpell: false, pendulum: false, xyz: false }
const XYZ: MatCardKind = { ...MONSTER, extra: true, xyz: true }
const SPELL: MatCardKind = { monster: false, extra: false, fieldSpell: false, pendulum: false, xyz: false }

const DECK = ['a1', 'a2', 'b1', 'c1', 'd1', 'e1', 'f1']
const EXTRA = ['x1', 'x2']
const KINDS: Record<string, MatCardKind> = { a1: MONSTER, a2: MONSTER, b1: SPELL, c1: MONSTER, d1: SPELL, e1: MONSTER, f1: MONSTER, x1: XYZ, x2: XYZ }
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

  it('las fichas se numeran y desaparecen al salir del campo', () => {
    const state = run([
      { type: 'token', zone: 'mz', index: 0 },
      { type: 'token', zone: 'mz', index: 1 },
    ])

    expect(state.mz[0]?.id).toBe('token-1')
    expect(state.mz[1]?.id).toBe('token-2')
    expect(matReducer(state, { type: 'token', zone: 'mz', index: 0 })).toBe(state)

    const removed = matReducer(state, { type: 'move', id: 'token-1', to: 'gy' })
    expect(removed.mz[0]).toBeNull()
    expect(removed.gy).toEqual([])
    expect(allMatIds(removed)).not.toContain('token-1')
    expect(matReducer(state, { type: 'attach', id: 'token-2', to: 'token-1' })).toBe(state)
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
    expect(describe({ type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'atk' })).toBe('Invocás A1 en ataque')
    expect(describe({ type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'set' })).toBe('Colocás A1 boca abajo')
    expect(describe({ type: 'place', id: 'b1', zone: 'st', index: 0, pos: 'atk' })).toBe('Activás B1')
    expect(describe({ type: 'place', id: 'b1', zone: 'st', index: 0, pos: 'set' })).toBe('Colocás B1')
    expect(describe({ type: 'move', id: 'e1', to: 'hand' })).toBe('Buscás E1 del deck a la mano')
    expect(describe({ type: 'move', id: 'a1', to: 'gy' })).toBe('A1 va al cementerio')
    expect(describe({ type: 'move', id: 'a1', to: 'banished' })).toBe('Desterrás A1')
    expect(describe({ type: 'move', id: 'a1', to: 'deck-bottom' })).toBe('Ponés A1 abajo del deck')

    const played = run([{ type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'set' }, { type: 'move', id: 'a2', to: 'gy' }])
    expect(describe({ type: 'position', id: 'a1', pos: 'atk' }, played)).toBe('Volteás A1')
    expect(describe({ type: 'move', id: 'a2', to: 'hand' }, played)).toBe('Recuperás A2 del cementerio')
    expect(describe({ type: 'move', id: 'a1', to: 'hand' }, played)).toBe('A1 vuelve a la mano')
    expect(describe({ type: 'token', zone: 'mz', index: 1 }, played)).toBe('Ficha en la zona 2')

    expect(describeMatSteps(state, [{ type: 'draw', count: 1 }, { type: 'draw', count: 1 }], nameOf)).toEqual(['Robás E1', 'Robás F1'])
  })

  it('el menú ofrece lo que se puede hacer desde donde está la carta', () => {
    const labels = (state: MatState, id: string) => listCardActions(state, id, kindOf, nameOf).map((item) => item.label)

    expect(labels(start(), 'a1')).toEqual(['Invocar en ataque', 'Invocar en defensa', 'Colocar boca abajo', 'Al cementerio', 'Desterrar', 'Arriba del deck', 'Abajo del deck'])
    expect(labels(start(), 'b1')).toEqual(['Activar', 'Colocar', 'Al cementerio', 'Desterrar', 'Arriba del deck', 'Abajo del deck'])
    expect(labels(start(), 'x1')).toEqual(['Invocar en ataque', 'Invocar en defensa', 'A la mano', 'Al cementerio', 'Desterrar'])

    const played = run([
      { type: 'place', id: 'x1', zone: 'emz', index: 0, pos: 'atk' },
      { type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'atk' },
      { type: 'attach', id: 'a2', to: 'x1' },
    ])
    expect(labels(played, 'a1')).toEqual(['Pasar a defensa', 'Poner boca abajo', 'Adjuntar a X1', 'Contador +1', 'A la mano', 'Al cementerio', 'Desterrar', 'Arriba del deck', 'Abajo del deck'])
    expect(labels(played, 'x1')).toEqual(['Pasar a defensa', 'Poner boca abajo', 'Contador +1', 'Desacoplar A2', 'A la mano', 'Al cementerio', 'Desterrar', 'Al Extra Deck'])
    expect(labels(played, 'a2')).toEqual(['Desacoplar al cementerio', 'Desterrar', 'A la mano'])
    expect(labels(played, 'zzz')).toEqual([])

    // Sin zonas de monstruo libres no se ofrece invocar.
    const fillers: MatAction[] = [
      ...[0, 1, 2, 3, 4].map((index): MatAction => ({ type: 'token', zone: 'mz', index })),
      ...[0, 1].map((index): MatAction => ({ type: 'token', zone: 'emz', index })),
    ]
    const full = run(fillers)
    expect(labels(full, 'a1')).not.toContain('Invocar en ataque')
    expect(labels(full, 'token-1')).toEqual(['Pasar a defensa', 'Poner boca abajo', 'Contador +1', 'Quitar la ficha'])
  })

  it('reconoce el tipo de carta por el marco y el subtipo', () => {
    const card = (frameType: string, race = ''): ApiCardReference => ({ frameType, race } as ApiCardReference)

    expect(cardKindOf(card('effect'))).toEqual(MONSTER)
    expect(cardKindOf(card('xyz'))).toEqual(XYZ)
    expect(cardKindOf(card('effect_pendulum'))).toEqual({ ...MONSTER, pendulum: true })
    expect(cardKindOf(card('spell'))).toEqual(SPELL)
    expect(cardKindOf(card('spell', 'Field'))).toEqual({ ...SPELL, fieldSpell: true })
    expect(cardKindOf(card('trap'))).toEqual(SPELL)
    expect(cardKindOf(null)).toEqual({ ...SPELL, monster: false })
  })

  it('ninguna secuencia de jugadas pierde ni duplica cartas', () => {
    const ids = [...DECK, ...EXTRA]
    const id = fc.constantFrom(...ids, 'token-1', 'token-2', 'nope')
    const pos = fc.constantFrom<MatPos>('atk', 'def', 'set')
    const action: fc.Arbitrary<MatAction> = fc.oneof(
      fc.record({ type: fc.constant('draw' as const), count: fc.integer({ min: 0, max: 3 }) }),
      fc.record({ type: fc.constant('mill' as const), count: fc.integer({ min: 0, max: 3 }) }),
      fc.record({ type: fc.constant('shuffle' as const), seed: fc.integer({ min: 0, max: 1000 }) }),
      fc.record({ type: fc.constant('move' as const), id, to: fc.constantFrom('deck', 'deck-bottom', 'extra', 'hand', 'gy', 'banished') }),
      fc.record({ type: fc.constant('place' as const), id, zone: fc.constantFrom('mz', 'emz', 'st', 'field'), index: fc.integer({ min: -1, max: 5 }), pos }),
      fc.record({ type: fc.constant('attach' as const), id, to: id }),
      fc.record({ type: fc.constant('position' as const), id, pos }),
      fc.record({ type: fc.constant('counter' as const), id, delta: fc.integer({ min: -2, max: 2 }) }),
      fc.record({ type: fc.constant('token' as const), zone: fc.constantFrom('mz', 'emz', 'st'), index: fc.integer({ min: -1, max: 5 }) }),
    )

    fc.assert(
      fc.property(fc.array(action, { maxLength: 40 }), (actions) => {
        const state = run(actions)
        const live = allMatIds(state)
        const cards = live.filter((card) => !card.startsWith('token-')).sort()

        expect(cards).toEqual([...ids].sort())
        expect(new Set(live).size).toBe(live.length)
        expect(state.deck.length + state.hand.length + state.gy.length).toBeLessThanOrEqual(ids.length)
      }),
    )
  })
})
