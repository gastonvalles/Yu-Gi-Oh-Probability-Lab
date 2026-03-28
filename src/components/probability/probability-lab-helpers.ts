import type {
  CalculationSummary,
  CardEntry,
  HandPattern,
  PatternKind,
  PatternProbability,
} from '../../types'
import { getPatternDefinitionKey } from '../../app/patterns'
import { buildPatternPreview } from './pattern-helpers'

const MAX_VISIBLE_ENTRIES_PER_GROUP = 4

export interface ProbabilityCausalEntry {
  definitionKey: string
  directionLabel: string
  effectLabel: string
  impactLabel: string
  impactSummary: string
  isCore: boolean
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
  patternId: string | null
  probability: number
  sourceLabel: string
  title: string
}

interface ProbabilityEntryCollections {
  openingEntries: ProbabilityCausalEntry[]
  problemEntries: ProbabilityCausalEntry[]
}

interface ProbabilityDeckSummarySnapshot {
  cleanHands: number
  cleanProbability: number
  totalHands: number
}

export function buildProbabilityEntries(
  patterns: HandPattern[],
  summary: CalculationSummary | null,
  derivedMainCards: CardEntry[],
  corePatternKeys: Set<string>,
): ProbabilityEntryCollections {
  const cardById = new Map(derivedMainCards.map((card) => [card.id, card]))
  const resultById = new Map(summary?.patternResults.map((result) => [result.patternId, result]) ?? [])
  const openingEntries: ProbabilityCausalEntry[] = []
  const problemEntries: ProbabilityCausalEntry[] = []

  for (const pattern of patterns) {
    const result = resultById.get(pattern.id) ?? null
    const preview = buildPatternPreview(pattern, cardById)
    const entry = buildProbabilityEntry(
      pattern,
      preview.summary,
      result,
      corePatternKeys.has(getPatternDefinitionKey(pattern)),
    )

    if (entry.kind === 'opening') {
      openingEntries.push(entry)
      continue
    }

    problemEntries.push(entry)
  }

  return {
    openingEntries: selectVisibleEntries(rankProbabilityEntries(openingEntries)),
    problemEntries: selectVisibleEntries(rankProbabilityEntries(problemEntries)),
  }
}

export function buildProbabilityInsights({
  deckSummary,
  openingEntries,
  problemEntries,
}: ProbabilityEntryCollections & {
  deckSummary: ProbabilityDeckSummarySnapshot | null
}): {
  risks: ProbabilityInsight[]
  strengths: ProbabilityInsight[]
} {
  const strengths = finalizeInsights([
    ...buildConsistencyStrengthInsights(deckSummary),
    ...openingEntries.slice(0, 3).map((entry) => buildEntryInsight(entry)),
  ])
  const risks = finalizeInsights([
    ...problemEntries.slice(0, 3).map((entry) => buildEntryInsight(entry)),
    ...buildConsistencyRiskInsights(deckSummary),
  ])

  return { strengths, risks }
}

function buildProbabilityEntry(
  pattern: HandPattern,
  previewSummary: string,
  result: PatternProbability | null,
  isCore: boolean,
): ProbabilityCausalEntry {
  const kind = pattern.kind
  const probability = result?.probability ?? 0
  const possible = result?.possible ?? false
  const name = pattern.name.trim() || (kind === 'opening' ? 'Nueva apertura' : 'Nuevo problema')

  return {
    definitionKey: getPatternDefinitionKey(pattern),
    directionLabel: kind === 'opening' ? 'Suma jugabilidad' : 'Introduce riesgo',
    effectLabel: getEntryEffectLabel(kind, probability),
    impactLabel: '',
    impactSummary: '',
    isCore,
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

    if (left.isCore !== right.isCore) {
      return left.isCore ? -1 : 1
    }

    return left.name.localeCompare(right.name)
  })

  return sortedEntries.map((entry, index) => ({
    ...entry,
    impactLabel: getEntryImpactLabel(entry.kind, entry.isCore, index),
    impactSummary: getEntryImpactSummary(entry.kind, entry.isCore, index),
  }))
}

function selectVisibleEntries(entries: ProbabilityCausalEntry[]): ProbabilityCausalEntry[] {
  const positiveEntries = entries.filter((entry) => entry.possible && entry.probability > 0)

  if (positiveEntries.length === 0) {
    return []
  }

  const visibleEntries: ProbabilityCausalEntry[] = []
  const visibleEntryIds = new Set<string>()

  for (const entry of positiveEntries) {
    if (!entry.isCore) {
      continue
    }

    visibleEntries.push(entry)
    visibleEntryIds.add(entry.patternId)

    if (visibleEntries.length >= MAX_VISIBLE_ENTRIES_PER_GROUP) {
      return visibleEntries
    }
  }

  for (const entry of positiveEntries) {
    if (visibleEntryIds.has(entry.patternId)) {
      continue
    }

    visibleEntries.push(entry)
    visibleEntryIds.add(entry.patternId)

    if (visibleEntries.length >= MAX_VISIBLE_ENTRIES_PER_GROUP) {
      break
    }
  }

  return visibleEntries
}

function buildConsistencyStrengthInsights(
  deckSummary: ProbabilityDeckSummarySnapshot | null,
): ProbabilityInsight[] {
  if (!deckSummary) {
    return []
  }

  if (deckSummary.cleanProbability >= 0.72) {
    return [
      {
        description: `El deck conserva ${formatProbability(deckSummary.cleanProbability)} de manos limpias sobre ${formatInteger(deckSummary.totalHands)} posibles.`,
        emphasis: 'primary',
        kind: 'opening',
        patternId: null,
        probability: deckSummary.cleanProbability,
        sourceLabel: 'KPI principal',
        title: 'Consistencia general alta',
      },
    ]
  }

  if (deckSummary.cleanProbability >= 0.58) {
    return [
      {
        description: `La base del deck sigue sosteniendo ${formatProbability(deckSummary.cleanProbability)} de manos limpias.`,
        emphasis: 'secondary',
        kind: 'opening',
        patternId: null,
        probability: deckSummary.cleanProbability,
        sourceLabel: 'KPI principal',
        title: 'Consistencia general estable',
      },
    ]
  }

  return []
}

function buildConsistencyRiskInsights(
  deckSummary: ProbabilityDeckSummarySnapshot | null,
): ProbabilityInsight[] {
  if (!deckSummary || deckSummary.cleanProbability >= 0.55) {
    return []
  }

  return [
    {
      description: `Solo ${formatProbability(deckSummary.cleanProbability)} de las manos se mantiene limpia; hace falta recortar riesgos o subir aperturas.`,
      emphasis: 'secondary',
      kind: 'problem',
      patternId: null,
      probability: 1 - deckSummary.cleanProbability,
      sourceLabel: 'KPI principal',
      title: 'La consistencia general todavía es frágil',
    },
  ]
}

function buildEntryInsight(entry: ProbabilityCausalEntry): ProbabilityInsight {
  return {
    description: buildInsightDescription(entry),
    emphasis: 'secondary',
    kind: entry.kind,
    patternId: entry.patternId,
    probability: entry.probability,
    sourceLabel: entry.name,
    title: buildInsightTitle(entry),
  }
}

function finalizeInsights(insights: ProbabilityInsight[]): ProbabilityInsight[] {
  const nextInsights: ProbabilityInsight[] = []
  const seenInsightKeys = new Set<string>()

  for (const insight of insights) {
    const key = `${insight.kind}:${normalizeText(insight.title)}`

    if (seenInsightKeys.has(key)) {
      continue
    }

    seenInsightKeys.add(key)
    nextInsights.push(insight)

    if (nextInsights.length >= 3) {
      break
    }
  }

  return nextInsights.map((insight, index) => ({
    ...insight,
    emphasis: index === 0 ? 'primary' : 'secondary',
  }))
}

function buildInsightTitle(entry: ProbabilityCausalEntry): string {
  const normalizedName = normalizeText(entry.name)

  if (entry.kind === 'opening') {
    if (normalizedName.includes('starter + extender')) {
      return 'Starter + Extender aparece con frecuencia'
    }

    if (normalizedName.includes('engine + interaccion')) {
      return 'Buen balance entre engine e interacción'
    }

    if (normalizedName.includes('starter')) {
      return 'Alta probabilidad de abrir Starter'
    }

    return `${entry.name} sostiene la jugabilidad`
  }

  if (normalizedName.includes('sin starter')) {
    return 'Alta probabilidad de manos sin Starter'
  }

  if (normalizedName.includes('brick')) {
    return 'Las manos con demasiados Bricks siguen apareciendo'
  }

  if (normalizedName.includes('non-engine')) {
    return 'Exceso de Non-engine en manos iniciales'
  }

  return `${entry.name} sigue presionando el resultado`
}

function buildInsightDescription(entry: ProbabilityCausalEntry): string {
  if (entry.kind === 'opening') {
    if (entry.isCore) {
      return `${entry.name} aparece en ${formatProbability(entry.probability)} y marca una base sana para el deck.`
    }

    return `${entry.previewSummary} Hoy aparece en ${formatProbability(entry.probability)}.`
  }

  if (entry.isCore) {
    return `${entry.name} aparece en ${formatProbability(entry.probability)} y hoy sí afecta la calidad de las manos.`
  }

  return `${entry.previewSummary} Hoy impacta en ${formatProbability(entry.probability)} de las manos.`
}

function getEntryEffectLabel(kind: PatternKind, probability: number): string {
  if (kind === 'opening') {
    return probability >= 0.25
      ? 'Sostiene una parte importante de las manos jugables.'
      : 'Aporta manos jugables cuando aparece.'
  }

  return probability >= 0.2
    ? 'Está recortando una parte visible de las manos limpias.'
    : 'Sigue apareciendo como riesgo en el análisis.'
}

function getEntryImpactLabel(kind: PatternKind, isCore: boolean, index: number): string {
  if (index === 0) {
    return kind === 'opening' ? 'Fortaleza clave' : 'Riesgo clave'
  }

  if (isCore) {
    return 'Check core'
  }

  if (index === 1) {
    return 'Impacto alto'
  }

  return 'Impacto puntual'
}

function getEntryImpactSummary(kind: PatternKind, isCore: boolean, index: number): string {
  if (index === 0) {
    return kind === 'opening'
      ? 'Es el chequeo positivo que más sostiene el KPI ahora mismo.'
      : 'Es el chequeo negativo que más le resta consistencia al deck.'
  }

  if (isCore) {
    return 'Se mantiene visible porque forma parte de la base universal del análisis.'
  }

  return kind === 'opening'
    ? 'Suma contexto útil sin ensuciar la lectura principal.'
    : 'Marca un foco secundario que todavía conviene vigilar.'
}

function formatProbability(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('es-AR').format(value)
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}
