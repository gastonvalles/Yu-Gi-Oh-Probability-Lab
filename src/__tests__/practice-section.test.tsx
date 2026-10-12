// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render as renderBare, screen, within, type RenderResult } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useEffect, type ReactElement } from 'react'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMatcherPattern } from '../app/pattern-factory'
import { createMatState, type MatState } from '../app/practice-mat'
import { useMatSession } from '../app/use-mat-session'
import { buildPracticeDeck } from '../components/probability/practice'
import { PracticeSection } from '../components/probability/PracticeSection'
import type { CardEntry, CardRole } from '../types'

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []) }))
vi.mock('../app/lab-odds-client', () => ({ requestLabOdds: vi.fn(() => new Promise(() => {})) }))

function card(id: string, name: string, copies: number, roles: CardRole[]): CardEntry {
  return { id, name, copies, source: 'manual', apiCard: null, origin: 'engine', roles, needsReview: false }
}

const CARDS = [card('card-1', 'Starter', 2, ['starter']), card('card-2', 'Brick', 2, ['brick']), card('card-3', 'Relleno', 6, ['enabler'])]
const PATTERNS = [
  createMatcherPattern('Salida básica', 'opening', [{ matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' }]),
  createMatcherPattern('2 bricks', 'problem', [{ matcher: { type: 'role', value: 'brick' }, quantity: 2, kind: 'include' }]),
]
const DECK = buildPracticeDeck(CARDS)
const CARDS_BY_ID = new Map(DECK.map((entry) => [entry.drawId, { name: entry.name, apiCard: entry.apiCard }]))
// Mano: Starter, Relleno ×3, Brick; el tope del deck es el otro Brick.
const ORDER = ['card-1-1', 'card-3-1', 'card-3-2', 'card-3-3', 'card-2-1', 'card-2-2', 'card-1-2', 'card-3-4', 'card-3-5', 'card-3-6']
const INITIAL = createMatState(ORDER, [], 5)

function Harness({ initial = INITIAL }: { initial?: MatState }) {
  const mat = useMatSession()
  const { start } = mat

  useEffect(() => {
    start(initial)
  }, [start, initial])

  if (!mat.session || !mat.state) {
    return null
  }

  return (
    <PracticeSection
      handSize={5}
      derivedMainCards={CARDS}
      patterns={PATTERNS}
      hasCompletedClassification
      missingOriginCount={0}
      missingRoleCount={0}
      pendingReviewCount={0}
      reviewPendingPatternCount={0}
      session={mat.session}
      state={mat.state}
      cardsById={CARDS_BY_ID}
      deckName="Test"
      onDispatch={mat.dispatch}
      onUndo={mat.undo}
      onSeek={mat.seek}
      onLoadCombo={(combo) => start(combo.initial, combo.actions, combo.names)}
      onNewHand={() => start(INITIAL)}
    />
  )
}

const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const render = (ui: ReactElement): RenderResult => renderBare(<Provider store={store}>{ui}</Provider>)
const hand = () => screen.getByRole('list', { name: 'Mano' })
const pointer = { button: 0, pointerId: 1 }
const tap = (element: HTMLElement) => {
  fireEvent.pointerDown(element, { ...pointer, clientX: 10, clientY: 10 })
  fireEvent.pointerUp(element, { ...pointer, clientX: 10, clientY: 10 })
}

beforeEach(() => {
  localStorage.clear()
  HTMLElement.prototype.setPointerCapture = () => {}
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

describe('la práctica integrada en la mesa', () => {
  it('abre con las cinco cartas en la mano y las salidas debajo, sin veredicto; tocar una salida ilumina sus cartas', () => {
    render(<Harness />)

    expect(within(hand()).getAllByRole('listitem')).toHaveLength(5)

    const openings = screen.getByRole('list', { name: 'Salidas' })
    const chip = within(openings).getByRole('button', { name: 'Salida básica' })
    expect(screen.queryByRole('list', { name: 'Problemas' })).not.toBeInTheDocument()

    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(within(hand()).getByRole('listitem', { name: 'Starter' })).toHaveAttribute('data-glow', 'true')
    expect(within(hand()).getByRole('listitem', { name: 'Brick' })).toHaveAttribute('data-dim', 'true')
    expect(screen.getByRole('region', { name: 'Salida básica' })).toBeInTheDocument()
  })

  it('sin ninguna salida, la mano se ve gris y el chip "Mano no jugable" explica qué faltó', () => {
    // Cinco cartas de relleno: no hay starter.
    render(<Harness initial={createMatState(['card-3-1', 'card-3-2', 'card-3-3', 'card-3-4', 'card-3-5', 'card-1-1', 'card-3-6'], [], 5)} />)

    expect(within(hand()).getAllByRole('listitem', { name: 'Relleno' })[0]).toHaveAttribute('data-muted', 'true')

    const chip = within(screen.getByRole('list', { name: 'Problemas' })).getByRole('button', { name: 'Mano no jugable' })
    expect(chip).toHaveAttribute('aria-pressed', 'true')

    const why = screen.getByRole('region', { name: 'Mano no jugable' })
    expect(within(why).getByText(/Ninguna salida se cumple/)).toBeInTheDocument()
    expect(within(why).getByText('Salida básica:')).toBeInTheDocument()
    expect(within(why).getByText(/Falta/)).toBeInTheDocument()
  })

  it('robar la carta de ir 2º reevalúa la mano inicial: aparece el problema', () => {
    render(<Harness />)

    tap(screen.getByRole('button', { name: 'Deck: 5' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Robar' }))

    expect(within(hand()).getAllByRole('listitem')).toHaveLength(6)
    expect(within(screen.getByRole('list', { name: 'Problemas' })).getByRole('button', { name: '2 bricks' })).toBeInTheDocument()

    // Jugar cartas después no cambia la evaluación: es sobre la mano inicial.
    tap(within(hand()).getByRole('listitem', { name: 'Starter' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Descartar' }))
    expect(within(hand()).getAllByRole('listitem')).toHaveLength(5)
    expect(within(screen.getByRole('list', { name: 'Salidas' })).getByRole('button', { name: 'Salida básica' })).toBeInTheDocument()
  })
})
