import type { MatState } from '../practice-mat'
import { LOCATION as L, type Seat, type WireEvent } from './protocol'

/**
 * Lo que cuentan algunas cartas (Angelechy Shatranga, Nibiru): el script lo lleva por dentro (una bandera por cada vez) y el núcleo no lo manda, así que se cuenta acá con los
 * eventos públicos que el adaptador ya recibe (`chaining`, `summoning`/`spsummoning` y su `*summoned`, `new_turn`). Los dos asientos ven esos eventos igual (`referee.ts`: todos
 * a los dos), así que las dos mesas dan el mismo número. Deshacer re-simula con adaptadores nuevos: el número vuelve solo.
 *
 * Sumar una carta: su fila en `TALLY_CARDS`, leída de su script (CardScripts del commit de `auto-data.lock.json`), si lo que cuenta es uno de los dos `counts` que ya hay.
 */

/** Las dos cuentan lo del rival de quien la tiene, en el turno en curso (las dos banderas vencen con `RESET_PHASE|PHASE_END`). */
export interface TallyRule {
  /**
   * `effects`: las activaciones de efectos de monstruo (`EVENT_CHAINING` con `re:IsMonsterEffect()`; un intento negado cuenta). `summons`: las Invocaciones Normales y Especiales
   * que salieron (`EVENT_SUMMON_SUCCESS` y `EVENT_SPSUMMON_SUCCESS`, una por monstruo; ni la negada ni la por Volteo).
   */
  counts: 'effects' | 'summons'
  /**
   * Dónde se ve y desde cuándo cuenta. `st`: boca arriba en las Mágicas y Trampas, desde que llega (salir, quedar boca abajo o cambiar de controlador la vuelve a 0: `RESETS_STANDARD`
   * y `RESET_CONTROL`). `hand`: en la mano de quien la tiene, sólo para él, con todo el turno (el script cuenta desde el principio del duelo: `aux.GlobalCheck`).
   */
  where: 'st' | 'hand'
  /** Desde cuántas hace algo. */
  limit: number
}

export const TALLY_CARDS: Readonly<Record<number, TallyRule>> = {
  // Angelechy Shatranga: tratada como Mágica Continua, el rival puede intentar activar hasta 5 efectos de monstruo por turno (`HasFlagEffect(id,5)` le prohíbe el sexto).
  42410161: { counts: 'effects', where: 'st', limit: 5 },
  // Nibiru, the Primal Being: se activa desde la mano en una Main Phase si el rival Invocó 5 o más monstruos este turno (`GetFlagEffect(1-tp,id)>=5`).
  27204311: { counts: 'summons', where: 'hand', limit: 5 },
}

type Side = 'mine' | 'theirs'
type Count = Record<Side, number>
/** Un lugar del campo del núcleo. */
type Place = { controller: Seat; location: number; sequence: number }

export interface Tally {
  /** Lo de cada mesa en el turno en curso. */
  turn: Record<TallyRule['counts'], Count>
  /** Las cartas `st` en su zona (`<mesa> <id>`): lo que había contado su rival al llegar. */
  since: Readonly<Record<string, number>>
  /** Las Invocaciones empezadas sin su `*summoned` todavía, con su lugar y quién invoca: una negada se va de ahí (`move`) sin contarse. */
  pending: readonly (Place & { by: Side })[]
}

export const NO_TALLY: Tally = { turn: { effects: { mine: 0, theirs: 0 }, summons: { mine: 0, theirs: 0 } }, since: {}, pending: [] }

/** Lo que el adaptador sabe y el evento no dice. */
export interface TallyContext {
  seat: Seat
  typeOf: (code: number) => number
  /** La mesa de quien Invoca, por la carta de ese lugar (ya movida): su dueño (una del otro lado lleva `f.`). Durante un eslabón, `solver` manda (Monster Reborn sobre una ajena). */
  ownerAt: (place: Place) => Side | null
  /** La mesa del eslabón que se está resolviendo, o null. */
  solver: () => Side | null
  /** Lo boca arriba en las Mágicas y Trampas (0 a 4) con su código conocido, de las dos mesas. */
  spells: () => readonly { side: Side; id: string; code: number }[]
}

const TYPE_MONSTER = 0x1
const other = (side: Side): Side => (side === 'mine' ? 'theirs' : 'mine')
const add = (count: Count, side: Side, n = 1): Count => ({ ...count, [side]: count[side] + n })

/** Un evento: el mismo `tally` si no cambia nada (la mesa compara por referencia). */
export function tallyStep(tally: Tally, event: WireEvent, ctx: TallyContext): Tally {
  const sideOf = (seat: number): Side => (seat === ctx.seat ? 'mine' : 'theirs')
  let next = tally

  switch (event.type) {
    case 'new_turn':
      next = { ...NO_TALLY, since: Object.fromEntries(Object.keys(tally.since).map((key) => [key, 0])) }
      break
    // Un efecto de monstruo: el de una carta de monstruo que no está en las Mágicas y Trampas (ahí es una Mágica: Continua, Campo o escala de Péndulo).
    case 'chaining':
      if ((ctx.typeOf(event.code) & TYPE_MONSTER) !== 0 && (event.location & L.SZONE) === 0) next = { ...tally, turn: { ...tally.turn, effects: add(tally.turn.effects, sideOf(event.controller)) } }
      break
    case 'summoning':
    case 'spsummoning': {
      const by = ctx.solver() ?? ctx.ownerAt(event) ?? sideOf(event.controller)

      next = { ...tally, pending: [...tally.pending, { controller: event.controller, location: event.location, sequence: event.sequence, by }] }
      break
    }
    case 'move': {
      const { from } = event
      const kept = tally.pending.filter((item) => item.controller !== from.controller || item.location !== from.location || item.sequence !== from.sequence)

      if (kept.length < tally.pending.length) next = { ...tally, pending: kept }
      break
    }
    case 'summoned':
    case 'spsummoned':
      if (tally.pending.length > 0) next = { ...tally, pending: [], turn: { ...tally.turn, summons: tally.pending.reduce((count, item) => add(count, item.by), tally.turn.summons) } }
      break
  }

  return settle(next, ctx)
}

/** Las cartas `st` que llegan empiezan de 0 (lo contado hasta ahí queda como base); las que se fueron, se olvidan. */
function settle(tally: Tally, ctx: TallyContext): Tally {
  const live = ctx.spells().filter((card) => TALLY_CARDS[card.code]?.where === 'st')
  const keys = live.map((card) => `${card.side} ${card.id}`)
  const same = keys.length === Object.keys(tally.since).length && keys.every((key) => key in tally.since)

  if (same) return tally
  return { ...tally, since: Object.fromEntries(live.map((card, i) => [keys[i]!, tally.since[keys[i]!] ?? tally.turn[TALLY_CARDS[card.code]!.counts][other(card.side)]])) }
}

/** Lo que muestra una carta: cuántas lleva, su umbral y qué cuenta. */
export interface TallyView {
  count: number
  limit: number
  counts: TallyRule['counts']
}

/** El número de una carta de una mesa (con su código), donde está (`st` o `hand`); null si ahí no cuenta. */
export function tallyFor(tally: Tally, side: Side, id: string, code: number, where: TallyRule['where']): TallyView | null {
  const rule = TALLY_CARDS[code]

  if (!rule || rule.where !== where) return null
  const done = tally.turn[rule.counts][other(side)]

  if (where === 'hand') return { count: done, limit: rule.limit, counts: rule.counts }
  const base = tally.since[`${side} ${id}`]

  return base === undefined ? null : { count: done - base, limit: rule.limit, counts: rule.counts }
}

/** Sin números: el mismo objeto siempre. */
export const NO_TALLIES: ReadonlyMap<string, TallyView> = new Map()

/**
 * Los números de una mesa, por id: lo boca arriba de sus Mágicas y Trampas y, con `hand`, su mano (la tuya: la del rival no se ve). `codeOf`, el código de cada id (0 = no se sabe). Si queda igual a
 * `previous` (por valor), devuelve `previous`: la mesa compara sus props por referencia.
 */
export function talliesOf(tally: Tally, side: Side, mat: MatState, codeOf: (id: string) => number, hand: boolean, previous: ReadonlyMap<string, TallyView>): ReadonlyMap<string, TallyView> {
  const out = new Map<string, TallyView>()
  const put = (id: string, where: TallyRule['where']) => {
    const view = tallyFor(tally, side, id, codeOf(id), where)

    if (view) out.set(id, view)
  }

  for (const placed of mat.st) if (placed && placed.pos !== 'set') put(placed.id, 'st')
  if (hand) for (const id of mat.hand) put(id, 'hand')
  if (previous.size === out.size && [...out].every(([id, view]) => previous.get(id)?.count === view.count)) return previous
  return out.size === 0 ? NO_TALLIES : out
}
