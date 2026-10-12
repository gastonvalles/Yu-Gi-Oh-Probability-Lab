import type { CardEntry } from '../types'
import { isRecord } from './utils'

/**
 * Muestreo de manos: en la práctica cada mano se califica "jugable" o "muerta" y la cuenta se guarda por
 * deck (su lista de cartas y el tamaño de la mano). Comparada con el % de manos limpias del Lab, dice si
 * tus reglas reflejan tu criterio.
 */

const HAND_SAMPLES_KEY = 'ygo-lab:hand-samples:v1'
/** Cuántos decks distintos se recuerdan (los más viejos se van). */
const MAX_DECKS = 30

export type HandRating = 'playable' | 'dead'

export interface HandTally {
  playable: number
  dead: number
}

export const EMPTY_TALLY: HandTally = { playable: 0, dead: 0 }

/** La cuenta es de una lista de cartas concreta: cambiar una carta (o el tamaño de la mano) arranca otra. */
export function deckSampleKey(cards: readonly CardEntry[], handSize: number): string {
  const list = cards
    .filter((card) => card.copies > 0)
    .map((card) => `${card.id}×${card.copies}`)
    .sort()
    .join(',')

  return `${handSize}:${list}`
}

function readAll(): Record<string, HandTally> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(HAND_SAMPLES_KEY) ?? '{}')

    if (!isRecord(parsed)) {
      return {}
    }

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, value]) =>
        isRecord(value) && Number.isInteger(value.playable) && Number.isInteger(value.dead) && Number(value.playable) >= 0 && Number(value.dead) >= 0
          ? [[key, { playable: Number(value.playable), dead: Number(value.dead) }]]
          : [],
      ),
    )
  } catch {
    return {}
  }
}

function writeAll(all: Record<string, HandTally>): void {
  try {
    localStorage.setItem(HAND_SAMPLES_KEY, JSON.stringify(all))
  } catch {
    // Sin almacenamiento: la cuenta vive sólo en esta sesión.
  }
}

export function readHandTally(deckKey: string): HandTally {
  return readAll()[deckKey] ?? EMPTY_TALLY
}

/** Califica la mano actual; si ya estaba calificada (`previous`), la cuenta se mueve en vez de sumar dos veces. Devuelve la cuenta nueva. */
export function recordHandRating(deckKey: string, rating: HandRating, previous: HandRating | null = null): HandTally {
  const all = readAll()
  const current = all[deckKey] ?? EMPTY_TALLY
  const next = { ...current }

  if (previous) {
    next[previous] = Math.max(0, next[previous] - 1)
  }

  next[rating] += 1

  // El deck recién calificado va al final: si hay de más, se van los más viejos.
  delete all[deckKey]
  const entries = [...Object.entries(all), [deckKey, next] as const].slice(-MAX_DECKS)
  writeAll(Object.fromEntries(entries))

  return next
}

export function resetHandTally(deckKey: string): void {
  const all = readAll()
  delete all[deckKey]
  writeAll(all)
}

/** Intervalo de Wilson al 95 % para `successes` de `total`: entre qué valores está, probablemente, la tasa real. */
export function wilsonInterval(successes: number, total: number, z = 1.96): [number, number] {
  if (total <= 0) {
    return [0, 1]
  }

  const p = successes / total
  const z2 = z * z
  const center = (p + z2 / (2 * total)) / (1 + z2 / total)
  const spread = (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / (1 + z2 / total)

  return [Math.max(0, center - spread), Math.min(1, center + spread)]
}
