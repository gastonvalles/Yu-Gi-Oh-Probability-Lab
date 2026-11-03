import { EASE_IN_OUT, EASE_OUT, EASE_SNAP, bezierEase, cancelWhenDone, easeInOut } from '../../app/motion'
import { FLIGHT_MS, LANDING_AT } from '../../app/use-card-flights'

/**
 * Los cuadros de la propuesta de movimiento (`/playground`, sección «Movimiento»): todavía no van a ninguna pantalla. Todo es Web Animations en `replace` que anima sólo
 * `transform`/`translate`/`scale` y `opacity` (el compositor, sin escribir `style` en ningún cuadro), con las tres curvas de `app/motion.ts`: la que no se puede poner en
 * `easing` va adentro de los cuadros, muestreados (como `dealFrames`). Cada movimiento va en su elemento: el de afuera vuela, el de adentro se inclina, el brillo y la sombra
 * son capas ya dibujadas. Lo vigila `motion-proposal.test.ts`.
 */

/** Dónde arranca la carta, medido desde su lugar (FLIP): el corrimiento y la escala que la ponen donde estaba. */
export interface FlightStart {
  x: number
  y: number
  scale: number
}

/** Dura lo mismo que el vuelo de hoy (`FLIGHT_MS`) y toca su casilla en el mismo momento (`LANDING_AT`): el destello de la invocación y los materiales de un Xyz lo esperan. */
export const LIFT_FLIGHT_MS = FLIGHT_MS
/** Cuánto se levanta de la mesa a mitad de camino (px hacia arriba) y cuánto se agranda (más cerca). */
const LIFT_PX = 44
const LIFT_SCALE = 1.18
/** Cuánto se inclina hacia atrás (la cabeza se aleja), cuánto gira de costado y cuánto en el plano, en grados, en lo más alto. */
const TILT_X = 32
const TILT_Y = -10
const SPIN = -7
/** El golpe al tocar la casilla: se aplasta hasta esto y vuelve, en lo que queda del vuelo. */
const SQUASH = 0.93
const SAMPLES = 32
const snap = bezierEase(EASE_SNAP)
const out = bezierEase(EASE_OUT)
const n = (value: number) => Math.round(value * 1000) / 1000

/** Los momentos de los cuadros (de 0 a 1), con el del toque (`LANDING_AT`) entre ellos. */
const TIMES = [...new Set([...Array.from({ length: SAMPLES + 1 }, (_, index) => index / SAMPLES), LANDING_AT])].sort((a, b) => a - b)

/** Cuánto está levantada (0 a 1): sube y cae como una parábola en el tiempo, así llega rápido a la mesa (el golpe) aunque el camino frene. */
const liftAt = (time: number) => {
  const air = Math.min(1, time / LANDING_AT)

  return 4 * air * (1 - air)
}
/** Lo que queda después del toque (0 a 1). */
const settleAt = (time: number) => (time <= LANDING_AT ? 0 : (time - LANDING_AT) / (1 - LANDING_AT))

/** Lo de afuera: el camino (con la curva de los vuelos), lo que sube y se agranda al levantarse, y el aplastón del golpe. */
export function liftPathFrames(from: FlightStart): Keyframe[] {
  return TIMES.map((time) => {
    const done = easeInOut(Math.min(1, time / LANDING_AT))
    const lift = liftAt(time)
    const squash = 1 - (1 - SQUASH) * Math.sin(Math.PI * snap(settleAt(time)))
    const scale = (from.scale + (1 - from.scale) * done) * (1 + (LIFT_SCALE - 1) * lift) * squash

    return { offset: n(time), transform: `translate(${n(from.x * (1 - done))}px, ${n(from.y * (1 - done) - LIFT_PX * lift)}px) scale(${n(scale)})` }
  })
}

/** Lo de adentro: se inclina con perspectiva mientras está en el aire y cae plana. */
export function liftTiltFrames(): Keyframe[] {
  return TIMES.map((time) => {
    const lift = liftAt(time)
    // El giro de costado va un poco adelantado: arranca girando y se endereza para caer.
    const turn = Math.sin(Math.PI * Math.min(1, time / LANDING_AT)) * (1 - 0.4 * Math.min(1, time / LANDING_AT))

    return { offset: n(time), transform: `perspective(600px) rotateX(${n(TILT_X * lift)}deg) rotateY(${n(TILT_Y * turn)}deg) rotate(${n(SPIN * turn)}deg)` }
  })
}

/** El brillo (una franja ya dibujada) cruza la carta mientras se inclina: se ve más cuanto más alta va. */
export function liftGlossFrames(): Keyframe[] {
  return TIMES.map((time) => ({ offset: n(time), translate: `${n(-70 + 140 * Math.min(1, time / LANDING_AT))}% 0`, opacity: n(0.85 * liftAt(time)) }))
}

/** La sombra (ya dibujada, debajo de la carta): se aleja y se agranda al subir y vuelve debajo al caer; quieta en la casilla no se ve. */
export function liftShadowFrames(): Keyframe[] {
  return TIMES.map((time) => {
    const lift = liftAt(time)
    const shown = Math.min(1, time / 0.12) * (1 - out(settleAt(time)))

    return { offset: n(time), translate: `${n(4 + 14 * lift)}px ${n(8 + 30 * lift)}px`, scale: `${n(1 + 0.2 * lift)}`, opacity: n(shown * (0.35 + 0.4 * lift)) }
  })
}

/** El rótulo con el nombre: entra al salir, acompaña el vuelo y se va antes de tocar la casilla. */
export function liftLabelFrames(): Keyframe[] {
  return [
    { offset: 0, opacity: 0, translate: '0 6px' },
    { offset: 0.15, opacity: 1, translate: '0 0' },
    { offset: 0.7, opacity: 1, translate: '0 0' },
    { offset: LANDING_AT, opacity: 0, translate: '0 -4px' },
    { offset: 1, opacity: 0, translate: '0 -4px' },
  ]
}

/** Las partículas de polvo del golpe: de dónde salen (px desde el medio del pie de la carta) hacia afuera y un poco arriba. */
export const DUST = [
  [-26, -6],
  [-14, -12],
  [0, -9],
  [14, -12],
  [26, -6],
] as const

export const dustFrames = ([x, y]: readonly [number, number]): Keyframe[] => [
  { translate: '0 0', scale: '0.4', opacity: 0 },
  { translate: `${x * 0.4}px ${y * 0.4}px`, scale: '1', opacity: 0.8, offset: 0.25 },
  { translate: `${x}px ${y}px`, scale: '1.3', opacity: 0 },
]

/** Cuándo toca la casilla (ms desde que sale): ahí el golpe, como el destello de hoy. */
export const TOUCH_MS = Math.round(LIFT_FLIGHT_MS * LANDING_AT)

/** Las piezas de una carta que vuela con la propuesta. */
export interface LiftParts {
  path: HTMLElement
  tilt: HTMLElement
  gloss: HTMLElement
  shadow: HTMLElement
  label: HTMLElement | null
  dust: readonly HTMLElement[]
}

/**
 * Lanza el vuelo de la propuesta: todo con el mismo reloj (los cuadros ya traen la curva) y cancelado al terminar. Con movimiento reducido, la carta aparece con un fundido corto.
 * Devuelve las animaciones (para medir o cortar).
 */
export function playLift(parts: LiftParts, from: FlightStart, reduced: boolean): Animation[] {
  if (reduced) return [cancelWhenDone(parts.path.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: EASE_OUT }))]

  const clock = { duration: LIFT_FLIGHT_MS }
  const animations = [
    parts.path.animate(liftPathFrames(from), clock),
    parts.tilt.animate(liftTiltFrames(), clock),
    parts.gloss.animate(liftGlossFrames(), clock),
    parts.shadow.animate(liftShadowFrames(), clock),
    ...(parts.label ? [parts.label.animate(liftLabelFrames(), clock)] : []),
    ...parts.dust.map((dot, index) => dot.animate(dustFrames(DUST[index % DUST.length]!), { duration: 460, delay: TOUCH_MS, easing: EASE_OUT })),
  ]

  return animations.map(cancelWhenDone)
}

/** El vuelo de hoy de una carta que va de la mano al campo (`useCardFlights`): FLIP derecho, con la curva de los vuelos y sin levantarse. */
export function playToday(card: HTMLElement, from: FlightStart, reduced: boolean): Animation[] {
  if (reduced) return []

  return [cancelWhenDone(card.animate([{ transform: `translate(${from.x}px, ${from.y}px) scale(${from.scale})` }, { transform: 'none' }], { duration: FLIGHT_MS, easing: EASE_IN_OUT }))]
}

/** La carta que salió de la mano no se ve mientras vuela y vuelve a su lugar al final (la muestra se repite). */
export const leaveFrames: Keyframe[] = [{ opacity: 0 }, { opacity: 0, offset: 0.8 }, { opacity: 1 }]
