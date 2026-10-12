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
  tributesFor,
  type MatAction,
  type MatCardKind,
  type MatPos,
  type MatState,
} from '../app/practice-mat'
import type { ApiCardReference } from '../types'

const MONSTER: MatCardKind = { monster: true, spell: false, trap: false, extra: false, effect: true, fieldSpell: false, pendulum: false, xyz: false, link: false, level: 4 }
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

  it('la Invocación por Sacrificio manda los sacrificios al cementerio y saca la carta, incluso a la zona que se liberó', () => {
    const two = run([{ type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'atk' }, { type: 'place', id: 'a2', zone: 'mz', index: 1, pos: 'def' }])
    const summoned = matReducer(two, { type: 'tribute', id: 'c1', tributes: ['a1', 'a2'], zone: 'mz', index: 0, pos: 'atk' })

    expect(summoned.gy).toEqual(['a1', 'a2'])
    expect(summoned.mz[0]?.id).toBe('c1')
    expect(summoned.mz[1]).toBeNull()
    expect(summoned.hand).not.toContain('c1')
    expect(describeMatAction(two, { type: 'tribute', id: 'c1', tributes: ['a1', 'a2'], zone: 'mz', index: 0, pos: 'atk' }, nameOf)).toBe('Invocación por Sacrificio de C1 (sacrificás A1 y A2)')
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
    expect(describe({ type: 'token', zone: 'mz', index: 1 }, played)).toBe('Ficha en la zona 2')

    // Activar con costo mueve la carta; sin costo y revelar sólo quedan anotados.
    expect(matReducer(state, { type: 'activate', id: 'a1', cost: 'discard' }).gy).toEqual(['a1'])
    expect(matReducer(state, { type: 'activate', id: 'a1' })).toBe(state)
    expect(matReducer(state, { type: 'reveal', id: 'a1' })).toBe(state)
    expect(matReducer(state, { type: 'declare', id: 'a1' })).toBe(state)
    expect(describe({ type: 'declare', id: 'a1' })).toBe('Declarás A1')

    // Desterrar boca abajo se recuerda hasta que la carta deja el destierro.
    const hidden = matReducer(state, { type: 'move', id: 'a1', to: 'banished', faceDown: true })
    expect(hidden.facedown).toEqual(['a1'])
    expect(describe({ type: 'move', id: 'a1', to: 'banished', faceDown: true })).toBe('Desterrás A1 boca abajo')
    expect(matReducer(hidden, { type: 'move', id: 'a1', to: 'hand' }).facedown).toEqual([])
    expect(matReducer(state, { type: 'move', id: 'a1', to: 'gy', faceDown: true }).facedown).toEqual([])

    expect(describeMatSteps(state, [{ type: 'draw', count: 1 }, { type: 'draw', count: 1 }], nameOf)).toEqual(['Robás E1', 'Robás F1'])
  })

  it('el menú ofrece lo que se puede hacer desde donde está la carta', () => {
    const labels = (state: MatState, id: string) => listCardActions(state, id, kindOf, nameOf).map((item) => item.label)

    // Desde la mano, las 11 jugadas de DuelingBook: Invocación Normal, Colocar, Especial, revelar, declarar, descartar, desterrar (boca arriba o abajo), arriba/abajo del deck.
    expect(labels(start(), 'a1')).toEqual([
      'Invocación Normal',
      'Colocar boca abajo',
      'Invocación Especial en ataque',
      'Invocación Especial en defensa',
      'Revelar',
      'Declarar',
      'Descartar',
      'Desterrar',
      'Desterrar boca abajo',
      'Arriba del deck',
      'Abajo del deck',
    ])
    // Una Magia se activa o se coloca; una Trampa sólo se coloca desde la mano.
    expect(labels(start(), 'b1')).toEqual(['Activar', 'Colocar', 'Revelar', 'Declarar', 'Descartar', 'Desterrar', 'Desterrar boca abajo', 'Arriba del deck', 'Abajo del deck'])
    expect(labels(start(), 'd1')).toEqual(['A la zona de Mágicas y Trampas', 'Colocar', 'Revelar', 'Declarar', 'Descartar', 'Desterrar', 'Desterrar boca abajo', 'Arriba del deck', 'Abajo del deck'])
    // Desde el Extra sólo Invocación Especial; un Link no va a defensa.
    expect(labels(start(), 'x1')).toEqual(['Invocación Especial en ataque', 'Invocación Especial en defensa', 'Al cementerio', 'Desterrar', 'Desterrar boca abajo'])
    expect(labels(start(), 'x2')).toEqual(['Invocación Especial en ataque', 'Al cementerio', 'Desterrar', 'Desterrar boca abajo'])
    // Nivel 7 sin monstruos en el campo: ni Invocación Normal ni por Sacrificio.
    expect(labels(start(), 'c1').slice(0, 2)).toEqual(['Invocación Especial en ataque', 'Invocación Especial en defensa'])
    expect(labels(start(), 'c1')).not.toContain('Invocación Normal')

    const played = run([
      { type: 'place', id: 'x1', zone: 'emz', index: 0, pos: 'atk' },
      { type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'atk' },
      { type: 'attach', id: 'a2', to: 'x1' },
      { type: 'place', id: 'c1', zone: 'mz', index: 1, pos: 'set' },
      { type: 'move', id: 'e1', to: 'gy' },
    ])
    expect(labels(played, 'a1')).toEqual(['Activar efecto', 'Pasar a defensa', 'Poner boca abajo', 'Adjuntar a X1', 'Contador +1', 'A la zona de Mágicas y Trampas', 'A la mano', 'Sacrificar (al cementerio)', 'Desterrar', 'Desterrar boca abajo', 'Arriba del deck', 'Abajo del deck'])
    expect(labels(played, 'x1')).toEqual(['Activar efecto', 'Pasar a defensa', 'Poner boca abajo', 'Contador +1', 'Desacoplar A2', 'A la zona de Mágicas y Trampas', 'A la mano', 'Sacrificar (al cementerio)', 'Desterrar', 'Desterrar boca abajo', 'Al Extra Deck'])
    expect(labels(played, 'a2')).toEqual(['Desacoplar al cementerio', 'Desterrar', 'A la mano'])
    // Boca abajo: Invocación por Volteo (a ataque) o voltear boca arriba (queda en defensa).
    expect(labels(played, 'c1').slice(0, 2)).toEqual(['Invocación por Volteo', 'Voltear boca arriba'])
    // Desde el cementerio, como en DuelingBook: Invocación Especial, a Mágicas/Trampas, a la mano, destierro (sin arriba/abajo del deck).
    expect(labels(played, 'e1')).toEqual(['Invocación Especial en ataque', 'Invocación Especial en defensa', 'A la zona de Mágicas y Trampas', 'A la mano', 'Desterrar', 'Desterrar boca abajo'])
    expect(labels(played, 'zzz')).toEqual([])

    // Con dos monstruos en el campo, el Nivel 7 ofrece la Invocación (y Colocar) por Sacrificio, que la mesa completa.
    const two = run([{ type: 'place', id: 'x1', zone: 'emz', index: 0, pos: 'atk' }, { type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'atk' }])
    const bySacrifice = listCardActions(two, 'c1', kindOf, nameOf).slice(0, 2)
    expect(bySacrifice.map((item) => [item.label, item.tributes])).toEqual([['Invocación por Sacrificio (2)', 2], ['Colocar por Sacrificio (2)', 2]])
    expect(bySacrifice[0]!.action).toEqual({ type: 'tribute', id: 'c1', tributes: [], zone: 'mz', index: 0, pos: 'atk' })
    // Con un solo monstruo alcanza para el Nivel 5 pero no para el 7.
    const one = run([{ type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'atk' }, { type: 'move', id: 'e1', to: 'hand' }])
    expect(labels(one, 'e1')[0]).toBe('Invocación por Sacrificio (1)')
    expect(labels(one, 'c1')).not.toContain('Invocación por Sacrificio (2)')

    // Sin zonas de monstruo libres no se ofrece invocar.
    const fillers: MatAction[] = [
      ...[0, 1, 2, 3, 4].map((index): MatAction => ({ type: 'token', zone: 'mz', index })),
      ...[0, 1].map((index): MatAction => ({ type: 'token', zone: 'emz', index })),
    ]
    const full = run(fillers)
    expect(labels(full, 'a1')).not.toContain('Invocación Normal')
    expect(labels(full, 'a1')).not.toContain('Invocación Especial en ataque')
    // Las fichas no se colocan boca abajo ni tienen efecto.
    expect(labels(full, 'token-1')).toEqual(['Pasar a defensa', 'Contador +1', 'Sacrificar / quitar la ficha'])
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
      fc.record({ type: fc.constant('move' as const), id, to: fc.constantFrom('deck', 'deck-bottom', 'extra', 'hand', 'gy', 'banished'), faceDown: fc.boolean() }),
      fc.record({ type: fc.constant('declare' as const), id }),
      fc.record({ type: fc.constant('place' as const), id, zone: fc.constantFrom('mz', 'emz', 'st', 'field'), index: fc.integer({ min: -1, max: 5 }), pos }),
      fc.record({ type: fc.constant('attach' as const), id, to: id }),
      fc.record({ type: fc.constant('position' as const), id, pos }),
      fc.record({ type: fc.constant('counter' as const), id, delta: fc.integer({ min: -2, max: 2 }) }),
      fc.record({ type: fc.constant('token' as const), zone: fc.constantFrom('mz', 'emz', 'st'), index: fc.integer({ min: -1, max: 5 }) }),
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
        expect(state.deck.length + state.hand.length + state.gy.length).toBeLessThanOrEqual(ids.length)
      }),
    )
  })
})
