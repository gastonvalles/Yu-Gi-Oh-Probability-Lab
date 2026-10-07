import { formatInteger, formatShortPercent } from '../../app/utils'
import type { TurnView } from '../../types'
import type { LabViewResult } from '../../app/probability-lab'

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

export function buildVerdict(tone: KpiTone, view: TurnView): string {
  const context = view === 'first' ? ' yendo primero' : view === 'second' ? ' yendo segundo' : ''

  if (tone === 'excellent') return `El deck abre de forma muy confiable${context}.`
  if (tone === 'good') return `El deck es estable${context}, con margen para pulir.`
  if (tone === 'improvable') return `Muchas manos no arrancan bien${context}.`
  return `El plan inicial todavía no es confiable${context}.`
}

/** Qué conviene mirar primero según cómo se reparten las manos que no son limpias. */
export function buildFailureAdvice(result: LabViewResult): string {
  const notClean = result.noOpeningProbability + result.withProblemProbability

  if (notClean < 0.05) {
    return 'Casi todas las manos son limpias: el deck está muy afinado para tus reglas.'
  }

  if (result.noOpeningProbability >= result.withProblemProbability * 2) {
    return 'La mayoría de las manos que no son limpias no tienen salida: sumar starters o extenders tiene más impacto.'
  }

  if (result.withProblemProbability >= result.noOpeningProbability * 2) {
    return 'La mayoría tiene salida pero también un problema. Revisá cuáles pesan más (pasá el mouse o tocá "Con problema"): quizás alguno no te impide jugar y conviene apagarlo o ajustarlo.'
  }

  return 'Se reparten entre manos sin salida y manos con salida pero con algún problema.'
}

/** "Pasa en 1 de cada x manos (p%)"; si pasa en más de la mitad, "x de cada 10" (1 de cada 1 no tiene sentido). */
export function formatOdds(probability: number): string {
  const percent = formatShortPercent(probability)

  if (probability >= 0.995) {
    return `Pasa en casi todas las manos (${percent}).`
  }

  if (probability > 0.5) {
    return `Pasa en ${Math.min(9, Math.max(6, Math.round(probability * 10)))} de cada 10 manos (${percent}).`
  }

  return `Pasa en 1 de cada ${formatInteger(Math.max(2, Math.round(1 / probability)))} manos (${percent}).`
}
