import { t } from '../i18n'
import type { CardEntry, HandPattern, PatternKind, TurnContext, TurnView } from '../types'
import { curatePatterns } from './pattern-curation'
import { buildActiveRuleSet, buildPatternPresets, type SystemRuleNames } from './pattern-presets'
import type { LabComputationInput } from './lab-computation-client'
import { computeLabResults, type LabComputation, type LabResults } from './probability-lab'
import { buildRoleDistributions, type RoleDistribution } from './role-distribution'

/** Diferencias de manos limpias por debajo de esto se consideran empate (0.5 pp). */
const EQUIVALENT_GAP = 0.005

const TURN_VIEWS: readonly TurnView[] = ['first', 'second', 'average']

interface ComparisonBuildInput {
  name: string
  cards: CardEntry[]
}

interface ComparisonRules {
  patterns: HandPattern[]
  disabledGenericRuleIds: readonly string[]
  /** Nombres propios de las reglas universales. */
  systemRuleNames?: SystemRuleNames
  handSize: number
}

export interface BuildMetrics {
  name: string
  deckSize: number
  /** Mismo cálculo que el Lab (1º, 2º y promedio). null si no se pudo calcular (o todavía se está calculando). */
  results: LabResults | null
  /** El cálculo está en curso en los workers: todavía no hay resultado ni motivo de bloqueo. */
  isComputing: boolean
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

/** Cuántas manos cumplen algo, de cuántas hay en total (cuentas exactas del motor: sólo existen yendo 1º o 2º, no en el promedio). */
export interface HandCount {
  hands: number
  total: number
}

/** Yendo 2º el motor pondera las manos (la carta robada no cuenta para todas las reglas) y la cuenta puede traer decimales: una cantidad de manos se muestra entera. */
const handCount = (hands: number, total: number): HandCount => ({ hands: Math.round(hands), total })

/** Una regla en un turno concreto de una build: su probabilidad y las manos que la cumplen. */
export interface RuleTurnValue {
  probability: number
  counts: HandCount
}

export type RuleTurn = 'first' | 'second'

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
  /** Lo mismo por turno; null donde la regla no se evalúa (p. ej. una de "Solo 1º" yendo 2º) o no hay cálculo. */
  turns: Record<RuleTurn, { a: RuleTurnValue | null; b: RuleTurnValue | null }>
}

export type CleanComparison = Record<TurnView, { a: number; b: number; delta: number; countsA: HandCount | null; countsB: HandCount | null }>

type VerdictKind = 'computing' | 'incomplete' | 'identical' | 'equivalent' | 'a' | 'b' | 'split'

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

/** Resultado del Lab de cada build; `undefined` = todavía en curso (se calcula en workers, ver `buildComparisonInputs`). */
interface ComparisonComputations {
  a: LabComputation | null | undefined
  b: LabComputation | null | undefined
}

/**
 * Entradas del Lab de cada build (null si el deck es muy chico para calcular): se piden a los workers
 * y el resultado se le pasa a `compareBuilds`, que así no enumera manos en el hilo principal.
 */
export function buildComparisonInputs(
  a: ComparisonBuildInput,
  b: ComparisonBuildInput,
  rules: ComparisonRules,
): { a: LabComputationInput | null; b: LabComputationInput | null } {
  const inputOf = (build: ComparisonBuildInput): LabComputationInput | null =>
    deckSizeOf(build) >= rules.handSize + 1 ? { cards: build.cards, patterns: buildActiveRules(build.cards, rules), handSize: rules.handSize } : null

  return { a: inputOf(a), b: inputOf(b) }
}

/**
 * Compara dos builds con el mismo motor, las mismas reglas y el mismo tamaño de mano que el Lab.
 * Sin `computations` calcula acá mismo (sincrónico); con ellas usa lo que ya calcularon los workers.
 */
export function compareBuilds(
  a: ComparisonBuildInput,
  b: ComparisonBuildInput,
  rules: ComparisonRules,
  computations?: ComparisonComputations,
): BuildComparison {
  const activeA = buildActiveRules(a.cards, rules)
  const activeB = buildActiveRules(b.cards, rules)
  const metricsA = buildMetrics(a, rules.handSize, computations ? computations.a : computeIfPossible(a, activeA, rules.handSize))
  const metricsB = buildMetrics(b, rules.handSize, computations ? computations.b : computeIfPossible(b, activeB, rules.handSize))
  const clean = buildCleanComparison(metricsA.results, metricsB.results)
  const cardDiffs = computeCardDiffs(a.cards, b.cards)
  const isComputing = metricsA.isComputing || metricsB.isComputing

  return {
    a: metricsA,
    b: metricsB,
    cardDiffs,
    rules: compareRules(a.cards, rules, activeA, activeB, metricsA.results, metricsB.results),
    clean,
    verdict: isComputing
      ? { kind: 'computing', title: t('meta.compare.verdict.computing.title'), detail: t('meta.compare.verdict.computing.detail') }
      : buildVerdict(a.name, b.name, clean, cardDiffs.length === 0),
  }
}

function deckSizeOf(build: ComparisonBuildInput): number {
  return build.cards.reduce((total, card) => total + card.copies, 0)
}

function computeIfPossible(build: ComparisonBuildInput, activeRules: HandPattern[], handSize: number): LabComputation | null {
  return deckSizeOf(build) >= handSize + 1 ? computeLabResults(build.cards, activeRules, handSize) : null
}

function buildActiveRules(cards: CardEntry[], rules: ComparisonRules): HandPattern[] {
  // Una regla que pide una carta ausente queda afuera: en esa build no puede cumplirse.
  return buildActiveRuleSet(cards, curatePatterns(rules.patterns, cards), rules.disabledGenericRuleIds, rules.systemRuleNames)
}

function buildMetrics(
  build: ComparisonBuildInput,
  handSize: number,
  computation: LabComputation | null | undefined,
): BuildMetrics {
  const deckSize = deckSizeOf(build)
  const tooSmall = deckSize < handSize + 1
  const isComputing = !tooSmall && computation === undefined

  return {
    name: build.name,
    deckSize,
    results: computation?.status === 'ok' ? computation.results : null,
    isComputing,
    blockedReasons: tooSmall
      ? [t('meta.compare.blocked.deckTooSmall', { size: handSize + 1 })]
      : computation?.status === 'blocked'
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
      return [view, { a: valueA, b: valueB, delta: valueB - valueA, countsA: cleanCounts(a[view]), countsB: cleanCounts(b[view]) }]
    }),
  ) as CleanComparison
}

function cleanCounts(view: LabResults[TurnView]): HandCount | null {
  return view.cleanHands !== null && view.totalHands !== null ? handCount(view.cleanHands, view.totalHands) : null
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
      name: pattern.name.trim() || t(pattern.kind === 'opening' ? 'meta.compare.rule.unnamedOpening' : 'meta.compare.rule.unnamedProblem'),
      kind: pattern.kind,
      turnContext: pattern.turnContext,
      isSystem: false,
    }))
  const activeIdsA = new Set(activeA.map((pattern) => pattern.id))
  const activeIdsB = new Set(activeB.map((pattern) => pattern.id))
  const valueOf = (results: LabResults | null, id: string) =>
    results?.average.patternResults.find((result) => result.patternId === id)?.probability ?? null
  // Una regla que esa build no evalúa vale 0 de todas las manos; una que no aplica a ese turno no tiene valor.
  const turnValue = (results: LabResults | null, turn: RuleTurn, id: string, active: boolean): RuleTurnValue | null => {
    const view = results?.[turn]

    if (!view || view.totalHands === null) {
      return null
    }

    const found = view.patternResults.find((result) => result.patternId === id)

    return active
      ? found
        ? { probability: found.probability, counts: handCount(found.matchingHands, view.totalHands) }
        : null
      : { probability: 0, counts: handCount(0, view.totalHands) }
  }

  return [...systemRows, ...customRows].flatMap((row) => {
    const inA = activeIdsA.has(row.id)
    const inB = activeIdsB.has(row.id)

    // Reglas propias idénticas a una del sistema no suman: se omiten para no duplicar filas.
    if (!row.isSystem && !inA && !inB && isDuplicateOfSystem(row.id, rules.patterns, activeA)) {
      return []
    }

    // Una regla que ninguna build evalúa (apagada o con cartas que faltan en las dos) no está en el Lab: no se lista.
    if (!inA && !inB) {
      return []
    }

    const a = inA ? valueOf(resultsA, row.id) : resultsA ? 0 : null
    const b = inB ? valueOf(resultsB, row.id) : resultsB ? 0 : null

    // 0 % en las dos no dice nada de la comparación.
    if ((a ?? 0) === 0 && (b ?? 0) === 0) {
      return []
    }

    return [
      {
        ...row,
        a,
        b,
        delta: a !== null && b !== null ? b - a : null,
        missingCardsIn: [...(!row.isSystem && !inA ? (['A'] as const) : []), ...(!row.isSystem && !inB ? (['B'] as const) : [])],
        turns: {
          first: { a: turnValue(resultsA, 'first', row.id, inA), b: turnValue(resultsB, 'first', row.id, inB) },
          second: { a: turnValue(resultsA, 'second', row.id, inA), b: turnValue(resultsB, 'second', row.id, inB) },
        },
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

/** Veredicto en una frase: las cifras están en la tabla, acá sólo qué build conviene (por su nombre; si se llaman igual, con la letra). */
export function buildVerdict(nameA: string, nameB: string, clean: CleanComparison | null, sameCards: boolean): ComparisonVerdict {
  const sameName = nameA.trim() === nameB.trim()
  const labelA = sameName ? `${nameA} (A)` : nameA
  const labelB = sameName ? `${nameB} (B)` : nameB

  if (!clean) {
    return {
      kind: 'incomplete',
      title: t('meta.compare.verdict.incomplete.title'),
      detail: t('meta.compare.verdict.incomplete.detail'),
    }
  }

  if (sameCards) {
    return { kind: 'identical', title: t('meta.compare.verdict.identical.title'), detail: t('meta.compare.verdict.identical.detail') }
  }

  const { first, second, average } = clean
  const favors = (delta: number) => (delta >= EQUIVALENT_GAP ? 'b' : delta <= -EQUIVALENT_GAP ? 'a' : null)
  const firstSide = favors(first.delta)
  const secondSide = favors(second.delta)

  if (firstSide && secondSide && firstSide !== secondSide) {
    return {
      kind: 'split',
      title: t('meta.compare.verdict.split.title'),
      detail: t('meta.compare.verdict.split.detail', {
        first: firstSide === 'a' ? labelA : labelB,
        second: secondSide === 'a' ? labelA : labelB,
      }),
    }
  }

  const averageSide = favors(average.delta)

  if (!averageSide) {
    return {
      kind: 'equivalent',
      title: t('meta.compare.verdict.equivalent.title'),
      detail: t('meta.compare.verdict.equivalent.detail'),
    }
  }

  return {
    kind: averageSide,
    title: t('meta.compare.verdict.better.title', { name: averageSide === 'a' ? labelA : labelB }),
    detail: t('meta.compare.verdict.better.detail'),
  }
}
