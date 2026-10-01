import { useCallback, useEffect, useMemo, useState } from 'react'

import { mergeHandOrder } from '../../app/practice-hand-layout'
import {
  drawNextCard,
  drawRandomPracticeHand,
  type PracticeHandCard,
  type PracticeHandState,
  type PracticeReveal,
} from './practice'

/** Pausa antes de repartir la primera carta (mientras el mazo se baraja) y entre carta y carta. */
const FIRST_DEAL_MS = 90
const NEXT_DEAL_MS = 55

interface Table {
  hand: PracticeHandState
  reveal: PracticeReveal
}

interface UsePracticeTableOptions {
  deck: PracticeHandCard[]
  handSize: number
  reveal: (cards: PracticeHandCard[], previous?: ReadonlyMap<string, number>) => PracticeReveal
  reducedMotion: boolean
}

/** Mesa de práctica: reparte la mano de a una carta, permite robar la de "ir 2º" y reordenar la mano. */
export function usePracticeTable({ deck, handSize, reveal, reducedMotion }: UsePracticeTableOptions) {
  const [table, setTable] = useState<Table | null>(null)
  const [dealt, setDealt] = useState(0)
  const [order, setOrder] = useState<string[]>([])
  const [shuffleKey, setShuffleKey] = useState(0)

  const deal = useCallback(() => {
    setOrder([])
    setDealt(0)
    setShuffleKey((key) => key + 1)

    if (deck.length < handSize) {
      setTable(null)
      return
    }

    const hand = drawRandomPracticeHand(deck, handSize)
    setTable({ hand, reveal: reveal(hand.hand) })
  }, [deck, handSize, reveal])

  useEffect(() => {
    deal()
  }, [deal])

  const total = table?.hand.hand.length ?? 0

  useEffect(() => {
    if (dealt >= total) {
      return
    }

    if (reducedMotion) {
      setDealt(total)
      return
    }

    const timer = window.setTimeout(() => setDealt((count) => count + 1), dealt === 0 ? FIRST_DEAL_MS : NEXT_DEAL_MS)
    return () => window.clearTimeout(timer)
  }, [dealt, total, reducedMotion])

  const drawSecond = useCallback(() => {
    setTable((current) => {
      if (!current || current.hand.hand.length !== handSize || current.hand.remainingDeck.length === 0) {
        return current
      }

      const hand = drawNextCard(current.hand)
      return { hand, reveal: reveal(hand.hand, current.reveal.steps) }
    })
  }, [handSize, reveal])

  const dealtCards = useMemo(() => table?.hand.hand.slice(0, dealt) ?? [], [table, dealt])
  const orderedCards = useMemo(() => {
    const byId = new Map(dealtCards.map((card) => [card.drawId, card]))
    return mergeHandOrder(order, [...byId.keys()]).map((id) => byId.get(id)!)
  }, [dealtCards, order])

  return {
    hasTable: table !== null,
    /** Todas las cartas de la mano (también las que todavía no se repartieron). */
    allCards: table?.hand.hand ?? [],
    cards: orderedCards,
    dealt,
    isDealt: table !== null && dealt >= total,
    isSecond: total > handSize,
    canDrawSecond: table !== null && total === handSize && dealt >= total && table.hand.remainingDeck.length > 0,
    result: table?.reveal.result ?? null,
    steps: table?.reveal.steps ?? null,
    shuffleKey,
    deal,
    drawSecond,
    reorder: setOrder,
  }
}
