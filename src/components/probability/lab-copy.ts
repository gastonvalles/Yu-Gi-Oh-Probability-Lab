import { formatInteger, formatShortPercent } from '../../app/utils'
import type { TurnView } from '../../types'
import type { Tone } from '../ui/tone'

export type KpiTone = 'excellent' | 'good' | 'improvable' | 'critical'

// Umbrales de la nota: se dibujan también como marcas en el medidor.
export const KPI_THRESHOLDS: ReadonlyArray<{ value: number; tone: KpiTone }> = [
  { value: 0.4, tone: 'improvable' },
  { value: 0.6, tone: 'good' },
  { value: 0.85, tone: 'excellent' },
]

export const KPI_TONE_LABELS: Record<KpiTone, string> = {
  excellent: 'Excelente',
  good: 'Sólido',
  improvable: 'Mejorable',
  critical: 'Crítico',
}

const percentLabel = (value: number) => `${Math.round(value * 100)}%`

/** Escala completa de notas con su rango (leyenda del medidor): "< 40%", "40–60%", "60–85%", "85%+". */
export const KPI_SCALE: ReadonlyArray<{ tone: KpiTone; range: string }> = [
  { tone: 'critical', range: `< ${percentLabel(KPI_THRESHOLDS[0]!.value)}` },
  ...KPI_THRESHOLDS.map((threshold, index) => {
    const next = KPI_THRESHOLDS[index + 1]

    return { tone: threshold.tone, range: next ? `${Math.round(threshold.value * 100)}–${percentLabel(next.value)}` : `${percentLabel(threshold.value)}+` }
  }),
]

/** Color de cada nota: rojo → ámbar → celeste → verde. El color siempre dice lo mismo en toda la app. */
export const KPI_TONE: Record<KpiTone, Tone> = {
  excellent: 'success',
  good: 'info',
  improvable: 'warning',
  critical: 'danger',
}

export const TURN_VIEW_LABELS: Record<TurnView, string> = {
  first: 'Yendo primero',
  second: 'Yendo segundo',
  average: 'Promedio',
}

export function getKpiTone(probability: number): KpiTone {
  return [...KPI_THRESHOLDS].reverse().find((threshold) => probability >= threshold.value)?.tone ?? 'critical'
}

/** "6 de cada 10 manos": más fácil de leer que un porcentaje con decimales. */
export function buildHandsOutOfTen(probability: number): string {
  const outOfTen = Math.round(probability * 10)
  return `${outOfTen} de cada 10 manos abren limpias`
}

/** "Pasa en 1 de cada x manos (p%)"; si pasa en más de la mitad, "x de cada 10" (1 de cada 1 no tiene sentido). */
export function formatOdds(probability: number, withPercent = true): string {
  const percent = formatShortPercent(probability)
  const tail = withPercent ? ` (${percent})` : ''

  if (probability >= 0.995) {
    return `Pasa en casi todas las manos${tail}.`
  }

  if (probability > 0.5) {
    return `Pasa en ${Math.min(9, Math.max(6, Math.round(probability * 10)))} de cada 10 manos${tail}.`
  }

  return `Pasa en 1 de cada ${formatInteger(Math.max(2, Math.round(1 / probability)))} manos${tail}.`
}
