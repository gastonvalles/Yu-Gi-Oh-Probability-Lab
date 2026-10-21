import { spotKey, type StepMove, type StepPlace } from './mat-step-info'
import { locateCard, type MatState } from './practice-mat'

/**
 * Las flechas del tablero chico de un paso (Gastón, 2026-10-21: «en las replays quiero flechas blancas minimalistas que muestren los movimientos de las cartas sobre la
 * miniatura del paso»): de dónde a dónde fue cada carta que se movió, dicho con los lugares del tablero —una casilla (`mz:2`, `emz:0`, `st:4`, `field:0`, como `spotKey`),
 * una pila (`deck`, `extra`, `gy`, `banished`) o la mano (`hand`: la tira de abajo)—. Lo repetido va junto (robar cinco es una flecha con un 5) y un paso lleva pocas,
 * para que el tablero nunca sea un garabato. Cómo se dibujan está en `MatSnapshot`.
 */

/** Un extremo de una flecha: una casilla del campo (`spotKey`), una pila o la mano. */
export type ArrowAnchor = string

export interface MatArrow {
  from: ArrowAnchor
  to: ArrowAnchor
  /** Cuántas cartas hicieron el mismo camino en el paso. */
  count: number
}

/** Cuántas flechas lleva un paso como mucho (las mismas cartas que nombra «Qué se mueve»): las primeras, que empiezan por la carta de la jugada. */
export const MAX_ARROWS = 6

/**
 * Las flechas de un paso, en el orden de sus movimientos (`describeStep`: la carta de la jugada primero), con `after`, la mesa de después. Una carta que aparece (una ficha)
 * o que se va de la mesa (vuelve a su dueño) no lleva flecha: no tiene uno de los dos extremos.
 */
export function matArrows(moves: readonly StepMove[], after: MatState, limit = MAX_ARROWS): MatArrow[] {
  // Debajo de un Xyz es la casilla del Xyz: la de ahora o, si se fue del campo en este mismo paso, la que dejó.
  const xyzAt = (id: string): ArrowAnchor | null => {
    const location = locateCard(after, id)

    if (location?.kind === 'spot') return spotKey(location.spot, location.index)

    const left = moves.find((move) => move.id === id)?.from

    return left?.kind === 'zone' ? spotKey(left.spot, left.n - 1) : null
  }
  const anchorOf = (place: StepPlace | null): ArrowAnchor | null => (place === null ? null : place.kind === 'pile' ? place.pile : place.kind === 'zone' ? spotKey(place.spot, place.n - 1) : xyzAt(place.of))
  const arrows: MatArrow[] = []

  for (const move of moves) {
    const from = anchorOf(move.from)
    const to = anchorOf(move.to)

    if (from === null || to === null || from === to) continue

    const same = arrows.find((arrow) => arrow.from === from && arrow.to === to)

    if (same) same.count += 1
    else arrows.push({ from, to, count: 1 })
  }

  return arrows.slice(0, limit)
}
