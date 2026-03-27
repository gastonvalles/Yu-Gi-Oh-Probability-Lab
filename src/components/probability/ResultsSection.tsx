import type { CSSProperties } from 'react'

import { formatInteger, formatPercent } from '../../app/utils'
import type { CalculationOutput, CardEntry, HandPattern, PatternProbability } from '../../types'
import { buildPatternPreview } from './pattern-helpers'

interface DeckSummarySnapshot {
  cleanProbability: number
  cleanHands: number
  totalHands: number
  basedOnActiveRules: boolean
}

interface ResultsSectionProps {
  result: CalculationOutput
  deckSummary: DeckSummarySnapshot | null
  activePatterns: HandPattern[]
  derivedMainCards: CardEntry[]
  handSize: number
  mainDeckCount: number
  activePatternCount: number
  activeViewLabel: string
  hasCompletedRoleStep: boolean
  unclassifiedCardCount: number
  missingOriginCount: number
  missingRoleCount: number
  pendingReviewCount: number
}

const CLEAN_HANDS_TOOLTIP = 'Cumplen al menos una apertura activa y no presentan ningún problema activo.'

export function ResultsSection({
  result,
  deckSummary,
  activePatterns,
  derivedMainCards,
  handSize,
  mainDeckCount,
  activePatternCount,
  activeViewLabel,
  hasCompletedRoleStep,
  unclassifiedCardCount,
  missingOriginCount,
  missingRoleCount,
  pendingReviewCount,
}: ResultsSectionProps) {
  const openingPatterns = sortPatternResults(
    result.summary?.patternResults.filter((pattern) => pattern.kind === 'opening') ?? [],
  )
  const problemPatterns = sortPatternResults(
    result.summary?.patternResults.filter((pattern) => pattern.kind === 'problem') ?? [],
  )
  const isEmptyDeckState = mainDeckCount === 0
  const isPristineProbabilityStep = isEmptyDeckState && activePatternCount === 0
  const isWaitingForRoleStep = !isEmptyDeckState && !hasCompletedRoleStep
  const hasActiveDetails = openingPatterns.length > 0 || problemPatterns.length > 0
  const patternById = new Map(activePatterns.map((pattern) => [pattern.id, pattern]))
  const cardById = new Map(derivedMainCards.map((card) => [card.id, card]))

  return (
    <section className="surface-panel-soft grid min-h-0 gap-3 p-3 min-[1180px]:overflow-y-auto min-[1180px]:pr-1">
      <div className="flex items-end justify-between gap-3">
        <div className="grid gap-0.5">
          <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Resultados</p>
          <h3 className="m-0 text-[1rem] leading-none">Estado del deck</h3>
        </div>
        <span className="surface-card px-2 py-1 text-[0.7rem] text-(--text-muted)">
          {activeViewLabel}
        </span>
      </div>

      {isEmptyDeckState ? (
        <EmptyProbabilityState handSize={handSize} isPristine={isPristineProbabilityStep} />
      ) : isWaitingForRoleStep ? (
        <PendingRoleStepState
          unclassifiedCardCount={unclassifiedCardCount}
          missingOriginCount={missingOriginCount}
          missingRoleCount={missingRoleCount}
          pendingReviewCount={pendingReviewCount}
        />
      ) : (
        <>
          {deckSummary ? <DeckSummaryPanel deckSummary={deckSummary} /> : null}

          {result.issues.length > 0 ? (
            <div className="grid gap-1.5">
              {result.issues.map((issue, index) => (
                <p
                  key={`${issue.level}-${index}`}
                  className={[
                    'm-0 px-2 py-1.5 text-[0.76rem] leading-[1.16]',
                    issue.level === 'error'
                      ? 'surface-card-danger text-[var(--destructive)]'
                      : 'surface-card-warning text-[var(--warning)]',
                  ].join(' ')}
                >
                  <span className="mr-2 inline-block font-bold">{issue.level === 'error' ? 'Error' : 'Aviso'}</span>
                  {issue.message}
                </p>
              ))}
            </div>
          ) : null}

          {!result.summary && result.issues.length === 0 && activePatternCount === 0 ? (
            <p className="surface-card m-0 px-2.5 py-2 text-[0.8rem] text-(--text-muted)">
              Elegí al menos un chequeo en el editor para ver resultados detallados.
            </p>
          ) : !result.summary && result.issues.length === 0 ? (
            <div className="surface-card flex min-h-[100px] flex-col items-center justify-center gap-2 p-4">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[rgb(var(--foreground-rgb)/0.18)] border-t-[var(--primary)]" />
              <p className="m-0 text-[0.8rem] text-[var(--text-muted)]">Calculando probabilidades...</p>
            </div>
          ) : result.summary ? (
            hasActiveDetails ? (
              <div className="grid gap-3 min-[980px]:grid-cols-2 min-[980px]:items-start">
                <PatternResultSection
                  title="OPEN"
                  emptyMessage="No hay aperturas activas."
                  patterns={openingPatterns}
                  patternById={patternById}
                  cardById={cardById}
                />
                <PatternResultSection
                  title="PROB"
                  emptyMessage="No hay problemas activos."
                  patterns={problemPatterns}
                  patternById={patternById}
                  cardById={cardById}
                />
              </div>
            ) : (
              <p className="surface-card m-0 px-2.5 py-2 text-[0.8rem] text-(--text-muted)">
                Elegí al menos un chequeo para ver resultados detallados en este panel.
              </p>
            )
          ) : null}
        </>
      )}
    </section>
  )
}

function DeckSummaryPanel({ deckSummary }: { deckSummary: DeckSummarySnapshot }) {
  return (
    <div
      className="surface-panel-strong grid gap-2.5 px-4 py-3"
      style={getMetricSurfaceStyle(deckSummary.cleanProbability, 'positive')}
    >
      <div className="flex items-start justify-between gap-3 max-[760px]:flex-col max-[760px]:items-stretch">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">KPI principal</p>
            <InfoTooltip content={CLEAN_HANDS_TOOLTIP} />
          </div>
          <h4 className="m-[0.2rem_0_0] text-[1rem] leading-none text-(--text-main)">Jugables sin problemas</h4>
        </div>
        <span className="surface-card px-2 py-1 text-[0.7rem] text-(--text-muted)">
          {deckSummary.basedOnActiveRules ? 'según reglas activas' : 'baseline del deck'}
        </span>
      </div>

      <div className="flex items-end justify-between gap-3 max-[760px]:flex-col max-[760px]:items-start">
        <strong
          className="text-[3rem] leading-none min-[760px]:text-[3.6rem]"
          style={{ color: getMetricValueColor(deckSummary.cleanProbability, 'positive') }}
        >
          {formatPercent(deckSummary.cleanProbability)}
        </strong>
        <p className="app-muted m-0 max-w-[22rem] text-[0.76rem] leading-[1.12] min-[760px]:text-right">
          {formatInteger(deckSummary.cleanHands)} manos limpias sobre {formatInteger(deckSummary.totalHands)} posibles.
        </p>
      </div>
    </div>
  )
}

interface EmptyProbabilityStateProps {
  handSize: number
  isPristine: boolean
}

function EmptyProbabilityState({ handSize, isPristine }: EmptyProbabilityStateProps) {
  return (
    <div className="surface-panel-strong grid gap-2 p-3">
      <div className="grid gap-1">
        <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Antes de medir</p>
        <strong className="text-[0.92rem] leading-none text-(--text-main)">
          {isPristine ? 'Armá el Main Deck primero' : 'Volvé a cargar cartas para medir otra vez'}
        </strong>
        <p className="app-muted m-0 text-[0.78rem] leading-[1.16]">
          Este panel muestra el KPI principal y las reglas activas cuando ya tenés cartas y al menos un chequeo encendido.
        </p>
      </div>
      <p className="surface-card m-0 px-2.5 py-2 text-[0.76rem] text-(--text-muted)">
        La práctica queda disponible como acción secundaria cuando haya al menos {formatInteger(handSize)} cartas.
      </p>
    </div>
  )
}

function PendingRoleStepState({
  unclassifiedCardCount,
  missingOriginCount,
  missingRoleCount,
  pendingReviewCount,
}: {
  unclassifiedCardCount: number
  missingOriginCount: number
  missingRoleCount: number
  pendingReviewCount: number
}) {
  const message =
    missingOriginCount > 0
      ? 'Hay cartas sin clasificar (origen). Revisá el Paso 2.'
      : missingRoleCount > 0
        ? 'Hay cartas sin clasificar (roles). Revisá el Paso 2.'
        : pendingReviewCount > 0
          ? 'Hay cartas pendientes de revisión. Revisá el Paso 2.'
          : `Faltan ${formatInteger(unclassifiedCardCount)} carta${unclassifiedCardCount === 1 ? '' : 's'} por cerrar en el Main Deck.`

  return (
    <div className="surface-panel-strong grid gap-2 p-3">
      <div className="grid gap-1">
        <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Paso 2 pendiente</p>
        <strong className="text-[0.92rem] leading-none text-(--text-main)">
          Terminá de clasificar todas las cartas primero
        </strong>
        <p className="app-muted m-0 text-[0.78rem] leading-[1.16]">{message}</p>
      </div>
    </div>
  )
}

function PatternResultSection({
  title,
  emptyMessage,
  patterns,
  patternById,
  cardById,
}: {
  title: string
  emptyMessage: string
  patterns: PatternProbability[]
  patternById: Map<string, HandPattern>
  cardById: Map<string, CardEntry>
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <small className="app-muted text-[0.68rem] uppercase tracking-[0.18em]">{title}</small>
        <span className="app-chip px-2 py-0.5 text-[0.68rem]">{formatInteger(patterns.length)}</span>
      </div>

      {patterns.length === 0 ? (
        <p className="surface-card m-0 px-2.5 py-2 text-[0.76rem] text-(--text-muted)">
          {emptyMessage}
        </p>
      ) : (
        <div className="grid gap-2">
          {patterns.map((pattern) => (
            <PatternResultCard
              key={pattern.patternId}
              pattern={pattern}
              sourcePattern={patternById.get(pattern.patternId) ?? null}
              cardById={cardById}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PatternResultCard({
  pattern,
  sourcePattern,
  cardById,
}: {
  pattern: PatternProbability
  sourcePattern: HandPattern | null
  cardById: Map<string, CardEntry>
}) {
  const isProblemPattern = pattern.kind === 'problem'
  const sentiment = isProblemPattern ? 'negative' : 'positive'
  const style =
    pattern.probability > 0
      ? isProblemPattern
        ? getSemanticMetricSurfaceStyle('danger')
        : getMetricSurfaceStyle(pattern.probability, sentiment)
      : undefined
  const valueColor = isProblemPattern
    ? getSemanticMetricValueColor('danger')
    : getMetricValueColor(pattern.probability, sentiment)
  const preview = sourcePattern ? buildPatternPreview(sourcePattern, cardById) : null
  const description = preview?.summary ?? pattern.name
  const hoverDetail = preview ? `${preview.logic} ${preview.reuse}`.trim() : pattern.name

  return (
    <article
      className={[
        'grid items-center gap-3 px-3 py-2.5 min-[760px]:grid-cols-[minmax(0,1fr)_auto]',
        pattern.probability > 0 ? 'surface-card' : 'surface-panel-soft',
        pattern.possible ? '' : 'opacity-65',
      ].join(' ')}
      style={style}
      title={hoverDetail}
    >
      <div className="grid min-w-0 gap-1">
        <strong className="truncate text-[0.88rem] text-(--text-main)">{pattern.name}</strong>
        <p className="app-muted m-0 truncate text-[0.74rem] leading-[1.12]">{description}</p>
      </div>
      <strong className="text-[1.12rem] leading-none" style={{ color: valueColor }}>
        {formatPercent(pattern.probability)}
      </strong>
    </article>
  )
}

function InfoTooltip({ content }: { content: string }) {
  return (
    <span className="group/tooltip relative inline-flex items-center">
      <button
        type="button"
        className="app-chip inline-flex h-[1rem] w-[1rem] items-center justify-center px-0 text-[0.62rem] leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary-rgb)/0.28)]"
        aria-label={content}
        title={content}
      >
        i
      </button>
      <span
        role="tooltip"
        className="app-popover pointer-events-none invisible absolute left-0 top-[calc(100%+0.35rem)] z-30 w-[min(18rem,calc(100vw-2.5rem))] p-2 text-[0.72rem] leading-[1.15] text-[var(--text-muted)] opacity-0 transition-[opacity,visibility] duration-150 group-hover/tooltip:visible group-hover/tooltip:opacity-100 group-focus-within/tooltip:visible group-focus-within/tooltip:opacity-100"
      >
        {content}
      </span>
    </span>
  )
}

function sortPatternResults(patterns: PatternProbability[]): PatternProbability[] {
  return [...patterns].sort((left, right) => {
    if (left.possible !== right.possible) {
      return left.possible ? -1 : 1
    }

    if (left.probability !== right.probability) {
      return right.probability - left.probability
    }

    return left.name.localeCompare(right.name)
  })
}

type ProbabilitySentiment = 'positive' | 'negative'
type MetricTone = 'danger'
type RgbColor = readonly [number, number, number]

const PROBABILITY_COLOR_STOPS: ReadonlyArray<{ at: number; color: RgbColor }> = [
  { at: 0, color: [239, 68, 68] },
  { at: 0.35, color: [249, 115, 22] },
  { at: 0.6, color: [250, 204, 21] },
  { at: 0.85, color: [34, 197, 94] },
]

function getMetricSurfaceStyle(probability: number, sentiment: ProbabilitySentiment): CSSProperties {
  const [red, green, blue] = getProbabilityRgb(probability, sentiment)

  return {
    borderColor: `rgba(${red}, ${green}, ${blue}, 0.5)`,
    background: `linear-gradient(180deg, rgba(${red}, ${green}, ${blue}, 0.14), rgb(var(--card-background-rgb) / 0.96))`,
    boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.02), 0 0 0 1px rgba(${red}, ${green}, ${blue}, 0.08)`,
  }
}

function getMetricValueColor(probability: number, sentiment: ProbabilitySentiment): string {
  const [red, green, blue] = getProbabilityRgb(probability, sentiment)
  return `rgb(${red} ${green} ${blue})`
}

function getSemanticMetricSurfaceStyle(tone: MetricTone): CSSProperties {
  const [red, green, blue] = getToneRgb(tone)

  return {
    borderColor: `rgba(${red}, ${green}, ${blue}, 0.5)`,
    background: `linear-gradient(180deg, rgba(${red}, ${green}, ${blue}, 0.14), rgb(var(--card-background-rgb) / 0.96))`,
    boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.02), 0 0 0 1px rgba(${red}, ${green}, ${blue}, 0.08)`,
  }
}

function getSemanticMetricValueColor(tone: MetricTone): string {
  const [red, green, blue] = getToneRgb(tone)
  return `rgb(${red} ${green} ${blue})`
}

function getProbabilityRgb(probability: number, sentiment: ProbabilitySentiment): RgbColor {
  const quality = sentiment === 'positive' ? clampProbability(probability) : 1 - clampProbability(probability)

  for (let index = 1; index < PROBABILITY_COLOR_STOPS.length; index += 1) {
    const previousStop = PROBABILITY_COLOR_STOPS[index - 1]
    const nextStop = PROBABILITY_COLOR_STOPS[index]

    if (quality <= nextStop.at) {
      const span = nextStop.at - previousStop.at || 1
      const progress = (quality - previousStop.at) / span

      return mixRgb(previousStop.color, nextStop.color, progress)
    }
  }

  return PROBABILITY_COLOR_STOPS[PROBABILITY_COLOR_STOPS.length - 1]?.color ?? [34, 197, 94]
}

function getToneRgb(_tone: MetricTone): RgbColor {
  return [239, 68, 68]
}

function mixRgb(startColor: RgbColor, endColor: RgbColor, progress: number): RgbColor {
  const safeProgress = clampProbability(progress)

  return [
    Math.round(startColor[0] + (endColor[0] - startColor[0]) * safeProgress),
    Math.round(startColor[1] + (endColor[1] - startColor[1]) * safeProgress),
    Math.round(startColor[2] + (endColor[2] - startColor[2]) * safeProgress),
  ]
}

function clampProbability(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  if (value <= 0) {
    return 0
  }

  if (value >= 1) {
    return 1
  }

  return value
}
