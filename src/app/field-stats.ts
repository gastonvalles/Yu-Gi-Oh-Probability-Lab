import type { MatState } from './practice-mat'
import type { ApiCardReference } from '../types'

/** El Nivel (★), el Rango (R) o el LINK de un monstruo del campo: su ficha de arriba (`StatTag`) y su nombre. */
export interface StatBadge {
  kind: 'level' | 'rank' | 'link'
  value: number
}

/**
 * El ATK y la DEF de un monstruo del campo, para su etiqueta (`StatTag`) y su nombre. Sin `defense`, un Link; `'?'`, un valor que la carta no tiene impreso. `badge`, su Nivel, Rango o
 * LINK, sólo si se sabe con certeza (`printedBadge`): si no, no va. `printed`, los impresos para comparar (sólo los de ahora, `nowStat`: la etiqueta se pinta si cambiaron). `resting`, la
 * etiqueta de siempre (`fieldStatsOf`): su ficha no se ve en la mesa salvo mientras se elige en su casilla; la de elegir (`pickStatsOf`) la muestra.
 */
export interface PickStat {
  attack: number | '?'
  defense: number | '?' | null
  badge?: StatBadge
  printed?: { attack: number | '?'; defense: number | '?' | null }
  resting?: true
}

/** Los marcos que llevan Nivel (los de YGOPRODeck). Los Pendulum, las fichas y lo que no se reconoce no llevan ficha: callar antes que decir un dato falso. */
const LEVELED = new Set(['normal', 'effect', 'ritual', 'fusion', 'synchro'])
const whole = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0

/** El Nivel, el Rango o el LINK impreso de una carta del catálogo (`level` es el Rango de un Xyz; `linkValue`, el LINK), o null si no se sabe con certeza. */
export function printedBadge(card: ApiCardReference | null | undefined): StatBadge | null {
  if (!card) return null
  const frame = card.frameType.toLowerCase()

  if (frame === 'link') return whole(card.linkValue) ? { kind: 'link', value: card.linkValue } : null
  if (card.linkValue !== null) return null
  if (frame === 'xyz') return whole(card.level) ? { kind: 'rank', value: card.level } : null
  return LEVELED.has(frame) && whole(card.level) ? { kind: 'level', value: card.level } : null
}

/**
 * Lo que el núcleo cuenta de un monstruo (`overlay.stats`): el ATK/DEF de ahora. El núcleo no da el tipo (su nivel es 0 en un Xyz y en un Link), así que la ficha sale de la carta del catálogo
 * (`card`), si se la conoce: el Nivel, el de ahora (el núcleo, si coincide en que tiene); el Rango y el LINK, los impresos (si el núcleo coincide en nivel 0). Sin carta, sin ficha, y nivel 0 y DEF 0
 * es un Link (o un Xyz de DEF 0) y va sin DEF: callar un dato y no decir uno falso. Con la carta, también los impresos (`printed`), para pintar lo que subió o bajó.
 */
export function nowStat(stat: { attack: number; defense: number; level: number } | undefined, card?: ApiCardReference | null): PickStat | null {
  if (!stat) return null
  const print = printedBadge(card)
  const badge = !print ? null : print.kind === 'level' ? (stat.level > 0 ? { kind: 'level' as const, value: stat.level } : null) : stat.level === 0 ? print : null
  const defense = badge ? (badge.kind === 'link' ? null : known(stat.defense)) : stat.level === 0 && stat.defense === 0 ? null : known(stat.defense)
  const base = printedStat(card)

  return { attack: known(stat.attack), defense, ...(badge ? { badge } : {}), ...(base ? { printed: { attack: base.attack, defense: base.defense } } : {}) }
}

/** Cómo cambió un número respecto del impreso: `up`, `down` o null (igual, un «?» o sin impreso con qué comparar). */
export function statShift(now: number | '?' | null, printed: number | '?' | null | undefined): 'up' | 'down' | null {
  if (typeof now !== 'number' || typeof printed !== 'number' || now === printed) return null
  return now > printed ? 'up' : 'down'
}

/** Un valor negativo es el «?» de la carta (el núcleo lo guarda como -2; un catálogo, como -1). */
const known = (value: number): number | '?' => (value >= 0 ? value : '?')
const printed = (value: string | null): number | '?' => (value !== null && value.trim() !== '' && Number.isFinite(Number(value)) ? known(Number(value)) : '?')

/** Los números impresos de una carta (la mesa manual, sin núcleo): sin ATK ni DEF no es un monstruo (o no se sabe) y no lleva; el que falta o es «?», «?»; un Link, sin DEF. */
export function printedStat(card: ApiCardReference | null | undefined): PickStat | null {
  if (!card || (card.atk === null && card.def === null && card.linkValue === null)) return null
  const badge = printedBadge(card)

  return { attack: printed(card.atk), defense: card.linkValue !== null ? null : printed(card.def), ...(badge ? { badge } : {}) }
}

/** Dos etiquetas iguales por valor (la ficha y los impresos también). */
const sameStat = (a: PickStat | undefined, b: PickStat) =>
  a !== undefined && a.attack === b.attack && a.defense === b.defense && a.badge?.kind === b.badge?.kind && a.badge?.value === b.badge?.value && a.printed?.attack === b.printed?.attack && a.printed?.defense === b.printed?.defense

/**
 * La etiqueta de ATK/DEF de siempre, de la mesa automática y de la manual: de los monstruos boca arriba de la fila de monstruos y de las Zonas Extra de `mat`, los que `statOf` conoce
 * (los de ahora, si hay núcleo; los impresos, si no), marcados `resting`. Boca abajo, nada. Si queda igual a `previous` (por valor), devuelve `previous`: la mesa compara sus props por
 * referencia y un mapa nuevo con lo mismo la volvería a dibujar.
 */
export function fieldStatsOf(mat: MatState, statOf: (id: string) => PickStat | null, previous?: ReadonlyMap<string, PickStat>): ReadonlyMap<string, PickStat> {
  const out = new Map<string, PickStat>()

  for (const placed of [...mat.mz, ...mat.emz]) {
    const stat = placed && placed.pos !== 'set' ? statOf(placed.id) : null

    if (stat) out.set(placed!.id, stat.resting ? stat : { ...stat, resting: true })
  }
  if (previous && previous.size === out.size && [...out].every(([id, stat]) => sameStat(previous.get(id), stat))) return previous
  return out
}

/** Sin monstruos con números: el mismo objeto siempre. */
export const NO_FIELD_STATS: ReadonlyMap<string, PickStat> = new Map()
