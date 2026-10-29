import { EASE_IN_OUT, EASE_OUT, EASE_SNAP, animationsOf, cancelWhenDone, ownTransform, prefersReducedMotion, transformTransition } from './motion'

/** El id de las animaciones del barajado: uno nuevo corta el que siga en curso en esa carta (y las pruebas las cuentan por él). */
export const SHUFFLE_ID = 'riffle'

/**
 * Los tiempos de un barajado, en ms. El riffle: las cartas se parten en dos paquetes (las pares a un lado, las impares al otro), caen al centro de a una alternando lado (la de
 * más abajo primero, así se intercalan a la vista) y la pila se golpea contra la mesa. La mano, antes, se junta en una pila y, después, se vuelve a abrir salteada.
 * `spread` y `lift`: cuánto se abren los paquetes, en anchos y altos de carta. `shift`: el mazo se baraja corrido hacia la mesa (está en su borde: a la derecha, en el plano
 * de cada lado), y vuelve con el golpe.
 */
const DECK = { gather: 0, split: 160, dropFrom: 170, dropSpan: 220, drop: 90, knock: 560, openFrom: 560, openSpan: 0, open: 60, spread: 0.38, lift: 0.32, shift: 0.38 }
const HAND = { gather: 170, split: 280, dropFrom: 290, dropSpan: 180, drop: 90, knock: 580, openFrom: 600, openSpan: 110, open: 190, spread: 0.42, lift: 0.32, shift: 0 }
type Plan = typeof DECK

/** Cuánto dura barajar el mazo (el reparto de una mano nueva espera a que termine). */
export const DECK_SHUFFLE_MS = DECK.openFrom + DECK.openSpan + DECK.open
/** Cuánto dura barajar una mano: juntarla, el riffle y abrirla. */
export const HAND_SHUFFLE_MS = HAND.openFrom + HAND.openSpan + HAND.open

/** Ruido fijo por carta (sin `Math.random`: el mismo barajado siempre, y las pruebas estables): ninguna carta cae igual que su vecina. */
const NOISE = [0.6, -0.9, 0.3, -0.4, 1, -0.7, 0.8, -0.2, 0.5, -1, 0.1, 0.9]
const noise = (index: number) => NOISE[index % NOISE.length]!
/** En qué orden se abre la mano (una permutación fija): salteado, no de izquierda a derecha, que se leería como volver a ponerlas. */
const openRank = (count: number) => {
  const order = Array.from({ length: count }, (_, index) => index).sort((a, b) => ((a * 37 + 11) % 101) - ((b * 37 + 11) % 101))

  return (index: number) => order.indexOf(index)
}

/** Dónde está una carta (su centro, corrido de su caja) y cuánto gira, según su `transform`. Sin `DOMMatrix` (las pruebas), en su caja y derecha. */
function placeOf(own: string): { x: number; y: number; angle: number } {
  if (!own || typeof DOMMatrixReadOnly !== 'function') return { x: 0, y: 0, angle: 0 }
  const matrix = new DOMMatrixReadOnly(own)

  return { x: matrix.e, y: matrix.f, angle: (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI }
}

const isCss = (animation: Animation) =>
  (typeof CSSTransition === 'function' && animation instanceof CSSTransition) || (typeof CSSAnimation === 'function' && animation instanceof CSSAnimation)
/** Lo que todavía trae a la carta (el reparto, un vuelo entre zonas): se baraja cuando aterriza, no en el aire. Las transiciones y las animaciones de CSS no se esperan. */
const arriving = (animations: readonly Animation[]) =>
  animations.filter((animation) => animation.id !== SHUFFLE_ID && !isCss(animation) && animation.finished !== undefined && Number.isFinite(Number(animation.effect?.getComputedTiming?.().endTime)))

const n = (value: number) => Math.round(value * 100) / 100

/**
 * Baraja a la vista las cartas dadas. Cada carta sale de su lugar (el abanico de la mano; la pila del mazo) y vuelve a él: sus cuadros llevan su `transform` en el medio
 * (`translate(…)` antes, en el plano de la mano, y `rotate(…)` después, que en la pila le saca la inclinación del abanico), en `replace`, así va entera en la GPU. Una sola fase
 * de lectura (las animaciones de todas, su lugar y su tamaño) y después las escrituras: leer una carta después de escribir en otra recalculaba los estilos carta por carta.
 */
function shuffle(cards: Iterable<Element>, plan: Plan, gather: boolean): void {
  if (prefersReducedMotion()) return

  const list = [...cards].filter((card) => typeof card.animate === 'function')
  const animations = list.map((card) => animationsOf(card))
  const pending = animations.flatMap(arriving)

  if (pending.length > 0) {
    Promise.all(pending.map((animation) => animation.finished)).then(
      () => shuffle(list.filter((card) => card.isConnected), plan, gather),
      () => {},
    )
    return
  }

  for (const own of animations) for (const animation of own) if (animation.id === SHUFFLE_ID) animation.cancel()
  const rest = animations.map((own) => own.filter((animation) => animation.id !== SHUFFLE_ID))
  const bases = list.map((card, index) => ownTransform(card, rest[index]))
  const transitions = list.map((card, index) => transformTransition(card, rest[index]))
  const sizes = list.map((card) => ({ width: (card as HTMLElement).offsetWidth || 0, height: (card as HTMLElement).offsetHeight || 0 }))
  const places = bases.map(placeOf)
  const count = list.length
  const mean = (key: 'x' | 'y') => places.reduce((sum, place) => sum + place[key], 0) / Math.max(1, count)
  // La pila de la mano, en el medio del abanico y un poco más arriba.
  const center = { x: mean('x'), y: mean('y') - 12 }
  const rank = openRank(count)
  const total = plan.openFrom + plan.openSpan + plan.open

  list.forEach((card, index) => {
    const own = bases[index]!
    const place = places[index]!
    const { width, height } = sizes[index]!
    // A la pila: a su centro y derecha (sin el giro del abanico). El mazo ya está apilado: se corre hacia la mesa.
    const dx = gather ? center.x - place.x : -plan.shift * width
    const dy = gather ? center.y - place.y : 0
    const straight = gather ? -place.angle : 0
    const side = index % 2 === 0 ? -1 : 1
    const inPacket = index >> 1
    const pose = (x: number, y: number, rotate: number) => `translate(${n(dx + x)}px, ${n(dy + y)}px) ${own}rotate(${n(straight + rotate)}deg)`
    const home = `translate(0px, 0px) ${own}rotate(0deg)`
    // Cada carta con su desvío: en la pila, en su paquete (un poco más alta cuanto más arriba) y al caer, que pasa del centro hacia el otro lado (se intercalan).
    const pile = pose(noise(index) * 1.5, -index * 0.6, noise(index + 4) * 2)
    const packet = pose(side * (plan.spread * width + inPacket * 3) + noise(index) * 2, -plan.lift * height - inPacket * 3 + noise(index + 3) * 1.5, side * (7 + noise(index + 5) * 2))
    const landed = pose(-side * 0.12 * width, -index * 0.6, -side * 2)
    // El golpe contra la mesa: la mano, en su pila; el mazo, ya en su lugar.
    const knocked = gather ? pose(0, 2, 0) : `translate(0px, 2px) ${own}rotate(0deg)`
    const dropAt = plan.dropFrom + (count > 1 ? (index * plan.dropSpan) / (count - 1) : 0)
    const openAt = plan.openFrom + (count > 1 ? (rank(index) * plan.openSpan) / (count - 1) : 0)
    const steps: Array<[at: number, transform: string, easing?: string]> = [
      [0, home, gather ? EASE_IN_OUT : EASE_OUT],
      ...(gather ? [[plan.gather, pile, EASE_OUT] as [number, string, string]] : []),
      [plan.split, packet],
      [dropAt, packet, EASE_IN_OUT],
      [dropAt + plan.drop, landed, EASE_SNAP],
      [plan.knock, knocked],
      [openAt, knocked, EASE_IN_OUT],
      [openAt + plan.open, home],
      [total, home],
    ]

    // Sale del fin de su transición (al robar, la mano que se abre): la tapa, así que se corta, y la del barajado queda sola y va en la GPU (con las dos, Chromium sacaba a la transición).
    transitions[index]?.cancel()
    cancelWhenDone(card.animate(steps.map(([at, transform, easing]) => ({ offset: Math.round((at / total) * 1e4) / 1e4, transform, ...(easing ? { easing } : {}) })), { id: SHUFFLE_ID, duration: total }))
  })
}

/** Baraja el mazo (sus capas de dorso, `[data-layer]`): se parte en dos paquetes, se intercalan cayendo al centro y la pila se golpea contra la mesa. */
export const shuffleDeck = (layers: Iterable<Element>) => shuffle(layers, DECK, false)

/** Baraja una mano (la propia o los dorsos del rival): se junta en una pila, el riffle del mazo, y se abre salteada a sus lugares. El orden de la mano no cambia. */
export const shuffleHand = (cards: Iterable<Element>) => shuffle(cards, HAND, true)
