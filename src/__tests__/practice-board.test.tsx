// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildDerivedDeckGroupMap } from '../app/deck-groups'
import { buildPatternPresets } from '../app/pattern-presets'
import { formatOdds, PracticeBoard } from '../components/probability/PracticeBoard'
import { buildPracticeDeck, evaluatePracticeHand, getMatchCardIds } from '../components/probability/practice'
import type { CardEntry, CardRole } from '../types'

afterEach(cleanup)

function card(id: string, roles: CardRole[], copies = 3): CardEntry {
  return { id, name: id, copies, source: 'manual', apiCard: null, origin: 'engine', roles, needsReview: false }
}

const cards = [
  card('Brick A', ['brick']),
  card('Brick B', ['brick']),
  card('Brick C', ['brick']),
  card('Brick que quedó en el deck', ['brick']),
  card('Starter', ['starter']),
]
const groups = buildDerivedDeckGroupMap(cards)
const deck = buildPracticeDeck(cards)
const rule = buildPatternPresets(cards, { dead_cards_problem: '2+ Bricks' })
  .find((preset) => preset.id === 'dead_cards_problem')!.pattern

function resultOf(ids: string[]) {
  const hand = ids.map((id, index) => ({ ...deck.find((entry) => entry.cardId === id)!, drawId: `${id}-${index}` }))
  return { hand, ...evaluatePracticeHand(hand, [rule], cards, groups, 'first') }
}

function board(ids: string[]) {
  const result = resultOf(ids)
  return <PracticeBoard openings={[]} problems={result.problemMatches} activeId={rule.id} caseIndex={0}
          unplayableOdds={null} onToggle={vi.fn()} />
}

describe('explicación de Bricks en práctica', () => {
  it('muestra las 3 cartas reales y sólo los nombres presentes en la mano', () => {
    const ids = ['Brick A', 'Brick B', 'Brick C', 'Starter', 'Starter']
    render(board(ids))
    const explanation = screen.getByRole('region', { name: '2+ Bricks' })
    expect(within(explanation).getByText('Abrís 3 Bricks.')).toBeInTheDocument()
    expect(within(explanation).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Brick A', 'Brick B', 'Brick C'])
    expect(within(explanation).queryByText('Brick que quedó en el deck')).not.toBeInTheDocument()
    const result = resultOf(ids)
    expect(getMatchCardIds(result.problemMatches[0]!, result.hand)).toHaveLength(3)
  })

  it('cuenta dos ejemplares de la misma carta como dos cartas de la mano', () => {
    render(board(['Brick A', 'Brick A', 'Starter', 'Starter', 'Starter']))
    expect(screen.getByText('Abrís 2 Bricks.')).toBeInTheDocument()
    expect(screen.getByText('Brick A ×2')).toBeInTheDocument()
  })

  it('actualiza el total al robar otra carta', () => {
    const ids = ['Brick A', 'Brick B', 'Starter', 'Starter', 'Starter']
    const { rerender } = render(board(ids))
    expect(screen.getByText('Abrís 2 Bricks.')).toBeInTheDocument()
    rerender(board([...ids, 'Brick C']))
    expect(screen.getByText('Abrís 3 Bricks.')).toBeInTheDocument()
  })

  it('activa la regla con dos Bricks y no la activa con uno solo', () => {
    expect(resultOf(['Brick B', 'Brick B', 'Starter']).problemMatches).toHaveLength(1)
    expect(resultOf(['Brick C', 'Starter', 'Starter']).problemMatches).toHaveLength(0)
  })
})

describe('formatOdds', () => {
  it('dice 1 de cada x si es poco frecuente y x de cada 10 si es frecuente', () => {
    expect(formatOdds(0.0413)).toMatch(/^Pasa en 1 de cada 24 manos/)
    expect(formatOdds(0.5)).toMatch(/^Pasa en 1 de cada 2 manos/)
    expect(formatOdds(0.95)).toMatch(/^Pasa en 9 de cada 10 manos/)
    expect(formatOdds(0.62)).toMatch(/^Pasa en 6 de cada 10 manos/)
    expect(formatOdds(0.999)).toMatch(/casi todas las manos/)
  })
})
