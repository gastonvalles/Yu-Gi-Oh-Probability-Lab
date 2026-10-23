import { LOCATION, POSITION, type CardStat, type CoreAsk, type EventType, type Seat, type WireEvent } from './protocol'

/**
 * El árbitro: qué ve cada asiento (§3.4 del diseño). El núcleo conoce todo; antes de que algo salga del anfitrión, cada evento pasa por
 * `eventFor(seat, …)`, cada pregunta por `askFor` y cada consulta por `statsFor`. Lo que un asiento no puede ver viaja con código 0 (la
 * mesa lo dibuja boca abajo) o no viaja. La regla de fondo es una sola, `knows`; la tabla `RULES` dice, mensaje por mensaje, dónde se
 * aplica: un mensaje nuevo en `EVENT_SHAPES` sin su regla acá no compila.
 */

/** Lo que es de todos: el cementerio, los materiales de Xyz y lo que está boca arriba fuera del deck y de la mano. */
export function isPublic(location: number, position: number | undefined): boolean {
  if (location & (LOCATION.GRAVE | LOCATION.OVERLAY)) return true
  if (location & (LOCATION.DECK | LOCATION.HAND)) return false

  return position !== undefined && (position & POSITION.FACEUP) !== 0
}

/** Si `seat` puede ver la carta que está en ese lugar: lo público, y lo propio menos el deck (la mano, lo colocado, el Extra, lo desterrado boca abajo). */
export function knows(seat: Seat, card: { controller: Seat; location: number; position?: number }): boolean {
  return isPublic(card.location, card.position) || (card.controller === seat && (card.location & LOCATION.DECK) === 0)
}

/** En una pregunta, quien elige ve además su propio deck (buscar es mirarlo); del rival, sólo lo público (como el servidor de YGOPro). */
const askKnows = (asker: Seat, card: { controller: Seat; location: number; position?: number }) => card.controller === asker || isPublic(card.location, card.position)

const hide = <T extends { code: number }>(card: T): T => (card.code === 0 ? card : { ...card, code: 0 })
const only = <T extends { code: number; controller: Seat; location: number; position?: number }>(seat: Seat, card: T): T => (knows(seat, card) ? card : hide(card))

/** Pistas que son para un solo jugador: evento, mensaje, el título de una pregunta, la opción elegida y el efecto (que trae el código de una carta). */
const PRIVATE_HINTS = new Set([1, 2, 3, 4, 5])

type Rule<K extends EventType> = (seat: Seat, event: Extract<WireEvent, { type: K }>) => Extract<WireEvent, { type: K }> | null
const all = <K extends EventType>(): Rule<K> => (_seat, event) => event

const RULES: { [K in EventType]: Rule<K> } = {
  hint: (seat, e) => (!PRIVATE_HINTS.has(e.hint_type) || e.player === seat ? e : null),
  // Excavar es mostrar a los dos.
  confirm_decktop: all(),
  confirm_extratop: all(),
  // Lo confirmado lo ve quien mira; el otro, sólo lo que ya podía ver (casi siempre es el dueño).
  confirm_cards: (seat, e) => (e.player === seat ? e : { ...e, cards: e.cards.map((card) => only(seat, card)) }),
  shuffle_deck: all(),
  shuffle_hand: (seat, e) => (e.player === seat ? e : { ...e, cards: e.cards.map(() => 0) }),
  shuffle_extra: (seat, e) => (e.player === seat ? e : { ...e, cards: e.cards.map(() => 0) }),
  // Vuelven al Extra desde el cementerio: eran públicas.
  swap_grave_deck: all(),
  shuffle_set_card: all(),
  reverse_deck: all(),
  deck_top: (_seat, e) => ((e.position & POSITION.FACEUP) !== 0 ? e : hide(e)),
  new_turn: all(),
  new_phase: all(),
  // El código va si quien lo recibe ve el lugar de destino: hacia la mano o lo colocado, sólo su dueño; hacia el deck, nadie.
  move: (seat, e) => (knows(seat, e.to) || e.card === 0 ? e : { ...e, card: 0 }),
  pos_change: (seat, e) => only(seat, e),
  set: (seat, e) => only(seat, e),
  swap: (seat, e) => ({ ...e, card1: only(seat, e.card1), card2: only(seat, e.card2) }),
  field_disabled: all(),
  summoning: (seat, e) => only(seat, e),
  summoned: all(),
  spsummoning: (seat, e) => only(seat, e),
  spsummoned: all(),
  flipsummoning: (seat, e) => only(seat, e),
  flipsummoned: all(),
  // Activar muestra la carta (también desde la mano o boca abajo).
  chaining: all(),
  chained: all(),
  chain_solving: all(),
  chain_solved: all(),
  chain_end: all(),
  chain_negated: all(),
  chain_disabled: all(),
  card_selected: all(),
  random_selected: all(),
  become_target: all(),
  // Robar es secreto, salvo lo que se roba boca arriba (un robo que se muestra).
  draw: (seat, e) => (e.player === seat ? e : { ...e, drawn: e.drawn.map((card) => ((card.position & POSITION.FACEUP) !== 0 ? card : hide(card))) }),
  damage: all(),
  recover: all(),
  equip: all(),
  lpupdate: all(),
  card_target: all(),
  cancel_target: all(),
  pay_lpcost: all(),
  add_counter: all(),
  remove_counter: all(),
  attack: all(),
  battle: all(),
  attack_disabled: all(),
  damage_step_start: all(),
  damage_step_end: all(),
  // «X no pudo activarse a tiempo»: sólo a su dueño (como el servidor de YGOPro).
  missed_effect: (seat, e) => (e.controller === seat ? e : null),
  toss_coin: all(),
  toss_dice: all(),
  hand_res: all(),
  card_hint: all(),
  show_hint: all(),
  player_hint: all(),
  match_kill: all(),
  remove_cards: all(),
  waiting: all(),
}

/** El evento como lo ve `seat`, o `null` si no le llega. */
export function eventFor(seat: Seat, event: WireEvent): WireEvent | null {
  return (RULES[event.type] as Rule<EventType>)(seat, event as never)
}

/** La pregunta como la ve quien elige: las cartas del rival que no son públicas, con código 0 (elegir una carta colocada no es verla). */
export function askFor(asker: Seat, ask: CoreAsk): CoreAsk {
  const scrub = (value: unknown): unknown => {
    if (!Array.isArray(value)) return value

    return value.map((card: { code?: number; controller?: Seat; location?: number; position?: number }) =>
      typeof card.code === 'number' && card.controller !== undefined && card.location !== undefined && !askKnows(asker, card as never) ? hide(card as { code: number }) : card,
    )
  }
  const out = Object.fromEntries(Object.entries(ask).map(([key, value]) => [key, scrub(value)])) as CoreAsk

  return out.type === 'select_effectyn' && !askKnows(asker, out) ? hide(out) : out
}

/** De lo consultado del campo, lo que `seat` puede ver: el resto no le llega (ni el código ni el ATK de una carta colocada del rival). */
export function statsFor(seat: Seat, cards: readonly CardStat[]): CardStat[] {
  return cards.filter((card) => knows(seat, card))
}
