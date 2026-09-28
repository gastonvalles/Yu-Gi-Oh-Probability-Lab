import { describe, expect, it } from 'vitest'

import { createMatcherPattern } from '../app/pattern-factory'
import { buildDeckSuggestions } from '../app/deck-suggestions'
import { computeLabResults, evaluateAverageCleanProbability, type LabResults } from '../app/probability-lab'
import { buildRoleDistributions, hypergeometric } from '../app/role-distribution'
import { calculateProbabilities } from '../probability'
import type { CardEntry, CardRole, HandPattern, TurnContext } from '../types'

function card(id: string, copies: number, roles: CardRole[]): CardEntry {
  return { id, name: `Card ${id}`, copies, source: 'manual', apiCard: null, origin: 'engine', roles, needsReview: false }
}

function filler(count: number): CardEntry[] {
  return Array.from({ length: count }, (_, index) => card(`f${index}`, 1, ['tech']))
}

function rolePattern(
  name: string,
  role: CardRole,
  kind: 'opening' | 'problem' = 'opening',
  turnContext: TurnContext = 'either',
  quantity = 1,
): HandPattern {
  return createMatcherPattern(name, kind, [{ matcher: { type: 'role', value: role }, quantity, kind: 'include' }], {
    turnContext,
  })
}

// 40 cartas: 8 starters, 3 bricks, 29 de relleno.
const DECK = [card('s1', 3, ['starter']), card('s2', 3, ['starter']), card('s3', 2, ['starter']), card('b1', 3, ['brick']), ...filler(29)]
const PATTERNS = [rolePattern('Starter', 'starter'), rolePattern('2 bricks', 'brick', 'problem', 'either', 2)]

function okResults(cards: CardEntry[], patterns: HandPattern[]): LabResults {
  const computation = computeLabResults(cards, patterns, 5)

  if (computation.status !== 'ok') {
    throw new Error('Se esperaba un resultado')
  }

  return computation.results
}

describe('computeLabResults', () => {
  it('ir segundo roba 6 cartas y el promedio es la media de ambos turnos', () => {
    const { first, second, average } = okResults(DECK, PATTERNS)

    expect(first.handSize).toBe(5)
    expect(second.handSize).toBe(6)
    expect(second.totalHands).toBe(3838380)
    expect(second.cleanProbability).toBeGreaterThan(first.cleanProbability)
    expect(average.cleanProbability).toBeCloseTo((first.cleanProbability + second.cleanProbability) / 2)
  })

  it('manos limpias + sin salida + salida frenada suman 100%', () => {
    for (const view of Object.values(okResults(DECK, PATTERNS))) {
      expect(view.cleanProbability + view.noOpeningProbability + view.withProblemProbability).toBeCloseTo(1)
    }
  })

  it('promedia cada regla sólo en los turnos donde aplica', () => {
    const onlyFirst = rolePattern('Solo primero', 'starter', 'opening', 'first')
    const { first, average } = okResults(DECK, [...PATTERNS, onlyFirst])
    const byId = (results: LabResults['first']) => results.patternResults.find((result) => result.patternId === onlyFirst.id)

    expect(byId(average)?.probability).toBeCloseTo(byId(first)?.probability ?? -1)
  })

  it('agrupar cartas equivalentes no cambia el resultado exacto', () => {
    const merged = [card('s', 8, ['starter']), card('b1', 3, ['brick']), ...filler(29)]
    const split = calculateProbabilities({ deckSize: 40, handSize: 5, cards: DECK, patterns: PATTERNS }).summary
    const joined = calculateProbabilities({ deckSize: 40, handSize: 5, cards: merged, patterns: PATTERNS }).summary

    expect(split?.goodHands).toBe(joined?.goodHands)
    expect(split?.badHands).toBe(joined?.badHands)
  })

  it('las condiciones de nombres distintos siguen distinguiendo cada carta', () => {
    const twoNames = createMatcherPattern('2 starters distintos', 'opening', [
      { matcher: { type: 'role', value: 'starter' }, quantity: 2, kind: 'include', distinct: true },
    ])
    const threeNames = calculateProbabilities({ deckSize: 40, handSize: 5, cards: DECK, patterns: [twoNames] }).summary
    const oneName = calculateProbabilities({
      deckSize: 40,
      handSize: 5,
      cards: [card('s', 8, ['starter']), card('b1', 3, ['brick']), ...filler(29)],
      patterns: [twoNames],
    }).summary

    expect(threeNames?.totalProbability).toBeGreaterThan(0)
    expect(oneName?.totalProbability).toBe(0)
  })

  it('indica qué reglas aparecen en cada grupo de manos', () => {
    const { first, second, average } = okResults(DECK, PATTERNS)

    for (const view of [first, second, average]) {
      const starterInClean = view.segmentRules.clean.find((rule) => rule.name === 'Starter')
      const bricksWithProblem = view.segmentRules.withProblem.find((rule) => rule.name === '2 bricks')

      // Toda mano limpia o con problema tiene la única salida; toda mano "con problema" tiene el único problema.
      expect(starterInClean?.share).toBeCloseTo(1)
      expect(bricksWithProblem?.share).toBeCloseTo(1)
      expect(view.segmentRules.clean.some((rule) => rule.kind === 'problem')).toBe(false)
      expect(view.segmentRules.noOpening.some((rule) => rule.kind === 'opening')).toBe(false)
    }
  })

  it('las manos por grupo suman las manos de cada regla', () => {
    const summary = calculateProbabilities({ deckSize: 40, handSize: 5, cards: DECK, patterns: PATTERNS }).summary!

    summary.patternResults.forEach((result, index) => {
      const bySegment =
        summary.segmentPatternHands.clean[index]! +
        summary.segmentPatternHands.withProblem[index]! +
        summary.segmentPatternHands.noOpening[index]!
      expect(bySegment).toBeCloseTo(result.matchingHands)
    })
  })

  it('una carta con varios roles cuenta para cada uno, pero una sola copia no cubre dos condiciones', () => {
    const multiRole = [card('x', 3, ['starter', 'extender', 'boardbreaker']), ...filler(37)]
    const oneCopy = createMatcherPattern('Starter', 'opening', [
      { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
    ])
    const followUp = createMatcherPattern(
      'Starter + Extender',
      'opening',
      [
        { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
        { matcher: { type: 'role', value: 'extender' }, quantity: 1, kind: 'include' },
      ],
      { allowSharedCards: false, matchMode: 'all', minimumMatches: 2 },
    )
    const summary = calculateProbabilities({ deckSize: 40, handSize: 5, cards: multiRole, patterns: [oneCopy, followUp] }).summary!
    const [starter, starterAndExtender] = summary.patternResults

    expect(starter?.probability).toBeCloseTo(1 - hypergeometric(40, 3, 5, 0))
    // Necesita dos copias: la misma carta no puede ser starter y extender a la vez.
    expect(starterAndExtender?.probability).toBeCloseTo(1 - hypergeometric(40, 3, 5, 0) - hypergeometric(40, 3, 5, 1))
    expect(buildRoleDistributions(multiRole, [5]).find((role) => role.key === 'extender')?.copies).toBe(3)
  })

  it('bloquea el cálculo con un deck inválido', () => {
    expect(computeLabResults(filler(20), PATTERNS, 5).status).toBe('blocked')
  })
})

describe('buildRoleDistributions', () => {
  it('usa la hipergeométrica y los buckets suman 1', () => {
    const [starters] = buildRoleDistributions(DECK, [5])

    expect(hypergeometric(40, 3, 5, 0)).toBeCloseTo(0.6624, 4)
    expect(starters?.copies).toBe(8)
    expect(starters?.buckets.reduce((total, value) => total + value, 0)).toBeCloseTo(1)
    expect(starters?.atLeastOne).toBeCloseTo(1 - hypergeometric(40, 8, 5, 0))
  })
})

describe('buildDeckSuggestions', () => {
  const report = buildDeckSuggestions(DECK, PATTERNS, 5, { maxCopiesFor: () => 3 })

  it('propone cambiar un brick por un starter manteniendo 40 cartas', () => {
    const [best] = report.suggestions

    expect(best?.change).toMatchObject({ type: 'swap', cutCardId: 'b1', addCardId: 's3' })
    expect(best?.deckSize).toBe(40)
    expect(best?.probability).toBeCloseTo(
      evaluateAverageCleanProbability(
        [card('s1', 3, ['starter']), card('s2', 3, ['starter']), card('s3', 3, ['starter']), card('b1', 2, ['brick']), ...filler(29)],
        PATTERNS,
        5,
        40,
      ),
    )
    expect(report.suggestions.every((suggestion) => suggestion.delta > 0)).toBe(true)
  })

  it('respeta el límite de copias y marca los starters como cartas clave', () => {
    const limited = buildDeckSuggestions(DECK, PATTERNS, 5, { maxCopiesFor: (entry) => (entry.id === 's3' ? 2 : 3) })

    expect(limited.suggestions.some((suggestion) => JSON.stringify(suggestion.change).includes('"addCardId":"s3"'))).toBe(false)
    expect(report.keyCards[0]?.cardId).toMatch(/^s/)
  })
})
