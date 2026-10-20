import { describe, expect, it } from 'vitest'

import { createDuel } from '../app/duel-session'
import { parseMessage } from '../app/duel-protocol'
import { CONTROL_ACTIONS, controlReactions, firstFreeMonsterZone, foreignOf, opaqueOfForeign, takeOffer } from '../app/mat-control'
import { mapActionIds, mapMatIds } from '../app/mat-public'
import { createMatState, describeMatAction, isForeignId, matReducer, type MatAction, type MatState } from '../app/practice-mat'
import { createMemoryRoom } from './support/memory-room'

const deck = (base: number) => Array.from({ length: 12 }, (_, index) => `card-${base + index}-1`)
const hostTable = createMatState(deck(1000), ['card-1900-1'], 5)
const guestTable = createMatState(deck(5000), ['card-5900-1'], 5)

const play = (state: MatState, ...actions: MatAction[]) => actions.reduce(matReducer, state)
const summoned = (state: MatState, id: string, index = 0) => play(state, { type: 'place', id, zone: 'mz', index, pos: 'atk' })

describe('las jugadas de control en una mesa', () => {
  it('dar saca la carta de la mesa: del campo (y manda sus materiales al cementerio), del cementerio o del destierro; no de la mano, el deck ni el Extra', () => {
    const base = play(hostTable, { type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'atk' }, { type: 'attach', id: 'card-1001-1', to: 'card-1000-1' })
    const given = matReducer(base, { type: 'give', id: 'card-1000-1' })

    expect(given.mz[0]).toBeNull()
    expect(given.gy).toContain('card-1001-1')
    expect(given.hand).not.toContain('card-1000-1')
    // Una carta de la mano, del deck o del Extra no se da; una Mágica del campo, una del cementerio y una del destierro sí (las toma el rival).
    expect(matReducer(hostTable, { type: 'give', id: hostTable.hand[0]! })).toBe(hostTable)
    expect(matReducer(hostTable, { type: 'give', id: hostTable.deck[0]! })).toBe(hostTable)
    expect(matReducer(hostTable, { type: 'give', id: hostTable.extra[0]! })).toBe(hostTable)
    expect(matReducer(play(hostTable, { type: 'place', id: 'card-1002-1', zone: 'st', index: 0, pos: 'atk' }), { type: 'give', id: 'card-1002-1' }).st[0]).toBeNull()
    expect(matReducer(play(hostTable, { type: 'move', id: 'card-1003-1', to: 'gy' }), { type: 'give', id: 'card-1003-1' }).gy).toEqual([])
    expect(matReducer(play(hostTable, { type: 'move', id: 'card-1004-1', to: 'banished' }), { type: 'give', id: 'card-1004-1' }).banished).toEqual([])
  })

  it('tomar y recuperar también sirven en Mágicas y Trampas y en la zona de Campo (con su lugar libre y bien dicho)', () => {
    const spell = matReducer(guestTable, { type: 'take', id: 'f.c3', zone: 'st', index: 1, pos: 'atk' })
    const field = matReducer(guestTable, { type: 'take', id: 'f.c5', zone: 'field', index: 0, pos: 'atk' })

    expect(spell.st[1]).toEqual({ id: 'f.c3', pos: 'atk', counters: 0, materials: [] })
    expect(matReducer(spell, { type: 'take', id: 'f.c4', zone: 'st', index: 1, pos: 'atk' })).toBe(spell)
    expect(field.field?.id).toBe('f.c5')
    expect(matReducer(field, { type: 'take', id: 'f.c6', zone: 'field', index: 0, pos: 'atk' })).toBe(field)
    expect(matReducer(guestTable, { type: 'take', id: 'f.c5', zone: 'field', index: 1, pos: 'atk' })).toBe(guestTable)
    expect(matReducer(guestTable, { type: 'take', id: 'f.c5', zone: 'st', index: 5, pos: 'atk' })).toBe(guestTable)

    const away = play(hostTable, { type: 'place', id: 'card-1002-1', zone: 'st', index: 0, pos: 'atk' }, { type: 'give', id: 'card-1002-1' })

    expect(matReducer(away, { type: 'regain', id: 'card-1002-1', to: 'st', index: 2, pos: 'set' }).st[2]).toMatchObject({ id: 'card-1002-1', pos: 'set' })
    expect(matReducer(away, { type: 'regain', id: 'card-1002-1', to: 'field', index: 0 }).field?.id).toBe('card-1002-1')
    expect(matReducer(away, { type: 'regain', id: 'card-1002-1', to: 'st' })).toBe(away)
  })

  it('tomar pone una carta del rival en una zona de monstruo libre, con su posición; no en una ocupada ni una carta propia', () => {
    const taken = matReducer(guestTable, { type: 'take', id: 'f.c3', zone: 'mz', index: 2, pos: 'def' })

    expect(taken.mz[2]).toEqual({ id: 'f.c3', pos: 'def', counters: 0, materials: [] })
    expect(matReducer(taken, { type: 'take', id: 'f.c4', zone: 'mz', index: 2, pos: 'atk' })).toBe(taken)
    expect(matReducer(taken, { type: 'take', id: 'f.c3', zone: 'mz', index: 3, pos: 'atk' })).toBe(taken)
    expect(matReducer(guestTable, { type: 'take', id: 'card-5000-1', zone: 'mz', index: 0, pos: 'atk' })).toBe(guestTable)
  })

  it('recuperar devuelve una carta propia que ya no está en la mesa: al campo o a una pila (el destierro, boca abajo)', () => {
    const away = play(hostTable, { type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'atk' }, { type: 'give', id: 'card-1000-1' })

    expect(matReducer(away, { type: 'regain', id: 'card-1000-1', to: 'mz', index: 3, pos: 'def' }).mz[3]).toMatchObject({ id: 'card-1000-1', pos: 'def' })
    expect(matReducer(away, { type: 'regain', id: 'card-1000-1', to: 'gy' }).gy).toEqual(['card-1000-1'])
    expect(matReducer(away, { type: 'regain', id: 'card-1000-1', to: 'banished', faceDown: true }).facedown).toEqual(['card-1000-1'])
    expect(matReducer(away, { type: 'regain', id: 'card-1000-1', to: 'deck' }).deck[0]).toBe('card-1000-1')
    // Una que ya está en la mesa, una del rival o una zona ocupada: nada.
    expect(matReducer(hostTable, { type: 'regain', id: hostTable.hand[0]!, to: 'gy' })).toBe(hostTable)
    expect(matReducer(away, { type: 'regain', id: 'f.c3', to: 'gy' })).toBe(away)
  })

  it('una carta del rival que sale del campo no entra a mis pilas: sale de mi mesa (volver a su dueño lo hace él)', () => {
    const held = matReducer(guestTable, { type: 'take', id: 'f.c3', zone: 'mz', index: 0, pos: 'atk' })

    for (const to of ['gy', 'hand', 'banished', 'deck', 'extra'] as const) {
      const moved = matReducer(held, { type: 'move', id: 'f.c3', to })

      expect(moved.mz[0]).toBeNull()
      expect([...moved.gy, ...moved.hand, ...moved.banished, ...moved.deck, ...moved.extra].filter(isForeignId)).toEqual([])
    }

    // Como sacrificio o como material de Enlace pasa lo mismo.
    const tributed = matReducer(held, { type: 'tribute', id: guestTable.hand[0]!, tributes: ['f.c3'], zone: 'mz', index: 1, pos: 'atk' })

    expect(tributed.mz[0]).toBeNull()
    expect(tributed.mz[1]?.id).toBe(guestTable.hand[0])
    expect(tributed.gy.filter(isForeignId)).toEqual([])
  })

  it('los ids y los textos: una carta mía viaja con su id opaco y una del rival con el suyo (`f.…`); el registro cuenta quién empezó', () => {
    const opaque = (id: string) => (id === 'card-1000-1' ? 'c1' : id)

    expect(mapActionIds({ type: 'give', id: 'card-1000-1' }, opaque)).toEqual({ type: 'give', id: 'c1' })
    expect(mapActionIds({ type: 'give', id: 'f.c3', auto: true }, opaque)).toEqual({ type: 'give', id: 'f.c3', auto: true })
    expect(mapActionIds({ type: 'regain', id: 'card-1000-1', to: 'mz', index: 0 }, opaque)).toEqual({ type: 'regain', id: 'c1', to: 'mz', index: 0 })
    expect(foreignOf('c3')).toBe('f.c3')
    expect(opaqueOfForeign('f.c3')).toBe('c3')
    expect(CONTROL_ACTIONS.has('give') && CONTROL_ACTIONS.has('take') && CONTROL_ACTIONS.has('regain') && !CONTROL_ACTIONS.has('move')).toBe(true)

    const name = (id: string) => id
    expect(describeMatAction(guestTable, { type: 'give', id: 'c1' }, name)).toBe('Das el control de c1')
    expect(describeMatAction(guestTable, { type: 'give', id: 'c1', auto: true }, name)).toBe('Te toman el control de c1')
    expect(describeMatAction(guestTable, { type: 'give', id: 'f.c3' }, name)).toBe('Devolvés f.c3 a su dueño')
    expect(describeMatAction(guestTable, { type: 'take', id: 'f.c3', zone: 'mz', index: 0, pos: 'atk' }, name)).toBe('Tomás el control de f.c3')
    expect(describeMatAction(guestTable, { type: 'take', id: 'f.c3', zone: 'mz', index: 0, pos: 'atk', auto: true }, name)).toBe('Recibís el control de f.c3')
    expect(describeMatAction(guestTable, { type: 'regain', id: 'card-1-1', to: 'mz', index: 0 }, name)).toBe('Recuperás el control de card-1-1')
  })

  it('por la red una jugada de control se entiende (y una con un id raro, no)', () => {
    const wire = (action: unknown) => parseMessage(JSON.stringify({ t: 'act', n: 1, wire: { action, reveal: {} } }))

    expect(wire({ type: 'give', id: 'c1' })).not.toBeNull()
    expect(wire({ type: 'give', id: 'f.c3', auto: true })).not.toBeNull()
    expect(wire({ type: 'take', id: 'f.c3', zone: 'mz', index: 0, pos: 'def' })).not.toBeNull()
    expect(wire({ type: 'regain', id: 'c1', to: 'mz', index: 2, pos: 'atk', auto: true })).not.toBeNull()
    expect(wire({ type: 'regain', id: 'c1', to: 'banished', faceDown: true })).not.toBeNull()
    expect(wire({ type: 'take', id: 'f.c3', zone: 'st', index: 4, pos: 'atk' })).not.toBeNull()
    expect(wire({ type: 'take', id: 'f.c3', zone: 'field', index: 0, pos: 'atk' })).not.toBeNull()
    expect(wire({ type: 'regain', id: 'c1', to: 'st', index: 1 })).not.toBeNull()
    expect(wire({ type: 'regain', id: 'c1', to: 'field', index: 0 })).not.toBeNull()
    expect(wire({ type: 'give', id: 'f.__proto__' })).toBeNull()
    expect(wire({ type: 'take', id: 'f.c3', zone: 'emz', index: 0, pos: 'atk' })).toBeNull()
    expect(wire({ type: 'regain', id: 'c1', to: 'hell' })).toBeNull()
    expect(wire({ type: 'give', id: 'c1', auto: false })).toBeNull()
  })
})

describe('cómo responde una mesa a una jugada de control de la otra', () => {
  const ownIds = { c1: 'card-1000-1', c2: 'card-1001-1' }
  const before = summoned(guestTable, 'c9', 0)
  const mine = guestTable

  it('el rival me da un monstruo: lo tomo en mi primera zona libre y en su posición; sin lugar, se lo devuelvo', () => {
    // El espejo del rival tiene ids opacos: la carta de Ana es `c1` ahí.
    const theirs = mapMatIds(play(hostTable, { type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'def' }), (id) => (id === 'card-1000-1' ? 'c1' : id))
    const after = matReducer(theirs, { type: 'give', id: 'c1' })
    const given: MatAction = { type: 'give', id: 'c1' }
    const crowded = { ...mine, mz: mine.mz.map((_, index) => ({ id: `token-${index}`, pos: 'atk' as const, counters: 0, materials: [] })) }

    expect(controlReactions({ mine, ownIds: {}, before: theirs, after, action: given })).toEqual([{ type: 'take', id: 'f.c1', zone: 'mz', index: 0, pos: 'def', auto: true }])
    expect(controlReactions({ mine: summoned(mine, 'card-5000-1', 0), ownIds: {}, before: theirs, after, action: given })).toEqual([{ type: 'take', id: 'f.c1', zone: 'mz', index: 1, pos: 'def', auto: true }])
    expect(controlReactions({ mine: crowded, ownIds: {}, before: theirs, after, action: given })).toEqual([{ type: 'give', id: 'f.c1' }])
  })

  it('el rival toma uno mío: lo suelto; y si recupera uno suyo que yo tenía, lo suelto también', () => {
    const mineWith = summoned(play(mine, { type: 'take', id: 'f.c7', zone: 'mz', index: 4, pos: 'atk' }), 'card-5000-1', 0)
    const owned = summoned(hostTable, 'card-1000-1', 0)

    expect(controlReactions({ mine: owned, ownIds, before, after: before, action: { type: 'take', id: 'f.c1', zone: 'mz', index: 0, pos: 'atk' } })).toEqual([{ type: 'give', id: 'card-1000-1', auto: true }])
    expect(controlReactions({ mine: mineWith, ownIds: {}, before, after: before, action: { type: 'regain', id: 'c7', to: 'mz', index: 1 } })).toEqual([{ type: 'give', id: 'f.c7', auto: true }])
  })

  it('una carta mía que el rival tenía vuelve a mí: a donde la mandó, al cementerio si fue sacrificio o material, y al campo si me la devolvió', () => {
    const held = play(guestTable, { type: 'take', id: 'f.c1', zone: 'mz', index: 0, pos: 'def' })
    const toGy = matReducer(held, { type: 'move', id: 'f.c1', to: 'gy' })
    const toHand = matReducer(held, { type: 'move', id: 'f.c1', to: 'banished', faceDown: true })
    const gave = matReducer(held, { type: 'give', id: 'f.c1' })
    const away = play(hostTable, { type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'atk' }, { type: 'give', id: 'card-1000-1' })
    const react = (afterState: MatState, action: MatAction, state: MatState = away) => controlReactions({ mine: state, ownIds, before: held, after: afterState, action })

    expect(react(toGy, { type: 'move', id: 'f.c1', to: 'gy' })).toEqual([{ type: 'regain', id: 'card-1000-1', to: 'gy', faceDown: undefined, auto: true }])
    expect(react(toHand, { type: 'move', id: 'f.c1', to: 'banished', faceDown: true })).toEqual([{ type: 'regain', id: 'card-1000-1', to: 'banished', faceDown: true, auto: true }])
    expect(react(gave, { type: 'give', id: 'f.c1' })).toEqual([{ type: 'regain', id: 'card-1000-1', to: 'mz', index: 0, pos: 'def', auto: true }])
    // De sacrificio: al cementerio de su dueño.
    const tributed = matReducer(play(held, { type: 'move', id: guestTable.hand[0]!, to: 'hand' }), { type: 'tribute', id: guestTable.hand[0]!, tributes: ['f.c1'], zone: 'mz', index: 1, pos: 'atk' })

    expect(react(tributed, { type: 'tribute', id: 'c9', tributes: ['f.c1'], zone: 'mz', index: 1, pos: 'atk' })).toEqual([{ type: 'regain', id: 'card-1000-1', to: 'gy', auto: true }])
  })

  it('las respuestas no provocan otra (si no, las dos mesas se contestarían para siempre) y una carta que no es mía no se devuelve', () => {
    const held = play(guestTable, { type: 'take', id: 'f.c1', zone: 'mz', index: 0, pos: 'atk' })

    expect(controlReactions({ mine, ownIds, before: held, after: guestTable, action: { type: 'give', id: 'f.c1', auto: true } })).toEqual([])
    expect(controlReactions({ mine, ownIds, before: guestTable, after: held, action: { type: 'take', id: 'f.c1', zone: 'mz', index: 0, pos: 'atk', auto: true } })).toEqual([])
    expect(controlReactions({ mine, ownIds: {}, before: held, after: matReducer(held, { type: 'move', id: 'f.c1', to: 'gy' }), action: { type: 'move', id: 'f.c1', to: 'gy' } })).toEqual([])
    expect(firstFreeMonsterZone(summoned(mine, 'card-5000-1', 0))).toBe(1)
  })
})

describe('qué ofrece «Tomar el control» de una carta del rival', () => {
  const rival = (...actions: MatAction[]) => play(hostTable, ...actions)
  const mineEmpty = guestTable

  it('de su campo: lo que está a la vista, en su zona y con su posición; una carta boca abajo, no', () => {
    const field = rival(
      { type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'def' },
      { type: 'place', id: 'card-1001-1', zone: 'emz', index: 1, pos: 'atk' },
      { type: 'place', id: 'card-1002-1', zone: 'st', index: 2, pos: 'atk' },
      { type: 'place', id: 'card-1003-1', zone: 'st', index: 3, pos: 'set' },
      { type: 'place', id: 'card-1004-1', zone: 'field', index: 0, pos: 'atk' },
    )

    expect(takeOffer(field, mineEmpty, 'card-1000-1', null)).toEqual({ zone: 'mz', index: 0, pos: 'def' })
    expect(takeOffer(field, mineEmpty, 'card-1001-1', null)).toEqual({ zone: 'mz', index: 0, pos: 'atk' })
    expect(takeOffer(field, mineEmpty, 'card-1002-1', null)).toEqual({ zone: 'st', index: 0, pos: 'atk' })
    expect(takeOffer(field, mineEmpty, 'card-1004-1', null)).toEqual({ zone: 'field', index: 0, pos: 'atk' })
    expect(takeOffer(field, mineEmpty, 'card-1003-1', null)).toBeNull()
    expect(takeOffer(field, mineEmpty, 'card-1005-1', null)).toBeNull()
  })

  it('de su cementerio o su destierro: un monstruo a una zona de monstruo en ataque y una Mágica o Trampa a una de Mágicas y Trampas; sin saber qué es, o boca abajo, no', () => {
    const piles = rival({ type: 'move', id: 'card-1000-1', to: 'gy' }, { type: 'move', id: 'card-1001-1', to: 'banished' }, { type: 'move', id: 'card-1002-1', to: 'banished', faceDown: true })

    expect(takeOffer(piles, mineEmpty, 'card-1000-1', 'monster')).toEqual({ zone: 'mz', index: 0, pos: 'atk' })
    expect(takeOffer(piles, mineEmpty, 'card-1000-1', 'spellTrap')).toEqual({ zone: 'st', index: 0, pos: 'atk' })
    expect(takeOffer(piles, mineEmpty, 'card-1001-1', 'monster')).toEqual({ zone: 'mz', index: 0, pos: 'atk' })
    expect(takeOffer(piles, mineEmpty, 'card-1000-1', null)).toBeNull()
    expect(takeOffer(piles, mineEmpty, 'card-1002-1', 'monster')).toBeNull()
    // Lo que no está a la vista (la mano, el deck) no se ofrece.
    expect(takeOffer(piles, mineEmpty, 'card-1003-1', 'monster')).toBeNull()
    expect(takeOffer(piles, mineEmpty, hostTable.deck[0]!, 'monster')).toBeNull()
  })

  it('va a la primera zona libre de su tipo; sin ninguna en mi campo, no se ofrece', () => {
    const piles = rival({ type: 'move', id: 'card-1000-1', to: 'gy' })
    const busy = summoned(mineEmpty, 'card-5000-1', 0)
    const full = { ...mineEmpty, st: mineEmpty.st.map((_, index) => ({ id: 'token-' + index, pos: 'atk' as const, counters: 0, materials: [] })) }

    expect(takeOffer(piles, busy, 'card-1000-1', 'monster')).toEqual({ zone: 'mz', index: 1, pos: 'atk' })
    expect(takeOffer(piles, full, 'card-1000-1', 'spellTrap')).toBeNull()
    expect(takeOffer(piles, full, 'card-1000-1', 'monster')).toEqual({ zone: 'mz', index: 0, pos: 'atk' })
  })
})

describe('cómo responde una mesa cuando le toman una carta del cementerio o del destierro, o una Mágica del campo', () => {
  const ownIds = { c1: 'card-1000-1', c2: 'card-1001-1', c3: 'card-1002-1' }
  const theirs = guestTable
  const take = (id: string, zone: 'mz' | 'st' | 'field' = 'mz'): MatAction => ({ type: 'take', id, zone, index: 0, pos: 'atk' })

  it('el rival toma una carta mía del cementerio, del destierro o una Mágica del campo: la suelto', () => {
    const inGy = play(hostTable, { type: 'move', id: 'card-1000-1', to: 'gy' })
    const inBanish = play(hostTable, { type: 'move', id: 'card-1001-1', to: 'banished', faceDown: true })
    const inSt = play(hostTable, { type: 'place', id: 'card-1002-1', zone: 'st', index: 0, pos: 'atk' })

    expect(controlReactions({ mine: inGy, ownIds, before: theirs, after: theirs, action: take('f.c1') })).toEqual([{ type: 'give', id: 'card-1000-1', auto: true }])
    expect(controlReactions({ mine: inBanish, ownIds, before: theirs, after: theirs, action: take('f.c2') })).toEqual([{ type: 'give', id: 'card-1001-1', auto: true }])
    expect(controlReactions({ mine: inSt, ownIds, before: theirs, after: theirs, action: take('f.c3', 'st') })).toEqual([{ type: 'give', id: 'card-1002-1', auto: true }])
    // De mi mano o mi deck no hay nada que soltar.
    expect(controlReactions({ mine: hostTable, ownIds, before: theirs, after: theirs, action: take('f.c1') })).toEqual([])
  })

  it('el rival me da una Mágica o una de Campo: la tomo en una zona de su tipo; sin lugar, se la devuelvo', () => {
    const before = play(hostTable, { type: 'place', id: 'card-1002-1', zone: 'st', index: 0, pos: 'atk' }, { type: 'place', id: 'card-1003-1', zone: 'field', index: 0, pos: 'atk' })
    const after = matReducer(matReducer(before, { type: 'give', id: 'card-1002-1' }), { type: 'give', id: 'card-1003-1' })
    const fieldBusy = play(guestTable, { type: 'place', id: 'card-5001-1', zone: 'field', index: 0, pos: 'atk' })

    expect(controlReactions({ mine: guestTable, ownIds: {}, before, after, action: { type: 'give', id: 'card-1002-1' } })).toEqual([{ type: 'take', id: 'f.card-1002-1', zone: 'st', index: 0, pos: 'atk', auto: true }])
    expect(controlReactions({ mine: guestTable, ownIds: {}, before, after, action: { type: 'give', id: 'card-1003-1' } })).toEqual([{ type: 'take', id: 'f.card-1003-1', zone: 'field', index: 0, pos: 'atk', auto: true }])
    expect(controlReactions({ mine: fieldBusy, ownIds: {}, before, after, action: { type: 'give', id: 'card-1003-1' } })).toEqual([{ type: 'give', id: 'f.card-1003-1' }])
  })

  it('una Mágica mía que el rival devuelve vuelve a mi zona de Mágicas y Trampas, no a una de monstruo', () => {
    const held = play(guestTable, { type: 'take', id: 'f.c3', zone: 'st', index: 2, pos: 'set' })
    const gave = matReducer(held, { type: 'give', id: 'f.c3' })
    const away = play(hostTable, { type: 'place', id: 'card-1002-1', zone: 'st', index: 0, pos: 'atk' }, { type: 'give', id: 'card-1002-1' })

    expect(controlReactions({ mine: away, ownIds, before: held, after: gave, action: { type: 'give', id: 'f.c3' } })).toEqual([{ type: 'regain', id: 'card-1002-1', to: 'st', index: 0, pos: 'set', auto: true }])
  })
})

/** Dos jugadores con la mesa repartida. */
function started() {
  const room = createMemoryRoom()
  const host = createDuel(room.join(), { role: 'host', name: 'Ana', sid: 'host-1', settings: { lp: 8000, hand: 5, limitMin: 50, format: 'unlimited', match: false, siding: false } })
  const guest = createDuel(room.join(), { role: 'guest', name: 'Beto', sid: 'guest-1' })

  room.flush()
  host.start(hostTable)
  guest.start(guestTable)
  room.flush()

  return { room, host, guest }
}

/** El id con que Beto llama, en su mesa, a la carta de Ana que él controla (el que Ana le dio por la red). */
const foreignIn = (state: MatState) => state.mz.flatMap((placed) => (placed && isForeignId(placed.id) ? [placed.id] : []))

describe('el control de un monstruo entre dos jugadores', () => {
  it('Ana da un monstruo y Beto lo recibe solo en su campo, en la misma posición; las dos mesas coinciden y no se puede deshacer', () => {
    const { room, host, guest } = started()

    host.play({ type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'def' })
    host.play({ type: 'give', id: 'card-1000-1' })
    room.flush()

    const mine = host.getSnapshot().mine!
    const theirs = guest.getSnapshot().mine!
    const [foreign] = foreignIn(theirs)

    expect(mine.mz[0]).toBeNull()
    expect(foreign).toMatch(/^f\.c[0-9]+$/)
    expect(theirs.mz[0]).toMatchObject({ id: foreign, pos: 'def' })
    // Lo que Beto tiene es lo que Ana ve de su campo, y Beto lo ve con la carta real de Ana.
    expect(host.getSnapshot().theirs!.state.mz[0]?.id).toBe(foreign)
    expect(host.getSnapshot().ownIds[foreign!.slice(2)]).toBe('card-1000-1')
    expect(guest.getSnapshot().theirs!.known[foreign!.slice(2)]).toBe('card-1000-1')
    // Ninguno puede deshacer ese paso (la otra mesa ya lo completó).
    expect(host.getSnapshot().undo.blocked).toBe(true)
    expect(guest.getSnapshot().undo.blocked).toBe(true)
    host.undo()
    guest.undo()
    expect(host.getSnapshot().mine!.mz[0]).toBeNull()
    expect(foreignIn(guest.getSnapshot().mine!)).toEqual([foreign])
  })

  it('Beto manda la carta de Ana al cementerio: sale de su mesa y vuelve al cementerio de Ana, no al de Beto', () => {
    const { room, host, guest } = started()

    host.play({ type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'atk' })
    host.play({ type: 'give', id: 'card-1000-1' })
    room.flush()

    const [foreign] = foreignIn(guest.getSnapshot().mine!)

    guest.play({ type: 'move', id: foreign!, to: 'gy' })
    room.flush()

    expect(guest.getSnapshot().mine!.gy.filter(isForeignId)).toEqual([])
    expect(guest.getSnapshot().mine!.mz.filter(Boolean)).toEqual([])
    expect(host.getSnapshot().mine!.gy).toEqual(['card-1000-1'])
    // Y Beto ve ese cementerio de Ana con su carta.
    expect(guest.getSnapshot().theirs!.state.gy).toHaveLength(1)
  })

  it('Beto devuelve la carta: vuelve al campo de Ana, en su zona libre y en su posición', () => {
    const { room, host, guest } = started()

    host.play({ type: 'place', id: 'card-1000-1', zone: 'mz', index: 2, pos: 'def' })
    host.play({ type: 'give', id: 'card-1000-1' })
    room.flush()
    guest.play({ type: 'give', id: foreignIn(guest.getSnapshot().mine!)[0]! })
    room.flush()

    expect(host.getSnapshot().mine!.mz[0]).toMatchObject({ id: 'card-1000-1', pos: 'def' })
    expect(foreignIn(guest.getSnapshot().mine!)).toEqual([])
    expect(host.getSnapshot().theirs!.state.mz.filter(Boolean)).toEqual([])
  })

  it('Beto toma un monstruo de Ana: Ana lo suelta sola y Beto lo tiene; y Ana lo puede recuperar', () => {
    const { room, host, guest } = started()

    host.play({ type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'atk' })
    room.flush()

    const rivalCard = guest.getSnapshot().theirs!.state.mz[0]!

    guest.play({ type: 'take', id: foreignOfOpaque(rivalCard.id), zone: 'mz', index: 1, pos: rivalCard.pos })
    room.flush()

    expect(host.getSnapshot().mine!.mz[0]).toBeNull()
    expect(guest.getSnapshot().mine!.mz[1]?.id).toBe(`f.${rivalCard.id}`)
    expect(host.getSnapshot().theirs!.state.mz[1]?.id).toBe(`f.${rivalCard.id}`)

    // Ana la recupera desde el campo de Beto: vuelve al suyo y Beto la suelta.
    host.play({ type: 'regain', id: 'card-1000-1', to: 'mz', index: 3, pos: 'atk' })
    room.flush()
    expect(host.getSnapshot().mine!.mz[3]?.id).toBe('card-1000-1')
    expect(foreignIn(guest.getSnapshot().mine!)).toEqual([])
    expect(host.getSnapshot().theirs!.state.mz.filter(Boolean)).toEqual([])
  })

  it('Beto toma un monstruo del cementerio de Ana: sale de su cementerio, queda en el campo de Beto, y al mandarlo al cementerio vuelve al de Ana', () => {
    const { room, host, guest } = started()

    host.play({ type: 'move', id: 'card-1000-1', to: 'gy' })
    room.flush()

    const inGy = guest.getSnapshot().theirs!.state.gy[0]!

    guest.play({ type: 'take', id: foreignOf(inGy), zone: 'mz', index: 0, pos: 'atk' })
    room.flush()

    expect(host.getSnapshot().mine!.gy).toEqual([])
    expect(guest.getSnapshot().mine!.mz[0]?.id).toBe('f.' + inGy)
    expect(guest.getSnapshot().theirs!.state.gy).toEqual([])
    expect(host.getSnapshot().theirs!.state.mz[0]?.id).toBe('f.' + inGy)

    guest.play({ type: 'move', id: 'f.' + inGy, to: 'gy' })
    room.flush()
    expect(guest.getSnapshot().mine!.mz.filter(Boolean)).toEqual([])
    expect(host.getSnapshot().mine!.gy).toEqual(['card-1000-1'])
  })

  it('Beto toma una carta del destierro de Ana y una Mágica de su campo: cada una a la zona de su tipo, y las dos mesas coinciden', () => {
    const { room, host, guest } = started()

    host.play({ type: 'move', id: 'card-1001-1', to: 'banished' })
    host.play({ type: 'place', id: 'card-1002-1', zone: 'st', index: 1, pos: 'atk' })
    room.flush()

    const banished = guest.getSnapshot().theirs!.state.banished[0]!
    const spell = guest.getSnapshot().theirs!.state.st[1]!

    guest.play({ type: 'take', id: foreignOf(banished), zone: 'mz', index: 0, pos: 'atk' })
    guest.play({ type: 'take', id: foreignOf(spell.id), zone: 'st', index: 0, pos: spell.pos })
    room.flush()

    expect(host.getSnapshot().mine!.banished).toEqual([])
    expect(host.getSnapshot().mine!.st[1]).toBeNull()
    expect(guest.getSnapshot().mine!.mz[0]?.id).toBe('f.' + banished)
    expect(guest.getSnapshot().mine!.st[0]?.id).toBe('f.' + spell.id)
    expect(host.getSnapshot().theirs!.state.st[0]?.id).toBe('f.' + spell.id)
    // Nada se puede deshacer: la otra mesa ya lo completó.
    expect(guest.getSnapshot().undo.blocked).toBe(true)

    // Beto devuelve la Mágica: vuelve a la zona de Mágicas y Trampas de Ana.
    guest.play({ type: 'give', id: 'f.' + spell.id })
    room.flush()
    expect(host.getSnapshot().mine!.st[0]).toMatchObject({ id: 'card-1002-1', pos: 'atk' })
    expect(guest.getSnapshot().mine!.st.filter(Boolean)).toEqual([])
  })

  it('si Beto no tiene una zona libre, la carta vuelve a Ana (queda donde estaba) en vez de perderse', () => {
    const { room, host, guest } = started()

    for (let index = 0; index < 5; index += 1) {
      guest.play({ type: 'token', zone: 'mz', index })
    }

    host.play({ type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'atk' })
    host.play({ type: 'give', id: 'card-1000-1' })
    room.flush()

    expect(host.getSnapshot().mine!.mz[0]?.id).toBe('card-1000-1')
    expect(foreignIn(guest.getSnapshot().mine!)).toEqual([])
  })

  it('al recargar, la mesa con el monstruo ajeno se repone igual (lo guardado se reproduce)', () => {
    const { room, host, guest } = started()

    host.play({ type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'atk' })
    host.play({ type: 'give', id: 'card-1000-1' })
    room.flush()

    const snapshot = guest.getSnapshot()
    const restored = createDuel(createMemoryRoom().join(), {
      role: 'guest',
      name: 'Beto',
      sid: 'guest-2',
      restore: { v: 1, role: 'guest', initial: snapshot.initial!, actions: [...snapshot.actions], lp: 8000, timer: snapshot.life.timer, starter: snapshot.starter, savedAt: Date.now(), rival: 'Ana' },
    })

    expect(restored.getSnapshot().mine).toEqual(snapshot.mine)
  })
})

const foreignOfOpaque = (opaque: string) => foreignOf(opaque)
