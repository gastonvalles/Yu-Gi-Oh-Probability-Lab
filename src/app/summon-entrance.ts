import { arriveAt, overFrameAt, shakeField, type ArrivalTone } from './field-impact'
import type { LandingTone } from './mat-effects'
import { EASE_IN_OUT, EASE_OUT, EASE_REVELAR, EASE_SNAP, cancelWhenDone, prefersReducedMotion } from './motion'
import { TOKEN_KIND, type MatCardKind } from './practice-mat'

/**
 * La invocación como en Master Duel: de qué tipo es una llegada al campo (el color de su anillo, `arriveAt`) y, si sale del Extra Deck o es un Ritual, la entrada larga con los tiempos
 * de Master Duel por tipo (Gastón, 2026-11-14: «Como Master Duel»). Las figuras se dibujan acá con formas propias (de Master Duel salen sólo tiempos, colores y proporciones). Todo por el
 * DOM y la Web Animations API, sólo `scale`, `rotate`, `translate` y `opacity`. Lo vigila `summon-entrance.test.ts`.
 */

/** Lo que se sabe de la carta que llega: su clase y si es un monstruo Ritual. */
export interface SummonCard {
  kind: MatCardKind
  ritual: boolean
}

/** Una carta de la que no se sabe el marco (el video, el replay sin la carta): sale con el tipo que dice la jugada. */
export const UNKNOWN_SUMMON: SummonCard = { kind: TOKEN_KIND, ritual: false }

/** Una carta de Nivel 5 o más que sale de la mano con una Invocación Normal pidió Sacrificios (el núcleo no manda la jugada de Sacrificio aparte: la deduce la mesa). */
const TRIBUTE_LEVEL = 5

/**
 * El tipo de la llegada de una jugada de la mesa (`matEffects`): Fusión, Sincronía, Xyz y Enlace son el suyo (también sin materiales, desde el Extra); un Ritual que sale de la mano con una Invocación Especial, Ritual; por
 * Sacrificio (la jugada, o una Normal de Nivel 5 o más desde la mano), rojo; lo demás, Normal o Especial.
 */
export function landingToneOf(landing: { tone: LandingTone; tribute?: true; hand?: true; extra?: true; pendulum?: true }, card: SummonCard): ArrivalTone {
  const { tone, tribute, hand, extra, pendulum } = landing
  if (tone !== 'normal' && tone !== 'special') return tone
  if (pendulum) return 'pendulum'
  if (extra) return arrivalToneOf({ from: 'extra' }, card)
  if (tone === 'special' && hand && card.ritual) return 'ritual'
  if (tribute || (tone === 'normal' && hand && (card.kind.level ?? 0) >= TRIBUTE_LEVEL)) return 'tribute'
  return 'special'
}

/** El tipo de lo que llegó al campo del rival (la mesa sólo ve su campo cambiar, `arrivals`): del Extra Deck, el de su marco; un Ritual que sale de su mano, Ritual; lo demás, Especial. */
export function arrivalToneOf(arrived: { from: 'extra' | 'other'; hand?: true }, card: SummonCard): ArrivalTone {
  const { kind } = card
  if (arrived.from === 'extra') return kind.link ? 'link' : kind.xyz ? 'xyz' : kind.synchro ? 'synchro' : kind.fusion ? 'fusion' : 'special'
  return arrived.hand && card.ritual ? 'ritual' : 'special'
}

/** Las que llevan la entrada larga: lo que sale del Extra Deck con su mecánica y el Ritual. */
export type EntranceKind = 'fusion' | 'synchro' | 'xyz' | 'link' | 'ritual'
export const entranceOf = (tone: ArrivalTone): EntranceKind | null => (tone === 'special' || tone === 'tribute' || tone === 'pendulum' ? null : tone)

/**
 * Lo que la mesa sabe con certeza que es una Invocación por Péndulo: la jugada de la mesa manual (`how: 'pendulum'`, lo eligió quien juega). En el automático no: el núcleo no dice cómo
 * se invocó (`spsummoning` no trae el tipo y el `move` no trae el motivo) y el adaptador lo deduce de «sale boca arriba del Extra» (`adapter.ts`, `arrival`), que deja afuera las de la
 * mano y mete las que saca un efecto. Ahí la llegada queda como Especial.
 */
export const surePendulum = <T extends { pendulum?: true }>(landing: T, auto: boolean): T => {
  if (!auto || !landing.pendulum) return landing
  const { pendulum: _, ...rest } = landing
  return rest as T
}

/**
 * Los tiempos de cada entrada, en ms desde que arranca (las líneas de tiempo de Master Duel, a 60 cuadros): `hit`, el golpe fuerte («StrongSummon»: la carta toca su casilla, el anillo, la
 * onda y la sacudida); `end`, el duelo sigue («StartCard»). `figure`, cuándo entra la figura del tipo; `accent`, su segundo tiempo (el agujero del Xyz, las estrellas de la Sincronía, las
 * flechas del Enlace, los fuegos del Ritual); `materials`, hasta cuándo convergen los materiales. Sincronía y Ritual tienen la corta de Master Duel (`short`), que saca la intro.
 */
export interface EntranceTiming {
  hit: number
  end: number
  figure: number
  accent: number
  materials: number
}
export const ENTRANCE: Record<EntranceKind, EntranceTiming & { short?: EntranceTiming }> = {
  fusion: { hit: 1817, end: 2583, figure: 0, accent: 900, materials: 1383 },
  xyz: { hit: 2683, end: 3467, figure: 0, accent: 850, materials: 1500 },
  link: { hit: 3633, end: 4117, figure: 1483, accent: 2183, materials: 1733 },
  synchro: { hit: 4083, end: 4600, figure: 0, accent: 1850, materials: 1850, short: { hit: 2750, end: 3483, figure: 167, accent: 517, materials: 1167 } },
  ritual: { hit: 4700, end: 5200, figure: 1333, accent: 1833, materials: 1833, short: { hit: 2367, end: 2833, figure: 167, accent: 667, materials: 1100 } },
}

/**
 * Lo común a todas: el velo negro (alfa 0,6) entra en 167 ms y se va en los últimos 170; la revelación arranca 850 ms antes del golpe; la carta cae grande de ×2 a ×1,15 en 567 ms y a su
 * tamaño en el golpe (`--ease-revelar`), con el aplastón de nuestra carta (93 %, `card-lift.ts`) en los 150 ms que siguen; el brillo del marco («OverFrame») sale 600 ms después.
 */
export const ENTRANCE_COMMON = { veilIn: 167, veilOut: 170, veil: 0.6, reveal: 850, show: 100, fall: 567, squash: 0.93, settle: 150, overFrame: 600 } as const

/** Los tiempos de una entrada: la corta (si el tipo la tiene) cuando se pide. */
export const entranceTiming = (kind: EntranceKind, short = false): EntranceTiming => (short && ENTRANCE[kind].short) || ENTRANCE[kind]

/** Lo que agrega una entrada al duelo: hasta que sigue, menos lo que ya esperaba la llegada de siempre (el vuelo hasta tocar, `landedAt`). */
export const entranceCost = (kind: EntranceKind, landedAt: number, short = false) => Math.max(0, entranceTiming(kind, short).end - landedAt)

/** Lo que hace falta para dibujar una entrada: la casilla donde cae (en la pantalla), el arte, cuántos materiales y la carta de verdad (se esconde hasta que la de la entrada la toca). */
export interface EntranceInput {
  kind: EntranceKind
  short?: boolean
  cell: DOMRect
  art: string | null
  materials: number
  /** La carta de la mesa y el fantasma de su vuelo: no se ven hasta el golpe. */
  hide: readonly Element[]
  field: HTMLElement | null
  onDone: () => void
}

/** Las clases por tipo, enteras (Tailwind las lee del código): el borde de las cartas y los materiales, y el destello. */
const TONE: Record<EntranceKind, { border: string; flash: string }> = {
  fusion: { border: 'border-fx-fusion', flash: 'from-white via-fx-fusion/80' },
  synchro: { border: 'border-fx-sincronia', flash: 'from-white via-fx-sincronia/70' },
  xyz: { border: 'border-fx-xyz', flash: 'from-white via-fx-xyz/80' },
  link: { border: 'border-fx-enlace', flash: 'from-white via-fx-enlace/80' },
  ritual: { border: 'border-fx-ritual', flash: 'from-white via-fx-ritual/80' },
}

const ROOT = 'pointer-events-none fixed inset-0 z-[140] overflow-hidden'
const VEIL = 'absolute inset-0 bg-black opacity-0'
const STAGE = 'absolute left-1/2 top-1/2'
const PIECE = 'absolute opacity-0'
/** Un disco que se desvanece hacia el borde (una máscara quieta: no se anima). */
const SOFT = 'rounded-full mask-radial-from-20% mask-radial-to-70%'
const MATERIAL = 'absolute -ml-3.5 -mt-5 h-10 w-7 border-2 bg-black/70 outline-1 outline-black/40 opacity-0'
const FLASH = 'absolute rounded-full bg-radial to-transparent to-70% opacity-0 mix-blend-plus-lighter'
const CARD_PATH = 'absolute opacity-0'
const CARD_FACE = 'size-full border-2 bg-black object-cover outline-2 outline-black/40'

type Add = (element: HTMLElement, frames: Keyframe[], duration: number, delay: number, easing?: string) => void

function el(parent: Element, className: string, size?: number | readonly [number, number]): HTMLSpanElement {
  const span = document.createElement('span')
  span.className = className
  if (size !== undefined) {
    const [w, h] = typeof size === 'number' ? [size, size] : size
    Object.assign(span.style, { width: `${Math.round(w)}px`, height: `${Math.round(h)}px`, marginLeft: `${-Math.round(w / 2)}px`, marginTop: `${-Math.round(h / 2)}px` })
  }
  parent.append(span)
  return span
}

const lite = () => document.documentElement.dataset.effects === 'lite'

/** ¿Va la entrada larga? Con «Livianos» no (la llegada de siempre, rápida); con movimiento reducido, tampoco (el fundido de siempre). */
export const entranceAllowed = () => typeof document !== 'undefined' && typeof document.body.animate === 'function' && !prefersReducedMotion() && !lite()

/** Una figura que entra a `from` ms, se queda y se va hasta `to`: alfa y escala, con su giro (grados) si gira. */
const keep = (from: number, to: number, total: number, scale: readonly [number, number], alpha = 1, spin = 0): Keyframe[] => {
  const s = (ms: number) => Math.min(1, Math.max(0, ms / total))
  return [
    { offset: 0, scale: `${scale[0]}`, opacity: 0, rotate: '0deg', easing: EASE_OUT },
    { offset: s(from + 200), opacity: alpha },
    { offset: s(to - 200), opacity: alpha },
    { offset: 1, scale: `${scale[1]}`, opacity: 0, rotate: `${spin}deg` },
  ]
}

/** La figura de cada tipo, en el centro (`stage`), con su radio `r` (px). Cada pieza se anima sola; las del mismo tiempo, en un grupo. */
function figureOf(kind: EntranceKind, stage: HTMLElement, t: EntranceTiming, r: number, add: Add) {
  const until = t.hit + 150
  switch (kind) {
    case 'fusion': {
      // El remolino: dos discos cónicos que giran al revés (violeta con su calor y su frío) y se cierran; el destello del centro a los 900 ms.
      const span = until - t.figure
      add(el(stage, `${PIECE} ${SOFT} bg-conic from-fx-fusion via-transparent via-40% to-fx-fusion mix-blend-plus-lighter`, 2.2 * r), keep(0, span, span, [0.3, 0.6], 0.85, 540), span, t.figure)
      add(el(stage, `${PIECE} ${SOFT} bg-conic from-fx-fusion-calor/60 via-fx-fusion-frio/60 to-fx-fusion-calor/60 mix-blend-plus-lighter`, 1.8 * r), keep(0, span, span, [1.2, 0.2], 0.7, -360), span, t.figure)
      add(el(stage, `${FLASH} from-white via-fx-fusion/80`, 1.2 * r), [{ scale: '0.3', opacity: 0, easing: EASE_OUT }, { scale: '1', opacity: 1, offset: 167 / 767 }, { scale: '1.4', opacity: 0 }], 767, t.accent)
      return
    }
    case 'xyz': {
      // La galaxia (dos brazos cónicos dorados que giran lento), el agujero que se abre y se cierra a los 850 ms y la explosión dorada cuando se cierra.
      const span = until - t.figure
      add(el(stage, `${PIECE} ${SOFT} bg-conic from-transparent via-fx-xyz/70 via-25% to-transparent to-50% mix-blend-plus-lighter`, 2.4 * r), keep(0, span, span, [0.5, 1.1], 0.8, 160), span, t.figure)
      add(el(stage, `${PIECE} ${SOFT} bg-conic from-transparent from-50% via-fx-xyz-brasa/60 via-75% to-transparent mix-blend-plus-lighter`, 2 * r), keep(0, span, span, [0.6, 1], 0.7, 120), span, t.figure)
      add(el(stage, `${PIECE} rounded-full border-2 border-fx-xyz bg-black outline-4 outline-fx-xyz-brasa/40`, 0.9 * r), [{ scale: '0', opacity: 0, easing: EASE_SNAP }, { scale: '1', opacity: 1, offset: 0.3 }, { scale: '0.15', opacity: 1, offset: 0.95 }, { scale: '0', opacity: 0 }], 1000, t.accent)
      add(el(stage, `${PIECE} rounded-full border-4 border-fx-xyz outline-2 outline-black/40`, 2 * r), [{ scale: '0.1', opacity: 1, easing: EASE_OUT }, { scale: '1.6', opacity: 0 }], 700, t.accent + 933)
      add(el(stage, `${FLASH} from-white via-fx-xyz/80`, 1.4 * r), [{ scale: '0.4', opacity: 0, easing: EASE_OUT }, { scale: '1', opacity: 1, offset: 0.3 }, { scale: '1.5', opacity: 0 }], 560, t.accent + 933)
      return
    }
    case 'link': {
      // Los trazos que llegan derechos (de los costados y de arriba y abajo: nada en diagonal), la puerta cuadrada y las ocho flechas del Enlace que se encienden de a una.
      const bars = el(stage, `${PIECE} size-0`)
      for (const [w, h, x, y] of [[2 * r, 2, -1, 0], [2 * r, 2, 1, 0], [2, 2 * r, 0, -1], [2, 2 * r, 0, 1]] as const) {
        const bar = el(bars, `absolute bg-fx-enlace outline-1 outline-black/40`, [w, h])
        add(bar, [{ translate: `${x * 2 * r}px ${y * 2 * r}px`, easing: EASE_OUT }, { translate: '0px 0px' }], 500, t.figure)
      }
      add(bars, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], 800, t.figure)
      const gate = until - (t.figure + 250)
      add(el(stage, `${PIECE} border-2 border-fx-enlace bg-fx-enlace/15 outline-2 outline-black/40`, 1.1 * r), keep(0, gate, gate, [0.2, 1.2]), gate, t.figure + 250)
      const arrows = el(stage, `${PIECE} size-0`)
      for (let index = 0; index < 8; index += 1) {
        const arrow = el(arrows, `absolute -ml-2 -mt-2 size-4 border-r-3 border-t-3 border-fx-enlace opacity-0`)
        arrow.style.transform = `rotate(${index * 45 - 45}deg) translate(${Math.round(0.8 * r)}px, 0) rotate(45deg)`
        add(arrow, [{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 1 }], 300, t.accent + index * 120)
      }
      add(arrows, keep(0, until - t.accent, until - t.accent, [1, 1.15]), until - t.accent, t.accent)
      return
    }
    case 'synchro': {
      // Tres anillos blancos, las estrellas verdes que se alinean en el medio y la columna de luz verde que las atraviesa.
      for (const [index, size] of [0.6, 1, 1.4].entries()) {
        const from = t.figure + index * 250
        add(el(stage, `${PIECE} rounded-full border-2 border-white/85 outline-2 outline-fx-sincronia/30`, size * r), keep(0, until - from, until - from, [0.2, 1.6]), until - from, from)
      }
      const stars = el(stage, `${PIECE} size-0`)
      for (let index = 0; index < 5; index += 1) {
        const star = el(stars, `absolute -ml-1.5 -mt-1.5 size-3 rotate-45 bg-fx-sincronia outline-1 outline-white/70`)
        add(star, [{ translate: `${Math.round((index - 2) * 0.45 * r)}px 0px`, easing: EASE_IN_OUT }, { translate: `${Math.round((index - 2) * 0.45 * r)}px 0px`, offset: 0.4 }, { translate: '0px 0px' }], 833, t.accent)
      }
      add(stars, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], 833, t.accent)
      const beam = until - (t.accent + 700)
      add(el(stage, `${PIECE} origin-center bg-linear-to-b from-transparent via-fx-sincronia/80 to-transparent mix-blend-plus-lighter`, [Math.round(0.35 * r), Math.round(window.innerHeight)]), [{ scale: '1 0', opacity: 0, easing: EASE_OUT }, { scale: '1 1', opacity: 1, offset: 0.3 }, { scale: '0.4 1', opacity: 0 }], beam, t.accent + 700)
      return
    }
    case 'ritual': {
      // Cinco círculos azules (dos y después tres), ocho fuegos alrededor que se prenden uno cada 67 ms y la luz del círculo que se enciende antes del golpe.
      for (const [index, size] of [0.5, 0.75, 1, 1.25, 1.5].entries()) {
        const from = t.figure + (index < 2 ? 0 : 383)
        add(el(stage, `${PIECE} rounded-full border-2 border-fx-ritual outline-1 outline-black/40`, size * r), keep(0, until - from, until - from, [0.6, 1.05]), until - from, from)
      }
      for (let index = 0; index < 8; index += 1) {
        const angle = (index * Math.PI) / 4
        const fire = el(stage, `absolute -ml-2 -mt-6 h-8 w-4 origin-bottom rounded-full bg-radial from-white via-fx-ritual/90 via-40% to-transparent opacity-0 mix-blend-plus-lighter`)
        fire.style.left = `${Math.round(Math.cos(angle) * 0.68 * r)}px`
        fire.style.top = `${Math.round(Math.sin(angle) * 0.68 * r)}px`
        const from = t.accent + index * 67
        const span = t.hit - 150 - from
        add(fire, [{ scale: '1 0', opacity: 0, easing: EASE_SNAP }, { scale: '1 1', opacity: 1, offset: Math.min(0.5, 200 / span) }, { scale: '1 1.15', opacity: 1, offset: 0.9 }, { scale: '1 0.6', opacity: 0 }], span, from)
      }
      add(el(stage, `${FLASH} from-white/90 via-fx-ritual/70`, 1.6 * r), [{ scale: '0.8', opacity: 0, easing: EASE_OUT }, { scale: '1', opacity: 0.9, offset: 233 / 450 }, { scale: '1.1', opacity: 0 }], 450, t.hit - 184)
      return
    }
  }
}

/**
 * Los materiales que convergen al centro hasta `t.materials`: llegan derechos de los costados (nada en diagonal); en la Fusión y el Xyz el grupo gira y la convergencia es un remolino.
 * Más materiales, más cartas (hasta 6: las variantes de Master Duel van por cantidad), sin pasar el tiempo del tipo.
 */
function materialsOf(kind: EntranceKind, root: HTMLElement, t: EntranceTiming, count: number, r: number, add: Add) {
  const n = Math.max(1, Math.min(6, count || 2))
  const group = el(root, STAGE)
  for (let index = 0; index < n; index += 1) {
    const side = index % 2 === 0 ? -1 : 1
    const row = Math.floor(index / 2) - (Math.ceil(n / 2) - 1) / 2
    const card = el(group, `${MATERIAL} ${TONE[kind].border}`)
    add(card, [
      { translate: `${Math.round(side * 1.35 * r)}px ${Math.round(row * 0.5 * r)}px`, scale: '1', opacity: 0, easing: EASE_IN_OUT },
      { opacity: 1, offset: 0.12 },
      { opacity: 1, offset: 0.85 },
      { translate: '0px 0px', scale: '0.3', opacity: 0 },
    ], t.materials, 0)
  }
  if (kind === 'fusion' || kind === 'xyz') add(group, [{ rotate: '0deg', easing: EASE_IN_OUT }, { rotate: '300deg' }], t.materials, 0)
}

/**
 * La entrada larga: el velo, la figura del tipo, los materiales que convergen, la carta que cae grande hasta su casilla, el golpe fuerte (la llegada fuerte del color del tipo, con su
 * onda y la sacudida) y el brillo del marco. La carta de verdad no se ve hasta el golpe. Devuelve la animación del velo (dura hasta que el duelo sigue: su final es `onDone`), o `null` si
 * no va (`entranceAllowed`).
 */
export function playEntrance({ kind, short = false, cell, art, materials, hide, field, onDone }: EntranceInput): Animation | null {
  if (!entranceAllowed()) return null

  const t = entranceTiming(kind, short)
  const c = ENTRANCE_COMMON
  const root = document.createElement('div')
  root.className = ROOT
  root.dataset.fx = 'entrance'
  root.dataset.entrance = kind
  root.setAttribute('aria-hidden', 'true')
  document.body.append(root)
  const add: Add = (element, frames, duration, delay, easing) => {
    cancelWhenDone(element.animate(frames, { duration: Math.max(1, Math.round(duration)), delay: Math.round(delay), ...(easing ? { easing } : {}) }))
  }
  const [vw, vh] = [window.innerWidth, window.innerHeight]
  const r = Math.min(vw, vh) * 0.36

  // La carta de la mesa y el fantasma de su vuelo, escondidos hasta que la de la entrada toca la casilla.
  for (const element of hide) cancelWhenDone(element.animate([{ opacity: 0 }, { opacity: 0 }], { duration: t.hit + c.settle }))

  const veil = el(root, VEIL)
  const stage = el(root, STAGE)
  figureOf(kind, stage, t, r, add)
  materialsOf(kind, root, t, materials, r, add)

  // La revelación: el destello en el centro (de ×1 a ×2 en 500 ms; sube en 167 y se apaga en 333) y la carta que cae grande hasta su casilla.
  const reveal = t.hit - c.reveal
  add(el(stage, `${FLASH} ${TONE[kind].flash}`, 0.9 * r), [{ scale: '1', opacity: 0, easing: EASE_OUT }, { scale: '1.4', opacity: 1, offset: 1 / 3 }, { scale: '2', opacity: 0 }], 500, reveal)
  const path = el(root, CARD_PATH)
  Object.assign(path.style, { left: `${Math.round(cell.left)}px`, top: `${Math.round(cell.top)}px`, width: `${Math.round(cell.width)}px`, height: `${Math.round(cell.height)}px` })
  const face = el(path, 'block size-full')
  const image = document.createElement(art ? 'img' : 'span')
  image.className = `${CARD_FACE} ${TONE[kind].border} block`
  if (art && image instanceof HTMLImageElement) {
    image.src = art
    image.alt = ''
    image.decoding = 'async'
  }
  face.append(image)
  const big = Math.max(1, Math.min((0.42 * vw) / Math.max(1, cell.width), (0.62 * vh) / Math.max(1, cell.height)))
  const total = c.reveal + c.settle
  const at = (ms: number) => Math.round((ms / total) * 1000) / 1000
  const [dx, dy] = [Math.round(vw / 2 - (cell.left + cell.width / 2)), Math.round(vh / 2 - (cell.top + cell.height / 2))]
  add(path, [
    { offset: 0, translate: `${dx}px ${dy}px`, opacity: 0 },
    { offset: at(c.show), translate: `${dx}px ${dy}px`, opacity: 1, easing: EASE_IN_OUT },
    { offset: at(c.reveal), translate: '0px 0px', opacity: 1 },
    { offset: 1, translate: '0px 0px', opacity: 1 },
  ], total, reveal)
  add(face, [
    { offset: 0, scale: `${r2(2 * big)}` },
    { offset: at(c.show), scale: `${r2(2 * big)}`, easing: EASE_REVELAR },
    { offset: at(c.show + c.fall), scale: `${r2(1.15 * big)}`, easing: EASE_REVELAR },
    { offset: at(c.reveal), scale: `${c.squash}`, easing: EASE_SNAP },
    { offset: 1, scale: '1' },
  ], total, reveal)

  // El golpe: la llegada fuerte del color del tipo y la sacudida; el brillo del marco, 600 ms después.
  const [x, y] = [cell.left + cell.width / 2, cell.top + cell.height / 2]
  arriveAt(x, y, t.hit, { tone: kind, strong: true, unit: cell.width })
  shakeField(field, 'strong', t.hit)
  overFrameAt(x, y, cell.width, cell.height, t.hit + c.overFrame, kind)

  const master = veil.animate(
    [
      { offset: 0, opacity: 0, easing: EASE_OUT },
      { offset: c.veilIn / t.end, opacity: c.veil },
      { offset: 1 - c.veilOut / t.end, opacity: c.veil },
      { offset: 1, opacity: 0 },
    ],
    { duration: t.end },
  )
  let done = false
  const finish = () => {
    if (done) return
    done = true
    root.remove()
    onDone()
  }
  master.addEventListener('finish', () => {
    master.cancel()
    finish()
  })
  master.addEventListener('cancel', finish)
  return master
}

const r2 = (value: number) => Math.round(value * 100) / 100

/**
 * La Invocación por Péndulo (`SummonPendulum01TL` de Master Duel, ≈3700 ms). La referencia no trae las marcas de golpe ni de «sigue el duelo» (StrongSummon / StartCard): sólo sus piezas,
 * que se usan tal cual: a los 417 ms se muestran las dos escalas (3267 ms, hasta 3684: el final de la escena), a los 667 la luz (2900 ms), a los 1117 el péndulo (2300 ms) y a los 1483 la
 * bajada (1967 ms). Las cartas caen en esa bajada con la caída de las otras entradas (`ENTRANCE_COMMON.reveal`, 850 ms): tocan su casilla a los 2333 ms, de a una cada 67 ms si son varias.
 */
export const PENDULUM = { scales: 417, light: 667, lightMs: 2900, swing: 1117, swingMs: 2300, descent: 1483, end: 3684, every: 67 } as const
export const pendulumHit = (index = 0) => PENDULUM.descent + ENTRANCE_COMMON.reveal + index * PENDULUM.every

/** Una carta de la Invocación por Péndulo: su casilla (en la pantalla), su arte y lo que se esconde hasta que toca (la carta de la mesa y el fantasma de su vuelo). */
export interface PendulumCard {
  cell: DOMRect
  art: string | null
  hide: readonly Element[]
}

const SCALE = 'absolute bg-linear-to-t from-transparent to-transparent outline-1 outline-black/40 origin-bottom'
const GEM = 'absolute -ml-2 -mt-2 size-4 rotate-45 border-2 border-white outline-1 outline-black/40'

/**
 * Una sola escena para toda la Invocación por Péndulo, con todas sus cartas: el velo, las dos escalas que suben a los costados (azul y roja), la luz blanca entre ellas, el péndulo que
 * oscila colgado del medio y las cartas que bajan derechas (nada en diagonal) hasta su casilla; cada una con la llegada fuerte blanca y su brillo de marco, y una sola sacudida. Nadie juega
 * mientras dura (el velo, como en `playEntrance`). Devuelve la animación del velo, o `null` si no va (`entranceAllowed`: con «Livianos», la llegada blanca de siempre).
 */
export function playPendulum({ cards, field, onDone }: { cards: readonly PendulumCard[]; field: HTMLElement | null; onDone: () => void }): Animation | null {
  if (!entranceAllowed() || cards.length === 0) return null

  const c = ENTRANCE_COMMON
  const p = PENDULUM
  const root = document.createElement('div')
  root.className = ROOT
  root.dataset.fx = 'entrance'
  root.dataset.entrance = 'pendulum'
  root.setAttribute('aria-hidden', 'true')
  document.body.append(root)
  const add: Add = (element, frames, duration, delay, easing) => {
    cancelWhenDone(element.animate(frames, { duration: Math.max(1, Math.round(duration)), delay: Math.round(delay), ...(easing ? { easing } : {}) }))
  }
  const [vw, vh] = [window.innerWidth, window.innerHeight]
  const r = Math.min(vw, vh) * 0.36
  const veil = el(root, VEIL)

  // Las dos escalas: suben desde abajo a los costados y se quedan hasta el final; su gema arriba.
  const pillar = [Math.round(0.14 * r), Math.round(0.78 * vh)] as const
  for (const [x, color, gem] of [[0.1, 'via-fx-pendulo-azul/75', 'bg-fx-pendulo-azul'], [0.9, 'via-fx-pendulo-rojo/75', 'bg-fx-pendulo-rojo']] as const) {
    const group = el(root, `${PIECE} left-0 top-0 size-0`)
    group.style.translate = `${Math.round(x * vw)}px ${Math.round(vh / 2)}px`
    const bar = el(group, `${SCALE} ${color}`, pillar)
    add(bar, [{ scale: '1 0', easing: EASE_OUT }, { scale: '1 1' }], 400, p.scales)
    el(group, `${GEM} ${gem}`).style.top = `${-Math.round(pillar[1] / 2)}px`
    add(group, keep(0, p.end - p.scales, p.end - p.scales, [1, 1]), p.end - p.scales, p.scales)
  }
  // La luz blanca entre las escalas, de arriba hacia abajo.
  const light = el(root, `${PIECE} left-1/2 top-0 h-full origin-top bg-linear-to-b from-white/45 via-fx-pendulo-azul/20 to-transparent mix-blend-plus-lighter`)
  Object.assign(light.style, { width: `${Math.round(0.9 * r)}px`, marginLeft: `${-Math.round(0.45 * r)}px` })
  add(light, keep(0, p.lightMs, p.lightMs, [0.4, 1], 0.85), p.lightMs, p.light)
  // El péndulo, colgado arriba en el medio: oscila y se va apagando (gira; no se traslada).
  const swing = el(root, `${PIECE} left-1/2 top-1/12 size-0 origin-top`)
  const rod = el(swing, 'absolute -ml-px w-0.5 bg-white/85 outline-1 outline-black/40')
  const length = Math.round(0.3 * vh)
  rod.style.height = `${length}px`
  const bob = el(swing, 'absolute rounded-full border-2 border-white bg-radial from-white via-fx-pendulo-azul/80 to-fx-pendulo-rojo/80 outline-2 outline-black/40', Math.round(0.22 * r))
  bob.style.top = `${length}px`
  // Cada vaivén, más corto (se apaga): a lo sumo 18°, así la bola no sale de entre las escalas en el celular.
  const swings = [0, 18, -16, 12, -8, 4, 0]
  add(swing, swings.map((deg, index) => ({ offset: index / (swings.length - 1), rotate: `${deg}deg`, opacity: index === 0 || index === swings.length - 1 ? 0 : 1, easing: EASE_IN_OUT })), p.swingMs, p.swing)

  // Las cartas: bajan derechas desde arriba de la pantalla hasta su casilla (de ×1,6 a ×1,15 y a su tamaño, con el aplastón), de a una cada 67 ms.
  const total = c.reveal + c.settle
  const at = (ms: number) => Math.round((ms / total) * 1000) / 1000
  cards.forEach((card, index) => {
    const hit = pendulumHit(index)
    for (const element of card.hide) cancelWhenDone(element.animate([{ opacity: 0 }, { opacity: 0 }], { duration: hit + c.settle }))
    const path = el(root, CARD_PATH)
    Object.assign(path.style, { left: `${Math.round(card.cell.left)}px`, top: `${Math.round(card.cell.top)}px`, width: `${Math.round(card.cell.width)}px`, height: `${Math.round(card.cell.height)}px` })
    const face = el(path, 'block size-full')
    const image = document.createElement(card.art ? 'img' : 'span')
    image.className = `${CARD_FACE} block border-white`
    if (card.art && image instanceof HTMLImageElement) {
      image.src = card.art
      image.alt = ''
      image.decoding = 'async'
    }
    face.append(image)
    const fall = Math.round(card.cell.top + 2 * card.cell.height)
    const from = hit - c.reveal
    add(path, [
      { offset: 0, translate: `0px ${-fall}px`, opacity: 0 },
      { offset: at(c.show), translate: `0px ${-fall}px`, opacity: 1, easing: EASE_REVELAR },
      { offset: at(c.reveal), translate: '0px 0px', opacity: 1 },
      { offset: 1, translate: '0px 0px', opacity: 1 },
    ], total, from)
    add(face, [
      { offset: 0, scale: '1.6' },
      { offset: at(c.show), scale: '1.6', easing: EASE_REVELAR },
      { offset: at(c.show + c.fall), scale: '1.15', easing: EASE_REVELAR },
      { offset: at(c.reveal), scale: `${c.squash}`, easing: EASE_SNAP },
      { offset: 1, scale: '1' },
    ], total, from)
    const [x, y] = [card.cell.left + card.cell.width / 2, card.cell.top + card.cell.height / 2]
    arriveAt(x, y, hit, { tone: 'pendulum', strong: true, unit: card.cell.width })
    overFrameAt(x, y, card.cell.width, card.cell.height, hit + c.overFrame, 'pendulum')
  })
  shakeField(field, 'strong', pendulumHit())

  const master = veil.animate(
    [
      { offset: 0, opacity: 0, easing: EASE_OUT },
      { offset: c.veilIn / p.end, opacity: c.veil },
      { offset: 1 - c.veilOut / p.end, opacity: c.veil },
      { offset: 1, opacity: 0 },
    ],
    { duration: p.end },
  )
  let done = false
  const finish = () => {
    if (done) return
    done = true
    root.remove()
    onDone()
  }
  master.addEventListener('finish', () => {
    master.cancel()
    finish()
  })
  master.addEventListener('cancel', finish)
  return master
}
