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
  card('Garnet B', ['garnet']),
  card('Brick/Garnet C', ['brick', 'garnet']),
  card('Brick que quedó en el deck', ['brick']),
  card('Starter', ['starter']),
]
const groups = buildDerivedDeckGroupMap(cards)
const deck = buildPracticeDeck(cards)
const rule = buildPatternPresets(cards, { dead_cards_problem: '2+ Bricks/Garnets' })
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

describe('explicación de Bricks/Garnets en práctica', () => {
  it('muestra las 3 cartas reales y sólo los nombres presentes en la mano', () => {
    const ids = ['Brick A', 'Garnet B', 'Brick/Garnet C', 'Starter', 'Starter']
    render(board(ids))
    const explanation = screen.getByRole('region', { name: '2+ Bricks/Garnets' })
    expect(within(explanation).getByText('Abrís 3 Bricks/Garnets.')).toBeInTheDocument()
    expect(within(explanation).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Brick A', 'Brick/Garnet C', 'Garnet B'])
    expect(within(explanation).queryByText('Brick que quedó en el deck')).not.toBeInTheDocument()
    const result = resultOf(ids)
    expect(getMatchCardIds(result.problemMatches[0]!, result.hand)).toHaveLength(3)
  })

  it('cuenta dos ejemplares de la misma carta como dos cartas de la mano', () => {
    render(board(['Brick A', 'Brick A', 'Starter', 'Starter', 'Starter']))
    expect(screen.getByText('Abrís 2 Bricks/Garnets.')).toBeInTheDocument()
    expect(screen.getByText('Brick A ×2')).toBeInTheDocument()
  })

  it('cuenta una carta con ambos roles una sola vez y actualiza el total al robar otra', () => {
    const ids = ['Brick A', 'Brick/Garnet C', 'Starter', 'Starter', 'Starter']
    const { rerender } = render(board(ids))
    expect(screen.getByText('Abrís 2 Bricks/Garnets.')).toBeInTheDocument()
    rerender(board([...ids, 'Garnet B']))
    expect(screen.getByText('Abrís 3 Bricks/Garnets.')).toBeInTheDocument()
  })

  it('activa la regla con dos Garnets y no la activa con una sola carta de ambos roles', () => {
    expect(resultOf(['Garnet B', 'Garnet B', 'Starter']).problemMatches).toHaveLength(1)
    expect(resultOf(['Brick/Garnet C', 'Starter', 'Starter']).problemMatches).toHaveLength(0)
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
