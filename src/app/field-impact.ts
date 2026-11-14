import { EASE_ASENTAR, EASE_GOLPE, EASE_IN_OUT, EASE_OUT, bezierEase, cancelWhenDone, prefersReducedMotion } from './motion'
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

/** La Invocación (hasta que tenga su anillo propio): el aro cian de energía y el destello dorado aditivo. */
const RING = 'pointer-events-none absolute -ml-10 -mt-10 size-20 rounded-full border-2 border-fx-energia opacity-0'
const FLASH = 'pointer-events-none absolute -ml-14 -mt-14 size-28 rounded-full bg-radial from-fx-destello/90 to-transparent to-70% opacity-0 mix-blend-plus-lighter'
export const RING_MS = 340
export const FLASH_MS = 260

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
const LINE_RADIUS = 40
const DUST_RADIUS = 36
const LINE_ANGLES = Array.from({ length: 8 }, (_, i) => 22.5 + i * 45)
const DUST_ANGLES = Array.from({ length: 6 }, (_, i) => 30 + i * 60)
const LINES_FRAMES: Keyframe[] = [{ scale: '1.6', opacity: 0 }, { scale: '1.1', opacity: 1, offset: 0.25 }, { scale: '0.6', opacity: 0 }]
const DUST_FRAMES: Keyframe[] = [{ scale: '0.5', opacity: 0 }, { scale: '1', opacity: 0.9, offset: 0.25 }, { scale: '1.4', opacity: 0 }]

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
 * El anillo de impacto en un punto de la pantalla (`x`, `y`), a los `delay` ms, en una capa fija que se quita sola. `hit` (un ataque): el golpe dorado con la curva «puñetazo»; si no
 * (una Invocación), el aro cian que se abre y se apaga. `strong` (lo que sacude fuerte): además, la onda que cruza la pantalla. Con «Livianos», sólo el aro (sin la segunda onda, la
 * de pantalla completa ni la mezcla aditiva); con movimiento reducido, nada.
 */
export function ringAt(x: number, y: number, delay = 0, { hit = false, strong = false }: { hit?: boolean; strong?: boolean } = {}): void {
  if (!canAnimate()) return

  const layer = layerAt(x, y)
  const full = !lite()
  const parts: Array<readonly [Animation, number]> = []
  const add = (parent: Element, className: string, frames: Keyframe[], options: KeyframeAnimationOptions & { duration: number; delay: number }) =>
    parts.push([cancelWhenDone(spanIn(parent, className).animate(frames, options)), options.delay + options.duration])

  if (hit) {
    const timing = { duration: HIT_MS, delay }
    if (full) add(layer, HIT_TWIN, punchFrames(1), timing)
    add(layer, HIT_RING, punchFrames(1), timing)
    if (full) {
      add(layer, HIT_FLASH, punchFrames(1), timing)
      const second = { duration: SECOND_MS, delay: delay + SECOND_AT, easing: EASE_OUT }
      parts.push([cancelWhenDone(ringOf(layer, LINE, LINE_ANGLES, LINE_RADIUS).animate(LINES_FRAMES, second)), second.delay + SECOND_MS])
      parts.push([cancelWhenDone(ringOf(layer, DUST, DUST_ANGLES, DUST_RADIUS).animate(DUST_FRAMES, second)), second.delay + SECOND_MS])
    }
  } else {
    add(layer, RING, [{ scale: '0.5', opacity: 0.95 }, { scale: '1.8', opacity: 0 }], { duration: RING_MS, delay, easing: EASE_OUT })
    if (full) add(layer, FLASH, [{ scale: '0.6', opacity: 0 }, { opacity: 1, offset: 0.25 }, { scale: '1.5', opacity: 0 }], { duration: FLASH_MS, delay, easing: EASE_OUT })
  }
  if (strong && full) parts.push(addWave(layer, delay))

  removeAfter(layer, parts)
}

/**
 * La carga del ataque (en Master Duel, la carta que ataca brilla dorada 300 ms y el polvo converge hacia ella): el marco de la carta con un margen (`CHARGE_SIZE`, en cartas) dorado y
 * opaco hasta la mitad, y el polvo que llega desde `DUST_FROM` cartas hasta su centro. Corre sobre la embestida que ya existe (`ms`, hasta el impacto) y la sigue (`dx`, `dy`, lo que se
 * adelanta la carta), así el ataque no dura más. Con «Livianos», sin polvo; con movimiento reducido, nada.
 */
const CHARGE_SIZE = { w: 1.22, h: 1.14 }
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

/** El impacto entero sobre un elemento (su centro): el anillo y la sacudida del campo, a los `delay` ms. */
export function impactOn(element: Element | null, field: HTMLElement | null, shake: Shake, delay = 0): void {
  if (!element) return

  const rect = element.getBoundingClientRect()

  ringAt(rect.left + rect.width / 2, rect.top + rect.height / 2, delay, { strong: shake === 'strong' })
  shakeField(field, shake, delay)
}

/**
 * Lo que llegó a una zona de monstruo boca arriba entre dos estados (las Invocaciones del rival, que la mesa no recibe como jugadas: sólo ve su campo cambiar), con su zona y de
 * dónde vino (del Extra Deck o de otro lado). Una carta que sólo se movió en el campo no cuenta.
 */
export function arrivals(before: MatState, after: MatState): Array<{ id: string; spot: 'mz' | 'emz'; index: number; from: 'extra' | 'other' }> {
  const onField = new Set([...before.mz, ...before.emz].flatMap((placed) => (placed ? [placed.id] : [])))
  const found: Array<{ id: string; spot: 'mz' | 'emz'; index: number; from: 'extra' | 'other' }> = []

  for (const spot of ['mz', 'emz'] as const) {
    after[spot].forEach((placed, index) => {
      if (placed && placed.pos !== 'set' && !onField.has(placed.id)) found.push({ id: placed.id, spot, index, from: before.extra.includes(placed.id) ? 'extra' : 'other' })
    })
  }

  return found
}
