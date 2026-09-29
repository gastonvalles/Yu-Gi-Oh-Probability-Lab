import type { CardEntry } from '../types'

export interface DeckArchetype {
  name: string
  cardIds: string[]
  copies: number
}

/**
 * Una carta es del arquetipo si YGOPRODeck la marca así o si su nombre lo contiene
 * (muchas cartas de soporte nombran al arquetipo sin tenerlo como campo).
 */
export function cardBelongsToArchetype(card: CardEntry, archetype: string): boolean {
  const needle = archetype.trim().toLowerCase()

  if (!needle) {
    return false
  }

  return card.apiCard?.archetype?.toLowerCase() === needle || card.name.toLowerCase().includes(needle)
}

/** Arquetipos presentes en el deck, con sus cartas y copias (más copias primero). */
export function buildDeckArchetypes(cards: CardEntry[]): DeckArchetype[] {
  const names = new Set(
    cards.map((card) => card.apiCard?.archetype?.trim()).filter((name): name is string => Boolean(name)),
  )

  return [...names]
    .map((name) => {
      const members = cards.filter((card) => cardBelongsToArchetype(card, name))
      return {
        name,
        cardIds: members.map((card) => card.id),
        copies: members.reduce((total, card) => total + card.copies, 0),
      }
    })
    .filter((archetype) => archetype.copies > 0)
    .sort((a, b) => b.copies - a.copies || a.name.localeCompare(b.name))
}
