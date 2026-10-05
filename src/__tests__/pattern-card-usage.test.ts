import { describe, expect, it } from 'vitest'

import { getCopiesUsedByOtherConditions, getMaxConditionQuantity, getRemainingCopies } from '../app/pattern-card-usage'
import { createMatcherPattern } from '../app/pattern-factory'
import type { CardEntry } from '../types'

const card = (id: string, copies: number, roles: CardEntry['roles'] = []): CardEntry => ({
  id, name: id, copies, source: 'manual', apiCard: null, origin: 'engine', roles, needsReview: false,
})
const cards = [card('saji', 1), card('ritual', 3), card('prayers', 3), card('filler', 30)]

const pattern = (allowShared: boolean) =>
  createMatcherPattern(
    'Saji + algo',
    'opening',
    [
      { matcher: { type: 'card', value: 'saji' }, quantity: 1, kind: 'include' },
      { matcher: { type: 'card_pool', value: ['ritual', 'prayers'] }, quantity: 1, kind: 'include' },
    ],
    { allowSharedCards: allowShared },
  )

describe('cartas ya usadas por otras condiciones', () => {
  it('una carta de una sola copia usada en otra condición queda sin copias', () => {
    const p = pattern(false)
    const used = getCopiesUsedByOtherConditions(p, p.conditions[1]!.id, cards)

    expect(used.get('saji')).toBe(1)
    expect(getRemainingCopies(cards[0]!, used)).toBe(0)
    expect(getRemainingCopies(cards[1]!, used)).toBe(3)
  })

  it('una carta con varias copias sólo pierde las que ya se llevó la otra condición', () => {
    const p = createMatcherPattern('x', 'opening', [
      { matcher: { type: 'card', value: 'ritual' }, quantity: 2, kind: 'include' },
      { matcher: { type: 'card_pool', value: ['ritual', 'filler'] }, quantity: 1, kind: 'include' },
    ])
    const used = getCopiesUsedByOtherConditions(p, p.conditions[1]!.id, cards)

    expect(getRemainingCopies(cards[1]!, used)).toBe(1)
  })

  it('si la regla permite compartir cartas no se descuenta nada', () => {
    const p = pattern(true)

    expect(getCopiesUsedByOtherConditions(p, p.conditions[1]!.id, cards).size).toBe(0)
  })

  it('un pool sólo agota sus cartas si la cantidad pedida alcanza para todas', () => {
    const p = createMatcherPattern('x', 'opening', [
      { matcher: { type: 'card_pool', value: ['ritual', 'prayers'] }, quantity: 6, kind: 'include' },
      { matcher: { type: 'card', value: 'ritual' }, quantity: 1, kind: 'include' },
    ])
    const used = getCopiesUsedByOtherConditions(p, p.conditions[1]!.id, cards)

    expect(used.get('ritual')).toBe(3)
    expect(used.get('prayers')).toBe(3)
  })

  it('el tope de cantidad respeta las copias reales del deck', () => {
    const p = pattern(false)
    const none = new Map<string, number>()

    expect(getMaxConditionQuantity(p.conditions[0]!, cards, none)).toBe(1)
    expect(getMaxConditionQuantity(p.conditions[1]!, cards, none)).toBe(6)
    expect(getMaxConditionQuantity({ ...p.conditions[1]!, distinct: true }, cards, none)).toBe(2)
    expect(getMaxConditionQuantity({ ...p.conditions[1]!, matcher: null }, cards, none)).toBe(60)
  })
})
