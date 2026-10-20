import { describe, expect, it } from 'vitest'

import { createDuel } from '../app/duel-session'
import { parseMessage } from '../app/duel-protocol'
import { mapMatIds, publicIds } from '../app/mat-public'
import { createMatState, describeMatAction, listCardActions, matReducer, pendulumOnField, pileAction, replayMat, TOKEN_KIND, type MatAction, type MatCardKind, type MatState } from '../app/practice-mat'
import { createMemoryRoom } from './support/memory-room'

const MONSTER: MatCardKind = { monster: true, spell: false, trap: false, extra: false, effect: true, fieldSpell: false, pendulum: false, fusion: false, synchro: false, xyz: false, link: false, level: 4 }
const PENDULUM: MatCardKind = { ...MONSTER, pendulum: true }
const FUSION_PENDULUM: MatCardKind = { ...PENDULUM, extra: true, fusion: true }

const DECK = ['a1', 'p1', 'p2', 'b1', 'c1', 'd1', 'e1']
const EXTRA = ['x1', 'x2']
const KINDS: Record<string, MatCardKind> = { a1: MONSTER, p1: PENDULUM, p2: PENDULUM, b1: MONSTER, c1: MONSTER, d1: MONSTER, e1: MONSTER, x1: FUSION_PENDULUM, x2: { ...MONSTER, extra: true, link: true, level: null } }
const kindOf = (id: string) => KINDS[id] ?? TOKEN_KIND
const nameOf = (id: string) => id.toUpperCase()
const labels = (state: MatState, id: string) => listCardActions(state, id, kindOf, nameOf).map((item) => item.label)

const start = () => createMatState(DECK, EXTRA, 5)
const run = (actions: MatAction[], from = start()) => replayMat(from, actions)
const onField = (id = 'p1') => run([{ type: 'place', id, zone: 'mz', index: 0, pos: 'atk', how: 'normal' }])

describe('el Extra Deck con cartas boca arriba (Monstruos de Péndulo)', () => {
  it('una carta va al Extra boca arriba sólo si se la manda así; de lo contrario, boca abajo como siempre', () => {
    const up = matReducer(onField(), { type: 'move', id: 'p1', to: 'extra', faceUp: true })
    const down = matReducer(onField(), { type: 'move', id: 'p1', to: 'extra' })

    expect(up.extra).toEqual([...EXTRA, 'p1'])
    expect(up.extraUp).toEqual(['p1'])
    expect(up.mz[0]).toBeNull()
    expect(down.extra).toContain('p1')
    expect(down.extraUp).toEqual([])
    expect(start().extraUp).toEqual([])
  })

  it('al salir del Extra deja de estar boca arriba (invocada por Péndulo, a la mano, al cementerio…) y dar vuelta la carta la baja', () => {
    const up = run([{ type: 'move', id: 'p1', to: 'extra', faceUp: true }])

    for (const action of [
      { type: 'place', id: 'p1', zone: 'mz', index: 1, pos: 'atk', how: 'special' },
      { type: 'move', id: 'p1', to: 'hand' },
      { type: 'move', id: 'p1', to: 'gy' },
      { type: 'move', id: 'p1', to: 'banished' },
    ] as const) {
      const after = matReducer(up, action)

      expect(after.extra).not.toContain('p1')
      expect(after.extraUp).toEqual([])
    }

    // «Dar vuelta boca abajo»: vuelve a mandarla al Extra sin `faceUp`.
    const flipped = matReducer(up, { type: 'move', id: 'p1', to: 'extra' })

    expect(flipped.extra).toContain('p1')
    expect(flipped.extraUp).toEqual([])
  })

  it('varias boca arriba conviven (la última que llegó es la de arriba) y recuperar una carta propia puede dejarla boca arriba', () => {
    const two = run([
      { type: 'move', id: 'p1', to: 'extra', faceUp: true },
      { type: 'move', id: 'p2', to: 'extra', faceUp: true },
    ])

    expect(two.extraUp).toEqual(['p1', 'p2'])

    // Un monstruo mío que el rival tomó del cementerio y ya no está en mi mesa.
    const away = run([{ type: 'move', id: 'p1', to: 'gy' }, { type: 'give', id: 'p1' }])

    expect(matReducer(away, { type: 'regain', id: 'p1', to: 'extra', faceUp: true }).extraUp).toEqual(['p1'])
    expect(matReducer(away, { type: 'regain', id: 'p1', to: 'extra' }).extraUp).toEqual([])
  })

  it('el registro cuenta la Invocación de Péndulo como tal, no como Especial', () => {
    expect(describeMatAction(start(), { type: 'place', id: 'p1', zone: 'mz', index: 0, pos: 'atk', how: 'pendulum' }, nameOf)).toBe('Invocación de Péndulo de P1 en ataque')
    expect(describeMatAction(start(), { type: 'place', id: 'p1', zone: 'mz', index: 0, pos: 'def', how: 'pendulum' }, nameOf)).toBe('Invocación de Péndulo de P1 en defensa')
    expect(describeMatAction(start(), { type: 'place', id: 'p1', zone: 'mz', index: 0, pos: 'atk', how: 'special' }, nameOf)).toBe('Invocación Especial de P1 en ataque')
  })

  it('el registro lo cuenta: «va al Extra Deck boca arriba»', () => {
    expect(describeMatAction(start(), { type: 'move', id: 'p1', to: 'extra', faceUp: true }, nameOf)).toBe('P1 va al Extra Deck boca arriba')
    expect(describeMatAction(start(), { type: 'move', id: 'p1', to: 'extra' }, nameOf)).toBe('P1 vuelve al Extra Deck')
  })
})

describe('el menú de una carta con el Extra boca arriba', () => {
  it('un Monstruo de Péndulo ofrece «Al Extra Deck boca arriba» desde la mano, el cementerio y el destierro; uno común, no; y desde el campo su «Al cementerio» ya lo manda al Extra (regla de Péndulo)', () => {
    expect(labels(start(), 'p2')).toContain('Al Extra Deck boca arriba')
    expect(labels(run([{ type: 'move', id: 'p2', to: 'gy' }]), 'p2')).toContain('Al Extra Deck boca arriba')
    expect(labels(run([{ type: 'move', id: 'p2', to: 'banished' }]), 'p2')).toContain('Al Extra Deck boca arriba')
    expect(labels(onField('a1'), 'a1')).not.toContain('Al Extra Deck boca arriba')

    // Desde el campo no hay dos opciones que hagan lo mismo: «Al cementerio» dice a dónde va de verdad, y uno común sigue con el suyo.
    expect(labels(onField('p1'), 'p1')).toContain('Al cementerio (al Extra Deck)')
    expect(labels(onField('p1'), 'p1')).not.toContain('Al cementerio')
    expect(labels(onField('p1'), 'p1')).not.toContain('Al Extra Deck boca arriba')
    expect(labels(onField('a1'), 'a1')).toContain('Al cementerio')
    expect(listCardActions(onField('p1'), 'p1', kindOf, nameOf).find((item) => item.label === 'Al cementerio (al Extra Deck)')?.action).toEqual({ type: 'move', id: 'p1', to: 'extra', faceUp: true })
  })

  it('pendulumOnField y pileAction: un Péndulo en una zona de monstruo o de Péndulo que va al cementerio va al Extra boca arriba; en otro lugar, o a otra pila, no', () => {
    const scale = run([{ type: 'place', id: 'p1', zone: 'st', index: 0, pos: 'atk', how: 'scale' }])
    const middle = run([{ type: 'place', id: 'p1', zone: 'st', index: 2, pos: 'atk' }])
    const toExtra = { type: 'move', id: 'p1', to: 'extra', faceUp: true }

    expect(pendulumOnField(onField('p1'), 'p1', kindOf)).toBe(true)
    expect(pendulumOnField(scale, 'p1', kindOf)).toBe(true)
    // Una zona de Mágicas y Trampas del medio la trata como Mágica Continua; en la mano, el cementerio o un monstruo común, no.
    expect(pendulumOnField(middle, 'p1', kindOf)).toBe(false)
    expect(pendulumOnField(start(), 'p1', kindOf)).toBe(false)
    expect(pendulumOnField(onField('a1'), 'a1', kindOf)).toBe(false)

    expect(pileAction(onField('p1'), 'p1', 'gy', kindOf)).toEqual(toExtra)
    expect(pileAction(scale, 'p1', 'gy', kindOf)).toEqual(toExtra)
    expect(pileAction(middle, 'p1', 'gy', kindOf)).toEqual({ type: 'move', id: 'p1', to: 'gy' })
    expect(pileAction(start(), 'p1', 'gy', kindOf)).toEqual({ type: 'move', id: 'p1', to: 'gy' })
    expect(pileAction(onField('p1'), 'p1', 'banished', kindOf)).toEqual({ type: 'move', id: 'p1', to: 'banished' })
    expect(pileAction(onField('p1'), 'p1', 'hand', kindOf)).toEqual({ type: 'move', id: 'p1', to: 'hand' })
    expect(pileAction(onField('a1'), 'a1', 'gy', kindOf)).toEqual({ type: 'move', id: 'a1', to: 'gy' })

    // Y el resultado: boca arriba en el Extra, no en el cementerio.
    const after = matReducer(onField('p1'), pileAction(onField('p1'), 'p1', 'gy', kindOf))

    expect(after.gy).toEqual([])
    expect(after.extraUp).toEqual(['p1'])
  })

  it('uno del Extra Deck (Fusión de Péndulo) puede volver boca abajo o boca arriba; uno que no es de Péndulo, sólo boca abajo', () => {
    const fused = run([{ type: 'place', id: 'x1', zone: 'emz', index: 0, pos: 'atk', how: 'special' }])
    const link = run([{ type: 'place', id: 'x2', zone: 'emz', index: 0, pos: 'atk', how: 'special' }])

    // En el campo: volver boca abajo, o («Al cementerio») boca arriba por la regla de Péndulo.
    expect(labels(fused, 'x1')).toEqual(expect.arrayContaining(['Al Extra Deck', 'Al cementerio (al Extra Deck)']))
    expect(labels(link, 'x2')).toContain('Al Extra Deck')
    expect(labels(link, 'x2')).not.toContain('Al Extra Deck boca arriba')
  })

  it('una carta boca arriba en el Extra se invoca por Péndulo (sin materiales), vuelve a la mano y se puede dar vuelta; no se «revela»', () => {
    const up = run([{ type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'atk', how: 'normal' }, { type: 'move', id: 'p1', to: 'extra', faceUp: true }])
    const menu = labels(up, 'p1')

    expect(menu).toEqual(expect.arrayContaining(['Invocación de Péndulo', 'A la mano', 'Dar vuelta boca abajo']))
    expect(menu).not.toContain('Revelar')
    expect(menu).not.toContain('Invocación Especial')

    const summon = listCardActions(up, 'p1', kindOf, nameOf).find((item) => item.label === 'Invocación de Péndulo')!

    expect(summon.choices?.map((choice) => choice.action.type)).toEqual(['place', 'place'])
    // La jugada dice que es de Péndulo: así el registro la cuenta como tal. Una Invocación Especial de la mano sigue siendo Especial.
    expect(summon.choices?.map((choice) => choice.action.type === 'place' && choice.action.how)).toEqual(['pendulum', 'pendulum'])
    expect(listCardActions(up, 'b1', kindOf, nameOf).find((item) => item.label === 'Invocación Especial')?.choices?.map((choice) => choice.action.type === 'place' && choice.action.how)).toEqual(['special', 'special'])
    expect(summon.choices?.every((choice) => !choice.materials)).toBe(true)

    // Boca abajo en el Extra: lo de siempre (revelar; el Fusión pide materiales).
    const down = run([{ type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'atk', how: 'normal' }])

    expect(labels(down, 'x1')).toContain('Revelar')
    expect(labels(down, 'x1')).not.toContain('Invocación de Péndulo')
    expect(listCardActions(down, 'x1', kindOf, nameOf).find((item) => item.label === 'Invocación Especial')?.choices?.every((choice) => choice.materials)).toBe(true)
  })
})

describe('lo que viaja y lo que se guarda', () => {
  it('la jugada con `faceUp` y la mesa con `extraUp` se entienden por la red (una mesa de una versión anterior, sin `extraUp`, también)', () => {
    const wire = (action: unknown) => parseMessage(JSON.stringify({ t: 'act', n: 1, wire: { action, reveal: {} } }))

    expect(wire({ type: 'move', id: 'c1', to: 'extra', faceUp: true })).not.toBeNull()
    expect(wire({ type: 'regain', id: 'c1', to: 'extra', faceUp: true, auto: true })).not.toBeNull()
    expect(wire({ type: 'move', id: 'c1', to: 'extra', faceUp: 'sí' })).toBeNull()
    // La Invocación de Péndulo también (`how: 'pendulum'`).
    expect(wire({ type: 'place', id: 'c1', zone: 'mz', index: 0, pos: 'atk', how: 'pendulum' })).not.toBeNull()
    expect(wire({ type: 'place', id: 'c1', zone: 'mz', index: 0, pos: 'atk', how: 'raro' })).toBeNull()

    // Por la red las cartas van con ids opacos (`c1`…).
    const wireTable = createMatState(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'], ['c8', 'c9'], 5)
    const table = (extra: Record<string, unknown>) => ({ ...wireTable, ...extra })
    const sync = (state: unknown) => parseMessage(JSON.stringify({ t: 'sync', n: 0, known: {}, lp: 8000, lifeN: 0, state }))
    const withUp = table({ extraUp: ['c9'] })
    const old = { ...table({}), extraUp: undefined }

    expect(sync(withUp)).not.toBeNull()
    expect(sync(old)).not.toBeNull()
    // Una carta boca arriba que no está en el Extra, o ids raros, no.
    expect(sync(table({ extraUp: ['c1'] }))).toBeNull()
    expect(sync(table({ extraUp: [{ id: 'c9' }] }))).toBeNull()
  })

  it('las cartas boca arriba del Extra son públicas (el rival las ve) y viajan con el id opaco como todo lo demás', () => {
    const up = run([{ type: 'move', id: 'p1', to: 'extra', faceUp: true }, { type: 'move', id: 'p2', to: 'extra' }])

    expect([...publicIds(up)].filter((id) => ['p1', 'p2', 'x1'].includes(id))).toEqual(['p1'])
    expect(mapMatIds(up, (id) => `opaque-${id}`).extraUp).toEqual(['opaque-p1'])
  })
})

describe('el duelo: el rival ve las cartas boca arriba de tu Extra Deck', () => {
  const settings = { lp: 8000, hand: 5, limitMin: 50, format: 'unlimited', match: false, siding: false } as const
  const hostTable = createMatState(['card-1000-1', 'card-1001-1', 'card-1002-1', 'card-1003-1', 'card-1004-1', 'card-1005-1', 'card-1006-1'], ['card-1900-1', 'card-1901-1'], 5)
  const guestTable = createMatState(['card-5000-1', 'card-5001-1', 'card-5002-1', 'card-5003-1', 'card-5004-1', 'card-5005-1', 'card-5006-1'], ['card-5900-1'], 5)

  function started() {
    const room = createMemoryRoom()
    const host = createDuel(room.join(), { role: 'host', name: 'Ana', sid: 'host-1', settings })
    const guest = createDuel(room.join(), { role: 'guest', name: 'Beto', sid: 'guest-1' })

    room.flush()
    host.start(hostTable)
    guest.start(guestTable)
    room.flush()

    return { room, host, guest }
  }

  it('Ana manda un Monstruo de Péndulo al Extra boca arriba: Beto lo ve (con su carta) y el resto del Extra sigue oculto; si lo invoca, deja de verse', () => {
    const { room, host, guest } = started()

    host.play({ type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'atk', how: 'normal' })
    host.play({ type: 'move', id: 'card-1000-1', to: 'extra', faceUp: true })
    room.flush()

    expect(host.getSnapshot().mine!.extraUp).toEqual(['card-1000-1'])

    const rival = guest.getSnapshot().theirs!
    const [shown] = rival.state.extraUp

    expect(rival.state.extraUp).toHaveLength(1)
    expect(rival.state.extra).toContain(shown)
    expect(rival.state.extra).toHaveLength(3)
    // Beto sabe cuál es (la ve), pero no las otras dos del Extra.
    expect(rival.known[shown!]).toBe('card-1000-1')
    expect(Object.keys(rival.known).filter((id) => rival.state.extra.includes(id))).toEqual([shown])

    host.play({ type: 'place', id: 'card-1000-1', zone: 'mz', index: 1, pos: 'def', how: 'special' })
    room.flush()
    expect(guest.getSnapshot().theirs!.state.extraUp).toEqual([])
    expect(guest.getSnapshot().theirs!.state.mz[1]).not.toBeNull()
  })

  it('al recargar la página (se vuelve a armar la mesa con las mismas jugadas) la carta sigue boca arriba', () => {
    const { room, host } = started()

    host.play({ type: 'move', id: 'card-1001-1', to: 'extra', faceUp: true })
    room.flush()

    const snapshot = host.getSnapshot()
    const restored = createDuel(createMemoryRoom().join(), {
      role: 'host',
      name: 'Ana',
      sid: 'host-2',
      settings,
      restore: { v: 1, role: 'host', initial: snapshot.initial!, actions: [...snapshot.actions], lp: 8000, timer: snapshot.life.timer, starter: snapshot.starter, savedAt: Date.now(), rival: 'Beto' },
    })

    expect(restored.getSnapshot().mine!.extraUp).toEqual(['card-1001-1'])
  })
})
