import type { MatState } from './practice-mat'
import type { ApiCardReference } from '../types'

/** El ATK y la DEF de un monstruo del campo, para su etiqueta (`StatTag`) y su nombre. Sin `defense`, un Link; `'?'`, un valor que la carta no tiene impreso. */
export interface PickStat {
  attack: number | '?'
  defense: number | '?' | null
}

/** Lo que el núcleo cuenta de un monstruo (`overlay.stats`): el ATK/DEF de ahora. No da el tipo: nivel 0 y DEF 0 es un Link (o un Xyz de DEF 0) y va sin DEF, que es callar un dato y no decir uno falso. */
export const nowStat = (stat: { attack: number; defense: number; level: number } | undefined): PickStat | null =>
  stat ? { attack: known(stat.attack), defense: stat.level === 0 && stat.defense === 0 ? null : known(stat.defense) } : null

/** Un valor negativo es el «?» de la carta (el núcleo lo guarda como -2; un catálogo, como -1). */
const known = (value: number): number | '?' => (value >= 0 ? value : '?')
const printed = (value: string | null): number | '?' => (value !== null && value.trim() !== '' && Number.isFinite(Number(value)) ? known(Number(value)) : '?')

/** Los números impresos de una carta (la mesa manual, sin núcleo): sin ATK ni DEF no es un monstruo (o no se sabe) y no lleva; el que falta o es «?», «?»; un Link, sin DEF. */
export function printedStat(card: ApiCardReference | null | undefined): PickStat | null {
  if (!card || (card.atk === null && card.def === null && card.linkValue === null)) return null
  return { attack: printed(card.atk), defense: card.linkValue !== null ? null : printed(card.def) }
}

const sameStat = (a: PickStat | undefined, b: PickStat) => a !== undefined && a.attack === b.attack && a.defense === b.defense

/**
 * La etiqueta de ATK/DEF de siempre, de la mesa automática y de la manual: de los monstruos boca arriba de la fila de monstruos y de las Zonas Extra de `mat`, los que `statOf` conoce
 * (los de ahora, si hay núcleo; los impresos, si no). Boca abajo, nada. Si queda igual a `previous` (por valor), devuelve `previous`: la mesa compara sus props por referencia y un
 * mapa nuevo con lo mismo la volvería a dibujar.
 */
export function fieldStatsOf(mat: MatState, statOf: (id: string) => PickStat | null, previous?: ReadonlyMap<string, PickStat>): ReadonlyMap<string, PickStat> {
  const out = new Map<string, PickStat>()

  for (const placed of [...mat.mz, ...mat.emz]) {
    const stat = placed && placed.pos !== 'set' ? statOf(placed.id) : null

    if (stat) out.set(placed!.id, stat)
  }
  if (previous && previous.size === out.size && [...out].every(([id, stat]) => sameStat(previous.get(id), stat))) return previous
  return out
}

/** Sin monstruos con números: el mismo objeto siempre. */
export const NO_FIELD_STATS: ReadonlyMap<string, PickStat> = new Map()
