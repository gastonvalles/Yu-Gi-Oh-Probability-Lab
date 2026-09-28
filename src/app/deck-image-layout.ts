import type { DeckZone } from './model'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface ZoneLayout {
  zone: DeckZone
  panel: Rect
  cards: Rect[]
}

export interface DeckImageLayout {
  width: number
  height: number
  header: Rect
  zones: ZoneLayout[]
}

// Proporción real de las imágenes de YGOPRODeck (421×614).
export const CARD_ASPECT = 614 / 421
export const CARD_WIDTH = 168
export const CARD_GAP = 8
export const PAGE_PADDING = 32
export const ZONE_PADDING = 16
export const ZONE_HEADER_HEIGHT = 44
export const HEADER_HEIGHT = 84
export const SECTION_GAP = 20

const MAIN_COLUMNS = 10
const SIDE_BY_SIDE_COLUMNS = 5
const SIDE_BY_SIDE_MAX_CARDS = 15

const GRID_WIDTH = MAIN_COLUMNS * CARD_WIDTH + (MAIN_COLUMNS - 1) * CARD_GAP
const CONTENT_WIDTH = GRID_WIDTH + ZONE_PADDING * 2

export function computeDeckImageLayout(counts: Record<DeckZone, number>): DeckImageLayout {
  const width = CONTENT_WIDTH + PAGE_PADDING * 2
  const header: Rect = { x: PAGE_PADDING, y: PAGE_PADDING, width: CONTENT_WIDTH, height: HEADER_HEIGHT }
  const zones: ZoneLayout[] = []
  let top = header.y + header.height + SECTION_GAP

  const main = layoutZone('main', Math.max(counts.main, 1), counts.main, PAGE_PADDING, top, CONTENT_WIDTH, MAIN_COLUMNS)
  zones.push(main)
  top += main.panel.height + SECTION_GAP

  const secondary = (['extra', 'side'] as const).filter((zone) => counts[zone] > 0)
  const sideBySide =
    secondary.length === 2 && secondary.every((zone) => counts[zone] <= SIDE_BY_SIDE_MAX_CARDS)

  if (sideBySide) {
    const panelWidth = (CONTENT_WIDTH - SECTION_GAP) / 2
    const rowSlots = Math.max(counts.extra, counts.side)
    const pair = secondary.map((zone, index) =>
      layoutZone(zone, rowSlots, counts[zone], PAGE_PADDING + index * (panelWidth + SECTION_GAP), top, panelWidth, SIDE_BY_SIDE_COLUMNS),
    )
    zones.push(...pair)
    top += (pair[0]?.panel.height ?? 0) + SECTION_GAP
  } else {
    for (const zone of secondary) {
      const layout = layoutZone(zone, counts[zone], counts[zone], PAGE_PADDING, top, CONTENT_WIDTH, MAIN_COLUMNS)
      zones.push(layout)
      top += layout.panel.height + SECTION_GAP
    }
  }

  return { width, height: top - SECTION_GAP + PAGE_PADDING, header, zones }
}

// rowSlots define la altura del panel (permite igualar paneles lado a lado).
function layoutZone(
  zone: DeckZone,
  rowSlots: number,
  cardCount: number,
  left: number,
  top: number,
  panelWidth: number,
  columns: number,
): ZoneLayout {
  const innerWidth = panelWidth - ZONE_PADDING * 2
  const cardWidth = Math.min(CARD_WIDTH, (innerWidth - (columns - 1) * CARD_GAP) / columns)
  const cardHeight = cardWidth * CARD_ASPECT
  const rows = Math.max(1, Math.ceil(rowSlots / columns))
  const gridTop = top + ZONE_HEADER_HEIGHT
  const gridHeight = rows * cardHeight + (rows - 1) * CARD_GAP
  const cards: Rect[] = []

  for (let index = 0; index < cardCount; index += 1) {
    const row = Math.floor(index / columns)
    const column = index % columns
    const cardsInRow = Math.min(columns, cardCount - row * columns)
    const rowWidth = cardsInRow * cardWidth + (cardsInRow - 1) * CARD_GAP
    // El Main se alinea a la izquierda; Extra/Side centran su última fila.
    const rowLeft = zone === 'main' ? left + ZONE_PADDING : left + (panelWidth - rowWidth) / 2

    cards.push({
      x: rowLeft + column * (cardWidth + CARD_GAP),
      y: gridTop + row * (cardHeight + CARD_GAP),
      width: cardWidth,
      height: cardHeight,
    })
  }

  return {
    zone,
    panel: { x: left, y: top, width: panelWidth, height: ZONE_HEADER_HEIGHT + gridHeight + ZONE_PADDING },
    cards,
  }
}
