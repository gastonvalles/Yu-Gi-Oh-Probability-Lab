import { describe, expect, it } from 'vitest'

import { canGoTo, moveCopy, renumberDeck, sidingProblems, type SideCard, type SideDeck } from '../app/duel-siding'
import type { ApiCardReference } from '../types'

const card = (ygoprodeckId: number, frameType: string, tcg: 'forbidden' | null = null) =>
  ({ ygoprodeckId, frameType, banlist: { tcg, ocg: null, goat: null }, genesys: { points: null } }) as unknown as ApiCardReference

const cards = new Map<string, SideCard>([
  ['card-1-1', { name: 'Monstruo', apiCard: card(1, 'effect') }],
  ['card-1-2', { name: 'Monstruo', apiCard: card(1, 'effect') }],
  ['card-2-1', { name: 'Fusión', apiCard: card(2, 'fusion') }],
  ['card-3-1', { name: 'Hechizo', apiCard: card(3, 'spell') }],
  ['card-4-1', { name: 'Prohibida', apiCard: card(4, 'spell', 'forbidden') }],
])
const deck: SideDeck = { main: ['card-1-1', 'card-1-2'], extra: ['card-2-1'], side: ['card-3-1', 'card-4-1'] }

describe('el siding de un Match', () => {
  it('pasa una copia de una zona a otra y deja intacto el resto', () => {
    const moved = moveCopy(deck, 'side', 0, 'main')

    expect(moved).toEqual({ main: ['card-1-1', 'card-1-2', 'card-3-1'], extra: ['card-2-1'], side: ['card-4-1'] })
    expect(deck.side).toHaveLength(2)
    expect(moveCopy(deck, 'main', 9, 'side')).toBe(deck)
    expect(moveCopy(deck, 'main', 0, 'main')).toBe(deck)
  })

  it('un monstruo del Extra no va al Main ni uno del Main al Extra; el Side acepta todo', () => {
    expect(canGoTo(cards.get('card-2-1'), 'main')).toBe(false)
    expect(canGoTo(cards.get('card-2-1'), 'side')).toBe(true)
    expect(canGoTo(cards.get('card-1-1'), 'extra')).toBe(false)
    expect(canGoTo(cards.get('card-3-1'), 'main')).toBe(true)
    expect(canGoTo(undefined, 'extra')).toBe(true)
  })

  it('dice qué le falta al deck: el Main no baja del mínimo (o de lo que se tenía), los topes y el formato', () => {
    expect(sidingProblems(deck, { main: 2 }, cards, 'unlimited')).toEqual([])
    expect(sidingProblems(moveCopy(deck, 'main', 0, 'side'), { main: 2 }, cards, 'unlimited')).toEqual([{ kind: 'main-small', min: 2, count: 1 }])
    expect(sidingProblems({ ...deck, main: Array.from({ length: 41 }, (_, i) => `x-${i}`) }, { main: 40 }, cards, 'unlimited')).toEqual([])
    expect(sidingProblems({ ...deck, main: Array.from({ length: 61 }, (_, i) => `x-${i}`) }, { main: 40 }, cards, 'unlimited')).toEqual([{ kind: 'main-big', max: 60, count: 61 }])
    expect(sidingProblems({ ...deck, extra: Array.from({ length: 16 }, (_, i) => `x-${i}`) }, { main: 2 }, cards, 'unlimited')).toEqual([{ kind: 'extra-big', max: 15, count: 16 }])

    const withBanned = sidingProblems(moveCopy(deck, 'side', 1, 'main'), { main: 2 }, cards, 'tcg')
    expect(withBanned).toHaveLength(1)
    expect(withBanned[0]).toMatchObject({ kind: 'format' })
  })

  it('al terminar renumera las copias para que cada una tenga su id y arrastra los datos de la carta', () => {
    const moved = moveCopy(moveCopy(deck, 'side', 0, 'main'), 'main', 0, 'side')
    const fresh = renumberDeck({ main: ['card-1-2', 'card-3-1'], extra: ['card-2-1'], side: ['card-1-1'] }, cards)

    expect(moved.side).toContain('card-1-1')
    expect(fresh.deck).toEqual({ main: ['card-1-1', 'card-3-1'], extra: ['card-2-1'], side: ['card-1-2'] })
    expect(fresh.cardsById.get('card-1-2')?.name).toBe('Monstruo')
    expect(fresh.cardsById.get('card-3-1')?.name).toBe('Hechizo')
    expect(new Set([...fresh.deck.main, ...fresh.deck.extra, ...fresh.deck.side]).size).toBe(4)
  })
})
