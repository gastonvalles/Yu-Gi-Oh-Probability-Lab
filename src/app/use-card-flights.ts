import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

import { CARD_BACK, FX_RGB } from '../components/probability/practice-styles'
import { cardImageSrc } from './card-image-source'
import { EASE_IN_OUT, EASE_OUT, UI_ANIMATION_MS, prefersReducedMotion, supportsAdditiveAnimation } from './motion'
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
/** Marca de los vuelos: una jugada que llega con un vuelo a medias lo corta antes de medir, así la carta se mide quieta. */
const FLIGHT_ID = 'mat-flight'
/** Las pilas: lo que muestran (su carta de arriba, su contador) espera a que llegue la carta que viene volando. */
const PILES = new Set(['deck', 'extra', 'gy', 'banished'])
/** Los fantasmas vuelan dentro de la mesa, debajo de las cartas grandes del centro (`Spotlight`, z 120), la pregunta y la pausa del duelo, y encima del campo y la mano. */
const GHOST_CLASS = 'pointer-events-none fixed left-0 top-0 z-110 overflow-hidden bg-input shadow-overlay'
/** La capa de los fantasmas sin la caja de un fantasma: ahí vuela la copia de una carta que sale de la mano (`flyAbove`), que ya trae la suya. */
const GHOST_LAYER = 'pointer-events-none fixed left-0 top-0 z-110'

/** Un rectángulo en la pantalla: el de un elemento o uno armado a mano (el lugar de una carta en la mano). */
type Box = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>
type Size = { width: number; height: number }

/** Lo medido de cada carta a la vista y lo que mostraba cada pila (una copia), la última vez que la mesa quedó quieta. */
interface Measure {
  state: MatState
  cards: Map<string, Snapshot>
  faces: Map<string, HTMLElement>
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

  return where?.kind === 'pile' ? where.pile : where?.kind === 'material' ? `under:${where.of}` : null
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

/**
 * Lo mismo en el campo inclinado (la vista 3D): la perspectiva achica lo lejano y agranda lo cercano, así que un desplazamiento medido en la pantalla no es el mismo
 * sobre la mesa, y menos lejos de la carta (la mano está fuera del campo: salía de una esquina, gigante). Se busca probando, con unas pocas medidas antes de pintar,
 * el desplazamiento sobre la mesa que deja el centro de la carta donde estaba, y el tamaño que la deja del tamaño que tenía ahí. `own`: su transformación propia.
 */
function tiltedOffset(element: HTMLElement, from: Box, to: Box, own: string): string {
  const inline = { transform: element.style.transform, transition: element.style.transition }
  // Sin su transición (las cartas del campo la tienen en `transform`): si no, cada prueba arrancaría una y la medida sería la de antes.
  element.style.transition = 'none'
  const goal = { x: centerX(from), y: centerY(from) }
  const clamp = (value: number) => Math.min(3, Math.max(0.2, value))
  // Cuánto se mueve en la pantalla por cada px sobre la mesa: primero, lo que se ve achicada en su lugar; después, lo que se midió en cada eje.
  const step = { x: clamp(Math.max(to.width, to.height) / Math.max(1, element.offsetWidth, element.offsetHeight)), y: 0 }
  step.y = step.x
  let at = { dx: 0, dy: 0, x: centerX(to), y: centerY(to) }
  let seen: Box = to

  for (let tries = 0; tries < 5 && Math.hypot(goal.x - at.x, goal.y - at.y) > 1; tries += 1) {
    const dx = at.dx + (goal.x - at.x) / step.x
    const dy = at.dy + (goal.y - at.y) / step.y

    element.style.transform = `translate(${dx}px, ${dy}px)${own}`
    seen = element.getBoundingClientRect()
    const next = { dx, dy, x: centerX(seen), y: centerY(seen) }

    if (Math.abs(dx - at.dx) > 1) step.x = clamp((next.x - at.x) / (dx - at.dx))
    if (Math.abs(dy - at.dy) > 1) step.y = clamp((next.y - at.y) / (dy - at.dy))
    at = next
  }

  // Se devuelve su transformación todavía sin transición (y se aplica, midiendo) y recién después la transición: así volver no arranca ninguna.
  element.style.transform = inline.transform
  element.getBoundingClientRect()
  element.style.transition = inline.transition

  return `translate(${at.dx}px, ${at.dy}px) scale(${sizeRatio(from, seen)})`
}

/**
 * La pila (o el Xyz) que recibe una carta se infla un instante cuando la carta la toca (`at`: cuánto falta para eso). Se suma a la transformación que ya
 * tiene: un Xyz en defensa sigue acostado y uno que todavía llega volando no salta a su lugar.
 */
function bump(element: HTMLElement, at: number) {
  element.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)', offset: 0.45 }, { transform: 'scale(1)' }], { duration: 260, delay: at, easing: EASE_OUT, composite: supportsAdditiveAnimation() ? 'add' : 'replace' })
}

/** El color con que cada lugar recibe una carta: el cementerio, violeta; el destierro, ámbar; el deck y el Extra, celeste; debajo de un Xyz, azul. */
function impactRgb(state: MatState, id: string): string {
  const where = locateCard(state, id)

  if (where?.kind === 'material') return FX_RGB.indigo
  if (where?.kind === 'pile' && where.pile === 'gy') return FX_RGB.violet
  if (where?.kind === 'pile' && where.pile === 'banished') return FX_RGB.amber

  return FX_RGB.cyan
}

/** Al aterrizar, el lugar da el golpe: un marco de su color que se enciende y se expande al apagarse, y un destello (pasa junto con `bump`, que lo infla). */
function impact(element: HTMLElement, rgb: string, at: number) {
  element.animate(
    [
      { boxShadow: `0 0 0 2px rgb(${rgb} / 1), 0 0 18px 3px rgb(${rgb} / 0.9)`, filter: 'brightness(1.9)' },
      { boxShadow: `0 0 0 2px rgb(${rgb} / 1), 0 0 22px 6px rgb(${rgb} / 0.7)`, filter: 'brightness(1.25)', offset: 0.4 },
      { boxShadow: `0 0 0 16px rgb(${rgb} / 0), 0 0 34px 10px rgb(${rgb} / 0)`, filter: 'brightness(1)' },
    ],
    { duration: 700, delay: at, easing: EASE_OUT },
  )
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

/** Lo que muestra cada pila de un lado ahora (por su nombre): la mano no, que es una fila de cartas con elemento propio. */
function facesOf(root: HTMLElement, side: Side): Map<string, HTMLElement> {
  const faces = new Map<string, HTMLElement>()

  for (const pile of root.querySelectorAll<HTMLElement>(`[${SIDES[side].drop}]`)) {
    const name = pile.dataset[SIDES[side].dropKey]

    if (name && PILES.has(name)) faces.set(name, faceOf(pile))
  }

  return faces
}

/**
 * La pila que recibe cartas sigue mostrando lo de antes (`face`) hasta que llega la última (`until`, en ms): lo nuevo queda escondido debajo y aparece de una,
 * junto con el contador, cuando la carta que vuela la tapa. Devuelve cómo soltarla antes (otra jugada a mitad de camino).
 */
function hold(pile: HTMLElement, face: HTMLElement, until: number): () => void {
  const hidden = [...pile.children].map((child) => child.animate([{ opacity: 0 }, { opacity: 0 }], { duration: until }))
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
 * la mano (que todavía no la dibuja); una que ya no está en la mesa (una ficha) se apaga donde estaba.
 */
function leavingGhosts(root: HTMLElement, side: Side, state: MatState, left: ReadonlyMap<string, Snapshot>, current: ReadonlyMap<string, unknown>): Ghost[] {
  return [...left].flatMap(([id, snapshot]) => {
    if (current.has(id)) return []

    const home = homeOf(root, state, id, side)
    const size = { width: snapshot.width, height: snapshot.height }

    return [{ id, from: snapshot.rect, size, art: snapshot.art, to: home ? boxOf(home, side, size) : null, home, startsHidden: false, endsHidden: hiddenAt(state, id) }]
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
  element.className = GHOST_CLASS
  element.dataset.flightGhost = ''
  element.setAttribute('aria-hidden', 'true')
  element.style.width = `${width}px`
  element.style.height = `${height}px`
  // Las cartas del rival miran hacia él: el fantasma viaja de cabeza, como se ve en su campo y en sus pilas.
  const turn = side === 'theirs' ? ' rotate(180deg)' : ''
  element.style.transform = `translate(${left}px, ${top}px)${turn}`

  // La cara por el proxy de imágenes y con la misma dirección que ya dibujó la mesa (sale de la caché); de una carta que no se ve, sólo el dorso.
  if (art) {
    const image = document.createElement('img')
    image.src = cardImageSrc(art)
    image.alt = ''
    image.className = 'block h-full w-full object-cover'
    element.append(image)
  }

  // Todo va con la misma curva y el mismo reloj: el camino, el giro y el cambio de cara. Esperando su turno (escalonada) se queda quieta donde estaba, y al
  // llegar se queda en su lugar (`fill`) hasta fundirse.
  const timing = { duration, delay, fill: 'both' as const, easing: EASE_IN_OUT }
  const flips = art !== null && ghost.startsHidden !== ghost.endsHidden

  if (!art || ghost.startsHidden || ghost.endsHidden) {
    const back = document.createElement('span')
    back.className = CARD_BACK
    element.append(back)

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

  // El giro en 3D se suma al vuelo (va después en la pila de animaciones, con `composite: 'add'`): de canto a mitad de camino y abierto del otro lado al llegar.
  if (flips && supportsAdditiveAnimation()) {
    element.animate(
      [
        { transform: 'perspective(700px) rotateY(0deg)' },
        { transform: 'perspective(700px) rotateY(90deg)', offset: 0.5 },
        { transform: 'perspective(700px) rotateY(-90deg)', offset: 0.5 },
        { transform: 'perspective(700px) rotateY(0deg)' },
      ],
      { ...timing, composite: 'add' },
    )
  }
}

/**
 * Una carta que sale de la mano al campo (una invocación, una magia que se activa o se coloca) pasa por encima de sus vecinas. La carta de la zona está
 * dentro del campo, que es su propio contexto de apilado (`isolate` y, en la vista 3D, su inclinación), y las cartas de la mano se pintan encima del campo
 * entero: volando, pasaba por debajo de ellas. Subir el campo de `z-index` mientras vuela no alcanza: en un duelo la mano sube contra el campo, y la placa
 * (que sobresale abajo, con su sombra) taparía la franja de arriba de toda la mano. Vuela entonces una copia de la carta en la capa de los fantasmas, con el
 * mismo vuelo (`keyframes`, `options`) y en el mismo plano (en la vista 3D, con la inclinación del campo), mientras la carta, transparente, hace el suyo; cuando
 * toca su zona (`LANDING_AT`) la copia se va y la carta se ve en el mismo lugar, a tiempo para el destello de la invocación, que va encima de ella. Otra jugada
 * a mitad de camino corta su transparencia (es un vuelo, `FLIGHT_ID`) y con ella la copia.
 */
function flyAbove(element: HTMLElement, id: string, layer: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions): void {
  const field = element.closest<HTMLElement>('[data-tilted]')
  const tilt = field ? { transform: getComputedStyle(field).transform, origin: getComputedStyle(field).transformOrigin } : null
  // Dónde está la carta en su plano: en la vista 3D, dentro del campo sin inclinar (se le saca un instante para medir; no tiene transición); si no, en la pantalla.
  let frame = { left: 0, top: 0 }
  let rect: DOMRect

  if (field) {
    const inline = field.style.transform
    field.style.transform = 'none'
    frame = field.getBoundingClientRect()
    rect = element.getBoundingClientRect()
    field.style.transform = inline
  } else {
    rect = element.getBoundingClientRect()
  }

  const origin = originOf(layer)
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
  Object.assign(copy.style, { left: `${centerX(rect) - width / 2 - frame.left}px`, top: `${centerY(rect) - height / 2 - frame.top}px`, right: 'auto', width: `${width}px`, height: `${height}px`, margin: '0' })
  for (const placeholder of copy.querySelectorAll('[class*="animate-shimmer"]')) placeholder.remove()
  for (const image of copy.querySelectorAll('img')) {
    image.loading = 'eager'
    image.style.opacity = '1'
  }
  holder.append(copy)
  layer.append(holder)

  copy.animate(keyframes, options)
  // Transparente y sin atajar el puntero: la que aterriza bajo el mouse (se tocó la zona) no se eleva mientras la copia vuela, que si no al aparecer saltaba.
  const hidden = element.animate([{ opacity: 0, pointerEvents: 'none' }, { opacity: 0, pointerEvents: 'none' }], { id: FLIGHT_ID, duration: Math.round(FLIGHT_MS * LANDING_AT) })
  const remove = () => holder.remove()
  hidden.onfinish = remove
  hidden.oncancel = remove
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
  /** Las pilas que esperan a la carta que viene volando: una jugada nueva antes de que llegue las suelta. */
  const holdsRef = useRef<Array<() => void>>([])

  useLayoutEffect(() => {
    const root = containerRef.current

    if (!root || !state || typeof root.animate !== 'function') return

    const current = new Map<string, { element: HTMLElement; rect: DOMRect }>()

    for (const element of root.querySelectorAll<HTMLElement>(`[${marks.card}]`)) {
      const id = element.dataset[marks.cardKey]

      for (const animation of element.getAnimations()) if (animation.id === FLIGHT_ID) animation.cancel()
      if (id) current.set(id, { element, rect: element.getBoundingClientRect() })
    }

    const previous = previousRef.current
    previousRef.current = { state, cards: new Map([...current].map(([id, { element, rect }]) => [id, { rect, width: element.offsetWidth, height: element.offsetHeight, art: artOf(id), pending: element.dataset.pending === 'true' }])), faces: facesOf(root, side) }

    // Otra jugada con un vuelo a medias: las pilas que esperaban muestran ya lo suyo (volver a medir, sin jugada, no las suelta).
    if (previous?.state !== state) {
      for (const release of holdsRef.current) release()
      holdsRef.current = []
    }

    if (!previous || prefersReducedMotion()) return

    // Sin jugada (sólo se volvió a medir) nada vuela, salvo la carta que esperaba en una zona y vuelve a la mano porque se cerró el menú sin elegir.
    const sameState = previous.state === state
    const returning = (id: string) => previous.cards.get(id)?.pending === true && state.hand.includes(id)

    if (sameState && ![...current.keys()].some(returning)) return

    // Los fantasmas se miden antes de que arranquen los vuelos de las cartas a la vista: el Xyz que recibe a sus materiales se mediría saliendo del Extra Deck.
    const ghosts = sameState ? [] : [...leavingGhosts(root, side, state, previous.cards, current), ...pileGhosts(root, side, previous.state, state, previous.cards, current, artOf)]

    for (const [id, { element, rect }] of current) {
      if (sameState && !returning(id)) continue
      if (!returning(id) && state.hand.includes(id) && (previous.state.hand.includes(id) || previous.state.deck.includes(id))) continue

      const home = previous.cards.has(id) ? null : homeOf(root, previous.state, id, side)
      const before = previous.cards.get(id)?.rect ?? (home ? boxOf(home, side, rect) : undefined)

      if (!before || near(before, rect)) continue

      // Una carta que cambió de posición gira con su transición: un vuelo encima la dejaría como estaba hasta terminar y después la daría vuelta de golpe.
      if (typeof CSSTransition === 'function' && element.getAnimations().some((animation) => animation instanceof CSSTransition && animation.transitionProperty === 'transform')) continue

      // El vuelo va por delante de la transformación propia de la carta (el abanico de la mano, una carta de costado).
      const base = getComputedStyle(element).transform
      const own = base === 'none' ? '' : ` ${base}`

      // ponytail: dura siempre `FLIGHT_MS` (sea corto o largo) porque el destello de una invocación (`LandingBurst`) y la pila de materiales de un Xyz (`MaterialStack`)
      // esperan eso para aparecer; para que un salto corto de una carta con elemento dure menos, esos dos tendrían que recibir cuándo aterriza.
      const start = element.closest('[data-tilted]') ? tiltedOffset(element, before, rect, own) : offset(before, rect)
      const flight = [{ transform: `${start}${own}` }, { transform: base }]
      const timing = { id: FLIGHT_ID, duration: FLIGHT_MS, easing: EASE_IN_OUT }

      // De tu mano (la carta tenía elemento ahí) al campo: lo que se ve volar es una copia, por encima de las vecinas.
      if (previous.state.hand.includes(id) && previous.cards.get(id)?.pending === false) flyAbove(element, id, root, flight, timing)
      element.animate(flight, timing)
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

    const origin = launches.length > 0 ? originOf(root) : { x: 0, y: 0 }

    for (const { ghost, delay, duration, touch } of launches) fly(ghost, side, root, origin, { delay, duration, release: (ghost.home && landings.get(ghost.home)?.last) || touch })

    for (const [home, { id, first, last }] of landings) {
      // La mano no es una pila: no se infla ni se enciende entera cuando le vuelve una carta (la carta se acomoda sola).
      if (isHand(home, side)) continue

      bump(home, first)
      impact(home, impactRgb(state, id), first)

      const face = previous.faces.get(home.dataset[marks.dropKey] ?? '')
      if (face) holdsRef.current.push(hold(home, face, last))
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

      previousRef.current = { state: snapshot.state, cards, faces: facesOf(root, side) }
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
