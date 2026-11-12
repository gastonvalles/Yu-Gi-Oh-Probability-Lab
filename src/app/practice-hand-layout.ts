import { CARD_ASPECT } from './deck-image-layout'

/** Parte de cada carta que queda tapada por la siguiente (0 = una al lado de la otra). */
const OVERLAP_STEP = 0.55

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

/**
 * La mano del duelo automático de escritorio crece con la mesa: desde su carta de siempre (`base` px de ancho) hasta lo que deja el alto libre debajo de ella (`below` px), nunca más que una casilla
 * del campo (`cell`) ni que lo que le da el ancho de la mano (`width`, con `slots` cartas). Devuelve el ancho de la carta y el alto que suma (`extra`): la mano lo descuenta con un margen negativo y
 * crece hacia abajo, así el campo no se corre.
 */
export function growHand({ base, below, cell, width, slots }: { base: number; below: number; cell: number; width: number; slots: number }): { cardWidth: number; extra: number } {
  if (!(width > 0) || !(cell > 0)) return { cardWidth: base, extra: 0 }

  const natural = computeHandLayout(width, slots, Number.POSITIVE_INFINITY).cardWidth
  const from = Math.min(base, natural)
  const cardWidth = Math.max(from, Math.floor(Math.min(cell, natural, base + Math.max(0, below) / CARD_ASPECT)))

  return { cardWidth, extra: (cardWidth - from) * CARD_ASPECT }
}

type Span = { left: number; right: number }

/**
 * Cuánto se aparta tu mano de cada costado de su caja (`box`) para quedar entre tus dos pilas de abajo (el Extra Deck y el Deck) tal como se ven (en 3D la fila de abajo se abre), más `gap`:
 * crecida, con muchas cartas o con una levantada, no las tapa. Sin las dos pilas, 0.
 */
export function handInset(box: Span, piles: ReadonlyArray<Span | null | undefined>, gap: number): number {
  const spans = piles.filter((pile): pile is Span => Boolean(pile)).sort((a, b) => a.left - b.left)
  const [first, last] = [spans[0], spans[spans.length - 1]]

  return spans.length >= 2 && first && last ? Math.max(0, Math.ceil(Math.max(first.right - box.left, box.right - last.left) + gap)) : 0
}

/** Hasta dónde puede bajar tu mano (`floor`): no más que `gap` arriba de lo que tiene debajo a lo ancho de ella (`span`: tu chapa, los botones). Lo de los costados no cuenta. */
export function handFloor(floor: number, span: Span, below: ReadonlyArray<Span & { top: number }>, gap: number): number {
  return below.reduce((min, rect) => (rect.right > span.left && rect.left < span.right ? Math.min(min, rect.top - gap) : min), floor)
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
