import type { CardEntry, HandPattern } from '../types'

export type DeckModelStatusValue = 'complete' | 'incomplete'

export interface DeckModelStatus {
  status: DeckModelStatusValue
  totalCards: number
  categorizedCards: number
  missingOriginCount: number
  missingRolesCount: number
  needsReviewCount: number
  activePatternCount: number
  completionPercentage: number
}

export function getDeckModelStatus(
  derivedMainCards: CardEntry[],
  activePatterns: HandPattern[],
): DeckModelStatus {
  const totalCards = derivedMainCards.reduce(
    (sum, card) => sum + card.copies,
    0,
  )

  let categorizedCards = 0
  let missingOriginCount = 0
  let missingRolesCount = 0
  let needsReviewCount = 0

  for (const card of derivedMainCards) {
    const copies = card.copies

    if (card.origin === null) {
      missingOriginCount += copies
    }

    if (card.roles.length === 0) {
      missingRolesCount += copies
    }

    if (card.needsReview) {
      needsReviewCount += copies
    }

    // categorizedCards: origen asignado + al menos un rol + needsReview=false
    if (card.origin !== null && card.roles.length > 0 && !card.needsReview) {
      categorizedCards += copies
    }
  }

  const completionPercentage = totalCards > 0
    ? categorizedCards / totalCards
    : 0

  const status: DeckModelStatusValue =
    completionPercentage === 1
    && missingOriginCount === 0
    && missingRolesCount === 0
    && needsReviewCount === 0
      ? 'complete'
      : 'incomplete'

  return {
    status,
    totalCards,
    categorizedCards,
    missingOriginCount,
    missingRolesCount,
    needsReviewCount,
    activePatternCount: activePatterns.length,
    completionPercentage,
  }
}
