import { afterEach, describe, expect, it } from 'vitest'

import { buildDerivedDeckGroupMap } from '../app/deck-groups'
import { ROLE_GROUP_LABEL, buildMaxedHint, buildMissingRoleHint, findCulprit } from '../app/lab-suggestion'
import { resolvePattern, type CountOperations } from '../app/pattern-engine'
import { createMatcherPattern } from '../app/pattern-factory'
import { curatePatterns } from '../app/pattern-curation'
import { buildPatternPresets } from '../app/pattern-presets'
import { computeLabResults, labInputSignature } from '../app/probability-lab'
import { applyLocale } from '../i18n'
import { validateCalculationState } from '../probability-validation'
import type { CalculatorState, CardEntry, CardRole, HandPattern, Matcher, RequirementKind } from '../types'

afterEach(() => applyLocale('es'))

function card(id: string, copies: number, roles: CardRole[], origin: CardEntry['origin'] = 'engine'): CardEntry {
  return { id, name: `Card ${id}`, copies, source: 'manual', apiCard: null, origin, roles, needsReview: false }
}

// 40 cartas: 3 starters, 3 extenders, 3 bricks y 31 de relleno.
const deck = (): CardEntry[] => [
  card('s', 3, ['starter']),
  card('e', 3, ['extender']),
  card('b', 3, ['brick'], 'non_engine'),
  ...Array.from({ length: 31 }, (_, index) => card(`f${index}`, 1, ['recovery'], 'non_engine')),
]

const rule = (matchers: Array<{ matcher: Matcher; quantity: number; kind: RequirementKind; distinct?: boolean }>, options?: Parameters<typeof createMatcherPattern>[3]): HandPattern =>
  createMatcherPattern('Rule', 'opening', matchers, options)

const OPERATIONS: CountOperations<number[], number> = {
  cloneCounts: (counts) => [...counts],
  consumeCount: (counts, key, amount) => {
    counts[key] = Math.max(0, (counts[key] ?? 0) - amount)
  },
  getCount: (counts, key) => counts[key] ?? 0,
  serializeCounts: (counts) => counts.join(','),
}

/** La frase con la que el motor dice cuándo se cumple la regla, en el idioma actual. */
function labelOf(pattern: HandPattern, cards: CardEntry[] = deck()): string {
  return resolvePattern(pattern, {
    availableCounts: cards.map((entry) => entry.copies),
    cardById: new Map(cards.map((entry) => [entry.id, entry])),
    countOperations: OPERATIONS,
    groupsByKey: buildDerivedDeckGroupMap(cards),
    mapCardIdToKey: (cardId) => {
      const index = cards.findIndex((entry) => entry.id === cardId)
      return index >= 0 ? index : null
    },
  }).requirementLabel
}

describe('rules en inglés', () => {
  it('los avisos de validación salen en inglés, con el plural y el nombre de la regla', () => {
    applyLocale('en')
    const cards = [card('s', 3, ['starter']), card('b', 0, ['brick'], 'non_engine')]
    const state: CalculatorState = {
      deckSize: 5,
      handSize: 5,
      cards,
      patterns: [
        { ...rule([{ matcher: { type: 'card_pool', value: ['s', 'b'] }, quantity: 3, kind: 'include', distinct: true }]), name: '' },
        { ...rule([{ matcher: { type: 'card', value: 'b' }, quantity: 1, kind: 'include' }]), name: 'Bricks' },
      ],
    }
    const messages = validateCalculationState(state).map((issue) => issue.message)

    expect(messages).toContain('The Main Deck must have at least 40 cards to calculate the exact probability.')
    expect(messages).toContain('Missing 2 cards. They will be treated as "Other cards".')
    expect(messages).toContain('Rule "unnamed" asks for 3 distinct names in a pool that only has 1.')
    expect(messages).toContain('Rule "Bricks" asks for 1 copy in a pool that only adds up to 0.')
    expect(validateCalculationState({ ...state, deckSize: 6, cards: [card('s', 5, ['starter'])], patterns: [] }).map((issue) => issue.message)).toContain('Missing 1 card. It will be treated as "Other cards".')
  })

  it('las reglas del sistema tienen título, descripción y nombre en inglés, y respetan el nombre que puso la persona', () => {
    applyLocale('en')
    const [opening] = buildPatternPresets(deck(), { starter_opening: 'Mi salida' })

    expect(opening!.title).toBe('Mi salida')
    expect(opening!.defaultTitle).toBe('Basic opening')
    expect(opening!.pattern.name).toBe('Mi salida')
    expect(opening!.describeProbability(0.123)).toBe('You open at least one Starter in 12.3% of hands.')
    expect(buildPatternPresets(deck()).map((preset) => preset.title)).toEqual([
      'Basic opening',
      '2+ dead cards',
      'Opening with follow-up',
      'Opening with interaction',
      'Board-breaking opening',
      'No answer going second',
    ])
  })

  it('la frase de una regla se arma en inglés: copias, nombres distintos, "sin", tipos y cómo se unen las condiciones', () => {
    applyLocale('en')
    const starter: Matcher = { type: 'card', value: 's' }
    const pool: Matcher = { type: 'card_pool', value: ['s', 'e'] }

    expect(labelOf(rule([{ matcher: starter, quantity: 1, kind: 'include' }], { allowSharedCards: true }))).toBe('The rule is met if you open 1 copy of Card s.')
    expect(labelOf(rule([{ matcher: pool, quantity: 2, kind: 'include' }, { matcher: starter, quantity: 1, kind: 'exclude' }], { allowSharedCards: false }))).toBe(
      "The rule, without reusing the same card across conditions, is met if you open 2 copies of (Card s / Card e) and you don't open any copy of Card s.",
    )
    expect(labelOf(rule([{ matcher: pool, quantity: 2, kind: 'include', distinct: true }, { matcher: starter, quantity: 2, kind: 'exclude' }], { matchMode: 'any', allowSharedCards: true }))).toBe(
      "The rule is met if any of these options happens: you open 2 distinct names from (Card s / Card e) or you don't open 2 or more copies of Card s.",
    )
    expect(
      labelOf(
        rule(
          [
            { matcher: { type: 'archetype', value: 'Ash' }, quantity: 1, kind: 'include' },
            { matcher: { type: 'card_type', value: 'monster' }, quantity: 3, kind: 'include' },
            { matcher: { type: 'card_type', value: 'trap' }, quantity: 1, kind: 'exclude' },
          ],
          { matchMode: 'at-least', minimumMatches: 2, allowSharedCards: true },
        ),
      ),
    ).toBe('The rule is met if at least 2 of these options happen: you open 1 copy of Archetype: Ash, you open 3 cards of Type: Monster, you don\'t open any card of Type: Trap.')
    expect(labelOf({ ...rule([]), conditions: [] })).toBe('No requirements')
  })

  it('las sugerencias hablan en inglés: el culpable sin salida, la familia de relleno y los avisos', () => {
    applyLocale('en')
    const result = { handSize: 5, cleanProbability: 0, noOpeningProbability: 0.4, withProblemProbability: 0, cleanHands: null, totalHands: null, patternResults: [], segmentRules: { clean: [], withProblem: [], noOpening: [] } }
    const problem = createMatcherPattern('No answer', 'problem', [
      { matcher: { type: 'role', value: 'handtrap' }, quantity: 1, kind: 'exclude' },
      { matcher: { type: 'role', value: 'disruption' }, quantity: 1, kind: 'exclude' },
    ])
    const culprit = { kind: 'problem' as const, patternId: problem.id, name: problem.name, probability: 0.3 }
    const cards = [card('s', 3, ['starter'])]

    expect(findCulprit(result)?.name).toBe('Hands with no opening')
    expect(ROLE_GROUP_LABEL.filler).toBe('filler card')
    expect(buildMissingRoleHint(culprit, cards, [problem])).toBe('Your deck has no cards with the Handtrap, Disruption roles: adding one is what lowers it the most.')
    expect(buildMissingRoleHint(culprit, cards, [{ ...problem, conditions: problem.conditions.slice(0, 1) }])).toBe('Your deck has no cards with the Handtrap role: adding one is what lowers it the most.')

    const maxed = [card('h', 3, ['handtrap']), card('d', 3, ['disruption'])]

    expect(buildMaxedHint(culprit, maxed, [problem])).toBe(
      'The cards that prevent it (Card h, Card d) are already at the maximum copies your format allows: to lower it, add different cards with those roles.',
    )
  })

  it('una regla propia sin nombre recibe uno en el idioma actual', () => {
    applyLocale('en')
    const unnamed = (kind: 'opening' | 'problem'): HandPattern => ({ ...createMatcherPattern('', kind, [{ matcher: { type: 'card', value: 's' }, quantity: 1, kind: 'include' }]), name: '  ' })
    const [opening, problem] = curatePatterns([unnamed('opening'), { ...unnamed('problem'), conditions: [{ ...unnamed('problem').conditions[0]!, matcher: { type: 'card', value: 'e' } }] }], deck())

    expect(opening!.name).toBe('Unnamed opening')
    expect(problem!.name).toBe('Unnamed problem')
  })

  it('lo que se cachea lleva el idioma: el resultado de uno no se muestra en el otro', () => {
    const small = [card('s', 3, ['starter']), card('e', 3, ['extender'])]
    const rules = [rule([{ matcher: { type: 'card', value: 's' }, quantity: 1, kind: 'include' }])]

    applyLocale('en')
    const english = computeLabResults(small, rules, 5)
    const englishSignature = labInputSignature(small, rules, 5)

    applyLocale('es')
    const spanish = computeLabResults(small, rules, 5)

    expect(labInputSignature(small, rules, 5)).not.toBe(englishSignature)
    expect(english.status).toBe('blocked')
    expect(english.issues.map((issue) => issue.message)).toContain('The Main Deck must have at least 40 cards to calculate the exact probability.')
    expect(spanish.issues.map((issue) => issue.message)).toContain('El Main Deck debe tener al menos 40 cartas para calcular la probabilidad exacta.')
  })
})
