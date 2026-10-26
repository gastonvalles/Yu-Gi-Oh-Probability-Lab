import { effectSentences, type TextRange } from '../card-text'
import type { CardRef, ChainLink } from './adapter'
import { splitDesc } from './protocol'

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
  /** El eslabón (0 = CL1); en `end`, -1. */
  index: number
  /** Sólo `chain`: la carta que se activó, si es tuya y el `desc` del efecto (`aux.Stringid(carta, n)`: qué texto del `.cdb` lo nombra; ver `linkPhrase`). */
  link?: { card: CardRef | null; code: number; mine: boolean; description?: string }
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
  state: ChainRowState
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
      rows[step.index] = { number: step.index + 1, card: step.link?.card ?? null, code: step.link?.code ?? 0, mine: step.link?.mine ?? false, ...(step.link?.description ? { description: step.link.description } : {}), state: 'chained' }
      focus = step.index
      continue
    }
    const row = rows[step.index]

    if (!row) continue
    resolving = true
    focus = step.index
    // Una negada sigue negada al llegarle el turno y al resolverse: el núcleo la niega mientras se resuelve el eslabón que la niega (antes de llegar a ella).
    if ((row.state !== 'negated' && row.state !== 'disabled') || step.kind === 'negated' || step.kind === 'disabled') row.state = step.kind
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

  return sentences.length === 1 ? { start: sentences[0]!.start, end: sentences[0]!.start + sentences[0]!.text.length } : null
}

/** Cuánto se queda el aviso plegado después de que la cadena terminó. */
export const CHAIN_LINGER_MS = 1500
