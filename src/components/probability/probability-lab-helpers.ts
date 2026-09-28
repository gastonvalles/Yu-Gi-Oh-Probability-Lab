import type {
  HandPattern,
  PatternKind,
  PatternProbability,
  TurnContext,
} from '../../types'
import type { PatternPreset } from '../../app/pattern-presets'
import {
  getPatternDefinitionKey,
  normalizePatternName,
} from '../../app/patterns'
import type { CardEntry } from '../../types'
import { formatPercent } from '../../app/utils'
import { buildPatternPreview } from './pattern-helpers'

export interface ProbabilityCausalEntry {
  definitionKey: string
  description: string
  id: string
  isCore: boolean
  kind: PatternKind
  name: string
  patternId: string
  possible: boolean
  probability: number
  presetId: string | null
  technicalSubtitle: string
  turnContext: TurnContext
}

export interface RuleEntries {
  openings: ProbabilityCausalEntry[]
  problems: ProbabilityCausalEntry[]
}

export interface KpiContextualLabel {
  label: string
  tone: 'excellent' | 'good' | 'improvable' | 'critical'
}

export function getKpiContextualLabel(probability: number): KpiContextualLabel {
  const clamped = Math.max(0, Math.min(1, probability))

  if (clamped >= 0.85) {
    return {
      label: 'Excelente — tu deck abre consistentemente',
      tone: 'excellent',
    }
  }

  if (clamped >= 0.60) {
    return {
      label: 'Bueno — la mayoría de las manos juegan',
      tone: 'good',
    }
  }

  if (clamped >= 0.40) {
    return {
      label: 'Mejorable — muchas manos no arrancan bien',
      tone: 'improvable',
    }
  }

  return {
    label: 'Crítico — el deck necesita ajustes urgentes',
    tone: 'critical',
  }
}

export function isDescriptionRedundant(entry: ProbabilityCausalEntry): boolean {
  const normalizedName = entry.name.toLowerCase().trim()
  const normalizedDescription = entry.description.toLowerCase().trim()
  const formattedProbability = formatPercent(entry.probability).toLowerCase()

  return (
    normalizedDescription.includes(normalizedName) ||
    normalizedDescription.includes(formattedProbability)
  )
}

export function isTechnicalSubtitleRedundant(entry: ProbabilityCausalEntry): boolean {
  const subtitle = entry.technicalSubtitle.toLowerCase().trim()

  if (subtitle === '') {
    return true
  }

  const name = entry.name.toLowerCase().trim()
  const description = entry.description.toLowerCase().trim()

  return subtitle === name || subtitle === description || description.includes(subtitle)
}

const OPENING_PRIORITY_BY_PRESET_ID: Record<string, number> = {
  starter_opening: 0,
  starter_extender_opening: 1,
  starter_protection_opening: 2,
}

export function buildDeterministicCheckSet(patterns: HandPattern[]): HandPattern[] {
  const seenIds = new Set<string>()
  const seenDefinitionKeys = new Set<string>()

  return [...patterns]
    .sort(comparePatternsDeterministically)
    .filter((pattern) => {
      const definitionKey = getPatternDefinitionKey(pattern)
      const isDuplicate =
        seenIds.has(pattern.id) ||
        seenDefinitionKeys.has(definitionKey)

      if (isDuplicate) {
        return false
      }

      seenIds.add(pattern.id)
      seenDefinitionKeys.add(definitionKey)
      return true
    })
}

export function buildRuleEntries({
  allChecks,
  availablePresets,
  derivedMainCards,
  patternResults,
}: {
  allChecks: HandPattern[]
  availablePresets: PatternPreset[]
  derivedMainCards: CardEntry[]
  patternResults: PatternProbability[]
}): RuleEntries {
  const cardById = new Map(derivedMainCards.map((card) => [card.id, card]))
  const presetByDefinitionKey = new Map(
    availablePresets.map((preset) => [getPatternDefinitionKey(preset.pattern), preset]),
  )
  const resultById = new Map(patternResults.map((result) => [result.patternId, result]))
  const entries = allChecks.map((pattern) => {
    const preset = presetByDefinitionKey.get(getPatternDefinitionKey(pattern)) ?? null
    const preview = buildPatternPreview(pattern, cardById)

    return buildProbabilityEntry(pattern, preview.summary, resultById.get(pattern.id) ?? null, preset)
  })

  return {
    openings: rankProbabilityEntries(entries.filter((entry) => entry.kind === 'opening')),
    problems: rankProbabilityEntries(entries.filter((entry) => entry.kind === 'problem')),
  }
}

function buildProbabilityEntry(
  pattern: HandPattern,
  previewSummary: string,
  result: PatternProbability | null,
  preset: PatternPreset | null,
): ProbabilityCausalEntry {
  const kind = pattern.kind
  const probability = result?.probability ?? 0
  const possible = result?.possible ?? false
  const fallbackName = kind === 'opening' ? 'Nueva salida' : 'Nuevo problema'
  const trimmedName = pattern.name.trim()
  const name = preset?.title ?? (trimmedName || fallbackName)

  return {
    definitionKey: getPatternDefinitionKey(pattern),
    description:
      preset?.describeProbability(probability) ??
      buildDefaultEntryDescription(kind, name, probability),
    id: preset ? `preset:${preset.id}` : `pattern:${pattern.id}`,
    isCore: preset?.recommended === true,
    kind,
    name,
    patternId: pattern.id,
    possible,
    probability,
    presetId: preset?.id ?? null,
    technicalSubtitle: preset?.technicalSubtitle ?? previewSummary,
    turnContext: pattern.turnContext,
  }
}

function rankProbabilityEntries(entries: ProbabilityCausalEntry[]): ProbabilityCausalEntry[] {
  return [...entries].sort((left, right) => {
    if (left.kind === 'opening' && right.kind === 'opening') {
      const leftPriority = getOpeningPriority(left)
      const rightPriority = getOpeningPriority(right)

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority
      }
    }

    if (left.probability !== right.probability) {
      return right.probability - left.probability
    }

    if (left.isCore !== right.isCore) {
      return left.isCore ? -1 : 1
    }

    return left.name.localeCompare(right.name)
  })
}

function buildDefaultEntryDescription(
  kind: PatternKind,
  name: string,
  probability: number,
): string {
  if (kind === 'opening') {
    return `${name} aparece en ${formatProbability(probability)} de las manos.`
  }

  return `El problema ${name} aparece en ${formatProbability(probability)} de las manos.`
}

function formatProbability(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

function getOpeningPriority(entry: ProbabilityCausalEntry): number {
  if (!entry.presetId) {
    return Number.MAX_SAFE_INTEGER
  }

  return OPENING_PRIORITY_BY_PRESET_ID[entry.presetId] ?? Number.MAX_SAFE_INTEGER
}

function comparePatternsDeterministically(left: HandPattern, right: HandPattern): number {
  const kindComparison = compareKinds(left.kind, right.kind)

  if (kindComparison !== 0) {
    return kindComparison
  }

  const leftName = normalizePatternName(left.name)
  const rightName = normalizePatternName(right.name)

  if (leftName !== rightName) {
    return leftName.localeCompare(rightName)
  }

  return getPatternDefinitionKey(left).localeCompare(getPatternDefinitionKey(right))
}

function compareKinds(left: PatternKind, right: PatternKind): number {
  if (left === right) {
    return 0
  }

  return left === 'opening' ? -1 : 1
}
