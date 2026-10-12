import { DESKTOP_COMPACT_MAIN_EXPAND_THRESHOLD, getDesktopCompactDeckColumnCount } from './deck-zone-layout'
import type { DeckZone } from './model'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface ZoneLayout {
  zone: DeckZone
  /** Fila del título (punto, nombre, conteos). */
  header: Rect
  /** Superficie con las cartas (la caja redondeada del builder). */
  panel: Rect
  cards: Rect[]
}

export interface DeckImageLayout {
  width: number
  height: number
  zones: ZoneLayout[]
}

// Proporción real de las imágenes de YGOPRODeck (421×614).
const CARD_ASPECT = 614 / 421
/** Ancho lógico de las zonas: el builder clásico en una pantalla ancha. */
const SURFACE_WIDTH = 1500
export const PAGE_PADDING = 24
const ZONE_GAP = 18
const HEADER_HEIGHT = 34
const HEADER_GAP = 7
/** En el builder cada carta de un rail (Extra/Side) y del Main expandido mide el 10 % del ancho. */
const SLOT_FRACTION = 0.1
/** Extra y Side entran hasta 10 cartas sin superponerse; de ahí en más se reparten el ancho. */
const RAIL_FREE_SLOTS = 10
const EMPTY_PANEL_HEIGHT = 56

/**
 * La misma composición que el builder clásico, sin los controles: Main en grilla (10 por fila, o 15
 * superpuestas pasadas las 40 cartas) y, debajo, Extra y Side en una sola fila cada uno.
 */
export function computeDeckImageLayout(counts: Record<DeckZone, number>): DeckImageLayout {
  const zones: ZoneLayout[] = []
  let top = PAGE_PADDING

  for (const zone of ['main', 'extra', 'side'] as const) {
    if (zone !== 'main' && counts[zone] === 0) {
      continue
    }

    const layout = zone === 'main' ? layoutMainZone(counts.main, top) : layoutRailZone(zone, counts[zone], top)
    zones.push(layout)
    top = layout.panel.y + layout.panel.height + ZONE_GAP
  }

  return { width: SURFACE_WIDTH + PAGE_PADDING * 2, height: top - ZONE_GAP + PAGE_PADDING, zones }
}

function layoutMainZone(cardCount: number, top: number): ZoneLayout {
  const columns = getDesktopCompactDeckColumnCount('main', cardCount)
  const overlaps = cardCount > DESKTOP_COMPACT_MAIN_EXPAND_THRESHOLD
  const cardWidth = overlaps ? SURFACE_WIDTH * SLOT_FRACTION : SURFACE_WIDTH / columns
  const step = overlaps ? (SURFACE_WIDTH - cardWidth) / (columns - 1) : cardWidth
  const cardHeight = cardWidth * CARD_ASPECT
  const rows = Math.max(1, Math.ceil(cardCount / columns))
  const header: Rect = { x: PAGE_PADDING, y: top, width: SURFACE_WIDTH, height: HEADER_HEIGHT }
  const panelTop = top + HEADER_HEIGHT + HEADER_GAP
  const cards = Array.from({ length: cardCount }, (_, index) => ({
    x: PAGE_PADDING + (index % columns) * step,
    y: panelTop + Math.floor(index / columns) * cardHeight,
    width: cardWidth,
    height: cardHeight,
  }))

  return {
    zone: 'main',
    header,
    panel: { x: PAGE_PADDING, y: panelTop, width: SURFACE_WIDTH, height: cardCount === 0 ? EMPTY_PANEL_HEIGHT : rows * cardHeight },
    cards,
  }
}

/** Una fila: cada carta mide el 10 % del ancho; con más de 10 se reparten el ancho y se superponen. */
function layoutRailZone(zone: DeckZone, cardCount: number, top: number): ZoneLayout {
  const cardWidth = SURFACE_WIDTH * SLOT_FRACTION
  const cardHeight = cardWidth * CARD_ASPECT
  const step = cardCount > RAIL_FREE_SLOTS ? (SURFACE_WIDTH - cardWidth) / (cardCount - 1) : cardWidth
  const header: Rect = { x: PAGE_PADDING, y: top, width: SURFACE_WIDTH, height: HEADER_HEIGHT }
  const panelTop = top + HEADER_HEIGHT + HEADER_GAP
  const cards = Array.from({ length: cardCount }, (_, index) => ({
    x: PAGE_PADDING + index * step,
    y: panelTop,
    width: cardWidth,
    height: cardHeight,
  }))

  return {
    zone,
    header,
    panel: { x: PAGE_PADDING, y: panelTop, width: SURFACE_WIDTH, height: cardHeight },
    cards,
  }
}
