import { EASE_ASENTAR, EASE_GOLPE, EASE_IN_OUT, EASE_LLEGADA, EASE_OUT, bezierEase, cancelWhenDone, prefersReducedMotion } from './motion'
import type { LandingTone } from './mat-effects'
import type { MatState } from './practice-mat'

/**
 * El impacto en la mesa («Impacto Ligero»): cuando una carta queda en el campo por una Invocación se abre un anillo de energía desde ella (el cian `fx-energia`) con un destello dorado
 * aditivo (`fx-destello`, sólo con «Efectos completos»); cuando conecta un ataque, el golpe dorado con los tiempos de Master Duel (`PUNCH`); y el campo se sacude a propósito (Gastón, 2026-11-13: «el campo si se mueve si es a proposito, si no lo es es un bug»).
 * Todo por el DOM y la Web Animations API, sin pasar por React (no redibuja la mesa con los vuelos en el aire), sólo `scale`, `translate` y `opacity`. Con «Livianos» no hay sacudida ni
 * destello aditivo (queda el anillo); con movimiento reducido, nada.
 */

/** Cuánto se sacude: nada, leve (3 px) o fuerte (5 px). */
export type Shake = 'none' | 'light' | 'strong'

/**
 * La escala: lo que sale del Extra Deck (Fusión, Sincronía, Xyz, Enlace) y el ataque directo sacuden fuerte; una Invocación Normal o Especial y un ataque a una carta, leve; colocar,
 * una ficha o un monstruo que cambia de dueño, nada (no son un golpe).
 */
export function shakeOf(event: { landing: LandingTone } | { attack: 'direct' | 'card' } | { arrival: 'extra' | 'other' }): Shake {
  if ('attack' in event) return event.attack === 'direct' ? 'strong' : 'light'
  if ('arrival' in event) return event.arrival === 'extra' ? 'strong' : 'light'

  return event.landing === 'normal' || event.landing === 'special' ? 'light' : 'strong'
}

/** Los cuadros de la sacudida, en px desde su lugar: cortos, amortiguados y de vuelta exacta al 0 (la geometría vuelve a su píxel). */
export const SHAKES: Record<Exclude<Shake, 'none'>, { path: ReadonlyArray<readonly [number, number]>; ms: number }> = {
  light: { path: [[0, 0], [3, -2], [-3, 1.5], [2, 1], [-1, -0.5], [0, 0]], ms: 180 },
  strong: { path: [[0, 0], [5, -3], [-5, 2], [4, 2], [-2, -1.5], [1, 0.5], [0, 0]], ms: 240 },
}

/** El id de la animación de la sacudida, para encontrarla. */
const SHAKE_ID = 'field-shake'

const lite = () => typeof document !== 'undefined' && document.documentElement.dataset.effects === 'lite'

/**
 * Sacude el campo (`translate`, la propiedad suelta: no pisa su `transform` de la vista 3D) después de `delay` ms. Una sacudida nueva reemplaza a la que hubiera. Con «Livianos» o con
 * movimiento reducido, no. Mientras dura, el campo lleva `data-shaking` (ver `settleShake`).
 */
export function shakeField(field: HTMLElement | null, shake: Shake, delay = 0): Animation | null {
  if (!field || shake === 'none' || typeof field.animate !== 'function' || prefersReducedMotion() || lite()) return null

  for (const running of field.getAnimations()) if (running.id === SHAKE_ID) running.cancel()
  const { path, ms } = SHAKES[shake]
  // Cada vaivén con su curva (de ida y vuelta): una sola curva para toda la sacudida apretaba los golpes grandes en los primeros cuadros. La amortiguación es la amplitud que baja.
  const animation = cancelWhenDone(field.animate(path.map(([x, y]) => ({ translate: `${x}px ${y}px`, easing: EASE_IN_OUT })), { id: SHAKE_ID, duration: ms, delay }))
  const done = () => delete field.dataset.shaking

  field.dataset.shaking = ''
  animation.addEventListener?.('finish', done)
  animation.addEventListener?.('cancel', done)

  return animation
}

/**
 * Antes de medir la mesa (los vuelos, `use-card-flights`): una sacudida en curso se termina ya (le quedan a lo sumo un par de px), así ninguna medida se toma corrida y la carta siguiente
 * no sale de un lugar equivocado.
 */
export function settleShake(root: HTMLElement | null): void {
  const field = root?.querySelector<HTMLElement>('[data-shaking]')

  for (const running of field?.getAnimations?.() ?? []) if (running.id === SHAKE_ID) running.finish()
}

/**
 * El color de una llegada al campo (el de Master Duel por tipo; `--color-fx-*` de `index.css`): la Normal y la Especial comparten el oro anaranjado y la de Sacrificio va en rojo; la
 * Ritual, en azul profundo; la de Péndulo, blanca.
 */
export type ArrivalTone = 'special' | 'tribute' | 'fusion' | 'synchro' | 'xyz' | 'link' | 'ritual' | 'pendulum'

/** Las clases de cada color, enteras (Tailwind las lee del código): el aro, la cruz y el brillo del piso. */
export const ARRIVAL_CLASS: Record<ArrivalTone, { ring: string; bar: string; glow: string }> = {
  special: { ring: 'border-fx-especial', bar: 'bg-fx-especial', glow: 'from-fx-especial/60' },
  tribute: { ring: 'border-fx-sacrificio', bar: 'bg-fx-sacrificio', glow: 'from-fx-sacrificio/60' },
  fusion: { ring: 'border-fx-fusion', bar: 'bg-fx-fusion', glow: 'from-fx-fusion/60' },
  synchro: { ring: 'border-fx-sincronia', bar: 'bg-fx-sincronia', glow: 'from-fx-sincronia/60' },
  xyz: { ring: 'border-fx-xyz', bar: 'bg-fx-xyz', glow: 'from-fx-xyz/60' },
  link: { ring: 'border-fx-enlace', bar: 'bg-fx-enlace', glow: 'from-fx-enlace/60' },
  ritual: { ring: 'border-fx-ritual', bar: 'bg-fx-ritual', glow: 'from-fx-ritual/60' },
  pendulum: { ring: 'border-white', bar: 'bg-white', glow: 'from-white/60' },
}

/**
 * La llegada al campo (`fxp_somldg` de Master Duel), en cartas (el ancho de la casilla): el anillo del piso va de 1,7 a 3,5 cartas en 144 ms (`--ease-llegada`) y a 4,2 en 1 s, con el
 * alfa plena hasta los 200 ms; la cruz de cuatro cuñas a 45°, de 33 % a 74 % en 43 ms y a 100 % en 300, plena hasta los 240; el brillo del piso, 3 cartas (en Master Duel, 7: en el celular
 * tapaba media mesa). La fuerte (`_s2`, lo que sacude fuerte): el anillo ×1,5 y tres veces (cada 100 ms), y una onda de 12,7 cartas de 7 % a 52 % en 142 ms y a 100 % en 600, con el
 * alfa de 1 a 0,2 a la mitad. No alarga nada: el juego sigue cuando seguía y el anillo se apaga por encima.
 */
export const ARRIVAL = {
  ms: 1000,
  ring: { from: 1.7, fast: 3.5, to: 4.2, fastAt: 0.144, hold: 0.2 },
  cross: { ms: 300, from: 0.33, fast: 0.74, fastAt: 43 / 300, hold: 0.8, reach: 0.9 },
  glow: { size: 3, ms: 600, peak: 0.15, alpha: 0.8 },
  strong: { grow: 1.5, rings: 3, every: 100, wave: 12.7, waveMs: 600, waveFrom: 0.07, waveFast: 0.52, waveFastAt: 142 / 600 },
} as const
const CROSS_ANGLES = [45, 135, 225, 315]
const ARRIVAL_RING = 'pointer-events-none absolute rounded-full border-2 outline-2 outline-black/40 opacity-0'
const ARRIVAL_BAR = 'absolute -mt-px h-0.5 origin-left outline-1 outline-black/40'
const ARRIVAL_GLOW = 'pointer-events-none absolute rounded-full bg-radial to-transparent to-70% opacity-0 mix-blend-plus-lighter'
const ARRIVAL_WAVE = 'pointer-events-none absolute rounded-full border-3 outline-3 outline-black/40 opacity-0'
const r3 = (value: number) => Math.round(value * 1000) / 1000

/** Los cuadros del anillo de la llegada (escala de su tamaño final, 4,2 cartas): rápido hasta el 80 % y lento hasta el final; el alfa, plena hasta `hold` y lineal a 0. */
export const arrivalRingFrames = (): Keyframe[] => {
  const { from, fast, to, fastAt, hold } = ARRIVAL.ring
  return [
    { scale: `${r3(from / to)}`, opacity: 1, easing: EASE_LLEGADA },
    { scale: `${r3(fast / to)}`, opacity: 1, offset: fastAt, easing: EASE_OUT },
    { opacity: 1, offset: hold },
    { scale: '1', opacity: 0 },
  ]
}

/**
 * El brillo del marco («OverFrame» de Master Duel), 600 ms después de que la carta de una entrada larga toca su casilla: un marco con la forma de la carta que estalla (alfa plena en
 * 80 ms, de 57 % a 81 % en 106 ms y a su tamaño, 1,35 cartas, en 800), del color de su tipo, con su gemela oscura. Con movimiento reducido, nada.
 */
export const OVER_FRAME = { ms: 800, size: 1.35, from: 0.57, fast: 0.81, fastAt: 106 / 800, in: 80 / 800 } as const
const OVER_FRAME_CLASS = 'pointer-events-none absolute border-3 outline-2 outline-black/40 opacity-0'

export function overFrameAt(x: number, y: number, w: number, h: number, delay: number, tone: ArrivalTone): void {
  if (!canAnimate()) return

  const layer = layerAt(x, y)
  const frame = spanIn(layer, `${OVER_FRAME_CLASS} ${ARRIVAL_CLASS[tone].ring}`)
  const [fw, fh] = [Math.round(w * OVER_FRAME.size), Math.round(h * OVER_FRAME.size)]
  Object.assign(frame.style, { width: `${fw}px`, height: `${fh}px`, marginLeft: `${-fw / 2}px`, marginTop: `${-fh / 2}px` })
  const animation = cancelWhenDone(
    frame.animate(
      [
        { scale: `${OVER_FRAME.from}`, opacity: 0 },
        { opacity: 1, offset: OVER_FRAME.in },
        { scale: `${OVER_FRAME.fast}`, offset: OVER_FRAME.fastAt, easing: EASE_OUT },
        { opacity: 0.8, offset: 0.5 },
        { scale: '1', opacity: 0 },
      ],
      { duration: OVER_FRAME.ms, delay },
    ),
  )
  removeAfter(layer, [[animation, delay + OVER_FRAME.ms]])
}

/** Lo mismo en `p` (0 a 1 de `ARRIVAL.ms`), para el video. */
export function arrivalRingAt(p: number): { scale: number; alpha: number } {
  const { from, fast, to, fastAt, hold } = ARRIVAL.ring
  if (p <= 0) return { scale: from / to, alpha: 1 }
  const scale = p < fastAt ? mix(from / to, fast / to, easeLlegada(p / fastAt)) : mix(fast / to, 1, easeOutCurve((p - fastAt) / (1 - fastAt)))
  return { scale: Math.min(1, scale), alpha: p < hold ? 1 : Math.max(0, 1 - (p - hold) / (1 - hold)) }
}

/**
 * La llegada al campo en `(x, y)` a los `delay` ms, del color de su tipo; `unit`, el ancho de la carta en px. Con «Livianos», sólo el anillo; `strong` (la fuerte), además, los tres
 * anillos más grandes y la onda. Con movimiento reducido, nada.
 */
export function arriveAt(x: number, y: number, delay = 0, { tone = 'special', strong = false, unit = 48 }: { tone?: ArrivalTone; strong?: boolean; unit?: number } = {}): void {
  if (!canAnimate()) return

  const layer = layerAt(x, y)
  const full = !lite()
  const colors = ARRIVAL_CLASS[tone]
  const parts: Array<readonly [Animation, number]> = []
  const sized = (span: HTMLSpanElement, size: number) => {
    const px = Math.round(size)
    Object.assign(span.style, { width: `${px}px`, height: `${px}px`, marginLeft: `${-px / 2}px`, marginTop: `${-px / 2}px` })
    return span
  }
  const add = (span: HTMLSpanElement, frames: Keyframe[], duration: number, at: number, easing?: string) =>
    parts.push([cancelWhenDone(span.animate(frames, { duration, delay: at, ...(easing ? { easing } : {}) })), at + duration])

  const grow = strong && full ? ARRIVAL.strong.grow : 1
  const rings = strong && full ? ARRIVAL.strong.rings : 1
  for (let index = 0; index < rings; index += 1) add(sized(spanIn(layer, `${ARRIVAL_RING} ${colors.ring}`), ARRIVAL.ring.to * unit * grow), arrivalRingFrames(), ARRIVAL.ms, delay + index * ARRIVAL.strong.every)

  if (full) {
    const { glow, cross } = ARRIVAL
    add(sized(spanIn(layer, `${ARRIVAL_GLOW} ${colors.glow}`), glow.size * unit), [{ scale: '0.6', opacity: 0 }, { opacity: glow.alpha, offset: glow.peak }, { scale: '1', opacity: 0 }], glow.ms, delay, EASE_OUT)
    const group = spanIn(layer, SECOND)
    for (const angle of CROSS_ANGLES) {
      const bar = spanIn(group, `${ARRIVAL_BAR} ${colors.bar}`)
      bar.style.width = `${Math.round(cross.reach * unit)}px`
      bar.style.transform = `rotate(${angle}deg)`
    }
    add(group, [{ scale: `${cross.from}`, opacity: 1, easing: EASE_GOLPE }, { scale: `${cross.fast}`, opacity: 1, offset: cross.fastAt, easing: EASE_OUT }, { opacity: 1, offset: cross.hold }, { scale: '1', opacity: 0 }], cross.ms, delay)
    if (strong) {
      const { wave, waveMs, waveFrom, waveFast, waveFastAt } = ARRIVAL.strong
      const size = Math.min(wave * unit, Math.hypot(window.innerWidth, window.innerHeight))
      add(sized(spanIn(layer, `${ARRIVAL_WAVE} ${colors.ring}`), size), [{ scale: `${waveFrom}`, opacity: 1, easing: EASE_LLEGADA }, { scale: `${waveFast}`, opacity: 0.6, offset: waveFastAt, easing: EASE_OUT }, { opacity: 0.2, offset: 0.5 }, { scale: '1', opacity: 0 }], waveMs, delay)
    }
  }

  removeAfter(layer, parts)
}

/**
 * El golpe de un ataque, en dorado (el de Master Duel, `fx-destello`), y cada capa clara con su gemela oscura debajo (negro al 40 %: se lee sobre un arte claro): el aro (su gemela es
 * el contorno, `outline`) y el destello aditivo sobre un halo negro. Las medidas, ajustadas al celular: el destello de Master Duel mide 5 cartas (240 px con la carta de 48 del celular, dos
 * tercios del ancho); acá, 160 px.
 */
const HIT_RING = 'pointer-events-none absolute -ml-18 -mt-18 size-36 rounded-full border-3 border-fx-destello outline-2 outline-black/40 opacity-0'
const HIT_FLASH = 'pointer-events-none absolute -ml-20 -mt-20 size-40 rounded-full bg-radial from-fx-destello/90 to-transparent to-70% opacity-0 mix-blend-plus-lighter'
// La gemela del destello es un halo (el centro, libre): un disco negro debajo del aditivo lo volvía marrón sobre un arte claro.
const HIT_TWIN = 'pointer-events-none absolute -ml-22 -mt-22 size-44 rounded-full bg-radial from-transparent from-30% via-black/40 via-50% to-transparent to-70% opacity-0'
/** Lo que dura el golpe: 500–600 ms en la referencia. */
export const HIT_MS = 560

/**
 * La curva «puñetazo» (el destello del golpe de Master Duel): crece de `from` al pico (1) en el primer `peak` de su vida (50 ms de 560) con `--ease-golpe`, se asienta encogiéndose
 * hasta `mid` con `--ease-asentar` mientras el alfa sigue plena hasta `hold` y, de ahí, baja lineal a 0 mientras llega a `to` (la mitad).
 */
export const PUNCH = { from: 0.2, peak: 0.09, mid: 0.7, hold: 0.55, to: 0.5 } as const
export const punchFrames = (alpha: number): Keyframe[] => [
  { scale: `${PUNCH.from}`, opacity: 0, easing: EASE_GOLPE },
  { scale: '1', opacity: alpha, offset: PUNCH.peak, easing: EASE_ASENTAR },
  { scale: `${PUNCH.mid}`, opacity: alpha, offset: PUNCH.hold },
  { scale: `${PUNCH.to}`, opacity: 0 },
]
const easeGolpe = bezierEase(EASE_GOLPE)
const easeAsentar = bezierEase(EASE_ASENTAR)
const easeLlegada = bezierEase(EASE_LLEGADA)
const easeOutCurve = bezierEase(EASE_OUT)
const mix = (a: number, b: number, e: number) => a + (b - a) * e

/** La curva «puñetazo» en `p` (0 a 1), para el video: lo mismo que `punchFrames`. */
export function punchAt(p: number): { scale: number; alpha: number } {
  if (p <= 0) return { scale: PUNCH.from, alpha: 0 }
  if (p < PUNCH.peak) {
    const e = easeGolpe(p / PUNCH.peak)
    return { scale: mix(PUNCH.from, 1, e), alpha: e }
  }
  if (p < PUNCH.hold) return { scale: mix(1, PUNCH.mid, easeAsentar((p - PUNCH.peak) / (PUNCH.hold - PUNCH.peak))), alpha: 1 }
  const e = Math.min(1, (p - PUNCH.hold) / (1 - PUNCH.hold))
  return { scale: mix(PUNCH.mid, PUNCH.to, e), alpha: 1 - e }
}

/**
 * La segunda onda del golpe, `SECOND_AT` ms después del impacto (en Master Duel el polvo y las líneas salen 200 ms tarde): ocho líneas de velocidad que se cierran hacia el centro y
 * seis motas de polvo que se abren. Cada grupo es una sola capa que anima `scale` y `opacity` (sus piezas, quietas adentro).
 */
export const SECOND_AT = 200
export const SECOND_MS = 460
const SECOND = 'pointer-events-none absolute left-0 top-0 opacity-0'
const LINE = 'absolute -mt-px h-0.5 w-3 origin-left bg-fx-destello outline-1 outline-black/40'
const DUST = 'absolute -ml-0.75 -mt-0.75 size-1.5 rounded-full bg-fx-destello outline-1 outline-black/40'
export const LINE_RADIUS = 40
export const DUST_RADIUS = 36
export const LINE_ANGLES = Array.from({ length: 8 }, (_, i) => 22.5 + i * 45)
export const DUST_ANGLES = Array.from({ length: 6 }, (_, i) => 30 + i * 60)
/** Los cuadros de cada grupo (`[offset, scale, opacity]`, con `EASE_OUT`): las líneas se cierran, el polvo se abre. El video los lee de acá. */
export const SECOND_KEYS = {
  lines: [[0, 1.6, 0], [0.25, 1.1, 1], [1, 0.6, 0]],
  dust: [[0, 0.5, 0], [0.25, 1, 0.9], [1, 1.4, 0]],
} as const satisfies Record<string, ReadonlyArray<readonly [number, number, number]>>
const framesOf = (keys: ReadonlyArray<readonly [number, number, number]>): Keyframe[] => keys.map(([offset, scale, opacity]) => ({ offset, scale: `${scale}`, opacity }))
const LINES_FRAMES = framesOf(SECOND_KEYS.lines)
const DUST_FRAMES = framesOf(SECOND_KEYS.dust)

/**
 * El golpe fuerte (un ataque directo, el golpe letal, lo que sale del Extra Deck): una onda que cruza toda la pantalla (en Master Duel, 17 cartas; acá, la diagonal de la ventana),
 * lineal de `WAVE_FROM` a su tamaño en `WAVE_MS`, con el alfa plena hasta `WAVE_HOLD`. Un aro ya dibujado que sólo anima `scale` y `opacity`; su gemela oscura, el contorno.
 */
export const WAVE_MS = 300
export const WAVE_FROM = 0.18
export const WAVE_HOLD = 0.55
const WAVE = 'pointer-events-none absolute rounded-full border-4 border-fx-destello outline-4 outline-black/40 opacity-0'
const waveFrames = (): Keyframe[] => [
  { scale: `${WAVE_FROM}`, opacity: 1 },
  { scale: `${Math.round((WAVE_FROM + (1 - WAVE_FROM) * WAVE_HOLD) * 1000) / 1000}`, opacity: 1, offset: WAVE_HOLD },
  { scale: '1', opacity: 0 },
]

function addWave(layer: Element, delay: number): readonly [Animation, number] {
  const wave = spanIn(layer, WAVE)
  const size = Math.round(Math.hypot(window.innerWidth, window.innerHeight))
  wave.dataset.fx = 'wave'
  Object.assign(wave.style, { width: `${size}px`, height: `${size}px`, marginLeft: `${-size / 2}px`, marginTop: `${-size / 2}px` })
  return [cancelWhenDone(wave.animate(waveFrames(), { duration: WAVE_MS, delay })), delay + WAVE_MS]
}

/** La onda de pantalla completa sola, en `(x, y)` (el golpe letal). Con «Livianos» o movimiento reducido, nada. */
export function waveAt(x: number, y: number, delay = 0): void {
  if (!canAnimate() || lite()) return

  const layer = layerAt(x, y)
  removeAfter(layer, [addWave(layer, delay)])
}

/** Un grupo de piezas quietas a `radius` px del centro, cada una girada hacia afuera; el grupo es la capa que se anima. */
function ringOf(layer: Element, className: string, angles: readonly number[], radius: number): HTMLSpanElement {
  const group = spanIn(layer, SECOND)
  for (const angle of angles) spanIn(group, className).style.transform = `rotate(${angle}deg) translateX(${radius}px)`
  return group
}

const canAnimate = () => typeof document !== 'undefined' && !prefersReducedMotion() && typeof document.body.animate === 'function'

/** Una capa fija en `(x, y)`, encima del campo y debajo de las cartas grandes del centro. */
function layerAt(x: number, y: number): HTMLDivElement {
  const layer = document.createElement('div')
  layer.className = 'pointer-events-none fixed left-0 top-0 z-[115]'
  layer.dataset.fx = 'impact'
  layer.setAttribute('aria-hidden', 'true')
  layer.style.translate = `${Math.round(x)}px ${Math.round(y)}px`
  document.body.append(layer)
  return layer
}

function spanIn(parent: Element, className: string): HTMLSpanElement {
  const span = document.createElement('span')
  span.className = className
  parent.append(span)
  return span
}

/** Las animaciones de una capa con su final; la capa se quita cuando termina la última. */
function removeAfter(layer: Element, parts: ReadonlyArray<readonly [Animation, number]>) {
  const [last] = parts.reduce((a, b) => (b[1] > a[1] ? b : a))
  const remove = () => layer.remove()
  last.addEventListener?.('finish', remove)
  last.addEventListener?.('cancel', remove)
}

/**
 * El golpe de un ataque en un punto de la pantalla (`x`, `y`), a los `delay` ms, en una capa fija que se quita sola: el golpe dorado con la curva «puñetazo». `strong` (lo que sacude
 * fuerte): además, la onda que cruza la pantalla. Con «Livianos», sólo el aro (sin la segunda onda, la de pantalla completa ni la mezcla aditiva); con movimiento reducido, nada. La
 * Invocación tiene su anillo propio (`arriveAt`).
 */
export function ringAt(x: number, y: number, delay = 0, { strong = false }: { strong?: boolean } = {}): void {
  if (!canAnimate()) return

  const layer = layerAt(x, y)
  const full = !lite()
  const parts: Array<readonly [Animation, number]> = []
  const add = (parent: Element, className: string, frames: Keyframe[], options: KeyframeAnimationOptions & { duration: number; delay: number }) =>
    parts.push([cancelWhenDone(spanIn(parent, className).animate(frames, options)), options.delay + options.duration])

  const timing = { duration: HIT_MS, delay }
  if (full) add(layer, HIT_TWIN, punchFrames(1), timing)
  add(layer, HIT_RING, punchFrames(1), timing)
  if (full) {
    add(layer, HIT_FLASH, punchFrames(1), timing)
    const second = { duration: SECOND_MS, delay: delay + SECOND_AT, easing: EASE_OUT }
    parts.push([cancelWhenDone(ringOf(layer, LINE, LINE_ANGLES, LINE_RADIUS).animate(LINES_FRAMES, second)), second.delay + SECOND_MS])
    parts.push([cancelWhenDone(ringOf(layer, DUST, DUST_ANGLES, DUST_RADIUS).animate(DUST_FRAMES, second)), second.delay + SECOND_MS])
    if (strong) parts.push(addWave(layer, delay))
  }

  removeAfter(layer, parts)
}

/**
 * La carga del ataque (en Master Duel, la carta que ataca brilla dorada 300 ms y el polvo converge hacia ella): el marco de la carta con un margen (`CHARGE_SIZE`, en cartas) dorado y
 * opaco hasta la mitad, y el polvo que llega desde `DUST_FROM` cartas hasta su centro. Corre sobre la embestida que ya existe (`ms`, hasta el impacto) y la sigue (`dx`, `dy`, lo que se
 * adelanta la carta), así el ataque no dura más. Con «Livianos», sin polvo; con movimiento reducido, nada.
 */
export const CHARGE_SIZE = { w: 1.22, h: 1.14 }
const CHARGE_GLOW = 'pointer-events-none absolute border-2 border-fx-destello bg-fx-destello/35 opacity-0'
const CHARGE_DUST = 'absolute -ml-0.75 -mt-0.75 size-1.5 rounded-full bg-fx-destello outline-1 outline-black/40 opacity-0'
const DUST_FROM = 0.75
const CHARGE_ANGLES = Array.from({ length: 6 }, (_, i) => i * 60)

export function chargeOn(card: Element | null, dx: number, dy: number, ms: number): void {
  if (!card || !canAnimate()) return

  const rect = card.getBoundingClientRect()
  const layer = layerAt(rect.left + rect.width / 2, rect.top + rect.height / 2)
  const follow = spanIn(layer, 'absolute left-0 top-0')
  follow.dataset.fx = 'charge'
  const moving = cancelWhenDone(follow.animate([{ translate: '0px 0px', easing: EASE_IN_OUT }, { translate: `${Math.round(dx * 100) / 100}px ${Math.round(dy * 100) / 100}px` }], { duration: ms }))
  const glow = spanIn(follow, CHARGE_GLOW)
  const [w, h] = [Math.round(rect.width * CHARGE_SIZE.w), Math.round(rect.height * CHARGE_SIZE.h)]

  Object.assign(glow.style, { width: `${w}px`, height: `${h}px`, marginLeft: `${-w / 2}px`, marginTop: `${-h / 2}px` })
  cancelWhenDone(glow.animate([{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }], { duration: ms }))
  if (!lite()) {
    for (const angle of CHARGE_ANGLES) {
      const reach = rect.width * DUST_FROM
      const [x, y] = [Math.round(Math.cos((angle * Math.PI) / 180) * reach), Math.round(Math.sin((angle * Math.PI) / 180) * reach)]
      cancelWhenDone(spanIn(follow, CHARGE_DUST).animate([{ translate: `${x}px ${y}px`, opacity: 0 }, { opacity: 0.9, offset: 0.2 }, { opacity: 0.9, offset: 0.6 }, { translate: '0px 0px', opacity: 0 }], { duration: ms, easing: EASE_OUT }))
    }
  }
  removeAfter(layer, [[moving, ms]])
}

/**
 * El Sacrificio (en Master Duel, la marca de «elegida como material»): sobre la casilla de la carta que se sacrifica, mientras vuela al Cementerio (`FLIGHT_MS`, 480 ms: no alarga nada),
 * el disco violeta de 1,2 cartas (alfa 0,75 → 0,5 y se apaga), el círculo blanco de 1,7 cartas que crece de 44 % a 100 % en 200 ms y la columna de luz de 0,25 × 3,4 cartas, una vez cada
 * uno (en Master Duel laten a 8 por segundo mientras se elige: acá es una salida). Con «Livianos», sólo el círculo (lo mínimo que dice «se sacrificó»); con movimiento reducido, nada.
 */
export const SACRIFICE = { ms: 450, disc: { size: 1.2, from: 0.75, to: 0.5 }, maru: { size: 1.7, from: 0.44, ms: 200 }, column: { w: 0.25, h: 3.4, ms: 300 } } as const
const SACRIFICE_DISC = 'pointer-events-none absolute rounded-full bg-radial from-fx-material-brillo/80 via-fx-material/70 to-transparent to-70% opacity-0 mix-blend-plus-lighter'
const SACRIFICE_MARU = 'pointer-events-none absolute rounded-full border-2 border-white outline-2 outline-fx-material/60 opacity-0'
const SACRIFICE_COLUMN = 'pointer-events-none absolute bg-linear-to-b from-transparent via-fx-material-brillo/80 to-transparent opacity-0 mix-blend-plus-lighter'

export function sacrificeAt(x: number, y: number, unit = 48): void {
  if (!canAnimate()) return

  const layer = layerAt(x, y)
  layer.dataset.fx = 'sacrifice'
  const parts: Array<readonly [Animation, number]> = []
  const add = (className: string, [w, h]: readonly [number, number], frames: Keyframe[], duration: number, easing?: string) => {
    const span = spanIn(layer, className)
    const [pw, ph] = [Math.round(w * unit), Math.round(h * unit)]
    Object.assign(span.style, { width: `${pw}px`, height: `${ph}px`, marginLeft: `${-pw / 2}px`, marginTop: `${-ph / 2}px` })
    parts.push([cancelWhenDone(span.animate(frames, { duration, ...(easing ? { easing } : {}) })), duration])
  }
  const { disc, maru, column } = SACRIFICE

  // El círculo crece casi lineal (como en Master Duel) y se apaga hasta el final de la salida.
  add(SACRIFICE_MARU, [maru.size, maru.size], [{ scale: `${maru.from}`, opacity: 1 }, { scale: '1', opacity: 0.8, offset: r3(maru.ms / SACRIFICE.ms) }, { scale: '1', opacity: 0 }], SACRIFICE.ms)
  if (!lite()) {
    add(SACRIFICE_DISC, [disc.size, disc.size], [{ scale: '0.85', opacity: 0, easing: EASE_OUT }, { scale: '1', opacity: disc.from, offset: 0.15 }, { opacity: disc.to, offset: 0.6 }, { scale: '1.05', opacity: 0 }], SACRIFICE.ms)
    add(SACRIFICE_COLUMN, [column.w, column.h], [{ scale: '1 0', opacity: 0, easing: EASE_OUT }, { scale: '1 1', opacity: 1, offset: 0.3 }, { scale: '0.4 1', opacity: 0 }], column.ms)
  }

  removeAfter(layer, parts)
}

/** La llegada entera sobre una casilla (su centro): el anillo del color de su tipo (la fuerte, si sacude fuerte) y la sacudida del campo, a los `delay` ms. */
export function impactOn(element: Element | null, field: HTMLElement | null, shake: Shake, delay = 0, tone: ArrivalTone = 'special'): void {
  if (!element) return

  const rect = element.getBoundingClientRect()

  arriveAt(rect.left + rect.width / 2, rect.top + rect.height / 2, delay, { tone, strong: shake === 'strong', unit: rect.width || undefined })
  shakeField(field, shake, delay)
}

/**
 * Lo que llegó a una zona de monstruo boca arriba entre dos estados (las Invocaciones del rival, que la mesa no recibe como jugadas: sólo ve su campo cambiar), con su zona y de
 * dónde vino (del Extra Deck o de otro lado). Una carta que sólo se movió en el campo no cuenta.
 */
export function arrivals(before: MatState, after: MatState): Array<{ id: string; spot: 'mz' | 'emz'; index: number; from: 'extra' | 'other'; hand?: true }> {
  const onField = new Set([...before.mz, ...before.emz].flatMap((placed) => (placed ? [placed.id] : [])))
  const found: Array<{ id: string; spot: 'mz' | 'emz'; index: number; from: 'extra' | 'other'; hand?: true }> = []

  for (const spot of ['mz', 'emz'] as const) {
    after[spot].forEach((placed, index) => {
      if (placed && placed.pos !== 'set' && !onField.has(placed.id)) {
        found.push({ id: placed.id, spot, index, from: before.extra.includes(placed.id) ? 'extra' : 'other', ...(before.hand.includes(placed.id) ? { hand: true as const } : {}) })
      }
    })
  }

  return found
}
