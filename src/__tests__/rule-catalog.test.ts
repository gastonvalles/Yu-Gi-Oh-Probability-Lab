import { describe, expect, it } from 'vitest'

import { fromPortableConfig, toPortableConfig } from '../app/app-state-codec'
import { createInitialState } from '../app/model'
import { createMatcherPattern } from '../app/pattern-factory'
import {
  PATTERN_PRESET_DEFINITIONS,
  buildActiveRuleSet,
  buildPatternPresets,
  getSystemRuleId,
} from '../app/pattern-presets'
import { patternsReducer, setGenericRuleEnabled } from '../app/patterns-slice'
import type { CardEntry, CardRole } from '../types'

function card(id: string, copies: number, roles: CardRole[]): CardEntry {
  return { id, name: id, copies, source: 'manual', apiCard: null, origin: 'engine', roles, needsReview: false }
}

const CARDS = [card('s', 8, ['starter']), card('e', 6, ['extender']), card('b', 3, ['brick']), card('h', 6, ['handtrap'])]
const genericIds = PATTERN_PRESET_DEFINITIONS.filter((definition) => definition.tier === 'generic').map((d) => d.id)
const universalIds = PATTERN_PRESET_DEFINITIONS.filter((definition) => definition.tier === 'universal').map((d) => d.id)

describe('catálogo de reglas', () => {
  it('tiene universales y genéricas con ids estables', () => {
    expect(universalIds).toEqual(['starter_opening', 'dead_cards_problem'])
    expect(genericIds.length).toBeGreaterThan(0)
    expect(buildPatternPresets(CARDS).map((preset) => preset.pattern.id)).toEqual(
      PATTERN_PRESET_DEFINITIONS.map((definition) => getSystemRuleId(definition.id)),
    )
  })

  it('las universales entran siempre y las genéricas apagadas no', () => {
    const ids = buildActiveRuleSet(CARDS, [], genericIds).map((pattern) => pattern.id)

    expect(ids).toEqual(universalIds.map(getSystemRuleId))
    expect(buildActiveRuleSet(CARDS, [], []).length).toBe(PATTERN_PRESET_DEFINITIONS.length)
  })

  it('suma las reglas propias sin duplicar definiciones del sistema', () => {
    const copy = createMatcherPattern('Copia', 'opening', [
      { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
    ])
    const own = createMatcherPattern('2 extenders', 'opening', [
      { matcher: { type: 'role', value: 'extender' }, quantity: 2, kind: 'include' },
    ])
    const ids = buildActiveRuleSet(CARDS, [copy, own], []).map((pattern) => pattern.id)

    expect(ids).toContain(own.id)
    expect(ids).not.toContain(copy.id)
  })
})

describe('estado de reglas genéricas', () => {
  it('prende y apaga una genérica y se guarda en la configuración', () => {
    const base = patternsReducer(undefined, { type: 'init' })
    const off = patternsReducer(base, setGenericRuleEnabled({ ruleId: 'no_answer_second_problem', enabled: false }))
    const on = patternsReducer(off, setGenericRuleEnabled({ ruleId: 'no_answer_second_problem', enabled: true }))

    expect(off.disabledGenericRuleIds).toEqual(['no_answer_second_problem'])
    expect(on.disabledGenericRuleIds).toEqual([])

    const state = { ...createInitialState(), disabledGenericRuleIds: ['starter_extender_opening'] }
    expect(fromPortableConfig(toPortableConfig(state)).disabledGenericRuleIds).toEqual(['starter_extender_opening'])
  })
})
