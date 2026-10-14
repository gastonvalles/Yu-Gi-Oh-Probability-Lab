import { describe, expect, it } from 'vitest'

import { encodeMessage, parseMessage, type DuelMessage } from '../app/duel-protocol'
import { createDuel } from '../app/duel-session'
import { matEffects } from '../app/mat-effects'
import { encodeAct, isOpaqueId, mapActionIds, mirrorApply, mirrorUndo, openMirror, openPublic } from '../app/mat-public'
import {
  createMatState,
  describeMatAction,
  listCardActions,
  matReducer,
  replayMat,
  TOKEN_KIND,
  type AttackTarget,
  type MatAction,
  type MatCardKind,
  type MatState,
} from '../app/practice-mat'
import { createMemoryRoom } from './support/memory-room'

const MONSTER: MatCardKind = { monster: true, spell: false, trap: false, extra: false, effect: true, fieldSpell: false, pendulum: false, fusion: false, synchro: false, xyz: false, link: false, level: 4 }
const SPELL: MatCardKind = { ...MONSTER, monster: false, spell: true, level: null }
const KINDS: Record<string, MatCardKind> = { a1: MONSTER, a2: MONSTER, s1: SPELL }
const kindOf = (id: string) => KINDS[id] ?? TOKEN_KIND
const nameOf = (id: string) => id.toUpperCase()

const RIVALS: AttackTarget[] = [
  { id: 'c3', label: 'Rival, zona 2: Dragón' },
  { id: 'c7', label: 'Rival, zona 4: Boca abajo' },
]

const DECK = ['a1', 'a2', 's1', 'z1', 'z2', 'z3', 'z4']

/** A1 en ataque (zona 1), A2 en defensa (zona 2) y S1 activada, ya en la Battle Phase. */
function inBattle(): MatState {
  return replayMat(createMatState(DECK, [], 5), [
    { type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'atk' },
    { type: 'place', id: 'a2', zone: 'mz', index: 1, pos: 'def' },
    { type: 'place', id: 's1', zone: 'st', index: 1, pos: 'atk' },
    { type: 'phase', phase: 'battle' },
  ])
}

const labels = (state: MatState, id: string, targets: readonly AttackTarget[] = []) => listCardActions(state, id, kindOf, nameOf, targets).map((item) => item.label)

describe('atacar', () => {
  it('es una jugada que sólo queda anotada: la mesa no cambia', () => {
    const state = inBattle()

    expect(matReducer(state, { type: 'attack', id: 'a1' })).toBe(state)
    expect(matReducer(state, { type: 'attack', id: 'a1', target: 'c3' })).toBe(state)
  })

  it('se cuenta con la carta que ataca y, si hay, a cuál', () => {
    const state = inBattle()
    const say = (action: MatAction) => describeMatAction(state, action, nameOf)

    expect(say({ type: 'attack', id: 'a1' })).toBe('Atacás directo con A1')
    expect(say({ type: 'attack', id: 'a1', target: 'c3' })).toBe('Atacás a C3 con A1')
  })

  it('el menú ofrece "Ataque directo" a un monstruo en ataque, en la Battle Phase', () => {
    expect(labels(inBattle(), 'a1')).toContain('Ataque directo')
    expect(labels(inBattle(), 'a1')).not.toContain('Atacar')
  })

  it('con monstruos del rival ofrece también "Atacar", que pregunta a cuál, y cada respuesta apunta a esa carta', () => {
    const items = listCardActions(inBattle(), 'a1', kindOf, nameOf, RIVALS)
    const attack = items.find((item) => item.label === 'Atacar')!

    expect(items.map((item) => item.label).slice(0, 2)).toEqual(['Atacar', 'Ataque directo'])
    expect(attack.choices?.map((choice) => choice.label)).toEqual(['Rival, zona 2: Dragón', 'Rival, zona 4: Boca abajo'])
    expect(attack.choices?.map((choice) => choice.action)).toEqual([
      { type: 'attack', id: 'a1', target: 'c3' },
      { type: 'attack', id: 'a1', target: 'c7' },
    ])
    expect(items.find((item) => item.label === 'Ataque directo')!.action).toEqual({ type: 'attack', id: 'a1' })
  })

  it('fuera de la Battle Phase no se ofrece, ni a un monstruo en defensa, ni a una Mágica, ni a uno que está en la mano', () => {
    const main1 = matReducer(inBattle(), { type: 'phase', phase: 'main2' })

    expect(labels(main1, 'a1', RIVALS)).not.toContain('Ataque directo')
    expect(labels(main1, 'a1', RIVALS)).not.toContain('Atacar')
    expect(labels(inBattle(), 'a2', RIVALS)).not.toContain('Ataque directo')
    expect(labels(inBattle(), 's1', RIVALS)).not.toContain('Ataque directo')
    expect(labels(inBattle(), 'z1', RIVALS)).not.toContain('Ataque directo')
    // Boca abajo tampoco: no se ataca con un monstruo colocado.
    const set = matReducer(inBattle(), { type: 'position', id: 'a1', pos: 'set' })
    expect(labels(set, 'a1', RIVALS)).not.toContain('Ataque directo')
  })

  it('una ficha en ataque también puede atacar', () => {
    const withToken = matReducer(inBattle(), { type: 'token', zone: 'mz', index: 3 })

    expect(labels(withToken, 'token-1')).toContain('Ataque directo')
  })

  it('destaca a la carta que ataca, y no si no existe', () => {
    const state = inBattle()

    expect(matEffects(state, { type: 'attack', id: 'a1' })).toEqual({ spotlight: { id: 'a1', kind: 'attack' } })
    expect(matEffects(state, { type: 'attack', id: 'nada' })).toEqual({})
  })
})

describe('el ataque por la red', () => {
  const table = createMatState(['card-1-1', 'card-2-1', 'card-3-1', 'card-4-1', 'card-5-1', 'card-6-1'], [], 5)
  const attacker = replayMat(table, [
    { type: 'place', id: 'card-1-1', zone: 'mz', index: 0, pos: 'atk' },
    { type: 'phase', phase: 'battle' },
  ])

  it('viaja con el atacante renombrado y el objetivo tal cual (ya es un id del rival)', () => {
    const { sender } = openPublic(table)
    const wire = mapActionIds({ type: 'attack', id: 'card-1-1', target: 'c4' }, (id) => sender.opaque[id] ?? id)

    expect(wire).toEqual({ type: 'attack', id: sender.opaque['card-1-1'], target: 'c4' })
    expect(JSON.stringify(wire)).not.toContain('card-1-1')
  })

  it('no revela nada: el atacante estaba a la vista y el objetivo no es una carta suya', () => {
    const { sender } = openPublic(table)
    const played = encodeAct(sender, table, { type: 'place', id: 'card-1-1', zone: 'mz', index: 0, pos: 'atk' })
    const attack = encodeAct(played.sender, attacker, { type: 'attack', id: 'card-1-1', target: 'c4' })

    expect(attack.wire.reveal).toEqual({})
  })

  it('en el espejo del rival no mueve nada y deshacerlo tampoco', () => {
    const open = openPublic(table)
    let mirror = openMirror(open.masked, open.reveal)
    const act = encodeAct(open.sender, table, { type: 'attack', id: 'card-1-1' })

    mirror = mirrorApply(mirror, act.wire)
    expect(mirror.state).toEqual(open.masked)
    expect(mirror.acts).toEqual([act.wire.action])
    expect(mirrorUndo(mirror).acts).toEqual([])
  })

  it('el protocolo acepta el ataque directo y el que lleva objetivo, y rechaza un objetivo que no es un id', () => {
    const wire = (action: object): DuelMessage => ({ t: 'act', n: 1, wire: { action: action as MatAction, reveal: {} } })
    const parses = (action: object) => parseMessage(encodeMessage(wire(action))) !== null

    expect(parses({ type: 'attack', id: 'c1' })).toBe(true)
    expect(parses({ type: 'attack', id: 'c1', target: 'c9' })).toBe(true)
    expect(parses({ type: 'attack', id: 'c1', target: '' })).toBe(false)
    expect(parses({ type: 'attack', id: 'c1', target: 7 })).toBe(false)
    expect(parses({ type: 'attack', id: 'c1', target: 'x'.repeat(101) })).toBe(false)
    expect(parses({ type: 'attack', target: 'c9' })).toBe(false)
  })

  it('reconoce los ids opacos y nada más', () => {
    expect(['c1', 'c27'].map(isOpaqueId)).toEqual([true, true])
    expect(['card-1-1', 'token-1', 'c', 'c1x', ''].map(isOpaqueId)).toEqual([false, false, false, false, false])
  })

  it('entre dos jugadores: el rival recibe el ataque en su espejo y quien ataca puede nombrar la carta atacada por el id que el rival le dio', () => {
    const room = createMemoryRoom()
    const host = createDuel(room.join(), { role: 'host', name: 'Ana' })
    const guest = createDuel(room.join(), { role: 'guest', name: 'Beto' })
    const guestTable = createMatState(['card-5-1', 'card-6-1', 'card-7-1', 'card-8-1', 'card-9-1', 'card-10-1'], [], 5)

    room.flush()
    host.start(table)
    guest.start(guestTable)
    room.flush()
    guest.play({ type: 'place', id: 'card-5-1', zone: 'mz', index: 1, pos: 'atk' })
    room.flush()

    // El anfitrión ve el monstruo del invitado con su id opaco y ataca con el suyo (en la Battle Phase).
    const rival = host.getSnapshot().theirs!.state.mz[1]!
    expect(isOpaqueId(rival.id)).toBe(true)

    host.play({ type: 'place', id: 'card-1-1', zone: 'mz', index: 0, pos: 'atk' })
    host.play({ type: 'phase', phase: 'battle' })
    host.play({ type: 'attack', id: 'card-1-1', target: rival.id })
    room.flush()

    // El invitado lo recibe: el atacante con id opaco, y el objetivo se traduce a su carta con `ownIds`.
    const received = guest.getSnapshot().theirs!.acts.at(-1)
    expect(received).toMatchObject({ type: 'attack', target: rival.id })
    expect(guest.getSnapshot().ownIds[rival.id]).toBe('card-5-1')
    expect(isOpaqueId((received as { id: string }).id)).toBe(true)
    // Su mesa y la del anfitrión no cambiaron por el ataque.
    expect(guest.getSnapshot().mine!.mz[1]).toMatchObject({ id: 'card-5-1', pos: 'atk' })
    // Y ninguno vio la identidad de lo que el otro no mostró: el ataque no reveló cartas del anfitrión que no estuvieran a la vista.
    expect(Object.values(guest.getSnapshot().theirs!.known)).toEqual(['card-1-1'])
  })
})
