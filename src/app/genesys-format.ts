import genesysCardData from '../data/genesys-card-data.json'
import type { CardGenesysInfo } from '../types'
import type { DeckBuilderState } from './model'

const GENESYS_POINTS_BY_NAME = genesysCardData.cards as Record<string, number>

export const GENESYS_POINT_CAP = genesysCardData.pointCap
export const GENESYS_DATA_UPDATED_AT = genesysCardData.updatedAt

export function normalizeGenesysCardName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function buildGenesysCardInfo(cardName: string): CardGenesysInfo {
  return {
    points: getGenesysPointsByName(cardName),
  }
}

export function getGenesysPointsByName(cardName: string): number | null {
  const points = GENESYS_POINTS_BY_NAME[normalizeGenesysCardName(cardName)]
  return typeof points === 'number' ? points : null
}

export function isGenesysLegalCardName(cardName: string): boolean {
  return getGenesysPointsByName(cardName) !== null
}

export function calculateGenesysDeckPointTotal(deckBuilder: DeckBuilderState): number {
  return [...deckBuilder.main, ...deckBuilder.extra, ...deckBuilder.side].reduce(
    (total, card) => total + (card.apiCard.genesys.points ?? getGenesysPointsByName(card.name) ?? 0),
    0,
  )
}
