import { describe, expect, it } from 'vitest'

import { buildDerivedDeckGroupMap } from '../app/deck-groups'
import { createMatcherPattern } from '../app/pattern-factory'
import {
  computeHandLayout,
  fanAngle,
  mergeHandOrder,
  moveItem,
  slotIndexAtCenter,
  slotLeft,
} from '../app/practice-hand-layout'
import { buildPracticeDeck, computeRevealSteps, describeRuleCondition, getMatchCardIds, type PracticeHandCard } from '../components/probability/practice'
import type { CardEntry, CardRole } from '../types'

function card(id: string, copies: number, roles: CardRole[]): CardEntry {
  return { id, name: `Card ${id}`, copies, source: 'manual', apiCard: null, origin: 'engine', roles, needsReview: false }
}

describe('layout de la mano', () => {
  it('centra la mano y el tamaño depende de la mano inicial, no de la carta extra', () => {
    const five = computeHandLayout(350, 5, 150)
    const six = computeHandLayout(350, 6, 150, 5)

    expect(six.cardWidth).toBe(five.cardWidth)
    expect(six.step).toBeLessThan(five.step)
    expect(five.startX + five.cardWidth + five.step * 4).toBeLessThanOrEqual(350 + 0.5)
    expect(six.startX + six.cardWidth + six.step * 5).toBeLessThanOrEqual(350 + 0.5)
    expect(five.startX).toBeGreaterThanOrEqual(0)
  })

  it('en pantallas anchas las cartas no superan el máximo y quedan separadas', () => {
    const wide = computeHandLayout(1000, 5, 130)
    expect(wide.cardWidth).toBe(130)
    expect(wide.step).toBeGreaterThanOrEqual(wide.cardWidth * 0.62)
  })

  it('elige el slot más cercano al centro de la carta arrastrada', () => {
    const layout = computeHandLayout(350, 5, 150)
    const center = (index: number) => slotLeft(layout, index) + layout.cardWidth / 2

    expect(slotIndexAtCenter(layout, center(3), 5)).toBe(3)
    expect(slotIndexAtCenter(layout, -500, 5)).toBe(0)
    expect(slotIndexAtCenter(layout, 5000, 5)).toBe(4)
  })

  it('mover y mezclar el orden respeta lo que hizo el usuario', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(mergeHandOrder(['c', 'a'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b'])
    expect(mergeHandOrder(['x', 'a'], ['a'])).toEqual(['a'])
    expect(fanAngle(2, 5, 3)).toBe(0)
    expect(fanAngle(0, 5, 3)).toBeLessThan(0)
  })
})

describe('reglas que aparecen mientras se reparte', () => {
  const cards = [card('s', 3, ['starter']), card('b', 3, ['brick']), card('f', 20, ['combo_piece'])]
  const groups = buildDerivedDeckGroupMap(cards)
  const deck = buildPracticeDeck(cards)
  const pick = (ids: string[]): PracticeHandCard[] =>
    ids.map((id, index) => ({ ...deck.find((entry) => entry.cardId === id)!, drawId: `${id}-${index}` }))
  const starterRule = createMatcherPattern('Starter', 'opening', [{ matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' }])
  const deadRule = createMatcherPattern('2 bricks', 'problem', [{ matcher: { type: 'role', value: 'brick' }, quantity: 2, kind: 'include' }])

  it('cada regla aparece con la carta que la completa', () => {
    const hand = pick(['f', 's', 'f', 'b', 'b'])
    const { result, steps } = computeRevealSteps(hand, [starterRule, deadRule], cards, groups, 'first')

    expect(result.matches.map((match) => match.name).sort()).toEqual(['2 bricks', 'Starter'])
    expect(steps.get(starterRule.id)).toBe(2)
    expect(steps.get(deadRule.id)).toBe(5)
  })

  it('al robar una carta más, las reglas ya mostradas conservan su lugar y las nuevas aparecen al final', () => {
    const first = computeRevealSteps(pick(['f', 's', 'f', 'f', 'f']), [starterRule, deadRule], cards, groups, 'first')
    const second = computeRevealSteps(pick(['f', 's', 'f', 'f', 'f', 'b']), [starterRule, deadRule], cards, groups, 'second', first.steps)

    expect(second.steps.get(starterRule.id)).toBe(2)
    expect(second.steps.has(deadRule.id)).toBe(false)
  })

  it('una regla que ya se cumplía antes de la 6ª no aparece de golpe: se revela con la última carta', () => {
    const first = computeRevealSteps(pick(['f', 'f', 'f', 'f', 'f']), [starterRule], cards, groups, 'first')
    const second = computeRevealSteps(pick(['f', 'f', 's', 'f', 'f', 'f']), [starterRule], cards, groups, 'second', first.steps)

    expect(second.steps.get(starterRule.id)).toBe(6)
  })

  it('encuentra qué cartas de la mano cumplen una regla (todas las copias sirven)', () => {
    const hand = pick(['f', 's', 'b', 's', 'f'])
    const { result } = computeRevealSteps(hand, [starterRule], cards, groups, 'first')
    const ids = getMatchCardIds(result.matches[0]!, hand)

    expect(ids).toHaveLength(2)
    expect(ids.every((id) => hand.find((entry) => entry.drawId === id)!.cardId === 's')).toBe(true)
  })
})

describe('casos de cumplimiento de una regla', () => {
  const cards = [
    card('s1', 3, ['starter']),
    card('s2', 3, ['starter']),
    card('e', 3, ['extender']),
    card('f', 20, ['combo_piece']),
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

  const casesOf = (hand: PracticeHandCard[], rule: typeof starterRule) =>
    computeRevealSteps(hand, [rule], cards, groups, 'first').result.matches[0]!

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

  it('una regla con una sola forma de cumplirse tiene un único caso', () => {
    const hand = pick(['f', 's1', 'f', 'f', 'f'])

    expect(casesOf(hand, starterRule).cases).toHaveLength(1)
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
    ).toBe('Sin reutilizar la misma carta entre condiciones: abrís 1 copia de A y abrís 1 copia de B.')
  })

  it('si el texto no tiene ese formato, lo deja igual', () => {
    expect(describeRuleCondition('Sin requisitos')).toBe('Sin requisitos')
  })
})
