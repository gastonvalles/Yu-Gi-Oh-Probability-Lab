import { useEffect, useState } from 'react'

import { normalizeHandPatternCategory } from '../../app/patterns'
import type { CalculationOutput, PatternProbability } from '../../types'
import { formatInteger, formatPercent } from '../../app/utils'

interface ResultsSectionProps {
  result: CalculationOutput
  handSize: number
}

export function ResultsSection({ result, handSize }: ResultsSectionProps) {
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
        <div className="flex items-start justify-between gap-2.5 max-[760px]:flex-col max-[760px]:items-stretch">
          <div>
            <p className="app-kicker m-0 mb-0.5 text-[0.68rem] uppercase tracking-widest">Resultados</p>
            <h3 className="m-0 text-[0.98rem] leading-none">Probabilidad exacta</h3>
          </div>
        </div>

        {result.issues.length > 0 ? (
          <div className="grid gap-1.5">
            {result.issues.map((issue, index) => (
              <p
                key={`${issue.level}-${index}`}
                className={[
                  'm-0 px-2 py-1.5 text-[0.76rem] leading-[1.16]',
                  issue.level === 'error' ? 'surface-card text-[#ff9e9e]' : 'surface-card-accent text-[#f2d077]',
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
            <div className="sticky top-0 z-20 grid gap-1.5 bg-[var(--bg-panel)] pb-2 shadow-[0_10px_18px_rgba(6,5,10,0.9)]">
              <div className="surface-card-accent flex min-h-[98px] flex-wrap items-end justify-between gap-3 px-3 py-1.75">
                <div className="min-w-0">
                  <p className="app-muted m-0 text-[0.78rem] uppercase tracking-[0.08em]">Jugables limpias</p>
                  <p
                    className="m-[0.22rem_0_0] text-[1.88rem] leading-none min-[760px]:text-[2.16rem]"
                    style={{ color: getProbabilityColor(cleanProbability) }}
                  >
                    {formatPercent(cleanProbability)}
                  </p>
                </div>

                <p className="app-muted m-0 whitespace-nowrap text-[0.76rem] leading-[1.12] min-[760px]:text-right">
                  {formatInteger(cleanHands)} manos limpias sobre {formatInteger(result.summary.totalHands)} posibles.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-1.5 min-[760px]:grid-cols-3 min-[1120px]:grid-cols-6">
                <MiniMetric label="Jugables con problemas" value={formatPercent(result.summary.overlapProbability)} />
                <MiniMetric label="Malas" value={formatPercent(badOnlyProbability)} />
                <MiniMetric label="Neutras" value={formatPercent(result.summary.neutralProbability)} />
                <MiniMetric label="Mano inicial" value={formatInteger(handSize)} />
                <MiniMetric label="Cartas relevantes" value={formatInteger(result.summary.relevantCardCount)} />
                <MiniMetric label="Otras cartas" value={formatInteger(result.summary.otherCopies)} />
              </div>
            </div>

            {hasOpeningPatterns || hasProblemPatterns ? (
              <div className="mt-3 grid gap-1.5">
                <div className="flex items-start justify-between gap-2 max-[760px]:flex-col max-[760px]:items-stretch">
                  <div>
                    <p className="app-kicker m-0 mb-0.5 text-[0.68rem] uppercase tracking-widest">Detalle</p>
                    <h4 className="m-0 text-[0.9rem] leading-none">
                      {activeDetailTab === 'bad' && hasProblemPatterns
                        ? 'Qué tan seguido aparecen tus problemas'
                        : 'Qué tan seguido salen tus aperturas'}
                    </h4>
                    <p className="app-muted m-[0.25rem_0_0] text-[0.74rem] leading-[1.14]">
                      La app revisa todas las manos posibles de 5 cartas y mide en cuántas aparece cada apertura o cada problema por separado.
                    </p>
                  </div>

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

            <p className="app-muted m-0 text-[0.72rem] leading-[1.14]">
              Una misma mano puede activar una apertura y un problema al mismo tiempo. En ese caso se cuenta como jugable con problemas.
            </p>
          </>
        )}
      </div>
    </section>
  )
}

interface MiniMetricProps {
  label: string
  value: string
}

function MiniMetric({ label, value }: MiniMetricProps) {
  return (
    <div className="surface-card px-1.5 py-1 min-[760px]:px-2 min-[760px]:py-1.25">
      <small className="app-muted block text-[0.62rem] uppercase tracking-[0.08em] min-[760px]:text-[0.68rem]">
        {label}
      </small>
      <strong className="text-[0.78rem] text-[var(--text-main)] min-[760px]:text-[0.84rem]">
        {value}
      </strong>
    </div>
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

      {patterns.map((pattern, index) => (
        <article
          key={pattern.patternId}
          className={[
            'grid items-center gap-2 px-2 py-1.5 min-[760px]:grid-cols-[auto_minmax(0,1fr)_auto]',
            pattern.probability > 0 ? getPatternResultCardClass(pattern.category) : 'surface-panel-soft',
            pattern.possible ? '' : 'opacity-65',
          ].join(' ')}
        >
          <div className="app-chip-accent grid h-5 w-5 place-items-center text-[0.7rem]">
            {index + 1}
          </div>
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
          <p className="m-0 text-[0.82rem] text-[#f0f0f0]">{formatPercent(pattern.probability)}</p>
        </article>
      ))}
    </div>
  )
}

function getPatternResultCardClass(category: PatternProbability['category']): string {
  return normalizeHandPatternCategory(category) === 'good'
    ? 'surface-card border border-[rgba(69,211,111,0.48)] shadow-[0_0_0_1px_rgba(69,211,111,0.08)]'
    : 'surface-card border border-[rgba(139,13,24,0.52)] shadow-[0_0_0_1px_rgba(139,13,24,0.08)]'
}

function getProbabilityColor(probability: number): string {
  const percentage = probability * 100

  if (percentage > 70) {
    return '#45d36f'
  }

  if (percentage >= 40) {
    return '#f2d35d'
  }

  if (percentage > 20) {
    return '#ff9736'
  }

  return '#8b0d18'
}
