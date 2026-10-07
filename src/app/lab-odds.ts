import type { CardEntry, HandPattern } from '../types'
import type { TurnView } from '../types'
import { computeLabResults, computeLabViewResult } from './probability-lab'

/** Qué tan seguido pasa cada regla (y una mano sin salida) yendo 1º y yendo 2º. */
export interface LabOdds {
  first: number
  second: number
  rules: { first: Map<string, number>; second: Map<string, number> }
  /** Manos limpias (con salida y sin problemas) yendo 1º y yendo 2º. */
  clean: { first: number; second: number }
}

export interface LabOddsInput {
  cards: CardEntry[]
  patterns: HandPattern[]
  handSize: number
  /** Calcula solo ese turno: el resultado repite sus valores en `first` y `second`. */
  view?: Exclude<TurnView, 'average'>
}

export function computeLabOdds({ cards, patterns, handSize, view }: LabOddsInput): LabOdds | null {
  if (view) {
    const result = computeLabViewResult(cards, patterns, handSize, view)

    if (!result) {
      return null
    }

    const rules = new Map(result.patternResults.map((entry) => [entry.patternId, entry.probability]))

    return {
      clean: { first: result.cleanProbability, second: result.cleanProbability },
      first: result.noOpeningProbability,
      second: result.noOpeningProbability,
      rules: { first: rules, second: rules },
    }
  }

  const computation = computeLabResults(cards, patterns, handSize)

  if (computation.status !== 'ok') {
    return null
  }

  const { first, second } = computation.results

  return {
    clean: { first: first.cleanProbability, second: second.cleanProbability },
    first: first.noOpeningProbability,
    second: second.noOpeningProbability,
    rules: {
      first: new Map(first.patternResults.map((result) => [result.patternId, result.probability])),
      second: new Map(second.patternResults.map((result) => [result.patternId, result.probability])),
    },
  }
}
