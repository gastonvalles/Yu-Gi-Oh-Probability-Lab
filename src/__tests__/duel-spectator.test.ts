import { describe, expect, it } from 'vitest'

import { MAX_SPECTATORS, SPECTATOR_RESYNC, encodeRelayFrame, encodeSpectatorText, parseRelayFrame, parseSpectatorText } from '../app/duel-relay-rules'
import { TURN_BANK_MS, TURN_BONUS_MS, turnTimeLeft } from '../app/duel-clock'
import { createDuel } from '../app/duel-session'
import { createSpectator } from '../app/duel-spectator'
import { createMatState } from '../app/practice-mat'
import { createMemoryRoom } from './support/memory-room'

const hostTable = createMatState(Array.from({ length: 12 }, (_, index) => `card-${1000 + index}-1`), ['card-1900-1'], 5)
const guestTable = createMatState(Array.from({ length: 12 }, (_, index) => `card-${5000 + index}-1`), ['card-5900-1'], 5)

/** Dos jugadores en la sala, listos para empezar. */
function setup(match = false, turnClock = false) {
  const room = createMemoryRoom()
  const clock = { t: 10_000 }
  const hostEnd = room.join()
  const guestEnd = room.join()
  const host = createDuel(hostEnd, { role: 'host', name: 'Ana', settings: { lp: 8000, hand: 5, limitMin: 50, format: 'unlimited', match, siding: false, ...(turnClock ? { turnMin: 7, turnBonusMin: 3 } : {}) }, now: () => clock.t, sid: 'host-1', random: () => 0.1 })
  const guest = createDuel(guestEnd, { role: 'guest', name: 'Beto', now: () => clock.t, sid: 'guest-1', random: () => 0.9 })

  room.flush()
  return { room, clock, hostEnd, guestEnd, host, guest }
}

/** Un duelo ya empezado: los dos con su mano y listos, el anfitrión empezando. */
function startedDuel(match = false, turnClock = false) {
  const game = setup(match, turnClock)

  game.host.setReady(true)
  game.guest.setReady(true)
  game.host.chooseMethod('rps')
  game.room.flush()
  game.host.pickRps('rock')
  game.guest.pickRps('scissors')
  game.host.chooseFirst(0)
  game.room.flush()
  game.host.start(hostTable)
  game.guest.start(guestTable)
  game.room.flush()
  return game
}

function watch(game: ReturnType<typeof setup>) {
  const transport = game.room.spectate()
  const spectator = createSpectator(transport, { now: () => game.clock.t })

  game.room.flush()
  return { transport, spectator }
}

describe('un espectador que llega con el duelo empezado', () => {
  it('se pone al día solo: los nombres, las dos mesas como las ve el rival, las vidas, el turno y la fase', () => {
    const game = startedDuel()

    game.host.play({ type: 'phase', phase: 'main1', skipDraw: true })
    game.host.changeLife(-1500)
    game.room.flush()

    const { spectator } = watch(game)
    const view = spectator.getSnapshot()

    expect(view.live).toBe(true)
    expect(view.players).toBe(2)
    expect(view.sides.map((side) => side.name)).toEqual(['Ana', 'Beto'])
    expect(view.sides.map((side) => side.lp)).toEqual([6500, 8000])
    expect(view.settings).toEqual({ lp: 8000, hand: 5, limitMin: 50, format: 'unlimited', match: false, siding: false })
    expect(view).toMatchObject({ turn: 0, phase: 'main1', starter: 0 })
    // Ve de cada uno lo mismo que ve el otro jugador: ni la mano ni el deck de nadie.
    expect(view.sides[0].mirror?.state).toEqual(game.guest.getSnapshot().theirs?.state)
    expect(view.sides[1].mirror?.state).toEqual(game.host.getSnapshot().theirs?.state)
    expect(view.sides[0].mirror?.known).toEqual(game.guest.getSnapshot().theirs?.known)
    expect(game.room.spectators[0]!.syncRequests).toBe(0)
  })

  it('con las mesas por llegar todavía no está en vivo, y lo está cuando llegan las dos', () => {
    const game = setup()
    const { spectator } = watch(game)

    expect(spectator.getSnapshot()).toMatchObject({ live: false, turn: null, phase: null })
    expect(spectator.getSnapshot().sides.map((side) => side.name)).toEqual(['Ana', 'Beto'])

    game.host.start(hostTable)
    game.room.flush()
    expect(spectator.getSnapshot().live).toBe(false)
    game.guest.start(guestTable)
    game.room.flush()
    expect(spectator.getSnapshot().live).toBe(true)
  })

  it('en la sala (antes de la mesa) ve quiénes están, si están listos, y el chat y lo que tiran juntos y en orden', () => {
    const game = setup()
    const { spectator } = watch(game)

    expect(spectator.getSnapshot().live).toBe(false)
    expect(spectator.getSnapshot().sides.map((side) => [side.name, side.ready])).toEqual([
      ['Ana', false],
      ['Beto', false],
    ])

    game.host.setReady(true)
    game.host.sendChat('suerte')
    game.guest.setReady(true)
    game.guest.sendChat('igual')
    game.room.flush()
    game.host.chooseMethod('rps')
    game.room.flush()

    const view = spectator.getSnapshot()

    expect(view.live).toBe(false)
    expect(view.sides.map((side) => side.ready)).toEqual([true, true])
    // El chat y lo que tiraron, en el orden en que pasó.
    expect(view.feed.map((item) => (item.kind === 'chat' ? ['chat', item.line.text] : ['game', item.entry.game.kind]))).toEqual([
      ['chat', 'suerte'],
      ['chat', 'igual'],
      ['game', 'toss'],
    ])
  })

  it('sigue el duelo en vivo: jugadas, deshacer, vidas, reloj, chat, lo que se tiró y el cambio de turno', () => {
    const game = startedDuel()
    const { spectator } = watch(game)

    game.host.play({ type: 'summon', id: 'card-1900-1', how: 'fusion', materials: [], zone: 'emz', index: 0, pos: 'atk' } as never)
    game.host.play({ type: 'phase', phase: 'battle', skipDraw: true })
    game.guest.changeLife(-1000)
    game.host.sendChat('¿respondés?')
    game.guest.sendChat('sí')
    game.host.throwCoin()
    game.room.flush()

    let view = spectator.getSnapshot()
    expect(view.phase).toBe('battle')
    expect(view.sides[1].lp).toBe(7000)
    expect(view.chat.map((line) => [line.from, line.text])).toEqual([
      [0, '¿respondés?'],
      [1, 'sí'],
    ])
    expect(view.games.at(-1)).toMatchObject({ from: 0, game: { kind: 'coin' } })
    expect(view.sides[0].mirror?.state).toEqual(game.guest.getSnapshot().theirs?.state)

    // Deshacer también se ve (vuelve a la fase de antes de pasar a la Battle Phase).
    game.host.undo()
    game.room.flush()
    game.guest.answerUndo(true)
    game.room.flush()
    expect(spectator.getSnapshot().phase).toBe('draw')

    // Ana pasa el turno (End Phase y después la Draw Phase): ahora juega Beto.
    game.host.play({ type: 'phase', phase: 'end', skipDraw: true })
    game.host.play({ type: 'phase', phase: 'draw', skipDraw: true })
    game.room.flush()
    view = spectator.getSnapshot()
    expect(view.turn).toBe(1)
    expect(view.phase).toBe('draw')

    // El reloj del anfitrión.
    game.host.toggleClock()
    game.room.flush()
    expect(spectator.getSnapshot().clock.running).toBe(game.host.getSnapshot().life.timer.running)
  })

  it('si se le pierde una jugada pide el estado y se repone sin que nadie haga nada más', () => {
    const game = startedDuel()
    const { transport, spectator } = watch(game)

    game.host.play({ type: 'phase', phase: 'main1', skipDraw: true })
    game.room.flush()
    expect(spectator.getSnapshot().phase).toBe('main1')

    // La siguiente jugada del anfitrión se pierde en el camino al espectador (no a Beto).
    game.host.play({ type: 'phase', phase: 'battle', skipDraw: true })
    game.room.queue.splice(0).forEach((envelope) => {
      if (!('spectator' in envelope)) game.room.queue.push(envelope)
    })
    game.room.flush()
    expect(spectator.getSnapshot().phase).toBe('main1')

    // La que sigue llega con un hueco: lo nota, pide el estado y los jugadores lo repiten.
    game.host.play({ type: 'phase', phase: 'main2', skipDraw: true })
    game.room.flush()
    expect(transport.syncRequests).toBe(1)
    expect(spectator.getSnapshot().phase).toBe('main2')
    expect(spectator.getSnapshot().sides[0].mirror?.state).toEqual(game.guest.getSnapshot().theirs?.state)
  })

  it('no insiste: pide el estado una vez cada tanto, aunque sigan faltando jugadas', () => {
    const game = startedDuel()
    const { transport, spectator } = watch(game)

    // Los jugadores no llegan a contestar (nadie repone el estado): el espectador sigue viendo huecos.
    game.room.askForState = () => undefined
    game.host.play({ type: 'phase', phase: 'main1', skipDraw: true })
    game.room.queue.splice(0).forEach((envelope) => {
      if (!('spectator' in envelope)) game.room.queue.push(envelope)
    })
    game.host.play({ type: 'phase', phase: 'battle', skipDraw: true })
    game.room.flush()
    expect(transport.syncRequests).toBe(1)

    // Otra jugada que también deja un hueco, enseguida: no vuelve a pedir.
    game.host.play({ type: 'phase', phase: 'main2', skipDraw: true })
    game.room.flush()
    expect(transport.syncRequests).toBe(1)

    // Pasado un rato, sí.
    game.clock.t += 3000
    game.host.play({ type: 'phase', phase: 'end', skipDraw: true })
    game.room.flush()
    expect(transport.syncRequests).toBe(2)
    expect(spectator.getSnapshot().phase).toBe('draw')
  })

  it('si un jugador recarga la página, su lado se reinicia y se vuelve a armar con su nuevo estado', () => {
    const game = startedDuel()
    const { spectator } = watch(game)

    game.guest.sendChat('hola')
    game.room.flush()
    expect(spectator.getSnapshot().chat).toHaveLength(1)

    game.guestEnd.close()
    const reloaded = createDuel(game.room.join(), { role: 'guest', name: 'Beto', now: () => game.clock.t, sid: 'guest-2' })

    game.room.flush()
    // Recién llegado, su lado se vació (no hay mesa todavía).
    expect(spectator.getSnapshot().live).toBe(false)
    expect(spectator.getSnapshot().sides[1]).toMatchObject({ name: 'Beto', mirror: null })

    reloaded.start(guestTable)
    reloaded.sendChat('de nuevo')
    game.room.flush()
    expect(spectator.getSnapshot().live).toBe(true)
    // Sus mensajes vuelven a numerarse desde 1 y el espectador no los descarta.
    expect(spectator.getSnapshot().chat.at(-1)?.text).toBe('de nuevo')
  })

  it('un lado que no saludó todavía no se interpreta: pide el estado para que salude', () => {
    const room = createMemoryRoom()
    const transport = room.spectate()
    createSpectator(transport)

    room.join()
    room.join()
    // Llega una jugada suelta de alguien que el espectador no conoce.
    transport.deliver(encodeSpectatorText(0, JSON.stringify({ t: 'chat', n: 1, text: 'hola' })))
    expect(transport.syncRequests).toBeGreaterThanOrEqual(1)
  })

  it('lo que no es del protocolo se ignora, y dejar de mirar cierra todo', () => {
    const game = startedDuel()
    const { transport, spectator } = watch(game)
    let calls = 0
    const stop = spectator.subscribe(() => (calls += 1))

    transport.deliver(encodeSpectatorText(0, 'basura'))
    transport.deliver(encodeSpectatorText(1, JSON.stringify({ t: 'nada' })))
    expect(calls).toBe(0)
    stop()

    spectator.close()
    expect(game.room.spectators).toHaveLength(0)
  })

  it('los jugadores saben cuántos los miran', () => {
    const game = startedDuel()

    expect(game.host.getSnapshot().watchers).toBe(0)
    const first = game.room.spectate()
    game.room.spectate()
    game.room.flush()

    expect(game.host.getSnapshot().watchers).toBe(2)
    expect(game.guest.getSnapshot().watchers).toBe(2)
    expect(() => game.room.spectate()).toThrow()

    first.close()
    game.room.flush()
    expect(game.host.getSnapshot().watchers).toBe(1)
  })

  it('que un espectador se vaya no pausa el duelo: los jugadores se siguen viendo; sólo se pausa cuando sale uno de ellos', () => {
    const game = startedDuel()
    const { transport } = watch(game)

    expect(game.host.getSnapshot()).toMatchObject({ peerPresent: true, watchers: 1 })
    expect(game.guest.getSnapshot()).toMatchObject({ peerPresent: true, watchers: 1 })

    transport.close()
    game.room.flush()
    expect(game.host.getSnapshot()).toMatchObject({ peerPresent: true, watchers: 0 })
    expect(game.guest.getSnapshot()).toMatchObject({ peerPresent: true, watchers: 0 })

    // Un jugador que se va, sí lo pausa (para el otro).
    game.guestEnd.disconnect()
    game.room.flush()
    expect(game.host.getSnapshot().peerPresent).toBe(false)
  })
})

describe('lo que el relay le avisa y le manda a un espectador', () => {
  it('los avisos de cuántos jugadores hay y de cuántos espectadores, y el texto de un jugador con su etiqueta', () => {
    for (const frame of [
      { kind: 'players', count: 0 },
      { kind: 'players', count: 2 },
      { kind: 'watchers', count: 1, sync: true },
      { kind: 'watchers', count: 0, sync: false },
    ] as const) {
      expect(parseRelayFrame(encodeRelayFrame(frame).buffer as ArrayBuffer)).toEqual(frame)
    }

    // Un aviso fuera de rango no vale.
    expect(parseRelayFrame(Uint8Array.of(3, 3).buffer)).toBeNull()
    expect(parseRelayFrame(Uint8Array.of(4, MAX_SPECTATORS + 1, 0).buffer)).toBeNull()
    expect(parseRelayFrame(Uint8Array.of(4, 1, 2).buffer)).toBeNull()

    expect(parseSpectatorText(encodeSpectatorText(0, '{"t":"x"}'))).toEqual({ tag: 0, text: '{"t":"x"}' })
    expect(parseSpectatorText(encodeSpectatorText(1, 'hola'))).toEqual({ tag: 1, text: 'hola' })
    expect(parseSpectatorText('2hola')).toBeNull()
    expect(parseSpectatorText('1')).toBeNull()
    expect(parseSpectatorText('')).toBeNull()
    expect(SPECTATOR_RESYNC).toBe('resync')
  })
})

describe('cómo termina el duelo para quien mira', () => {
  it('un duelo suelto: quién ganó y por qué (rendición o puntos de vida), y que con eso se terminó lo que se miraba', () => {
    const game = startedDuel()
    const { spectator } = watch(game)

    expect(spectator.getSnapshot().end).toBeNull()

    game.guest.concede()
    game.room.flush()
    expect(spectator.getSnapshot().end).toEqual({ winner: 0, reason: 'conceded', loser: 1, match: false, wins: [0, 0], over: true, matchWinner: null })

    const byLife = startedDuel()
    const other = watch(byLife)

    byLife.host.changeLife(-8000)
    byLife.room.flush()
    expect(other.spectator.getSnapshot().end).toMatchObject({ winner: 1, reason: 'life', loser: 0, over: true })
  })

  it('si se quedan sin puntos los dos a la vez es un empate, sin ganador', () => {
    const game = startedDuel()
    const { spectator } = watch(game)

    game.host.changeLife(-8000)
    game.guest.changeLife(-8000)
    game.room.flush()
    expect(spectator.getSnapshot().end).toMatchObject({ winner: null, loser: null, reason: 'draw', over: true })
  })

  it('en un Match, un duelo no termina lo que se miraba: el marcador va sumando, y con la revancha el cartel se va hasta que termina el Match', () => {
    const game = startedDuel(true)
    const { spectator } = watch(game)

    game.guest.concede()
    game.room.flush()
    expect(spectator.getSnapshot().end).toMatchObject({ winner: 0, match: true, wins: [1, 0], over: false, matchWinner: null })

    // Los dos piden seguir: el duelo que terminó deja de verse como terminado (y no se cuenta dos veces).
    game.host.rematch()
    game.guest.rematch()
    game.room.flush()
    expect(spectator.getSnapshot().end).toBeNull()

    // Segundo duelo: gana el anfitrión otra vez y define el Match.
    game.guest.chooseFirst(0)
    game.room.flush()
    game.host.start(hostTable)
    game.guest.start(guestTable)
    game.room.flush()
    expect(spectator.getSnapshot().end).toBeNull()
    game.guest.concede()
    game.room.flush()
    expect(spectator.getSnapshot().end).toMatchObject({ winner: 0, wins: [2, 0], over: true, matchWinner: 0 })
  })
})

describe('el reloj de turnos que ve quien mira', () => {
  it('lleva la cuenta de los dos jugadores: corre el de quien tiene el turno, y al pasarlo se suman 2 minutos al otro', () => {
    const game = startedDuel(false, true)
    const { spectator } = watch(game)
    const left = (who: 0 | 1) => turnTimeLeft(spectator.getSnapshot().turnClock, who, game.clock.t)

    expect(left(0)).toBe(TURN_BANK_MS)
    expect(left(1)).toBe(TURN_BANK_MS)

    // El anfitrión (que empieza) piensa 45 s y pasa el turno.
    game.clock.t += 45_000
    expect(left(0)).toBe(TURN_BANK_MS - 45_000)
    game.host.play({ type: 'phase', phase: 'end' })
    game.host.play({ type: 'phase', phase: 'draw' })
    game.room.flush()
    expect(left(0)).toBe(TURN_BANK_MS - 45_000)
    expect(left(1)).toBe(TURN_BANK_MS + TURN_BONUS_MS)

    game.clock.t += 30_000
    expect(left(1)).toBe(TURN_BANK_MS + TURN_BONUS_MS - 30_000)
    expect(left(0)).toBe(TURN_BANK_MS - 45_000)
  })
})
