import { CARD_ASPECT } from './deck-image-layout'

/** Parte de cada carta que queda tapada por la siguiente (0 = una al lado de la otra). */
const OVERLAP_STEP = 0.62

export interface HandLayout {
  cardWidth: number
  cardHeight: number
  /** Distancia horizontal entre cartas consecutivas. */
  step: number
  /** Dónde empieza la primera carta para que la mano quede centrada. */
  startX: number
}

/**
 * Mano en abanico. El tamaño de carta sale de `sizeSlots` (la mano inicial) y la separación de
 * `slots` (con la carta extra de ir 2º las cartas se juntan, pero no cambian de tamaño).
 */
export function computeHandLayout(width: number, slots: number, maxCardWidth: number, sizeSlots = slots): HandLayout {
  const count = Math.max(1, slots)
  const natural = width / (1 + (Math.max(1, sizeSlots) - 1) * OVERLAP_STEP)
  const cardWidth = Math.max(0, Math.min(maxCardWidth, natural))
  const step = count > 1 ? Math.min(cardWidth * 1.08, (width - cardWidth) / (count - 1)) : 0
  const total = cardWidth + step * (count - 1)

  return { cardWidth, cardHeight: cardWidth * CARD_ASPECT, step, startX: Math.max(0, (width - total) / 2) }
}

export function slotLeft(layout: HandLayout, index: number): number {
  return layout.startX + index * layout.step
}

/** Slot más cercano al centro de la carta arrastrada. */
export function slotIndexAtCenter(layout: HandLayout, centerX: number, count: number): number {
  if (layout.step <= 0) {
    return 0
  }

  const index = Math.round((centerX - layout.cardWidth / 2 - layout.startX) / layout.step)
  return Math.min(Math.max(index, 0), Math.max(0, count - 1))
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items]
  const [item] = next.splice(from, 1)

  if (item !== undefined) {
    next.splice(to, 0, item)
  }

  return next
}

/** Respeta el orden que el usuario dio a la mano y agrega las cartas nuevas al final. */
export function mergeHandOrder(order: readonly string[], ids: readonly string[]): string[] {
  const present = new Set(ids)
  const kept = order.filter((id) => present.has(id))
  const known = new Set(kept)
  return [...kept, ...ids.filter((id) => !known.has(id))]
}

/** Inclinación del abanico: más hacia los costados, nada en el centro. */
export function fanAngle(index: number, slots: number, degreesPerSlot: number): number {
  return (index - (slots - 1) / 2) * degreesPerSlot
}
