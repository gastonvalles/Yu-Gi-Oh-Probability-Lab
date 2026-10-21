import { describe, expect, it } from 'vitest'

import { boardChange, describeStep, describeSteps, matStates } from '../app/mat-step-info'
import { createMatState, matReducer, replayMat, type MatAction } from '../app/practice-mat'

// La mano son las primeras cinco (a-e); el deck sigue con f y g; el Extra, con un Xyz.
const start = createMatState(['a', 'b', 'c', 'd', 'e', 'f', 'g'], ['x1'], 5)
const inHand = { kind: 'pile', pile: 'hand' } as const
const zone = (spot: 'mz' | 'emz' | 'st' | 'field', n: number) => ({ kind: 'zone', spot, n }) as const

describe('la clase, el origen y lo que se mueve en cada jugada', () => {
  it('una Invocación Normal: sale de la mano a una zona de monstruo, y se enmarcan las dos', () => {
    const info = describeStep(start, { type: 'place', id: 'a', zone: 'mz', index: 0, pos: 'atk' })

    expect(info.kind).toBe('normal')
    expect(info.origin).toBe('hand')
    expect(info.card).toBe('a')
    expect(info.moves).toEqual([{ id: 'a', from: inHand, to: zone('mz', 1) }])
    expect([...info.change.spots]).toEqual(['mz:0'])
    expect([...info.change.piles]).toEqual(['hand'])
  })

  it('colocar boca abajo es «Colocar»; una Mágica boca arriba, «Activar»', () => {
    expect(describeStep(start, { type: 'place', id: 'a', zone: 'mz', index: 0, pos: 'set' }).kind).toBe('set')
    expect(describeStep(start, { type: 'place', id: 'b', zone: 'st', index: 2, pos: 'set' }).kind).toBe('set')
    expect(describeStep(start, { type: 'place', id: 'c', zone: 'st', index: 1, pos: 'atk' }).kind).toBe('activate')
  })

  it('activar un efecto, atacar o marcar un objetivo no mueven nada: lleva la carta, de dónde sale y ninguna casilla cambia', () => {
    const played = replayMat(start, [{ type: 'place', id: 'a', zone: 'mz', index: 0, pos: 'atk' }])

    for (const [action, kind] of [
      [{ type: 'activate', id: 'b' }, 'activate'],
      [{ type: 'activate', id: 'a' }, 'activate'],
      [{ type: 'attack', id: 'a' }, 'attack'],
      [{ type: 'target', id: 'a' }, 'target'],
      [{ type: 'reveal', id: 'c' }, 'reveal'],
      [{ type: 'declare', id: 'c' }, 'declare'],
    ] as const) {
      const info = describeStep(played, action)

      expect(info.kind).toBe(kind)
      expect(info.moves).toEqual([])
    }

    expect(describeStep(played, { type: 'activate', id: 'b' })).toMatchObject({ origin: 'hand', card: 'b' })
    expect(describeStep(played, { type: 'attack', id: 'a' })).toMatchObject({ origin: 'field', card: 'a' })
    // Marcar un objetivo cambia la marca, no el lugar: ninguna casilla queda distinta.
    expect(describeStep(played, { type: 'target', id: 'a' }).change.spots.size).toBe(0)
  })

  it('robar saca del deck (y no dice qué carta si la jugada no la nombra): la carta que llega a la mano es lo que se mueve', () => {
    const info = describeStep(start, { type: 'draw', count: 1 })

    expect(info).toMatchObject({ kind: 'draw', origin: 'deck', card: null })
    expect(info.moves).toEqual([{ id: 'f', from: { kind: 'pile', pile: 'deck' }, to: { kind: 'pile', pile: 'hand' } }])
    expect([...info.change.piles].sort()).toEqual(['deck', 'hand'])
  })

  it('mandar cartas del deck al cementerio, barajar, y la ficha que aparece de la nada', () => {
    expect(describeStep(start, { type: 'mill', count: 2 })).toMatchObject({ kind: 'mill', origin: 'deck' })
    expect(describeStep(start, { type: 'mill', count: 2 }).moves.map((move) => move.id)).toEqual(['f', 'g'])

    const shuffled = describeStep(start, { type: 'shuffle', seed: 7 })

    expect(shuffled.kind).toBe('shuffle')
    expect(shuffled.moves).toEqual([])
    // Barajar el deck cambia el orden, no la cantidad: no se enmarca.
    expect(shuffled.change.piles.size).toBe(0)

    const token = describeStep(start, { type: 'token', zone: 'mz', index: 1 })

    expect(token.kind).toBe('token')
    expect(token.moves).toEqual([{ id: 'token-1', from: null, to: zone('mz', 2) }])
  })

  it('una Invocación Xyz: el monstruo sale del Extra Deck y los materiales quedan debajo', () => {
    const board = replayMat(start, [
      { type: 'place', id: 'a', zone: 'mz', index: 0, pos: 'atk' },
      { type: 'place', id: 'b', zone: 'mz', index: 1, pos: 'atk' },
    ])
    const info = describeStep(board, { type: 'summon', id: 'x1', how: 'xyz', materials: ['a', 'b'], zone: 'emz', index: 0, pos: 'atk' })

    expect(info.kind).toBe('xyz')
    expect(info.origin).toBe('extra')
    // La carta de la jugada va primero.
    expect(info.moves.map((move) => move.id)).toEqual(['x1', 'a', 'b'])
    expect(info.moves[0]).toEqual({ id: 'x1', from: { kind: 'pile', pile: 'extra' }, to: zone('emz', 1) })
    expect(info.moves[1]).toEqual({ id: 'a', from: zone('mz', 1), to: { kind: 'material', of: 'x1' } })
  })

  it('un Sacrificio manda la carta del campo al cementerio y deja la Invocación en su zona', () => {
    const board = replayMat(start, [{ type: 'place', id: 'a', zone: 'mz', index: 0, pos: 'atk' }])
    const info = describeStep(board, { type: 'tribute', id: 'b', tributes: ['a'], zone: 'mz', index: 0, pos: 'atk' })

    expect(info.kind).toBe('normal')
    expect(info.moves.map((move) => move.id)).toEqual(['b', 'a'])
    expect(info.moves[1]).toEqual({ id: 'a', from: zone('mz', 1), to: { kind: 'pile', pile: 'gy' } })
  })

  it('cambiar de posición no mueve ninguna carta, pero la casilla queda distinta; dar vuelta una boca abajo es un Volteo', () => {
    const faceUp = replayMat(start, [{ type: 'place', id: 'a', zone: 'mz', index: 0, pos: 'atk' }])
    const toDefense = describeStep(faceUp, { type: 'position', id: 'a', pos: 'def' })

    expect(toDefense).toMatchObject({ kind: 'position', moves: [] })
    expect([...toDefense.change.spots]).toEqual(['mz:0'])

    const faceDown = replayMat(start, [{ type: 'place', id: 'a', zone: 'mz', index: 0, pos: 'set' }])

    expect(describeStep(faceDown, { type: 'position', id: 'a', pos: 'atk' }).kind).toBe('flip')
    expect(describeStep(faceUp, { type: 'position', id: 'a', pos: 'set' }).kind).toBe('set')
  })

  it('al cementerio, al destierro, a la mano y al deck se dicen por su destino', () => {
    expect(describeStep(start, { type: 'move', id: 'a', to: 'gy' }).kind).toBe('toGy')
    expect(describeStep(start, { type: 'move', id: 'a', to: 'banished' }).kind).toBe('banish')
    expect(describeStep(start, { type: 'move', id: 'f', to: 'hand' }).kind).toBe('toHand')
    expect(describeStep(start, { type: 'move', id: 'a', to: 'deck' }).kind).toBe('toDeck')
    expect(describeStep(start, { type: 'move', id: 'a', to: 'gy' })).toMatchObject({ origin: 'hand', moves: [{ id: 'a', from: { kind: 'pile', pile: 'hand' }, to: { kind: 'pile', pile: 'gy' } }] })
  })

  it('un cambio de fase no mueve nada; el que empieza otro turno roba la carta del tope', () => {
    expect(describeStep(start, { type: 'phase', phase: 'main1' })).toMatchObject({ kind: 'phase', moves: [] })

    const turnOne = replayMat(start, [{ type: 'phase', phase: 'end' }])
    const next = describeStep(turnOne, { type: 'phase', phase: 'draw' })

    expect(next.kind).toBe('turn')
    expect(next.moves.map((move) => move.id)).toEqual(['f'])
  })

  it('un lote es un solo paso: la clase de su destino, de dónde sale y todas las cartas que se mueven, la de su primera parte primero', () => {
    const info = describeStep(start, { type: 'batch', actions: [{ type: 'shuffle', seed: 2 }, { type: 'move', id: 'g', to: 'gy' }, { type: 'move', id: 'f', to: 'gy' }] })
    const deck = { kind: 'pile', pile: 'deck' } as const
    const gy = { kind: 'pile', pile: 'gy' } as const

    expect(info).toMatchObject({ kind: 'toGy', origin: 'deck', card: 'g' })
    expect(info.moves).toEqual([{ id: 'g', from: deck, to: gy }, { id: 'f', from: deck, to: gy }])
    expect([...info.change.piles].sort()).toEqual(['deck', 'gy'])
    // Revelar o marcar varias no mueve nada: dice de dónde son y qué clase de jugada es.
    expect(describeStep(start, { type: 'batch', actions: [{ type: 'reveal', id: 'f' }, { type: 'reveal', id: 'g' }] })).toMatchObject({ kind: 'reveal', origin: 'deck', card: 'f', moves: [] })
    expect(describeStep(start, { type: 'batch', actions: [{ type: 'target', id: 'a' }, { type: 'target', id: 'b' }] })).toMatchObject({ kind: 'target', origin: 'hand', card: 'a', moves: [] })
  })

  it('una jugada que no cambia nada (la carta no existe, la zona está ocupada) no mueve ni enmarca nada', () => {
    const board = replayMat(start, [{ type: 'place', id: 'a', zone: 'mz', index: 0, pos: 'atk' }])
    const info = describeStep(board, { type: 'place', id: 'b', zone: 'mz', index: 0, pos: 'atk' })

    expect(info.moves).toEqual([])
    expect(info.change.spots.size).toBe(0)
    expect(describeStep(start, { type: 'move', id: 'nope', to: 'gy' }).moves).toEqual([])
  })
})

describe('qué casillas quedan distintas', () => {
  it('cuenta lo que llega, se va, cambia de posición, de contadores o de materiales; una pila que sólo se baraja no', () => {
    const board = replayMat(start, [{ type: 'place', id: 'a', zone: 'mz', index: 0, pos: 'atk' }])
    const counted = matReducer(board, { type: 'counter', id: 'a', delta: 1 })

    expect([...boardChange(board, counted).spots]).toEqual(['mz:0'])
    expect(boardChange(board, matReducer(board, { type: 'shuffle', seed: 3 })).piles.size).toBe(0)
    expect([...boardChange(board, matReducer(board, { type: 'move', id: 'a', to: 'banished' })).spots]).toEqual(['mz:0'])
    expect([...boardChange(board, matReducer(board, { type: 'move', id: 'a', to: 'banished' })).piles]).toEqual(['banished'])
  })
})

describe('la información de todos los pasos', () => {
  const plays: MatAction[] = [
    { type: 'place', id: 'a', zone: 'mz', index: 0, pos: 'atk' },
    { type: 'activate', id: 'a' },
    { type: 'move', id: 'a', to: 'gy' },
  ]

  it('trae una por jugada, en orden, con el estado de antes de cada una', () => {
    expect(describeSteps(start, plays).map((info) => [info.kind, info.origin])).toEqual([
      ['normal', 'hand'],
      ['activate', 'field'],
      ['toGy', 'field'],
    ])
    // Con la mesa de cada paso ya calculada dice lo mismo.
    expect(describeSteps(start, plays, matStates(start, plays))).toEqual(describeSteps(start, plays))
  })

  it('la mesa de cada paso: la inicial y la de después de cada jugada, iguales a reproducir hasta ahí', () => {
    const states = matStates(start, plays)

    expect(states).toHaveLength(plays.length + 1)
    expect(states[0]).toBe(start)
    states.forEach((state, index) => expect(state).toEqual(replayMat(start, plays, index)))
    expect(matStates(start, [])).toEqual([start])
  })

  it('las cartas que llegan a la mano se marcan; las que se van, no', () => {
    expect([...describeStep(start, { type: 'draw', count: 2 }).change.toHand]).toEqual(['f', 'g'])
    expect(describeStep(start, { type: 'place', id: 'a', zone: 'mz', index: 0, pos: 'atk' }).change.toHand.size).toBe(0)
  })
})
