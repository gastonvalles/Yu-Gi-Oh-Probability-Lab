import { t } from '../i18n'
import { activeScales, isForeignId, isToken, type MatCardKind, type MatState } from './practice-mat'

/**
 * El rango de la Invocación de Péndulo en la mesa manual: los niveles entre las dos escalas activas, sin contarlas (escalas 1 y 8: del 2 al 7). Con escalas iguales o contiguas
 * queda vacío (`low > high`). Sin las dos escalas, o con una sin dato (un deck guardado antes de que se guardara `scale`), no hay rango: nunca un número inventado. La escala 0 vale.
 * La mesa no frena por esto (un efecto puede cambiar el rango): lo dice.
 */
export interface PendulumRange {
  low: number
  high: number
}

export function pendulumRange(scales: readonly (number | null | undefined)[]): PendulumRange | null {
  const [a, b] = scales

  if (scales.length !== 2 || a == null || b == null) return null

  return { low: Math.min(a, b) + 1, high: Math.max(a, b) - 1 }
}

/** Si un nivel entra en el rango; `unknown` sin rango o sin nivel (un Xyz o un Link, una carta sin dato): se puede elegir y no se marca. */
export type RangeFit = 'in' | 'out' | 'unknown'

export function rangeFit(range: PendulumRange | null, level: number | null | undefined): RangeFit {
  if (!range || level == null) return 'unknown'

  return level >= range.low && level <= range.high ? 'in' : 'out'
}

/** El rango en palabras: «Niveles 2 a 7», «Nivel 3», «Ningún nivel (escalas 4 y 5)» o «Sin rango». */
export function describeRange(range: PendulumRange | null): string {
  if (!range) return t('practice.pendulum.noRange')
  if (range.low > range.high) return t('practice.pendulum.rangeEmpty', { a: range.low - 1, b: range.high + 1 })

  return range.low === range.high ? t('practice.pendulum.rangeOne', { level: range.low }) : t('practice.pendulum.range', { low: range.low, high: range.high })
}

/** El rango de la mesa: el de sus dos escalas activas (`activeScales`), con la escala de cada una (`scaleOf`; `null` si la carta no la trae). */
export function matPendulumRange(state: MatState, kindOf: (id: string) => MatCardKind, scaleOf: (id: string) => number | null | undefined): PendulumRange | null {
  return pendulumRange(activeScales(state, kindOf).map((scale) => scaleOf(scale.id)))
}

/** El nivel con el que se mira el rango: el de un monstruo de nivel (un Xyz tiene Rango y un Link, ninguno: sin dato). */
export function pendulumLevel(kind: MatCardKind): number | null {
  return kind.monster && !kind.xyz && !kind.link ? kind.level : null
}

/** Lo que se puede elegir para invocar por Péndulo: los monstruos de la mano (no los del Extra Deck) y los boca arriba del Extra, en ese orden. */
export function pendulumCandidates(state: MatState, kindOf: (id: string) => MatCardKind): { id: string; from: 'hand' | 'extra' }[] {
  const mine = (id: string) => !isToken(id) && !isForeignId(id) && kindOf(id).monster

  return [
    ...state.hand.filter((id) => mine(id) && !kindOf(id).extra).map((id) => ({ id, from: 'hand' as const })),
    ...state.extraUp.filter((id) => mine(id) && state.extra.includes(id)).map((id) => ({ id, from: 'extra' as const })),
  ]
}
