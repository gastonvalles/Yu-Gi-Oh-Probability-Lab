import { effectSentences, type TextRange } from '../card-text'
import type { CardRef, ChainLink } from './adapter'
import { LOCATION as L, splitDesc, type WireEvent } from './protocol'

/**
 * La cadena paso a paso, para el aviso de la cadena (`ChainNotice`). El núcleo resuelve la cadena «de una» (los eslabones y su resolución llegan en una misma tanda) y el
 * `overlay` sólo guarda cómo quedó, así que el adaptador anota cada mensaje de la cadena en el orden en que llegó (`ChainStep`) con cuántas jugadas de tu mesa había en ese
 * momento (`at`): la pantalla los muestra de a uno con el ritmo de la mesa (`chainDwell`), sin adelantarse a las jugadas que todavía no contó ni dejar que la mesa se adelante.
 */

export type ChainStepKind = 'chain' | 'solving' | 'solved' | 'negated' | 'disabled' | 'end'

export interface ChainStep {
  kind: ChainStepKind
  /** Cuántas jugadas de tu mesa (`mineActions`) había cuando llegó: se muestra recién cuando la mesa contó hasta ahí. */
  at: number
  /** Cuántas jugadas de `order` (tuyas y del rival) había: «Jugar solo» cuenta lo del rival en su lugar (`useAutoAsks`). */
  seq?: number
  /** El eslabón (0 = CL1); en `end`, -1. */
  index: number
  /** Sólo `chain`: la carta que se activó, si es tuya, el `desc` del efecto (`aux.Stringid(carta, n)`: qué texto del `.cdb` lo nombra; ver `linkPhrase`) y desde dónde se activó (`from`: el `triggering_location` del núcleo, una máscara `LOCATION`). */
  link?: { card: CardRef | null; code: number; mine: boolean; description?: string; from?: number }
  /** Sólo `negated` y `disabled`: el eslabón que lo negó (1 = CL1), el que se estaba resolviendo (el núcleo no lo dice: lo deduce el adaptador). Sin él, no se sabe. */
  by?: number
  /** Sólo `solved`: qué hizo su efecto, si no hay duda (`chainOutcome`). Lo anotado antes no lo trae. */
  outcome?: ChainOutcome
}

/** Lo que hizo un eslabón al resolverse, en cuentas (el texto lo pone la pantalla): añadir a la mano, robar, Invocar de Modo Especial, mandar al Cementerio o desterrar. */
export type ChainOutcomeKind = 'add' | 'draw' | 'summon' | 'grave' | 'banish'
export interface ChainOutcome {
  kind: ChainOutcomeKind
  count: number
}

/**
 * Qué hizo un eslabón, a partir de lo que el núcleo contó entre su `chain_solving` y su `chain_solved` (el costo se paga antes, al activarse; la Mágica que se resolvió se va al
 * Cementerio después: comprobado con el núcleo real en `auto-chain-outcome.slow.test.ts`). **Callar antes que decir algo falso**: sale sólo si pasó una sola clase de cosa.
 * - `add`: a la mano desde el Deck, el Cementerio o el destierro (un robo es `draw`, otro mensaje; desde el campo es regresar, no añadir).
 * - `draw`: los robos, de un solo jugador.
 * - `summon`: cada Invocación Especial (`spsummoning`) con su llegada a la Zona de Monstruos, una por una.
 * - `grave` y `banish`: lo que llega al Cementerio o queda desterrado. «Destruye» no: el paquete del núcleo no pasa el `reason` del `move`, y sólo por el lugar destruir, mandar y
 *   sacrificar son lo mismo.
 * Cualquier otro movimiento (al Deck, al Extra, a las Mágicas y Trampas, del campo a la mano, un material, una Invocación Normal o una Colocación) o dos clases a la vez: null.
 * Sólo cuenta lugares, que le llegan a cada asiento aunque no vea la carta (`referee.ts`): nunca nombra nada.
 */
export function chainOutcome(events: readonly WireEvent[]): ChainOutcome | null {
  const counts: Partial<Record<ChainOutcomeKind | 'other', number>> = {}
  const drawers = new Set<number>()
  const bump = (kind: ChainOutcomeKind | 'other', n = 1) => (counts[kind] = (counts[kind] ?? 0) + n)
  let arrived = 0
  let summoned = 0

  for (const event of events) {
    if (event.type === 'draw') {
      bump('draw', event.drawn.length)
      drawers.add(event.player)
    } else if (event.type === 'spsummoning') summoned += 1
    else if (event.type === 'move') {
      const { from, to } = event

      if (from.overlay_sequence !== undefined || to.overlay_sequence !== undefined || ((from.location | to.location) & L.OVERLAY) !== 0) bump('other')
      else if (to.location === L.HAND) bump((from.location & (L.DECK | L.GRAVE | L.REMOVED)) !== 0 ? 'add' : 'other')
      else if (to.location === L.MZONE && from.location !== L.MZONE) arrived += 1
      else if (to.location === L.GRAVE) bump('grave')
      else if (to.location === L.REMOVED) bump('banish')
      else bump('other')
    }
  }
  // Una llegada al campo sin su Invocación Especial (una Invocación Normal, una Colocación) no se cuenta: callar.
  if (arrived > 0 || summoned > 0) bump(arrived === summoned ? 'summon' : 'other', summoned)
  const kinds = Object.keys(counts) as Array<ChainOutcomeKind | 'other'>
  const kind = kinds[0]

  if (kinds.length !== 1 || !kind || kind === 'other' || (kind === 'draw' && drawers.size !== 1)) return null
  return { kind, count: counts[kind]! }
}

export type ChainRowState = ChainLink['state']

export interface ChainRow {
  /** 1 = CL1. */
  number: number
  card: CardRef | null
  code: number
  mine: boolean
  /** El `desc` del efecto, si llegó (`ChainStep.link`). */
  description?: string
  /** Desde dónde se activó (`LOCATION` del núcleo), si se sabe. */
  from?: number
  state: ChainRowState
  /** Negada o sin efecto: el eslabón que lo hizo (1 = CL1), si se sabe (`ChainStep.by`). */
  by?: number
  /** Resuelta: qué hizo su efecto, si se sabe (`ChainStep.outcome`). */
  outcome?: ChainOutcome
}

export interface ChainFeed {
  /** El paso con el que empezó esta cadena: cambia con cada cadena nueva (para esconderla un rato después de terminar). */
  key: number
  /** Del CL1 en adelante. */
  rows: ChainRow[]
  /** Ya empezó a resolverse (algún eslabón pasó de `chained`). */
  resolving: boolean
  done: boolean
  /** El eslabón del que habla el aviso plegado: el último que cambió (mientras se arma, el último que se sumó). */
  focus: number
}

/** La cadena como se ve después de mostrar los primeros `count` pasos (la última que empezó), o null si todavía no hubo ninguna. */
export function chainFeed(steps: readonly ChainStep[], count: number): ChainFeed | null {
  const upTo = Math.min(count, steps.length)
  let start = -1

  for (let i = upTo - 1; i >= 0; i -= 1) {
    if (steps[i]!.kind === 'chain' && steps[i]!.index === 0) {
      start = i
      break
    }
  }
  if (start < 0) return null

  const rows: ChainRow[] = []
  let resolving = false
  let done = false
  let focus = 0

  for (const step of steps.slice(start, upTo)) {
    if (step.kind === 'end') {
      done = true
      continue
    }
    if (step.kind === 'chain') {
      rows[step.index] = { number: step.index + 1, card: step.link?.card ?? null, code: step.link?.code ?? 0, mine: step.link?.mine ?? false, ...(step.link?.description ? { description: step.link.description } : {}), ...(step.link?.from === undefined ? {} : { from: step.link.from }), state: 'chained' }
      focus = step.index
      continue
    }
    const row = rows[step.index]

    if (!row) continue
    resolving = true
    focus = step.index
    // Una negada sigue negada al llegarle el turno y al resolverse: el núcleo la niega mientras se resuelve el eslabón que la niega (antes de llegar a ella).
    if ((row.state !== 'negated' && row.state !== 'disabled') || step.kind === 'negated' || step.kind === 'disabled') row.state = step.kind
    if (step.by) row.by = step.by
    if (step.outcome && row.state === 'solved') row.outcome = step.outcome
  }

  return { key: start, rows: rows.filter(Boolean), resolving, done, focus }
}

/** Cuánto se lee cada eslabón al resolverse en una cadena de dos o más. */
export const CHAIN_SOLVE_MS = 1200
/** Cuánto se ve un eslabón que se suma (y una activación suelta al resolverse): breve. */
export const CHAIN_LINK_MS = 700

/**
 * Cuánto queda a la vista el paso `i` antes de mostrar el siguiente: un eslabón que se suma, `CHAIN_LINK_MS` (una activación suelta no se cuenta dos veces: pasa directo a
 * resolverse); uno que se resuelve o se niega, `CHAIN_SOLVE_MS` (suelto, `CHAIN_LINK_MS`); el que terminó de resolverse, llegar a uno ya negado (ya se leyó «Negada») y el
 * final, nada (el siguiente ya lo dice).
 */
export function chainDwell(steps: readonly ChainStep[], i: number): number {
  const step = steps[i]

  if (!step || step.kind === 'solved' || step.kind === 'end') return 0
  const feed = chainFeed(steps, i + 1)
  const size = feed?.rows.length ?? 1

  if (step.kind === 'chain') return size === 1 && steps[i + 1]?.kind === 'solving' ? 0 : CHAIN_LINK_MS
  if (step.kind === 'solving' && feed?.rows[step.index]?.state !== 'solving') return 0

  return size > 1 ? CHAIN_SOLVE_MS : CHAIN_LINK_MS
}

/** Cuántos pasos llegaron hasta la jugada `cursor` de tu mesa (los que se dan por vistos al saltar o al rearmarse). */
export const stepsUpTo = (steps: readonly ChainStep[], cursor: number) => {
  let count = 0

  while (count < steps.length && steps[count]!.at <= cursor) count += 1
  return count
}

/**
 * La frase del texto de la carta que es el efecto de un eslabón, para resaltarla en el detalle (tocar un eslabón de la pila): **sólo si no hay duda**. El núcleo dice qué texto
 * del `.cdb` nombra el efecto (`description`), no qué frase de la carta es; así que vale sólo si ese `desc` es de la carta misma (no uno prestado por otra: un efecto que le dio
 * otra carta, un arte alternativo) y su texto tiene **un solo** efecto que se activa (`effectSentences`). Con dos o más, null: mejor no resaltar nada que resaltar otro efecto.
 */
export function linkPhrase(text: string, code: number, description: string | undefined): TextRange | null {
  if (!description || splitDesc(description).code !== code) return null
  const sentences = effectSentences(text)
  const sentence = sentences.length === 1 ? sentences[0]! : null

  return sentence ? { start: sentence.start, end: sentence.start + sentence.text.length } : null
}

/** Cuánto se queda el aviso después de que la cadena terminó (el celular lo usa para leer cómo quedó cada eslabón: ✓ o ✕). */
export const CHAIN_LINGER_MS = 2500
