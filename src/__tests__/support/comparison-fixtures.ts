import type { CardEntry, CardRole } from '../../types'

export function card(id: string, copies: number, roles: CardRole[]): CardEntry {
  return { id, name: `Card ${id}`, copies, source: 'manual', apiCard: null, origin: 'engine', roles, needsReview: false }
}

export const filler = (count: number) => Array.from({ length: count }, (_, index) => card(`f${index}`, 1, ['enabler']))

// A: 40 cartas con 6 starters, 3 bricks y 3 handtraps. B: 42 cartas, con un starter más y sin bricks: tiene más cartas, así que tiene más manos posibles.
// Las handtraps importan: sin ellas, yendo 2º no hay una sola mano limpia y las cuentas dan 0.
export const DECK_A = [card('s1', 3, ['starter']), card('s2', 3, ['starter']), card('b1', 3, ['brick']), card('h1', 3, ['handtrap']), ...filler(28)]
export const DECK_B = [card('s1', 3, ['starter']), card('s2', 3, ['starter']), card('s3', 3, ['starter']), card('h1', 3, ['handtrap']), ...filler(30)]
export const RULES = { patterns: [], disabledGenericRuleIds: [], handSize: 5 }

// Combinaciones de 5 y 6 cartas de un deck de 40 y de 42.
export const HANDS = { a5: 658_008, a6: 3_838_380, b5: 850_668, b6: 5_245_786 }
