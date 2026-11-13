import { EASE_IN_OUT, EASE_OUT, cancelWhenDone, prefersReducedMotion } from './motion'
import type { LandingTone } from './mat-effects'
import type { MatState } from './practice-mat'

/**
 * El impacto en la mesa («Impacto Ligero»): cuando una carta queda en el campo por una Invocación o conecta un ataque, se abre un anillo de energía desde ella (el cian `fx-energia`) con un
 * destello dorado aditivo (`fx-destello`, sólo con «Efectos completos») y el campo se sacude a propósito (Gastón, 2026-11-13: «el campo si se mueve si es a proposito, si no lo es es un bug»).
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
const SHAKES: Record<Exclude<Shake, 'none'>, { path: ReadonlyArray<readonly [number, number]>; ms: number }> = {
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

const RING = 'pointer-events-none absolute -ml-10 -mt-10 size-20 rounded-full border-2 border-fx-energia opacity-0'
const FLASH = 'pointer-events-none absolute -ml-14 -mt-14 size-28 rounded-full bg-radial from-fx-destello/90 to-transparent to-70% opacity-0 mix-blend-plus-lighter'
const RING_MS = 340
const FLASH_MS = 260

/**
 * El anillo de impacto en un punto de la pantalla (`x`, `y`), a los `delay` ms: el aro cian que se abre y se apaga y, con «Efectos completos», el destello dorado aditivo. Una capa fija
 * encima del campo y debajo de las cartas grandes del centro, que se quita sola. Con movimiento reducido, nada.
 */
export function ringAt(x: number, y: number, delay = 0): void {
  if (typeof document === 'undefined' || prefersReducedMotion() || typeof document.body.animate !== 'function') return

  const layer = document.createElement('div')
  layer.className = 'pointer-events-none fixed left-0 top-0 z-[115]'
  layer.dataset.fx = 'impact'
  layer.setAttribute('aria-hidden', 'true')
  layer.style.translate = `${Math.round(x)}px ${Math.round(y)}px`
  document.body.append(layer)

  const ring = document.createElement('span')
  ring.className = RING
  layer.append(ring)
  const parts = [cancelWhenDone(ring.animate([{ scale: '0.5', opacity: 0.95 }, { scale: '1.8', opacity: 0 }], { duration: RING_MS, delay, easing: EASE_OUT }))]

  if (!lite()) {
    const flash = document.createElement('span')
    flash.className = FLASH
    layer.append(flash)
    parts.push(cancelWhenDone(flash.animate([{ scale: '0.6', opacity: 0 }, { opacity: 1, offset: 0.25 }, { scale: '1.5', opacity: 0 }], { duration: FLASH_MS, delay, easing: EASE_OUT })))
  }

  const remove = () => layer.remove()
  parts[0]!.addEventListener?.('finish', remove)
  parts[0]!.addEventListener?.('cancel', remove)
}

/** El impacto entero sobre un elemento (su centro): el anillo y la sacudida del campo, a los `delay` ms. */
export function impactOn(element: Element | null, field: HTMLElement | null, shake: Shake, delay = 0): void {
  if (!element) return

  const rect = element.getBoundingClientRect()

  ringAt(rect.left + rect.width / 2, rect.top + rect.height / 2, delay)
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
