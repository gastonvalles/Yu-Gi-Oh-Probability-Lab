import { describe, expect, it } from 'vitest'

import { encodeMessage, type DuelSettings } from '../app/duel-protocol'
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
    game.host.undo()
    game.room.flush()

    expect(game.host.getSnapshot().moves).toBe(1)
    expectSameTables(game)
    expect(game.guest.getSnapshot().theirs?.state.gy).toEqual([])

    game.host.undo()
    game.host.undo()
    game.room.flush()
    expect(game.host.getSnapshot().moves).toBe(0)
    expectSameTables(game)
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
    }
  })
})
