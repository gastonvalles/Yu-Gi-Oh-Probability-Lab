import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

import { CARD_BACK, FX_RGB } from '../components/probability/practice-styles'
import { cardImageSrc } from './card-image-source'
import { EASE_IN_OUT, EASE_OUT, UI_ANIMATION_MS, cancelWhenDone, easeInOut, prefersReducedMotion } from './motion'
import { allMatIds, locateCard, type MatState } from './practice-mat'

/** Cuánto dura el vuelo más largo de una carta (de una punta de la mesa a la otra); uno corto dura menos (`flightMs`). */
export const FLIGHT_MS = UI_ANIMATION_MS * 2
/** Desde esta distancia (en px de la pantalla) un vuelo dura `FLIGHT_MS`; uno más corto, en proporción desde `UI_ANIMATION_MS`: entre dos casillas vecinas, unos 300 ms. */
const FULL_FLIGHT_PX = 600
/**
 * Cuándo toca la carta su lugar, en proporción del vuelo: con la curva de los vuelos (`EASE_IN_OUT`) ya hizo el 99 % del camino. Ahí la pila se pone al día
 * (su carta de arriba y su contador), da el golpe, y el fantasma se funde con ella en lo que queda.
 */
export const LANDING_AT = 0.85

/** Cuánto dura un vuelo de `distance` px: un salto corto (del deck al cementerio de al lado) no necesita lo que uno largo. */
export function flightMs(distance: number): number {
  return Math.round(UI_ANIMATION_MS + (FLIGHT_MS - UI_ANIMATION_MS) * Math.min(1, distance / FULL_FLIGHT_PX))
}
/**
 * Las cartas de una misma jugada que salen volando del mismo lugar (varias del deck, un Xyz que se va con sus materiales) salen una tras otra y no todas
 * juntas, como lo que entra con `stagger`: 70 ms entre una y la siguiente, hasta la 8.ª (las que siguen salen con ella).
 */
export const FLIGHT_STAGGER_MS = 70
const STAGGER_LIMIT = 8
/**
 * Más cartas que esto pasando de una pila a otra en un solo cambio no es una jugada (es otra mano, otro combo o un salto de varios pasos): esas no vuelan. Un lote (`batch`) mueve varias en
 * una jugada: 15 alcanza para un Pot of Desires (10 desterradas) con lugar de sobra.
 * ponytail: el techo es contar cartas, no saber si el cambio fue una jugada: un salto de varios pasos de un replay que mueva hasta 15 cartas de pila a pila también vuela. Si tiene que volar
 * un lote de más de 15 («Elegir todas» en un Main de 40), que la mesa le diga a `useCardFlights` si el cambio fue una sola jugada (el cursor avanzó uno) en vez de subir este número.
 */
const PILE_FLIGHT_LIMIT = 15
/** Cuánto después de una jugada (o de reacomodarse la mano) todo quedó quieto y se puede medir de nuevo: lo que más dura es un vuelo, y un poco más. */
const SETTLE_MS = FLIGHT_MS + 100
/**
 * Marca de los vuelos de las cartas a la vista. Una jugada que llega con uno a medias lo aparta un instante para medir la carta quieta y, si la carta sigue
 * yendo al mismo lugar, lo retoma donde iba: ningún vuelo se corta.
 */
const FLIGHT_ID = 'mat-flight'
/** Las pilas: lo que muestran (su carta de arriba, su contador) espera a que llegue la carta que viene volando. */
const PILES = new Set(['deck', 'extra', 'gy', 'banished'])
/**
 * La capa de los fantasmas: vuelan dentro de la mesa, debajo de las cartas grandes del centro (`Spotlight`, z 120), la pregunta y la pausa del duelo, y encima
 * del campo y la mano. Es también lo que vuela de un fantasma (su caja, `GHOST_CARD`, va adentro y es la que gira) y de la copia de `flyAbove`.
 */
const GHOST_LAYER = 'pointer-events-none fixed left-0 top-0 z-110'
/** La carta de un fantasma, dentro de lo que vuela: si se da vuelta en el camino gira ella sola, así el vuelo y el giro van cada uno en el compositor. */
const GHOST_CARD = 'absolute inset-0 overflow-hidden bg-input shadow-overlay'

/** Un rectángulo en la pantalla: el de un elemento o uno armado a mano (el lugar de una carta en la mano). */
type Box = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>
type Size = { width: number; height: number }

/** Lo medido de cada carta a la vista y lo que mostraba cada pila (una copia), la última vez que la mesa quedó quieta. */
interface Measure {
  state: MatState
  cards: Map<string, Snapshot>
  faces: Map<string, Face>
}

interface Snapshot {
  rect: DOMRect
  /** Tamaño de layout (sin transformaciones): el fantasma se dibuja con este, aunque la carta estuviera girada o en pleno vuelo al medirse. */
  width: number
  height: number
  art: string | null
  /** Era la carta soltada que espera en una zona que se elija cómo sale (`data-pending`): si se cancela, vuelve volando a la mano. */
  pending: boolean
}

/** Una copia de la carta que viaja por encima de todo (sin atrapar el puntero) desde donde estaba hasta su lugar nuevo. */
interface Ghost {
  id: string
  /** De dónde sale (se centra ahí), con su tamaño de layout. */
  from: Box
  size: Size
  art: string | null
  /** A dónde llega; null: se apaga donde estaba (una ficha que deja de existir). */
  to: Box | null
  /** La pila (o el Xyz) que la recibe y da el golpe al aterrizar. */
  home: HTMLElement | null
  /** Sale de dorso (del deck, del Extra, de lo desterrado boca abajo, de abajo de un Xyz, de la mano del rival) o llega de dorso. */
  startsHidden: boolean
  endsHidden: boolean
}

/** Cómo se marcan las cartas y las pilas de cada lado en el DOM: las propias (`data-card-id`, `data-drop`) o las del rival (`data-rival-card-id`, `data-rival-drop`). */
const SIDES = {
  mine: { card: 'data-card-id', cardKey: 'cardId', drop: 'data-drop', dropKey: 'drop' },
  theirs: { card: 'data-rival-card-id', cardKey: 'rivalCardId', drop: 'data-rival-drop', dropKey: 'rivalDrop' },
} as const
type Side = keyof typeof SIDES

/** Un valor para usar entre comillas en un selector de atributo: las comillas, las barras y los saltos de línea no lo cierran antes de tiempo. */
const quoted = (value: string) => value.replace(/["\\\n\r\f]/g, (char) => `\\${char.charCodeAt(0).toString(16)} `)

/** Dónde se dibuja la carta cuando no es una carta suelta (`data-card-id`): la pila donde está o el Xyz que la tiene de material. */
function homeOf(root: HTMLElement, state: MatState, id: string, side: Side): HTMLElement | null {
  const where = locateCard(state, id)

  try {
    if (where?.kind === 'pile') return root.querySelector<HTMLElement>(`[${SIDES[side].drop}="${quoted(where.pile)}"]`)
    // Debajo de una carta que sigue en el Extra Deck (`held`): se dibuja en el Extra.
    if (where?.kind === 'material' && state.held?.[where.of]) return root.querySelector<HTMLElement>(`[${SIDES[side].drop}="extra"]`)
    if (where?.kind === 'material') return root.querySelector<HTMLElement>(`[${SIDES[side].card}="${quoted(where.of)}"]`)
  } catch {
    // Un id que no se puede usar de selector: la carta no vuela, y nada más.
  }

  return null
}

const isHand = (element: HTMLElement | null, side: Side) => element?.dataset[SIDES[side].dropKey] === 'hand'

/** La mano es una fila de cartas, no una carta: se sale de ella (o se llega) por su medio, del tamaño de una de sus cartas (vacía, de `size`). */
function slotIn(hand: HTMLElement, size: Size): Box {
  const box = hand.getBoundingClientRect()
  const card = hand.querySelector('[role="img"] > span, [role="listitem"]')?.getBoundingClientRect()
  const { width, height } = card && card.width > 0 ? card : size

  return { left: centerX(box) - width / 2, top: centerY(box) - height / 2, width, height }
}

/** El rectángulo de un lugar de la mesa: el de su pila o su Xyz, y en la mano el de una carta en su medio (ver `slotIn`). */
const boxOf = (home: HTMLElement, side: Side, size: Size): Box => (isHand(home, side) ? slotIn(home, size) : home.getBoundingClientRect())

/** En qué pila está una carta o debajo de qué Xyz; null en una zona del campo (ahí siempre tiene elemento propio) o fuera de la mesa. */
function placeOf(state: MatState, id: string): string | null {
  const where = locateCard(state, id)

  return where?.kind === 'pile' ? where.pile : where?.kind === 'material' ? (state.held?.[where.of] ? 'extra' : `under:${where.of}`) : null
}

/** Boca abajo a donde va: al deck, al Extra (salvo boca arriba, un Monstruo de Péndulo), desterrada boca abajo o como material. */
function hiddenAt(state: MatState, id: string): boolean {
  const where = locateCard(state, id)

  if (where?.kind === 'material') return true
  return where?.kind === 'pile' && (where.pile === 'deck' || (where.pile === 'extra' && !state.extraUp.includes(id)) || (where.pile === 'banished' && state.facedown.includes(id)))
}

const centerX = (rect: Box) => rect.left + rect.width / 2
const centerY = (rect: Box) => rect.top + rect.height / 2
const near = (a: Box, b: Box) => Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1 && Math.abs(a.width - b.width) < 1
const distanceBetween = (a: Box, b: Box) => Math.hypot(centerX(a) - centerX(b), centerY(a) - centerY(b))

/** El tamaño con que sale una carta, por el lado largo (las cartas de costado) y acotado por si la medición agarró una animación a medias. */
const sizeRatio = (from: Box, to: Box) => Math.min(3, Math.max(0.3, Math.max(from.width, from.height) / Math.max(1, to.width, to.height)))

/** FLIP: transformación que lleva el elemento desde donde estaba (`from`) hasta donde está (`to`). */
function offset(from: Box, to: Box): string {
  return `translate(${centerX(from) - centerX(to)}px, ${centerY(from) - centerY(to)}px) scale(${sizeRatio(from, to)})`
}

interface Point {
  x: number
  y: number
}

/**
 * El campo inclinado (la vista 3D) como cuenta: su transformación (`perspective()` + `rotateX` + escalas: lleva un punto de su plano, en px desde su
 * `transform-origin`, a la pantalla) y dónde cae ese origen en la pantalla (no se mueve con la transformación). Sólo hace falta `transformPoint`.
 */
export interface Plane {
  matrix: Pick<DOMMatrixReadOnly, 'transformPoint'>
  origin: Point
  /** La transformación y su origen tal cual los computa el navegador (`matrix3d(…)`, `"195px 400px"`): la copia que vuela por encima (`flyAbove`) se inclina con ellos. */
  css?: { transform: string; origin: string }
}

/** Un punto del plano del campo (px desde su `transform-origin`) en la pantalla, con la división de la perspectiva. */
function project({ matrix, origin }: Plane, x: number, y: number): Point {
  const point = matrix.transformPoint({ x, y })

  return { x: origin.x + point.x / point.w, y: origin.y + point.y / point.w }
}

/** Dónde caen en el plano dos valores en px de un `transform-origin` (`"195px 400px"`). */
const originPx = (value: string): [number, number] => {
  const [x = 0, y = 0] = value.split(' ').map(parseFloat)

  return [x, y]
}

/**
 * El plano de un campo inclinado, con una sola lectura (sin escribir nada): su matriz y su `transform-origin`, y su rectángulo en la pantalla, que es el que
 * encierra sus cuatro esquinas ya inclinadas: de ahí sale dónde quedó el origen. Sin transformación (o sin `DOMMatrix`), null: se vuela como en el plano.
 */
function planeOf(field: HTMLElement): Plane | null {
  const style = getComputedStyle(field)

  if (typeof DOMMatrixReadOnly !== 'function' || !style.transform || style.transform === 'none') return null

  const plane = { matrix: new DOMMatrixReadOnly(style.transform), origin: { x: 0, y: 0 } }
  const [ox, oy] = originPx(style.transformOrigin)
  const [width, height] = [field.offsetWidth, field.offsetHeight]
  const corners = [project(plane, -ox, -oy), project(plane, width - ox, -oy), project(plane, width - ox, height - oy), project(plane, -ox, height - oy)]
  const box = field.getBoundingClientRect()

  return { ...plane, origin: { x: box.left - Math.min(...corners.map(({ x }) => x)), y: box.top - Math.min(...corners.map(({ y }) => y)) }, css: { transform: style.transform, origin: style.transformOrigin } }
}

/** Las esquinas de una carta (px desde su `transform-origin`) con su transformación propia (`base`: la de costado, la de una carta que gira). */
function cornersOf(element: HTMLElement, style: CSSStyleDeclaration, base: string): Point[] {
  const own = new DOMMatrixReadOnly(base === 'none' ? undefined : base)
  const [ox, oy] = originPx(style.transformOrigin)
  const width = parseFloat(style.width) || element.offsetWidth
  const height = parseFloat(style.height) || element.offsetHeight

  return [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ].map(([x, y]) => {
    const point = own.transformPoint({ x: x! - ox, y: y! - oy })

    return { x: point.x / point.w, y: point.y / point.w }
  })
}

/** El rectángulo de la pantalla que encierra una carta del campo (sus esquinas, `cornersOf`) puesta con su origen en `at` del plano: lo que mediría `getBoundingClientRect`. */
function seenAt(plane: Plane, corners: Point[], at: Point): Box {
  const points = corners.map((corner) => project(plane, at.x + corner.x, at.y + corner.y))
  const [xs, ys] = [points.map(({ x }) => x), points.map(({ y }) => y)]
  const [left, top] = [Math.min(...xs), Math.min(...ys)]

  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top }
}

/** Dónde poner la carta en el plano (`at`) para que se vea centrada en `goal`: Newton, con la pendiente de cada eje tomada a 1 px. */
function solve(plane: Plane, corners: Point[], goal: Point, start: Point): Point {
  const centerAt = (at: Point) => {
    const box = seenAt(plane, corners, at)

    return { x: centerX(box), y: centerY(box) }
  }
  let at = start

  for (let tries = 0; tries < 8; tries += 1) {
    const seen = centerAt(at)
    const miss = { x: goal.x - seen.x, y: goal.y - seen.y }

    if (Math.hypot(miss.x, miss.y) < 0.1) break

    const [right, down] = [centerAt({ x: at.x + 1, y: at.y }), centerAt({ x: at.x, y: at.y + 1 })]
    const [a, b, c, d] = [right.x - seen.x, down.x - seen.x, right.y - seen.y, down.y - seen.y]
    const det = a * d - b * c

    if (Math.abs(det) < 1e-6) break
    at = { x: at.x + (d * miss.x - b * miss.y) / det, y: at.y + (a * miss.y - c * miss.x) / det }
  }

  return at
}

/** Dónde está en el plano (px desde el `transform-origin` del campo) el origen de una carta que se ve en `box`: la cuenta inversa de `seenAt`. */
const planeCenter = (plane: Plane, corners: Point[], box: Box): Point => solve(plane, corners, { x: centerX(box), y: centerY(box) }, { x: centerX(box) - plane.origin.x, y: centerY(box) - plane.origin.y })

/** El centro de la caja de una carta con su origen en `at` del plano (sus esquinas, `cornersOf`, van desde su origen; con el origen en el medio, es `at`). */
function middleAt(at: Point, corners: Point[]): Point {
  const [xs, ys] = [corners.map(({ x }) => x), corners.map(({ y }) => y)]

  return { x: at.x + (Math.min(...xs) + Math.max(...xs)) / 2, y: at.y + (Math.min(...ys) + Math.max(...ys)) / 2 }
}

/**
 * Lo mismo en el campo inclinado (la vista 3D): la perspectiva achica lo lejano y agranda lo cercano, así que un desplazamiento medido en la pantalla no es el mismo
 * sobre la mesa, y menos lejos de la carta (la mano está fuera del campo: salía de una esquina, gigante). Se cuenta con la matriz del campo, sin tocar el DOM: dónde
 * está la carta en el plano (la que se ve en `to`), dónde tendría que estar para verse centrada en `from`, y el tamaño que la deja del tamaño que tenía ahí.
 */
export function tiltedOffset(plane: Plane, corners: Point[], from: Box, to: Box, here: Point = planeCenter(plane, corners, to)): string {
  const there = solve(plane, corners, { x: centerX(from), y: centerY(from) }, here)

  return `translate(${there.x - here.x}px, ${there.y - here.y}px) scale(${sizeRatio(from, seenAt(plane, corners, there))})`
}

/**
 * La pila (o el Xyz) que recibe una carta se infla un instante cuando la carta la toca (`at`: cuánto falta para eso). Va en `scale`, aparte de su `transform`:
 * un Xyz en defensa sigue acostado y uno que todavía llega volando no salta a su lugar, sin sumar animaciones (`add` no va en el compositor). Terminado se cancela, como todo lo que no rellena.
 */
function bump(element: HTMLElement, at: number) {
  cancelWhenDone(element.animate([{ scale: '1' }, { scale: '1.08', offset: 0.45 }, { scale: '1' }], { duration: 260, delay: at, easing: EASE_OUT }))
}

/** El color con que cada lugar recibe una carta: el cementerio, violeta; el destierro, ámbar; el deck y el Extra, celeste; debajo de un Xyz, azul. */
function impactRgb(state: MatState, id: string): string {
  const where = locateCard(state, id)

  if (where?.kind === 'material') return FX_RGB.indigo
  if (where?.kind === 'pile' && where.pile === 'gy') return FX_RGB.violet
  if (where?.kind === 'pile' && where.pile === 'banished') return FX_RGB.amber

  return FX_RGB.cyan
}

/**
 * Al aterrizar, el lugar da el golpe: un marco de su color que se enciende y se expande al apagarse, y un destello (pasa junto con `bump`, que lo infla). En una
 * pila el marco es una capa (`data-flight-hold`: no se copia ni se esconde con lo de la pila) con la sombra ya dibujada, y se anima sólo su `opacity` y su escala;
 * el destello es un `filter` solo: todo va en el compositor.
 * ponytail: un Xyz que recibe materiales recorta lo que tiene adentro (`overflow-hidden`), así que ahí el marco sigue en su `box-shadow` (hilo principal, pero
 * pasa sólo al darle materiales). Para sacarlo, el marco tendría que ir en la zona, con la caja y el giro de la carta.
 */
function impact(element: HTMLElement, rgb: string, at: number, pile: boolean) {
  const timing = { duration: 700, delay: at, easing: EASE_OUT }

  if (!pile) {
    cancelWhenDone(element.animate(
      [
        { boxShadow: `0 0 0 2px rgb(${rgb} / 1), 0 0 18px 3px rgb(${rgb} / 0.9)`, filter: 'brightness(1.9)' },
        { boxShadow: `0 0 0 2px rgb(${rgb} / 1), 0 0 22px 6px rgb(${rgb} / 0.7)`, filter: 'brightness(1.25)', offset: 0.4 },
        { boxShadow: `0 0 0 16px rgb(${rgb} / 0), 0 0 34px 10px rgb(${rgb} / 0)`, filter: 'brightness(1)' },
      ],
      timing,
    ))
    return
  }

  cancelWhenDone(element.animate([{ filter: 'brightness(1.9)' }, { filter: 'brightness(1.25)', offset: 0.4 }, { filter: 'brightness(1)' }], timing))

  const ring = document.createElement('span')
  ring.className = 'pointer-events-none absolute inset-0'
  ring.dataset.flightHold = ''
  ring.setAttribute('aria-hidden', 'true')
  // Apagado hasta que la carta toca la pila (la espera, `delay`, no lleva cuadros).
  Object.assign(ring.style, { borderRadius: 'inherit', opacity: '0', boxShadow: `0 0 0 2px rgb(${rgb} / 1), 0 0 22px 6px rgb(${rgb} / 0.8)` })
  element.append(ring)

  const glow = ring.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0.85, transform: 'scale(1.04)', offset: 0.4 }, { opacity: 0, transform: 'scale(1.25)' }], timing)
  const remove = () => ring.remove()
  glow.onfinish = remove
  glow.oncancel = remove
}

/**
 * Una copia de lo que se ve en una pila (su carta de arriba o su dorso, el grosor, el contador): mientras una carta viene volando, la pila la sigue mostrando
 * así, sin adelantarse. Es sólo una imagen: no se toca, no se enfoca, no se lee y no repite las animaciones de lo copiado (el barajado, el tirón del mazo).
 */
function faceOf(pile: HTMLElement): HTMLElement {
  const face = document.createElement('span')
  face.className = 'pointer-events-none absolute inset-0'
  face.dataset.flightHold = ''
  face.setAttribute('aria-hidden', 'true')
  face.setAttribute('inert', '')

  for (const child of pile.children) if (!(child instanceof HTMLElement && 'flightHold' in child.dataset)) face.append(child.cloneNode(true))
  for (const element of face.querySelectorAll<HTMLElement | SVGElement>('*')) element.style.animation = 'none'
  // La carta de arriba recién llegada puede estar todavía transparente (`CardArt` la funde al terminar de cargar): la copia se ve apenas tenga la imagen, y la pide ya.
  for (const image of face.querySelectorAll('img')) {
    image.loading = 'eager'
    image.style.opacity = '1'
  }

  return face
}

/** La copia de una pila (`faceOf`), con lo que definía cómo se veía (`pileKey`) y si se hizo en esta jugada (`fresh`: su carta de arriba puede no haber cargado todavía). */
interface Face {
  key: string
  face: HTMLElement
  fresh: boolean
}

/** Lo que define cómo se ve una pila: sus cartas, en orden, y cuáles están boca abajo o boca arriba. Mientras no cambie, su copia sirve. */
function pileKey(state: MatState, name: string): string {
  const ids: string[] = PILES.has(name) ? state[name as 'deck' | 'extra' | 'gy' | 'banished'] : []

  return `${ids.join(',')}|${ids.filter((id) => state.facedown.includes(id) || state.extraUp.includes(id)).join(',')}`
}

/**
 * Lo que muestra cada pila de un lado ahora (por su nombre): la mano no, que es una fila de cartas con elemento propio. Sólo se copian las pilas que cambiaron
 * desde la última copia (`before`), y al quedar quieta la mesa (`settle`) se vuelven a copiar las recién copiadas, ya con su imagen.
 */
function facesOf(root: HTMLElement, side: Side, state: MatState, before: ReadonlyMap<string, Face> | undefined, settle = false): Map<string, Face> {
  const faces = new Map<string, Face>()

  for (const pile of root.querySelectorAll<HTMLElement>(`[${SIDES[side].drop}]`)) {
    const name = pile.dataset[SIDES[side].dropKey]

    if (!name || !PILES.has(name)) continue

    const key = pileKey(state, name)
    const kept = before?.get(name)

    faces.set(name, kept?.key === key && !(settle && kept.fresh) ? kept : { key, face: faceOf(pile), fresh: !settle })
  }

  return faces
}

/**
 * La pila que recibe cartas sigue mostrando lo de antes (`face`) hasta que llega la última (`until`, en ms): lo nuevo queda escondido debajo y aparece de una,
 * junto con el contador, cuando la carta que vuela la tapa. Devuelve cómo soltarla antes (otra jugada a mitad de camino).
 */
function hold(pile: HTMLElement, face: HTMLElement, until: number): () => void {
  // Lo de la pila, no lo que le pone el vuelo (otra copia que espera, el marco del golpe).
  const hidden = [...pile.children].filter((child) => !(child instanceof HTMLElement && 'flightHold' in child.dataset)).map((child) => child.animate([{ opacity: 0 }, { opacity: 0 }], { duration: until }))
  pile.append(face)

  const release = () => {
    face.remove()
    for (const animation of hidden) animation.cancel?.()
  }
  const shown = face.animate([{ opacity: 1 }, { opacity: 1 }], { duration: until })
  shown.onfinish = release
  shown.oncancel = release

  return release
}

/** Dónde queda el (0, 0) de lo `fixed` dentro de la mesa: la pantalla, salvo que algo de afuera esté transformado (una pantalla que entra deslizándose). */
function originOf(root: HTMLElement): { x: number; y: number } {
  const probe = document.createElement('div')
  probe.className = 'pointer-events-none fixed left-0 top-0'
  root.append(probe)
  const { left, top } = probe.getBoundingClientRect()
  probe.remove()

  return { x: left, y: top }
}

/**
 * Las cartas que estaban a la vista (en la mano, en el campo) y ya no tienen elemento: viajan hasta su pila, hasta el Xyz que las tiene de material o hasta
 * la mano (que todavía no la dibuja); una que ya no está en la mesa (una ficha) se apaga donde estaba. La que se fue en pleno vuelo sale de donde se veía (`seen`).
 */
function leavingGhosts(root: HTMLElement, side: Side, state: MatState, left: ReadonlyMap<string, Snapshot>, current: ReadonlyMap<string, unknown>, seen: ReadonlyMap<string, Box>): Ghost[] {
  return [...left].flatMap(([id, snapshot]) => {
    if (current.has(id)) return []

    const home = homeOf(root, state, id, side)
    const size = { width: snapshot.width, height: snapshot.height }

    return [{ id, from: seen.get(id) ?? snapshot.rect, size, art: snapshot.art, to: home ? boxOf(home, side, size) : null, home, startsHidden: false, endsHidden: hiddenAt(state, id) }]
  })
}

/**
 * Las cartas que no tienen elemento propio ni antes ni después de la jugada y cambiaron de lugar: de una pila a otra (del deck al cementerio, del cementerio
 * al destierro, del Extra al cementerio…), un material que se desprende de su Xyz o que se le pone desde una pila, y lo que entra o sale de la mano del rival
 * (que son sólo dorsos). Salen de dorso de donde no se ven y se dan vuelta en el camino si llegan a la vista. La mano propia no entra: sus cartas tienen
 * elemento y la reparte ella.
 */
function pileGhosts(root: HTMLElement, side: Side, before: MatState, state: MatState, left: ReadonlyMap<string, Snapshot>, current: ReadonlyMap<string, unknown>, artOf: (id: string) => string | null): Ghost[] {
  const moved = allMatIds(state).filter((id) => {
    if (left.has(id) || current.has(id)) return false

    const from = placeOf(before, id)
    const to = placeOf(state, id)

    return from !== null && to !== null && from !== to && (side === 'theirs' || (from !== 'hand' && to !== 'hand'))
  })

  if (moved.length > PILE_FLIGHT_LIMIT) return []

  return moved.flatMap((id) => {
    const source = homeOf(root, before, id, side)
    const home = homeOf(root, state, id, side)
    const where = locateCard(before, id)
    // Un material cuyo Xyz se fue en esta misma jugada sale de donde estaba el Xyz.
    const xyz = !source && where?.kind === 'material' ? left.get(where.of) : undefined

    if ((!source && !xyz) || !home) return []

    // El fantasma mide lo que la pila (o el Xyz) de una de las puntas; la mano no sirve, es una fila de cartas.
    const sizer = source && !isHand(source, side) ? source : xyz ? null : home
    const size = sizer ? { width: sizer.offsetWidth, height: sizer.offsetHeight } : { width: xyz!.width, height: xyz!.height }

    return [{ id, from: source ? boxOf(source, side, size) : xyz!.rect, size, art: artOf(id), to: boxOf(home, side, size), home, startsHidden: hiddenAt(before, id) || isHand(source, side), endsHidden: hiddenAt(state, id) }]
  })
}

/** Cuándo sale un fantasma y cuánto tarda (`delay`, `duration`), y cuándo se funde con su lugar (`release`: cuando llegó la última carta que va a esa pila), en ms desde la jugada. */
interface Launch {
  delay: number
  duration: number
  release: number
}

/**
 * Lanza un fantasma: sale de donde estaba la carta, sube apenas a mitad de camino y llega a su lugar con la curva de los vuelos (arranca y llega suave). Si sale
 * de dorso o llega boca abajo, se da vuelta en el aire: de canto justo a mitad de camino. Escalonado, espera quieto en su lugar; al llegar se queda hasta que
 * la pila se pone al día (`release`) y se funde con ella.
 */
function fly(ghost: Ghost, side: Side, layer: HTMLElement, origin: { x: number; y: number }, { delay, duration, release }: Launch): void {
  const { from, size, art, to } = ghost
  const { width, height } = size
  // Sale centrado donde estaba la carta, con su tamaño de layout (no el del rect, que puede ser el de una carta girada o en vuelo).
  const left = centerX(from) - width / 2 - origin.x
  const top = centerY(from) - height / 2 - origin.y
  const element = document.createElement('div')
  element.className = GHOST_LAYER
  // Con su id: la carta grande del centro sale de ella si la carta se muestra mientras vuela a su pila (`cardPose`).
  element.dataset.flightGhost = ghost.id
  element.setAttribute('aria-hidden', 'true')
  element.style.width = `${width}px`
  element.style.height = `${height}px`
  // Las cartas del rival miran hacia él: el fantasma viaja de cabeza, como se ve en su campo y en sus pilas.
  const turn = side === 'theirs' ? ' rotate(180deg)' : ''
  element.style.transform = `translate(${left}px, ${top}px)${turn}`
  const card = document.createElement('div')
  card.className = GHOST_CARD
  element.append(card)

  // La cara por el proxy de imágenes y con la misma dirección que ya dibujó la mesa (sale de la caché); de una carta que no se ve, sólo el dorso.
  if (art) {
    const image = document.createElement('img')
    image.src = cardImageSrc(art)
    image.alt = ''
    image.className = 'block h-full w-full object-cover'
    card.append(image)
  }

  // Todo va con la misma curva y el mismo reloj: el camino, el giro y el cambio de cara. Esperando su turno (escalonada) se queda quieta donde estaba, y al
  // llegar se queda en su lugar (`fill`) hasta fundirse.
  const timing = { duration, delay, fill: 'both' as const, easing: EASE_IN_OUT }
  const flips = art !== null && ghost.startsHidden !== ghost.endsHidden

  if (!art || ghost.startsHidden || ghost.endsHidden) {
    const back = document.createElement('span')
    back.className = CARD_BACK
    card.append(back)

    // De canto (a mitad de camino) se cambia una cara por la otra: el dorso aparece (llega boca abajo) o se va (sale de dorso y llega a la vista).
    if (flips) {
      const shown = ghost.endsHidden ? [0, 1] : [1, 0]
      back.animate([{ opacity: shown[0] }, { opacity: shown[0], offset: 0.5 }, { opacity: shown[1], offset: 0.5 }, { opacity: shown[1] }], timing)
    }
  }

  layer.append(element)
  const landing = to ? { x: to.left + (to.width - width) / 2 - origin.x, y: to.top + (to.height - height) / 2 - origin.y, scale: to.width / Math.max(1, width) } : { x: left, y: top, scale: 0.6 }
  // A mitad de camino, un poco más grande: la carta va por el aire (el camino sigue derecho).
  const middle = `translate(${(left + landing.x) / 2}px, ${(top + landing.y) / 2}px) scale(${((1 + landing.scale) / 2) * 1.06})${turn}`
  const end = `translate(${landing.x}px, ${landing.y}px) scale(${landing.scale})${turn}`
  const flight = element.animate([{ transform: element.style.transform, opacity: 1 }, { transform: middle, opacity: 1 }, { transform: end, opacity: to ? 1 : 0 }], timing)
  const remove = () => element.remove()
  flight.oncancel = remove

  if (to) {
    // Se funde con la carta de arriba de su lugar en lo que le queda al vuelo, cuando la pila ya muestra lo nuevo debajo.
    const fade = element.animate([{ opacity: 1 }, { opacity: 0 }], { duration: Math.round(duration * (1 - LANDING_AT)), delay: release, fill: 'both', easing: EASE_OUT })
    fade.onfinish = remove
    fade.oncancel = remove
  } else {
    flight.onfinish = remove
  }

  // El giro en 3D, en la carta de adentro (el vuelo va en la de afuera): de canto a mitad de camino y abierto del otro lado al llegar.
  if (flips) {
    card.animate(
      [
        { transform: 'perspective(700px) rotateY(0deg)' },
        { transform: 'perspective(700px) rotateY(90deg)', offset: 0.5 },
        { transform: 'perspective(700px) rotateY(-90deg)', offset: 0.5 },
        { transform: 'perspective(700px) rotateY(0deg)' },
      ],
      timing,
    )
  }
}

/**
 * Una carta que sale de la mano al campo (una invocación, una magia que se activa o se coloca) pasa por encima de sus vecinas. La carta de la zona está
 * dentro del campo, que es su propio contexto de apilado (`isolate` y, en la vista 3D, su inclinación), y las cartas de la mano se pintan encima del campo
 * entero: volando, pasaba por debajo de ellas. Subir el campo de `z-index` mientras vuela no alcanza: en un duelo la mano sube contra el campo, y la placa
 * (que sobresale abajo, con su sombra) taparía la franja de arriba de toda la mano. Vuela entonces una copia de la carta en la capa de los fantasmas, con el
 * mismo vuelo (`keyframes`, `options`) y en el mismo plano (en la vista 3D, con la inclinación del campo), mientras la carta, transparente, hace el suyo; cuando
 * toca su zona (`LANDING_AT`) la copia se va y la carta se ve en el mismo lugar, a tiempo para el destello de la invocación, que va encima de ella. Devuelve esa
 * transparencia: si otra jugada a mitad de camino se la lleva de la zona o la vuelve a mover, se corta y con ella la copia.
 * `origin` es el (0, 0) de la capa (`originOf`, medido una vez por jugada). En la vista 3D, `plane` es el campo inclinado que contiene a la carta (`planeOf`) y `seat`, el centro de la carta
 * en ese plano (px desde el `transform-origin` del campo, `middleAt`): de ahí sale dónde está sin inclinar, sin escribir nada (escribirle al campo `transform: none` para medir y devolvérselo
 * recalculaba estilos dos veces en el toque), porque el punto del `transform-origin` no se mueve con la inclinación.
 */
function flyAbove(element: HTMLElement, id: string, layer: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions, origin: Point, plane: Plane | null, seat: Point | null): Animation {
  const tilt = plane?.css ?? null
  const at = plane?.origin ?? { x: 0, y: 0 }
  // Dónde está la carta en su plano: en la vista 3D, dentro del campo sin inclinar; si no, en la pantalla.
  let frame = { left: 0, top: 0 }
  let center: Point

  if (tilt && seat) {
    const [ox, oy] = originPx(tilt.origin)

    frame = { left: at.x - ox, top: at.y - oy }
    center = { x: at.x + seat.x, y: at.y + seat.y }
  } else {
    const rect = element.getBoundingClientRect()

    center = { x: centerX(rect), y: centerY(rect) }
  }

  const holder = document.createElement('div')
  holder.className = GHOST_LAYER
  holder.dataset.flightGhost = id
  holder.setAttribute('aria-hidden', 'true')
  holder.setAttribute('inert', '')
  holder.style.transform = `translate(${frame.left - origin.x}px, ${frame.top - origin.y}px)${tilt ? ` ${tilt.transform}` : ''}`
  if (tilt) holder.style.transformOrigin = tilt.origin

  // La copia es la carta tal cual se ve (su cara o atenuada, acostada, sus marcos), sin su marca y con su imagen a la vista: la carta recién montada todavía
  // la funde y le pone encima el esqueleto de la carga (`Skeleton`), que en la copia no se iría nunca.
  const copy = element.cloneNode(true) as HTMLElement
  // Su tamaño exacto (`offsetWidth` lo redondea, y el vuelo lo agranda: la copia salía corrida 1 px).
  const size = getComputedStyle(element)
  const width = parseFloat(size.width) || element.offsetWidth
  const height = parseFloat(size.height) || element.offsetHeight
  copy.removeAttribute('data-card-id')
  Object.assign(copy.style, { left: `${center.x - width / 2 - frame.left}px`, top: `${center.y - height / 2 - frame.top}px`, right: 'auto', width: `${width}px`, height: `${height}px`, margin: '0' })
  for (const placeholder of copy.querySelectorAll('[class*="animate-shimmer"]')) placeholder.remove()
  for (const image of copy.querySelectorAll('img')) {
    image.loading = 'eager'
    image.style.opacity = '1'
  }
  holder.append(copy)
  layer.append(holder)

  copy.animate(keyframes, options)
  // Transparente y sin atajar el puntero: la que aterriza bajo el mouse (se tocó la zona) no se eleva mientras la copia vuela, que si no al aparecer saltaba. El
  // puntero va por su estilo y no en los cuadros: una animación con algo más que `opacity` no va en el compositor.
  const pointer = element.style.pointerEvents
  element.style.pointerEvents = 'none'
  const hidden = element.animate([{ opacity: 0 }, { opacity: 0 }], { duration: Math.round(FLIGHT_MS * LANDING_AT) })
  const remove = () => {
    holder.remove()
    element.style.pointerEvents = pointer
  }
  hidden.onfinish = remove
  hidden.oncancel = remove

  return hidden
}

/** Una carta como se ve en la pantalla: su centro, su ancho y su alto sin el giro, y cuánto está girada (en grados). */
export interface CardPose {
  x: number
  y: number
  width: number
  height: number
  angle: number
}

/**
 * La carta girada `angle` grados que encierra el rectángulo `rect` (el de `getBoundingClientRect`, que con el giro es más grande que la carta): se despejan su ancho
 * y su alto. Cerca de 45° no se puede, y no pasa (las cartas van derechas, de costado o apenas giradas en el abanico de la mano): se queda con el rectángulo.
 */
export function poseIn(rect: Box, angle: number): CardPose {
  const radians = (angle * Math.PI) / 180
  const cos = Math.abs(Math.cos(radians))
  const sin = Math.abs(Math.sin(radians))
  const det = cos * cos - sin * sin
  const solvable = Math.abs(det) > 0.25

  return {
    x: centerX(rect),
    y: centerY(rect),
    width: solvable ? (cos * rect.width - sin * rect.height) / det : rect.width,
    height: solvable ? (cos * rect.height - sin * rect.width) / det : rect.height,
    angle,
  }
}

/** Cuánto está girado un elemento por su propia transformación (la de costado, la del abanico, la de un vuelo), en grados. */
function angleOf(element: Element): number {
  const { transform } = getComputedStyle(element)

  if (!transform || transform === 'none' || typeof DOMMatrixReadOnly !== 'function') return 0

  const matrix = new DOMMatrixReadOnly(transform)

  return (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI
}

/**
 * Dónde se ve ahora una carta de la mesa, para que algo salga de ella (la carta grande del centro, `Spotlight`): su elemento (en su lugar o arrancando su vuelo:
 * la que se jugó desde la mano o sale del Extra se ve todavía ahí), la copia que viaja a una pila (`fly`) o, si no se ve, su pila o el Xyz del que es material; en
 * la mano del rival, el medio de sus dorsos. Las del rival miran hacia él: media vuelta más (la copia que vuela ya la lleva). Sin mesa o sin estado, null.
 * ponytail: sin copia que vuele (más de `PILE_FLIGHT_LIMIT` cartas en una jugada) una carta que se fue a una pila sale de esa pila y no de donde estaba; para eso
 * habría que guardar dónde estaba cada carta antes de la jugada.
 */
export function cardPose(root: HTMLElement | null, state: MatState | null, id: string, side: Side): CardPose | null {
  if (!root || !state) return null

  const card = root.querySelector<HTMLElement>(`[${SIDES[side].card}="${quoted(id)}"]`)
  // La última: una copia anterior de la misma carta (la de `flyAbove`, que se va sola) puede seguir en la capa.
  const ghost = card ? null : ([...root.querySelectorAll<HTMLElement>(`[data-flight-ghost="${quoted(id)}"]`)].at(-1) ?? null)
  const element = card ?? ghost
  const home = element ? null : homeOf(root, state, id, side)
  const seen = element ?? home

  if (!seen) return null

  const rect = element ? element.getBoundingClientRect() : boxOf(home!, side, { width: home!.offsetWidth, height: home!.offsetHeight })
  const turn = side === 'theirs' && !ghost ? 180 : 0

  return poseIn(rect, angleOf(seen) + turn)
}

/** Un vuelo de una carta a la vista: sus cuadros y su reloj (para retomarlo), de dónde salió y a dónde va en la pantalla, y su transparencia si vuela su copia (`flyAbove`). */
interface Flight {
  element: HTMLElement
  animation: Animation
  keyframes: Keyframe[]
  timing: KeyframeAnimationOptions
  from: Box
  to: Box
  hidden: Animation | null
}

/**
 * ¿Lo único que cambió es el orden del deck (las mismas cartas, todo lo demás igual)? Se compara por valor: la mesa rearma el estado entero en cada jugada
 * (`replayMat`), así que nada conserva su referencia. Es un estado chico (ids y zonas): pasarlo a texto cuesta mucho menos que medir la mesa.
 */
function onlyShuffled(before: MatState, after: MatState): boolean {
  if (before === after || before.deck.length !== after.deck.length) return false

  const { deck: was, ...restBefore } = before
  const { deck: now, ...restAfter } = after
  const deck = new Set(was)

  return now.every((id) => deck.has(id)) && JSON.stringify(restBefore) === JSON.stringify(restAfter)
}

/** Dónde se ve ahora una carta en pleno vuelo, sin medirla (puede ya no estar en la mesa): entre de dónde salió y a dónde va, con la curva del vuelo. */
function poseOf({ animation, from, to }: Flight): Box {
  const done = easeInOut(Number(animation.currentTime ?? 0) / FLIGHT_MS)
  const mix = (a: number, b: number) => a + (b - a) * done

  return { left: mix(from.left, to.left), top: mix(from.top, to.top), width: mix(from.width, to.width), height: mix(from.height, to.height) }
}

/**
 * Las cartas vuelan de un lugar a otro cuando cambia el estado de la mesa (jugadas, deshacer, reproducir un combo): cada carta a la vista (`data-card-id`) se
 * anima desde donde estaba (FLIP) o desde la pila de la que salió; una que se va a una pila (o abajo de un Xyz) viaja hasta ahí como un fantasma, y también la
 * que pasa de una pila a otra sin estar nunca a la vista (del deck al cementerio, del cementerio al destierro, un material que se desprende, lo que entra o sale
 * de la mano del rival). El fantasma se da vuelta si llega boca abajo o si sale de dorso y llega a la vista, las que salen del mismo lugar en una jugada salen
 * escalonadas, y la pila las recibe con un golpe y sin adelantarse: su carta de arriba y su contador cambian cuando la carta llega. La que sale de tu mano al
 * campo pasa por encima de sus vecinas (`flyAbove`). La mano reparte (desde el mazo) y reacomoda sus propias cartas. Todo vuela con la curva de lo que viaja
 * (`EASE_IN_OUT`), y un fantasma dura según cuánto viaja (`flightMs`).
 * `layoutKey` cambia cuando las cartas se mueven sin jugada (reparto, reordenar la mano): se vuelve a medir.
 * Con `side: 'theirs'` es lo mismo con las cartas y pilas del rival (la mesa del duelo se las dibuja con sus propias marcas); sin estado todavía, no hace nada.
 */
export function useCardFlights(containerRef: RefObject<HTMLElement | null>, state: MatState | null, artOf: (id: string) => string | null, layoutKey: string, side: Side = 'mine'): { dealsFromDeck: (id: string) => boolean } {
  const marks = SIDES[side]
  const previousRef = useRef<Measure | null>(null)
  /** Las pilas que esperan a la carta que viene volando (por su nombre): una jugada nueva antes de que llegue suelta las que cambian con ella. */
  const holdsRef = useRef(new Map<string, () => void>())
  /** Los vuelos de las cartas a la vista que arrancó el hook (por carta): la jugada siguiente los retoma o sale de donde iban. */
  const flightsRef = useRef(new Map<string, Flight>())
  /** El `layoutKey` de la última medida: si cambió, hay que medir aunque la jugada sólo haya barajado el deck. */
  const layoutRef = useRef(layoutKey)

  useLayoutEffect(() => {
    const root = containerRef.current

    if (!root || !state || typeof root.animate !== 'function') return

    const previous = previousRef.current
    const sameLayout = layoutRef.current === layoutKey
    layoutRef.current = layoutKey

    // Sólo se barajó el deck (cerrar su visor lo baraja): nada a la vista se movió, así que no se mide ni se toca nada (medir todas las cartas trababa el
    // cierre). Lo que vuela sigue volando y una pila que espera su carta la sigue esperando.
    if (previous && sameLayout && onlyShuffled(previous.state, state)) {
      previousRef.current = { ...previous, state }
      return
    }

    // Los vuelos que siguen en el aire se apartan para medir cada carta en su lugar y no donde va pasando: antes, dónde va cada una y su reloj.
    const inAir = [...flightsRef.current].filter(([, flight]) => flight.animation.playState === 'running').map(([id, flight]) => ({ id, flight, startTime: flight.animation.startTime, seen: poseOf(flight) }))
    flightsRef.current = new Map()
    for (const { flight } of inAir) flight.animation.cancel()

    const current = new Map<string, { element: HTMLElement; rect: DOMRect }>()

    for (const element of root.querySelectorAll<HTMLElement>(`[${marks.card}]`)) {
      const id = element.dataset[marks.cardKey]

      if (id) current.set(id, { element, rect: element.getBoundingClientRect() })
    }

    previousRef.current = { state, cards: new Map([...current].map(([id, { element, rect }]) => [id, { rect, width: element.offsetWidth, height: element.offsetHeight, art: artOf(id), pending: element.dataset.pending === 'true' }])), faces: facesOf(root, side, state, previous?.faces) }

    // Otra jugada con un vuelo a medias: las pilas que cambian con ella muestran ya lo suyo; las demás siguen esperando su carta (volver a medir, sin jugada, no suelta ninguna).
    if (previous && previous.state !== state) {
      for (const [name, release] of holdsRef.current) {
        if (pileKey(previous.state, name) === pileKey(state, name)) continue

        release()
        holdsRef.current.delete(name)
      }
    }

    // La carta que sigue yendo al mismo lugar retoma su vuelo donde iba (el mismo, con el mismo reloj); la que se fue o cambió de destino sale de donde se veía
    // (`seen`), y su copia de arriba (`flyAbove`) se va.
    const seen = new Map<string, Box>()

    for (const { id, flight, startTime, seen: pose } of inAir) {
      const now = current.get(id)
      const was = previous?.cards.get(id)?.rect

      if (now?.element === flight.element && was && near(was, now.rect)) {
        const animation = cancelWhenDone(flight.element.animate(flight.keyframes, flight.timing))

        if (startTime !== null) animation.startTime = startTime
        flightsRef.current.set(id, { ...flight, animation })
      } else {
        flight.hidden?.cancel()
        seen.set(id, pose)
      }
    }

    if (!previous || prefersReducedMotion()) return

    // Sin jugada (sólo se volvió a medir) nada vuela, salvo la carta que esperaba en una zona y vuelve a la mano porque se cerró el menú sin elegir.
    const sameState = previous.state === state
    const returning = (id: string) => previous.cards.get(id)?.pending === true && state.hand.includes(id)

    if (sameState && ![...current.keys()].some(returning)) return

    // Los fantasmas se miden antes de que arranquen los vuelos de las cartas a la vista: el Xyz que recibe a sus materiales se mediría saliendo del Extra Deck.
    const ghosts = sameState ? [] : [...leavingGhosts(root, side, state, previous.cards, current, seen), ...pileGhosts(root, side, previous.state, state, previous.cards, current, artOf)]
    // El plano de cada campo inclinado y el (0, 0) de la capa, contados una vez por jugada (medir el origen escribe y lee: una sola vez).
    const planes = new Map<HTMLElement, Plane | null>()
    const planeFor = (field: HTMLElement) => (planes.has(field) ? planes.get(field)! : planes.set(field, planeOf(field)).get(field)!)
    let origin: Point | null = null
    const originAt = () => (origin ??= originOf(root))

    for (const [id, { element, rect }] of current) {
      if (flightsRef.current.has(id)) continue
      if (sameState && !returning(id)) continue
      if (!returning(id) && state.hand.includes(id) && (previous.state.hand.includes(id) || previous.state.deck.includes(id))) continue

      const home = previous.cards.has(id) ? null : homeOf(root, previous.state, id, side)
      const before = seen.get(id) ?? previous.cards.get(id)?.rect ?? (home ? boxOf(home, side, rect) : undefined)

      if (!before || near(before, rect)) continue

      // Una carta que cambió de posición gira con su transición: un vuelo encima la dejaría como estaba hasta terminar y después la daría vuelta de golpe.
      if (typeof CSSTransition === 'function' && element.getAnimations().some((animation) => animation instanceof CSSTransition && animation.transitionProperty === 'transform')) continue

      // El vuelo va por delante de la transformación propia de la carta (el abanico de la mano, una carta de costado).
      const style = getComputedStyle(element)
      const base = style.transform
      const own = base === 'none' ? '' : ` ${base}`

      // ponytail: dura siempre `FLIGHT_MS` (sea corto o largo) porque el destello de una invocación (`LandingBurst`) y la pila de materiales de un Xyz (`MaterialStack`)
      // esperan eso para aparecer; para que un salto corto de una carta con elemento dure menos, esos dos tendrían que recibir cuándo aterriza.
      const field = element.closest<HTMLElement>('[data-tilted]')
      const plane = field ? planeFor(field) : null
      const corners = plane ? cornersOf(element, style, base) : []
      const here = plane ? planeCenter(plane, corners, rect) : null
      const start = plane && here ? tiltedOffset(plane, corners, before, rect, here) : offset(before, rect)
      const keyframes = [{ transform: `${start}${own}` }, { transform: base }]
      const timing = { id: FLIGHT_ID, duration: FLIGHT_MS, easing: EASE_IN_OUT }

      // De tu mano (la carta tenía elemento ahí) al campo: lo que se ve volar es una copia, por encima de las vecinas. El vuelo terminado se cancela (`cancelWhenDone`): si no, le
      // sacaba a la GPU la transición de `transform` que le viniera después a la carta (acostarse, elevarse).
      const hidden = previous.state.hand.includes(id) && previous.cards.get(id)?.pending === false ? flyAbove(element, id, root, keyframes, timing, originAt(), plane, here && middleAt(here, corners)) : null
      flightsRef.current.set(id, { element, animation: cancelWhenDone(element.animate(keyframes, timing)), keyframes, timing, from: before, to: rect, hidden })
    }

    // Las que salen del mismo lugar (varias del deck, un Xyz con sus materiales) se taparían: salen una tras otra, en el orden en que quedan en su pila (la
    // última en llegar al cementerio es la de arriba). Las que salen de lugares distintos (los materiales de una invocación) salen juntas, como siempre.
    const order = new Map(allMatIds(state).map((id, index) => [id, index]))
    const waiting = new Map<string, number>()

    ghosts.sort((a, b) => (order.get(a.id) ?? -1) - (order.get(b.id) ?? -1))

    const launches = ghosts.map((ghost) => {
      const from = `${Math.round(centerX(ghost.from))}:${Math.round(centerY(ghost.from))}`
      const ahead = waiting.get(from) ?? 0
      const delay = Math.min(ahead, STAGGER_LIMIT - 1) * FLIGHT_STAGGER_MS
      const duration = flightMs(ghost.to ? distanceBetween(ghost.from, ghost.to) : 0)

      waiting.set(from, ahead + 1)

      return { ghost, delay, duration, touch: delay + Math.round(duration * LANDING_AT) }
    })

    // Cada lugar que recibe cartas: cuándo lo toca la primera (da un solo golpe, con su color) y cuándo la última (ahí se pone al día y los fantasmas se funden con él).
    const landings = new Map<HTMLElement, { id: string; first: number; last: number }>()

    for (const { ghost, touch } of launches) {
      if (!ghost.home || !ghost.to) continue

      const landing = landings.get(ghost.home)
      landings.set(ghost.home, landing ? { id: touch < landing.first ? ghost.id : landing.id, first: Math.min(landing.first, touch), last: Math.max(landing.last, touch) } : { id: ghost.id, first: touch, last: touch })
    }

    for (const { ghost, delay, duration, touch } of launches) fly(ghost, side, root, originAt(), { delay, duration, release: (ghost.home && landings.get(ghost.home)?.last) || touch })

    for (const [home, { id, first, last }] of landings) {
      // La mano no es una pila: no se infla ni se enciende entera cuando le vuelve una carta (la carta se acomoda sola).
      if (isHand(home, side)) continue

      const name = home.dataset[marks.dropKey] ?? ''

      bump(home, first)
      impact(home, impactRgb(state, id), first, PILES.has(name))

      const face = previous.faces.get(name)?.face

      if (!face) continue
      holdsRef.current.get(name)?.()
      holdsRef.current.set(name, hold(home, face, last))
    }
    // Se mide con cada jugada y cada vez que la mano se reacomoda; `artOf` sólo pinta el fantasma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, layoutKey])

  // Esa medida agarra a las cartas en pleno movimiento: la que se acaba de robar o buscar sale de su vuelo desde el mazo y las vecinas de una carta jugada
  // se corren con una transición. Si quedaba así como el "de dónde sale" de la próxima jugada, una carta robada que se activaba desde la mano salía volando
  // desde el mazo. Cuando todo se quedó quieto se mide de nuevo (otra jugada antes de que pase el plazo cancela este turno: ella misma vuelve a medir).
  useEffect(() => {
    const root = containerRef.current

    if (!root || !state || prefersReducedMotion()) return

    const timer = window.setTimeout(() => {
      const snapshot = previousRef.current

      if (!snapshot) return

      const cards = new Map<string, Snapshot>()

      for (const element of root.querySelectorAll<HTMLElement>(`[${marks.card}]`)) {
        const id = element.dataset[marks.cardKey]

        if (!id) continue

        // La carta que se está arrastrando no está en su lugar: conserva la medida de antes.
        const before = snapshot.cards.get(id)

        cards.set(id, element.dataset.state === 'dragging' && before ? before : { rect: element.getBoundingClientRect(), width: element.offsetWidth, height: element.offsetHeight, art: artOf(id), pending: element.dataset.pending === 'true' })
      }

      previousRef.current = { state: snapshot.state, cards, faces: facesOf(root, side, snapshot.state, snapshot.faces, true) }
    }, SETTLE_MS)

    return () => window.clearTimeout(timer)
    // Mismas dependencias que la medida de arriba; `artOf` sólo pinta el fantasma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, layoutKey])

  // Una carta que aparece en la mano se reparte desde el mazo salvo que venga de otro lado a la vista (eso lo anima el vuelo).
  const dealsFromDeck = useCallback((id: string) => {
    const previous = previousRef.current

    return !previous || (!previous.cards.has(id) && (previous.state.hand.includes(id) || previous.state.deck.includes(id)))
  }, [])

  return { dealsFromDeck }
}
