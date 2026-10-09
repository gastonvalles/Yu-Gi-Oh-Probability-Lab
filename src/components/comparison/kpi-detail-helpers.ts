import type { DeckCardInstance } from '../../app/model'
import type { ApiCardReference, CardOrigin, CardRole } from '../../types'

/** Clasificación editada por carta (id de YGOPRODeck), aplicada encima de la del deck. */
export type CardEditMap = Map<number, { origin: CardOrigin; roles: CardRole[] }>

interface KpiDetailCard {
  ygoprodeckId: number
  name: string
  imageUrlSmall: string | null
  copies: number
  needsReview: boolean
  apiCard: ApiCardReference
}

interface KpiDetailResult {
  cards: KpiDetailCard[]
  totalCopies: number
  mainDeckSize: number
  /** totalCopies / mainDeckSize, between 0 and 1. 0 when mainDeckSize is 0. */
  percentage: number
}

/**
 * Filters main deck cards that have any of the given roles, deduplicates by ygoprodeckId,
 * and computes copy counts and percentage.
 *
 * - Only processes main deck cards.
 * - If editsMap is provided (Build B), uses edited roles when an entry exists
 *   for a card's ygoprodeckId, instead of the card's original roles.
 * - Deduplicates by ygoprodeckId, summing copies.
 * - Does NOT mutate input data.
 */
export function getKpiDetailCards(
  mainDeck: DeckCardInstance[],
  matchRoles: readonly CardRole[],
  editsMap?: CardEditMap,
): KpiDetailResult {
  const mainDeckSize = mainDeck.length

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
