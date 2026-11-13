import { HITSTOP_MS } from './card-weight'
import { EASE_OUT, EASE_SNAP, UI_ANIMATION_MS, bezierEase, easeInOut } from './motion'

/**
 * El vuelo en 3D de una carta a la vista que cambia de zona (`useCardFlights`): se levanta de la mesa, se inclina y cae con un golpe. Son cuadros ya horneados (como `dealFrames`),
 * en `replace` y sólo con `transform`/`translate`/`scale`/`opacity`: el compositor los corre sin escribir `style` en ningún cuadro. Cada movimiento va en su elemento: el de afuera
 * hace el camino (`liftPathFrames`), el de adentro se inclina (`liftTiltFrames`) y el brillo, la sombra y el polvo son capas ya dibujadas. Lo vigila `card-lift.test.ts`.
 */

/**
 * Cuándo toca la carta su lugar, en proporción del vuelo: con la curva de los vuelos (`EASE_IN_OUT`) ya hizo el 99 % del camino (y la que se levanta, todo). Ahí la pila se pone al
 * día (su carta de arriba y su contador), da el golpe, y el fantasma se funde con ella en lo que queda.
 */
export const LANDING_AT = 0.85
/** Cuánto se levanta de la mesa a mitad de camino (px hacia arriba, en el plano de la carta) y cuánto se agranda (más cerca). */
export const LIFT_PX = 44
const LIFT_SCALE = 1.18
/** Cuánto se inclina hacia atrás (la cabeza se aleja), cuánto gira de costado y cuánto en el plano, en grados, en lo más alto. */
const TILT_X = 32
const TILT_Y = -10
const SPIN = -7
/** El golpe al tocar la casilla: se aplasta hasta esto y vuelve, en lo que queda del vuelo. */
const SQUASH = 0.93
/**
 * Desde qué distancia vuela en 3D, en lados largos de la carta: un salto a la casilla vecina (de costado, ~0,75; arriba o abajo, ~1,1; en diagonal, ~1,35) se desliza como siempre,
 * sin levantarse.
 */
export const LIFT_MIN_CARDS = 1.5
/** Cuántos vuelos en 3D a la vez en una mesa: el que llega con dos en el aire vuela derecho (cada uno suma 8 o 9 nodos y sus capas en el compositor). */
export const LIFT_LIMIT = 2
/** Con movimiento reducido, la carta que hubiera volado en 3D aparece en su lugar con un fundido así de corto. */
export const LIFT_FADE_MS = 150
/** Cuánto dura el polvo del golpe (sale cuando la carta toca su casilla). */
export const DUST_MS = 460
/** Las partículas de polvo del golpe: hacia dónde salen (px desde el medio del pie de la carta), hacia afuera y un poco arriba. */
export const DUST = [
  [-26, -6],
  [-14, -12],
  [0, -9],
  [14, -12],
  [26, -6],
] as const

const SAMPLES = 32
const snap = bezierEase(EASE_SNAP)
const out = bezierEase(EASE_OUT)
const n = (value: number) => Math.round(value * 1000) / 1000
const clamp = (value: number) => Math.min(1, Math.max(0, value))

/**
 * La pausa del estampado (hitstop, `HITSTOP_MS`): en lo más alto la carta se queda quieta 3 cuadros antes de caer, sin alargar el vuelo (sube y cae un poco más rápido). Es una pausa,
 * no una curva: va entre `HOLD_FROM` y `HOLD_TO`, centrada en la mitad del aire, y los dos bordes son cuadros del vuelo.
 */
const HOLD = HITSTOP_MS / (UI_ANIMATION_MS * 2)
export const HOLD_FROM = n((LANDING_AT - HOLD) / 2)
export const HOLD_TO = n(HOLD_FROM + HOLD)

/** Los momentos de los cuadros (de 0 a 1), con el del toque (`LANDING_AT`) y los de la pausa entre ellos. */
const TIMES = [...new Set([...Array.from({ length: SAMPLES + 1 }, (_, index) => index / SAMPLES), LANDING_AT, HOLD_FROM, HOLD_TO])].sort((a, b) => a - b)

/** Cuánto del aire va hecho a ese momento (0 a 1): llega a la mitad en `HOLD_FROM`, se queda ahí hasta `HOLD_TO` y completa al tocar (`LANDING_AT`). */
function airAt(time: number): number {
  if (time <= HOLD_FROM) return (0.5 * time) / HOLD_FROM
  if (time <= HOLD_TO) return 0.5

  return clamp(0.5 + (0.5 * (time - HOLD_TO)) / (LANDING_AT - HOLD_TO))
}

/** Una pose de lo que vuela: su corrimiento (px) y su escala. */
export interface Spot {
  x: number
  y: number
  scale: number
}

const REST: Spot = { x: 0, y: 0, scale: 1 }

/**
 * Cómo va el vuelo a ese momento (0 a 1 de su reloj): cuánto del camino hizo (con la curva de los vuelos, completo al tocar), cuánto está levantada (una parábola en el tiempo, así
 * cae rápido: el golpe) y cuánto más grande se ve (al levantarse, y el aplastón del toque).
 */
export function liftAt(time: number): { done: number; lift: number; grow: number } {
  const air = airAt(time)
  const lift = 4 * air * (1 - air)
  const settle = clamp((time - LANDING_AT) / (1 - LANDING_AT))
  const squash = 1 - (1 - SQUASH) * Math.sin(Math.PI * snap(settle))

  return { done: easeInOut(air), lift, grow: (1 + (LIFT_SCALE - 1) * lift) * squash }
}

/** Lo de afuera: el camino de `from` a `to`, lo que sube (`rise` px) y se agranda al levantarse y el aplastón del golpe; `suffix`, lo que va detrás (la transformación propia). */
export function liftPathFrames(from: Spot, to: Spot = REST, rise = LIFT_PX, suffix = ''): Keyframe[] {
  return TIMES.map((time) => {
    const { done, lift, grow } = liftAt(time)
    const mix = (key: keyof Spot) => from[key] + (to[key] - from[key]) * done

    return { offset: n(time), transform: `translate(${n(mix('x'))}px, ${n(mix('y') - rise * lift)}px) scale(${n(mix('scale') * grow)})${suffix}` }
  })
}

/**
 * Lo de adentro: se inclina con perspectiva mientras está en el aire y cae plana. `pitch` falso: sin inclinarse hacia atrás (en la vista 3D el campo ya pone la suya, y sumarle otra la
 * doblaba); sólo el giro de costado y en el plano.
 */
export function liftTiltFrames(pitch = true, suffix = ''): Keyframe[] {
  return TIMES.map((time) => {
    const air = airAt(time)
    // El giro de costado va un poco adelantado: arranca girando y se endereza para caer.
    const turn = Math.sin(Math.PI * air) * (1 - 0.4 * air)

    return { offset: n(time), transform: `perspective(600px) rotateX(${pitch ? n(TILT_X * liftAt(time).lift) : 0}deg) rotateY(${n(TILT_Y * turn)}deg) rotate(${n(SPIN * turn)}deg)${suffix}` }
  })
}

/** El brillo (una franja ya dibujada) cruza la carta mientras se inclina: se ve más cuanto más alta va. */
export function liftGlossFrames(): Keyframe[] {
  return TIMES.map((time) => ({ offset: n(time), translate: `${n(-70 + 140 * clamp(time / LANDING_AT))}% 0`, opacity: n(0.85 * liftAt(time).lift) }))
}

/** La sombra (ya dibujada, debajo de la carta): se aleja y se agranda al subir y vuelve debajo al caer; quieta en la casilla no se ve. */
export function liftShadowFrames(): Keyframe[] {
  return TIMES.map((time) => {
    const { lift } = liftAt(time)
    const shown = Math.min(1, time / 0.12) * (1 - out(clamp((time - LANDING_AT) / (1 - LANDING_AT))))

    return { offset: n(time), translate: `${n(4 + 14 * lift)}px ${n(8 + 30 * lift)}px`, scale: `${n(1 + 0.2 * lift)}`, opacity: n(shown * (0.35 + 0.4 * lift)) }
  })
}

/** Una partícula de polvo (`DUST`): crece y se va hacia afuera mientras se apaga. */
export const dustFrames = ([x, y]: readonly [number, number]): Keyframe[] => [
  { translate: '0 0', scale: '0.4', opacity: 0 },
  { translate: `${x * 0.4}px ${y * 0.4}px`, scale: '1', opacity: 0.8, offset: 0.25 },
  { translate: `${x}px ${y}px`, scale: '1.3', opacity: 0 },
]
