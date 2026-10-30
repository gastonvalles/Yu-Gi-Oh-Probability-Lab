import type { MatAction, MatPhase, MatPos, MatState, Placed } from '../../practice-mat'
import type { Adapter, AdapterOutput, AutoOverlay, CardRef, CorePlace, Side } from '../adapter'
import type { CoreAnswer, CoreAsk, Seat } from '../protocol'

/**
 * El bot que juega en contra («Jugar solo automático»): la interfaz y su vista. Un `Bot` decide con la pregunta del núcleo (ya filtrada para su asiento), su vista (`BotView`)
 * y su contexto (`BotContext`), y dice por qué (`BotDecision.reason`, una clave de i18n). La vista se arma sólo con `botViewOf`, desde el adaptador de su asiento, que ya lleva
 * nada más que lo que el árbitro le dejó ver (`referee.ts`), y saca lo que ni así le corresponde: el orden de su propio deck (queda la cuenta por código, sin orden). Nunca
 * llegan la semilla del duelo, el estado del anfitrión ni los `waiting` / `stats` del flujo (cuántas veces te preguntó el núcleo no es público). Puro: sin núcleo, sesión ni
 * React (lo vigila `auto-bot-privacy.test.ts`).
 */

/** Una carta como la ve el bot. `code` 0 = no la conoce (boca abajo del otro, su mano). `place`: dónde la tiene el núcleo ahora. */
export interface BotCard {
  ref: CardRef
  code: number
  place: CorePlace | null
  pos?: MatPos
  stats?: { attack: number; defense: number; level: number }
}

/** Un lado de la mesa. `deckLeft` y `extraLeft` (por código, sin orden: nadie sabe qué roba) sólo en el propio; del otro, cuántas. */
export interface BotSide {
  hand: BotCard[]
  /** 0–4 la Zona de Monstruos Principal, 5–6 la Extra. */
  monsters: (BotCard | null)[]
  /** 0–4 las Mágicas y Trampas, 5 la de Campo. */
  spells: (BotCard | null)[]
  grave: BotCard[]
  banished: BotCard[]
  extraFaceUp: BotCard[]
  extraFaceDown: number
  deckCount: number
  deckLeft?: Record<number, number>
  extraLeft?: Record<number, number>
}

type Who = 'me' | 'them'

/** Lo que pasó y vio cualquiera, en orden (`publicEventsOf`): nunca un `waiting`, un `stats`, un `n` ni un `askId`. `code` 0 si no se vio. */
export type PublicEvent =
  | { kind: 'phase'; side: Who; phase: MatPhase }
  | { kind: 'summon'; side: Who; code: number; how: string }
  | { kind: 'set'; side: Who; what: 'monster' | 'spell' }
  | { kind: 'attack'; side: Who; code: number; target: number | null }
  | { kind: 'activate'; side: Who; code: number; link: number }
  | { kind: 'negated' | 'resolved'; link: number }
  | { kind: 'lp'; me: number; them: number }

export interface BotView {
  seat: Seat
  me: BotSide
  them: BotSide
  lp: { me: number; them: number }
  turn: number
  turnPlayer: Who | null
  /** La fase con la constante del núcleo (`PHASE_*`). */
  phase: number
  /** La cadena en curso, del eslabón 1 en adelante (activar muestra la carta: es pública). `card.ref.side` dice de quién es (`mine`, del bot). */
  chain: { code: number; card: BotCard | null; description: string; state: AutoOverlay['chain'][number]['state'] }[]
  /** Lo que rige sobre cada uno (`overlay.limits`). */
  limits: { me: string[]; them: string[] }
  history: readonly PublicEvent[]
}

/** El motivo: una clave de i18n (área `auto`) y las cartas que nombra: en el texto, `{card}` es la primera y `{to}` la segunda. */
export interface BotReason {
  key: `auto.bot.reason.${string}`
  cards?: number[]
  params?: Record<string, string | number>
}

export interface BotDecision {
  answer: CoreAnswer
  /** Sin motivo: una respuesta que no se cuenta (pasar sin nada que decir, elegir una casilla). */
  reason?: BotReason
  /** Reservado para los niveles: la alternativa más cercana que descartó. Hoy nadie la llena. */
  alternative?: { answer: CoreAnswer; reason: BotReason }
  /** Qué regla decidió (`'handtrap.use.respond'`): para las pruebas y para depurar, no se muestra. */
  rule?: string
}

/** Lo que no es la mesa: el azar del bot (con su propia semilla, nunca la del duelo) y, reservado, el nivel (hoy siempre `normal` y nadie lo lee). */
export interface BotContext {
  random: () => number
  level: 'normal'
}

export type Bot = (ask: CoreAsk, view: BotView, context: BotContext) => BotDecision

const tally = (codes: number[]) => {
  const out: Record<number, number> = {}

  for (const code of codes) out[code] = (out[code] ?? 0) + 1
  return out
}

/** La vista del bot, desde el adaptador de su asiento (`seat`) y su historial público. Lo único que lee del adaptador: sus dos mesas, el overlay, `codeOf` y `locationOf`. */
export function botViewOf(adapter: Pick<Adapter, 'mine' | 'theirs' | 'overlay' | 'codeOf' | 'locationOf'>, seat: Seat, history: readonly PublicEvent[]): BotView {
  const { overlay } = adapter
  const card = (side: Side, id: string, pos?: MatPos): BotCard => {
    const ref = { side, id }
    const stats = overlay.stats[side][id]

    return { ref, code: adapter.codeOf(ref), place: adapter.locationOf(ref), ...(pos ? { pos } : {}), ...(stats ? { stats } : {}) }
  }
  const sideOf = (side: Side, state: MatState): BotSide => {
    const one = (id: string) => card(side, id)
    const placed = (slot: Placed | null) => (slot ? card(side, slot.id, slot.pos) : null)
    const up = new Set(state.extraUp)
    const down = state.extra.filter((id) => !up.has(id))
    const codes = (ids: string[]) => ids.map((id) => adapter.codeOf({ side, id }))

    return {
      hand: state.hand.map(one),
      monsters: [...state.mz, ...state.emz].map(placed),
      spells: [...state.st, state.field].map(placed),
      grave: state.gy.map(one),
      banished: state.banished.map(one),
      extraFaceUp: state.extra.filter((id) => up.has(id)).map(one),
      extraFaceDown: down.length,
      deckCount: state.deck.length,
      // Lo propio que no está a la vista, por código: un objeto con claves numéricas se recorre en orden de código, no en el del deck.
      ...(side === 'mine' ? { deckLeft: tally(codes(state.deck)), extraLeft: tally(codes(down)) } : {}),
    }
  }
  const who = (player: Seat | null) => (player === null ? null : player === seat ? 'me' : 'them')

  return {
    seat,
    me: sideOf('mine', adapter.mine),
    them: sideOf('theirs', adapter.theirs.state),
    lp: { me: overlay.lp[seat], them: overlay.lp[1 - seat]! },
    turn: overlay.turn,
    turnPlayer: who(overlay.turnPlayer),
    phase: overlay.phase,
    chain: overlay.chain.map((link) => ({ code: link.code, card: link.card ? card(link.card.side, link.card.id) : null, description: link.description, state: link.state })),
    limits: { me: [...overlay.limits[seat]], them: [...overlay.limits[1 - seat]!] },
    history,
  }
}

/**
 * Lo público de una tanda del adaptador del bot (`AdapterOutput`), en el orden en que pasó: las Invocaciones, lo colocado, los ataques y las fases de cada mesa (`order`), los
 * eslabones de la cadena (`chain`, ubicados por cuántas jugadas del bot había) y las vidas (`lp`, por cuántas jugadas de la tanda). Los códigos, con `codeOf` después de la tanda.
 */
export function publicEventsOf(out: Pick<AdapterOutput, 'mine' | 'theirs' | 'order' | 'chain' | 'lp'>, adapter: Pick<Adapter, 'codeOf'>, seat: Seat): PublicEvent[] {
  const events: PublicEvent[] = []
  const code = (side: Side, id: string | undefined) => (id === undefined ? 0 : adapter.codeOf({ side, id }))
  const play = (side: Side, action: MatAction) => {
    const who: Who = side === 'mine' ? 'me' : 'them'
    const other: Side = side === 'mine' ? 'theirs' : 'mine'

    if (action.type === 'phase') events.push({ kind: 'phase', side: who, phase: action.phase })
    else if (action.type === 'attack') events.push({ kind: 'attack', side: who, code: code(side, action.id), target: action.target === undefined ? null : code(other, action.target) })
    else if ((action.type === 'place' || action.type === 'tribute') && action.pos === 'set') events.push({ kind: 'set', side: who, what: action.zone === 'mz' || action.zone === 'emz' ? 'monster' : 'spell' })
    else if (action.type === 'tribute' || (action.type === 'place' && (action.zone === 'mz' || action.zone === 'emz')) || action.type === 'summon') {
      events.push({ kind: 'summon', side: who, code: code(side, action.id), how: action.type === 'summon' ? action.how : action.type === 'tribute' ? 'tribute' : (action.how ?? 'special') })
    }
  }
  let mine = 0
  let theirs = 0
  let steps = 0
  let lives = 0
  const flush = (at: number, played: number) => {
    for (; steps < out.chain.length && out.chain[steps]!.at <= played; steps += 1) {
      const step = out.chain[steps]!

      if (step.kind === 'chain' && step.link) events.push({ kind: 'activate', side: step.link.mine ? 'me' : 'them', code: step.link.code, link: step.index + 1 })
      else if (step.kind === 'negated' || step.kind === 'disabled') events.push({ kind: 'negated', link: step.index + 1 })
      else if (step.kind === 'solved') events.push({ kind: 'resolved', link: step.index + 1 })
    }
    for (; lives < out.lp.length && out.lp[lives]!.at <= at; lives += 1) events.push({ kind: 'lp', me: out.lp[lives]!.lp[seat], them: out.lp[lives]!.lp[1 - seat]! })
  }

  out.order.forEach((side, at) => {
    flush(at, mine)
    if (side === 'mine') play('mine', out.mine[mine++]!)
    else play('theirs', out.theirs[theirs++]!.action)
  })
  flush(Infinity, Infinity)

  return events
}
