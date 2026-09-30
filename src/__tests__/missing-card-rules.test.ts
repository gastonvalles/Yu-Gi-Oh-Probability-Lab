import { describe, expect, it } from 'vitest'

import { curatePatterns, hasMissingRequiredCards } from '../app/pattern-curation'
import { createMatcherPattern } from '../app/pattern-factory'
import { buildRuleEntryGroups } from '../components/probability/probability-lab-helpers'
import type { CardEntry } from '../types'

const card = (id: string, name: string): CardEntry => ({
  id, name, copies: 3, source: 'manual', apiCard: null, origin: 'engine', roles: ['starter'], needsReview: false,
})

// Build vieja: "Pre-Preparation + Mirror". En la build nueva ya no está Pre-Preparation.
const MIRROR = card('mirror', 'Mitsurugi Mirror')
const RULE = createMatcherPattern('Pre-Preparation of Rites + Mitsurugi Mirror', 'problem', [
  { matcher: { type: 'card', value: 'pre-prep' }, quantity: 1, kind: 'include' },
  { matcher: { type: 'card', value: 'mirror' }, quantity: 1, kind: 'include' },
])

describe('reglas con cartas que ya no están en el deck', () => {
  it('no se evalúan (antes quedaban como "1+ Mirror" y daban falsos problemas)', () => {
    expect(hasMissingRequiredCards(RULE, new Map([[MIRROR.id, MIRROR]]))).toBe(true)
    expect(curatePatterns([RULE], [MIRROR])).toEqual([])
  })

  it('se conservan intactas al guardar, por si la carta vuelve', () => {
    expect(curatePatterns([RULE], [MIRROR], { keepRulesWithMissingCards: true })).toEqual([RULE])
  })

  it('se muestran en la lista marcadas como "falta carta"', () => {
    const groups = buildRuleEntryGroups({
      presets: [],
      customPatterns: [],
      unavailablePatterns: [RULE],
      disabledGenericRuleIds: [],
      derivedMainCards: [MIRROR],
      patternResults: [],
      viewPatternResults: { first: [], second: [] },
      view: 'average',
    })

    expect(groups.custom).toHaveLength(1)
    expect(groups.custom[0]).toMatchObject({ missingCards: true, probability: null })
  })
})
