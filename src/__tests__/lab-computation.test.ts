import { describe, expect, it } from 'vitest'

import { labComputationKey } from '../app/lab-computation-client'
import { buildActiveRuleSet, buildPatternPresets } from '../app/pattern-presets'
import { assembleLabComputation, calculateLabView, computeLabResults, labInputSignature } from '../app/probability-lab'
import type { CardEntry, CardRole } from '../types'

function card(id: string, copies: number, roles: CardRole[], origin: CardEntry['origin'] = 'engine'): CardEntry {
  return { id, name: `Card ${id}`, copies, source: 'manual', apiCard: null, origin, roles, needsReview: false }
}

const deck = (): CardEntry[] => [
  ...Array.from({ length: 12 }, (_, index) => card(`s${index}`, 1, ['starter'])),
  card('ht', 3, ['handtrap'], 'non_engine'),
  card('brick', 2, ['brick'], 'non_engine'),
  ...Array.from({ length: 23 }, (_, index) => card(`f${index}`, 1, ['tech'], 'non_engine')),
]

describe('caché del Lab por contenido', () => {
  it('las reglas del sistema tienen ids estables aunque se armen de nuevo', () => {
    const first = buildPatternPresets(deck())
    const second = buildPatternPresets(deck())

    expect(first.map((preset) => preset.pattern.conditions.map((condition) => condition.id))).toEqual(
      second.map((preset) => preset.pattern.conditions.map((condition) => condition.id)),
    )
  })

  it('la clave no cambia al reconstruir las reglas ni al crear arrays nuevos con lo mismo', () => {
    const rulesA = buildActiveRuleSet(deck(), [], [])
    const rulesB = buildActiveRuleSet(deck(), [], [])

    expect(labComputationKey({ cards: deck(), patterns: rulesA, handSize: 5 })).toBe(
      labComputationKey({ cards: deck(), patterns: rulesB, handSize: 5 }),
    )
  })

  it('la clave sí cambia con otro deck, otras reglas u otra mano', () => {
    const cards = deck()
    const rules = buildActiveRuleSet(cards, [], [])
    const base = labComputationKey({ cards, patterns: rules, handSize: 5 })

    expect(labComputationKey({ cards, patterns: rules, handSize: 6 })).not.toBe(base)
    expect(labComputationKey({ cards: cards.map((entry) => (entry.id === 'ht' ? { ...entry, copies: 2 } : entry)), patterns: rules, handSize: 5 })).not.toBe(base)
    expect(labComputationKey({ cards, patterns: rules.slice(1), handSize: 5 })).not.toBe(base)
  })

  it('ignora los ids de las condiciones (azarosos) pero no su contenido', () => {
    const cards = deck()
    const [rule] = buildActiveRuleSet(cards, [], [])
    const renamedConditions = { ...rule, conditions: rule.conditions.map((condition) => ({ ...condition, id: 'otro-id' })) }
    const changedQuantity = { ...rule, conditions: rule.conditions.map((condition) => ({ ...condition, quantity: condition.quantity + 1 })) }

    expect(labInputSignature(cards, [renamedConditions], 5)).toBe(labInputSignature(cards, [rule], 5))
    expect(labInputSignature(cards, [changedQuantity], 5)).not.toBe(labInputSignature(cards, [rule], 5))
  })

  it('armar el resultado con los turnos calculados por separado da lo mismo que calcularlo junto', () => {
    const cards = deck()
    const rules = buildActiveRuleSet(cards, [], [])
    const together = computeLabResults(cards, rules, 5)
    const apart = assembleLabComputation(calculateLabView(cards, rules, 5, 'first'), calculateLabView(cards, rules, 5, 'second'), rules, 5)

    expect(apart).toEqual(together)
  })
})
