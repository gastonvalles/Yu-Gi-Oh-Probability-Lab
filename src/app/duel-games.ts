import type { Duelist } from './life-calculator'

/**
 * Lo que los dos hacen en la mesa además de jugar las cartas: tirar la moneda o el dado, piedra-papel-tijera, decir quién va primero y
 * mandarse una señal. Nada de esto cambia la mesa: viaja aparte (`game`) y los dos lo ven en el registro. Es para jugar con amigos:
 * quien tira es quien elige el resultado, igual que con una moneda de verdad sobre la mesa.
 */

export type RpsPick = 'rock' | 'paper' | 'scissors'
export const RPS_PICKS: readonly RpsPick[] = ['rock', 'paper', 'scissors']

/** Señales rápidas, para no cortar el juego con un chat: pensando, "¿respondés?", paso, gracias. */
export const SIGNALS = ['think', 'respond', 'pass', 'thanks'] as const
export type SignalId = (typeof SIGNALS)[number]

export type DuelGame =
  | { kind: 'coin'; face: 0 | 1 }
  /** Dado de seis caras. */
  | { kind: 'die'; value: number }
  /** Mi elección (el rival no la ve hasta que yo elija la mía); `null` empieza otra ronda y borra las dos. */
  | { kind: 'rps'; pick: RpsPick | null }
  /** Quién va primero (0 = anfitrión, 1 = invitado). */
  | { kind: 'order'; first: Duelist }
  | { kind: 'signal'; signal: SignalId }
  /** Me rindo: el duelo termina y gana el otro. */
  | { kind: 'concede' }
  /** Quiero la revancha: cuando los dos la piden, los dos vuelven a repartir mano con los puntos de vida del principio. */
  | { kind: 'rematch' }

/** Una entrada del registro: quién lo hizo y qué. `id` es creciente, sirve de clave. */
export interface GameEntry {
  id: number
  from: Duelist
  game: DuelGame
}

/** Cada elección le gana a la que tiene abajo. */
const BEATS: Record<RpsPick, RpsPick> = { rock: 'scissors', paper: 'rock', scissors: 'paper' }

/** Cómo salió la ronda para mí, o `null` si todavía falta alguna elección. */
export function rpsOutcome(mine: RpsPick | null, theirs: RpsPick | null): 'win' | 'lose' | 'draw' | null {
  if (mine === null || theirs === null) return null
  if (mine === theirs) return 'draw'
  return BEATS[mine] === theirs ? 'win' : 'lose'
}

/** Cómo terminó el duelo: alguien perdió (se quedó sin puntos de vida o se rindió) o quedaron los dos en cero. */
export type DuelResult = { kind: 'loss'; loser: Duelist } | { kind: 'draw' }

/** El resultado de un duelo con esos puntos de vida y, si alguien se rindió, quién; `null` mientras siga. */
export function duelResult(lp: readonly number[], conceded: Duelist | null): DuelResult | null {
  if (conceded !== null) return { kind: 'loss', loser: conceded }

  const host = (lp[0] ?? 1) <= 0
  const guest = (lp[1] ?? 1) <= 0

  if (host && guest) return { kind: 'draw' }
  if (host) return { kind: 'loss', loser: 0 }
  if (guest) return { kind: 'loss', loser: 1 }
  return null
}

/** Cuántas entradas se guardan: el registro es de la mano, no un historial. */
export const MAX_GAME_LOG = 40

/** La misma lista con una entrada más, sin pasarse del máximo. */
export function addGame(log: readonly GameEntry[], entry: GameEntry): GameEntry[] {
  return [...log, entry].slice(-MAX_GAME_LOG)
}
