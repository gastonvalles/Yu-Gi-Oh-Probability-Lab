import type { Duelist } from './life-calculator'

/**
 * Lo que los dos hacen en la mesa además de jugar las cartas: tirar la moneda o el dado, piedra-papel-tijera y decir quién va primero. Nada de esto cambia la mesa: viaja aparte (`game`) y los dos lo ven en el registro. Es para jugar con amigos:
 * quien tira es quien elige el resultado, igual que con una moneda de verdad sobre la mesa.
 */

export type RpsPick = 'rock' | 'paper' | 'scissors'
export const RPS_PICKS: readonly RpsPick[] = ['rock', 'paper', 'scissors']

/** Cómo se define quién elige ir primero: moneda, dado o piedra-papel-tijera. */
export const TOSS_METHODS = ['coin', 'die', 'rps'] as const
export type TossMethod = (typeof TOSS_METHODS)[number]

export type DuelGame =
  /** `call` (cara o cruz) sólo lo lleva la moneda con que se define quién empieza: gana quien la acertó. */
  | { kind: 'coin'; face: 0 | 1; call?: 0 | 1 }
  /** Con qué se define quién elige ir primero (el primero en elegir lo fija; si eligen a la vez, vale el del anfitrión). */
  | { kind: 'toss'; method: TossMethod }
  /** Dado de seis caras. */
  | { kind: 'die'; value: number }
  /** Mi elección (el rival no la ve hasta que yo elija la mía); `null` empieza otra ronda y borra las dos. */
  | { kind: 'rps'; pick: RpsPick | null }
  /** Quién va primero (0 = anfitrión, 1 = invitado). */
  | { kind: 'order'; first: Duelist }
  /** Me rindo: el duelo termina y gana el otro. */
  | { kind: 'concede' }
  /** Quiero la revancha: cuando los dos la piden, los dos vuelven a repartir mano con los puntos de vida del principio. */
  | { kind: 'rematch' }

/** Una línea del chat: quién la escribió y qué dijo. `id` es creciente, sirve de clave. */
export interface ChatLine {
  id: number
  from: Duelist
  text: string
}

/** Largo máximo de un mensaje del chat y cuántos se guardan. */
export const MAX_CHAT_LENGTH = 200
export const MAX_CHAT_LOG = 100

/**
 * Lo que un texto de otra persona no puede llevar: los controles (C0 y C1), los separadores de línea, el espacio de ancho cero y la marca de orden de bytes (el nombre "Ana" que no se ve),
 * y las marcas que dan vuelta o aíslan la dirección del texto (una línea que se lee al revés, o que hace pasar un mensaje por otro). Se dejan el unidor y el separador de ancho cero
 * (hacen falta en los emoji compuestos y en algunas escrituras).
 */
// Justamente lo que se quiere sacar son los caracteres de control.
// eslint-disable-next-line no-control-regex
const HIDDEN = /[\u0000-\u001f\u007f-\u009f\u200b\u2028\u2029\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g

/** El texto sin lo que esconde o da vuelta lo que se lee (ver `HIDDEN`). */
export const stripHidden = (text: string) => text.replace(HIDDEN, '')

/** Un mensaje del chat sin caracteres de control ni de los que dan vuelta el texto, sin espacios de más y con un largo razonable; vacío si no queda nada. */
export const cleanChat = (text: string) => stripHidden(text).trim().slice(0, MAX_CHAT_LENGTH)

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

/** Cuántos duelos tiene que ganar alguien para ganar un Match (mejor de 3). */
export const MATCH_TARGET = 2

/** Cómo va un Match: cuántos duelos se jugaron y cuántos ganó cada uno (0 = anfitrión, 1 = invitado); sin contar el duelo que está en juego. */
export interface Series {
  played: number
  wins: readonly [number, number]
}

export const NEW_SERIES: Series = { played: 0, wins: [0, 0] }

/** El marcador de un Match con el resultado del duelo de ahora sumado, y quién ganó el Match si ya lo ganó alguien. */
export function seriesScore(series: Series, result: DuelResult | null): { wins: readonly [number, number]; winner: Duelist | null } {
  const wins: [number, number] = [series.wins[0], series.wins[1]]

  if (result?.kind === 'loss') {
    wins[result.loser === 0 ? 1 : 0] += 1
  }

  return { wins, winner: wins[0] >= MATCH_TARGET ? 0 : wins[1] >= MATCH_TARGET ? 1 : null }
}

/** El Match después de la revancha: suma el duelo que terminó, o vuelve a empezar si el Match ya estaba ganado. */
export function advanceSeries(series: Series, result: DuelResult | null): Series {
  const score = seriesScore(series, result)

  return score.winner === null ? { played: series.played + 1, wins: score.wins } : { played: series.played + 1, wins: [0, 0] }
}

/** Cuántas entradas se guardan: el registro es de la mano, no un historial. */
export const MAX_GAME_LOG = 40

/** La misma lista con una entrada más, sin pasarse del máximo. */
export function addGame(log: readonly GameEntry[], entry: GameEntry): GameEntry[] {
  return [...log, entry].slice(-MAX_GAME_LOG)
}

/** La misma lista de chat con una línea más, sin pasarse del máximo. */
export function addChat(log: readonly ChatLine[], line: ChatLine): ChatLine[] {
  return [...log, line].slice(-MAX_CHAT_LOG)
}

/** Quién gana al tirar el dado: el número más alto; con el mismo número no gana nadie y hay que volver a tirar. */
export function dieWinner(host: number, guest: number): Duelist | null {
  return host === guest ? null : host > guest ? 0 : 1
}

/** Quién gana la moneda: quien la pidió, si acertó; si no, el otro. */
export const coinWinner = (caller: Duelist, call: 0 | 1, face: 0 | 1): Duelist => (call === face ? caller : caller === 0 ? 1 : 0)
