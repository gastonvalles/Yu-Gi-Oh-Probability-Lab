import { describe, expect, it, vi } from 'vitest'

import { encodeMessage, type DuelSettings } from '../app/duel-protocol'
import { saveOf } from '../app/duel-save'
import { createDuel, type Duel } from '../app/duel-session'
import { timerElapsed } from '../app/life-calculator'
import { mapMatIds, openPublic } from '../app/mat-public'
import { createMatState, type MatState } from '../app/practice-mat'
import { createMemoryRoom, type MemoryEnd } from './support/memory-room'
import { random, randomAction } from './support/random-mat'

// Cada uno juega con su deck: los ids del anfitrión empiezan en 1000 y los del invitado en 5000.
const hostMain = Array.from({ length: 20 }, (_, index) => `card-${1000 + index}-1`)
const hostExtra = ['card-1900-1', 'card-1901-1', 'card-1902-1']
const guestMain = Array.from({ length: 20 }, (_, index) => `card-${5000 + index}-1`)
const guestExtra = ['card-5900-1', 'card-5901-1', 'card-5902-1']
const hostTable = createMatState(hostMain, hostExtra, 5)
const guestTable = createMatState(guestMain, guestExtra, 5)

function setup(settings?: DuelSettings) {
  const room = createMemoryRoom()
  const clock = { t: 10_000 }
  const hostEnd = room.join()
  const guestEnd = room.join()
  const host = createDuel(hostEnd, { role: 'host', name: 'Ana', settings, now: () => clock.t, sid: 'host-1' })
  const guest = createDuel(guestEnd, { role: 'guest', name: 'Beto', now: () => clock.t, sid: 'guest-1' })

  room.flush()
  return { room, clock, hostEnd, guestEnd, host, guest }
}

type Game = ReturnType<typeof setup>

/** La mesa de `owner` como la ve el rival: sus cartas con los ids opacos que le tocaron. */
const masked = (initial: MatState, state: MatState) => {
  const { opaque } = openPublic(initial).sender
  return mapMatIds(state, (id) => opaque[id] ?? id)
}

function expectSameTables(game: Game) {
  expect(game.guest.getSnapshot().theirs?.state).toEqual(masked(hostTable, game.host.getSnapshot().mine!))
  expect(game.host.getSnapshot().theirs?.state).toEqual(masked(guestTable, game.guest.getSnapshot().mine!))
}

/** `owner` pide volver atrás su última jugada y el otro lo permite. */
function undoAllowed(game: Game, owner: Duel, other: Duel) {
  owner.undo()
  game.room.flush()
  other.answerUndo(true)
  game.room.flush()
}

function startBoth(game: Game) {
  game.host.start(hostTable)
  game.guest.start(guestTable)
  game.room.flush()
}

describe('el apretón de manos', () => {
  it('se ven, el invitado usa los ajustes del anfitrión y los dos arrancan con los mismos puntos de vida', () => {
    const { host, guest } = setup({ lp: 4000, hand: 6 })

    expect(host.getSnapshot()).toMatchObject({ peerPresent: true, peerName: 'Beto', me: 0, incompatible: false })
    expect(guest.getSnapshot()).toMatchObject({ peerPresent: true, peerName: 'Ana', me: 1, settings: { lp: 4000, hand: 6 }, incompatible: false })
    expect(guest.getSnapshot().life.lp).toEqual([4000, 4000])
    expect(host.getSnapshot().life.lp).toEqual([4000, 4000])
  })

  it('dos anfitriones, o versiones distintas, quedan marcados como incompatibles', () => {
    const room = createMemoryRoom()
    const first = createDuel(room.join(), { role: 'host', name: 'A' })
    const second = createDuel(room.join(), { role: 'host', name: 'B' })

    room.flush()
    expect([first.getSnapshot().incompatible, second.getSnapshot().incompatible]).toEqual([true, true])

    const game = setup()
    game.room.inject(game.guestEnd, JSON.stringify({ t: 'hello', v: 2, sid: 'x', role: 'host', name: 'Futuro' }))
    game.room.flush()
    expect(game.guest.getSnapshot().incompatible).toBe(true)

    // Un apretón de manos bueno lo arregla.
    game.hostEnd.disconnect()
    game.hostEnd.reconnect()
    game.room.flush()
    expect(game.guest.getSnapshot().incompatible).toBe(false)
  })
})

describe('las mesas', () => {
  it('cada uno ve la mesa del otro enmascarada y la va siguiendo jugada a jugada', () => {
    const game = setup()
    startBoth(game)
    expectSameTables(game)

    game.host.play({ type: 'draw', count: 2 })
    game.host.play({ type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'atk' })
    game.guest.play({ type: 'move', id: 'card-5001-1', to: 'gy' })
    game.guest.play({ type: 'phase', phase: 'battle' })
    game.room.flush()

    expectSameTables(game)
    expect(game.guest.getSnapshot().theirs?.known).toEqual({ [openPublic(hostTable).sender.opaque['card-1000-1']!]: 'card-1000-1' })
    expect(game.host.getSnapshot().moves).toBe(2)
  })

  it('por la red no viaja ninguna carta secreta, de ninguno de los dos', () => {
    const game = setup()
    startBoth(game)

    game.host.play({ type: 'draw', count: 2 })
    game.host.play({ type: 'shuffle', seed: 7 })
    game.host.play({ type: 'place', id: 'card-1000-1', zone: 'st', index: 0, pos: 'set' })
    game.host.play({ type: 'place', id: 'card-1001-1', zone: 'mz', index: 0, pos: 'atk' })
    game.guest.play({ type: 'place', id: 'card-5002-1', zone: 'mz', index: 2, pos: 'def' })
    game.guest.play({ type: 'move', id: 'card-5003-1', to: 'banished', faceDown: true })
    game.room.flush()

    const wire = game.room.sent.join('\n')
    const seen = ['card-1001-1', 'card-5002-1']

    expect(seen.every((id) => wire.includes(id))).toBe(true)
    expect([...hostMain, ...hostExtra, ...guestMain, ...guestExtra].filter((id) => !seen.includes(id) && wire.includes(id))).toEqual([])
  })

  it('deshacer una jugada propia vuelve atrás en los dos lados', () => {
    const game = setup()
    startBoth(game)

    game.host.play({ type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'atk' })
    game.host.play({ type: 'move', id: 'card-1001-1', to: 'gy' })
    undoAllowed(game, game.host, game.guest)

    expect(game.host.getSnapshot().moves).toBe(1)
    expectSameTables(game)
    expect(game.guest.getSnapshot().theirs?.state.gy).toEqual([])

    undoAllowed(game, game.host, game.guest)
    undoAllowed(game, game.host, game.guest)
    expect(game.host.getSnapshot().moves).toBe(0)
    expectSameTables(game)
  })

  describe('volver atrás pide permiso al rival', () => {
    const played = () => {
      const game = setup()
      startBoth(game)
      game.host.play({ type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'atk' })
      game.room.flush()
      return game
    }

    it('hasta que el rival contesta no se deshace nada: quien pide espera y el otro ve el pedido', () => {
      const game = played()

      game.host.undo()
      game.room.flush()

      expect(game.host.getSnapshot().undo).toMatchObject({ asking: true, asked: false })
      expect(game.guest.getSnapshot().undo).toMatchObject({ asking: false, asked: true })
      expect(game.host.getSnapshot().moves).toBe(1)
      expectSameTables(game)

      // Pedir de nuevo mientras espera no manda otro pedido.
      const sent = game.room.sent.length
      game.host.undo()
      expect(game.room.sent).toHaveLength(sent)
    })

    it('si lo permite, se deshace en los dos lados; si no lo permite, no, y quien pidió se entera', () => {
      const allowed = played()
      undoAllowed(allowed, allowed.host, allowed.guest)
      expect(allowed.host.getSnapshot().moves).toBe(0)
      expect(allowed.host.getSnapshot().undo).toMatchObject({ asking: false, result: null })
      expect(allowed.guest.getSnapshot().undo.asked).toBe(false)
      expectSameTables(allowed)

      const denied = played()
      denied.host.undo()
      denied.room.flush()
      denied.guest.answerUndo(false)
      denied.room.flush()
      expect(denied.host.getSnapshot().moves).toBe(1)
      expect(denied.host.getSnapshot().undo).toMatchObject({ asking: false, result: { n: 1, kind: 'denied' } })
      expect(denied.guest.getSnapshot().undo.asked).toBe(false)
      expectSameTables(denied)

      // Puede volver a pedirlo, y el resultado nuevo cuenta aparte.
      denied.host.undo()
      denied.room.flush()
      denied.guest.answerUndo(false)
      denied.room.flush()
      expect(denied.host.getSnapshot().undo.result).toEqual({ n: 2, kind: 'denied' })
    })

    it('hacer otra jugada mientras espera cancela el pedido: el cartel del rival se va y un permiso tardío no deshace la jugada nueva', () => {
      const game = played()

      game.host.undo()
      game.room.flush()
      game.host.play({ type: 'move', id: 'card-1001-1', to: 'gy' })
      game.room.flush()

      expect(game.host.getSnapshot().undo.asking).toBe(false)
      expect(game.guest.getSnapshot().undo.asked).toBe(false)
      game.guest.answerUndo(true)
      game.room.flush()
      expect(game.host.getSnapshot().moves).toBe(2)
      expectSameTables(game)
    })

    it('sin respuesta en 30 segundos el pedido se cancela y el rival deja de verlo', () => {
      vi.useFakeTimers()

      try {
        const game = played()

        game.host.undo()
        game.room.flush()
        vi.advanceTimersByTime(30_000)
        game.room.flush()

        expect(game.host.getSnapshot().undo).toMatchObject({ asking: false, result: { n: 1, kind: 'expired' } })
        expect(game.guest.getSnapshot().undo.asked).toBe(false)
        expect(game.host.getSnapshot().moves).toBe(1)
      } finally {
        vi.useRealTimers()
      }
    })

    it('sin el rival en la sala no hay a quién pedirle permiso: se deshace de una; y si el rival se va con un pedido en el aire, el pedido se cae', () => {
      const alone = played()
      alone.guestEnd.disconnect()
      alone.room.flush()
      alone.host.undo()
      expect(alone.host.getSnapshot().moves).toBe(0)

      const leaving = played()
      leaving.host.undo()
      leaving.room.flush()
      expect(leaving.guest.getSnapshot().undo.asked).toBe(true)
      leaving.hostEnd.disconnect()
      leaving.room.flush()
      expect(leaving.guest.getSnapshot().undo.asked).toBe(false)
      expect(leaving.host.getSnapshot().undo.asking).toBe(false)
    })
  })

  it('empezar otra vez (una revancha) reemplaza la mesa del rival', () => {
    const game = setup()
    startBoth(game)
    game.host.play({ type: 'move', id: 'card-1000-1', to: 'gy' })
    game.room.flush()

    game.host.start(hostTable)
    game.room.flush()

    expect(game.guest.getSnapshot().theirs?.state.gy).toEqual([])
    game.host.play({ type: 'draw', count: 1 })
    game.room.flush()
    expectSameTables(game)
  })

  it('lo que el rival recibe antes de que yo empiece también llega cuando empiezo', () => {
    const game = setup()
    game.host.start(hostTable)
    game.room.flush()

    expect(game.guest.getSnapshot().theirs).not.toBeNull()
    expect(game.host.getSnapshot().theirs).toBeNull()

    game.guest.start(guestTable)
    game.room.flush()
    expectSameTables(game)
  })
})

describe('puntos de vida y reloj', () => {
  it('cada uno cambia sólo los suyos y el otro lo ve', () => {
    const game = setup()

    game.host.changeLife(-1500)
    game.guest.halveLife()
    game.room.flush()

    expect(game.host.getSnapshot().life.lp).toEqual([6500, 4000])
    expect(game.guest.getSnapshot().life.lp).toEqual([6500, 4000])
  })

  it('manda el valor, no el cambio: si se pierde un mensaje, el siguiente deja todo bien', () => {
    const game = setup()

    game.host.changeLife(-1000)
    game.room.queue.length = 0
    game.host.changeLife(-500)
    game.room.flush()

    expect(game.guest.getSnapshot().life.lp[0]).toBe(6500)
  })

  it('el reloj es de los dos: lo que uno inicia o frena corre o se frena en el otro', () => {
    const game = setup()

    game.host.toggleClock()
    game.room.flush()
    game.clock.t += 4000

    expect(game.guest.getSnapshot().life.timer.running).toBe(true)
    expect(timerElapsed(game.guest.getSnapshot().life.timer, game.clock.t)).toBe(4000)

    game.guest.toggleClock()
    game.room.flush()

    expect(game.host.getSnapshot().life.timer).toMatchObject({ running: false, elapsedMs: 4000 })
  })

  it('el reloj no se puede reiniciar a mano: lo único que hacen los jugadores es iniciarlo o frenarlo', () => {
    const game = setup()

    expect('resetClock' in game.host).toBe(false)
    expect('resetClock' in game.guest).toBe(false)
  })

  it('al volver, el invitado toma el reloj del anfitrión', () => {
    const game = setup()

    game.guestEnd.disconnect()
    game.host.toggleClock()
    game.clock.t += 3000
    game.room.flush()
    game.guestEnd.reconnect()
    game.room.flush()

    expect(game.guest.getSnapshot().life.timer.running).toBe(true)
    expect(timerElapsed(game.guest.getSnapshot().life.timer, game.clock.t)).toBe(timerElapsed(game.host.getSnapshot().life.timer, game.clock.t))
  })
})

describe('cuando algo falla', () => {
  it('si uno se cae y vuelve, se repone todo lo que se perdió', () => {
    const game = setup()
    startBoth(game)

    game.guestEnd.disconnect()
    game.host.play({ type: 'draw', count: 1 })
    game.host.play({ type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'atk' })
    game.host.changeLife(-700)
    game.room.flush()
    expect(game.host.getSnapshot().peerPresent).toBe(false)

    game.guestEnd.reconnect()
    game.room.flush()

    expect(game.host.getSnapshot().peerPresent).toBe(true)
    expectSameTables(game)
    expect(game.guest.getSnapshot().life.lp[0]).toBe(7300)
  })

  it('un mensaje repetido no cambia nada', () => {
    const game = setup()
    startBoth(game)

    game.host.play({ type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'atk' })
    game.host.changeLife(-100)
    game.room.queue.push(...game.room.queue)
    game.room.flush()

    expectSameTables(game)
    expect(game.guest.getSnapshot().life.log).toHaveLength(1)
    expect(game.room.sent.filter((text) => text.includes('"resync"'))).toEqual([])
  })

  it('si llega una jugada salteada, pide la mesa de nuevo y queda igual', () => {
    const game = setup()
    startBoth(game)

    game.host.play({ type: 'draw', count: 1 })
    game.host.play({ type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'atk' })
    game.host.play({ type: 'move', id: 'card-1001-1', to: 'gy' })
    game.room.queue.splice(1, 1)
    game.room.flush()

    expectSameTables(game)
    expect(game.room.sent.filter((text) => text.includes('"resync"'))).toHaveLength(1)
  })

  it('jugadas fuera de orden también se arreglan', () => {
    const game = setup()
    startBoth(game)

    game.host.play({ type: 'draw', count: 1 })
    game.host.play({ type: 'move', id: 'card-1001-1', to: 'gy' })
    game.host.play({ type: 'phase', phase: 'main1' })
    game.room.queue.reverse()
    game.room.flush()

    expectSameTables(game)
  })

  it('lo que no es del protocolo se ignora', () => {
    const game = setup()
    startBoth(game)
    const before = game.guest.getSnapshot()

    for (const text of ['basura', '{"t":"act","n":1}', encodeMessage({ t: 'undo', n: 99 }).replace('99', '"x"'), '{"t":"sync","state":3}']) {
      game.room.inject(game.guestEnd, text)
    }

    game.room.flush()
    expect(game.guest.getSnapshot()).toBe(before)
  })

  it('si el otro recarga la página, sus números vuelven a contar desde el principio', () => {
    const game = setup()
    startBoth(game)

    game.guest.changeLife(-1000)
    game.guest.changeLife(-1000)
    game.guest.toggleClock()
    game.guest.toggleClock()
    game.guest.play({ type: 'draw', count: 1 })
    game.room.flush()
    expect(game.host.getSnapshot().life.lp[1]).toBe(6000)
    expect(game.host.getSnapshot().life.timer.running).toBe(false)

    game.guestEnd.close()
    const reloaded = createDuel(game.room.join(), { role: 'guest', name: 'Beto', now: () => game.clock.t, sid: 'guest-2' })
    game.room.flush()

    // Sus mensajes vuelven a numerarse desde 1: ninguno puede descartarse por parecerse a uno viejo.
    reloaded.toggleClock()
    reloaded.start(guestTable)
    reloaded.changeLife(-500)
    reloaded.play({ type: 'draw', count: 1 })
    game.room.flush()

    expect(game.host.getSnapshot().life.lp[1]).toBe(7500)
    expect(game.host.getSnapshot().life.timer.running).toBe(true)
    expect(game.host.getSnapshot().theirs?.state).toEqual(masked(guestTable, reloaded.getSnapshot().mine!))
  })

  it('quien recarga con su mesa guardada sigue con ella, sus vidas y el reloj, y el rival lo ve igual', () => {
    const game = setup()
    startBoth(game)
    game.guest.play({ type: 'draw', count: 1 })
    game.guest.play({ type: 'draw', count: 1 })
    game.guest.changeLife(-1500)
    game.room.flush()

    const before = game.guest.getSnapshot()
    const save = saveOf(before, game.clock.t)!

    game.guestEnd.close()
    const reloaded = createDuel(game.room.join(), { role: 'guest', name: 'Beto', now: () => game.clock.t, sid: 'guest-2', restore: save })
    game.room.flush()

    // No reparte otra mano: es la misma mesa, con las mismas jugadas, y los puntos de vida no vuelven a los de arranque cuando llega el saludo del anfitrión.
    expect(reloaded.getSnapshot().mine).toEqual(before.mine)
    expect(reloaded.getSnapshot().actions).toEqual(before.actions)
    expect(reloaded.getSnapshot().life.lp).toEqual([8000, 6500])
    expect(reloaded.getSnapshot()).toMatchObject({ starter: 0, opening: { ordered: true } })

    // El anfitrión ve la mesa y las vidas de antes, y el invitado, la del anfitrión.
    expect(game.host.getSnapshot().theirs?.state).toEqual(masked(guestTable, before.mine!))
    expect(game.host.getSnapshot().life.lp[1]).toBe(6500)
    expect(reloaded.getSnapshot().theirs?.state).toEqual(masked(hostTable, game.host.getSnapshot().mine!))

    // Y se sigue jugando: la jugada nueva llega en orden.
    reloaded.play({ type: 'draw', count: 1 })
    game.room.flush()
    expect(game.host.getSnapshot().theirs?.state).toEqual(masked(guestTable, reloaded.getSnapshot().mine!))
    expect(reloaded.getSnapshot().actions).toHaveLength(3)
  })

  it('al que no recarga no se le cierra la mesa del rival mientras llega la nueva', () => {
    const game = setup()
    startBoth(game)
    game.guest.play({ type: 'draw', count: 1 })
    game.room.flush()

    const save = saveOf(game.guest.getSnapshot(), game.clock.t)!
    const seen: boolean[] = []

    game.host.subscribe(() => seen.push(game.host.getSnapshot().theirs !== null))
    game.guestEnd.close()
    createDuel(game.room.join(), { role: 'guest', name: 'Beto', sid: 'guest-2', restore: save })
    game.room.flush()

    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every(Boolean)).toBe(true)
  })

  it('el reloj guardado se retoma desde donde estaba: no cuenta el tiempo que se estuvo afuera', () => {
    const game = setup()
    startBoth(game)
    game.host.toggleClock()
    game.room.flush()
    game.clock.t += 2_000

    const save = saveOf(game.host.getSnapshot(), game.clock.t)!
    game.hostEnd.close()
    // El duelo estuvo en pausa media hora: al volver el reloj sigue donde se había guardado.
    game.clock.t += 30 * 60_000
    const reloaded = createDuel(game.room.join(), { role: 'host', name: 'Ana', now: () => game.clock.t, sid: 'host-2', restore: save })
    game.room.flush()

    expect(reloaded.getSnapshot().life.timer.running).toBe(true)
    expect(timerElapsed(reloaded.getSnapshot().life.timer, game.clock.t)).toBe(2_000)

    // Uno que estaba pausado vuelve pausado.
    reloaded.toggleClock()
    const paused = saveOf(reloaded.getSnapshot(), game.clock.t)!
    expect(paused.timer.running).toBe(false)
    game.clock.t += 60_000
    const again = createDuel(createMemoryRoom().join(), { role: 'host', name: 'Ana', now: () => game.clock.t, sid: 'host-3', restore: paused })
    expect(again.getSnapshot().life.timer).toEqual({ running: false, startedAt: 0, elapsedMs: 2_000 })
  })

  it('si lo guardado no se puede volver a armar, se ignora y no queda una mesa a medias', () => {
    const game = setup()
    startBoth(game)
    const save = saveOf(game.guest.getSnapshot(), game.clock.t)!

    game.guestEnd.close()
    const broken = { ...save, initial: { ...save.initial, deck: undefined } } as unknown as typeof save
    const reloaded = createDuel(game.room.join(), { role: 'guest', name: 'Beto', sid: 'guest-2', restore: broken })

    expect(reloaded.getSnapshot()).toMatchObject({ mine: null, initial: null, actions: [] })
  })

  it('una ronda de piedra, papel o tijera terminada no vuelve a aparecer como "ya eligió" cuando el otro recarga; una a medias, sí', () => {
    const game = setup()

    game.host.pickRps('rock')
    game.guest.pickRps('paper')
    game.room.flush()
    expect(game.host.getSnapshot().rps).toEqual({ mine: 'rock', theirs: 'paper' })

    game.guestEnd.close()
    const reloaded = createDuel(game.room.join(), { role: 'guest', name: 'Beto', sid: 'guest-2' })
    game.room.flush()
    expect(reloaded.getSnapshot().rps).toEqual({ mine: null, theirs: null })
    expect(game.host.getSnapshot().rps).toEqual({ mine: null, theirs: null })

    // A medias: el anfitrión eligió y el invitado todavía no. Si el invitado recarga, igual se entera.
    game.host.pickRps('scissors')
    game.room.flush()
    reloaded.close()
    const again = createDuel(game.room.join(), { role: 'guest', name: 'Beto', sid: 'guest-3' })
    game.room.flush()
    expect(again.getSnapshot().rps).toEqual({ mine: null, theirs: 'scissors' })
  })

  it('suscribirse avisa de cada cambio y se puede dejar de escuchar', () => {
    const game = setup()
    let calls = 0
    const stop = game.host.subscribe(() => (calls += 1))
    const first = game.host.getSnapshot()

    game.host.changeLife(-100)
    expect(calls).toBe(1)
    expect(game.host.getSnapshot()).not.toBe(first)

    stop()
    game.host.changeLife(-100)
    expect(calls).toBe(1)
  })
})

describe('partidas al azar', () => {
  it('dos jugadores con cortes, pérdidas y repetidos terminan viendo la misma mesa y los mismos puntos', { timeout: 60_000 }, () => {
    for (let run = 1; run <= 60; run += 1) {
      const next = random(run)
      const game = setup()
      startBoth(game)

      const players: [Duel, MemoryEnd][] = [
        [game.host, game.hostEnd],
        [game.guest, game.guestEnd],
      ]

      for (let step = 0; step < 80; step += 1) {
        const roll = next()
        const [player, end] = players[next() < 0.5 ? 0 : 1]!
        const queued = game.room.queue.length

        if (roll < 0.62) {
          player.play(randomAction(player.getSnapshot().mine!, next))
        } else if (roll < 0.7) {
          player.undo()
        } else if (roll < 0.78) {
          player.changeLife(Math.floor(next() * 2000) - 1000)
        } else if (roll < 0.82) {
          player.toggleClock()
        } else if (roll < 0.88) {
          if (end.connected) end.disconnect()
          else end.reconnect()
        } else if (roll < 0.92 && queued > 0) {
          game.room.queue.push(game.room.queue[Math.floor(next() * queued)]!)
        } else if (roll < 0.96 && queued > 0) {
          game.room.queue.splice(Math.floor(next() * queued), 1)
        } else if (roll >= 0.96) {
          player.answerUndo(next() < 0.7)
        }

        if (next() < 0.7) {
          game.room.flush()
        }
      }

      // Lo último que hace el relay cuando alguien vuelve: avisar y que se den la mano de nuevo.
      for (const [, end] of players) end.disconnect()
      for (const [, end] of players) end.reconnect()
      game.room.flush()

      expectSameTables(game)
      expect(game.host.getSnapshot().life.lp, `corrida ${run}`).toEqual(game.guest.getSnapshot().life.lp)
      expect(game.host.getSnapshot().life.timer.running, `corrida ${run}`).toBe(game.guest.getSnapshot().life.timer.running)
      expect(timerElapsed(game.host.getSnapshot().life.timer, game.clock.t), `corrida ${run}`).toBe(timerElapsed(game.guest.getSnapshot().life.timer, game.clock.t))

      // Un pedido de volver atrás sin contestar deja un reloj de espera: se cierra la sesión para que no quede colgado.
      players.forEach(([player]) => player.close())
    }
  })
})

describe('los objetivos marcados del lado del otro', () => {
  /** Ana (anfitriona) pone su primera carta de la mano en el campo; Beto la ve con el id opaco que ella le dio. */
  function withFieldCard() {
    const game = setup()

    startBoth(game)
    game.host.play({ type: 'place', id: hostMain[0]!, zone: 'mz', index: 0, pos: 'atk', how: 'normal' })
    game.room.flush()

    const opaque = game.guest.getSnapshot().theirs!.state.mz[0]!.id

    return { ...game, opaque }
  }

  it('lo que uno marca de una carta o de una pila del rival lo ve su dueño en lo suyo (con sus ids reales), y marcar de nuevo lo quita', () => {
    const game = withFieldCard()

    game.guest.toggleMark({ card: game.opaque })
    game.guest.toggleMark({ pile: 'gy' })
    game.guest.toggleMark({ pile: 'hand' })
    game.room.flush()

    expect(game.guest.getSnapshot().marks.theirs).toEqual({ cards: [game.opaque], piles: ['gy', 'hand'] })
    expect(game.host.getSnapshot().marks.mine).toEqual({ cards: [hostMain[0]], piles: ['gy', 'hand'] })
    // Lo marcado del otro lado no se mezcla con lo propio.
    expect(game.guest.getSnapshot().marks.mine).toEqual({ cards: [], piles: [] })
    expect(game.host.getSnapshot().marks.theirs).toEqual({ cards: [], piles: [] })

    game.guest.toggleMark({ card: game.opaque })
    game.guest.toggleMark({ pile: 'gy' })
    game.room.flush()

    expect(game.host.getSnapshot().marks.mine).toEqual({ cards: [], piles: ['hand'] })
  })

  it('no se marca lo que no es del rival ni nada si el rival no está', () => {
    const game = withFieldCard()

    game.guest.toggleMark({ card: 'card-5000-1' })
    game.guest.toggleMark({ card: 'no-existe' })
    game.room.flush()
    expect(game.guest.getSnapshot().marks.theirs).toEqual({ cards: [], piles: [] })

    game.hostEnd.disconnect()
    game.room.flush()
    game.guest.toggleMark({ pile: 'deck' })
    expect(game.guest.getSnapshot().marks.theirs).toEqual({ cards: [], piles: [] })
  })

  it('si el dueño recarga (con su mesa guardada), el que marcó se las repone; si recarga quien marcó, las marcas se van de lo del otro', () => {
    const game = withFieldCard()

    game.guest.toggleMark({ card: game.opaque })
    game.guest.toggleMark({ pile: 'banished' })
    game.room.flush()

    // Recarga Ana, con su mesa guardada: Beto le vuelve a mandar todo lo que marcó.
    const save = saveOf(game.host.getSnapshot(), game.clock.t)!

    game.hostEnd.close()
    const reloaded = createDuel(game.room.join(), { role: 'host', name: 'Ana', now: () => game.clock.t, sid: 'host-2', restore: save })
    game.room.flush()
    expect(reloaded.getSnapshot().marks.mine).toEqual({ cards: [hostMain[0]], piles: ['banished'] })

    // Recarga Beto: sus marcas no sobreviven (no las guardó), y Ana deja de verlas.
    game.guestEnd.close()
    createDuel(game.room.join(), { role: 'guest', name: 'Beto', now: () => game.clock.t, sid: 'guest-2' })
    game.room.flush()
    expect(reloaded.getSnapshot().marks.mine).toEqual({ cards: [], piles: [] })
  })

  it('una marca dura mientras la carta siga donde estaba: si se va a otro lado, o la pila cambia, la marca se quita de los dos lados', () => {
    const game = withFieldCard()

    game.guest.toggleMark({ card: game.opaque })
    game.guest.toggleMark({ pile: 'gy' })
    game.guest.toggleMark({ pile: 'hand' })
    game.room.flush()
    expect(game.host.getSnapshot().marks.mine).toEqual({ cards: [hostMain[0]], piles: ['gy', 'hand'] })

    // Cambiarla de posición no es irse de ahí: la marca sigue.
    game.host.play({ type: 'position', id: hostMain[0]!, pos: 'def' })
    game.room.flush()
    expect(game.host.getSnapshot().marks.mine.cards).toEqual([hostMain[0]])

    // Se manda al cementerio: la marca de la carta se va (ya no está donde estaba) y la del cementerio también (ahora tiene otra cosa); la de la mano sigue (no cambió).
    game.host.play({ type: 'move', id: hostMain[0]!, to: 'gy' })
    game.room.flush()
    expect(game.guest.getSnapshot().marks.theirs).toEqual({ cards: [], piles: ['hand'] })
    expect(game.host.getSnapshot().marks.mine).toEqual({ cards: [], piles: ['hand'] })

    // Roba: la mano ya no es la misma y esa marca se va también.
    game.host.play({ type: 'draw', count: 1 })
    game.room.flush()
    expect(game.host.getSnapshot().marks.mine).toEqual({ cards: [], piles: [] })
  })

  it('una pila marcada sigue marcada mientras nada entre ni salga de ella', () => {
    const game = withFieldCard()

    game.guest.toggleMark({ pile: 'banished' })
    game.guest.toggleMark({ pile: 'gy' })
    game.room.flush()

    // El campo y la mano cambian, pero ni el cementerio ni el destierro.
    game.host.play({ type: 'position', id: hostMain[0]!, pos: 'def' })
    game.host.play({ type: 'draw', count: 1 })
    game.room.flush()
    expect(game.host.getSnapshot().marks.mine.piles).toEqual(['banished', 'gy'])

    // Entra una carta al destierro: sólo esa marca se va.
    game.host.play({ type: 'move', id: hostMain[0]!, to: 'banished' })
    game.room.flush()
    expect(game.host.getSnapshot().marks.mine.piles).toEqual(['gy'])
  })

  it('la revancha empieza sin marcas, de los dos lados', () => {
    const game = withFieldCard()

    game.guest.toggleMark({ pile: 'gy' })
    game.host.toggleMark({ pile: 'deck' })
    game.room.flush()
    expect(game.host.getSnapshot().marks.mine.piles).toEqual(['gy'])
    expect(game.guest.getSnapshot().marks.mine.piles).toEqual(['deck'])

    game.host.concede()
    game.host.rematch()
    game.guest.rematch()
    game.room.flush()

    for (const duel of [game.host, game.guest]) {
      expect(duel.getSnapshot().marks).toEqual({ mine: { cards: [], piles: [] }, theirs: { cards: [], piles: [] } })
    }
  })
})
