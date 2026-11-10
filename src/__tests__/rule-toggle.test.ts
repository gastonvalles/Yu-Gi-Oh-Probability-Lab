import { describe, expect, it } from 'vitest'

import { buildActiveRules, compareBuilds } from '../app/build-comparison'
import { deriveMainDeckCardsFromZone } from '../app/calculator-state'
import { oddsInputOf } from '../app/change-effects'
import { createMatcherPattern } from '../app/pattern-factory'
import { buildActiveRuleSet, buildPatternPresets, getSystemRuleId } from '../app/pattern-presets'
import { computeLabResults } from '../app/probability-lab'
import { duplicateRule, setRuleEnabled } from '../app/rule-edits'
import { buildRuleEntryGroups } from '../components/probability/probability-lab-helpers'
import { computeDraftImpact } from '../components/probability/use-draft-impact'
import { fortyCardMain } from './support/deck-fixtures'

/** Apagar una regla la saca de todas las cuentas: cada consumidor que mide con reglas pasa por `buildActiveRuleSet`. */
const MAIN = fortyCardMain()
const CARDS = deriveMainDeckCardsFromZone(MAIN)
const OWN = { ...createMatcherPattern('1+ Handtrap', 'opening', [{ matcher: { type: 'role', value: 'handtrap' }, quantity: 1, kind: 'include' }]), id: 'own' }
const OFF = setRuleEnabled([OWN], 'own', false)
const UNIVERSAL = getSystemRuleId('starter_opening')
const ids = (patterns: { id: string }[]) => patterns.map((pattern) => pattern.id)
const clean = (patterns: Parameters<typeof computeLabResults>[1]) => {
  const computation = computeLabResults(CARDS, patterns, 5)
  if (computation.status !== 'ok') throw new Error('el Lab tiene que poder medir')
  return computation.results.average.cleanProbability
}

describe('prender y apagar reglas', () => {
  it('setRuleEnabled: apagada lleva `enabled: false`, prendida vuelve sin el campo; duplicar arranca prendida', () => {
    expect(OFF[0]).toMatchObject({ id: 'own', enabled: false })
    expect(setRuleEnabled(OFF, 'own', true)[0]).not.toHaveProperty('enabled')
    expect(duplicateRule(OFF[0]!, 'Copia')).not.toHaveProperty('enabled')
  })

  it('el Lab (anillo grande, «Lo que más te frena», práctica y resumen): ni la universal ni la propia apagadas entran', () => {
    expect(ids(buildActiveRuleSet(CARDS, [OWN], []))).toEqual(expect.arrayContaining([UNIVERSAL, 'own']))
    expect(ids(buildActiveRuleSet(CARDS, OFF, ['starter_opening']))).not.toContain(UNIVERSAL)
    expect(ids(buildActiveRuleSet(CARDS, OFF, []))).not.toContain('own')
    // El número grande cambia al apagarla y vuelve al prenderla.
    expect(clean(buildActiveRuleSet(CARDS, [OWN], []))).not.toBe(clean(buildActiveRuleSet(CARDS, OFF, [])))
    expect(clean(buildActiveRuleSet(CARDS, setRuleEnabled(OFF, 'own', true), []))).toBe(clean(buildActiveRuleSet(CARDS, [OWN], [])))
  })

  it('Comparar: ni la regla apagada ni su fila', () => {
    const rules = { patterns: OFF, disabledGenericRuleIds: ['starter_opening'], handSize: 5 }
    const report = compareBuilds({ name: 'A', cards: CARDS }, { name: 'B', cards: CARDS }, rules)

    expect(ids(buildActiveRules(CARDS, rules))).not.toContain('own')
    expect(ids(buildActiveRules(CARDS, rules))).not.toContain(UNIVERSAL)
    expect(report.rules.map((row) => row.id)).not.toContain('own')
    expect(report.rules.map((row) => row.id)).not.toContain(UNIVERSAL)
  })

  it('Probar el cambio: la cuenta del cambio no la incluye', () => {
    const measured = ids(oddsInputOf(MAIN, { patterns: OFF, disabledGenericRuleIds: ['starter_opening'], handSize: 5 }).patterns)

    expect(measured).not.toContain('own')
    expect(measured).not.toContain(UNIVERSAL)
    expect(ids(oddsInputOf(MAIN, { patterns: [OWN], disabledGenericRuleIds: [], handSize: 5 }).patterns)).toContain('own')
  })

  it('el número en vivo del editor: con otra regla apagada, el «después» no la cuenta', () => {
    const draft = { ...createMatcherPattern('Borrador', 'problem', [{ matcher: { type: 'role', value: 'brick' }, quantity: 2, kind: 'include' }]), id: 'draft' }
    const impact = (customPatterns: typeof OFF) =>
      computeDraftImpact({ draft, cards: CARDS, customPatterns, disabledGenericRuleIds: [], handSize: 5, cleanBefore: { first: 0, second: 0, average: 0 } })?.clean?.after

    expect(impact(OFF)).toBe(impact([]))
    expect(impact([OWN])).not.toBe(impact([]))
  })

  it('la lista: la universal y la propia apagadas se ven apagadas (y siguen en la lista)', () => {
    const groups = buildRuleEntryGroups({
      presets: buildPatternPresets(CARDS),
      customPatterns: OFF,
      disabledGenericRuleIds: ['starter_opening'],
      derivedMainCards: CARDS,
      patternResults: [],
      viewPatternResults: { first: [], second: [] },
      view: 'second',
    })

    expect(groups.universal.find((entry) => entry.presetId === 'starter_opening')?.enabled).toBe(false)
    expect(groups.universal.find((entry) => entry.presetId === 'dead_cards_problem')?.enabled).toBe(true)
    expect(groups.custom.find((entry) => entry.patternId === 'own')?.enabled).toBe(false)
  })
})
