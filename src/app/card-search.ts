import type { ApiCardReference } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'

export function buildCompactSearchDescription(card: ApiCardReference | ApiCardSearchResult): string {
  const typeLabel = typeof card.cardType === 'string' && card.cardType.trim().length > 0 ? card.cardType : 'Carta'
  return [typeLabel, card.archetype ? `Arquetipo: ${card.archetype}` : ''].filter(Boolean).join(' · ')
}

export function formatSearchError(message: string): string {
  const normalizedMessage = message.toLowerCase()

  if (normalizedMessage.includes('no card matching your query')) {
    return 'No se encontraron cartas para esa búsqueda.'
  }

  return 'No se pudo completar la búsqueda.'
}

export function sortSearchResults(results: ApiCardSearchResult[]): ApiCardSearchResult[] {
  return [...results].sort((left, right) => {
    const rankDifference = getSearchTypeRank(left) - getSearchTypeRank(right)

    if (rankDifference !== 0) {
      return rankDifference
    }

    const nameDifference = left.name.localeCompare(right.name)

    if (nameDifference !== 0) {
      return nameDifference
    }

    return left.ygoprodeckId - right.ygoprodeckId
  })
}

function getSearchTypeRank(card: ApiCardReference | ApiCardSearchResult): number {
  const frameType = typeof card.frameType === 'string' ? card.frameType.toLowerCase() : ''
  const cardType = typeof card.cardType === 'string' ? card.cardType.toLowerCase() : ''

  if (frameType.includes('link')) {
    return 0
  }

  if (frameType.includes('fusion')) {
    return 1
  }

  if (frameType.includes('xyz')) {
    return 2
  }

  if (frameType.includes('synchro')) {
    return 3
  }

  if (frameType.includes('ritual')) {
    return 4
  }

  if (frameType.includes('effect') || cardType.includes('effect')) {
    return 5
  }

  if (frameType.includes('normal') || cardType.includes('normal')) {
    return 6
  }

  if (frameType.includes('spell') || cardType.includes('spell')) {
    return 7
  }

  if (frameType.includes('trap') || cardType.includes('trap')) {
    return 8
  }

  return 9
}
