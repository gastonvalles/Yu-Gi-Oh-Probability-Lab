import { EASE_IN_OUT, EASE_OUT, bezierEase } from './motion'
import { DECK_SHUFFLE_MS } from './shuffle-fx'

/**
 * El vuelo del mazo a la mano al repartir (`PracticeHand`) en **una** animación: un solo camino, una curva baja del mazo a su lugar en el abanico que arranca rápido y llega
 * despacio, mientras se da vuelta (sale de dorso, queda de canto y se abre del otro lado); al llegar, un asentamiento corto (apenas más grande y a su tamaño). Sin rebote ni
 * parada arriba. El giro va en la misma `transform` que el camino (sumado con `composite: 'add'` no se compone en la GPU): se muestrea cada cuadro (~1 cada 13 ms).
 */

/** Pausa antes de repartir la primera carta de una mano nueva (el mazo se baraja antes: se lo ve terminar y golpearse contra la mesa) y entre carta y carta (el ritmo de quien reparte). */
export const FIRST_DEAL_MS = DECK_SHUFFLE_MS + 140
export const NEXT_DEAL_MS = 100

/** Dónde está la carta (px dentro de la mano), cuánto gira en el plano (°), su escala y su opacidad. */
export interface DealPose {
  x: number
  y: number
  rotate: number
  scale: number
  opacity: number
}

/** Cuándo aterriza en su lugar (fracción del vuelo); lo que sigue es el asentamiento. */
export const DEAL_LAND_AT = 0.8
/** Cuánto más grande llega antes de asentarse. */
const LAND_SCALE = 1.04
const pathEase = bezierEase(EASE_OUT)
/** El giro va con la curva de los vuelos, de la salida al aterrizaje. */
const turnEase = bezierEase(EASE_IN_OUT)
/** Cuándo queda de canto (la mitad del giro). Ahí el dorso se cambia por la cara. */
export const DEAL_EDGE_AT = (() => {
  let low = 0
  let high = 1

  for (let step = 0; step < 40; step++) {
    const middle = (low + high) / 2

    if (turnEase(middle) < 0.5) low = middle
    else high = middle
  }

  return Math.round(((low + high) / 2) * DEAL_LAND_AT * 1000) / 1000
})()
const SAMPLES = 30

const n = (value: number) => Math.round(value * 1000) / 1000

/** El giro en Y a ese momento: de 0 a 90 (de canto) y, del otro lado, de −90 a 0. */
function turnAt(time: number): number {
  const done = turnEase(Math.min(1, time / DEAL_LAND_AT))

  return done < 0.5 ? 180 * done : 180 * done - 180
}

function frameAt(from: DealPose, to: DealPose, arc: number, time: number, turn: number): Keyframe {
  const flying = time < DEAL_LAND_AT
  const done = flying ? pathEase(time / DEAL_LAND_AT) : 1
  const settle = flying ? 0 : pathEase((time - DEAL_LAND_AT) / (1 - DEAL_LAND_AT))
  const mix = (key: keyof DealPose) => from[key] + (to[key] - from[key]) * done
  const scale = flying ? from.scale + (LAND_SCALE - from.scale) * done : LAND_SCALE + (to.scale - LAND_SCALE) * settle

  return {
    offset: n(time),
    transform: `perspective(700px) translate3d(${n(mix('x'))}px, ${n(mix('y') - arc * 4 * done * (1 - done))}px, 0) rotate(${n(mix('rotate'))}deg) scale(${n(scale)}) rotateY(${n(turn)}deg)`,
    opacity: n(mix('opacity')),
  }
}

/** Los cuadros del vuelo de `from` (el mazo) a `to` (su lugar), con `arc` px de curva hacia arriba, en `easing` lineal entre muestras. */
export function dealFrames(from: DealPose, to: DealPose, arc: number): Keyframe[] {
  const times = [...new Set([...Array.from({ length: SAMPLES + 1 }, (_, index) => index / SAMPLES), DEAL_LAND_AT])].sort((a, b) => a - b)
  const frames: Keyframe[] = []
  let previous = -1

  for (const time of times) {
    // De canto, el giro salta de 90 a −90 en el mismo instante (dos cuadros con el mismo `offset`).
    if (previous < DEAL_EDGE_AT && time > DEAL_EDGE_AT) frames.push(frameAt(from, to, arc, DEAL_EDGE_AT, 90), frameAt(from, to, arc, DEAL_EDGE_AT, -90))
    frames.push(frameAt(from, to, arc, time, turnAt(time)))
    previous = time
  }

  return frames
}
