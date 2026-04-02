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

export type DeckZoneVisualLayoutMode = 'default' | 'desktop-compact'

export const MAIN_DECK_FIXED_ROW_COUNT = 4
export const MAIN_DECK_BASE_COLUMNS = 10
export const MAIN_DECK_MAX_COLUMNS = 15
export const MAIN_DECK_EXPAND_THRESHOLD = 41
export const DESKTOP_COMPACT_BASE_COLUMNS = 10
export const DESKTOP_COMPACT_EXPANDED_COLUMNS = 12
export const DESKTOP_COMPACT_EXPAND_THRESHOLD = 40

export function buildDeckZoneVisualLayout(
  zone: DeckZone,
  cards: DeckCardInstance[],
  mode: DeckZoneVisualLayoutMode = 'default',
  desktopCompactColumnCount?: number,
): DeckZoneVisualLayout | null {
  if (zone !== 'main' || cards.length === 0) {
    return null
  }

  if (mode === 'desktop-compact') {
    return buildColumnLimitedDeckLayout(
      cards,
      desktopCompactColumnCount ?? getDesktopCompactDeckColumnCount(cards.length),
    )
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

export function buildColumnLimitedDeckLayout(
  cards: DeckCardInstance[],
  columnCount: number,
): DeckZoneVisualLayout {
  const safeColumnCount = Math.max(1, columnCount)
  const rowCount = Math.max(1, Math.ceil(cards.length / safeColumnCount))

  const rows = Array.from({ length: rowCount }, (_, rowIndex) => {
    const startIndex = rowIndex * safeColumnCount
    const rowCards = cards.slice(startIndex, startIndex + safeColumnCount).map((card, offset) => ({
      card,
      index: startIndex + offset,
    }))

    return {
      rowIndex,
      cards: rowCards,
    }
  })

  return {
    columns: safeColumnCount,
    rows,
  }
}

export function getDesktopCompactDeckColumnCount(totalCards: number): number {
  return totalCards > DESKTOP_COMPACT_EXPAND_THRESHOLD
    ? DESKTOP_COMPACT_EXPANDED_COLUMNS
    : DESKTOP_COMPACT_BASE_COLUMNS
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
