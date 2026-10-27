import { describe, expect, it, vi } from 'vitest'

import { TURN_BANK_MS, TURN_BONUS_MS, formatTurnTime, freshTurnClock, runTurnClock, setTurnBank, startTurn, turnTimeLeft } from '../app/duel-clock'
import { DEFAULT_SETTINGS, PROTOCOL_VERSION, encodeMessage, parseMessage, type DuelSettings } from '../app/duel-protocol'
import { createDuel, type Duel } from '../app/duel-session'
import { createMatState } from '../app/practice-mat'
import { createMemoryRoom } from './support/memory-room'

describe('el reloj de turnos (la cuenta)', () => {
  it('arranca con 5 minutos para cada uno y sólo baja el de quien corre', () => {
    const clock = startTurn(freshTurnClock(), 0, 1000, 0)

    expect(turnTimeLeft(clock, 0, 1000)).toBe(TURN_BANK_MS)
    expect(turnTimeLeft(clock, 0, 1000 + 40_000)).toBe(TURN_BANK_MS - 40_000)
    expect(turnTimeLeft(clock, 1, 1000 + 40_000)).toBe(TURN_BANK_MS)
  })

  it('al empezar el turno de quien recibe el pase se le suman 2 minutos a lo que le quede, y el que pasó se queda con lo suyo', () => {
    let clock = startTurn(freshTurnClock(), 0, 0, 0)

    clock = startTurn(clock, 1, 60_000, TURN_BONUS_MS)
    expect(turnTimeLeft(clock, 0, 60_000)).toBe(TURN_BANK_MS - 60_000)
    expect(turnTimeLeft(clock, 1, 60_000)).toBe(TURN_BANK_MS + TURN_BONUS_MS)

    // Vuelve el turno al primero: otros 2 minutos, sobre lo que le quedaba.
    clock = startTurn(clock, 0, 100_000, TURN_BONUS_MS)
    expect(turnTimeLeft(clock, 0, 100_000)).toBe(TURN_BANK_MS - 60_000 + TURN_BONUS_MS)
    expect(turnTimeLeft(clock, 1, 100_000)).toBe(TURN_BANK_MS + TURN_BONUS_MS - 40_000)
  })

  it('no baja de cero, y parado no corre', () => {
    const clock = startTurn(freshTurnClock(), 0, 0, 0)

    expect(turnTimeLeft(clock, 0, TURN_BANK_MS * 3)).toBe(0)

    const stopped = runTurnClock(clock, null, 10_000)

    expect(turnTimeLeft(stopped, 0, 10_000)).toBe(TURN_BANK_MS - 10_000)
    expect(turnTimeLeft(stopped, 0, 500_000)).toBe(TURN_BANK_MS - 10_000)
  })

  it('lo que dice su dueño al pasar corrige la cuenta', () => {
    const clock = setTurnBank(startTurn(freshTurnClock(), 1, 0, 0), 0, 123_000, 5_000)

    expect(turnTimeLeft(clock, 0, 5_000)).toBe(123_000)
    expect(turnTimeLeft(clock, 1, 5_000)).toBe(TURN_BANK_MS - 5_000)
  })

  it('se dice en minutos y segundos, y el cero es de verdad el final', () => {
    expect(formatTurnTime(300_000)).toBe('5:00')
    expect(formatTurnTime(4_050)).toBe('0:05')
    expect(formatTurnTime(61_000)).toBe('1:01')
    expect(formatTurnTime(0)).toBe('0:00')
    expect(formatTurnTime(-5)).toBe('0:00')
  })
})

describe('el reloj de turnos en el protocolo', () => {
  it('turnClock y turnBanks viajan y se leen; lo que no es un número entero se descarta', () => {
    expect(parseMessage(encodeMessage({ t: 'turnClock', bank: 120_000 }))).toEqual({ t: 'turnClock', bank: 120_000 })
    expect(parseMessage(JSON.stringify({ t: 'turnClock', bank: -1 }))).toBeNull()
    expect(parseMessage(JSON.stringify({ t: 'turnClock', bank: 'mucho' }))).toBeNull()
    expect(parseMessage(JSON.stringify({ t: 'sync', n: 0, known: {}, lp: 8000, lifeN: 0, turnBanks: [1000, 2000] }))).toMatchObject({ turnBanks: [1000, 2000] })
    expect(parseMessage(JSON.stringify({ t: 'sync', n: 0, known: {}, lp: 8000, lifeN: 0, turnBanks: [1000] }))).toBeNull()
    expect(PROTOCOL_VERSION).toBeGreaterThan(0)
  })
})

const hostTable = createMatState(Array.from({ length: 20 }, (_, index) => `card-${1000 + index}-1`), [], 5)
const guestTable = createMatState(Array.from({ length: 20 }, (_, index) => `card-${5000 + index}-1`), [], 5)

function table(settings: Partial<DuelSettings> = {}) {
  const room = createMemoryRoom()
  const time = { t: 10_000 }
  const host = createDuel(room.join(), { role: 'host', name: 'Ana', settings: { ...DEFAULT_SETTINGS, ...settings }, now: () => time.t, sid: 'host-1' })
  const guest = createDuel(room.join(), { role: 'guest', name: 'Beto', now: () => time.t, sid: 'guest-1' })

  room.flush()
  host.start(hostTable)
  guest.start(guestTable)
  room.flush()

  return { room, time, host, guest }
}

const left = (duel: Duel, who: 0 | 1, now: number) => turnTimeLeft(duel.getSnapshot().turnClock, who, now)

describe('el reloj de turnos en un duelo', () => {
  it('los dos ven lo mismo: corre el de quien tiene el turno, al pasarlo se suman 2 minutos a quien le toca y quien pasó queda con lo que le quedaba', () => {
    const { room, time, host, guest } = table()

    // Empieza el anfitrión: 5 minutos cada uno, y corre el suyo.
    expect(left(host, 0, time.t)).toBe(TURN_BANK_MS)
    expect(left(guest, 1, time.t)).toBe(TURN_BANK_MS)
    time.t += 40_000
    expect(left(host, 0, time.t)).toBe(TURN_BANK_MS - 40_000)
    expect(left(guest, 0, time.t)).toBe(TURN_BANK_MS - 40_000)
    expect(left(guest, 1, time.t)).toBe(TURN_BANK_MS)

    // Ana pasa el turno (End Phase → Draw Phase): a Beto se le suman 2 minutos, y el de Ana queda quieto.
    host.play({ type: 'phase', phase: 'end' })
    host.play({ type: 'phase', phase: 'draw' })
    room.flush()
    expect(left(host, 0, time.t)).toBe(TURN_BANK_MS - 40_000)
    expect(left(host, 1, time.t)).toBe(TURN_BANK_MS + TURN_BONUS_MS)
    expect(left(guest, 0, time.t)).toBe(TURN_BANK_MS - 40_000)
    expect(left(guest, 1, time.t)).toBe(TURN_BANK_MS + TURN_BONUS_MS)

    // Ahora corre el de Beto, en las dos pantallas.
    time.t += 100_000
    expect(left(host, 1, time.t)).toBe(TURN_BANK_MS + TURN_BONUS_MS - 100_000)
    expect(left(guest, 1, time.t)).toBe(TURN_BANK_MS + TURN_BONUS_MS - 100_000)
    expect(left(host, 0, time.t)).toBe(TURN_BANK_MS - 40_000)

    // Beto pasa: vuelven a sumarle 2 minutos a Ana.
    guest.play({ type: 'phase', phase: 'end' })
    guest.play({ type: 'phase', phase: 'draw' })
    room.flush()
    expect(left(host, 0, time.t)).toBe(TURN_BANK_MS - 40_000 + TURN_BONUS_MS)
    expect(left(guest, 0, time.t)).toBe(TURN_BANK_MS - 40_000 + TURN_BONUS_MS)
    expect(left(host, 1, time.t)).toBe(TURN_BANK_MS + TURN_BONUS_MS - 100_000)
  })

  it('con el rival afuera (en pausa) el reloj se detiene', () => {
    const { room, time, host, guest } = table()

    time.t += 10_000
    guest.close()
    room.flush()
    const frozen = left(host, 0, time.t)

    time.t += 60_000
    expect(left(host, 0, time.t)).toBe(frozen)
    expect(frozen).toBe(TURN_BANK_MS - 10_000)
  })
})

describe('quien se queda sin tiempo pierde el duelo', () => {
  it('arrancan con 7 minutos y a quien recibe el turno se le suman 3', () => {
    expect(TURN_BANK_MS).toBe(7 * 60_000)
    expect(TURN_BONUS_MS).toBe(3 * 60_000)
  })

  it('al llegar a cero el dispositivo de ese jugador se rinde por él: pierde, gana el rival y los dos ven que fue por el tiempo', () => {
    vi.useFakeTimers()
    const { room, time, host, guest } = table()

    // Ana (que empieza) piensa casi todo su tiempo y todavía no perdió.
    const almost = TURN_BANK_MS - 1000
    time.t += almost
    vi.advanceTimersByTime(almost)
    room.flush()
    expect(host.getSnapshot().conceded).toBeNull()

    // Se le acaba: se rinde sola.
    time.t += 1100
    vi.advanceTimersByTime(1100)
    room.flush()

    expect(host.getSnapshot()).toMatchObject({ conceded: 0, timeUp: true })
    expect(guest.getSnapshot()).toMatchObject({ conceded: 0, timeUp: true })
    expect(host.getSnapshot().games.at(-1)?.game).toEqual({ kind: 'concede', timeout: true })
    vi.useRealTimers()
  })

  it('pasar el turno a tiempo evita perder: el tiempo de quien recibe el turno corre, no el de quien pasó', () => {
    vi.useFakeTimers()
    const { room, time, host, guest } = table()

    time.t += 60_000
    vi.advanceTimersByTime(60_000)
    host.play({ type: 'phase', phase: 'end' })
    host.play({ type: 'phase', phase: 'draw' })
    room.flush()

    // Ahora corre el reloj de Beto: pasa el tiempo que Ana tenía y nadie pierde.
    time.t += TURN_BANK_MS - 60_000 + 5000
    vi.advanceTimersByTime(TURN_BANK_MS - 60_000 + 5000)
    room.flush()
    expect(host.getSnapshot().conceded).toBeNull()
    expect(guest.getSnapshot().conceded).toBeNull()
    vi.useRealTimers()
  })

  it('un cierre por tiempo viaja y se lee; uno común (sin `timeout`) sigue siendo una rendición', () => {
    expect(parseMessage(JSON.stringify({ t: 'game', n: 1, game: { kind: 'concede', timeout: true } }))).toMatchObject({ game: { kind: 'concede', timeout: true } })
    expect(parseMessage(JSON.stringify({ t: 'game', n: 1, game: { kind: 'concede' } }))).toMatchObject({ game: { kind: 'concede' } })
    expect(parseMessage(JSON.stringify({ t: 'game', n: 1, game: { kind: 'concede' } }))).not.toHaveProperty('game.timeout')
  })
})

describe('el reloj de turnos en una sala con reglas automáticas (la mesa la cuenta el núcleo)', () => {
  /** Ana (anfitriona) y Beto en una sala automática con reloj por turno: sin mesa manual, el reloj sólo anda con lo que dice la mesa del núcleo (`setAutoClock`). */
  function autoRoom() {
    const room = createMemoryRoom()
    const time = { t: 1_000_000 }
    const now = () => time.t
    const host = createDuel(room.join(), { role: 'host', name: 'Ana', sid: 'h', settings: { ...DEFAULT_SETTINGS, auto: true }, now })
    const guest = createDuel(room.join(), { role: 'guest', name: 'Beto', sid: 'g', now })
    const pass = (ms: number) => {
      time.t += ms
      vi.advanceTimersByTime(ms)
      room.flush()
    }

    room.flush()
    return { room, host, guest, pass }
  }

  it('corre la reserva de quien decide: en tu turno la tuya, en el del rival sólo mientras el núcleo te pregunta; al pasar el turno se suman los minutos y quien se queda sin tiempo pierde', () => {
    vi.useFakeTimers()
    const { host, guest, pass } = autoRoom()

    // Sin lo que dice la mesa del núcleo (un rival de antes, o la mesa cargando) no hay reloj.
    pass(60_000)
    expect(host.getSnapshot().turnClock.running).toBeNull()

    // Turno 1 de Ana: corre el suyo, en los dos lados.
    host.setAutoClock({ turn: 1, turnPlayer: 0, deciding: 0 })
    guest.setAutoClock({ turn: 1, turnPlayer: 0, deciding: 0 })
    pass(30_000)
    expect(host.getSnapshot().turnClock.running).toBe(0)
    expect(guest.getSnapshot().turnClock.running).toBe(0)
    // El núcleo le pregunta a Beto (una cadena) en el turno de Ana: corre el de Beto, y Ana dice lo que le queda.
    host.setAutoClock({ turn: 1, turnPlayer: 0, deciding: 1 })
    guest.setAutoClock({ turn: 1, turnPlayer: 0, deciding: 1 })
    pass(10_000)
    const left = (duel: Duel, who: 0 | 1) => turnTimeLeft(duel.getSnapshot().turnClock, who, 1_000_000 + 100_000)

    expect(left(guest, 0)).toBe(TURN_BANK_MS - 30_000)
    expect(left(host, 1)).toBe(TURN_BANK_MS - 10_000)
    // Turno 2, de Beto: se le suman los 3 minutos y corre el suyo.
    host.setAutoClock({ turn: 2, turnPlayer: 1, deciding: 1 })
    guest.setAutoClock({ turn: 2, turnPlayer: 1, deciding: 1 })
    pass(0)
    expect(turnTimeLeft(guest.getSnapshot().turnClock, 1, 1_000_000 + 100_000)).toBe(TURN_BANK_MS - 10_000 + TURN_BONUS_MS)
    expect(guest.getSnapshot().turnClock.running).toBe(1)
    // Beto se queda sin tiempo: su dispositivo se rinde por él, por tiempo.
    pass(TURN_BANK_MS + TURN_BONUS_MS)
    expect(host.getSnapshot()).toMatchObject({ conceded: 1, timeUp: true })
    expect(host.getSnapshot().turnClock.running).toBeNull()
    // La revancha (la mesa se desmonta): sin reloj hasta la mesa nueva, que empieza de cero.
    host.setAutoClock(null)
    expect(host.getSnapshot().turnClock).toMatchObject({ running: null, banks: [TURN_BANK_MS, TURN_BANK_MS] })
    vi.useRealTimers()
  })
})

describe('el límite de tiempo por turno se activa, se apaga y se personaliza al crear la sala', () => {
  it('apagado (0 minutos) no hay reloj: no corre, no se avisa y nadie pierde por tiempo', () => {
    vi.useFakeTimers()
    const { room, time, host, guest } = table({ turnMin: 0, turnBonusMin: 0 })

    time.t += 60 * 60_000
    vi.advanceTimersByTime(60 * 60_000)
    host.play({ type: 'phase', phase: 'end' })
    host.play({ type: 'phase', phase: 'draw' })
    room.flush()

    expect(host.getSnapshot().turnClock.running).toBeNull()
    expect(guest.getSnapshot().turnClock.running).toBeNull()
    expect(host.getSnapshot().conceded).toBeNull()
    expect(guest.getSnapshot().conceded).toBeNull()
    vi.useRealTimers()
  })

  it('con minutos propios, la reserva y los minutos de más son los de la sala (también para el invitado, que los toma del anfitrión)', () => {
    const { room, time, host, guest } = table({ turnMin: 3, turnBonusMin: 1 })

    expect(left(host, 0, time.t)).toBe(3 * 60_000)
    expect(left(guest, 1, time.t)).toBe(3 * 60_000)

    host.play({ type: 'phase', phase: 'end' })
    host.play({ type: 'phase', phase: 'draw' })
    room.flush()

    expect(left(guest, 1, time.t)).toBe(4 * 60_000)
    expect(left(host, 1, time.t)).toBe(4 * 60_000)
  })

  it('los ajustes viajan: sin dato (un anfitrión de antes) es sin límite por turno, y los minutos fuera de rango se descartan', () => {
    const hello = (settings: unknown) => parseMessage(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, sid: 'abc123', role: 'host', name: 'Ana', settings }))

    expect(hello({ lp: 8000, hand: 5 })).not.toHaveProperty('settings.turnMin')
    expect(hello({ lp: 8000, hand: 5, turnMin: 10, turnBonusMin: 2 })).toMatchObject({ settings: { turnMin: 10, turnBonusMin: 2 } })
    expect(hello({ lp: 8000, hand: 5, turnMin: 0, turnBonusMin: 5 })).toMatchObject({ settings: { turnMin: 0, turnBonusMin: 0 } })
    expect(hello({ lp: 8000, hand: 5, turnMin: 61 })).toBeNull()
    expect(hello({ lp: 8000, hand: 5, turnMin: 7, turnBonusMin: -1 })).toBeNull()
  })
})

describe('lo que el rival está haciendo (mirar su deck, su Extra Deck…)', () => {
  it('el otro lo ve mientras dura, se borra al terminar y se le repone si vuelve', () => {
    const { room, host, guest } = table()

    guest.look('extra')
    room.flush()
    expect(host.getSnapshot().peerLook).toBe('extra')
    expect(guest.getSnapshot().peerLook).toBeNull()

    guest.look('deck')
    room.flush()
    expect(host.getSnapshot().peerLook).toBe('deck')

    guest.look(null)
    room.flush()
    expect(host.getSnapshot().peerLook).toBeNull()

    // Los dos lo ven del otro, y repetir lo mismo no manda nada de nuevo.
    host.look('gy')
    host.look('gy')
    room.flush()
    expect(guest.getSnapshot().peerLook).toBe('gy')
  })

  it('un mensaje de actividad que no es una de las conocidas se descarta, y `null` vale', () => {
    expect(parseMessage(JSON.stringify({ t: 'look', at: 'choosing' }))).toEqual({ t: 'look', at: 'choosing' })
    expect(parseMessage(JSON.stringify({ t: 'look', at: null }))).toEqual({ t: 'look', at: null })
    expect(parseMessage(JSON.stringify({ t: 'look', at: 'hand' }))).toBeNull()
    expect(parseMessage(JSON.stringify({ t: 'look' }))).toBeNull()
  })
})
