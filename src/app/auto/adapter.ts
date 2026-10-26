import { mirrorApply, openMirror, type Mirror, type WireAct } from '../mat-public'
import { createMatState, matReducer, type MatAction, type MatPile, type MatPos, type MatSpot, type MatState, type MatSummon, type MatTakeZone } from '../practice-mat'
import { LOCATION as L, POSITION as P, type AutoEvent, type EventOf, type LocPos, type Seat, type WireEvent } from './protocol'
import type { ChainStep } from './chain-feed'
import { isPublic } from './referee'

/**
 * El adaptador: del núcleo a la mesa (§2.3 y §3.3 del diseño). El núcleo manda y la mesa es una proyección: cada evento que el árbitro le
 * deja ver a un asiento se vuelve las mismas `MatAction` de siempre, para su mesa (`mine`, ids reales) y para el espejo de la del rival
 * (`theirs`, con la forma de `WireAct`: ids opacos `c<n>` y `reveal` de lo que el núcleo mostró). Lo que `MatState` no tiene (ATK/DEF de
 * ahora, la cadena, las vidas, el turno y la fase del núcleo, los equipos) va en `overlay`; lo que no se pudo proyectar, en `unmapped`.
 *
 * Identidad: el núcleo nombra cada carta por (controlador, lugar, secuencia). El adaptador lleva su propia copia de esas listas, en el orden
 * del núcleo, con una carta (`Card`: id, dueño y código si este asiento lo sabe) en cada lugar, y la corre con cada evento. Tres reglas:
 * - El deck es una bolsa: después de barajar nadie sabe el orden (ni su dueño), así que se roba y se saca por código (`pick`). Por eso `draw`
 *   lleva `ids`. La mano del rival también es bolsa (la vemos de dorso; al barajarla perdemos qué es cada una).
 * - Un id opaco que ya se mostró queda atado a ese código para siempre (`Mirror.known` no olvida): de una bolsa se elige primero una carta
 *   conocida con ese código, después una desconocida, nunca una conocida con otro.
 * - Una carta está siempre en las pilas de su dueño; en el campo del otro va con `f.` + su id (`mat-control.ts`): las del rival que controlo,
 *   `f.c<n>` en mi mesa; las mías que controla él, `f.card-…` en su espejo (mi id real: no viaja por la red, el espejo es local).
 * No importa el paquete del núcleo: sólo el protocolo y la mesa.
 */

export type Side = 'mine' | 'theirs'
/** Una carta de una de las dos mesas. */
export interface CardRef {
  side: Side
  id: string
}

export interface ChainLink {
  card: CardRef | null
  code: number
  /** El `desc` del efecto (u64 en texto; la carta y cuál de sus textos: `splitDesc`). */
  description: string
  state: 'chained' | 'solving' | 'solved' | 'negated' | 'disabled'
}

/** Lo que el núcleo cuenta y `MatState` no tiene. Se lee, no se jugó: no entra en la mesa ni en sus combos. */
export interface AutoOverlay {
  /** ATK, DEF y nivel de ahora de lo que el asiento ve en el campo (la última consulta del anfitrión), por mesa y por id. */
  stats: Record<Side, Record<string, { attack: number; defense: number; level: number }>>
  /** La cadena en curso, del eslabón 1 en adelante. */
  chain: ChainLink[]
  /**
   * Lo que se negó (la activación o el efecto) en la cadena en curso o en la última, en orden: la cadena se resuelve de una y la pantalla lo cuenta después. Se vacía al empezar otra.
   * `by`: el eslabón que lo negó (`ChainStep.by`). La pantalla no lee esto: lee `chainSteps`, que van al ritmo del aviso de la cadena.
   */
  negated: Array<ChainLink & { by?: number }>
  /** Las vidas, por asiento del núcleo. */
  lp: [number, number]
  /** El turno del núcleo (1 = el primero) y de quién es; la fase, con la constante del núcleo (`PHASE_*`: 1 Draw … 0x200 End). */
  turn: number
  turnPlayer: Seat | null
  phase: number
  /** Las cartas de equipo y a qué están equipadas. */
  equips: { card: CardRef; target: CardRef }[]
  /** Las casillas que el núcleo deshabilitó (`field_mask`, como en `select_place`). */
  disabled: number
  end: { winner: number; reason: number } | null
  /**
   * Lo que rige sobre cada asiento («no podés Invocar de Modo Especial, salvo monstruos VIENTO»): el `desc` del texto de cada efecto con `EFFECT_FLAG_CLIENT_HINT`, por asiento.
   * `player_hint` 6 lo agrega y 7 lo quita (el núcleo lo manda al vencer el efecto: con `RESET_PHASE|PHASE_END`, en la End Phase).
   */
  limits: [string[], string[]]
  /** La primera Invocación Normal (`summon`) o Colocación de un monstruo (`set`) de cada asiento en este turno; null si no hubo. */
  normal: [NormalPlay | null, NormalPlay | null]
  /**
   * Lo último que pasó y puede disparar un efecto, para contarlo en la pregunta «¿Activás el efecto…?» (el núcleo no lo dice): la Invocación Normal, Especial o por Volteo de las cartas
   * que se invocaron juntas, o el comienzo de una fase. Lo borra lo que abre otro momento (una activación, un ataque, el turno nuevo): lo que se dispara después ya no vino de ahí.
   */
  cause: TriggerCause | null
}
export type NormalPlay = 'summon' | 'set'
export type TriggerCause = { kind: 'normal' | 'special' | 'flip'; codes: number[] } | { kind: 'phase'; phase: MatState['phase'] }
/** `PHINT_DESC_ADD` y `PHINT_DESC_REMOVE` del núcleo. */
const LIMIT_ADD = 6
const LIMIT_REMOVE = 7

export interface AdapterOptions {
  /** El asiento que mira (0 = el que empieza). */
  seat: Seat
  /** Mis cartas, como las puso el anfitrión: el Main de arriba hacia abajo (`teamOrder` de `deck-map.ts`; con `bag`, por código) y el Extra en su orden. */
  mine: { deck: readonly number[]; extra: readonly number[] }
  /** Del rival sólo se sabe cuántas cartas tiene. */
  theirs: { deck: number; extra: number }
  /** Mi deck es bolsa desde el arranque (el invitado del duelo por enlace, que no sabe su orden; y el anfitrión al proyectarlo): se roba y se saca por código, nunca por secuencia. */
  bag?: boolean
  /** Las vidas iniciales de cada asiento. */
  lp?: [number, number]
  /** La máscara de tipo de una carta (`type` del `.cdb`); 0 si no se sabe. Distingue Fusión / Sincronía / Xyz / Enlace / Péndulo. */
  typeOf: (code: number) => number
}

export interface AdapterOutput {
  mine: MatAction[]
  theirs: WireAct[]
  overlay: AutoOverlay
  unmapped: string[]
  /** Los mensajes de la cadena de esta tanda, en orden, con cuántas jugadas de `mine` había (el aviso de la cadena los cuenta de a uno: `chain-feed.ts`). */
  chain: ChainStep[]
}

/** Un lugar del núcleo, con el número de material si está debajo de un Xyz. */
export type CorePlace = { controller: Seat; location: number; sequence: number; overlay_sequence?: number }

export interface Adapter {
  apply(event: AutoEvent): AdapterOutput
  /** Las mesas con las que arranca el duelo: la mía y la del rival enmascarada (la de su espejo: `openMirror`). */
  readonly initial: { mine: MatState; theirs: MatState }
  readonly mine: MatState
  readonly theirs: Mirror
  readonly overlay: AutoOverlay
  /** La carta que el núcleo tiene en ese lugar, con el id de la mesa donde se dibuja (la del controlador), o null. En el deck y en la mano del rival (bolsas) da una cualquiera. */
  idAt(place: CorePlace): string | null
  /** Dónde tiene el núcleo una carta de una mesa. */
  locationOf(ref: CardRef): CorePlace | null
  /** El código de una carta de una mesa (0 = este asiento no lo sabe). */
  codeOf(ref: CardRef): number
}

interface Card {
  /** El id en la mesa de su dueño: `card-<código>-<n>` las mías, `c<n>` las del rival, `token-<n>` las fichas (de la mesa de quien las creó). */
  id: string
  owner: Seat
  /** 0 = este asiento no lo sabe. Del rival, una vez mostrada queda atada a ese código (como en `Mirror.known`). */
  code: number
  /** Del rival: estaba en una bolsa de la que salió una carta oculta, así que ya no se sabe si sigue siendo esa (`codeOf` da 0). */
  unsure?: boolean
}

type Slots = (Card | null)[]
interface Places {
  deck: Card[]
  hand: Card[]
  grave: Card[]
  removed: Card[]
  extra: Card[]
  mzone: Slots
  szone: Slots
}

const TYPE = { FUSION: 0x40, SYNCHRO: 0x2000, XYZ: 0x800000, PENDULUM: 0x1000000, LINK: 0x4000000 } as const
const PILE_KEY: Record<number, keyof Places> = { [L.DECK]: 'deck', [L.HAND]: 'hand', [L.MZONE]: 'mzone', [L.SZONE]: 'szone', [L.GRAVE]: 'grave', [L.REMOVED]: 'removed', [L.EXTRA]: 'extra' }
const MAT_PILE: Record<number, MatPile> = { [L.DECK]: 'deck', [L.HAND]: 'hand', [L.GRAVE]: 'gy', [L.REMOVED]: 'banished', [L.EXTRA]: 'extra' }
/** `PHASE_*` del núcleo → la fase de la mesa (los pasos de la Battle Phase son una sola). */
const PHASE: Record<number, MatState['phase']> = { 1: 'draw', 2: 'standby', 4: 'main1', 8: 'battle', 0x10: 'battle', 0x20: 'battle', 0x40: 'battle', 0x80: 'battle', 0x100: 'main2', 0x200: 'end' }
/**
 * Mensajes que no cambian la mesa ni el overlay, cada uno con su porqué: las pistas y los textos son para la pantalla (`hint`, `card_hint`,
 * `show_hint`; `player_hint` sólo cuenta en `limits`); `spsummoning` y los `*ed` acompañan a un `move` que ya puso la carta (el adaptador los
 * mira de adelante para saber cómo llegó; `set` y `summoning` sólo cuentan en `normal`); `chained` repite el `chaining`; `card_selected`, `random_selected`, `missed_effect`, `battle`,
 * `attack_disabled`, `damage_step_*`, las monedas y los dados son animaciones o avisos; `deck_top` dice que la de arriba está boca arriba (la
 * mesa no tiene esa marca); `match_kill` y `waiting`, del duelo y no de la mesa.
 */
const QUIET = new Set<WireEvent['type']>(['hint', 'card_hint', 'show_hint', 'spsummoning', 'summoned', 'spsummoned', 'flipsummoned', 'chained', 'card_selected', 'random_selected', 'missed_effect', 'battle', 'attack_disabled', 'damage_step_start', 'damage_step_end', 'toss_coin', 'toss_dice', 'hand_res', 'deck_top', 'match_kill', 'waiting'])

/** Jugadas que no mueven cartas. */
const STILL = new Set<MatAction['type']>(['reveal', 'target', 'activate', 'counter', 'attack', 'declare'])

const emptyPlaces = (): Places => ({ deck: [], hand: [], grave: [], removed: [], extra: [], mzone: Array(7).fill(null), szone: Array(8).fill(null) })
const isMaterial = (place: { location: number; overlay_sequence?: number }) => place.overlay_sequence !== undefined || (place.location & L.OVERLAY) !== 0
const baseLocation = (location: number) => location & ~L.OVERLAY

/** La casilla de la mesa: Main Monster Zone 0–4, Extra Monster Zone 5–6, Mágicas y Trampas 0–4 y la de Campo, 5. */
export function spotOf(location: number, sequence: number): { zone: MatSpot; index: number } | null {
  if (location === L.MZONE) return sequence < 5 ? { zone: 'mz', index: sequence } : sequence < 7 ? { zone: 'emz', index: sequence - 5 } : null
  if (location === L.SZONE) return sequence < 5 ? { zone: 'st', index: sequence } : sequence === 5 ? { zone: 'field', index: 0 } : null

  return null
}

/** Boca abajo es `set`; boca arriba en defensa (sólo un monstruo), `def`; lo demás, `atk`. */
const posOf = (location: number, position: number): MatPos => ((position & P.FACEDOWN) !== 0 ? 'set' : location === L.MZONE && (position & P.FACEUP_DEFENSE) !== 0 ? 'def' : 'atk')

/** Ids de copia como los de la mesa (`duelCardIds`): cada código con su cuenta. */
function copyIds(codes: readonly number[]): string[] {
  const seen = new Map<number, number>()

  return codes.map((code) => {
    const copy = (seen.get(code) ?? 0) + 1

    seen.set(code, copy)
    return `card-${code}-${copy}`
  })
}

const freshOverlay = (lp: [number, number]): AutoOverlay => ({ stats: { mine: {}, theirs: {} }, chain: [], negated: [], lp: [...lp], turn: 0, turnPlayer: null, phase: 0, equips: [], disabled: 0, end: null, limits: [[], []], normal: [null, null], cause: null })

export function createAdapter(options: AdapterOptions): Adapter {
  const { seat, typeOf } = options
  const rival = (1 - seat) as Seat
  const places: [Places, Places] = [emptyPlaces(), emptyPlaces()]
  const materials = new Map<Card, Card[]>()
  const realOf = new Map<number, number>()
  const marks = new Set<Card>()
  /**
   * Las bolsas: los lugares que se barajaron y de los que ya no se sabe el orden (el deck, y del rival la mano y el Extra). Hasta barajarse se
   * siguen por secuencia (el árbitro las da todas, aunque oculte el código); vuelven a ser listas al vaciarse.
   */
  const bags: [Set<number>, Set<number>] = [new Set(), new Set()]
  const lasting = new Set<Card>()

  // Las cartas en el orden del núcleo: el deck de abajo hacia arriba (el anfitrión agrega el Main al revés, cada una arriba), el Extra tal cual.
  const myDeck = copyIds(options.mine.deck)
  const myExtra = copyIds(options.mine.extra)
  const theirDeck = Array.from({ length: options.theirs.deck }, (_, i) => `c${i + 1}`)
  const theirExtra = Array.from({ length: options.theirs.extra }, (_, i) => `c${options.theirs.deck + i + 1}`)

  places[seat].deck = myDeck.map((id, i) => ({ id, owner: seat, code: options.mine.deck[i]! })).reverse()
  places[seat].extra = myExtra.map((id, i) => ({ id, owner: seat, code: options.mine.extra[i]! }))
  places[rival].deck = theirDeck.map((id) => ({ id, owner: rival, code: 0 })).reverse()
  places[rival].extra = theirExtra.map((id) => ({ id, owner: rival, code: 0 }))
  // El deck del rival es bolsa desde el principio: su orden nunca es seguro para quien mira (un `sort_card` del rival lo cambia sin decir nada).
  bags[rival].add(L.DECK)
  if (options.bag) bags[seat].add(L.DECK)

  const initial = { mine: createMatState(myDeck, myExtra, 0), theirs: createMatState(theirDeck, theirExtra, 0) }
  let mine = initial.mine
  let theirs = openMirror(initial.theirs)
  let overlay = freshOverlay(options.lp ?? [8000, 8000])
  let out: AdapterOutput
  let pending: Record<string, string> = {}
  let shuffles = 0
  /** La última jugada de cada asiento que sacó una carta de su deck (para sumarle el barajado que la sigue: «Buscás X y barajás»). */
  let fromDeck: [{ at: number; before: MatState | Mirror } | null, { at: number; before: MatState | Mirror } | null] = [null, null]
  /** Las cartas que esta tanda puso boca arriba en las Mágicas y Trampas: su `chaining` no es otra activación (la jugada ya la cuenta). */
  let openedNow = new Set<Card>()
  /** Una Invocación sin su `*summoned` todavía: las cartas que se invocan juntas van en la misma causa. */
  let summoning = false

  const matId = (card: Card, controller: Seat) => (card.owner === controller ? card.id : `f.${card.id}`)
  const ref = (card: Card, controller: Seat): CardRef => ({ side: controller === seat ? 'mine' : 'theirs', id: matId(card, controller) })
  const stateOf = (player: Seat) => (player === seat ? mine : theirs.state)
  const note = (text: string): void => void out.unmapped.push(text)
  const cause = (next: TriggerCause | null) => void (overlay = { ...overlay, cause: next })
  function summon(kind: 'normal' | 'special' | 'flip', code: number) {
    const now = overlay.cause

    cause(summoning && now?.kind === kind ? { kind, codes: [...now.codes, code] } : { kind, codes: [code] })
    summoning = true
  }

  function emit(player: Seat, action: MatAction, deck = false) {
    const before = player === seat ? mine : theirs

    if (player === seat) {
      out.mine.push(action)
      mine = matReducer(mine, action)
    } else {
      const wire: WireAct = { action, reveal: pending }

      pending = {}
      out.theirs.push(wire)
      theirs = mirrorApply(theirs, wire)
    }
    // Lo que no mueve cartas (mostrar, marcar, activar, contadores) no corta la jugada que sacó del deck: el barajado se le suma igual.
    if (deck) fromDeck[player] = { at: (player === seat ? out.mine : out.theirs).length - 1, before }
    else if (!STILL.has(action.type)) fromDeck[player] = null
  }

  /**
   * Lo que este asiento acaba de ver de una carta (`open`: queda a la vista). Del rival, el id opaco se ata a su código (un id real
   * `card-<código>-<n>` en el `reveal` de la jugada que sigue) sólo cuando la carta queda a la vista: lo que se ve en la mano o en el deck lo
   * sabe el adaptador (`codeOf`) y no el espejo, que no olvida, así una mano barajada no le deja un nombre viejo.
   */
  function learn(card: Card, code: number, open = false) {
    if (code === 0) return
    const bound = card.owner === rival && (Object.hasOwn(theirs.known, card.id) || Object.hasOwn(pending, card.id))

    if (card.code !== 0 && card.code !== code) {
      // Segura y con otro código: la carta cambió de código en su lugar (el núcleo la sigue consultando con el de antes). La mesa no cambia un id.
      if (!card.unsure && (card.owner === seat || bound)) return note(`unsupported: code changed in place (${card.code} to ${code})`)
      if (!card.unsure) note(`identity: ${card.id} was ${card.code}, the core says ${code}`)
      // Dudosa y ya atada en el espejo: se perdió su identidad al barajar (el `known` del espejo la sigue mostrando como era).
      else if (bound) note(`unsupported: identity lost in a shuffled pile (${card.id})`)
    }
    card.code = code
    card.unsure = false
    if (open && card.owner === rival && !bound) {
      const n = (realOf.get(code) ?? 0) + 1

      realOf.set(code, n)
      pending[card.id] = `card-${code}-${n}`
    }
  }

  /** De una bolsa, la carta con ese código (una conocida antes que una desconocida; de arriba hacia abajo); con código 0, una desconocida. */
  function bagIndex(list: readonly Card[], code: number): number {
    const same = code === 0 ? -1 : list.findLastIndex((card) => card.code === code)
    const unknown = list.findLastIndex((card) => card.code === 0)

    return same >= 0 ? same : unknown >= 0 ? unknown : list.length - 1
  }

  /** Dónde está, en la copia del núcleo, la carta de ese lugar: la lista y el índice (en una casilla, la fila entera y su número). */
  function locate(place: CorePlace & { location: number }, code: number): { list: (Card | null)[]; index: number } | null {
    if (isMaterial(place)) {
      const xyz = cardAt({ controller: place.controller, location: baseLocation(place.location), sequence: place.sequence })
      const list = xyz ? materials.get(xyz) : undefined

      if (!list) return null
      const at = place.overlay_sequence ?? 0

      return { list, index: list[at] && (code === 0 || list[at]!.code === 0 || list[at]!.code === code) ? at : bagIndex(list, code) }
    }

    const key = PILE_KEY[place.location]

    if (!key) return null
    const list = places[place.controller][key]

    if (key === 'mzone' || key === 'szone') return { list, index: place.sequence }
    if (bags[place.controller].has(place.location)) return list.length > 0 ? { list, index: bagIndex(list as Card[], code) } : null
    const card = list[place.sequence]

    return { list, index: card && (code === 0 || card.code === 0 || card.code === code) ? place.sequence : bagIndex(list as Card[], code) }
  }

  function cardAt(place: CorePlace, code = 0): Card | null {
    const found = locate(place, code)

    return found ? (found.list[found.index] ?? null) : null
  }

  function take(place: LocPos, code: number): Card | null {
    const found = locate(place, code)
    const card = found ? (found.list[found.index] ?? null) : null

    if (!found || !card) return null
    if (!isMaterial(place) && (place.location === L.MZONE || place.location === L.SZONE)) found.list[found.index] = null
    else found.list.splice(found.index, 1)
    // Sale una carta oculta de una bolsa del rival: cualquiera de las que conocíamos pudo ser ella.
    if (code === 0 && place.controller === rival && bags[rival].has(place.location)) for (const item of [card, ...(found.list as Card[])]) if (item.code !== 0) item.unsure = true
    if (found.list.length === 0) bags[place.controller].delete(place.location)

    return card
  }

  function put(place: LocPos, card: Card) {
    if (isMaterial(place)) {
      const xyz = cardAt({ controller: place.controller, location: baseLocation(place.location), sequence: place.sequence })

      if (!xyz) return note('move: material without its Xyz')
      const list = materials.get(xyz) ?? []

      list.splice(Math.min(place.overlay_sequence ?? list.length, list.length), 0, card)
      materials.set(xyz, list)
      return
    }

    const key = PILE_KEY[place.location]!
    const list = places[place.controller][key]

    if (key === 'mzone' || key === 'szone') list[place.sequence] = card
    else list.splice(Math.min(place.sequence, list.length), 0, card)
  }

  /** Cómo llegó un monstruo a su zona: lo dice el mensaje que sigue al `move` en la misma tanda (`summoning` / `spsummoning`). */
  function arrival(card: Card, from: LocPos, to: LocPos, rest: readonly WireEvent[]): MatSummon | 'fusion' | 'synchro' | 'xyz' | 'link' | undefined {
    const type = typeOf(card.code)

    if (to.location === L.SZONE) return from.location === L.HAND && (type & TYPE.PENDULUM) !== 0 && (to.sequence === 0 || to.sequence === 4) && (to.position & P.FACEUP) !== 0 ? 'scale' : undefined
    const summon = rest.find((event) => (event.type === 'summoning' || event.type === 'spsummoning') && event.controller === to.controller && event.location === to.location && event.sequence === to.sequence)

    if (from.location === L.EXTRA) {
      if ((from.position & P.FACEUP) !== 0) return 'pendulum'
      if (type & TYPE.LINK) return 'link'
      if (type & TYPE.XYZ) return 'xyz'
      if (type & TYPE.SYNCHRO) return 'synchro'
      if (type & TYPE.FUSION) return 'fusion'
    }
    if (!summon) return undefined

    return summon.type === 'summoning' ? 'normal' : 'special'
  }

  /** El control cambia sin que la carta salga del campo (Cambio de Corazón, o cuando vuelve): una jugada en cada mesa, como `mat-control.ts`. */
  function control(card: Card, from: LocPos, to: LocPos) {
    const spot = spotOf(to.location, to.sequence)
    const zone: MatTakeZone | null = spot?.zone === 'emz' ? null : (spot?.zone ?? null)

    if (!spot || !zone) return note(`control: ${card.id} to an Extra Monster Zone`)
    const pos = posOf(to.location, to.position)

    emit(from.controller, { type: 'give', id: matId(card, from.controller) })
    emit(to.controller, card.owner === to.controller ? { type: 'regain', id: card.id, to: zone, index: spot.index, pos } : { type: 'take', id: `f.${card.id}`, zone, index: spot.index, pos })
  }

  function move(event: EventOf<'move'>, rest: readonly WireEvent[]) {
    const { from, to } = event

    // Una carta que aparece de la nada: una ficha (la mesa le da `token-<n>`).
    if (from.location === 0) {
      const spot = spotOf(to.location, to.sequence)

      if (!spot || spot.zone === 'field' || isMaterial(to)) return note(`move: a card from nowhere to ${to.location}`)
      const card: Card = { id: `token-${stateOf(to.controller).tokens + 1}`, owner: to.controller, code: event.card }

      put(to, card)
      return emit(to.controller, { type: 'token', zone: spot.zone, index: spot.index, pos: posOf(to.location, to.position) === 'def' ? 'def' : 'atk' })
    }

    const card = take(from, event.card)

    if (!card) return note(`move: nothing at ${from.controller}/${from.location}/${from.sequence}`)
    learn(card, event.card, isMaterial(to) || isPublic(to.location, to.position))
    const fromSpot = isMaterial(from) ? null : spotOf(from.location, from.sequence)

    // Una ficha que deja el campo desaparece (en la mesa también: `move` la borra); una carta que se va del duelo, lo mismo.
    if (card.id.startsWith('token-') && fromSpot && !spotOf(to.location, to.sequence)) return emit(from.controller, { type: 'move', id: matId(card, from.controller), to: 'gy' })
    if (to.location === 0) return fromSpot ? emit(from.controller, { type: 'move', id: matId(card, from.controller), to: 'gy' }) : note('move: a card leaves the duel from a pile')
    // Robar del tope al tope no cambia nada que la mesa sepa.
    if (from.location === L.DECK && to.location === L.DECK && from.controller === to.controller) return put(to, card)
    put(to, card)

    // Debajo de un Xyz: si está en el campo, `attach`; si está en el Extra (la Invocación Xyz los junta antes de sacarlo), se espera a que salga.
    if (isMaterial(to)) {
      const xyz = cardAt({ controller: to.controller, location: baseLocation(to.location), sequence: to.sequence })

      if (!xyz || baseLocation(to.location) !== L.MZONE) return
      // La carta tiene que estar en la mesa del Xyz: viene de su campo, de debajo de otro de sus Xyz o de una pila de su dueño.
      const source = fromSpot || isMaterial(from) ? from.controller : card.owner

      return source === to.controller ? emit(to.controller, { type: 'attach', id: matId(card, to.controller), to: matId(xyz, to.controller) }) : note('move: a material from the other side')
    }

    const toSpot = spotOf(to.location, to.sequence)

    if (toSpot) {
      const pos = posOf(to.location, to.position)

      if (fromSpot) return from.controller === to.controller ? emit(to.controller, { type: 'place', id: matId(card, to.controller), zone: toSpot.zone, index: toSpot.index, pos }) : control(card, from, to)
      // De una pila del otro a mi campo (Monster Reborn sobre una de su cementerio; un Kaiju o Contact "C", de su mano): sale de su mesa y entra a la mía como ajena.
      if (card.owner !== to.controller) {
        if (toSpot.zone === 'emz') return note('move: a card of the other side to an Extra Monster Zone')
        emit(card.owner, { type: 'give', id: card.id })
        return emit(to.controller, { type: 'take', id: `f.${card.id}`, zone: toSpot.zone, index: toSpot.index, pos })
      }

      const how = arrival(card, from, to, rest)
      const id = card.id

      if (pos === 'atk' && to.location === L.SZONE) openedNow.add(card)
      if (how === 'fusion' || how === 'synchro' || how === 'xyz' || how === 'link') {
        if (toSpot.zone === 'field') return note('move: an Extra Deck monster to the Field Zone')
        // En una bolsa (el Extra del rival, barajado) el núcleo junta los materiales debajo de una secuencia, que no dice cuál carta es: quedaron
        // en una cualquiera y son de la que sale (elegida por su código).
        const holder = how === 'xyz' && !materials.has(card) ? places[from.controller].extra.find((item) => materials.has(item)) : undefined

        if (holder) {
          materials.set(card, materials.get(holder)!)
          materials.delete(holder)
        }
        // Los materiales del Xyz siguen en la mesa hasta ahora (no se pueden poner debajo de una carta del Extra): la invocación los lleva.
        const held = (materials.get(card) ?? []).map((material) => matId(material, to.controller))
        const onField = held.filter((material) => {
          const where = locateIn(stateOf(to.controller), material)

          return where === 'mz' || where === 'emz'
        })

        emit(to.controller, { type: 'summon', id, how, materials: onField, zone: toSpot.zone, index: toSpot.index, pos })
        const under = placedIn(stateOf(to.controller), id)?.materials ?? []

        for (const material of held) if (!under.includes(material)) emit(to.controller, { type: 'attach', id: material, to: id })
        return
      }

      return emit(to.controller, { type: 'place', id, zone: toSpot.zone, index: toSpot.index, pos, ...(how ? { how } : {}) }, from.location === L.DECK)
    }

    // A una pila. El deck: arriba (secuencia = las que había) o abajo (0).
    const pile = MAT_PILE[to.location]

    if (!pile) return note(`move: unknown destination ${to.location}`)
    const below = pile === 'deck' && to.sequence === 0 && places[to.controller].deck.length > 1
    const toPile = below ? 'deck-bottom' : pile
    const extra = { ...(to.location === L.REMOVED && (to.position & P.FACEDOWN) !== 0 ? { faceDown: true } : {}), ...(to.location === L.EXTRA && (to.position & P.FACEUP) !== 0 ? { faceUp: true } : {}) }

    // Del campo de quien la controlaba a la pila de su dueño.
    if (fromSpot && card.owner !== from.controller) {
      emit(from.controller, { type: 'move', id: matId(card, from.controller), to: toPile })
      return emit(card.owner, { type: 'regain', id: card.id, to: toPile, ...extra })
    }
    if (to.controller !== card.owner) return note(`move: ${card.id} to a pile of the other side`)
    emit(to.controller, { type: 'move', id: card.id, to: toPile, ...extra }, from.location === L.DECK)
  }

  function draw(event: EventOf<'draw'>) {
    const player = event.player as Seat
    const ids: string[] = []

    for (const drawn of event.drawn) {
      const deck = places[player].deck
      // Se roba la de arriba; si el deck ya es bolsa (o la de arriba es otra carta conocida), la que diga el código.
      const top = deck.at(-1)
      const exact = !bags[player].has(L.DECK) && top && (drawn.code === 0 || top.code === 0 || top.code === drawn.code)
      const card = deck.length > 0 ? deck.splice(exact ? deck.length - 1 : bagIndex(deck, drawn.code), 1)[0]! : null

      if (!card) {
        note('draw: the deck is empty')
        continue
      }
      // Un robo oculto de una bolsa del rival: cualquiera de las que conocíamos en ese deck pudo ser la robada.
      if (drawn.code === 0 && player === rival && bags[rival].has(L.DECK)) for (const item of [card, ...deck]) if (item.code !== 0) item.unsure = true
      learn(card, drawn.code)
      places[player].hand.push(card)
      ids.push(card.id)
    }
    if (ids.length > 0) emit(player, { type: 'draw', count: ids.length, ids })
  }

  /** El turno pasa (`phase` con `skipDraw`: el robo del núcleo llega como `draw`): el que jugaba llega a la End Phase y vuelve a la Draw Phase, así su cuenta de turnos sube como en el duelo (`duel-turn.ts`). */
  function passTurn(player: Seat) {
    if (stateOf(player).phase !== 'end') emit(player, { type: 'phase', phase: 'end' })
    emit(player, { type: 'phase', phase: 'draw', skipDraw: true })
  }

  /** El barajado del deck: se suma a la jugada que acaba de sacar una carta de ese deck (una sola jugada, como en la mesa), o va solo. */
  function shuffleDeck(player: Seat) {
    const seed = (++shuffles * 0x9e3779b1) >>> 0
    const last = fromDeck[player]

    if (!last) return emit(player, { type: 'shuffle', seed })
    // Se cambia esa jugada y se rehace todo lo que vino después.
    if (player === seat) {
      out.mine[last.at] = { ...out.mine[last.at]!, shuffle: seed } as MatAction
      mine = out.mine.slice(last.at).reduce(matReducer, last.before as MatState)
    } else {
      out.theirs[last.at] = { ...out.theirs[last.at]!, action: { ...out.theirs[last.at]!.action, shuffle: seed } as MatAction }
      theirs = out.theirs.slice(last.at).reduce(mirrorApply, last.before as Mirror)
    }
    fromDeck[player] = null
  }

  /** Volver a emparejar una pila mía con el orden nuevo que dice el núcleo (barajar la mano o el Extra): mismas cartas, por código. */
  function reorder(list: Card[], codes: readonly number[]) {
    const old = [...list]
    const next = codes.map((code) => old.splice(bagIndex(old, code), 1)[0]!).filter(Boolean)

    list.splice(0, list.length, ...next, ...old)
  }

  function mark(card: Card, controller: Seat, on: boolean) {
    const id = matId(card, controller)

    if (stateOf(controller).targeted.includes(id) !== on) emit(controller, { type: 'target', id })
  }

  function where(card: Card): CorePlace | null {
    for (const controller of [0, 1] as const) {
      for (const [key, list] of Object.entries(places[controller]) as [keyof Places, Slots][]) {
        const sequence = list.indexOf(card)

        if (sequence >= 0) return { controller, location: Number(Object.keys(PILE_KEY).find((loc) => PILE_KEY[Number(loc)] === key)), sequence }
      }
    }
    for (const [xyz, list] of materials) {
      const at = list.indexOf(card)
      const holder = at >= 0 ? where(xyz) : null

      if (holder) return { ...holder, overlay_sequence: at }
    }

    return null
  }

  function handle(event: WireEvent, rest: readonly WireEvent[]) {
    switch (event.type) {
      case 'move':
        return move(event, rest)
      case 'draw':
        return draw(event)

      case 'pos_change':
      case 'flipsummoning': {
        const card = cardAt(event, event.code)

        if (event.type === 'flipsummoning') summon('flip', event.code)

        if (!card) return note(`${event.type}: nothing there`)
        learn(card, event.code, (event.position & P.FACEUP) !== 0)
        const id = matId(card, event.controller)
        const pos = posOf(event.location, event.position)
        const placed = placedIn(stateOf(event.controller), id)

        if (placed && placed.pos !== pos) {
          if (event.location === L.SZONE && pos === 'atk') openedNow.add(card)
          emit(event.controller, { type: 'position', id, pos })
        }
        return
      }

      case 'add_counter':
      case 'remove_counter': {
        const card = cardAt(event)

        if (!card) return note(`${event.type}: nothing there`)
        return emit(event.controller, { type: 'counter', id: matId(card, event.controller), delta: event.type === 'add_counter' ? event.count : -event.count })
      }

      case 'shuffle_deck':
        bags[event.player as Seat].add(L.DECK)
        return shuffleDeck(event.player as Seat)
      // Lo mío se vuelve a emparejar con el orden nuevo (el árbitro me da los códigos); lo del rival pasa a ser bolsa.
      case 'shuffle_hand':
        if (event.player === seat) return reorder(places[seat].hand, event.cards)
        bags[rival].add(L.HAND)
        return
      case 'shuffle_extra':
        if (event.player === seat) return reorder(places[seat].extra, event.cards)
        bags[rival].add(L.EXTRA)
        return

      case 'confirm_cards':
      case 'confirm_decktop':
      case 'confirm_extratop': {
        const shown: [Seat, string][] = []

        for (const item of event.cards) {
          const card = cardAt(item, item.code)

          if (!card) {
            note(`${event.type}: nothing there`)
            continue
          }
          learn(card, item.code)
          // Lo del deck y del Extra se muestra a la vista de los dos, pero en la mesa es «Mostrás»: va en la de su dueño.
          shown.push([item.controller, matId(card, item.controller)])
        }
        for (const player of [seat, rival]) {
          const ids = shown.filter(([owner]) => owner === player).map(([, id]) => id)

          if (ids.length > 0) emit(player, ids.length === 1 ? { type: 'reveal', id: ids[0]! } : { type: 'batch', actions: ids.map((id) => ({ type: 'reveal' as const, id })) })
        }
        return
      }

      case 'new_turn': {
        const previous = overlay.turnPlayer

        cause(null)
        if (previous !== null) {
          passTurn(previous)
          // El mismo jugador otra vez: el turno del otro se saltó (pasa en su mesa también, así la cuenta de `duel-turn.ts` da a quien juega).
          if (previous === event.player) passTurn((1 - previous) as Seat)
        }
        overlay = { ...overlay, turn: overlay.turn + 1, turnPlayer: event.player as Seat, normal: [null, null] }
        return
      }

      // La Invocación Normal y la Colocación de un monstruo del turno (una Mágica o Trampa colocada también es `set`, en las Mágicas y Trampas).
      case 'summoning':
      case 'set': {
        const kind = event.type === 'summoning' ? 'summon' : event.location === L.MZONE ? 'set' : null
        const normal: AutoOverlay['normal'] = [...overlay.normal]

        if (event.type === 'summoning') summon('normal', event.code)
        if (kind && normal[event.controller] === null) {
          normal[event.controller] = kind
          overlay = { ...overlay, normal }
        }
        return
      }

      case 'player_hint': {
        if (event.player_hint !== LIMIT_ADD && event.player_hint !== LIMIT_REMOVE) return
        const player = event.player as Seat
        const own = overlay.limits[player]
        const at = own.indexOf(event.description)
        const limits: AutoOverlay['limits'] = [...overlay.limits]

        if (event.player_hint === LIMIT_ADD) limits[player] = [...own, event.description]
        else if (at >= 0) limits[player] = own.filter((_, i) => i !== at)
        else return
        overlay = { ...overlay, limits }
        return
      }

      case 'new_phase': {
        const phase = PHASE[event.phase]
        const player = overlay.turnPlayer

        overlay = { ...overlay, phase: event.phase, cause: phase ? { kind: 'phase', phase } : null }
        if (!phase) return note(`new_phase: unknown phase ${event.phase}`)
        if (player !== null && stateOf(player).phase !== phase) emit(player, { type: 'phase', phase })
        return
      }

      case 'chaining': {
        const card = cardAt(event, event.code)

        if (card) learn(card, event.code, isMaterial(event) || isPublic(event.location, event.position))
        const index = overlay.chain.length

        overlay = { ...overlay, cause: null, chain: [...overlay.chain, { card: card ? ref(card, event.controller) : null, code: event.code, description: event.description, state: 'chained' }], ...(index === 0 ? { negated: [] } : {}) }
        // Una Mágica o Trampa que esta tanda dio vuelta o puso boca arriba ya cuenta como activada (la jugada la anota y destella).
        if (card && !openedNow.has(card)) emit(event.controller, { type: 'activate', id: matId(card, event.controller) })
        // Después de su activación: la mesa la muestra y recién ahí se suma el eslabón.
        out.chain.push({ kind: 'chain', at: out.mine.length, index, link: { card: card ? ref(card, event.controller) : null, code: event.code, mine: event.controller === seat, description: event.description, from: event.triggering_location } })
        if (!card) return note('chaining: nothing there')
        return
      }

      case 'chain_solving':
      case 'chain_solved':
      case 'chain_negated':
      case 'chain_disabled': {
        const state = ({ chain_solving: 'solving', chain_solved: 'solved', chain_negated: 'negated', chain_disabled: 'disabled' } as const)[event.type]
        const negation = state === 'negated' || state === 'disabled'
        // Quién lo negó: el núcleo no lo dice, pero niega mientras resuelve un eslabón, así que es el que se está resolviendo (comprobado con el núcleo real en
        // `auto-chain-feed.slow.test.ts`). Si es el mismo eslabón (llega sin efecto a su turno: un efecto continuo) o no se resuelve ninguno, no se sabe: sin `by`.
        const solving = negation ? overlay.chain.findIndex((item, i) => item.state === 'solving' && i !== event.chain_size - 1) : -1
        const by = solving >= 0 ? { by: solving + 1 } : {}

        out.chain.push({ kind: state, at: out.mine.length, index: event.chain_size - 1, ...by })

        // Un eslabón resuelto sale de la cadena (como en el núcleo); los demás cambian de estado.
        const link = overlay.chain[event.chain_size - 1]

        overlay = {
          ...overlay,
          chain: state === 'solved' ? overlay.chain.slice(0, event.chain_size - 1) : overlay.chain.map((item, i) => (i === event.chain_size - 1 ? { ...item, state } : item)),
          ...(negation && link ? { negated: [...overlay.negated, { ...link, state, ...by }] } : {}),
        }
        return
      }

      case 'chain_end':
        overlay = { ...overlay, chain: [] }
        out.chain.push({ kind: 'end', at: out.mine.length, index: -1 })
        // Las miras de los objetivos se van al terminar la cadena (las de `card_target` siguen hasta su `cancel_target`).
        for (const card of [...marks]) {
          const at = where(card)

          if (at && !lasting.has(card) && (at.location === L.MZONE || at.location === L.SZONE)) mark(card, at.controller, false)
          if (!lasting.has(card)) marks.delete(card)
        }
        return

      case 'become_target':
        for (const item of event.cards) {
          const card = cardAt(item)
          const spot = card && !isMaterial(item) ? spotOf(item.location, item.sequence) : null

          if (!card || !spot) continue
          marks.add(card)
          mark(card, item.controller, true)
        }
        return

      case 'card_target':
      case 'cancel_target': {
        const card = cardAt(event.target)

        if (!card || !spotOf(event.target.location, event.target.sequence)) return
        if (event.type === 'card_target') {
          lasting.add(card)
          marks.add(card)
        } else {
          lasting.delete(card)
          marks.delete(card)
        }
        return mark(card, event.target.controller, event.type === 'card_target')
      }

      case 'attack': {
        const attacker = cardAt(event.card)
        const target = event.target ? cardAt(event.target) : null

        cause(null)
        if (!attacker) return note('attack: nothing there')
        return emit(event.card.controller, { type: 'attack', id: matId(attacker, event.card.controller), ...(target && event.target ? { target: matId(target, event.target.controller) } : {}) })
      }

      case 'equip': {
        const card = cardAt(event.card)
        const target = cardAt(event.target)

        if (!card || !target) return note('equip: nothing there')
        overlay = { ...overlay, equips: [...overlay.equips.filter((item) => item.card.id !== matId(card, event.card.controller)), { card: ref(card, event.card.controller), target: ref(target, event.target.controller) }] }
        return
      }

      case 'damage':
      case 'pay_lpcost':
      case 'recover':
      case 'lpupdate': {
        const lp: [number, number] = [...overlay.lp]
        const player = event.player as Seat

        lp[player] = event.type === 'lpupdate' ? event.lp : event.type === 'recover' ? lp[player] + event.amount : Math.max(0, lp[player] - event.amount)
        overlay = { ...overlay, lp }
        return
      }

      case 'field_disabled':
        overlay = { ...overlay, disabled: event.field_mask }
        return

      case 'remove_cards':
        for (const item of event.cards) {
          const card = take(item, 0)

          if (card && card.id.startsWith('token-') && spotOf(item.location, item.sequence)) emit(item.controller, { type: 'move', id: matId(card, item.controller), to: 'gy' })
          else note('remove_cards: a card leaves the duel')
        }
        return

      // Sin jugada en la mesa (la lista blanca del reporte): `swap` (dos monstruos cambian de dueño a la vez), `shuffle_set_card`
      // (barajar cartas colocadas entre zonas), `swap_grave_deck` y `reverse_deck`. Quedan en `unmapped`.
      // Dos cartas del campo intercambian sus lugares (`Duel.SwapSequence`, o de controlador): la copia del núcleo las sigue; la mesa no
      // tiene una jugada para intercambiar dos casillas ocupadas (lista blanca).
      case 'swap': {
        const a = locate(event.card1, 0)
        const b = locate(event.card2, 0)

        if (a && b && !isMaterial(event.card1) && !isMaterial(event.card2)) [a.list[a.index], b.list[b.index]] = [b.list[b.index] ?? null, a.list[a.index] ?? null]
        return note('unsupported: swap')
      }
      case 'shuffle_set_card':
      case 'swap_grave_deck':
      case 'reverse_deck':
        return note(`unsupported: ${event.type}`)

      case 'spsummoning':
        return summon('special', event.code)
      case 'summoned':
      case 'spsummoned':
      case 'flipsummoned':
        summoning = false
        return

      default:
        if (!QUIET.has(event.type)) note(`unhandled: ${event.type}`)
    }
  }

  function stats(cards: Extract<AutoEvent, { t: 'stats' }>['cards']) {
    const next: AutoOverlay['stats'] = { mine: {}, theirs: {} }

    for (const stat of cards) {
      const card = cardAt(stat, stat.code)

      if (card) next[stat.controller === seat ? 'mine' : 'theirs'][matId(card, stat.controller)] = { attack: stat.attack, defense: stat.defense, level: stat.level }
    }
    // Un equipo dura mientras las dos cartas sigan en el campo.
    const equips = overlay.equips.filter((item) => item.card.id in next[item.card.side] && item.target.id in next[item.target.side])

    // Los mismos números (casi siempre: el núcleo los manda tras cada tanda) dejan el overlay como estaba, así la sesión no avisa por nada.
    if (equips.length < overlay.equips.length || JSON.stringify(next) !== JSON.stringify(overlay.stats)) overlay = { ...overlay, stats: next, equips }
  }

  return {
    initial,
    get mine() {
      return mine
    },
    get theirs() {
      return theirs
    },
    get overlay() {
      return overlay
    },
    apply(event) {
      out = { mine: [], theirs: [], overlay, unmapped: [], chain: [] }
      fromDeck = [null, null]
      openedNow = new Set()

      if (event.t === 'events' && event.seat === seat) event.events.forEach((item, i) => handle(item, event.events.slice(i + 1)))
      else if (event.t === 'stats' && event.seat === seat) stats(event.cards)
      else if (event.t === 'end') overlay = { ...overlay, end: { winner: event.winner, reason: event.reason } }
      out.overlay = overlay

      return out
    },
    idAt(place) {
      const card = cardAt(place)

      return card ? matId(card, place.controller) : null
    },
    locationOf(target) {
      const card = find(target)

      return card ? where(card) : null
    },
    codeOf(target) {
      const card = find(target)

      return card && !card.unsure ? card.code : 0
    },
  }

  /** La carta de una mesa: `f.` + id es una del otro lado que controla el dueño de esa mesa. */
  function find(target: CardRef): Card | null {
    const foreign = target.id.startsWith('f.')
    const bare = foreign ? target.id.slice(2) : target.id
    const owner = (target.side === 'mine') !== foreign ? seat : rival
    const all = [places[0], places[1]].flatMap((side) => Object.values(side) as Slots[])

    for (const list of [...all, ...materials.values()]) {
      const card = list.find((item) => item?.id === bare && item.owner === owner)

      if (card) return card
    }

    return null
  }
}

/** En qué parte de la mesa está una carta (para saber si un material sigue en el campo). */
function locateIn(state: MatState, id: string): MatSpot | MatPile | 'material' | null {
  for (const pile of ['deck', 'extra', 'hand', 'gy', 'banished'] as const) if (state[pile].includes(id)) return pile
  for (const zone of ['mz', 'emz', 'st'] as const) {
    for (const placed of state[zone]) {
      if (placed?.id === id) return zone
      if (placed?.materials.includes(id)) return 'material'
    }
  }

  return state.field?.id === id ? 'field' : state.field?.materials.includes(id) ? 'material' : null
}

function placedIn(state: MatState, id: string) {
  return [...state.mz, ...state.emz, ...state.st, state.field].find((placed) => placed?.id === id) ?? null
}
