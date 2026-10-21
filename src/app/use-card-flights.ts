import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

import { CARD_BACK, FX_RGB } from '../components/probability/practice-styles'
import { cardImageSrc } from './card-image-source'
import { EASE_OUT, UI_ANIMATION_MS, supportsAdditiveAnimation } from './motion'
import { allMatIds, locateCard, type MatState } from './practice-mat'

/** Cuánto dura el vuelo de una carta entre dos lugares de la mesa. */
export const FLIGHT_MS = UI_ANIMATION_MS * 2
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

/** Un rectángulo en la pantalla: el de un elemento o uno armado a mano (el lugar de una carta en la mano). */
type Box = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>
type Size = { width: number; height: number }

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

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

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

/** FLIP: transformación que lleva el elemento desde donde estaba (`from`) hasta donde está (`to`); el tamaño se compara por el lado largo (las cartas de costado) y se acota por si la medición agarró una animación a medias. */
function offset(from: Box, to: Box, local = { x: 1, y: 1 }): string {
  const scale = Math.min(3, Math.max(0.3, Math.max(from.width, from.height) / Math.max(1, to.width, to.height)))

  return `translate(${(centerX(from) - centerX(to)) / local.x}px, ${(centerY(from) - centerY(to)) / local.y}px) scale(${scale})`
}

/** Un elemento del campo inclinado (la mesa vista desde arriba) se dibuja más chico que su tamaño de layout: un desplazamiento medido en pantalla se divide por esa escala para que el vuelo arranque donde estaba la carta. */
function localScale(element: HTMLElement, rect: Box): { x: number; y: number } {
  if (!element.closest('[data-tilted]')) return { x: 1, y: 1 }

  const clamp = (value: number) => Math.min(1.5, Math.max(0.5, value))

  return { x: clamp(rect.width / Math.max(1, element.offsetWidth)), y: clamp(rect.height / Math.max(1, element.offsetHeight)) }
}

/**
 * La pila (o el Xyz) que recibe una carta se infla un instante cuando aterriza (`delay`: cuánto sale después la carta, si viene escalonada). Se suma a la
 * transformación que ya tiene: un Xyz en defensa sigue acostado y uno que todavía llega volando no salta a su lugar.
 */
function bump(element: HTMLElement, delay: number) {
  element.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)', offset: 0.45 }, { transform: 'scale(1)' }], { duration: 260, delay: FLIGHT_MS - 120 + delay, easing: EASE_OUT, composite: supportsAdditiveAnimation() ? 'add' : 'replace' })
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
function impact(element: HTMLElement, rgb: string, delay: number) {
  element.animate(
    [
      { boxShadow: `0 0 0 2px rgb(${rgb} / 1), 0 0 18px 3px rgb(${rgb} / 0.9)`, filter: 'brightness(1.9)' },
      { boxShadow: `0 0 0 2px rgb(${rgb} / 1), 0 0 22px 6px rgb(${rgb} / 0.7)`, filter: 'brightness(1.25)', offset: 0.4 },
      { boxShadow: `0 0 0 16px rgb(${rgb} / 0), 0 0 34px 10px rgb(${rgb} / 0)`, filter: 'brightness(1)' },
    ],
    { duration: 700, delay: FLIGHT_MS - 100 + delay, easing: EASE_OUT },
  )
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

/** Lanza un fantasma (`delay`: cuánto espera en su lugar si sale escalonado). Si llega boca abajo o sale de dorso, se da vuelta en el camino. */
function fly(ghost: Ghost, side: Side, delay: number): void {
  const { from, size, art, to } = ghost
  const { width, height } = size
  // Sale centrado donde estaba la carta, con su tamaño de layout (no el del rect, que puede ser el de una carta girada o en vuelo).
  const left = centerX(from) - width / 2
  const top = centerY(from) - height / 2
  const element = document.createElement('div')
  element.className = 'pointer-events-none fixed left-0 top-0 z-200 overflow-hidden bg-input shadow-[0_12px_28px_rgba(0,0,0,0.5)]'
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

  // Esperando su turno (escalonada) se queda quieta donde estaba: los cuadros de antes también valen durante la espera.
  const timing = { duration: FLIGHT_MS, delay, fill: 'both' as const }
  const flips = art !== null && ghost.startsHidden !== ghost.endsHidden

  if (!art || ghost.startsHidden || ghost.endsHidden) {
    const back = document.createElement('span')
    back.className = CARD_BACK
    element.append(back)

    // A mitad de camino queda de canto y ahí se cambia una cara por la otra: el dorso aparece (llega boca abajo) o se va (sale de dorso y llega a la vista).
    if (flips) {
      const shown = ghost.endsHidden ? [0, 1] : [1, 0]
      back.animate([{ opacity: shown[0] }, { opacity: shown[0], offset: 0.5 }, { opacity: shown[1], offset: 0.5 }, { opacity: shown[1] }], timing)
    }
  }

  document.body.append(element)
  const landing = to
    ? `translate(${to.left + (to.width - width) / 2}px, ${to.top + (to.height - height) / 2}px) scale(${to.width / Math.max(1, width)})${turn}`
    : `translate(${left}px, ${top}px) scale(0.6)${turn}`
  const flight = element.animate([{ transform: element.style.transform, opacity: 1 }, { transform: landing, opacity: to ? 0.75 : 0 }], { ...timing, easing: EASE_OUT })
  flight.onfinish = () => element.remove()
  flight.oncancel = () => element.remove()

  // El giro en 3D se suma al vuelo (va después en la pila de animaciones, con `composite: 'add'`): de canto a mitad de camino y abierto del otro lado.
  if (flips && supportsAdditiveAnimation()) {
    element.animate(
      [
        { transform: 'perspective(700px) rotateY(0deg)', easing: EASE_OUT },
        { transform: 'perspective(700px) rotateY(90deg)', offset: 0.5 },
        { transform: 'perspective(700px) rotateY(-90deg)', offset: 0.5, easing: EASE_OUT },
        { transform: 'perspective(700px) rotateY(0deg)' },
      ],
      { ...timing, composite: 'add' },
    )
  }
}

/**
 * Las cartas vuelan de un lugar a otro cuando cambia el estado de la mesa (jugadas, deshacer, reproducir un combo): cada carta a la vista (`data-card-id`) se
 * anima desde donde estaba (FLIP) o desde la pila de la que salió; una que se va a una pila (o abajo de un Xyz) viaja hasta ahí como un fantasma, y también la
 * que pasa de una pila a otra sin estar nunca a la vista (del deck al cementerio, del cementerio al destierro, un material que se desprende, lo que entra o sale
 * de la mano del rival). El fantasma se da vuelta si llega boca abajo o si sale de dorso y llega a la vista, las que salen del mismo lugar en una jugada salen
 * escalonadas, y la pila las recibe con un golpe. La mano reparte (desde el mazo) y reacomoda sus propias cartas.
 * `layoutKey` cambia cuando las cartas se mueven sin jugada (reparto, reordenar la mano): se vuelve a medir.
 * Con `side: 'theirs'` es lo mismo con las cartas y pilas del rival (la mesa del duelo se las dibuja con sus propias marcas); sin estado todavía, no hace nada.
 */
export function useCardFlights(containerRef: RefObject<HTMLElement | null>, state: MatState | null, artOf: (id: string) => string | null, layoutKey: string, side: Side = 'mine'): { dealsFromDeck: (id: string) => boolean } {
  const marks = SIDES[side]
  const previousRef = useRef<{ state: MatState; cards: Map<string, Snapshot> } | null>(null)

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
    previousRef.current = { state, cards: new Map([...current].map(([id, { element, rect }]) => [id, { rect, width: element.offsetWidth, height: element.offsetHeight, art: artOf(id), pending: element.dataset.pending === 'true' }])) }

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

      element.animate([{ transform: `${offset(before, rect, localScale(element, rect))}${own}` }, { transform: base }], { id: FLIGHT_ID, duration: FLIGHT_MS, easing: EASE_OUT })
    }

    // Las que salen del mismo lugar (varias del deck, un Xyz con sus materiales) se taparían: salen una tras otra, en el orden en que quedan en su pila (la
    // última en llegar al cementerio es la de arriba). Las que salen de lugares distintos (los materiales de una invocación) salen juntas, como siempre.
    const order = new Map(allMatIds(state).map((id, index) => [id, index]))
    const waiting = new Map<string, number>()
    const landings = new Map<HTMLElement, { id: string; delay: number }>()

    ghosts.sort((a, b) => (order.get(a.id) ?? -1) - (order.get(b.id) ?? -1))

    for (const ghost of ghosts) {
      const origin = `${Math.round(centerX(ghost.from))}:${Math.round(centerY(ghost.from))}`
      const ahead = waiting.get(origin) ?? 0
      const delay = Math.min(ahead, STAGGER_LIMIT - 1) * FLIGHT_STAGGER_MS

      waiting.set(origin, ahead + 1)
      fly(ghost, side, delay)

      // La mano no es una pila: no se infla ni se enciende entera cuando le vuelve una carta (la carta se acomoda sola). Cada lugar da un solo golpe, con la primera que llega.
      if (ghost.home && ghost.to && !isHand(ghost.home, side) && delay < (landings.get(ghost.home)?.delay ?? Infinity)) landings.set(ghost.home, { id: ghost.id, delay })
    }

    for (const [home, { id, delay }] of landings) {
      bump(home, delay)
      impact(home, impactRgb(state, id), delay)
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

      previousRef.current = { state: snapshot.state, cards }
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
