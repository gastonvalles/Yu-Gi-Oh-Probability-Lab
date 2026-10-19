import { describe, expect, it, vi } from 'vitest'

import { PROTOCOL_VERSION, encodeMessage, type DuelSettings } from '../app/duel-protocol'
import { saveOf } from '../app/duel-save'
import { EMOTE_GAP_MS, PHASE_WAIT_MS, createDuel, type Duel } from '../app/duel-session'
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
    const { host, guest } = setup({ lp: 4000, hand: 6, limitMin: 50, format: 'unlimited', match: false, siding: false })

    expect(host.getSnapshot()).toMatchObject({ peerPresent: true, peerName: 'Beto', me: 0, incompatible: false })
    expect(guest.getSnapshot()).toMatchObject({ peerPresent: true, peerName: 'Ana', me: 1, settings: { lp: 4000, hand: 6, limitMin: 50, format: 'unlimited', match: false, siding: false }, incompatible: false })
    expect(guest.getSnapshot().life.lp).toEqual([4000, 4000])
    expect(host.getSnapshot().life.lp).toEqual([4000, 4000])
  })

  it('los ajustes del duelo son del anfitrión: un saludo de invitado que los traiga no los cambia', () => {
    const game = setup({ lp: 4000, hand: 6, limitMin: 50, format: 'unlimited', match: false, siding: false })

    // El anfitrión recibe, de quien se hace pasar por el invitado, ajustes válidos pero que no le corresponden.
    game.room.inject(game.hostEnd, JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, sid: 'guest-1', role: 'guest', name: 'Beto', settings: { lp: 1000, hand: 3 } }))
    game.room.flush()

    expect(game.host.getSnapshot().settings).toEqual({ lp: 4000, hand: 6, limitMin: 50, format: 'unlimited', match: false, siding: false })
    expect(game.host.getSnapshot().life.lp).toEqual([4000, 4000])
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

  describe('Deshacer vuelve atrás la última jugada de la mesa, sea de quien sea', () => {
    const played = () => {
      const game = setup()
      startBoth(game)
      game.host.play({ type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'atk' })
      game.room.flush()
      game.guest.play({ type: 'move', id: 'card-5001-1', to: 'gy' })
      game.room.flush()
      return game
    }

    it('con la última jugada del rival, quien toca Deshacer le pide al rival que la deshaga: si la permite, vuelve atrás la suya (y la mía queda)', () => {
      const game = played()

      expect(game.host.getSnapshot().undo).toMatchObject({ available: true, blocked: false })
      game.host.undo()
      game.room.flush()

      expect(game.host.getSnapshot().undo).toMatchObject({ asking: true, asked: false })
      expect(game.guest.getSnapshot().undo).toMatchObject({ asking: false, asked: true })
      // Hasta que contesta no se deshace nada.
      expect(game.guest.getSnapshot().mine?.gy).toHaveLength(1)

      game.guest.answerUndo(true)
      game.room.flush()

      expect(game.guest.getSnapshot().moves).toBe(0)
      expect(game.guest.getSnapshot().mine?.gy).toEqual([])
      expect(game.host.getSnapshot().moves).toBe(1)
      expect(game.host.getSnapshot().undo).toMatchObject({ asking: false, result: null })
      expect(game.guest.getSnapshot().undo.asked).toBe(false)
      expectSameTables(game)
    })

    it('es lo mismo para los dos: el invitado también deshace la última jugada del anfitrión, y después la anterior (la suya)', () => {
      const game = setup()
      startBoth(game)
      game.guest.play({ type: 'move', id: 'card-5001-1', to: 'gy' })
      game.room.flush()
      game.host.play({ type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'atk' })
      game.room.flush()

      undoAllowed(game, game.guest, game.host)
      expect(game.host.getSnapshot().moves).toBe(0)
      expect(game.guest.getSnapshot().moves).toBe(1)
      expectSameTables(game)

      // Ahora la última de la mesa es la del invitado: es la suya y la deshace con el permiso del anfitrión.
      undoAllowed(game, game.guest, game.host)
      expect(game.guest.getSnapshot().moves).toBe(0)
      expectSameTables(game)
      expect(game.guest.getSnapshot().undo.available).toBe(false)
      expect(game.host.getSnapshot().undo.available).toBe(false)
    })

    it('el que no hizo ninguna jugada también puede deshacer la del rival (sin nada propio que deshacer)', () => {
      const game = setup()
      startBoth(game)

      expect(game.host.getSnapshot().undo.available).toBe(false)
      game.guest.play({ type: 'move', id: 'card-5001-1', to: 'gy' })
      game.room.flush()
      expect(game.host.getSnapshot().moves).toBe(0)
      expect(game.host.getSnapshot().undo.available).toBe(true)

      undoAllowed(game, game.host, game.guest)
      expect(game.guest.getSnapshot().moves).toBe(0)
      expectSameTables(game)
    })

    it('si no la permite, no pasa nada y quien pidió se entera', () => {
      const game = played()

      game.host.undo()
      game.room.flush()
      game.guest.answerUndo(false)
      game.room.flush()

      expect(game.guest.getSnapshot().moves).toBe(1)
      expect(game.host.getSnapshot().undo).toMatchObject({ asking: false, result: { n: 1, kind: 'denied' } })
      expectSameTables(game)
    })

    it('si el dueño de la jugada hace otra antes de contestar, el pedido quedó viejo: no se deshace nada y se entera como si no la hubiera permitido', () => {
      const game = played()

      game.host.undo()
      game.room.flush()
      game.guest.play({ type: 'move', id: 'card-5002-1', to: 'gy' })
      game.room.flush()

      expect(game.guest.getSnapshot().undo.asked).toBe(false)
      expect(game.host.getSnapshot().undo).toMatchObject({ asking: false, result: { n: 1, kind: 'denied' } })
      expect(game.guest.getSnapshot().moves).toBe(2)
      expectSameTables(game)
    })

    it('quien pide cancela su pedido al hacer otra jugada: el cartel del rival se va', () => {
      const game = played()

      game.host.undo()
      game.room.flush()
      game.host.play({ type: 'move', id: 'card-1001-1', to: 'gy' })
      game.room.flush()

      expect(game.host.getSnapshot().undo.asking).toBe(false)
      expect(game.guest.getSnapshot().undo.asked).toBe(false)
    })
  })

  describe('los emotes no se spamean', () => {
    it('una señal rápida (🤔, 👍) sale cada 3 segundos como mucho: las de antes no llegan al rival, y pasado el plazo vuelve a salir', () => {
      const game = setup()
      const texts = () => game.guest.getSnapshot().chat.map((line) => line.text)

      expect(game.host.getSnapshot().emoteReadyAt).toBe(0)
      game.host.sendChat('👍')
      game.room.flush()
      expect(game.host.getSnapshot().emoteReadyAt).toBe(game.clock.t + EMOTE_GAP_MS)

      // Apretar de nuevo (la misma o la otra) antes de los 3 segundos no manda nada.
      game.clock.t += EMOTE_GAP_MS - 1
      game.host.sendChat('👍')
      game.host.sendChat('🤔')
      game.room.flush()
      expect(texts()).toEqual(['👍'])
      expect(game.host.getSnapshot().chat.map((line) => line.text)).toEqual(['👍'])

      // Cumplidos los 3 segundos, sale otra; y el plazo vuelve a contar desde ahí.
      game.clock.t += 1
      game.host.sendChat('🤔')
      game.room.flush()
      expect(texts()).toEqual(['👍', '🤔'])
      game.host.sendChat('👍')
      game.room.flush()
      expect(texts()).toEqual(['👍', '🤔'])
    })

    it('el plazo es de cada uno y no frena lo que se escribe a mano', () => {
      const game = setup()
      const texts = (duel: Duel) => duel.getSnapshot().chat.map((line) => line.text)

      game.host.sendChat('👍')
      game.guest.sendChat('👍')
      game.host.sendChat('Hola, ya entro')
      game.host.sendChat('¿Jugás ya?')
      game.room.flush()

      // Cada uno ve lo suyo al instante y lo del otro al llegar: el orden entre los dos puede cambiar, lo que llega no.
      expect([...texts(game.host)].sort()).toEqual(['¿Jugás ya?', 'Hola, ya entro', '👍', '👍'].sort())
      expect([...texts(game.guest)].sort()).toEqual(['¿Jugás ya?', 'Hola, ya entro', '👍', '👍'].sort())
    })
  })

  describe('pasar de fase le pregunta al rival si no va a hacer nada más', () => {
    const MAIN1 = { type: 'phase', phase: 'main1', skipDraw: true } as const
    const phaseOf = (game: Game) => ({ mine: game.host.getSnapshot().mine?.phase, seen: game.guest.getSnapshot().theirs?.state.phase })

    it('hasta que el rival contesta la fase no pasa: quien pasa espera y el otro ve la pregunta; si lo deja pasar, pasa en las dos mesas', () => {
      const game = setup()
      startBoth(game)

      game.host.askPhase(MAIN1)
      game.room.flush()

      expect(game.host.getSnapshot().pass).toMatchObject({ asking: 'main1', asked: null })
      expect(game.guest.getSnapshot().pass).toMatchObject({ asking: null, asked: { phase: 'main1', endsTurn: false } })
      expect(phaseOf(game)).toEqual({ mine: 'draw', seen: 'draw' })

      game.guest.answerPhase(true)
      game.room.flush()

      expect(phaseOf(game)).toEqual({ mine: 'main1', seen: 'main1' })
      expect(game.host.getSnapshot().pass).toMatchObject({ asking: null, result: null })
      expect(game.guest.getSnapshot().pass.asked).toBeNull()
    })

    it('si el rival quiere jugar antes, la fase no pasa y quien pasaba se entera (cada vez cuenta aparte)', () => {
      const game = setup()
      startBoth(game)

      game.host.askPhase(MAIN1)
      game.room.flush()
      game.guest.answerPhase(false)
      game.room.flush()

      expect(phaseOf(game)).toEqual({ mine: 'draw', seen: 'draw' })
      expect(game.host.getSnapshot().pass).toMatchObject({ asking: null, result: { n: 1 } })
      expect(game.guest.getSnapshot().pass.asked).toBeNull()

      // Puede volver a pasar, y el resultado nuevo cuenta aparte.
      game.host.askPhase(MAIN1)
      game.room.flush()
      game.guest.answerPhase(false)
      game.room.flush()
      expect(game.host.getSnapshot().pass.result).toEqual({ n: 2 })
    })

    it('sin respuesta la fase pasa sola a los 6 segundos y el cartel del rival se va', () => {
      vi.useFakeTimers()

      try {
        const game = setup()
        startBoth(game)

        game.host.askPhase(MAIN1)
        game.room.flush()
        vi.advanceTimersByTime(PHASE_WAIT_MS - 1)
        game.room.flush()
        expect(phaseOf(game)).toEqual({ mine: 'draw', seen: 'draw' })
        expect(game.guest.getSnapshot().pass.asked).not.toBeNull()

        vi.advanceTimersByTime(1)
        game.room.flush()
        expect(phaseOf(game)).toEqual({ mine: 'main1', seen: 'main1' })
        expect(game.host.getSnapshot().pass.asking).toBeNull()
        expect(game.guest.getSnapshot().pass.asked).toBeNull()
      } finally {
        vi.useRealTimers()
      }
    })

    it('si el rival juega algo mientras le pregunto, no había terminado: la fase no pasa y me entero', () => {
      const game = setup()
      startBoth(game)

      game.host.askPhase(MAIN1)
      game.room.flush()
      game.guest.play({ type: 'move', id: 'card-5001-1', to: 'gy' })
      game.room.flush()

      expect(phaseOf(game)).toEqual({ mine: 'draw', seen: 'draw' })
      expect(game.host.getSnapshot().pass).toMatchObject({ asking: null, result: { n: 1 } })
      expect(game.guest.getSnapshot().pass.asked).toBeNull()
    })

    it('hacer otra jugada mientras espera cancela la pregunta (la fase no pasa por una respuesta tardía)', () => {
      const game = setup()
      startBoth(game)

      game.host.askPhase(MAIN1)
      game.room.flush()
      game.host.play({ type: 'move', id: 'card-1001-1', to: 'gy' })
      game.room.flush()

      expect(game.host.getSnapshot().pass.asking).toBeNull()
      expect(game.guest.getSnapshot().pass.asked).toBeNull()
      game.guest.answerPhase(true)
      game.room.flush()
      expect(phaseOf(game)).toEqual({ mine: 'draw', seen: 'draw' })
    })

    it('terminar el turno (de la End Phase a la Draw Phase) se lo dice al rival como tal', () => {
      const game = setup()
      startBoth(game)
      game.host.play({ type: 'phase', phase: 'end', skipDraw: true })
      game.room.flush()

      game.host.askPhase({ type: 'phase', phase: 'draw', skipDraw: true })
      game.room.flush()
      expect(game.guest.getSnapshot().pass.asked).toMatchObject({ phase: 'draw', endsTurn: true })
    })

    it('sin el rival en la sala, o si se va con la pregunta en el aire, la fase pasa de una', () => {
      const alone = setup()
      startBoth(alone)
      alone.guestEnd.disconnect()
      alone.room.flush()
      alone.host.askPhase(MAIN1)
      expect(alone.host.getSnapshot().mine?.phase).toBe('main1')

      const leaving = setup()
      startBoth(leaving)
      leaving.host.askPhase(MAIN1)
      leaving.room.flush()
      expect(leaving.guest.getSnapshot().pass.asked).not.toBeNull()
      leaving.guestEnd.disconnect()
      leaving.room.flush()
      expect(leaving.host.getSnapshot().mine?.phase).toBe('main1')
      expect(leaving.host.getSnapshot().pass.asking).toBeNull()
    })

    it('«pasar» a la fase en que ya está no pregunta nada', () => {
      const game = setup()
      startBoth(game)
      const sent = game.room.sent.length

      game.host.askPhase({ type: 'phase', phase: 'draw', skipDraw: true })
      expect(game.host.getSnapshot().pass.asking).toBeNull()
      expect(game.room.sent.slice(sent).some((frame) => String(frame).includes('phaseAsk'))).toBe(false)
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

describe('los espectadores', () => {
  it('uno que entra y sale sin parar no le hace mandar su estado sin parar a los jugadores: una ráfaga corta y después de a una cada tanto', () => {
    const game = setup()
    startBoth(game)
    const hellosOf = (sid: string) => game.room.sent.filter((text) => text.includes('"t":"hello"') && text.includes(`"sid":"${sid}"`)).length
    const before = { host: hellosOf('host-1'), guest: hellosOf('guest-1') }

    for (let index = 0; index < 20; index += 1) {
      game.room.dropSpectator(game.room.spectate())
      game.room.flush()
    }

    // Con el reloj quieto (el mismo instante), cada jugador repitió su saludo sólo lo que deja la ráfaga.
    expect(hellosOf('host-1') - before.host).toBe(3)
    expect(hellosOf('guest-1') - before.guest).toBe(3)

    // Pasado un rato, vuelve a atender un pedido.
    game.clock.t += 2000
    game.room.spectate()
    game.room.flush()
    expect(hellosOf('host-1') - before.host).toBe(4)
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

  it('un objetivo dura cinco segundos y se quita solo, en los dos lados; marcarlo de nuevo da el plazo entero otra vez', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    try {
      const game = withFieldCard()

      game.guest.toggleMark({ card: game.opaque })
      game.guest.toggleMark({ pile: 'gy' })
      game.room.flush()
      vi.advanceTimersByTime(4000)
      game.room.flush()
      expect(game.host.getSnapshot().marks.mine).toEqual({ cards: [hostMain[0]], piles: ['gy'] })

      vi.advanceTimersByTime(1100)
      game.room.flush()
      expect(game.guest.getSnapshot().marks.theirs).toEqual({ cards: [], piles: [] })
      expect(game.host.getSnapshot().marks.mine).toEqual({ cards: [], piles: [] })

      // Quitarla a mano y volver a marcar: el plazo del primer toque no la corta antes de tiempo.
      game.guest.toggleMark({ pile: 'gy' })
      vi.advanceTimersByTime(3000)
      game.guest.toggleMark({ pile: 'gy' })
      game.guest.toggleMark({ pile: 'gy' })
      game.room.flush()
      vi.advanceTimersByTime(3000)
      game.room.flush()
      expect(game.host.getSnapshot().marks.mine.piles).toEqual(['gy'])
      vi.advanceTimersByTime(2100)
      game.room.flush()
      expect(game.host.getSnapshot().marks.mine.piles).toEqual([])
    } finally {
      vi.useRealTimers()
    }
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

describe('un Match (mejor de 3)', () => {
  const match: DuelSettings = { lp: 8000, hand: 5, limitMin: 50, format: 'unlimited', match: true, siding: false }
  const view = (duel: Duel) => duel.getSnapshot().series
  /** Los dos quieren seguir: la mesa se limpia y se vuelve a repartir. */
  const next = (game: Game) => {
    game.host.rematch()
    game.guest.rematch()
    game.room.flush()
    startBoth(game)
  }

  it('lleva el marcador de los dos lados, y gana quien llega a 2 duelos', () => {
    const game = setup(match)
    startBoth(game)
    expect(view(game.host)).toEqual({ match: true, game: 1, wins: [0, 0], winner: null })
    expect(view(game.guest)).toEqual({ match: true, game: 1, wins: [0, 0], winner: null })

    // El anfitrión se rinde: el invitado va 1–0 y el Match sigue.
    game.host.concede()
    game.room.flush()
    expect(view(game.guest)).toMatchObject({ wins: [0, 1], winner: null })
    next(game)
    expect(view(game.host)).toEqual({ match: true, game: 2, wins: [0, 1], winner: null })
    expect(view(game.guest)).toEqual({ match: true, game: 2, wins: [0, 1], winner: null })

    // Otra vez: el invitado gana el Match, 2–0.
    game.host.concede()
    game.room.flush()
    expect(view(game.host)).toMatchObject({ wins: [0, 2], winner: 1 })
    expect(view(game.guest)).toMatchObject({ wins: [0, 2], winner: 1 })

    // La revancha empieza otro Match de cero.
    next(game)
    expect(view(game.host)).toEqual({ match: true, game: 3, wins: [0, 0], winner: null })
  })

  it('un duelo suelto no tiene Match', () => {
    const game = setup()
    startBoth(game)
    game.host.concede()
    game.room.flush()

    expect(view(game.host)).toMatchObject({ match: false, winner: null })
  })

  it('quien recarga recupera el marcador que lleva el rival', () => {
    const game = setup(match)
    startBoth(game)
    game.host.concede()
    next(game)
    expect(view(game.host).wins).toEqual([0, 1])

    // El invitado vuelve con una sesión nueva: el anfitrión le repite cómo va el Match en su sync.
    const room = game.room
    game.guestEnd.close?.()
    const guestEnd = room.join()
    const reloaded = createDuel(guestEnd, { role: 'guest', name: 'Beto', now: () => game.clock.t, sid: 'guest-2' })
    room.flush()

    expect(view(reloaded).wins).toEqual([0, 1])
  })
})

describe('señalar', () => {
  /** Ana pone su primera carta de la mano en el campo; Beto la ve con el id opaco que ella le dio. */
  function withFieldCard() {
    const game = setup()

    startBoth(game)
    game.host.play({ type: 'place', id: hostMain[0]!, zone: 'mz', index: 0, pos: 'atk', how: 'normal' })
    game.room.flush()

    return { ...game, opaque: game.guest.getSnapshot().theirs!.state.mz[0]!.id }
  }

  it('señalar una carta o una pila del rival la muestra en lo suyo (con sus ids reales) y en lo propio, sin tocar la mesa, las jugadas ni las marcas', () => {
    const game = withFieldCard()
    const before = game.host.getSnapshot().actions.length

    game.guest.ping({ card: game.opaque }, 'theirs')
    game.room.flush()

    expect(game.host.getSnapshot().ping).toEqual({ n: 1, side: 'mine', card: hostMain[0] })
    expect(game.guest.getSnapshot().ping).toEqual({ n: 1, side: 'theirs', card: game.opaque })
    // Es un aviso, no una jugada ni un objetivo.
    expect(game.host.getSnapshot().actions).toHaveLength(before)
    expect(game.host.getSnapshot().marks.mine).toEqual({ cards: [], piles: [] })
    expect(game.guest.getSnapshot().marks.theirs).toEqual({ cards: [], piles: [] })

    game.clock.t += 400
    game.guest.ping({ pile: 'hand' }, 'theirs')
    game.room.flush()
    expect(game.host.getSnapshot().ping).toEqual({ n: 2, side: 'mine', pile: 'hand' })
  })

  it('señalar una carta propia a la vista: el rival la ve en el campo de su rival, con el id opaco, nunca con la identidad', () => {
    const game = withFieldCard()

    game.host.ping({ card: hostMain[0]! }, 'mine')
    game.room.flush()

    expect(game.host.getSnapshot().ping).toEqual({ n: 1, side: 'mine', card: hostMain[0] })
    expect(game.guest.getSnapshot().ping).toEqual({ n: 1, side: 'theirs', card: game.opaque })
    expect(JSON.stringify(game.guest.getSnapshot().ping)).not.toContain(hostMain[0]!)
  })

  it('no se señala la mano ni el deck de nadie (una carta sólo si está a la vista en el campo), ni lo que no existe, ni con el rival fuera', () => {
    const game = withFieldCard()

    game.host.ping({ card: hostMain[1]! }, 'mine')
    game.guest.ping({ card: 'no-existe' }, 'theirs')
    game.guest.ping({ card: 'c99999' }, 'theirs')
    game.room.flush()
    expect(game.host.getSnapshot().ping).toBeNull()
    expect(game.guest.getSnapshot().ping).toBeNull()

    game.hostEnd.disconnect()
    game.room.flush()
    game.clock.t += 400
    game.guest.ping({ pile: 'gy' }, 'theirs')
    expect(game.guest.getSnapshot().ping).toBeNull()
  })

  it('no se puede señalar sin parar (uno cada 300 ms) y un aviso viejo o repetido no cuenta', () => {
    const game = withFieldCard()

    game.guest.ping({ pile: 'gy' }, 'theirs')
    game.guest.ping({ pile: 'banished' }, 'theirs')
    game.room.flush()
    expect(game.host.getSnapshot().ping).toEqual({ n: 1, side: 'mine', pile: 'gy' })

    game.clock.t += 301
    game.guest.ping({ pile: 'banished' }, 'theirs')
    game.room.flush()
    expect(game.host.getSnapshot().ping).toEqual({ n: 2, side: 'mine', pile: 'banished' })
  })

  it('no se repone al reconectar: quien vuelve no ve lo que se señaló antes', () => {
    const game = withFieldCard()

    game.guest.ping({ card: game.opaque }, 'theirs')
    game.room.flush()
    expect(game.host.getSnapshot().ping).not.toBeNull()

    game.hostEnd.close()
    const reloaded = createDuel(game.room.join(), { role: 'host', name: 'Ana', now: () => game.clock.t, sid: 'host-2' })
    game.room.flush()
    expect(reloaded.getSnapshot().ping).toBeNull()
  })
})

describe('el cierre de la sala', () => {
  /** Los dos juegan y el invitado se rinde: el duelo terminó para siempre. */
  function finishedGame() {
    const game = setup()

    startBoth(game)
    game.guest.concede()
    game.room.flush()
    return game
  }

  /** Lo que `from` manda a partir de ahora, por tipo de mensaje. */
  const sentTypes = (end: MemoryEnd) => {
    const spy = vi.spyOn(end, 'send')

    return () => spy.mock.calls.map(([text]) => (JSON.parse(text) as { t: string }).t)
  }

  it('terminado el duelo y con el rival afuera, un tercero que llega no ve la mesa del que se quedó: no recibe su estado ni figura como su rival', () => {
    const game = finishedGame()

    game.guestEnd.close()
    game.room.flush()
    expect(game.host.getSnapshot().peerPresent).toBe(false)

    const sent = sentTypes(game.hostEnd)
    const thirdEnd = game.room.join()
    const third = createDuel(thirdEnd, { role: 'guest', name: 'Cami', now: () => game.clock.t, sid: 'third-1' })

    game.room.flush()

    // El que se quedó no le manda su mesa ni sus jugadas (el único mensaje es el saludo con que se anuncia quien entra), y el tercero no la ve.
    expect(sent()).not.toContain('sync')
    expect(third.getSnapshot().theirs).toBeNull()
    expect(game.host.getSnapshot()).toMatchObject({ peerPresent: false, peerName: 'Beto' })

    // Y no le manda nada más: ni el chat.
    game.host.sendChat('hola')
    game.room.flush()
    expect(third.getSnapshot().chat).toEqual([])
  })

  it('la llegada de un tercero no hace parpadear al rival que se fue: nunca figura presente (la cuenta de cierre no se cancela ni se reinicia)', () => {
    const game = finishedGame()

    game.guestEnd.close()
    game.room.flush()

    const seen: boolean[] = []
    const stop = game.host.subscribe(() => seen.push(game.host.getSnapshot().peerPresent))

    createDuel(game.room.join(), { role: 'guest', name: 'Cami', now: () => game.clock.t, sid: 'third-1' })
    game.room.flush()
    stop()

    expect(seen.length).toBeGreaterThan(0)
    expect(seen).not.toContain(true)
  })

  it('el rival que vuelve con su identidad después de terminar sigue siendo el rival', () => {
    const game = finishedGame()

    game.guestEnd.disconnect()
    game.room.flush()
    expect(game.host.getSnapshot().peerPresent).toBe(false)

    game.guestEnd.reconnect()
    game.room.flush()
    expect(game.host.getSnapshot()).toMatchObject({ peerPresent: true, peerName: 'Beto' })
  })

  it('un tercero que se va deja el lugar libre: el rival de verdad, al volver, es visto otra vez', () => {
    const game = finishedGame()

    game.guestEnd.close()
    game.room.flush()

    const thirdEnd = game.room.join()

    createDuel(thirdEnd, { role: 'guest', name: 'Cami', now: () => game.clock.t, sid: 'third-1' })
    game.room.flush()
    expect(game.host.getSnapshot().peerPresent).toBe(false)

    thirdEnd.close()
    game.room.flush()
    expect(game.host.getSnapshot().peerPresent).toBe(false)
  })

  it('con el duelo en curso un jugador nuevo ocupa el lugar del que se cayó como siempre: la regla sólo vale cuando ya terminó', () => {
    const game = setup()

    startBoth(game)
    game.guestEnd.close()
    game.room.flush()

    const sent = sentTypes(game.hostEnd)
    const thirdEnd = game.room.join()

    createDuel(thirdEnd, { role: 'guest', name: 'Cami', now: () => game.clock.t, sid: 'third-1' })
    game.room.flush()

    expect(sent()).toContain('sync')
    expect(game.host.getSnapshot()).toMatchObject({ peerPresent: true, peerName: 'Cami' })
  })

  it('un Match que no terminó (queda otro duelo) tampoco aplica: terminado un duelo del Match el rival nuevo se atiende como siempre', () => {
    const game = setup({ lp: 8000, hand: 5, limitMin: 50, format: 'unlimited', match: true, siding: false })

    startBoth(game)
    game.guest.concede()
    game.room.flush()
    expect(game.host.getSnapshot().series).toMatchObject({ match: true, winner: null })

    game.guestEnd.close()
    game.room.flush()

    const sent = sentTypes(game.hostEnd)
    const thirdEnd = game.room.join()

    createDuel(thirdEnd, { role: 'guest', name: 'Cami', now: () => game.clock.t, sid: 'third-1' })
    game.room.flush()

    expect(sent()).toContain('sync')
  })

  it('endRoom cierra la conexión dando la sala por terminada; close, no', () => {
    const ended = finishedGame()

    ended.host.endRoom()
    expect(ended.room.ended).toBe(true)

    const left = finishedGame()

    left.host.close()
    expect(left.room.ended).toBe(false)
  })

  it('con un transporte que no sabe cerrar la sala, endRoom cierra la conexión como siempre', () => {
    const game = setup()
    const close = vi.fn()
    const duel = createDuel(
      { send: (text) => game.hostEnd.send(text), onMessage: (listener) => game.hostEnd.onMessage(listener), onPeer: (listener) => game.hostEnd.onPeer(listener), close },
      { role: 'host', name: 'Ana', now: () => game.clock.t, sid: 'host-2' },
    )

    duel.endRoom()

    expect(close).toHaveBeenCalledTimes(1)
  })
})
