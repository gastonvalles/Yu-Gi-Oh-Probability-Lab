import { describe, expect, it } from 'vitest'

import { MAX_GAME_LOG, NEW_SERIES, RPS_PICKS, addGame, advanceSeries, rpsOutcome, seriesScore, type RpsPick } from '../app/duel-games'
import { encodeMessage, parseMessage } from '../app/duel-protocol'
import { createDuel } from '../app/duel-session'
import { completedTurns, duelTurnNumber, sharedPhase, whoseTurn } from '../app/duel-turn'
import { createMatState, type MatState } from '../app/practice-mat'
import { createMemoryRoom } from './support/memory-room'

describe('piedra, papel o tijera', () => {
  it('cada elección le gana a una y pierde con otra; la misma empata; falta una, no hay resultado', () => {
    const wins: Array<[RpsPick, RpsPick]> = [
      ['rock', 'scissors'],
      ['paper', 'rock'],
      ['scissors', 'paper'],
    ]

    for (const mine of RPS_PICKS) {
      for (const theirs of RPS_PICKS) {
        const expected = mine === theirs ? 'draw' : wins.some(([a, b]) => a === mine && b === theirs) ? 'win' : 'lose'
        expect(rpsOutcome(mine, theirs)).toBe(expected)
      }
    }

    expect(rpsOutcome('rock', null)).toBeNull()
    expect(rpsOutcome(null, 'rock')).toBeNull()
  })

  it('el registro guarda las últimas entradas y no crece sin fin', () => {
    let log = [] as ReturnType<typeof addGame>

    for (let id = 1; id <= MAX_GAME_LOG + 10; id += 1) {
      log = addGame(log, { id, from: 0, game: { kind: 'rematch' } })
    }

    expect(log).toHaveLength(MAX_GAME_LOG)
    expect(log[0]!.id).toBe(11)
    expect(log.at(-1)!.id).toBe(MAX_GAME_LOG + 10)
  })
})

describe('los juegos por la red', () => {
  const valid = [
    { kind: 'coin', face: 0 },
    { kind: 'coin', face: 1 },
    { kind: 'die', value: 1 },
    { kind: 'die', value: 6 },
    { kind: 'rps', pick: 'paper' },
    { kind: 'rps', pick: null },
    { kind: 'order', first: 1 },
    { kind: 'coin', face: 1, call: 0 },
    { kind: 'toss', method: 'die' },
  ]
  const invalid = [
    { kind: 'coin', face: 2 },
    { kind: 'coin' },
    { kind: 'die', value: 0 },
    { kind: 'die', value: 7 },
    { kind: 'die', value: 2.5 },
    { kind: 'rps', pick: 'lizard' },
    { kind: 'rps' },
    { kind: 'order', first: 2 },
    { kind: 'coin', face: 1, call: 2 },
    { kind: 'toss', method: 'dados' },
    { kind: 'toss' },
    { kind: 'sorteo' },
    'coin',
    null,
  ]
  const wire = (game: unknown, n: unknown = 1) => JSON.stringify({ t: 'game', n, game })

  it('acepta los juegos de verdad y rechaza lo mal formado', () => {
    valid.forEach((game) => expect(parseMessage(wire(game))).toEqual({ t: 'game', n: 1, game }))
    invalid.forEach((game) => expect(parseMessage(wire(game))).toBeNull())
    expect(parseMessage(wire({ kind: 'coin', face: 0 }, 0))).toBeNull()
    expect(parseMessage(wire({ kind: 'coin', face: 0 }, 'uno'))).toBeNull()
    expect(parseMessage(encodeMessage({ t: 'game', n: 3, game: { kind: 'die', value: 4 } }))).toEqual({ t: 'game', n: 3, game: { kind: 'die', value: 4 } })
  })
})

const hostTable = createMatState(Array.from({ length: 12 }, (_, index) => `card-${1000 + index}-1`), [], 5)
const guestTable = createMatState(Array.from({ length: 12 }, (_, index) => `card-${5000 + index}-1`), [], 5)

function setup() {
  const room = createMemoryRoom()
  const hostEnd = room.join()
  const guestEnd = room.join()
  // El azar de la moneda y el dado lo fijan las pruebas: cada uno tira lo que se le dé.
  const next = { host: 0.1, guest: 0.9 }
  const host = createDuel(hostEnd, { role: 'host', name: 'Ana', sid: 'host-1', random: () => next.host })
  const guest = createDuel(guestEnd, { role: 'guest', name: 'Beto', sid: 'guest-1', random: () => next.guest })

  room.flush()
  return { room, hostEnd, guestEnd, host, guest, next }
}

describe('de quién es el turno', () => {
  const at = (turn: number, phase: MatState['phase']): MatState => ({ ...hostTable, turn, phase })

  it('el turno pasa cuando quien juega vuelve de su End Phase a la Draw Phase, no al llegar a la End Phase (que todavía se juega)', () => {
    // Empieza Ana (anfitriona): juega mientras nadie haya pasado un turno.
    expect(whoseTurn(0, at(1, 'main1'), at(1, 'draw'), 0)).toBe('mine')
    expect(whoseTurn(1, at(1, 'draw'), at(1, 'main1'), 0)).toBe('theirs')

    // Ana llega a su End Phase: sigue siendo su turno, y Beto sigue esperando.
    expect(whoseTurn(0, at(1, 'end'), at(1, 'draw'), 0)).toBe('mine')
    expect(whoseTurn(1, at(1, 'draw'), at(1, 'end'), 0)).toBe('theirs')

    // Ana toca la Draw Phase (su turno 2 de contador): ahora le toca a Beto.
    expect(whoseTurn(0, at(2, 'draw'), at(1, 'draw'), 0)).toBe('theirs')
    expect(whoseTurn(1, at(1, 'draw'), at(2, 'draw'), 0)).toBe('mine')

    // Beto también pasa: otra vez Ana. Con quien empieza al revés, es al revés.
    expect(whoseTurn(0, at(2, 'draw'), at(2, 'draw'), 0)).toBe('mine')
    expect(whoseTurn(0, at(1, 'draw'), at(1, 'draw'), 1)).toBe('theirs')
  })

  it('la fase del duelo es la de quien tiene el turno, igual para los dos', () => {
    expect(sharedPhase('mine', at(1, 'main2'), at(1, 'draw'))).toBe('main2')
    expect(sharedPhase('theirs', at(1, 'main2'), at(1, 'battle'))).toBe('battle')
    expect(sharedPhase('mine', null, null)).toBeUndefined()
  })

  it('cuenta los turnos que pasó cada uno y en qué turno del duelo van', () => {
    expect(completedTurns(null)).toBe(0)
    expect(completedTurns(at(1, 'end'))).toBe(0)
    expect(completedTurns(at(2, 'draw'))).toBe(1)
    expect(duelTurnNumber(at(1, 'draw'), at(1, 'draw'))).toBe(1)
    expect(duelTurnNumber(at(2, 'draw'), at(1, 'draw'))).toBe(2)
    expect(duelTurnNumber(at(2, 'main1'), at(2, 'draw'))).toBe(3)
  })
})

describe('moneda y dado entre dos jugadores', () => {
  it('quien tira elige el resultado y los dos lo ven igual, con quién lo tiró', () => {
    const { room, host, guest } = setup()

    host.throwCoin()
    room.flush()
    guest.throwDie()
    room.flush()

    for (const duel of [host, guest]) {
      expect(duel.getSnapshot().games.map(({ from, game }) => [from, game])).toEqual([
        [0, { kind: 'coin', face: 0 }],
        [1, { kind: 'die', value: 6 }],
      ])
    }
  })

  it('el azar se reparte parejo: 0,49 es cara, 0,5 es cruz, y el dado va de 1 a 6', () => {
    const { room, host, next } = setup()

    next.host = 0.49
    host.throwCoin()
    next.host = 0.5
    host.throwCoin()
    next.host = 0
    host.throwDie()
    next.host = 0.9999
    host.throwDie()
    room.flush()

    expect(host.getSnapshot().games.map((entry) => entry.game)).toEqual([
      { kind: 'coin', face: 0 },
      { kind: 'coin', face: 1 },
      { kind: 'die', value: 1 },
      { kind: 'die', value: 6 },
    ])
  })

  it('sin el rival en la sala no se tira nada (no lo vería)', () => {
    const { room, hostEnd, host, guest } = setup()

    hostEnd.disconnect()
    room.flush()
    host.throwCoin()
    room.flush()

    expect(host.getSnapshot().games).toEqual([])
    expect(guest.getSnapshot().games).toEqual([])
  })

  it('un mensaje repetido o viejo no se anota dos veces', () => {
    const { room, host, guest, guestEnd } = setup()

    host.throwCoin()
    room.flush()
    // La red entrega dos veces el mismo mensaje (y uno anterior): se ignoran.
    const copy = encodeMessage({ t: 'game', n: 1, game: { kind: 'coin', face: 1 } })
    room.inject(guestEnd, copy)
    room.inject(guestEnd, copy)
    room.flush()

    expect(guest.getSnapshot().games).toHaveLength(1)
    expect(guest.getSnapshot().games[0]!.game).toEqual({ kind: 'coin', face: 0 })
  })

  it('si el rival recarga la página, sus números vuelven a empezar y no se pierde lo nuevo', () => {
    const room = createMemoryRoom()
    const hostEnd = room.join()
    const guestEnd = room.join()
    const host = createDuel(hostEnd, { role: 'host', name: 'Ana', sid: 'host-1' })
    const first = createDuel(guestEnd, { role: 'guest', name: 'Beto', sid: 'guest-1' })

    room.flush()
    first.throwDie()
    first.throwDie()
    room.flush()
    expect(host.getSnapshot().games).toHaveLength(2)

    // Beto recarga: otro `sid` y sus tiradas vuelven a contar desde 1.
    first.close()
    const again = createDuel(room.join(), { role: 'guest', name: 'Beto', sid: 'guest-2' })

    room.flush()
    again.throwCoin()
    room.flush()

    expect(host.getSnapshot().games).toHaveLength(3)
    expect(host.getSnapshot().games.at(-1)!.game.kind).toBe('coin')
  })
})

describe('piedra, papel o tijera entre dos jugadores', () => {
  it('cada uno elige una vez; el resultado sale cuando eligieron los dos y la misma elección no se cambia', () => {
    const { room, host, guest } = setup()

    host.pickRps('rock')
    room.flush()
    expect(host.getSnapshot().rps).toEqual({ mine: 'rock', theirs: null })
    // El invitado ya sabe que Ana eligió (la UI no lo muestra hasta que elija él), pero Ana no ve nada de lo de Beto.
    expect(guest.getSnapshot().rps).toEqual({ mine: null, theirs: 'rock' })

    guest.pickRps('scissors')
    guest.pickRps('paper')
    room.flush()

    expect(host.getSnapshot().rps).toEqual({ mine: 'rock', theirs: 'scissors' })
    expect(guest.getSnapshot().rps).toEqual({ mine: 'scissors', theirs: 'rock' })
    expect(rpsOutcome(host.getSnapshot().rps.mine, host.getSnapshot().rps.theirs)).toBe('win')
    expect(rpsOutcome(guest.getSnapshot().rps.mine, guest.getSnapshot().rps.theirs)).toBe('lose')
    // Dos elecciones en el registro, y el segundo intento de Beto ("papel") no existió.
    expect(host.getSnapshot().games.map((entry) => entry.game)).toEqual([
      { kind: 'rps', pick: 'rock' },
      { kind: 'rps', pick: 'scissors' },
    ])
  })

  it('otra ronda borra las dos elecciones y no deja nada en el registro', () => {
    const { room, host, guest } = setup()

    host.pickRps('paper')
    guest.pickRps('paper')
    room.flush()
    expect(rpsOutcome(host.getSnapshot().rps.mine, host.getSnapshot().rps.theirs)).toBe('draw')

    guest.pickRps(null)
    room.flush()

    for (const duel of [host, guest]) {
      expect(duel.getSnapshot().rps).toEqual({ mine: null, theirs: null })
      expect(duel.getSnapshot().games).toHaveLength(2)
    }

    host.pickRps('rock')
    room.flush()
    expect(guest.getSnapshot().rps.theirs).toBe('rock')
  })

  it('si Ana eligió mientras Beto no estaba, al volver le llega su elección, una sola vez en el registro', () => {
    const { room, hostEnd, guestEnd, host, guest } = setup()

    guestEnd.disconnect()
    room.flush()
    // Con el rival ausente no se puede elegir: primero vuelve.
    host.pickRps('rock')
    expect(host.getSnapshot().rps.mine).toBeNull()

    guestEnd.reconnect()
    room.flush()
    host.pickRps('rock')
    room.flush()
    expect(guest.getSnapshot().rps.theirs).toBe('rock')

    // Una caída después de elegir y otra reconexión: la elección se repite y el registro no se duplica.
    hostEnd.disconnect()
    room.flush()
    hostEnd.reconnect()
    room.flush()

    expect(guest.getSnapshot().rps.theirs).toBe('rock')
    expect(guest.getSnapshot().games.filter((entry) => entry.game.kind === 'rps')).toHaveLength(1)
  })
})

describe('piedra, papel o tijera y las recargas', () => {
  it('si Beto recarga la página después de que Ana eligió, su elección le llega de nuevo y puede elegir la suya', () => {
    const room = createMemoryRoom()
    const host = createDuel(room.join(), { role: 'host', name: 'Ana', sid: 'host-1' })
    const first = createDuel(room.join(), { role: 'guest', name: 'Beto', sid: 'guest-1' })

    room.flush()
    host.pickRps('paper')
    room.flush()
    expect(first.getSnapshot().rps.theirs).toBe('paper')

    // Beto recarga: la página nueva no sabe nada, y Ana le repite lo que eligió (sin duplicar su registro).
    first.close()
    const again = createDuel(room.join(), { role: 'guest', name: 'Beto', sid: 'guest-2' })

    room.flush()
    expect(again.getSnapshot().rps).toEqual({ mine: null, theirs: 'paper' })

    again.pickRps('scissors')
    room.flush()
    expect(rpsOutcome(host.getSnapshot().rps.mine, host.getSnapshot().rps.theirs)).toBe('lose')
    expect(host.getSnapshot().games.filter((entry) => entry.from === 0)).toHaveLength(1)
  })
})

describe('quién empieza', () => {
  it('lo que uno dice lo ven los dos igual, y el turno cuenta desde ahí', () => {
    const { room, host, guest } = setup()

    expect(host.getSnapshot().starter).toBe(0)
    expect(guest.getSnapshot().starter).toBe(0)

    // Beto gana la moneda y va primero.
    guest.chooseFirst(1)
    room.flush()

    expect(host.getSnapshot().starter).toBe(1)
    expect(guest.getSnapshot().starter).toBe(1)
    expect(whoseTurn(1, guestTable, hostTable, guest.getSnapshot().starter)).toBe('mine')
    expect(whoseTurn(0, hostTable, guestTable, host.getSnapshot().starter)).toBe('theirs')
    // Ana pasa de fase hasta el turno 2 de su mesa: ahora le toca a Ana.
    expect(whoseTurn(0, { ...hostTable, turn: 2 }, { ...guestTable, turn: 2 }, 1)).toBe('theirs')
    expect(whoseTurn(0, hostTable, { ...guestTable, turn: 2 }, 1)).toBe('mine')
  })

})

describe('el marcador de un Match', () => {
  it('suma el duelo de ahora sin tocar lo ya jugado, y gana quien llega a 2', () => {
    expect(seriesScore(NEW_SERIES, null)).toEqual({ wins: [0, 0], winner: null })
    expect(seriesScore(NEW_SERIES, { kind: 'loss', loser: 0 })).toEqual({ wins: [0, 1], winner: null })
    expect(seriesScore({ played: 1, wins: [1, 0] }, { kind: 'loss', loser: 1 })).toEqual({ wins: [2, 0], winner: 0 })
    expect(seriesScore({ played: 1, wins: [1, 0] }, { kind: 'draw' })).toEqual({ wins: [1, 0], winner: null })
  })

  it('al seguir cuenta el duelo, y si el Match ya estaba ganado vuelve a empezar', () => {
    expect(advanceSeries(NEW_SERIES, { kind: 'loss', loser: 1 })).toEqual({ played: 1, wins: [1, 0] })
    expect(advanceSeries({ played: 1, wins: [1, 0] }, { kind: 'draw' })).toEqual({ played: 2, wins: [1, 0] })
    expect(advanceSeries({ played: 2, wins: [1, 1] }, { kind: 'loss', loser: 0 })).toEqual({ played: 3, wins: [0, 0] })
  })
})
