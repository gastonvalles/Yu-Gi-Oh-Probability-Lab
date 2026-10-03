import type { CardEntry, HandPattern } from '../types'
import { computeLabResults } from './probability-lab'

/** Qué tan seguido pasa cada regla (y una mano sin salida) yendo 1º y yendo 2º. */
export interface LabOdds {
  first: number
  second: number
  rules: { first: Map<string, number>; second: Map<string, number> }
}

export interface LabOddsInput {
  cards: CardEntry[]
  patterns: HandPattern[]
  handSize: number
}

export function computeLabOdds({ cards, patterns, handSize }: LabOddsInput): LabOdds | null {
  const computation = computeLabResults(cards, patterns, handSize)

  if (computation.status !== 'ok') {
    return null
  }

  const { first, second } = computation.results

  return {
    first: first.noOpeningProbability,
    second: second.noOpeningProbability,
    rules: {
      first: new Map(first.patternResults.map((result) => [result.patternId, result.probability])),
      second: new Map(second.patternResults.map((result) => [result.patternId, result.probability])),
    },
  }
}
