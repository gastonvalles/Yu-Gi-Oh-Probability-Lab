import type { Duelist } from './life-calculator'

/**
 * El reloj de turnos: cada jugador tiene una reserva de tiempo que sólo corre mientras es su turno. Arranca en 5 minutos y, cada vez que el rival pasa el turno (te toca a vos),
 * se suman 2 minutos a lo que te quede. Es público: los dos (y quien mira) ven cuánto le queda a cada uno.
 *
 * Es una cuenta, como el turno mismo: llegar a cero no hace nada (ni pierde ni pasa el turno solo), sólo se ve. Cada dispositivo cuenta con su reloj; lo que viaja es lo que le
 * queda a quien termina su turno (la reserva de cada uno la corrige su dueño al pasar), así que las dos pantallas se parecen a menos de la demora de la red.
 */
export const TURN_BANK_MS = 5 * 60_000
export const TURN_BONUS_MS = 2 * 60_000
/** Con cuánto tiempo por delante el número empieza a parpadear en rojo. */
export const TURN_WARNING_MS = 30_000

export interface TurnClock {
  /** Lo que le queda a cada uno en `at` (el que corre sigue bajando desde ahí). */
  banks: readonly [number, number]
  /** De quién es la reserva que corre; null si está parada (el duelo no empezó, terminó o está en pausa). */
  running: Duelist | null
  /** Cuándo se anotaron `banks` (ms de reloj de este dispositivo). */
  at: number
  /** Lo que tenía quien corre al empezar su turno (con los 2 minutos de más): el anillo se vacía desde ahí. */
  span: number
}

export const freshTurnClock = (): TurnClock => ({ banks: [TURN_BANK_MS, TURN_BANK_MS], running: null, at: 0, span: TURN_BANK_MS })

const other = (who: Duelist): Duelist => (who === 0 ? 1 : 0)

/** Lo que le queda a `who` en `now`: la reserva de quien corre baja con el tiempo y nunca pasa de cero. */
export function turnTimeLeft(clock: TurnClock, who: Duelist, now: number): number {
  const bank = clock.banks[who]

  return clock.running === who ? Math.max(0, bank - Math.max(0, now - clock.at)) : bank
}

/** Anota lo que queda ahora en `banks` (sin cambiar quién corre). */
function settled(clock: TurnClock, now: number): TurnClock {
  return { banks: [turnTimeLeft(clock, 0, now), turnTimeLeft(clock, 1, now)], running: clock.running, at: now, span: clock.span }
}

/** Cambia quién corre sin tocar las reservas (parar, o seguir con quien tenga el turno). */
export function runTurnClock(clock: TurnClock, who: Duelist | null, now: number): TurnClock {
  return { ...settled(clock, now), running: who }
}

/** Empieza el turno de `who`. Si lo pasó el rival se le suman los 2 minutos de más; el primer turno del duelo, o volver atrás un pase, no suma nada. */
export function startTurn(clock: TurnClock, who: Duelist, now: number, bonus: boolean): TurnClock {
  const next = settled(clock, now)
  const banks: [number, number] = [next.banks[0], next.banks[1]]

  if (bonus) {
    banks[who] += TURN_BONUS_MS
  }

  return { banks, running: who, at: now, span: Math.max(banks[who], 1) }
}

/** Lo que `who` dice que le queda (lo manda al pasar el turno): su palabra corrige la cuenta que se hizo desde afuera. */
export function setTurnBank(clock: TurnClock, who: Duelist, bank: number, now: number): TurnClock {
  const next = settled(clock, now)
  const banks: [number, number] = [next.banks[0], next.banks[1]]

  banks[who] = Math.max(0, bank)

  return { banks, running: next.running, at: now, span: next.running === who ? Math.max(next.span, banks[who]) : next.span }
}

/** El otro de dos. */
export const rivalOf = other

/** mm:ss, sin decimales: 4:05, 0:07 (el tiempo restante se redondea hacia arriba para que el 0:00 sea de verdad el final). */
export function formatTurnTime(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000))

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
