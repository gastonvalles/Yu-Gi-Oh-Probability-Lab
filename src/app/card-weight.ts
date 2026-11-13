/**
 * La carta con peso al arrastrarla («Impacto Ligero», módulo B; la muestra aprobada es «3 · La carta con peso» de /playground): se eleva, crece un 15 % y se inclina según la
 * velocidad del dedo, amortiguada (se acerca un poco por cuadro a la inclinación que pide la velocidad, con tope). Sin el dedo moviéndose, la velocidad se apaga y la carta se
 * endereza. Con movimiento reducido no se inclina. Puro: lo usan la mano (`PracticeHand`) y lo que se arrastra del campo (`use-mat-drag`), cada uno en su `requestAnimationFrame`,
 * escribiendo sólo `transform` (compositor). Lo vigila `card-weight.test.ts`.
 */

import { EASE_IN_OUT, EASE_OUT } from './motion'

/** Cuánto crece la carta levantada y cuánto sube (px). */
export const LIFT_SCALE = 1.15
export const LIFT_RISE = 10
/** Cuántos grados se inclina por cada px/ms de velocidad, el tope, y cuánto se acerca a esa inclinación (y al tamaño que le toca) en cada cuadro: la amortiguación. */
const TILT_PER_SPEED = 30
export const TILT_MAX = 18
const FOLLOW = 0.25
const GROW = 0.35
/** Lo que queda de la velocidad en cada cuadro sin un movimiento nuevo. */
const DECAY = 0.85

export interface Weight {
  /** Dónde estaba el dedo (px) y cuándo (ms, el `timeStamp` del evento). */
  x: number
  y: number
  time: number
  /** Velocidad (px/ms), inclinación (grados) y tamaño de ahora. */
  vx: number
  vy: number
  rx: number
  ry: number
  scale: number
}

export const weightAt = (x: number, y: number, time: number, scale = 1): Weight => ({ x, y, time, vx: 0, vy: 0, rx: 0, ry: 0, scale })

/** Un movimiento del dedo: la velocidad nueva, a medias con la anterior (un evento suelto no la dispara). Muta `weight`: corre en cada `pointermove`. */
export function pushWeight(weight: Weight, x: number, y: number, time: number): void {
  const elapsed = Math.max(1, time - weight.time)

  weight.vx = weight.vx * 0.5 + ((x - weight.x) / elapsed) * 0.5
  weight.vy = weight.vy * 0.5 + ((y - weight.y) / elapsed) * 0.5
  weight.x = x
  weight.y = y
  weight.time = time
}

const clamp = (value: number) => Math.max(-TILT_MAX, Math.min(TILT_MAX, value))

/** Un cuadro: la inclinación y el tamaño se acercan a lo que piden la velocidad y `scale`; la velocidad se apaga. Con `reduced`, derecha y del tamaño de una vez. Muta `weight`. */
export function stepWeight(weight: Weight, scale: number, reduced: boolean): void {
  const tiltX = reduced ? 0 : clamp(-weight.vy * TILT_PER_SPEED)
  const tiltY = reduced ? 0 : clamp(weight.vx * TILT_PER_SPEED)

  weight.rx = reduced ? 0 : weight.rx + (tiltX - weight.rx) * FOLLOW
  weight.ry = reduced ? 0 : weight.ry + (tiltY - weight.ry) * FOLLOW
  weight.scale = reduced ? scale : weight.scale + (scale - weight.scale) * GROW
  weight.vx *= DECAY
  weight.vy *= DECAY
}

/**
 * La pausa del estampado (hitstop): 3 cuadros quietos en lo más alto antes de caer. Es una pausa, no una curva. La usan la carta que espera en su casilla al jugarse (`dropFrames`) y
 * el vuelo en 3D de una carta (`card-lift.ts`).
 */
export const HITSTOP_MS = 50
/** La carta levantada que se juega en la casilla donde esperaba: la pausa, cae y se asienta con un aplastón corto. Toca la casilla a los `DROP_HIT_MS` (ahí va el impacto). */
export const DROP_MS = 260
export const DROP_HIT_MS = 110

/**
 * Los cuadros de esa caída, sobre las propiedades sueltas `scale` y `translate` (no pisan la `transform` de una carta acostada ni su giro al darse vuelta): desde levantada
 * (`LIFT_SCALE`, `rise` px arriba), quieta `HITSTOP_MS`, cae hasta aplastarse un poco (94 %) y vuelve a su tamaño, sin rebotar de más.
 */
export const dropFrames = (rise: number): Keyframe[] => [
  { offset: 0, scale: `${LIFT_SCALE}`, translate: `0 ${-rise}px` },
  { offset: HITSTOP_MS / DROP_MS, scale: `${LIFT_SCALE}`, translate: `0 ${-rise}px`, easing: EASE_IN_OUT },
  { offset: DROP_HIT_MS / DROP_MS, scale: '0.94', translate: '0 0', easing: EASE_OUT },
  { offset: 1, scale: '1', translate: '0 0' },
]

/** Quieta: derecha, sin velocidad y del tamaño que le toca. Quien la anima deja de pedir cuadros hasta el próximo movimiento del dedo. */
export const settled = (weight: Weight, scale: number) =>
  Math.abs(weight.rx) < 0.05 && Math.abs(weight.ry) < 0.05 && Math.abs(weight.vx) < 0.002 && Math.abs(weight.vy) < 0.002 && Math.abs(weight.scale - scale) < 0.002

const round = (value: number) => Math.round(value * 100) / 100

/** La inclinación y el tamaño de ahora, para ir detrás del `translate` de quien arrastra (`extraX`: la que ya pone él, como la de la mano al acercarse al campo). */
export const tiltOf = (weight: Weight, extraX = 0, perspective = 700) =>
  `perspective(${perspective}px) rotateX(${round(weight.rx + extraX)}deg) rotateY(${round(weight.ry)}deg) scale(${Math.round(weight.scale * 1000) / 1000})`
