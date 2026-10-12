import { describe, expect, it } from 'vitest'

import { buildDerivedDeckGroupMap } from '../app/deck-groups'
import { createMatcherPattern } from '../app/pattern-factory'
import { buildPracticeDeck, cardIdOfDrawId, describeRuleCondition, evaluatePracticeHand, getMatchCardIds, type PracticeHandCard } from '../components/probability/practice'
import type { CardEntry, CardRole } from '../types'

function card(id: string, copies: number, roles: CardRole[]): CardEntry {
  return { id, name: `Card ${id}`, copies, source: 'manual', apiCard: null, origin: 'engine', roles, needsReview: false }
}

describe('copias de la práctica', () => {
  it('numera cada copia y vuelve a la carta desde el id de la copia', () => {
    const deck = buildPracticeDeck([card('card-1', 2, ['starter']), card('card-22', 1, ['brick'])])

    expect(deck.map((entry) => entry.drawId)).toEqual(['card-1-1', 'card-1-2', 'card-22-1'])
    expect(cardIdOfDrawId('card-1-2')).toBe('card-1')
    expect(cardIdOfDrawId('card-22-1')).toBe('card-22')
  })
})

describe('casos de cumplimiento de una regla', () => {
  const cards = [
    card('s1', 3, ['starter']),
    card('s2', 3, ['starter']),
    card('e', 3, ['extender']),
    card('f', 20, ['enabler']),
  ]
  const groups = buildDerivedDeckGroupMap(cards)
  const deck = buildPracticeDeck(cards)
  const pick = (ids: string[]): PracticeHandCard[] =>
    ids.map((id, index) => ({ ...deck.find((entry) => entry.cardId === id)!, drawId: `${id}-${index}` }))
  const starterRule = createMatcherPattern('Starter', 'opening', [{ matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' }])
  const comboRule = createMatcherPattern('Starter + Extender', 'opening', [
    { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
    { matcher: { type: 'role', value: 'extender' }, quantity: 1, kind: 'include' },
  ])

  const casesOf = (hand: PracticeHandCard[], rule: typeof starterRule) => evaluatePracticeHand(hand, [rule], cards, groups, 'first').matches[0]!

  it('una regla con dos formas de cumplirse tiene dos casos y cada uno marca sus cartas', () => {
    const hand = pick(['f', 's1', 's2', 'f', 'f'])
    const match = casesOf(hand, starterRule)

    expect(match.cases).toHaveLength(2)
    const first = getMatchCardIds(match, hand, 0)
    const second = getMatchCardIds(match, hand, 1)

    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)
    expect(first).not.toEqual(second)
    expect(getMatchCardIds(match, hand)).toHaveLength(2)
  })

  it('con condiciones combinadas, cada caso incluye las cartas de todas sus condiciones', () => {
    const hand = pick(['s1', 's2', 'e', 'f', 'f'])
    const match = casesOf(hand, comboRule)

    expect(match.cases).toHaveLength(2)
    expect(getMatchCardIds(match, hand, 0)).toHaveLength(2)
    expect(getMatchCardIds(match, hand, 1)).toHaveLength(2)
  })

  it('una condición de "varias" cartas no se parte en combinaciones: un solo caso con todas las del grupo', () => {
    const twoStarters = createMatcherPattern('2 starters', 'opening', [{ matcher: { type: 'role', value: 'starter' }, quantity: 2, kind: 'include' }])
    const hand = pick(['s1', 's1', 's2', 'f', 'f'])
    const match = casesOf(hand, twoStarters)

    expect(match.cases).toHaveLength(1)
    expect(getMatchCardIds(match, hand, 0)).toHaveLength(3)
    expect(match.cases[0]!.cards).toEqual([
      { cardId: 's1', name: 'Card s1', copies: 2 },
      { cardId: 's2', name: 'Card s2', copies: 1 },
    ])
  })

  it('una regla con una sola forma de cumplirse tiene un único caso, y todas las copias de una carta sirven', () => {
    expect(casesOf(pick(['f', 's1', 'f', 'f', 'f']), starterRule).cases).toHaveLength(1)

    const hand = pick(['f', 's1', 'e', 's1', 'f'])
    const ids = getMatchCardIds(casesOf(hand, starterRule), hand)

    expect(ids).toHaveLength(2)
    expect(ids.every((id) => hand.find((entry) => entry.drawId === id)!.cardId === 's1')).toBe(true)
  })
})

describe('descripción de la regla', () => {
  it('quita el "La regla se cumple si" y deja la condición', () => {
    expect(describeRuleCondition('La regla se cumple si abrís 1 copia de Rol: Starter.')).toBe('Abrís 1 copia de Rol: Starter.')
    expect(describeRuleCondition('La regla se cumple si pasa cualquiera de estas opciones: A o B.')).toBe(
      'Pasa cualquiera de estas opciones: A o B.',
    )
  })

  it('conserva el aviso de no reutilizar cartas', () => {
    expect(
      describeRuleCondition('La regla, sin reutilizar la misma carta entre condiciones, se cumple si abrís 1 copia de A y abrís 1 copia de B.'),
    ).toBe('Sin repetir carta: abrís 1 copia de A y abrís 1 copia de B.')
  })

  it('resume las listas largas de cartas', () => {
    expect(describeRuleCondition('La regla se cumple si abrís 1 copia de (A / B / C / D / E).')).toBe('Abrís 1 copia de (5 cartas).')
    expect(describeRuleCondition('La regla se cumple si abrís 1 copia de (A / B).')).toBe('Abrís 1 copia de (A / B).')
  })

  it('si el texto no tiene ese formato, lo deja igual', () => {
    expect(describeRuleCondition('Sin requisitos')).toBe('Sin requisitos')
  })
})
