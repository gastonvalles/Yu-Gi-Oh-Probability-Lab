import { formatInteger, formatShortPercent } from '../../app/utils'
import { t } from '../../i18n'
import type { PatternKind } from '../../types'
import type { Tone } from '../ui/tone'

type KpiTone = 'excellent' | 'good' | 'improvable' | 'critical'

// Umbrales de la nota (Crítico, Mejorable, Sólido, Excelente).
export const KPI_THRESHOLDS: ReadonlyArray<{ value: number; tone: KpiTone }> = [
  { value: 0.4, tone: 'improvable' },
  { value: 0.6, tone: 'good' },
  { value: 0.85, tone: 'excellent' },
]

/** Nombre de cada nota: los getters arman el texto al leerlo, en el idioma de ese momento (el módulo no llama a `t()` al evaluarse). */
export const KPI_TONE_LABELS: Record<KpiTone, string> = {
  get excellent() {
    return t('lab.kpi.excellent')
  },
  get good() {
    return t('lab.kpi.good')
  },
  get improvable() {
    return t('lab.kpi.improvable')
  },
  get critical() {
    return t('lab.kpi.critical')
  },
}

/** Color de cada nota: rojo → ámbar → verde (Sólido y Excelente, los dos verdes: el ámbar es de lo elegido y de lo que está a medio hacer). El color siempre dice lo mismo en toda la app. */
export const KPI_TONE: Record<KpiTone, Tone> = {
  excellent: 'success',
  good: 'success',
  improvable: 'warning',
  critical: 'danger',
}

export function getKpiTone(probability: number): KpiTone {
  return [...KPI_THRESHOLDS].reverse().find((threshold) => probability >= threshold.value)?.tone ?? 'critical'
}

/**
 * "Pasa en 1 de cada x manos (p%)"; si pasa en más de la mitad, "x de cada 10" (1 de cada 1 no tiene sentido).
 * `plural`: el sujeto son varios ("Manos sin ninguna salida") y el verbo concuerda ("Pasan en…").
 */
export function formatOdds(probability: number, withPercent = true, plural = false): string {
  const percent = formatShortPercent(probability)
  const tail = withPercent ? ` (${percent})` : ''
  // `count` elige la forma del verbo: una (regla) o varias (manos).
  const count = plural ? 2 : 1

  if (probability >= 0.995) {
    return t('lab.odds.almostAll', { count, tail })
  }

  if (probability > 0.5) {
    return t('lab.odds.most', { count, outOf: Math.min(9, Math.max(6, Math.round(probability * 10))), tail })
  }

  return t('lab.odds.few', { count, hands: formatInteger(Math.max(2, Math.round(1 / probability))), tail })
}

/** "Salida" / "Problema": cómo se llama cada tipo de regla. */
export function kindLabel(kind: PatternKind): string {
  return t(kind === 'opening' ? 'lab.kind.opening' : 'lab.kind.problem')
}

/** El turno dicho dentro de una frase ("más yendo 1º"). */
export function turnWord(turn: 'first' | 'second'): string {
  return t(turn === 'first' ? 'lab.turn.first' : 'lab.turn.second')
}

/** "5 cartas": la cantidad con su plural (el número va formateado). */
export function formatCardCount(count: number): string {
  return t('lab.cards', { count, n: formatInteger(count) })
}
