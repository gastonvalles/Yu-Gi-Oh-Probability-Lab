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

const GRID_WIDTH = MAIN_COLUMNS * CARD_WIDTH + (MAIN_COLUMNS - 1) * CARD_GAP
const CONTENT_WIDTH = GRID_WIDTH + ZONE_PADDING * 2

/**
 * Como en el builder: Main en grilla de 10 y, debajo, Extra y Side apilados, cada uno
 * en una sola fila a todo el ancho; si no entran, las cartas se superponen.
 */
export function computeDeckImageLayout(counts: Record<DeckZone, number>): DeckImageLayout {
  const width = CONTENT_WIDTH + PAGE_PADDING * 2
  const header: Rect = { x: PAGE_PADDING, y: PAGE_PADDING, width: CONTENT_WIDTH, height: HEADER_HEIGHT }
  const zones: ZoneLayout[] = []
  let top = header.y + header.height + SECTION_GAP

  const main = layoutGridZone('main', counts.main, PAGE_PADDING, top)
  zones.push(main)
  top += main.panel.height + SECTION_GAP

  for (const zone of ['extra', 'side'] as const) {
    if (counts[zone] > 0) {
      const strip = layoutStripZone(zone, counts[zone], PAGE_PADDING, top)
      zones.push(strip)
      top += strip.panel.height + SECTION_GAP
    }
  }

  return { width, height: top - SECTION_GAP + PAGE_PADDING, header, zones }
}

function layoutGridZone(zone: DeckZone, cardCount: number, left: number, top: number): ZoneLayout {
  const cardHeight = CARD_WIDTH * CARD_ASPECT
  const rows = Math.max(1, Math.ceil(cardCount / MAIN_COLUMNS))
  const gridTop = top + ZONE_HEADER_HEIGHT
  const cards = Array.from({ length: cardCount }, (_, index) => ({
    x: left + ZONE_PADDING + (index % MAIN_COLUMNS) * (CARD_WIDTH + CARD_GAP),
    y: gridTop + Math.floor(index / MAIN_COLUMNS) * (cardHeight + CARD_GAP),
    width: CARD_WIDTH,
    height: cardHeight,
  }))

  return {
    zone,
    panel: { x: left, y: top, width: CONTENT_WIDTH, height: ZONE_HEADER_HEIGHT + rows * cardHeight + (rows - 1) * CARD_GAP + ZONE_PADDING },
    cards,
  }
}

/** Una fila: con espacio van separadas; si no, se reparte el ancho y se superponen. */
function layoutStripZone(zone: DeckZone, cardCount: number, left: number, top: number): ZoneLayout {
  const cardHeight = CARD_WIDTH * CARD_ASPECT
  const naturalStep = CARD_WIDTH + CARD_GAP
  const step = cardCount > 1 ? Math.min(naturalStep, (GRID_WIDTH - CARD_WIDTH) / (cardCount - 1)) : naturalStep
  const gridTop = top + ZONE_HEADER_HEIGHT
  const cards = Array.from({ length: cardCount }, (_, index) => ({
    x: left + ZONE_PADDING + index * step,
    y: gridTop,
    width: CARD_WIDTH,
    height: cardHeight,
  }))

  return {
    zone,
    panel: { x: left, y: top, width: CONTENT_WIDTH, height: ZONE_HEADER_HEIGHT + cardHeight + ZONE_PADDING },
    cards,
  }
}
