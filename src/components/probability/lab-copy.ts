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

/** Qué conviene atacar primero según cómo fallan las manos. */
export function buildFailureAdvice(result: LabViewResult): string {
  const failing = result.noOpeningProbability + result.blockedOpeningProbability

  if (failing < 0.05) {
    return 'Casi no hay manos que fallen: el deck está muy afinado para tus reglas.'
  }

  if (result.noOpeningProbability >= result.blockedOpeningProbability * 2) {
    return 'La mayoría de las manos que fallan no tienen salida: sumar starters o extenders tiene más impacto.'
  }

  if (result.blockedOpeningProbability >= result.noOpeningProbability * 2) {
    return 'La mayoría de las manos que fallan tienen salida pero un problema las frena: reducir bricks o dependencias rinde más.'
  }

  return 'Las fallas se reparten entre manos sin salida y manos frenadas por problemas.'
}
