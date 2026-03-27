import type {
  CalculationSummary,
  CardEntry,
  HandPattern,
  PatternKind,
  PatternProbability,
} from '../../types'
import { buildPatternPreview } from './pattern-helpers'

export interface ProbabilityCausalEntry {
  directionLabel: string
  effectLabel: string
  impactLabel: string
  impactSummary: string
  kind: PatternKind
  name: string
  patternId: string
  possible: boolean
  previewSummary: string
  probability: number
}

export interface ProbabilityInsight {
  description: string
  emphasis: 'primary' | 'secondary'
  kind: PatternKind
  patternId: string
  probability: number
  sourceLabel: string
  title: string
}

interface ProbabilityEntryCollections {
  openingEntries: ProbabilityCausalEntry[]
  problemEntries: ProbabilityCausalEntry[]
}

export function buildProbabilityEntries(
  patterns: HandPattern[],
  summary: CalculationSummary | null,
  derivedMainCards: CardEntry[],
): ProbabilityEntryCollections {
  const cardById = new Map(derivedMainCards.map((card) => [card.id, card]))
  const resultById = new Map(summary?.patternResults.map((result) => [result.patternId, result]) ?? [])
  const openingEntries: ProbabilityCausalEntry[] = []
  const problemEntries: ProbabilityCausalEntry[] = []

  for (const pattern of patterns) {
    const result = resultById.get(pattern.id) ?? null
    const preview = buildPatternPreview(pattern, cardById)
    const entry = buildProbabilityEntry(pattern, preview.summary, result)

    if (entry.kind === 'opening') {
      openingEntries.push(entry)
      continue
    }

    problemEntries.push(entry)
  }

  return {
    openingEntries: rankProbabilityEntries(openingEntries),
    problemEntries: rankProbabilityEntries(problemEntries),
  }
}

export function buildProbabilityInsights({
  openingEntries,
  problemEntries,
}: ProbabilityEntryCollections): {
  risks: ProbabilityInsight[]
  strengths: ProbabilityInsight[]
} {
  return {
    strengths: openingEntries
      .filter((entry) => entry.possible)
      .slice(0, 3)
      .map((entry, index) => ({
        description: entry.previewSummary,
        emphasis: index === 0 ? 'primary' : 'secondary',
        kind: entry.kind,
        patternId: entry.patternId,
        probability: entry.probability,
        sourceLabel: entry.name,
        title:
          index === 0
            ? `Tu apertura más consistente es ${entry.name}`
            : `${entry.name} sigue sosteniendo la jugabilidad`,
      })),
    risks: problemEntries
      .filter((entry) => entry.possible)
      .slice(0, 3)
      .map((entry, index) => ({
        description: entry.previewSummary,
        emphasis: index === 0 ? 'primary' : 'secondary',
        kind: entry.kind,
        patternId: entry.patternId,
        probability: entry.probability,
        sourceLabel: entry.name,
        title:
          index === 0
            ? `El mayor riesgo actual es ${entry.name}`
            : `${entry.name} sigue presionando el resultado`,
      })),
  }
}

function buildProbabilityEntry(
  pattern: HandPattern,
  previewSummary: string,
  result: PatternProbability | null,
): ProbabilityCausalEntry {
  const kind = pattern.kind
  const probability = result?.probability ?? 0
  const possible = result?.possible ?? false
  const name = pattern.name.trim() || (kind === 'opening' ? 'Nueva apertura' : 'Nuevo problema')

  return {
    directionLabel: kind === 'opening' ? 'Suma jugabilidad' : 'Introduce riesgo',
    effectLabel: getEntryEffectLabel(kind, probability, possible),
    impactLabel: '',
    impactSummary: '',
    kind,
    name,
    patternId: pattern.id,
    possible,
    previewSummary,
    probability,
  }
}

function rankProbabilityEntries(entries: ProbabilityCausalEntry[]): ProbabilityCausalEntry[] {
  const sortedEntries = [...entries].sort((left, right) => {
    if (left.possible !== right.possible) {
      return left.possible ? -1 : 1
    }

    if (left.probability !== right.probability) {
      return right.probability - left.probability
    }

    return left.name.localeCompare(right.name)
  })

  return sortedEntries.map((entry, index) => ({
    ...entry,
    impactLabel: getEntryImpactLabel(entry.kind, entry.possible, index),
    impactSummary: getEntryImpactSummary(entry.kind, entry.possible, index),
  }))
}

function getEntryEffectLabel(kind: PatternKind, probability: number, possible: boolean): string {
  if (!possible || probability <= 0) {
    return kind === 'opening'
      ? 'No está sosteniendo manos limpias con el deck actual.'
      : 'No está apareciendo como problema con el deck actual.'
  }

  return kind === 'opening'
    ? 'Empuja manos jugables cuando aparece.'
    : 'Resta manos limpias cuando aparece.'
}

function getEntryImpactLabel(kind: PatternKind, possible: boolean, index: number): string {
  if (!possible) {
    return 'Sin impacto hoy'
  }

  if (index === 0) {
    return kind === 'opening' ? 'Mayor fortaleza' : 'Mayor riesgo'
  }

  if (index === 1) {
    return 'Impacto alto'
  }

  if (index === 2) {
    return 'Impacto medio'
  }

  return 'Impacto bajo'
}

function getEntryImpactSummary(kind: PatternKind, possible: boolean, index: number): string {
  if (!possible) {
    return kind === 'opening'
      ? 'Este chequeo hoy no cambia el panorama del deck.'
      : 'Este riesgo hoy no está presionando el resultado.'
  }

  if (kind === 'opening') {
    if (index === 0) {
      return 'Es la apertura activa que más sostiene el KPI.'
    }

    if (index === 1) {
      return 'Sigue empujando bastante la jugabilidad.'
    }

    return 'Aporta contexto, aunque pesa menos en el resultado.'
  }

  if (index === 0) {
    return 'Es el problema activo que más le resta manos limpias al deck.'
  }

  if (index === 1) {
    return 'Sigue siendo un riesgo visible en el análisis.'
  }

  return 'Aporta contexto, aunque hoy pesa menos que otros riesgos.'
}
