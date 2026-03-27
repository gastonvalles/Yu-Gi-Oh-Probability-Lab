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

const MAIN_DECK_FIXED_ROW_COUNT = 4

export function buildDeckZoneVisualLayout(
  zone: DeckZone,
  cards: DeckCardInstance[],
): DeckZoneVisualLayout | null {
  if (zone !== 'main' || cards.length === 0) {
    return null
  }

  return buildFixedRowDeckLayout(cards, MAIN_DECK_FIXED_ROW_COUNT)
}

export function buildFixedRowDeckLayout(
  cards: DeckCardInstance[],
  rowCount: number,
): DeckZoneVisualLayout {
  const safeRowCount = Math.max(1, rowCount)
  const totalCards = cards.length
  const columns = Math.max(1, Math.ceil(totalCards / safeRowCount))
  const cardsPerRowBase = Math.floor(totalCards / safeRowCount)
  const rowsWithExtraCard = totalCards % safeRowCount
  let cursor = 0

  const rows = Array.from({ length: safeRowCount }, (_, rowIndex) => {
    const rowSize = cardsPerRowBase + (rowIndex < rowsWithExtraCard ? 1 : 0)
    const rowCards = cards.slice(cursor, cursor + rowSize).map((card, offset) => ({
      card,
      index: cursor + offset,
    }))

    cursor += rowSize

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
