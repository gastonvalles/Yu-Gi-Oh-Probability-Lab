import { describe, expect, it } from 'vitest'

import { compareBuilds } from '../app/build-comparison'
import { createMatcherPattern } from '../app/pattern-factory'
import type { CardEntry, CardRole } from '../types'

function card(id: string, copies: number, roles: CardRole[], origin: CardEntry['origin'] = 'engine'): CardEntry {
  return { id, name: `Card ${id}`, copies, source: 'manual', apiCard: null, origin, roles, needsReview: false }
}

const deck = (): CardEntry[] => [
  card('s1', 3, ['starter']),
  ...Array.from({ length: 37 }, (_, index) => card(`f${index}`, 1, ['enabler'])),
]

describe('comparador: qué reglas se listan', () => {
  it('oculta las reglas con 0 % en las dos builds y las que ninguna build evalúa; deja las que dicen algo', () => {
    const noBricks = createMatcherPattern('2+ Bricks', 'problem', [{ matcher: { type: 'role', value: 'brick' }, quantity: 2, kind: 'include' }])
    const missingCard = createMatcherPattern('Ghost', 'opening', [{ matcher: { type: 'card', value: 'ghost' }, quantity: 1, kind: 'include' }])
    const starter = createMatcherPattern('Mi starter', 'opening', [{ matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' }])

    const comparison = compareBuilds({ name: 'A', cards: deck() }, { name: 'B', cards: deck() }, {
      patterns: [noBricks, missingCard, starter],
      disabledGenericRuleIds: [],
      handSize: 5,
    })
    const names = comparison.rules.map((row) => row.name)

    expect(names).not.toContain('2+ Bricks')
    expect(names).not.toContain('Ghost')
    expect(comparison.rules.every((row) => (row.a ?? 0) > 0 || (row.b ?? 0) > 0)).toBe(true)
    expect(comparison.rules.some((row) => row.id.startsWith('system-'))).toBe(true)
  })
})
