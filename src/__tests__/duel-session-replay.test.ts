// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { duelReplayAt, type DuelReplay } from '../app/duel-replay'
import { decodeReplayPayload, encodeReplayPayload, parseReplayText, replayEnvelope } from '../app/duel-replay-share'
import { clearDuelSave, parseDuelRecord, readDuelSave, saveOf, writeDuelRecord, writeDuelSave } from '../app/duel-save'
import { createDuel, type Duel } from '../app/duel-session'
import { canReplay, replayFromManual } from '../app/manual-replay'
import { mapMatIds, openPublic } from '../app/mat-public'
import { createMatState, type MatState } from '../app/practice-mat'
import { createMemoryRoom } from './support/memory-room'
import { random, randomAction } from './support/random-mat'

// El replay del duelo manual por enlace: lo que anota cada sesión (`DuelRecord`) y el replay que sale de ahí, contra las mesas de verdad de las dos puntas.
const hostMain = Array.from({ length: 20 }, (_, index) => `card-${1000 + index}-1`)
const guestMain = Array.from({ length: 20 }, (_, index) => `card-${5000 + index}-1`)
const hostTable = createMatState(hostMain, ['card-1900-1', 'card-1901-1'], 5)
const guestTable = createMatState(guestMain, ['card-5900-1', 'card-5901-1'], 5)

function setup() {
  const room = createMemoryRoom()
  const clock = { t: 10_000 }
  const hostEnd = room.join()
  const guestEnd = room.join()
  const host = createDuel(hostEnd, { role: 'host', name: 'Ana', now: () => clock.t, sid: 'host-1' })
  const guest = createDuel(guestEnd, { role: 'guest', name: 'Beto', now: () => clock.t, sid: 'guest-1' })

  room.flush()
  host.start(hostTable)
  guest.start(guestTable)
  room.flush()
  return { room, clock, hostEnd, guestEnd, host, guest }
}

const masked = (initial: MatState, state: MatState) => {
  const { opaque } = openPublic(initial).sender
  return mapMatIds(state, (id) => opaque[id] ?? id)
}

const replayOf = (duel: Duel, names: [string, string]) => replayFromManual(duel.getSnapshot(), { view: 'public', players: names, nameOf: (code) => `Carta ${code}` })

/** El final del replay de `duel` es su mesa (enmascarada) y la del rival como la ve, con las vidas de ahora. */
function expectReplayMatches(replay: DuelReplay, duel: Duel, myTable: MatState) {
  const snap = duel.getSnapshot()
  const end = duelReplayAt(replay, replay.steps.length)

  expect(end.states[0]).toEqual(masked(myTable, snap.mine!))
  expect(end.states[1]).toEqual(snap.theirs!.state)
  expect(end.lp).toEqual([snap.life.lp[snap.me], snap.life.lp[snap.me === 0 ? 1 : 0]])
}

/** Juegan los dos, alternando de a una o dos jugadas al azar. */
function play(game: ReturnType<typeof setup>, seed: number, turns: number) {
  const next = random(seed)

  for (let turn = 0; turn < turns; turn += 1) {
    const duel = next() < 0.5 ? game.host : game.guest
    for (let i = 0; i < 1 + Math.floor(next() * 2); i += 1) duel.play(randomAction(duel.getSnapshot().mine!, next))
    game.room.flush()
  }
}

function undoAllowed(game: ReturnType<typeof setup>, asker: Duel, other: Duel) {
  asker.undo()
  game.room.flush()
  other.answerUndo(true)
  game.room.flush()
}

describe('el replay del duelo manual por enlace', () => {
  it('cada punta graba el duelo entero (jugadas, deshacer de los dos y vidas) y su final es la mesa de verdad', async () => {
    const game = setup()

    play(game, 7, 12)
    // Beto deshace la suya (se la pide Ana) y Ana la suya, en el medio de todo.
    game.guest.play({ type: 'draw', count: 1 })
    game.room.flush()
    undoAllowed(game, game.host, game.guest)
    game.host.play({ type: 'phase', phase: 'main1' })
    game.room.flush()
    undoAllowed(game, game.host, game.guest)
    game.host.changeLife(-1200)
    game.guest.halveLife()
    game.room.flush()
    play(game, 11, 6)

    for (const [duel, table, names] of [
      [game.host, hostTable, ['Ana', 'Beto']],
      [game.guest, guestTable, ['Beto', 'Ana']],
    ] as const) {
      const snap = duel.getSnapshot()
      expect(canReplay(snap)).toBe(true)
      expect(snap.record?.cut).toBe(false)
      const replay = replayOf(duel, [...names])!

      expect(replay.steps).toHaveLength(snap.actions.length + snap.theirs!.acts.length)
      expectReplayMatches(replay, duel, table)
      // Por enlace y por archivo vuelve igual.
      expect(await decodeReplayPayload(await encodeReplayPayload(replay))).toEqual({ ok: true, replay })
      expect(parseReplayText(JSON.stringify(replayEnvelope(replay)))).toEqual({ ok: true, replay })
    }

    // Lo mismo desde las dos puntas: el mismo duelo, cada uno abajo.
    const fromHost = replayOf(game.host, ['Ana', 'Beto'])!
    const fromGuest = replayOf(game.guest, ['Beto', 'Ana'])!
    expect(duelReplayAt(fromHost, fromHost.steps.length).states).toEqual([...duelReplayAt(fromGuest, fromGuest.steps.length).states].reverse())
  })

  it('una jugada del rival que no llegó (estaba desconectado) corta el registro: el replay llega hasta ahí y sin resultado', () => {
    const game = setup()

    play(game, 3, 4)
    const before = replayOf(game.host, ['Ana', 'Beto'])!

    game.hostEnd.disconnect()
    game.guest.play({ type: 'draw', count: 1 })
    game.room.flush()
    game.hostEnd.reconnect()
    game.room.flush()
    game.host.play({ type: 'draw', count: 1 })
    game.guest.concede()
    game.room.flush()

    const snap = game.host.getSnapshot()
    expect(snap.record?.cut).toBe(true)
    const replay = replayOf(game.host, ['Ana', 'Beto'])!
    expect(replay.steps).toEqual(before.steps)
    expect(replay.result).toBeUndefined()
    // El rival no perdió nada: su replay sigue entero y dice cómo terminó.
    expect(game.guest.getSnapshot().record?.cut).toBe(false)
    expect(replayOf(game.guest, ['Beto', 'Ana'])!.result).toEqual({ winner: 1, reason: 'concede' })
  })

  it('si el rival deshizo y volvió a jugar mientras no lo oía (mismo número, otra mesa), también es un corte', () => {
    const game = setup()

    game.guest.play({ type: 'draw', count: 1 })
    game.room.flush()
    game.hostEnd.disconnect()
    game.room.flush()
    // Sin Ana en la sala, Beto deshace sin pedir permiso y juega otra cosa: la misma cantidad de jugadas.
    game.guest.undo()
    game.guest.play({ type: 'move', id: guestTable.hand[0]!, to: 'gy' })
    game.hostEnd.reconnect()
    game.room.flush()

    expect(game.host.getSnapshot().record?.cut).toBe(true)
  })

  it('recargar no lo pierde: ni quien recarga (va con su mesa guardada) ni el rival', () => {
    const game = setup()

    play(game, 5, 6)
    // Beto recarga: lo suyo y el registro (en su propia clave) pasan por el navegador.
    writeDuelSave('ABC123', game.guest.getSnapshot(), game.clock.t)
    writeDuelRecord('ABC123', game.guest.getSnapshot())
    const guestSave = readDuelSave('ABC123', 'guest', game.clock.t)!
    clearDuelSave('ABC123')
    expect(guestSave.record).toEqual(game.guest.getSnapshot().record)
    expect(localStorage.length).toBe(0)
    game.guestEnd.close()
    const guest = createDuel(game.room.join(), { role: 'guest', name: 'Beto', now: () => game.clock.t, sid: 'guest-2', restore: guestSave })
    game.room.flush()
    const reloaded = { ...game, guest }

    play(reloaded, 9, 6)
    undoAllowed(reloaded, game.host, guest)
    for (const [duel, table] of [
      [game.host, hostTable],
      [guest, guestTable],
    ] as const) {
      expect(duel.getSnapshot().record?.cut).toBe(false)
      expectReplayMatches(replayOf(duel, ['', ''])!, duel, table)
    }

    // Un guardado sin registro (de antes, o roto) sigue con la mesa, pero ese duelo ya no se puede grabar.
    const old = saveOf(guest.getSnapshot(), game.clock.t)!
    expect(createDuel(createMemoryRoom().join(), { role: 'guest', name: 'Beto', restore: old }).getSnapshot()).toMatchObject({ record: null, actions: guest.getSnapshot().actions })
    expect(parseDuelRecord(JSON.stringify({ theirs: { initial: 'x' }, order: [], life: [], cut: false }))).toBeUndefined()
  })

  it('la revancha empieza otro registro, y un duelo que siguió del automático no se graba', () => {
    const game = setup()

    play(game, 13, 3)
    game.guest.concede()
    game.room.flush()
    game.host.rematch()
    game.guest.rematch()
    game.room.flush()
    expect(canReplay(game.host.getSnapshot())).toBe(false)
    expect(game.host.getSnapshot().record).toMatchObject({ theirs: null, order: [], cut: false })

    game.host.start(hostTable)
    game.guest.start(guestTable)
    game.room.flush()
    game.host.play({ type: 'draw', count: 1 })
    game.room.flush()
    const replay = replayOf(game.guest, ['Beto', 'Ana'])!
    expect(replay.steps).toHaveLength(1)
    expect(replay.result).toBeUndefined()

    game.host.start(hostTable, [{ type: 'draw', count: 1 }], ['mine'])
    expect(game.host.getSnapshot().record).toBeNull()
  })
})
