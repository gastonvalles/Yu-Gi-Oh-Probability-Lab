import { describe, expect, it } from 'vitest'

import { TURN_BANK_MS, TURN_BONUS_MS, formatTurnTime, freshTurnClock, runTurnClock, setTurnBank, startTurn, turnTimeLeft } from '../app/duel-clock'
import { PROTOCOL_VERSION, encodeMessage, parseMessage } from '../app/duel-protocol'
import { createDuel, type Duel } from '../app/duel-session'
import { createMatState } from '../app/practice-mat'
import { createMemoryRoom } from './support/memory-room'

describe('el reloj de turnos (la cuenta)', () => {
  it('arranca con 5 minutos para cada uno y sólo baja el de quien corre', () => {
    const clock = startTurn(freshTurnClock(), 0, 1000, false)

    expect(turnTimeLeft(clock, 0, 1000)).toBe(TURN_BANK_MS)
    expect(turnTimeLeft(clock, 0, 1000 + 40_000)).toBe(TURN_BANK_MS - 40_000)
    expect(turnTimeLeft(clock, 1, 1000 + 40_000)).toBe(TURN_BANK_MS)
  })

  it('al empezar el turno de quien recibe el pase se le suman 2 minutos a lo que le quede, y el que pasó se queda con lo suyo', () => {
    let clock = startTurn(freshTurnClock(), 0, 0, false)

    clock = startTurn(clock, 1, 60_000, true)
    expect(turnTimeLeft(clock, 0, 60_000)).toBe(TURN_BANK_MS - 60_000)
    expect(turnTimeLeft(clock, 1, 60_000)).toBe(TURN_BANK_MS + TURN_BONUS_MS)

    // Vuelve el turno al primero: otros 2 minutos, sobre lo que le quedaba.
    clock = startTurn(clock, 0, 100_000, true)
    expect(turnTimeLeft(clock, 0, 100_000)).toBe(TURN_BANK_MS - 60_000 + TURN_BONUS_MS)
    expect(turnTimeLeft(clock, 1, 100_000)).toBe(TURN_BANK_MS + TURN_BONUS_MS - 40_000)
  })

  it('no baja de cero, y parado no corre', () => {
    const clock = startTurn(freshTurnClock(), 0, 0, false)

    expect(turnTimeLeft(clock, 0, TURN_BANK_MS * 3)).toBe(0)

    const stopped = runTurnClock(clock, null, 10_000)

    expect(turnTimeLeft(stopped, 0, 10_000)).toBe(TURN_BANK_MS - 10_000)
    expect(turnTimeLeft(stopped, 0, 500_000)).toBe(TURN_BANK_MS - 10_000)
  })

  it('lo que dice su dueño al pasar corrige la cuenta', () => {
    const clock = setTurnBank(startTurn(freshTurnClock(), 1, 0, false), 0, 123_000, 5_000)

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

function table() {
  const room = createMemoryRoom()
  const time = { t: 10_000 }
  const host = createDuel(room.join(), { role: 'host', name: 'Ana', now: () => time.t, sid: 'host-1' })
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
