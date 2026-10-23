/**
 * Duelos automáticos · la frontera entre la app y el núcleo de reglas (ocgcore, que corre aparte: un Worker o un servidor; `core-host.ts`).
 * Todo lo que la cruza es JSON sin `bigint` (las descripciones u64 y las máscaras de 64 bits viajan como texto decimal), así sirve igual
 * para `postMessage` y para el relay. Cada forma se escribe una sola vez, como esquema: el mismo esquema da el tipo de TypeScript, valida
 * lo que llega (`parseAutoCommand` / `parseAutoEvent`: una copia con forma conocida o `null`, como `parseMessage` de duel-protocol.ts)
 * y, del lado del anfitrión, recorta cada mensaje del núcleo a lo que viaja (`readShape`).
 *
 * Las preguntas (`CoreAsk`) y los eventos (`WireEvent`) se nombran como los mensajes del núcleo (`'select_card'`, `'move'`) y guardan sus
 * campos y números (`controller`, `location` como máscara `LOCATION`, `position` como `POSITION`, `sequence`): el adaptador de la mesa
 * los traduce una sola vez. Los asientos son los jugadores del núcleo: el 0 es el deck que va como `team1` y siempre empieza.
 * Este módulo no importa el paquete del núcleo (lo importa la UI): sus constantes son copias, y un test las compara con las del paquete.
 */

export type Seat = 0 | 1

/** Lugares del núcleo (`LOCATION_*`). Un material de Xyz viaja como `MZONE | OVERLAY`. La zona de Campo es `SZONE` 5. */
export const LOCATION = { DECK: 1, HAND: 2, MZONE: 4, SZONE: 8, GRAVE: 16, REMOVED: 32, EXTRA: 64, OVERLAY: 128 } as const
/** Posiciones del núcleo (`POS_*`). */
export const POSITION = { FACEUP_ATTACK: 1, FACEDOWN_ATTACK: 2, FACEUP_DEFENSE: 4, FACEDOWN_DEFENSE: 8, FACEUP: 5, FACEDOWN: 10 } as const

// ── El esquema ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Un campo es un primitivo (`'int'`, `'seat'`, `'bool'`, `'u64'` texto decimal, `'str'`; con `?` al final, opcional), una lista (`[S]`),
// un nulable (`['?', S]`) o un objeto de campos.

type Prim = 'int' | 'seat' | 'bool' | 'u64' | 'str'
type Shape = Prim | `${Prim}?` | readonly [Shape] | readonly ['?', Shape] | { readonly [key: string]: Shape }
type PrimOf<P> = P extends 'int' ? number : P extends 'seat' ? Seat : P extends 'bool' ? boolean : P extends 'u64' | 'str' ? string : never
type Flat<T> = { [K in keyof T]: T[K] }
type ObjOf<S> = Flat<{ -readonly [K in keyof S as S[K] extends `${string}?` ? never : K]: Infer<S[K]> } & { -readonly [K in keyof S as S[K] extends `${string}?` ? K : never]?: Infer<S[K]> }>
export type Infer<S> = S extends `${infer P}?` ? PrimOf<P> : S extends Prim ? PrimOf<S> : S extends readonly ['?', infer E] ? Infer<E> | null : S extends readonly [infer E] ? Infer<E>[] : ObjOf<S>

const BAD = Symbol('bad')
const MAX_LIST = 600
const MAX_TEXT = 2000
const U64 = /^\d{1,20}$/

const isPlain = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function read(shape: Shape, value: unknown): unknown {
  if (typeof shape === 'string') {
    switch (shape.endsWith('?') ? shape.slice(0, -1) : shape) {
      case 'int':
        return Number.isSafeInteger(value) ? value : BAD
      case 'seat':
        return value === 0 || value === 1 ? value : BAD
      case 'bool':
        return typeof value === 'boolean' ? value : BAD
      case 'u64':
        return typeof value === 'string' && U64.test(value) ? value : BAD
      default:
        return typeof value === 'string' && value.length <= MAX_TEXT ? value : BAD
    }
  }

  if (Array.isArray(shape)) {
    if (shape.length === 2) return value === null ? null : read(shape[1] as Shape, value)
    if (!Array.isArray(value) || value.length > MAX_LIST) return BAD
    const out: unknown[] = []

    for (const item of value) {
      const next = read(shape[0] as Shape, item)

      if (next === BAD) return BAD
      out.push(next)
    }

    return out
  }

  if (!isPlain(value)) return BAD
  const out: Record<string, unknown> = {}

  for (const [key, field] of Object.entries(shape as Record<string, Shape>)) {
    if (value[key] === undefined && typeof field === 'string' && field.endsWith('?')) continue
    const next = read(field, value[key])

    if (next === BAD) return BAD
    out[key] = next
  }

  return out
}

/** Una copia de `value` con sólo los campos de `shape`, o `null` si no tiene esa forma. */
export function readShape<S>(shape: S, value: unknown): Infer<S> | null {
  const out = read(shape as Shape, value)

  return out === BAD ? null : (out as Infer<S>)
}

// ── Cartas y lugares ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Un lugar con su posición (`loc_info` del núcleo). */
const LOC = { controller: 'seat', location: 'int', sequence: 'int', position: 'int', overlay_sequence: 'int?' } as const
/** Una carta con su lugar. `code` 0 = una carta que quien la recibe no puede ver. */
const CARD = { code: 'int', controller: 'seat', location: 'int', sequence: 'int' } as const
const CARD_POS = { ...CARD, position: 'int', overlay_sequence: 'int?' } as const
const ACTIVE = { ...CARD, description: 'u64', client_mode: 'int' } as const
const PLAYED = { code: 'int', controller: 'seat', location: 'int', sequence: 'int', position: 'int' } as const

export type CardLoc = Infer<typeof CARD>
export type LocPos = Infer<typeof LOC>

// ── Las 21 preguntas del núcleo ────────────────────────────────────────────────────────────────────────────────────────────────────

export const ASK_SHAPES = {
  select_battlecmd: { player: 'seat', chains: [ACTIVE], attacks: [{ ...CARD, can_direct: 'bool' }], to_m2: 'bool', to_ep: 'bool' },
  select_idlecmd: { player: 'seat', summons: [CARD], special_summons: [CARD], pos_changes: [CARD], monster_sets: [CARD], spell_sets: [CARD], activates: [ACTIVE], to_bp: 'bool', to_ep: 'bool', shuffle: 'bool' },
  select_effectyn: { player: 'seat', ...CARD_POS, description: 'u64' },
  select_yesno: { player: 'seat', description: 'u64' },
  select_option: { player: 'seat', options: ['u64'] },
  select_card: { player: 'seat', can_cancel: 'bool', min: 'int', max: 'int', selects: [CARD_POS] },
  select_chain: { player: 'seat', spe_count: 'int', forced: 'bool', hint_timing: 'int', hint_timing_other: 'int', selects: [{ ...CARD_POS, description: 'u64', client_mode: 'int' }] },
  /** `field_mask`: un bit por casilla **no** disponible; byte 0 monstruos propios, 1 Mágicas/Trampas propias, 2 y 3 los del rival (relativo a quien elige). */
  select_place: { player: 'seat', count: 'int', field_mask: 'int' },
  select_position: { player: 'seat', code: 'int', positions: 'int' },
  select_tribute: { player: 'seat', can_cancel: 'bool', min: 'int', max: 'int', selects: [{ ...CARD, release_param: 'int' }] },
  sort_chain: { player: 'seat', cards: [CARD] },
  select_counter: { player: 'seat', counter_type: 'int', count: 'int', cards: [{ ...CARD, count: 'int' }] },
  /** `select_max` es el modo: 0 = suma exacta con `min`..`max` cartas; distinto de 0 = «al menos `amount`» sin tope (Ritual). Cada carta vale su u16 bajo o su u16 alto. */
  select_sum: { player: 'seat', select_max: 'int', amount: 'int', min: 'int', max: 'int', selects_must: [{ ...CARD, amount: 'int' }], selects: [{ ...CARD, amount: 'int' }] },
  select_disfield: { player: 'seat', count: 'int', field_mask: 'int' },
  sort_card: { player: 'seat', cards: [CARD] },
  select_unselect_card: { player: 'seat', can_finish: 'bool', can_cancel: 'bool', min: 'int', max: 'int', select_cards: [CARD_POS], unselect_cards: [CARD_POS] },
  announce_race: { player: 'seat', count: 'int', available: 'u64' },
  announce_attrib: { player: 'seat', count: 'int', available: 'int' },
  /** `opcodes`: un filtro en notación polaca (OPCODE_*) que la carta anunciada tiene que cumplir. */
  announce_card: { player: 'seat', opcodes: ['u64'] },
  announce_number: { player: 'seat', options: ['u64'] },
  rock_paper_scissors: { player: 'seat' },
} as const

export type AskType = keyof typeof ASK_SHAPES
export type CoreAsk = { [K in AskType]: Flat<{ type: K } & Infer<(typeof ASK_SHAPES)[K]>> }[AskType]
export type AskOf<K extends AskType> = Extract<CoreAsk, { type: K }>

const INDEX = ['?', 'int'] as const
const INDICES = ['?', ['int']] as const
const PLACES = [{ player: 'seat', location: 'int', sequence: 'int' }] as const

/** La respuesta de cada pregunta, por el tipo de la pregunta. `null` en un índice o una lista = cancelar / terminar / «como está». */
export const ANSWER_SHAPES = {
  /** `action`: 0 activar (`chains`), 1 atacar (`attacks`), 2 Main Phase 2, 3 End Phase. */
  select_battlecmd: { action: 'int', index: INDEX },
  /** `action`: 0 Normal, 1 Especial, 2 cambiar de posición, 3 colocar monstruo, 4 colocar Mágica/Trampa, 5 activar, 6 Battle Phase, 7 End Phase, 8 barajar la mano. */
  select_idlecmd: { action: 'int', index: INDEX },
  select_effectyn: { yes: 'bool' },
  select_yesno: { yes: 'bool' },
  select_option: { index: 'int' },
  select_card: { indices: INDICES },
  select_chain: { index: INDEX },
  select_place: { places: PLACES },
  select_position: { position: 'int' },
  select_tribute: { indices: INDICES },
  sort_chain: { order: INDICES },
  select_counter: { counters: ['int'] },
  select_sum: { indices: ['int'] },
  select_disfield: { places: PLACES },
  sort_card: { order: INDICES },
  /** Un índice de `select_cards`, o `select_cards.length + i` para sacar `unselect_cards[i]`; `null` termina (o cancela). */
  select_unselect_card: { index: INDEX },
  /** La máscara de los Tipos anunciados (u64 en texto). */
  announce_race: { races: 'u64' },
  announce_attrib: { attributes: 'int' },
  announce_card: { code: 'int' },
  announce_number: { index: 'int' },
  /** 1 tijera, 2 piedra, 3 papel. */
  rock_paper_scissors: { value: 'int' },
} as const satisfies Record<AskType, Shape>

export type CoreAnswer = { [K in AskType]: Flat<{ type: K } & Infer<(typeof ANSWER_SHAPES)[K]>> }[AskType]

// ── Lo que el núcleo cuenta ────────────────────────────────────────────────────────────────────────────────────────────────────────

const CHAIN = { chain_size: 'int' } as const
const AMOUNT = { player: 'int', amount: 'int' } as const
const PAIR = { card: LOC, target: LOC } as const
const COUNTER = { counter_type: 'int', controller: 'seat', location: 'int', sequence: 'int', count: 'int' } as const
const BATTLER = { ...LOC, attack: 'int', defense: 'int', destroyed: 'bool' } as const

/**
 * Los mensajes del núcleo que viajan a la mesa (§2.3 del diseño). Lo que no está acá ni en `ASK_SHAPES` el anfitrión lo descarta a
 * propósito (`IGNORED_MESSAGES`) o lo cuenta como «sin manejar». `waiting` es nuestro: el otro asiento está eligiendo.
 * `hint`: `hint_type` 1 evento, 2 mensaje, 4 opción elegida, 5 efecto, 6 Tipo, 7 Atributo, 8 carta anunciada, 9 número, 10 carta, 11 zona
 * (el 3, el título de una pregunta, viaja en el `ask`).
 */
export const EVENT_SHAPES = {
  hint: { hint_type: 'int', player: 'int', hint: 'u64' },
  confirm_decktop: { player: 'int', cards: [CARD] },
  confirm_cards: { player: 'int', cards: [CARD] },
  confirm_extratop: { player: 'int', cards: [CARD] },
  shuffle_deck: { player: 'int' },
  shuffle_hand: { player: 'int', cards: ['int'] },
  shuffle_extra: { player: 'int', cards: ['int'] },
  swap_grave_deck: { player: 'int', deck_size: 'int', returned_to_extra: ['int'] },
  shuffle_set_card: { location: 'int', cards: [{ from: LOC, to: LOC }] },
  reverse_deck: {},
  deck_top: { player: 'int', count: 'int', code: 'int', position: 'int' },
  new_turn: { player: 'int' },
  new_phase: { phase: 'int' },
  move: { card: 'int', from: LOC, to: LOC },
  pos_change: { code: 'int', controller: 'seat', location: 'int', sequence: 'int', prev_position: 'int', position: 'int' },
  set: PLAYED,
  swap: { card1: CARD_POS, card2: CARD_POS },
  field_disabled: { field_mask: 'int' },
  summoning: PLAYED,
  summoned: {},
  spsummoning: PLAYED,
  spsummoned: {},
  flipsummoning: PLAYED,
  flipsummoned: {},
  chaining: { ...CARD_POS, triggering_controller: 'seat', triggering_location: 'int', triggering_sequence: 'int', description: 'u64', chain_size: 'int' },
  chained: CHAIN,
  chain_solving: CHAIN,
  chain_solved: CHAIN,
  chain_end: {},
  chain_negated: CHAIN,
  chain_disabled: CHAIN,
  card_selected: { cards: [LOC] },
  random_selected: { player: 'int', cards: [LOC] },
  become_target: { cards: [LOC] },
  draw: { player: 'int', drawn: [{ code: 'int', position: 'int' }] },
  damage: AMOUNT,
  recover: AMOUNT,
  equip: PAIR,
  lpupdate: { player: 'int', lp: 'int' },
  card_target: PAIR,
  cancel_target: PAIR,
  pay_lpcost: AMOUNT,
  add_counter: COUNTER,
  remove_counter: COUNTER,
  attack: { card: LOC, target: ['?', LOC] },
  battle: { card: BATTLER, target: ['?', BATTLER] },
  attack_disabled: {},
  damage_step_start: {},
  damage_step_end: {},
  missed_effect: CARD_POS,
  toss_coin: { player: 'int', results: ['bool'] },
  toss_dice: { player: 'int', results: ['int'] },
  hand_res: { results: ['int'] },
  card_hint: { controller: 'seat', location: 'int', sequence: 'int', position: 'int', overlay_sequence: 'int?', card_hint: 'int', description: 'u64' },
  show_hint: { hint: 'str' },
  player_hint: { player: 'int', player_hint: 'int', description: 'u64' },
  match_kill: { card: 'int' },
  remove_cards: { cards: [LOC] },
  waiting: {},
} as const

export type EventType = keyof typeof EVENT_SHAPES
export type WireEvent = { [K in EventType]: Flat<{ type: K } & Infer<(typeof EVENT_SHAPES)[K]>> }[EventType]
export type EventOf<K extends EventType> = Extract<WireEvent, { type: K }>

/**
 * Mensajes del núcleo que no viajan, cada uno con su porqué: `retry` lo maneja el anfitrión (es un bug nuestro: `fault` y se vuelve a
 * preguntar); `win` se vuelve `end`; `start` y `waiting` no los emite el núcleo; los `update_*`, `request_deck` y `refresh_deck` están en
 * desuso; `tag_swap` es del duelo en parejas; `reload_field`, de los puzzles; los demás no traen datos.
 */
export const IGNORED_MESSAGES = ['retry', 'win', 'start', 'waiting', 'update_data', 'update_card', 'request_deck', 'refresh_deck', 'be_chain_target', 'create_relation', 'release_relation', 'tag_swap', 'reload_field', 'ai_name', 'custom_msg'] as const

/** Lo que el anfitrión consulta del campo tras cada tanda (ATK/DEF y nivel de ahora), por asiento: sólo las cartas que ese asiento ve. */
const STAT = { code: 'int', controller: 'seat', location: 'int', sequence: 'int', position: 'int', attack: 'int', defense: 'int', level: 'int' } as const
export type CardStat = Infer<typeof STAT>

// ── Los mensajes de la frontera ────────────────────────────────────────────────────────────────────────────────────────────────────

const PLAYER = { lp: 'int', hand: 'int', draw: 'int' } as const
/** Un deck ya en códigos del núcleo (`deck-map.ts`). `hand`: la mano fija, que va arriba en ese orden; vacía = todo barajado. */
const DECK = { main: ['int'], extra: ['int'], hand: ['int'] } as const

const COMMAND_SHAPES = {
  /** `seed`: la semilla de todo el duelo (u32, como las de la mesa). `flags`: las reglas (u64 en texto; `MODE_MR5` por defecto). `decks[0]` empieza. */
  create: { seed: 'int', flags: 'u64', players: [PLAYER], decks: [DECK] },
  answer: { askId: 'int', answer: {} },
  /** Deshacer: re-simula desde la semilla con las primeras `to` respuestas (y vuelve a mandar todos los eventos, desde cero). */
  rewind: { to: 'int' },
  destroy: {},
} as const

export type AutoCommand =
  | Flat<{ t: 'create' } & Infer<typeof COMMAND_SHAPES.create>>
  | { t: 'answer'; askId: number; answer: CoreAnswer }
  | Flat<{ t: 'rewind' } & Infer<typeof COMMAND_SHAPES.rewind>>
  | { t: 'destroy' }

/**
 * Qué salió mal: `rules` cartas sin datos o sin script al crear (`cards`; no se arranca); `retry` el núcleo rechazó una respuesta (se
 * vuelve a preguntar); `unhandled` un mensaje del núcleo sin manejar o con otra forma; `script` un error de Lua o del núcleo (el duelo
 * sigue); `crash` el núcleo se cayó (el duelo terminó); `setup` no se pudo crear el duelo; `answer` una respuesta de otro tipo que la pregunta.
 */
export const FAULT_KINDS = ['rules', 'retry', 'unhandled', 'script', 'crash', 'setup', 'answer'] as const
export type FaultKind = (typeof FAULT_KINDS)[number]

export type AutoEvent =
  /** `n`: cuántas respuestas iban cuando el núcleo los contó (0 = el arranque). */
  | { t: 'events'; seat: Seat; n: number; events: WireEvent[] }
  /** Una pregunta, sólo al asiento que decide. `title`: el `desc` del `HINT_SELECTMSG` que la precede, si lo hubo. */
  | { t: 'ask'; seat: Seat; askId: number; ask: CoreAsk; title?: string }
  | { t: 'stats'; seat: Seat; cards: CardStat[] }
  /** `winner` 2 = empate. */
  | { t: 'end'; winner: number; reason: number }
  /** Algo salió mal: `kind` lo dice para quien lo muestra (con `t()`); `message` es el detalle técnico, en inglés como los errores del núcleo. */
  | { t: 'fault'; kind: FaultKind; message: string; cards?: number[] }
  | { t: 'loading'; done: number; total: number }

const MAX_SEED = 2 ** 32 - 1
const MAX_LP = 999_999
const MAX_JSON = 256 * 1024

function parseRaw(input: unknown): Record<string, unknown> | null {
  if (typeof input !== 'string') return isPlain(input) ? input : null
  if (input.length > MAX_JSON) return null

  try {
    const raw: unknown = JSON.parse(input)

    return isPlain(raw) ? raw : null
  } catch {
    return null
  }
}

const inRange = (value: number, min: number, max: number) => value >= min && value <= max

/** Una respuesta del tipo de pregunta que dice su `type`, o `null`. */
export function parseAnswer(value: unknown): CoreAnswer | null {
  if (!isPlain(value) || typeof value.type !== 'string' || !Object.hasOwn(ANSWER_SHAPES, value.type)) return null
  const type = value.type as AskType
  const body = readShape(ANSWER_SHAPES[type], value)

  return body ? ({ type, ...body } as CoreAnswer) : null
}

/** Una pregunta con forma conocida, o `null`. */
export function parseAsk(value: unknown): CoreAsk | null {
  if (!isPlain(value) || typeof value.type !== 'string' || !Object.hasOwn(ASK_SHAPES, value.type)) return null
  const type = value.type as AskType
  const body = readShape(ASK_SHAPES[type], value)

  return body ? ({ type, ...body } as CoreAsk) : null
}

/** Un evento con forma conocida, o `null`. */
export function parseWireEvent(value: unknown): WireEvent | null {
  if (!isPlain(value) || typeof value.type !== 'string' || !Object.hasOwn(EVENT_SHAPES, value.type)) return null
  const type = value.type as EventType
  const body = readShape(EVENT_SHAPES[type], value)

  return body ? ({ type, ...body } as WireEvent) : null
}

/** El comando que llegó al anfitrión (objeto o texto JSON), ya revisado; `null` si no es de este protocolo o viene mal formado. */
export function parseAutoCommand(input: unknown): AutoCommand | null {
  const raw = parseRaw(input)

  switch (raw?.t) {
    case 'create': {
      const body = readShape(COMMAND_SHAPES.create, raw)
      const deckOk = (deck: Infer<typeof DECK>) => deck.main.length <= 200 && deck.extra.length <= 100 && deck.hand.length <= deck.main.length && [...deck.main, ...deck.extra].every((code) => code > 0)

      if (!body || !inRange(body.seed, 0, MAX_SEED) || body.players.length !== 2 || body.decks.length !== 2 || !body.decks.every(deckOk)) return null
      if (!body.players.every((p) => inRange(p.lp, 1, MAX_LP) && inRange(p.hand, 0, 60) && inRange(p.draw, 0, 60))) return null

      return { t: 'create', ...body }
    }

    case 'answer': {
      const answer = parseAnswer(raw.answer)

      return answer && Number.isSafeInteger(raw.askId) && (raw.askId as number) > 0 ? { t: 'answer', askId: raw.askId as number, answer } : null
    }

    case 'rewind':
      return Number.isSafeInteger(raw.to) && (raw.to as number) >= 0 ? { t: 'rewind', to: raw.to as number } : null

    case 'destroy':
      return { t: 'destroy' }

    default:
      return null
  }
}

/** El evento que llegó del anfitrión (objeto o texto JSON), ya revisado; `null` si no es de este protocolo o viene mal formado. */
export function parseAutoEvent(input: unknown): AutoEvent | null {
  const raw = parseRaw(input)
  const seat = raw?.seat === 0 || raw?.seat === 1 ? raw.seat : null
  const int = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0

  switch (raw?.t) {
    case 'events': {
      if (seat === null || !int(raw.n) || !Array.isArray(raw.events) || raw.events.length > MAX_LIST) return null
      const events = raw.events.map(parseWireEvent)

      return events.every((event) => event !== null) ? { t: 'events', seat, n: raw.n as number, events: events as WireEvent[] } : null
    }

    case 'ask': {
      const ask = parseAsk(raw.ask)
      const title = raw.title === undefined ? undefined : readShape('u64', raw.title)

      if (seat === null || !ask || !int(raw.askId) || title === null) return null

      return { t: 'ask', seat, askId: raw.askId as number, ask, ...(title === undefined ? {} : { title }) }
    }

    case 'stats': {
      const cards = readShape([STAT] as const, raw.cards)

      return seat === null || !cards ? null : { t: 'stats', seat, cards }
    }

    case 'end':
      return int(raw.winner) && (raw.winner as number) <= 2 && int(raw.reason) ? { t: 'end', winner: raw.winner as number, reason: raw.reason as number } : null

    case 'fault': {
      const message = readShape('str', raw.message)
      const cards = raw.cards === undefined ? undefined : readShape(['int'] as const, raw.cards)

      const kind = FAULT_KINDS.find((item) => item === raw.kind)

      return message === null || cards === null || !kind ? null : { t: 'fault', kind, message, ...(cards ? { cards } : {}) }
    }

    case 'loading':
      return int(raw.done) && int(raw.total) ? { t: 'loading', done: raw.done as number, total: raw.total as number } : null

    default:
      return null
  }
}
