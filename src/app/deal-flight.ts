import { EASE_IN_OUT, EASE_OUT, bezierEase } from './motion'

/**
 * El vuelo del mazo a la mano al repartir (`PracticeHand`) en **una** animación: el camino (sale, sube y se agranda, cae con un rebote) y el giro 3D (sale de dorso, queda de canto y
 * se abre del otro lado). Antes el giro iba en otra animación sumada con `composite: 'add'`, que Chromium no compone en la GPU (y arrastraba al hilo principal también el camino):
 * acá se muestrea cada cuadro (~1 cada 16 ms de 460) con las mismas curvas y se encadena en la misma `transform` que daba la suma, así que se ve igual y va entera en la GPU.
 */

/** Dónde está la carta en cada pose del camino (px dentro de la mano), cuánto gira en el plano (°), su escala y su opacidad. */
export interface DealPose {
  x: number
  y: number
  rotate: number
  scale: number
  opacity: number
}

/** Los tres tramos del camino, con la curva de cada uno: hasta arriba con la de los vuelos; la caída y el rebote, frenando. */
const LEGS = [
  { from: 0, to: 0.42, ease: bezierEase(EASE_IN_OUT) },
  { from: 0.42, to: 0.82, ease: bezierEase(EASE_OUT) },
  { from: 0.82, to: 1, ease: bezierEase(EASE_OUT) },
] as const
/** El giro va con la curva de los vuelos de punta a punta. */
const turnEase = bezierEase(EASE_IN_OUT)
/** Cuándo queda de canto (la mitad del giro): con `EASE_IN_OUT` cae antes de la mitad del tiempo. Ahí el dorso se cambia por la cara. */
export const DEAL_EDGE_AT = (() => {
  let low = 0
  let high = 1

  for (let step = 0; step < 40; step++) {
    const middle = (low + high) / 2

    if (turnEase(middle) < 0.5) low = middle
    else high = middle
  }

  return (low + high) / 2
})()
const SAMPLES = 30

const n = (value: number) => Math.round(value * 1000) / 1000

/** El giro en Y a ese momento: de 0 a 90 (de canto) y, del otro lado, de −90 a 0. */
function turnAt(time: number): number {
  const done = turnEase(time)

  return done < 0.5 ? 180 * done : 180 * done - 180
}

function frameAt(poses: readonly DealPose[], time: number, turn: number): Keyframe {
  const index = time >= LEGS[2].from ? 2 : time >= LEGS[1].from ? 1 : 0
  const leg = LEGS[index]
  const done = leg.ease((time - leg.from) / (leg.to - leg.from))
  const a = poses[index]!
  const b = poses[index + 1]!
  const mix = (key: keyof DealPose) => n(a[key] + (b[key] - a[key]) * done)

  return {
    offset: n(time),
    transform: `perspective(700px) translate3d(${mix('x')}px, ${mix('y')}px, 0) rotate(${mix('rotate')}deg) scale(${mix('scale')}) rotateY(${n(turn)}deg)`,
    opacity: mix('opacity'),
  }
}

/** Los cuadros del vuelo entre las cuatro poses (salida, arriba, rebote, su lugar en el abanico), con `easing` lineal entre muestras. */
export function dealFrames(poses: readonly [DealPose, DealPose, DealPose, DealPose]): Keyframe[] {
  const times = [...new Set([...Array.from({ length: SAMPLES + 1 }, (_, index) => index / SAMPLES), LEGS[1].from, LEGS[2].from])].sort((a, b) => a - b)
  const frames: Keyframe[] = []
  let previous = -1

  for (const time of times) {
    // De canto, el giro salta de 90 a −90 en el mismo instante (dos cuadros con el mismo `offset`).
    if (previous < DEAL_EDGE_AT && time > DEAL_EDGE_AT) frames.push(frameAt(poses, DEAL_EDGE_AT, 90), frameAt(poses, DEAL_EDGE_AT, -90))
    frames.push(frameAt(poses, time, turnAt(time)))
    previous = time
  }

  return frames
}
