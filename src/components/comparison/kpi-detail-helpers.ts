import type { DeckCardInstance } from '../../app/model'
import type { CardEditMap } from '../../app/build-comparison-edits'
import type { ApiCardReference, CardRole } from '../../types'

export interface KpiDetailCard {
  ygoprodeckId: number
  name: string
  imageUrlSmall: string | null
  copies: number
  needsReview: boolean
  apiCard: ApiCardReference
}

export interface KpiDetailResult {
  cards: KpiDetailCard[]
  totalCopies: number
  mainDeckSize: number
  /** totalCopies / mainDeckSize, between 0 and 1. 0 when mainDeckSize is 0. */
  percentage: number
}

export type KpiRole = 'starter' | 'handtrap' | 'brick' | 'boardbreaker'

/**
 * Filters main deck cards by role category, deduplicates by ygoprodeckId,
 * and computes copy counts and percentage.
 *
 * - Only processes main deck cards.
 * - For "brick", also includes cards with role "garnet".
 * - If editsMap is provided (Build B), uses edited roles when an entry exists
 *   for a card's ygoprodeckId, instead of the card's original roles.
 * - Deduplicates by ygoprodeckId, summing copies.
 * - Does NOT mutate input data.
 */
export function getKpiDetailCards(
  mainDeck: DeckCardInstance[],
  role: CardRole,
  editsMap?: CardEditMap,
): KpiDetailResult {
  const mainDeckSize = mainDeck.length

  // Determine which roles to match
  const matchRoles: CardRole[] = role === 'brick' ? ['brick', 'garnet'] : [role]

  // Dedupe map: ygoprodeckId → accumulated entry
  const deduped = new Map<number, KpiDetailCard>()

  for (const card of mainDeck) {
    const id = card.apiCard.ygoprodeckId

    // Resolve effective roles: editsMap overrides when present
    const effectiveRoles: CardRole[] =
      editsMap && editsMap.has(id)
        ? editsMap.get(id)!.roles
        : card.roles

    // Check if any effective role matches
    const matches = matchRoles.some((r) => effectiveRoles.includes(r))
    if (!matches) continue

    const existing = deduped.get(id)
    if (existing) {
      existing.copies++
    } else {
      // Determine needsReview: true when card has needsReview AND no edit exists
      const hasEdit = editsMap ? editsMap.has(id) : false
      deduped.set(id, {
        ygoprodeckId: id,
        name: card.name,
        imageUrlSmall: card.apiCard.imageUrlSmall,
        copies: 1,
        needsReview: card.needsReview && !hasEdit,
        apiCard: card.apiCard,
      })
    }
  }

  const cards = Array.from(deduped.values())
  const totalCopies = cards.reduce((sum, c) => sum + c.copies, 0)

  return {
    cards,
    totalCopies,
    mainDeckSize,
    percentage: mainDeckSize > 0 ? totalCopies / mainDeckSize : 0,
  }
}
