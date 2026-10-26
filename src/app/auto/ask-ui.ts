import { t } from '../../i18n'
import { PHASES, type MatPhase, type MatPile, type MatPos, type MatSpot, type MatState, type MatTarget } from '../practice-mat'
import { effectParts, effectSentences } from '../card-text'
import { spotOf, type Adapter, type CardRef, type Side, type TriggerCause } from './adapter'
import { passivePolicy } from './policies'
import { LOCATION as L, POSITION as P, parseAnswer, type AskOf, type AskType, type CoreAnswer, type CoreAsk, type Seat } from './protocol'

/**
 * Duelos automáticos · las preguntas del núcleo en la mesa de siempre (§2–§4 del diseño de F2b). Puro: sin React, sin DOM y sin el
 * paquete del núcleo. `openAsk` traduce una pregunta (`CoreAsk`) a lo que la pantalla muestra (`askView`): los ítems legales de cada carta,
 * las fases, las casillas que se encienden, las cartas que se eligen con su cuenta, el sí o no, las opciones y el orden; `step` lleva cada
 * toque a la respuesta (siempre por `parseAnswer`) cuando la pregunta queda completa. Un toque que la pregunta no admite no hace nada. Lo que
 * no tiene pantalla todavía, lo que tiene una sola respuesta y lo que decide un ajuste se contesta solo (`view.auto`).
 * Las palabras son las de la mesa (`practice.menu.*`); lo que pide un texto nuevo va como dato y lo compone la pantalla. Las validaciones son
 * las del núcleo (`playerop.cpp`): lo que se ofrece es lo que el núcleo acepta.
 */

/** Lo que se consulta del adaptador: la carta de un lugar, su código y las dos mesas (posiciones y pilas). `Adapter` lo cumple tal cual. */
export interface AskQueries extends Pick<Adapter, 'idAt' | 'codeOf'> {
  readonly mine: MatState
  readonly theirs: { readonly state: MatState }
}

export interface AskContext {
  queries: AskQueries
  /** «Respuestas»: preguntar sólo si algo responde de verdad a este momento (`spe_count`), o nunca. «Casilla»: preguntar, o la primera libre. */
  prefs: { chainMode: 'ask' | 'never'; placeMode: 'ask' | 'auto' }
  /** La fase de ahora (la del overlay): marca la actual en `phaseItems`. */
  phase?: MatPhase | null
  /** La máscara de tipo del `.cdb` (como `AdapterOptions.typeOf`): una Mágica o Trampa de la mano dice «Activar». */
  typeOf?: (code: number) => number
  /** El rótulo de un efecto: el `strN` de la carta que nombra el `desc` (`splitDesc`), o null si no tiene (un texto del sistema, una carta sin ese texto). */
  effectLabel?: (code: number, description: string) => string | null
  /** La carta a anunciar (el filtro del núcleo contra un catálogo). Sin él, `announce_card` no tiene respuesta: `auto.answer` es null. */
  announceCard?: (ask: AskOf<'announce_card'>) => number
  /** La casilla donde se soltó la carta de la jugada elegida: si está libre, contesta una pregunta de una casilla (`select_place`) sin mostrarla. */
  prefer?: ZoneTarget
}

/** La clase de casilla a la que una jugada saca una carta de la mano: una de monstruo o una de Mágicas y Trampas (la de campo y las escalas las distingue la mesa). */
export type Into = 'monster' | 'spell'

/** Una opción de un menú. Elegirla es el gesto `{ kind: 'item', answer }`; con `children` no contesta: abre el segundo paso («¿cuál efecto?»). */
export interface AskItem {
  label: string
  answer?: CoreAnswer
  children?: AskItem[]
  /** Adónde saca la carta (Invocar, Colocar, activar una Mágica o Trampa de la mano, una escala): soltarla en esa clase de casilla la ofrece (`itemsInto`). */
  into?: Into
  /** El efecto que activa: para resaltar su frase en el detalle. */
  effect?: { code: number; description: string }
  /** En las fases: la de ahora, y las que el núcleo no ofrece. */
  current?: boolean
  disabled?: boolean
  /** En las fases: a cuál pasa (sin `answer`, en una parada de `phase-stops.ts`: la mesa sigue contando). */
  to?: MatPhase
}

/** Una carta de la pregunta: dónde está en la mesa (`ref`, o null si sólo se nombra por código) y dónde se toca. */
export interface AskCard {
  ref: CardRef | null
  code: number
  place: 'field' | 'hand' | 'pile' | 'material' | 'none'
  pile?: MatPile
  /** Lo que vale: en un Sacrificio, `release_param`; en una suma, `amount` (dos valores: u16 bajo y alto). */
  value?: number
}

export interface CardPick {
  type: 'select_card' | 'select_unselect_card' | 'select_tribute' | 'select_sum'
  /** En unselect_card, las elegibles y después las ya elegidas (su índice es la respuesta); en una suma, las de `selects` y después las fijas. */
  cards: AskCard[]
  /** Las elegidas, en el orden en que se tocaron (las fijas y las ya elegidas, siempre). */
  chosen: number[]
  /** Las fijas: elegidas y no se sueltan. */
  locked: number[]
  /** Lo que un toque acepta ahora: soltar una elegida o sumar una que todavía deja completar la pregunta. */
  eligible: number[]
  /** Dónde se eligen: todas en la mesa (mi mano y los dos campos), todas en una pila mía (`pile`) o en una lista aparte. */
  surface: 'mat' | 'pile' | 'list'
  pile: MatPile | null
  min: number
  max: number
  /** La cuenta del rótulo: cartas elegidas de `max`; en Sacrificios, lo que valen de `min`; en una suma, los niveles de `amount`. */
  count: { now: number; need: number }
  /** Una suma «al menos» (Ritual) y no exacta. */
  atLeast?: boolean
  /** «Listo» contesta ahora. */
  done: boolean
}

export interface ZoneTarget extends MatTarget {
  side: Side
}

export interface ZonePick {
  count: number
  /** Las casillas libres (relativas a quien elige); la pantalla enciende las mías. */
  targets: ZoneTarget[]
  chosen: ZoneTarget[]
}

export interface AskPromptView {
  /** La carta del efecto (`select_effectyn`); null en un sí o no a secas. */
  card: AskCard | null
  /** Dónde está la carta del efecto: su casilla, su pila o debajo de un Xyz. */
  at?: AskPlace
  /** El núcleo pregunta por un efecto que se disparó (`desc` 221: «On [lugar], Activate Trigger Effect of [carta]?» de EDOPro). */
  trigger?: boolean
  description: string
  yes: CoreAnswer
  no: CoreAnswer
}

export interface AskOptionsView {
  of: 'option' | 'position' | 'number' | 'race' | 'attribute'
  /** Cuántas se eligen: una, o `count` Tipos o Atributos. Con todas elegidas, contesta. */
  count: number
  /** `value`: el índice (opción, número), la posición (1, 2, 4, 8) o el bit (Tipo, Atributo). Sin `label`, la pantalla lo nombra. */
  options: { value: number; label?: string; description?: string }[]
  chosen: number[]
}

export interface AskSortView {
  cards: AskCard[]
  /** Los índices de `cards` en el orden en que se tocaron. */
  order: number[]
  done: boolean
}

export interface AskView {
  askId: number
  type: AskType
  title?: string
  /**
   * Se contesta sola, sin mostrar nada: `none`, una pregunta sin pantalla todavía (con su respuesta legal por defecto; null si no hay
   * ninguna segura: `announce_card` sin catálogo); `forced`, una sola respuesta posible; `setting`, la decide un ajuste; `drop`, la casilla donde se soltó la carta (`prefer`).
   */
  auto: { answer: CoreAnswer | null; why: 'none' | 'forced' | 'setting' | 'drop' } | null
  /** Los ítems de cada carta de mi mesa, por id (las jugadas, el ataque, la cadena). */
  items: ReadonlyMap<string, AskItem[]>
  phaseItems: AskItem[]
  endTurn: CoreAnswer | null
  /** Lo que brilla en celeste (`can` de `app/card-glow.ts`): lo que se puede activar o invocar de forma especial, lo que la pregunta pide elegir u ordenar y la carta del efecto preguntado (lo que sólo se invoca de forma normal, se coloca, cambia de posición o ataca se toca igual, sin brillar). */
  respond: CardRef[]
  zonePick: ZonePick | null
  cardPick: CardPick | null
  prompt: AskPromptView | null
  options: AskOptionsView | null
  sort: AskSortView | null
  /** Cancelar (o «No responder», o «Dejar como está») contesta ahora. */
  cancelable: boolean
  /** Una ventana de tu fase (la Draw, la Standby o la End Phase de tu turno): como en la mesa manual, sin cartel; el botón de fases la pasa. */
  phaseWindow: MatPhase | null
}

export type AskGesture =
  | { kind: 'item'; answer: CoreAnswer }
  /** Tocar una carta de la mesa. */
  | { kind: 'card'; ref: CardRef }
  /** Tocar una carta de una lista (`cards`, también las que no están en la mesa). */
  | { kind: 'pick'; index: number }
  | { kind: 'zone'; side: Side; zone: MatSpot; index: number }
  | { kind: 'option'; value: number }
  | { kind: 'done' }
  | { kind: 'cancel' }

interface Base {
  cards: AskCard[]
  items: Map<string, AskItem[]>
  phaseItems: AskItem[]
  endTurn: CoreAnswer | null
  prompt: AskPromptView | null
  options: AskOptionsView['options']
  targets: (ZoneTarget & { bit: number })[]
  auto: AskView['auto']
  phaseWindow: MatPhase | null
}

export interface AskState {
  readonly askId: number
  readonly ask: CoreAsk
  readonly title?: string
  /** Lo elegido, en orden: índices de `cards`, bits de casillas o valores de opciones. */
  readonly chosen: readonly number[]
  readonly base: Base
}

/** El campo `duel.auto` de `DuelMatLink` (§1.1): lo que la mesa necesita para contestar tocando. Lo arma la pantalla con `askView` y `step`. */
export interface AutoLink {
  /**
   * Las jugadas legales de una carta (como los `MenuItem` de la mesa), o null si no está en la pregunta. Con `drop` (la casilla libre donde se soltó una carta de la mano), sólo las que
   * la sacan a esa clase de casilla (`itemsInto`): elegir una deja la carta en esa casilla (`dropped`) y la casilla, para la pregunta de casillas que sigue (`AskContext.prefer`).
   */
  itemsFor: (id: string, drop?: MatTarget) => AutoMenuItem[] | null
  phaseItems: AutoMenuItem[]
  endTurn: (() => void) | null
  zonePick: { label: string; targets: MatTarget[]; onPick: (zone: MatSpot, index: number) => void } | null
  cardPick: { label: string; eligible: ReadonlySet<string>; chosen: readonly string[]; onToggle: (id: string) => void; done: { label: string; onSelect: () => void } | null; cancel: (() => void) | null } | null
  /** El visor de pilas con sólo las candidatas (una búsqueda en el deck); `many` como `PileMany`. */
  viewer: { pile: MatPile; ids: readonly string[]; many?: { label: (ids: readonly string[]) => string; onPick: (ids: string[], rect: DOMRect) => void; start?: readonly string[] } } | null
  /** Hay una pregunta pendiente para mí: sin ella, tocar una carta sólo la muestra en el detalle. */
  asking: boolean
  /** Escape: cancelar lo que se elige en la mesa (cartas, Sacrificios) o «No responder» en una cadena; null si no se puede. */
  cancel: (() => void) | null
  /** La carta de la mano soltada en una casilla, con su jugada ya elegida: se dibuja ahí mientras el núcleo la cuenta (hasta que sale de la mano o vuelven tus jugadas del turno). */
  dropped: ({ id: string } & MatTarget) | null
  /** Mantener apretado un monstruo del campo (sólo en «Jugar solo», que se deshace): cambiar su posición sin menú, si tus jugadas del turno lo ofrecen; null si no. */
  holdFor: (id: string) => (() => void) | null
  /** Por qué una carta tuya no tiene jugadas ahora, lo que se sabe (`no-plays.ts` y las restricciones del núcleo, con su texto); null repasando o con el duelo terminado. */
  whyNot: ((id: string) => string[]) | null
  /** El atajo a la mesa manual desde el menú de una carta sin jugadas («Jugar solo»); null si no hay. */
  manual: (() => void) | null
}

/** La forma de `MenuItem` (`MatDialogs.tsx`), para que la mesa use los ítems tal cual. */
export interface AutoMenuItem {
  label: string
  onSelect: () => void
  utility?: boolean
  current?: boolean
  disabled?: boolean
  lead?: string
  hint?: string
  onPreview?: (active: boolean) => void
  children?: AutoMenuItem[]
  /** Con `children`: el submenú ancho y a la izquierda (la lista de efectos). */
  wide?: boolean
  divider?: boolean
}

type Loc = { code: number; controller: Seat; location: number; sequence: number; position?: number; overlay_sequence?: number }
type Active = Loc & { description: string }

const SPELL_TRAP = 0x2 | 0x4
/** La activación de un Monstruo de Péndulo como escala (`proc_pendulum.lua`). */
const PENDULUM_SCALE = '1160'
/** Los textos del sistema (`strings.conf` no viaja) que más usan las opciones, con las palabras de la mesa: agregar a la mano o mandar al cementerio (`aux.ToHandOrElse`). */
const SYSTEM_OPTIONS = { '573': 'practice.menu.toHand', '574': 'practice.menu.toGy' } as const
const PILE_OF: Partial<Record<number, MatPile>> = { [L.DECK]: 'deck', [L.HAND]: 'hand', [L.GRAVE]: 'gy', [L.REMOVED]: 'banished', [L.EXTRA]: 'extra' }
/** El `desc` con que el núcleo pregunta por un efecto que se disparó (texto 221 del sistema). Medido con el núcleo real: no dice si quedan otros por preguntar. */
const TRIGGER_DESC = '221'
/**
 * Sin pantalla todavía (§3 del diseño): quitar contadores y anunciar una carta (ronda 4), las casillas del rival (`select_disfield`: la mesa no
 * las enciende), ordenar la cadena y piedra, papel o tijera (en el fuzz no aparecieron).
 */
const NO_UI = new Set<AskType>(['select_counter', 'select_disfield', 'sort_chain', 'announce_card', 'rock_paper_scissors'])
const POSITIONS = [
  [P.FACEUP_ATTACK, 'practice.menu.attack'],
  [P.FACEDOWN_ATTACK, 'practice.attack.faceDown'],
  [P.FACEUP_DEFENSE, 'practice.menu.defense'],
  [P.FACEDOWN_DEFENSE, 'practice.menu.banishFaceDown'],
] as const
const NODES = 20_000

const isMaterial = (card: Loc) => card.overlay_sequence !== undefined || (card.location & L.OVERLAY) !== 0
const sameRef = (a: CardRef | null, b: CardRef) => a !== null && a.side === b.side && a.id === b.id
const answerKey = (answer: CoreAnswer) => JSON.stringify(parseAnswer(answer))

/**
 * El id de la carta de cada lugar, el mismo para el mismo lugar y distinto entre lugares. En una bolsa (el deck barajado, la mano del
 * rival) `idAt` da una cualquiera: si no tiene el código que dice la pregunta (o ya la tiene otro lugar), va otra de esa pila con ese código.
 */
function resolver(queries: AskQueries, seat: Seat) {
  const byPlace = new Map<string, CardRef | null>()
  const used = new Set<string>()

  return (card: Loc): CardRef | null => {
    const key = `${card.controller}/${card.location}/${card.sequence}/${card.overlay_sequence ?? ''}`

    if (byPlace.has(key)) return byPlace.get(key)!
    const side: Side = card.controller === seat ? 'mine' : 'theirs'
    const fits = (id: string | null | undefined, exact: boolean): id is string => {
      if (!id || used.has(`${side}:${id}`)) return false
      const code = queries.codeOf({ side, id })

      return card.code === 0 || code === card.code || (!exact && code === 0)
    }
    const at = card.location === 0 ? null : queries.idAt({ controller: card.controller, location: card.location, sequence: card.sequence, ...(card.overlay_sequence === undefined ? {} : { overlay_sequence: card.overlay_sequence }) })
    const pile = isMaterial(card) ? undefined : PILE_OF[card.location]
    const list = pile ? (side === 'mine' ? queries.mine : queries.theirs.state)[pile] : []
    const id = fits(at, false) ? at : (list.find((other) => fits(other, true)) ?? list.find((other) => fits(other, false)) ?? null)
    const ref = id ? { side, id } : null

    if (id) used.add(`${side}:${id}`)
    byPlace.set(key, ref)
    return ref
  }
}

function askCard(card: Loc, ref: CardRef | null, value?: number): AskCard {
  const pile = isMaterial(card) ? undefined : PILE_OF[card.location]
  const place = !ref ? 'none' : isMaterial(card) ? 'material' : card.location === L.MZONE || card.location === L.SZONE ? 'field' : card.location === L.HAND ? 'hand' : 'pile'

  return { ref, code: card.code, place, ...(pile ? { pile } : {}), ...(value === undefined ? {} : { value }) }
}

function positionOf(queries: AskQueries, ref: CardRef): MatPos | null {
  const state = ref.side === 'mine' ? queries.mine : queries.theirs.state

  return [...state.mz, ...state.emz, ...state.st, state.field].find((placed) => placed?.id === ref.id)?.pos ?? null
}

/** Todas en la mesa (mi mano o un campo), todas en una misma pila mía, o una lista aparte (varios lugares, materiales, por código, lo del rival). */
function surfaceOf(cards: readonly AskCard[]): { surface: CardPick['surface']; pile: MatPile | null } {
  if (cards.every((card) => card.place === 'field' || (card.place === 'hand' && card.ref!.side === 'mine'))) return { surface: 'mat', pile: null }
  const piles = new Set(cards.map((card) => (card.place === 'pile' && card.ref!.side === 'mine' ? card.pile! : null)))
  const [pile] = piles

  return piles.size === 1 && pile ? { surface: 'pile', pile } : { surface: 'list', pile: null }
}

/**
 * El orden en que se muestran las candidatas de una lista aparte (índices de `cards`: la respuesta sigue siendo la del núcleo). Las que están en un deck, el tuyo o el del rival, van por
 * nombre y en los lugares que ocupaban: el núcleo las manda en el orden del deck y verlo regalaría qué se roba primero (el visor del deck de `PracticeMat` también va por nombre).
 */
export function listOrder(cards: readonly AskCard[], nameOf: (card: AskCard) => string): number[] {
  const order = cards.map((_, index) => index)
  const slots = order.filter((index) => cards[index]!.pile === 'deck')
  const byName = [...slots].sort((a, b) => nameOf(cards[a]!).localeCompare(nameOf(cards[b]!)) || a - b)

  slots.forEach((slot, rank) => {
    order[slot] = byName[rank]!
  })

  return order
}

/** Las casillas libres de una pregunta de casillas (el bit en 0), las que la mesa tiene: byte 0 y 1 las mías, 2 y 3 las del rival. */
function freeZones(mask: number): (ZoneTarget & { bit: number })[] {
  return Array.from({ length: 32 }, (_, bit) => bit).flatMap((bit) => {
    const spot = ((mask >>> bit) & 1) === 0 ? spotOf((bit >> 3) % 2 === 0 ? L.MZONE : L.SZONE, bit & 7) : null

    return spot ? [{ side: bit < 16 ? ('mine' as const) : ('theirs' as const), zone: spot.zone, index: spot.index, bit }] : []
  })
}

const placeOfBit = (player: Seat, bit: number) => ({ player: (bit < 16 ? player : 1 - player) as Seat, location: (bit >> 3) % 2 === 0 ? L.MZONE : L.SZONE, sequence: bit & 7 })

// ── Las sumas (`SelectSum`): cada carta vale su u16 bajo o su u16 alto ───────────────────────────────────────────────────────────────

const lowOf = (amount: number) => amount & 0xffff
const highOf = (amount: number) => amount >>> 16

/** Si las cartas (las fijas y las elegidas) cumplen la suma, como la revisa el núcleo. `picked`: las elegidas sin las fijas. */
function sumOk(ask: AskOf<'select_sum'>, amounts: readonly number[], picked: number): boolean {
  if (ask.select_max !== 0) {
    // «Al menos»: con los valores grandes se llega y, sin el más chico de los chicos, ya no.
    let sum = 0
    let most = 0
    let least = Infinity

    for (const amount of amounts) {
      const [low, high] = [lowOf(amount), highOf(amount)]
      const small = high > 0 && low > high ? high : low

      sum += small
      most += high > low ? high : low
      least = Math.min(least, small)
    }
    return amounts.length > 0 && most >= ask.amount && sum - least < ask.amount
  }
  // Exacta: cada carta con uno de sus valores (los que no son 0), y entre todas, `amount` justo.
  return picked >= ask.min && picked <= ask.max && amounts.reduce((sums, amount) => addSums(ask, sums, amount), new Set([0])).has(ask.amount)
}

/** Las sumas a las que se llega sumando una carta más (con su valor bajo o el alto), sin pasar de `amount`. */
const addSums = (ask: AskOf<'select_sum'>, sums: ReadonlySet<number>, amount: number) =>
  new Set([...sums].flatMap((sum) => [lowOf(amount), highOf(amount)].filter((value) => value > 0).map((value) => sum + value)).filter((sum) => sum <= ask.amount))

/** Si sumando cartas a las elegidas (y a las fijas) se llega a una suma que vale. */
function sumCompletes(ask: AskOf<'select_sum'>, chosen: readonly number[]): boolean {
  const rest = ask.selects.map((_, i) => i).filter((i) => !chosen.includes(i))
  const fixed = [...ask.selects_must.map((card) => card.amount), ...chosen.map((i) => ask.selects[i]!.amount)]

  if (ask.select_max === 0) {
    // Exacta: por cuántas cartas van elegidas, las sumas a las que se llega; las que quedan se suman de a una (de más a menos, para no repetirlas).
    const reach: Set<number>[] = []

    reach[chosen.length] = fixed.reduce((sums, amount) => addSums(ask, sums, amount), new Set([0]))
    for (const i of rest) {
      for (let count = ask.max - 1; count >= chosen.length; count -= 1) {
        if (reach[count]) reach[count + 1] = new Set([...(reach[count + 1] ?? []), ...addSums(ask, reach[count]!, ask.selects[i]!.amount)])
      }
    }
    return reach.some((sums, count) => count >= ask.min && count <= ask.max && sums.has(ask.amount))
  }

  // «Al menos»: búsqueda con poda (pasado el punto en que sobra una, no hay arreglo). ponytail: tope de nodos; si no alcanza, la carta se
  // ofrece igual y «Listo» sólo se enciende con una suma que vale.
  if ([...fixed, ...rest.map((i) => ask.selects[i]!.amount)].reduce((sum, amount) => sum + Math.max(lowOf(amount), highOf(amount)), 0) < ask.amount) return false
  let nodes = 0
  const search = (amounts: number[], from: number): boolean => {
    if (sumOk(ask, amounts, 0)) return true
    if ((nodes += 1) > NODES) return true
    if (!sumAlive(ask, amounts)) return false
    for (let k = from; k < rest.length; k += 1) if (search([...amounts, ask.selects[rest[k]!]!.amount], k + 1)) return true
    return false
  }

  return search(fixed, 0)
}

/** «Al menos»: sumar cartas sólo agranda «la suma sin la más chica», así que una vez que llega a `amount` no hay arreglo. */
function sumAlive(ask: AskOf<'select_sum'>, amounts: readonly number[]): boolean {
  if (amounts.length === 0) return true
  const smalls = amounts.map((amount) => (highOf(amount) > 0 && lowOf(amount) > highOf(amount) ? highOf(amount) : lowOf(amount)))

  return smalls.reduce((sum, value) => sum + value, 0) - Math.min(...smalls) < ask.amount
}

// ── Las jugadas: de las listas de la pregunta a los ítems de cada carta ─────────────────────────────────────────────────────────────

function activateLabel(card: Active, ref: CardRef | null, ctx: AskContext): string {
  const down = card.position !== undefined ? (card.position & P.FACEDOWN) !== 0 : ref !== null && positionOf(ctx.queries, ref) === 'set'

  if (card.location === L.SZONE && down) return t('practice.menu.activate')
  if (card.location === L.HAND && card.description === PENDULUM_SCALE) return t('practice.menu.asScale')
  if (card.location === L.HAND && ((ctx.typeOf?.(card.code) ?? 0) & SPELL_TRAP) !== 0) return t('practice.menu.activate')

  return t('practice.menu.activateEffect')
}

/** Las jugadas que sacan una carta de la mano a la clase de casilla donde se la soltó (`into`); de un «¿cuál efecto?», sólo los que van ahí (si queda uno, sin preguntar). */
export function itemsInto(items: readonly AskItem[], into: Into): AskItem[] {
  return items.flatMap((item) => {
    const children = item.children?.filter((child) => child.into === into)

    if (!children) return item.into === into ? [item] : []
    return children.length > 1 ? [{ ...item, children }] : children
  })
}

/**
 * Los ítems de cada carta de mi mesa. «Activar efecto» de una carta con varias entradas pregunta cuál (`children`): cada uno con su texto o, sin él, con la palabra de su
 * activación. Sin número: el orden de la pregunta no es el del texto de la carta (el núcleo saca lo que ahora no se puede).
 */
function itemsOf(ask: AskOf<'select_idlecmd' | 'select_battlecmd' | 'select_chain'>, resolve: (card: Loc) => CardRef | null, ctx: AskContext): Map<string, AskItem[]> {
  const items = new Map<string, AskItem[]>()
  const add = (ref: CardRef | null, item: AskItem) => {
    if (ref?.side === 'mine') items.set(ref.id, [...(items.get(ref.id) ?? []), item])
  }
  const list = <C extends Loc>(cards: readonly C[], label: (card: C, ref: CardRef | null) => string, answer: (index: number) => CoreAnswer, into?: Into) =>
    cards.forEach((card, index) => {
      const ref = resolve(card)

      add(ref, { label: label(card, ref), answer: answer(index), ...(into ? { into } : {}) })
    })
  // Activar una Mágica o una Trampa de la mano (o un Péndulo como escala) la pone en una casilla de Mágicas y Trampas; un efecto de un monstruo de la mano, no.
  const intoOf = (card: Active): { into?: Into } => (card.location === L.HAND && (card.description === PENDULUM_SCALE || ((ctx.typeOf?.(card.code) ?? 0) & SPELL_TRAP) !== 0) ? { into: 'spell' } : {})
  const activations = (cards: readonly Active[], answer: (index: number) => CoreAnswer) => {
    const byCard = new Map<string, number[]>()

    cards.forEach((card, index) => {
      const ref = resolve(card)
      const seen = ref?.side === 'mine' ? (byCard.get(ref.id) ?? []) : null

      // El mismo efecto dos veces (un disparo por cada evento: dos Juego Rápido encadenadas) es una sola fila, la primera: si se puede de nuevo, la próxima pregunta lo vuelve a traer.
      // Sin texto propio (`'0'`) no se distingue de otro efecto de la carta: quedan los dos.
      if (seen && (card.description === '0' || !seen.some((other) => cards[other]!.description === card.description))) byCard.set(ref!.id, [...seen, index])
    })
    for (const [id, indices] of byCard) {
      const ref: CardRef = { side: 'mine', id }
      const effect = (index: number) => ({ code: cards[index]!.code, description: cards[index]!.description })
      const label = activateLabel(cards[indices[0]!]!, ref, ctx)

      add(
        ref,
        indices.length === 1
          ? { label, answer: answer(indices[0]!), effect: effect(indices[0]!), ...intoOf(cards[indices[0]!]!) }
          : {
              label,
              children: indices.map((index) => ({
                label: ctx.effectLabel?.(cards[index]!.code, cards[index]!.description) || activateLabel(cards[index]!, ref, ctx),
                answer: answer(index),
                effect: effect(index),
                ...intoOf(cards[index]!),
              })),
            },
      )
    }
  }

  switch (ask.type) {
    case 'select_idlecmd': {
      const idle = (action: number) => (index: number): CoreAnswer => ({ type: 'select_idlecmd', action, index })

      // En el orden de la mesa manual (`listCardActions`): Normal, Colocar, Especial, activar y, de una Mágica o Trampa, Colocar después de Activar.
      list(ask.summons, () => t('practice.menu.normalSummon'), idle(0), 'monster')
      list(ask.monster_sets, () => t('practice.menu.set'), idle(3), 'monster')
      // La Invocación de Péndulo es la Especial de la escala (`EFFECT_SPSUMMON_PROC_G` en su zona).
      list(ask.special_summons, (card) => t(card.location === L.SZONE ? 'practice.menu.pendulumSummon' : 'practice.menu.specialSummon'), idle(1), 'monster')
      activations(ask.activates, idle(5))
      list(ask.spell_sets, () => t('practice.menu.set'), idle(4), 'spell')
      list(
        ask.pos_changes,
        (_, ref) => {
          const pos = ref ? positionOf(ctx.queries, ref) : null

          return t(pos === 'set' ? 'practice.menu.flipSummon' : pos === 'def' ? 'practice.menu.toAttack' : 'practice.menu.toDefense')
        },
        idle(2),
      )
      break
    }
    case 'select_battlecmd': {
      // Con monstruos del rival, a cuál (o si directo) lo pregunta el núcleo después; sin ninguno y si puede, es un ataque directo.
      const rivalMonsters = Array.from({ length: 7 }, (_, sequence) => ctx.queries.idAt({ controller: (1 - ask.player) as Seat, location: L.MZONE, sequence })).some((id) => id !== null)

      list(ask.attacks, (card) => t(card.can_direct && !rivalMonsters ? 'practice.menu.attackDirectly' : 'practice.menu.battleAttack'), (index) => ({ type: 'select_battlecmd', action: 1, index }))
      activations(ask.chains, (index) => ({ type: 'select_battlecmd', action: 0, index }))
      break
    }
    case 'select_chain':
      activations(ask.selects, (index) => ({ type: 'select_chain', index }))
      break
  }

  return items
}

/** Las ventanas de tus fases por el `hint_timing` de una cadena (`TIMING_DRAW_PHASE`, `TIMING_STANDBY_PHASE`, `TIMING_END_PHASE`): en el turno del rival vienen en `hint_timing_other`. */
const PHASE_WINDOWS = [
  [0x1, 'draw'],
  [0x2, 'standby'],
  [0x20, 'end'],
] as const

/** Las seis fases, como el botón de fase de la mesa: las ofrecidas pasan a ella (con su respuesta, o `null` si no contesta nada); la de ahora se marca; las demás, apagadas. */
function phaseItemsOf(offered: Partial<Record<MatPhase, CoreAnswer | null>>, phase: MatPhase | null | undefined): AskItem[] {
  return PHASES.map(({ id, name }) => {
    const answer = offered[id]

    if (id === phase) return { label: name, current: true }

    return answer === undefined ? { label: name, disabled: true } : { label: name, to: id, ...(answer ? { answer } : {}) }
  })
}

/** Las fases en una parada de tu DP o tu SP (`phase-stops.ts`): desde la DP, la SP o la M1; desde la SP, la M1 (el núcleo pide pasar por la M1 antes de la batalla). */
export const stopPhaseItems = (phase: MatPhase): AskItem[] => phaseItemsOf(phase === 'draw' ? { standby: null, main1: null } : { main1: null }, phase)

// ── Abrir una pregunta ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** El estado de una pregunta recién llegada (lo que depende de la mesa se resuelve acá, una vez). Si `askView(state).auto`, se contesta sola. */
/** Los nombres de las cartas para una línea del registro («A, B ×2»): los de la misma carta van juntos, con cuántas son. */
export function namesList(names: readonly string[]): string {
  const counts = new Map<string, number>()

  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1)

  return [...counts].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name)).join(', ')
}

export type AskPlace = MatSpot | MatPile | 'material'

/** «¿Activás el efecto…?» con su contexto: qué pasó justo antes, dónde está la carta y qué hace el efecto. Lo que no se sabe no se dice. */
export interface EffectAskText {
  /** «Efecto que se dispara», cuando el núcleo pregunta por uno (`trigger`). */
  kicker: string | null
  text: string
  /** El lugar, corto, para la pestaña sobre la carta («Campo», «Cementerio»). */
  place: string | null
  /** La frase del efecto, tal cual la trae la carta: cuándo y qué hace (`triggerPhrase`). */
  effect: { when: string; what: string } | null
}

const SUMMON_WORD = { normal: 'Normal', special: 'Special', flip: 'Flip' } as const

/**
 * Cuál de las frases del texto de la carta es el efecto que se disparó (el núcleo no lo dice: pregunta por la carta). Las candidatas son los efectos opcionales que se disparan
 * («If …: You can …», «During …: You can …»). Una sola: ésa. Si hay varias, sólo la única que nombra lo que pasó: «this card is … Summoned» si la carta es la que se acaba de
 * invocar así, o la fase que empezó. Si no, null: mejor no decir qué hace que decir otro efecto.
 */
export function triggerPhrase(text: string, code: number, cause: TriggerCause | null): { when: string; what: string } | null {
  const optional = effectSentences(text)
    .filter((sentence) => sentence.opening === 'trigger' || sentence.opening === 'during')
    .map(effectParts)
    .filter((parts) => /^You can\b/.test(parts.what))

  if (optional.length === 1) return optional[0]!
  if (!cause) return null
  const word = cause.kind === 'phase' ? PHASES.find((phase) => phase.id === cause.phase)!.name : cause.codes.includes(code) ? SUMMON_WORD[cause.kind] : null
  const named = word === null ? [] : optional.filter((parts) => (cause.kind === 'phase' ? parts.when.includes(word) : new RegExp(`\\bthis card is (?:\\w+ or )*(?:${word} )?(?:or \\w+ )*Summoned\\b`).test(parts.when)))

  return named.length === 1 ? named[0]! : null
}

/** Lo que dice la pregunta de un efecto (`select_effectyn`): `nameOf` nombra una carta por código y `cardText` es el texto de la carta del efecto (en inglés, como el catálogo). */
export function effectAskText(prompt: AskPromptView & { card: AskCard }, cause: TriggerCause | null, nameOf: (code: number) => string, cardText: string | null): EffectAskText {
  const { code } = prompt.card
  const card = nameOf(code)
  const at = prompt.at
  const place = at === undefined || at === 'material' ? null : at === 'mz' || at === 'emz' || at === 'st' || at === 'field' ? t('practice.mat.field') : t(`practice.place.${at}`)
  const where = at === undefined ? null : t(`auto.ask.at.${at}`)
  const text =
    where === null
      ? t('auto.ask.effect', { card })
      : cause?.kind === 'phase'
        ? t('auto.ask.during', { phase: PHASES.find((phase) => phase.id === cause.phase)!.name, card, place: where })
        : cause && cause.codes.length === 1 && cause.codes[0] === code
          ? t('auto.ask.afterOwn', { event: t(`auto.ask.event.${cause.kind}`), card, place: where })
          : cause
            ? t('auto.ask.after', { event: t(`auto.ask.event.${cause.kind}`), cards: namesList(cause.codes.map(nameOf)), card, place: where })
            : t('auto.ask.effectAt', { card, place: where })

  return { kicker: prompt.trigger ? t('auto.ask.kicker') : null, text, place, effect: prompt.trigger && cardText ? triggerPhrase(cardText, code, cause) : null }
}

export function openAsk(input: { askId: number; ask: CoreAsk; title?: string }, ctx: AskContext): AskState {
  const { ask } = input
  const resolve = resolver(ctx.queries, ask.player)
  const base: Base = { cards: [], items: new Map(), phaseItems: phaseItemsOf({}, ctx.phase), endTurn: null, prompt: null, options: [], targets: [], auto: null, phaseWindow: null }
  const cardsOf = <C extends Loc>(list: readonly C[], value?: (card: C) => number) => list.map((card) => askCard(card, resolve(card), value?.(card)))
  const auto = (answer: CoreAnswer | null, why: NonNullable<AskView['auto']>['why']) => void (base.auto = { answer: answer && parseAnswer(answer), why })

  // Sin pantalla todavía: lo que contestaría el rival pasivo (siempre legal; anunciar una carta, sólo con catálogo).
  if (NO_UI.has(ask.type)) auto(ask.type === 'announce_card' && !ctx.announceCard ? null : passivePolicy(ctx.announceCard && ((card) => ctx.announceCard!(card)))(ask), 'none')

  switch (ask.type) {
    case 'select_idlecmd':
    case 'select_battlecmd': {
      const idle = ask.type === 'select_idlecmd'
      const answer = (action: number): CoreAnswer => ({ type: ask.type, action, index: null }) as CoreAnswer
      const offered: Partial<Record<MatPhase, CoreAnswer>> = idle
        ? { ...(ask.to_bp ? { battle: answer(6) } : {}), ...(ask.to_ep ? { end: answer(7) } : {}) }
        : { ...(ask.to_m2 ? { main2: answer(2) } : {}), ...(ask.to_ep ? { end: answer(3) } : {}) }

      base.items = itemsOf(ask, resolve, ctx)
      base.phaseItems = phaseItemsOf(offered, ctx.phase)
      base.endTurn = offered.end ?? null
      break
    }
    case 'select_chain': {
      base.items = itemsOf(ask, resolve, ctx)
      // «Preguntar» pregunta como EDOPro sin «Always chain»: sólo si algo responde de verdad a este momento (`spe_count` del núcleo: los disparos opcionales y los
      // efectos rápidos con el timing de ahora). Una carta que sólo «podría» activarse (una Trampa colocada, en cada paso del propio turno) no pregunta. Forzada, siempre.
      // Salvo en tus fases (la Draw, la Standby y la End Phase de tu turno: `hint_timing`) con algo que activar: ahí se juega como en la mesa manual (brilla lo que se
      // activa y el botón de fases pasa). El post-robo (`0x210000`) no: serían dos paradas por fase. Con «Nunca», tampoco.
      const own = !ask.forced && ask.selects.length > 0 ? (PHASE_WINDOWS.find(([bit]) => (ask.hint_timing & bit) !== 0)?.[1] ?? null) : null
      const quiet = ctx.prefs.chainMode === 'never' || (ask.spe_count === 0 && !ask.forced && !own)

      if (quiet || ask.selects.length === 0) auto({ type: ask.type, index: ask.forced && ask.selects.length > 0 ? 0 : null }, ask.selects.length === 0 ? 'forced' : 'setting')
      else if (own) {
        const pass: CoreAnswer = { type: ask.type, index: null }

        // Pasar es ir a la fase que sigue (de la DP también a la M1: la SP se pasa sola) o, en la End Phase, terminar el turno.
        base.phaseWindow = own
        base.phaseItems = phaseItemsOf(own === 'draw' ? { standby: pass, main1: pass } : own === 'standby' ? { main1: pass } : { draw: pass }, own)
        base.endTurn = own === 'end' ? pass : null
      }
      break
    }
    case 'select_effectyn': {
      const at = isMaterial(ask) ? 'material' : (spotOf(ask.location, ask.sequence)?.zone ?? PILE_OF[ask.location])

      base.prompt = { card: askCard(ask, resolve(ask)), ...(at ? { at } : {}), ...(ask.description === TRIGGER_DESC ? { trigger: true } : {}), description: ask.description, yes: { type: ask.type, yes: true }, no: { type: ask.type, yes: false } }
      break
    }
    case 'select_yesno':
      base.prompt = { card: null, description: ask.description, yes: { type: ask.type, yes: true }, no: { type: ask.type, yes: false } }
      break
    case 'select_option':
      base.options = ask.options.map((description, value) => {
        const system = SYSTEM_OPTIONS[description as keyof typeof SYSTEM_OPTIONS]
        const label = ctx.effectLabel?.(0, description) || (system ? t(system) : null)

        return { value, description, ...(label ? { label } : {}) }
      })
      break
    case 'announce_number':
      base.options = ask.options.map((number, value) => ({ value, label: String(Number(number)) }))
      break
    case 'select_position':
      base.options = POSITIONS.filter(([position]) => (ask.positions & position) !== 0).map(([value, key]) => ({ value, label: t(key) }))
      if (base.options.length === 1) auto({ type: ask.type, position: base.options[0]!.value }, 'forced')
      break
    case 'announce_race':
    case 'announce_attrib': {
      const available = BigInt(ask.available)

      base.options = Array.from({ length: 64 }, (_, bit) => bit).filter((bit) => ((available >> BigInt(bit)) & 1n) !== 0n).map((value) => ({ value }))
      break
    }
    case 'select_card':
      base.cards = cardsOf(ask.selects)
      break
    case 'select_tribute':
      base.cards = cardsOf(ask.selects, (card) => card.release_param)
      break
    case 'select_sum':
      base.cards = [...cardsOf(ask.selects, (card) => card.amount), ...cardsOf(ask.selects_must, (card) => card.amount)]
      break
    case 'select_unselect_card':
      base.cards = cardsOf([...ask.select_cards, ...ask.unselect_cards])
      break
    case 'sort_card':
      base.cards = cardsOf(ask.cards)
      break
    case 'select_place': {
      // Por bit: las mías primero.
      base.targets = freeZones(ask.field_mask)
      // La casilla donde se soltó la carta, si se pide una sola y está libre: es de las que dice la máscara, así que siempre vale.
      const wanted = ctx.prefer
      const dropped = wanted && ask.count === 1 ? base.targets.find((target) => target.side === wanted.side && target.zone === wanted.zone && target.index === wanted.index) : undefined
      const first: CoreAnswer = { type: ask.type, places: (dropped ? [dropped] : base.targets.slice(0, ask.count)).map((target) => placeOfBit(ask.player, target.bit)) }

      // La soltada, una sola manera (tantas libres como casillas pide), un ajuste, o sólo casillas del rival (la mesa todavía no las enciende).
      if (dropped) auto(first, 'drop')
      else if (base.targets.length <= ask.count) auto(first, 'forced')
      else if (ctx.prefs.placeMode === 'auto') auto(first, 'setting')
      else if (!base.targets.some((target) => target.side === 'mine')) auto(first, 'none')
      break
    }
  }

  return { askId: input.askId, ask, ...(input.title === undefined ? {} : { title: input.title }), chosen: [], base }
}

// ── Lo que se muestra ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Lo que se ve de la pregunta con lo elegido hasta ahora. */
export function askView(state: AskState): AskView {
  const { ask, base, chosen } = state
  const view: AskView = {
    askId: state.askId,
    type: ask.type,
    ...(state.title === undefined ? {} : { title: state.title }),
    auto: base.auto,
    items: base.items,
    phaseItems: base.phaseItems,
    endTurn: base.endTurn,
    respond: [],
    zonePick: null,
    cardPick: null,
    prompt: base.prompt,
    options: null,
    sort: null,
    cancelable: false,
    phaseWindow: base.phaseWindow,
  }

  if (base.auto) return view

  switch (ask.type) {
    case 'select_idlecmd':
    case 'select_battlecmd':
    case 'select_chain':
      // Brilla lo que se activa (sólo las activaciones llevan `effect` o `children`) y lo que se invoca de forma especial (`action` 1, también la de Péndulo, desde la mano, el campo, las pilas
      // o el Extra); lo que se invoca de forma normal, se coloca, cambia de posición o ataca, no.
      view.respond = [...base.items].flatMap(([id, items]) => (items.some((item) => item.effect || item.children || (item.answer?.type === 'select_idlecmd' && item.answer.action === 1)) ? [{ side: 'mine' as const, id }] : []))
      view.cancelable = ask.type === 'select_chain' && !ask.forced
      break
    case 'select_effectyn':
      view.respond = base.prompt?.card?.ref ? [base.prompt.card.ref] : []
      break
    case 'select_option':
    case 'select_position':
    case 'announce_number':
    case 'announce_race':
    case 'announce_attrib':
      view.options = {
        of: ({ select_option: 'option', select_position: 'position', announce_number: 'number', announce_race: 'race', announce_attrib: 'attribute' } as const)[ask.type],
        count: ask.type === 'announce_race' || ask.type === 'announce_attrib' ? ask.count : 1,
        options: base.options,
        chosen: [...chosen],
      }
      break
    case 'select_place':
      view.zonePick = { count: ask.count, targets: base.targets.map(({ side, zone, index }) => ({ side, zone, index })), chosen: base.targets.filter((target) => chosen.includes(target.bit)).map(({ side, zone, index }) => ({ side, zone, index })) }
      break
    case 'sort_card':
      view.sort = { cards: base.cards, order: [...chosen], done: chosen.length === base.cards.length }
      view.respond = base.cards.flatMap((card) => (card.ref ? [card.ref] : []))
      view.cancelable = true
      break
    case 'select_card':
    case 'select_tribute':
    case 'select_sum':
    case 'select_unselect_card':
      view.cardPick = cardPickOf(ask, base.cards, chosen)
      view.respond = view.cardPick.eligible.flatMap((i) => (base.cards[i]!.ref ? [base.cards[i]!.ref!] : []))
      view.cancelable = ask.type === 'select_unselect_card' ? ask.can_cancel && !ask.can_finish : ask.type !== 'select_sum' && ask.can_cancel
      break
  }

  return view
}

function cardPickOf(ask: AskOf<'select_card' | 'select_tribute' | 'select_sum' | 'select_unselect_card'>, cards: AskCard[], chosen: readonly number[]): CardPick {
  const all = cards.map((_, i) => i)
  const open = all.filter((i) => !chosen.includes(i))
  const pick = (picked: number[], locked: number[], eligible: number[], count: CardPick['count'], done: boolean, extra: Partial<CardPick> = {}): CardPick => ({
    type: ask.type,
    cards,
    chosen: [...locked, ...picked],
    locked,
    eligible: [...picked, ...eligible.filter((i) => !picked.includes(i))],
    ...surfaceOf(cards),
    min: ask.min,
    max: ask.max,
    count,
    done,
    ...extra,
  })

  switch (ask.type) {
    case 'select_card': {
      const top = Math.min(ask.max, cards.length)

      return pick([...chosen], [], chosen.length < top ? open : [], { now: chosen.length, need: ask.max }, chosen.length >= ask.min && chosen.length <= ask.max)
    }
    case 'select_tribute': {
      const worth = (list: readonly number[]) => list.reduce((sum, i) => sum + ask.selects[i]!.release_param, 0)
      // Se puede sumar una si, con las que más valen de las que quedan, todavía se llega a `min` sin pasar de `max` cartas.
      const reaches = (list: number[]) =>
        list.length <= ask.max &&
        worth(list) +
          all
            .filter((i) => !list.includes(i))
            .map((i) => ask.selects[i]!.release_param)
            .sort((a, b) => b - a)
            .slice(0, ask.max - list.length)
            .reduce((sum, value) => sum + value, 0) >=
          ask.min

      return pick([...chosen], [], open.filter((i) => reaches([...chosen, i])), { now: worth(chosen), need: ask.min }, worth(chosen) >= ask.min && chosen.length <= ask.max)
    }
    case 'select_sum': {
      const must = ask.selects_must.map((_, i) => ask.selects.length + i)
      const amounts = [...ask.selects_must, ...chosen.map((i) => ask.selects[i]!)].map((card) => card.amount)

      return pick(
        [...chosen],
        must,
        open.filter((i) => i < ask.selects.length && sumCompletes(ask, [...chosen, i])),
        { now: amounts.reduce((sum, amount) => sum + (lowOf(amount) || highOf(amount)), 0), need: ask.amount },
        sumOk(ask, amounts, chosen.length),
        { atLeast: ask.select_max !== 0 },
      )
    }
    case 'select_unselect_card': {
      const already = ask.unselect_cards.map((_, i) => ask.select_cards.length + i)

      return pick(already, [], all, { now: already.length, need: ask.max }, ask.can_finish)
    }
  }
}

// ── Los toques ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Un toque: acumula lo elegido o contesta (con la pregunta completa). Lo que la pregunta no admite devuelve el mismo estado, sin respuesta. */
export function step(state: AskState, gesture: AskGesture): { state: AskState; answer?: CoreAnswer } {
  const view = askView(state)
  const { ask } = state
  const same = { state }
  const answer = (value: CoreAnswer) => {
    const parsed = parseAnswer(value)

    return parsed ? { state, answer: parsed } : same
  }
  const next = (chosen: number[]) => ({ state: { ...state, chosen } })

  if (view.auto) return same

  switch (gesture.kind) {
    case 'item': {
      const offered = [...[...view.items.values()].flat().flatMap((item) => [item, ...(item.children ?? [])]), ...view.phaseItems].flatMap((item) => (item.answer ? [item.answer] : []))

      if (view.endTurn) offered.push(view.endTurn)
      if (view.prompt) offered.push(view.prompt.yes, view.prompt.no)
      const key = answerKey(gesture.answer)

      return offered.some((item) => answerKey(item) === key) ? answer(gesture.answer) : same
    }

    case 'cancel':
      if (!view.cancelable) return same
      if (ask.type === 'select_card' || ask.type === 'select_tribute') return answer({ type: ask.type, indices: null })
      if (ask.type === 'sort_card') return answer({ type: ask.type, order: null })
      if (ask.type === 'select_chain' || ask.type === 'select_unselect_card') return answer({ type: ask.type, index: null })
      return same

    case 'done':
      if (view.sort?.done) return answer({ type: 'sort_card', order: view.sort.cards.map((_, i) => view.sort!.order.indexOf(i)) })
      if (!view.cardPick?.done) return same
      return answer(cardAnswer(ask, view.cardPick))

    case 'card': {
      const index = (view.cardPick?.cards ?? view.sort?.cards ?? []).findIndex((card) => sameRef(card.ref, gesture.ref))

      return index < 0 ? same : step(state, { kind: 'pick', index })
    }

    case 'pick': {
      const { index } = gesture

      if (view.sort) {
        if (index < 0 || index >= view.sort.cards.length) return same
        return next(state.chosen.includes(index) ? state.chosen.filter((i) => i !== index) : [...state.chosen, index])
      }
      const pick = view.cardPick

      if (!pick?.eligible.includes(index)) return same
      if (ask.type === 'select_unselect_card') return answer({ type: ask.type, index })
      if (state.chosen.includes(index)) return next(state.chosen.filter((i) => i !== index))
      const after = next([...state.chosen, index])
      const now = askView(after.state).cardPick!

      // Completa: vale y ya no se puede sumar ninguna (con `max = 1`, al primer toque).
      return now.done && now.eligible.every((i) => now.chosen.includes(i)) ? answer(cardAnswer(ask, now)) : after
    }

    case 'zone': {
      const target = state.base.targets.find((item) => item.side === gesture.side && item.zone === gesture.zone && item.index === gesture.index)

      if (!view.zonePick || !target) return same
      if (state.chosen.includes(target.bit)) return next(state.chosen.filter((bit) => bit !== target.bit))
      const chosen = [...state.chosen, target.bit]

      return chosen.length === view.zonePick.count ? answer({ type: 'select_place', places: chosen.map((bit) => placeOfBit(ask.player, bit)) }) : next(chosen)
    }

    case 'option': {
      const options = view.options

      if (!options?.options.some((option) => option.value === gesture.value)) return same
      if (state.chosen.includes(gesture.value)) return next(state.chosen.filter((value) => value !== gesture.value))
      const chosen = [...state.chosen, gesture.value]

      if (chosen.length < options.count) return next(chosen)
      switch (ask.type) {
        case 'select_option':
        case 'announce_number':
          return answer({ type: ask.type, index: chosen[0]! })
        case 'select_position':
          return answer({ type: ask.type, position: chosen[0]! })
        case 'announce_race':
          return answer({ type: ask.type, races: String(chosen.reduce((mask, bit) => mask | (1n << BigInt(bit)), 0n)) })
        case 'announce_attrib':
          return answer({ type: ask.type, attributes: chosen.reduce((mask, bit) => mask | (1 << bit), 0) })
        default:
          return same
      }
    }
  }
}

/** La respuesta de una elección de cartas completa (en una suma, sin las fijas: el núcleo ya las cuenta). */
function cardAnswer(ask: CoreAsk, pick: CardPick): CoreAnswer {
  const picked = pick.chosen.filter((i) => !pick.locked.includes(i))

  return ask.type === 'select_unselect_card' ? { type: ask.type, index: null } : ({ type: ask.type, indices: picked } as CoreAnswer)
}
