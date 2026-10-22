import { fireEvent } from '@testing-library/react'

/**
 * jsdom no hace layout: así se ve el tablero del creador de tier lists en las pruebas del arrastre de cartas. El tablero arranca en (0, 0) y cada fila donde se suelta (`data-tier-drop`, en el
 * orden del tablero: S a F y la bandeja) es una franja de 1000 px de ancho, una abajo de otra; adentro, renglones de 100 px de alto con cuatro cartas de 90 px, separadas 10 px, desde x = 100
 * (antes va el recuadro de color). Una fila sin cartas mide un renglón. Lo demás (el tablero y lo que no es ni fila ni carta) mide desde (0, 0).
 */
export const TIER_LAYOUT = { cardsLeft: 100, column: 100, line: 100, perLine: 4, card: 90, width: 1000 } as const

const box = (left: number, top: number, width: number, height: number) => ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}) }) as DOMRect

function layout(element: Element): DOMRect {
  const { cardsLeft, column, line, perLine, card, width } = TIER_LAYOUT
  const zones = [...element.ownerDocument.querySelectorAll('[data-tier-drop]')]
  const heightOf = (zone: Element) => Math.max(1, Math.ceil(zone.querySelectorAll('[data-tier-card-id]').length / perLine)) * line
  const topOf = (zone: Element) => zones.slice(0, zones.indexOf(zone)).reduce((sum, previous) => sum + heightOf(previous), 0)

  if (element.matches('[data-tier-drop]')) return box(0, topOf(element), width, heightOf(element))

  const tile = element.closest('[data-tier-card-id]')
  const zone = tile?.closest('[data-tier-drop]')

  if (tile && zone) {
    const index = [...zone.querySelectorAll('[data-tier-card-id]')].indexOf(tile)

    return box(cardsLeft + (index % perLine) * column, topOf(zone) + Math.floor(index / perLine) * line, card, card)
  }

  return box(0, 0, width, 2000)
}

/** Pone el layout de arriba (y un `scrollBy` que anota cada desplazamiento en `scrolls`, para ver el auto-desplazamiento) y devuelve cómo sacarlo. */
export function mockTierLayout(): { scrolls: Array<[number, number]>; restore: () => void } {
  const original = Element.prototype.getBoundingClientRect
  const originalScrollBy = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollBy')
  const scrolls: Array<[number, number]> = []

  Element.prototype.getBoundingClientRect = function (this: Element) {
    return layout(this)
  }
  Object.defineProperty(Element.prototype, 'scrollBy', { configurable: true, value: (x: number, y: number) => void scrolls.push([x, y]) })

  return {
    scrolls,
    restore: () => {
      Element.prototype.getBoundingClientRect = original

      if (originalScrollBy) Object.defineProperty(Element.prototype, 'scrollBy', originalScrollBy)
      else Reflect.deleteProperty(Element.prototype, 'scrollBy')
    },
  }
}

/** El centro de un elemento, en la ventana (con el layout de arriba). */
export function centerOf(element: Element): { x: number; y: number } {
  const rect = element.getBoundingClientRect()

  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

/** Dónde se ve el fantasma de la carta que se arrastra y la línea donde entra (van sueltos en el `<body>`). */
export const dragGhost = () => document.body.querySelector<HTMLElement>(':scope > .fixed.opacity-70')
export const insertionLine = () => document.body.querySelector<HTMLElement>(':scope > .fixed.bg-info')

interface Point {
  x: number
  y: number
}

/**
 * Arrastra una carta con el mouse como el navegador: `pointerdown` en la carta, los movimientos (llegan a la ventana), el `pointerup` donde se suelta y el clic que el navegador le manda a la carta
 * (con el puntero capturado, el clic va a la que se apretó). `from` es dónde se la agarra (su centro si no se dice).
 */
export function mouseDrag(tile: HTMLElement, to: Point, { from = centerOf(tile), pointerId = 1, steps = 3 }: { from?: Point; pointerId?: number; steps?: number } = {}) {
  fireEvent.pointerDown(tile, { pointerId, pointerType: 'mouse', button: 0, buttons: 1, clientX: from.x, clientY: from.y })

  for (let step = 1; step <= steps; step += 1) {
    fireEvent.pointerMove(tile, { pointerId, pointerType: 'mouse', buttons: 1, clientX: from.x + ((to.x - from.x) * step) / steps, clientY: from.y + ((to.y - from.y) * step) / steps })
  }

  fireEvent.pointerUp(tile, { pointerId, pointerType: 'mouse', button: 0, clientX: to.x, clientY: to.y })
  fireEvent.click(tile)
}
