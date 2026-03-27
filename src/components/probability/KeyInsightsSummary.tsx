import { formatPercent } from '../../app/utils'
import type { ProbabilityInsight } from './probability-lab-helpers'

interface KeyInsightsSummaryProps {
  highlightedPatternId: string | null
  onHighlightPattern: (patternId: string | null) => void
  risks: ProbabilityInsight[]
  strengths: ProbabilityInsight[]
}

export function KeyInsightsSummary({
  highlightedPatternId,
  onHighlightPattern,
  risks,
  strengths,
}: KeyInsightsSummaryProps) {
  return (
    <section className="grid gap-3">
      <div className="grid gap-0.5">
        <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Que esta pasando</p>
        <h3 className="m-0 text-[1rem] leading-none text-(--text-main)">Por que da este resultado</h3>
      </div>

      <div className="grid gap-3 min-[980px]:grid-cols-2">
        <InsightColumn
          emptyMessage="Todavia no aparece una fortaleza clara entre tus chequeos activos."
          highlightedPatternId={highlightedPatternId}
          insights={strengths}
          onHighlightPattern={onHighlightPattern}
          title="Fortalezas"
          tone="positive"
        />
        <InsightColumn
          emptyMessage="Todavia no aparece un riesgo claro entre tus chequeos activos."
          highlightedPatternId={highlightedPatternId}
          insights={risks}
          onHighlightPattern={onHighlightPattern}
          title="Riesgos"
          tone="negative"
        />
      </div>
    </section>
  )
}

function InsightColumn({
  emptyMessage,
  highlightedPatternId,
  insights,
  onHighlightPattern,
  title,
  tone,
}: {
  emptyMessage: string
  highlightedPatternId: string | null
  insights: ProbabilityInsight[]
  onHighlightPattern: (patternId: string | null) => void
  title: string
  tone: 'negative' | 'positive'
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-[0.9rem] text-(--text-main)">{title}</strong>
        <span className="surface-card px-2 py-0.5 text-[0.68rem] text-(--text-muted)">{insights.length}</span>
      </div>

      {insights.length === 0 ? (
        <p className="surface-card m-0 px-3 py-3 text-[0.78rem] text-(--text-muted)">
          {emptyMessage}
        </p>
      ) : (
        <div className="grid gap-2">
          {insights.map((insight) => {
            const isHighlighted = highlightedPatternId === insight.patternId

            return (
              <article
                key={insight.patternId}
                className={[
                  insight.emphasis === 'primary' ? 'surface-panel-strong' : 'surface-card',
                  'grid gap-2 px-3 py-3 transition-[box-shadow,border-color,transform] duration-150',
                  isHighlighted ? 'ring-1 ring-[rgb(var(--primary-rgb)/0.34)]' : '',
                ].join(' ')}
                onMouseEnter={() => onHighlightPattern(insight.patternId)}
                onMouseLeave={() => onHighlightPattern(null)}
                onFocus={() => onHighlightPattern(insight.patternId)}
                onBlur={() => onHighlightPattern(null)}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={[
                      'px-2 py-0.5 text-[0.68rem]',
                      tone === 'positive'
                        ? 'surface-card-success text-(--accent)'
                        : 'surface-card-danger text-(--destructive)',
                    ].join(' ')}
                  >
                    {insight.emphasis === 'primary' ? 'Clave' : 'Secundario'}
                  </span>
                  <strong className="text-[0.88rem] leading-none text-(--text-main)">
                    {formatPercent(insight.probability)}
                  </strong>
                </div>

                <div className="grid gap-1">
                  <strong className="text-[0.88rem] text-(--text-main)">{insight.title}</strong>
                  <p className="app-muted m-0 text-[0.76rem] leading-[1.14]">{insight.description}</p>
                </div>

                <small className="app-soft text-[0.72rem] leading-[1.14]">
                  Chequeo: {insight.sourceLabel}
                </small>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
