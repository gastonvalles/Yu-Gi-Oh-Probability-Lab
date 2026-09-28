import type { CardEntry, HandPattern } from '../types'
import { evaluateAverageCleanProbability } from './probability-lab'

export const MIN_MAIN_DECK_SIZE = 40
export const MAX_MAIN_DECK_SIZE = 60
// Diferencias menores a 0,05 pp son ruido para el jugador.
const MIN_RELEVANT_DELTA = 0.0005
const SWAP_CANDIDATES = 4
const MAX_SUGGESTIONS = 5
const MAX_KEY_CARDS = 3

export type DeckChange =
  | { type: 'add'; cardId: string }
  | { type: 'cut'; cardId: string }
  | { type: 'swap'; cutCardId: string; addCardId: string }

export interface DeckSuggestion {
  change: DeckChange
  cutName: string | null
  addName: string | null
  deckSize: number
  /** El corte deja el deck en menos de 40: se completa con una carta neutra. */
  replacedWithNeutral: boolean
  probability: number
  delta: number
}

export interface KeyCard {
  cardId: string
  name: string
  /** Cuánto baja el KPI si se cambia una copia por una carta neutra. */
  delta: number
}

export interface DeckSuggestionReport {
  baseline: number
  suggestions: DeckSuggestion[]
  keyCards: KeyCard[]
}

export interface DeckSuggestionOptions {
  maxCopiesFor: (card: CardEntry) => number
}

interface Evaluated {
  card: CardEntry
  deckSize: number
  probability: number
  delta: number
}

/**
 * Simula cambios de a una copia y devuelve los que más suben el % de manos limpias
 * (promedio 1º/2º). Al cortar en 40 cartas, el hueco se llena con una carta neutra
 * (no aparece en ninguna regla), así el mazo sigue siendo legal.
 */
export function buildDeckSuggestions(
  cards: CardEntry[],
  patterns: HandPattern[],
  baseHandSize: number,
  options: DeckSuggestionOptions,
): DeckSuggestionReport {
  const deckSize = cards.reduce((total, card) => total + card.copies, 0)
  const cache = new Map<string, number>()
  const evaluate = (nextCards: CardEntry[], nextDeckSize: number): number => {
    const key = `${nextDeckSize}|${nextCards.map((card) => `${card.id}:${card.copies}`).join(',')}`
    const cached = cache.get(key)

    if (cached !== undefined) {
      return cached
    }

    const value = evaluateAverageCleanProbability(nextCards, patterns, baseHandSize, nextDeckSize)
    cache.set(key, value)
    return value
  }
  const baseline = evaluate(cards, deckSize)
  const toEvaluated = (card: CardEntry, nextCards: CardEntry[], nextDeckSize: number): Evaluated => {
    const probability = evaluate(nextCards, nextDeckSize)
    return { card, deckSize: nextDeckSize, probability, delta: probability - baseline }
  }

  const cutDeckSize = Math.max(MIN_MAIN_DECK_SIZE, deckSize - 1)
  const cuts = cards
    .filter((card) => card.copies > 0)
    .map((card) => toEvaluated(card, withCopies(cards, card.id, -1), cutDeckSize))
  const adds =
    deckSize < MAX_MAIN_DECK_SIZE
      ? cards
          .filter((card) => card.copies < options.maxCopiesFor(card))
          .map((card) => toEvaluated(card, withCopies(cards, card.id, 1), deckSize + 1))
      : []

  const topCuts = [...cuts].sort(byDeltaDesc).slice(0, SWAP_CANDIDATES)
  const topAdds = [...adds].sort(byDeltaDesc).slice(0, SWAP_CANDIDATES)
  const swaps = topCuts.flatMap((cut) =>
    topAdds
      .filter((add) => add.card.id !== cut.card.id)
      .map<DeckSuggestion>((add) => {
        const probability = evaluate(withCopies(withCopies(cards, cut.card.id, -1), add.card.id, 1), deckSize)
        return {
          change: { type: 'swap', cutCardId: cut.card.id, addCardId: add.card.id },
          cutName: cut.card.name,
          addName: add.card.name,
          deckSize,
          replacedWithNeutral: false,
          probability,
          delta: probability - baseline,
        }
      }),
  )
  const singleChanges: DeckSuggestion[] = [
    ...cuts.map((cut) => ({
      change: { type: 'cut', cardId: cut.card.id } as const,
      cutName: cut.card.name,
      addName: null,
      deckSize: cut.deckSize,
      replacedWithNeutral: deckSize - 1 < MIN_MAIN_DECK_SIZE,
      probability: cut.probability,
      delta: cut.delta,
    })),
    ...adds.map((add) => ({
      change: { type: 'add', cardId: add.card.id } as const,
      cutName: null,
      addName: add.card.name,
      deckSize: add.deckSize,
      replacedWithNeutral: false,
      probability: add.probability,
      delta: add.delta,
    })),
  ]

  return {
    baseline,
    suggestions: pickSuggestions([...swaps, ...singleChanges]),
    keyCards: [...cuts]
      .filter((cut) => cut.delta < -MIN_RELEVANT_DELTA)
      .sort((left, right) => left.delta - right.delta)
      .slice(0, MAX_KEY_CARDS)
      .map((cut) => ({ cardId: cut.card.id, name: cut.card.name, delta: cut.delta })),
  }
}

// Mejores cambios primero, sin repetir la misma carta en varias sugerencias.
function pickSuggestions(candidates: DeckSuggestion[]): DeckSuggestion[] {
  const usedCards = new Set<string>()
  const picked: DeckSuggestion[] = []

  for (const candidate of [...candidates].sort(byDeltaDesc)) {
    if (candidate.delta < MIN_RELEVANT_DELTA || picked.length >= MAX_SUGGESTIONS) {
      break
    }

    const cardIds = getChangeCardIds(candidate.change)
    // Cartas equivalentes (mismos roles) dan exactamente el mismo resultado: se muestra una.
    const isEquivalent = picked.some(
      (entry) => entry.change.type === candidate.change.type && Math.abs(entry.probability - candidate.probability) < 1e-9,
    )

    if (isEquivalent || cardIds.some((cardId) => usedCards.has(cardId))) {
      continue
    }

    cardIds.forEach((cardId) => usedCards.add(cardId))
    picked.push(candidate)
  }

  return picked
}

function getChangeCardIds(change: DeckChange): string[] {
  return change.type === 'swap' ? [change.cutCardId, change.addCardId] : [change.cardId]
}

function withCopies(cards: CardEntry[], cardId: string, delta: number): CardEntry[] {
  return cards
    .map((card) => (card.id === cardId ? { ...card, copies: card.copies + delta } : card))
    .filter((card) => card.copies > 0)
}

function byDeltaDesc(left: { delta: number }, right: { delta: number }): number {
  return right.delta - left.delta
}
