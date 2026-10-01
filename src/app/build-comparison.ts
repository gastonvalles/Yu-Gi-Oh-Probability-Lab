import type { CardEntry, HandPattern, PatternKind, TurnContext, TurnView } from '../types'
import { curatePatterns } from './pattern-curation'
import { buildActiveRuleSet, buildPatternPresets, type SystemRuleNames } from './pattern-presets'
import { computeLabResults, type LabResults } from './probability-lab'
import { buildRoleDistributions, type RoleDistribution } from './role-distribution'

/** Diferencias de manos limpias por debajo de esto se consideran empate (0.5 pp). */
export const EQUIVALENT_GAP = 0.005

const TURN_VIEWS: readonly TurnView[] = ['first', 'second', 'average']

export interface ComparisonBuildInput {
  name: string
  cards: CardEntry[]
}

export interface ComparisonRules {
  patterns: HandPattern[]
  disabledGenericRuleIds: readonly string[]
  /** Nombres propios de las reglas universales. */
  systemRuleNames?: SystemRuleNames
  handSize: number
}

export interface BuildMetrics {
  name: string
  deckSize: number
  /** Mismo cálculo que el Lab (1º, 2º y promedio). null si no se pudo calcular. */
  results: LabResults | null
  blockedReasons: string[]
  /** Cartas sin origen, sin rol o pendientes de revisión: el resultado puede no ser fiel. */
  pendingCards: CardEntry[]
  roles: { first: RoleDistribution[]; second: RoleDistribution[] }
}

export interface CardDiff {
  cardId: string
  name: string
  copiesA: number
  copiesB: number
  /** Copias de B menos copias de A. */
  delta: number
}

export interface RuleComparisonRow {
  id: string
  name: string
  kind: PatternKind
  turnContext: TurnContext
  isSystem: boolean
  a: number | null
  b: number | null
  delta: number | null
  /** La regla pide una carta que esa build no tiene: ahí no puede cumplirse. */
  missingCardsIn: Array<'A' | 'B'>
}

export type CleanComparison = Record<TurnView, { a: number; b: number; delta: number }>

export type VerdictKind = 'incomplete' | 'identical' | 'equivalent' | 'a' | 'b' | 'split'

export interface ComparisonVerdict {
  kind: VerdictKind
  title: string
  detail: string
}

export interface BuildComparison {
  a: BuildMetrics
  b: BuildMetrics
  cardDiffs: CardDiff[]
  rules: RuleComparisonRow[]
  clean: CleanComparison | null
  verdict: ComparisonVerdict
}

export function isCardPendingClassification(card: Pick<CardEntry, 'origin' | 'roles' | 'needsReview'>): boolean {
  return card.origin === null || card.roles.length === 0 || card.needsReview
}

/** Compara dos builds con el mismo motor, las mismas reglas y el mismo tamaño de mano que el Lab. */
export function compareBuilds(
  a: ComparisonBuildInput,
  b: ComparisonBuildInput,
  rules: ComparisonRules,
): BuildComparison {
  const activeA = buildActiveRules(a.cards, rules)
  const activeB = buildActiveRules(b.cards, rules)
  const metricsA = buildMetrics(a, activeA, rules.handSize)
  const metricsB = buildMetrics(b, activeB, rules.handSize)
  const clean = buildCleanComparison(metricsA.results, metricsB.results)
  const cardDiffs = computeCardDiffs(a.cards, b.cards)

  return {
    a: metricsA,
    b: metricsB,
    cardDiffs,
    rules: compareRules(a.cards, rules, activeA, activeB, metricsA.results, metricsB.results),
    clean,
    // Con la letra, el veredicto se entiende aunque las dos builds se llamen igual.
    verdict: buildVerdict(`A (${a.name})`, `B (${b.name})`, clean, cardDiffs.length === 0),
  }
}

function buildActiveRules(cards: CardEntry[], rules: ComparisonRules): HandPattern[] {
  // Una regla que pide una carta ausente queda afuera: en esa build no puede cumplirse.
  return buildActiveRuleSet(cards, curatePatterns(rules.patterns, cards), rules.disabledGenericRuleIds, rules.systemRuleNames)
}

function buildMetrics(build: ComparisonBuildInput, activeRules: HandPattern[], handSize: number): BuildMetrics {
  const deckSize = build.cards.reduce((total, card) => total + card.copies, 0)
  const computation = deckSize >= handSize + 1 ? computeLabResults(build.cards, activeRules, handSize) : null

  return {
    name: build.name,
    deckSize,
    results: computation?.status === 'ok' ? computation.results : null,
    blockedReasons:
      computation === null
        ? [`El Main Deck necesita al menos ${handSize + 1} cartas.`]
        : computation.status === 'blocked'
          ? computation.issues.map((issue) => issue.message)
          : [],
    pendingCards: build.cards.filter(isCardPendingClassification),
    roles: {
      first: buildRoleDistributions(build.cards, [handSize]),
      second: buildRoleDistributions(build.cards, [handSize + 1]),
    },
  }
}

function buildCleanComparison(a: LabResults | null, b: LabResults | null): CleanComparison | null {
  if (!a || !b) {
    return null
  }

  return Object.fromEntries(
    TURN_VIEWS.map((view) => {
      const valueA = a[view].cleanProbability
      const valueB = b[view].cleanProbability
      return [view, { a: valueA, b: valueB, delta: valueB - valueA }]
    }),
  ) as CleanComparison
}

export function computeCardDiffs(cardsA: CardEntry[], cardsB: CardEntry[]): CardDiff[] {
  const byId = new Map<string, CardDiff>()

  for (const card of cardsA) {
    byId.set(card.id, { cardId: card.id, name: card.name, copiesA: card.copies, copiesB: 0, delta: 0 })
  }

  for (const card of cardsB) {
    const current = byId.get(card.id)
    byId.set(card.id, { cardId: card.id, name: card.name, copiesA: current?.copiesA ?? 0, copiesB: card.copies, delta: 0 })
  }

  return [...byId.values()]
    .map((diff) => ({ ...diff, delta: diff.copiesB - diff.copiesA }))
    .filter((diff) => diff.delta !== 0)
    .sort((left, right) => right.delta - left.delta || left.name.localeCompare(right.name))
}

function compareRules(
  cardsA: CardEntry[],
  rules: ComparisonRules,
  activeA: HandPattern[],
  activeB: HandPattern[],
  resultsA: LabResults | null,
  resultsB: LabResults | null,
): RuleComparisonRow[] {
  const disabled = new Set(rules.disabledGenericRuleIds)
  const systemRows = buildPatternPresets(cardsA, rules.systemRuleNames)
    .filter((preset) => preset.tier === 'universal' || !disabled.has(preset.id))
    .map((preset) => ({ id: preset.pattern.id, name: preset.title, kind: preset.kind, turnContext: preset.pattern.turnContext, isSystem: true }))
  const customRows = rules.patterns
    .filter((pattern) => !pattern.needsReview && pattern.conditions.some((condition) => condition.matcher !== null))
    .map((pattern) => ({
      id: pattern.id,
      name: pattern.name.trim() || (pattern.kind === 'opening' ? 'Salida sin nombre' : 'Problema sin nombre'),
      kind: pattern.kind,
      turnContext: pattern.turnContext,
      isSystem: false,
    }))
  const activeIdsA = new Set(activeA.map((pattern) => pattern.id))
  const activeIdsB = new Set(activeB.map((pattern) => pattern.id))
  const valueOf = (results: LabResults | null, id: string) =>
    results?.average.patternResults.find((result) => result.patternId === id)?.probability ?? null

  return [...systemRows, ...customRows].flatMap((row) => {
    const inA = activeIdsA.has(row.id)
    const inB = activeIdsB.has(row.id)

    // Reglas propias idénticas a una del sistema no suman: se omiten para no duplicar filas.
    if (!row.isSystem && !inA && !inB && isDuplicateOfSystem(row.id, rules.patterns, activeA)) {
      return []
    }

    const a = inA ? valueOf(resultsA, row.id) : resultsA ? 0 : null
    const b = inB ? valueOf(resultsB, row.id) : resultsB ? 0 : null

    return [
      {
        ...row,
        a,
        b,
        delta: a !== null && b !== null ? b - a : null,
        missingCardsIn: [...(!row.isSystem && !inA ? (['A'] as const) : []), ...(!row.isSystem && !inB ? (['B'] as const) : [])],
      },
    ]
  })
}

function isDuplicateOfSystem(id: string, patterns: HandPattern[], active: HandPattern[]): boolean {
  const pattern = patterns.find((candidate) => candidate.id === id)
  return pattern !== undefined && active.some((candidate) => candidate.id.startsWith('system-') && sameDefinition(candidate, pattern))
}

function sameDefinition(left: HandPattern, right: HandPattern): boolean {
  const strip = (pattern: HandPattern) =>
    JSON.stringify({ kind: pattern.kind, turnContext: pattern.turnContext, logic: pattern.logic, conditions: pattern.conditions.map(({ matcher, quantity, kind }) => ({ matcher, quantity, kind })) })
  return strip(left) === strip(right)
}

function formatPoints(delta: number): string {
  return `${(Math.abs(delta) * 100).toFixed(1)} pp`
}

export function buildVerdict(
  nameA: string,
  nameB: string,
  clean: CleanComparison | null,
  sameCards: boolean,
): ComparisonVerdict {
  if (!clean) {
    return {
      kind: 'incomplete',
      title: 'Falta información para comparar',
      detail: 'Revisá que las dos builds tengan Main Deck completo y cartas clasificadas.',
    }
  }

  if (sameCards) {
    return { kind: 'identical', title: 'Las dos builds son iguales', detail: 'Tienen exactamente las mismas cartas en el Main Deck.' }
  }

  const { first, second, average } = clean
  const favors = (delta: number) => (delta >= EQUIVALENT_GAP ? 'b' : delta <= -EQUIVALENT_GAP ? 'a' : null)
  const firstSide = favors(first.delta)
  const secondSide = favors(second.delta)

  if (firstSide && secondSide && firstSide !== secondSide) {
    const firstName = firstSide === 'a' ? nameA : nameB
    const secondName = secondSide === 'a' ? nameA : nameB
    return {
      kind: 'split',
      title: 'Depende del turno',
      detail: `${firstName} abre mejor yendo 1º (${formatPoints(first.delta)}) y ${secondName} yendo 2º (${formatPoints(second.delta)}).`,
    }
  }

  const averageSide = favors(average.delta)

  if (!averageSide) {
    return {
      kind: 'equivalent',
      title: 'Prácticamente iguales',
      detail: `La diferencia de manos limpias es de ${formatPoints(average.delta)}: con tus reglas rinden lo mismo.`,
    }
  }

  const winner = averageSide === 'a' ? nameA : nameB
  return {
    kind: averageSide,
    title: `${winner} es más consistente`,
    detail: `Abre limpia ${formatPoints(average.delta)} más seguido en promedio (1º ${formatPoints(first.delta)}, 2º ${formatPoints(second.delta)}).`,
  }
}
