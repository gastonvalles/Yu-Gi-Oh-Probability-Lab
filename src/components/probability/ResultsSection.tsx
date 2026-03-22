import { useEffect, useState, type CSSProperties } from 'react'

import { normalizeHandPatternCategory } from '../../app/patterns'
import type { CalculationOutput, PatternProbability } from '../../types'
import { formatInteger, formatPercent } from '../../app/utils'

interface ResultsSectionProps {
  result: CalculationOutput
}

const CLEAN_HANDS_TOOLTIP = 'Cumplen al menos una apertura y no presentan ningún problema.'

export function ResultsSection({ result }: ResultsSectionProps) {
  const openingPatterns =
    result.summary?.patternResults.filter((pattern) => normalizeHandPatternCategory(pattern.category) === 'good') ?? []
  const problemPatterns =
    result.summary?.patternResults.filter((pattern) => normalizeHandPatternCategory(pattern.category) === 'bad') ?? []
  const [activeDetailTab, setActiveDetailTab] = useState<'good' | 'bad'>('good')
  const cleanHands = result.summary ? Math.max(0, result.summary.goodHands - result.summary.overlapHands) : 0
  const cleanProbability = result.summary && result.summary.totalHands > 0 ? cleanHands / result.summary.totalHands : 0
  const badOnlyHands = result.summary ? Math.max(0, result.summary.badHands - result.summary.overlapHands) : 0
  const badOnlyProbability = result.summary && result.summary.totalHands > 0 ? badOnlyHands / result.summary.totalHands : 0
  const hasOpeningPatterns = openingPatterns.length > 0
  const hasProblemPatterns = problemPatterns.length > 0

  useEffect(() => {
    if (activeDetailTab === 'good' && !hasOpeningPatterns && hasProblemPatterns) {
      setActiveDetailTab('bad')
      return
    }

    if (activeDetailTab === 'bad' && !hasProblemPatterns && hasOpeningPatterns) {
      setActiveDetailTab('good')
    }
  }, [activeDetailTab, hasOpeningPatterns, hasProblemPatterns])

  return (
    <section className="surface-panel-soft min-h-0 p-2.5 min-[1180px]:overflow-y-auto min-[1180px]:pr-1">
      <div className="grid gap-2">
        <h3 className="m-0 text-[0.98rem] leading-none">Probabilidad exacta</h3>

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

        {!result.summary ? (
          <div className="surface-card p-2 text-[0.8rem] text-[var(--text-muted)]">
            Ajustá el Main Deck y definí al menos una apertura o un problema para obtener la probabilidad exacta.
          </div>
        ) : (
          <>
            <div className="sticky top-0 z-20 grid gap-1.5 bg-[var(--bg-panel)] pb-2 shadow-[0_10px_18px_rgb(var(--background-rgb)/0.9)]">
              <div
                className="surface-card flex min-h-[98px] flex-wrap items-end justify-between gap-3 px-3 py-1.75"
                style={getMetricSurfaceStyle(cleanProbability, 'positive')}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="app-muted m-0 text-[0.78rem] uppercase tracking-[0.08em]">Jugables sin problemas</p>
                    <InfoTooltip content={CLEAN_HANDS_TOOLTIP} />
                  </div>
                  <p
                    className="m-[0.22rem_0_0] text-[1.88rem] leading-none min-[760px]:text-[2.16rem]"
                    style={{ color: getMetricValueColor(cleanProbability, 'positive') }}
                  >
                    {formatPercent(cleanProbability)}
                  </p>
                </div>

                <p className="app-muted m-0 max-w-[16rem] text-[0.76rem] leading-[1.12] min-[760px]:text-right">
                  {formatInteger(cleanHands)} manos jugables sin problemas sobre {formatInteger(result.summary.totalHands)} posibles.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <MiniMetric
                  label="Jugables con problemas"
                  value={formatPercent(result.summary.overlapProbability)}
                  probability={result.summary.overlapProbability}
                  tone="warning"
                />
                <MiniMetric
                  label="Malas"
                  value={formatPercent(badOnlyProbability)}
                  probability={badOnlyProbability}
                  tone="danger"
                />
              </div>
            </div>

            {hasOpeningPatterns || hasProblemPatterns ? (
              <div className="mt-3 grid gap-1.5">
                <div className="flex items-center justify-between gap-2 max-[760px]:flex-col max-[760px]:items-stretch">
                  <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Detalle</p>

                  {hasOpeningPatterns && hasProblemPatterns ? (
                    <div className="app-tab-strip justify-end max-[760px]:justify-start">
                      <button
                        type="button"
                        className={[
                          'app-tab text-[0.8rem]',
                          activeDetailTab === 'good' ? 'app-tab-active' : '',
                        ].join(' ')}
                        onClick={() => setActiveDetailTab('good')}
                      >
                        Aperturas
                      </button>
                      <button
                        type="button"
                        className={[
                          'app-tab text-[0.8rem]',
                          activeDetailTab === 'bad' ? 'app-tab-active' : '',
                        ].join(' ')}
                        onClick={() => setActiveDetailTab('bad')}
                      >
                        Problemas
                      </button>
                    </div>
                  ) : null}
                </div>

                <PatternResultSection
                  patterns={
                    activeDetailTab === 'bad' && hasProblemPatterns
                      ? problemPatterns
                      : openingPatterns
                  }
                  compactHeader
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}

interface MiniMetricProps {
  label: string
  value: string
  probability: number
  sentiment?: ProbabilitySentiment
  tone?: MetricTone
}

function MiniMetric({ label, value, probability, sentiment = 'positive', tone }: MiniMetricProps) {
  const style = tone ? getSemanticMetricSurfaceStyle(tone) : getMetricSurfaceStyle(probability, sentiment)
  const color = tone ? getSemanticMetricValueColor(tone) : getMetricValueColor(probability, sentiment)

  return (
    <div
      className="surface-card px-1.5 py-1 min-[760px]:px-2 min-[760px]:py-1.25"
      style={style}
    >
      <small className="app-muted block text-[0.62rem] uppercase tracking-[0.08em] min-[760px]:text-[0.68rem]">
        {label}
      </small>
      <strong
        className="text-[0.78rem] min-[760px]:text-[0.84rem]"
        style={{ color }}
      >
        {value}
      </strong>
    </div>
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

interface PatternResultSectionProps {
  patterns: PatternProbability[]
  compactHeader?: boolean
}

function PatternResultSection({ patterns, compactHeader = false }: PatternResultSectionProps) {
  return (
    <div className="grid gap-1.5">
      {compactHeader ? null : (
        <div>
          <p className="app-kicker m-0 mb-0.5 text-[0.68rem] uppercase tracking-widest">Detalle</p>
        </div>
      )}

      {patterns.map((pattern) => (
        <PatternResultCard key={pattern.patternId} pattern={pattern} />
      ))}
    </div>
  )
}

interface PatternResultCardProps {
  pattern: PatternProbability
}

function PatternResultCard({ pattern }: PatternResultCardProps) {
  const isProblemPattern = normalizeHandPatternCategory(pattern.category) === 'bad'
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

  return (
    <article
      className={[
        'grid items-center gap-2 px-2 py-1.5 min-[760px]:grid-cols-[minmax(0,1fr)_auto]',
        pattern.probability > 0 ? 'surface-card' : 'surface-panel-soft',
        pattern.possible ? '' : 'opacity-65',
      ].join(' ')}
      style={style}
    >
      <div className="grid min-w-0 gap-0.5">
        <div className="flex items-center gap-2">
          <strong>{pattern.name}</strong>
          {pattern.possible ? null : (
            <span className="app-chip px-1.5 py-0.5 text-[0.64rem]">
              Imposible
            </span>
          )}
        </div>
        <p className="app-muted m-0 text-[0.74rem] leading-[1.12]">{pattern.requirementLabel}</p>
        <small className="app-muted text-[0.68rem] leading-[1.12]">
          {formatInteger(pattern.matchingHands)} manos que cumplen esta regla.
        </small>
      </div>
      <p
        className="m-0 text-[0.82rem]"
        style={{ color: valueColor }}
      >
        {formatPercent(pattern.probability)}
      </p>
    </article>
  )
}

type ProbabilitySentiment = 'positive' | 'negative'

type MetricTone = 'warning' | 'danger'

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

function getToneRgb(tone: MetricTone): RgbColor {
  return tone === 'warning' ? [250, 204, 21] : [239, 68, 68]
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
