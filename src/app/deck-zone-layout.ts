import type { DeckCardInstance, DeckZone } from './model'

export interface DeckZoneRowCard {
  card: DeckCardInstance
  index: number
}

export interface DeckZoneRowLayout {
  rowIndex: number
  cards: DeckZoneRowCard[]
}

export interface DeckZoneVisualLayout {
  columns: number
  rows: DeckZoneRowLayout[]
}

export const MAIN_DECK_FIXED_ROW_COUNT = 4
export const MAIN_DECK_BASE_COLUMNS = 10
export const MAIN_DECK_MAX_COLUMNS = 15
export const MAIN_DECK_EXPAND_THRESHOLD = 41

export function buildDeckZoneVisualLayout(
  zone: DeckZone,
  cards: DeckCardInstance[],
): DeckZoneVisualLayout | null {
  if (zone !== 'main' || cards.length === 0) {
    return null
  }

  return buildFixedRowDeckLayout(
    cards,
    MAIN_DECK_FIXED_ROW_COUNT,
    getMainDeckColumnCount(cards.length),
  )
}

export function buildFixedRowDeckLayout(
  cards: DeckCardInstance[],
  rowCount: number,
  columnCount?: number,
): DeckZoneVisualLayout {
  const safeRowCount = Math.max(1, rowCount)
  const totalCards = cards.length
  const columns = columnCount ?? Math.max(1, Math.ceil(totalCards / safeRowCount))

  const rows = Array.from({ length: safeRowCount }, (_, rowIndex) => {
    const startIndex = rowIndex * columns
    const rowCards = cards.slice(startIndex, startIndex + columns).map((card, offset) => ({
      card,
      index: startIndex + offset,
    }))

    return {
      rowIndex,
      cards: rowCards,
    }
  })

  return {
    columns,
    rows,
  }
}

function getMainDeckColumnCount(totalCards: number): number {
  if (totalCards < MAIN_DECK_EXPAND_THRESHOLD) {
    return MAIN_DECK_BASE_COLUMNS
  }

  return Math.min(
    MAIN_DECK_MAX_COLUMNS,
    Math.max(MAIN_DECK_BASE_COLUMNS + 1, Math.ceil(totalCards / MAIN_DECK_FIXED_ROW_COUNT)),
  )
}
