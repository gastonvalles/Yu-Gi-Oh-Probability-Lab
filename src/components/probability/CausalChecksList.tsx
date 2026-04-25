import { formatPercent } from '../../app/utils'
import { Button } from '../ui/Button'
import type { ProbabilityCausalEntry } from './probability-lab-helpers'

interface CausalChecksListProps {
  highlightedPatternId: string | null
  onEditPattern: (patternId: string) => void
  onHighlightPattern: (patternId: string | null) => void
  openingEntries: ProbabilityCausalEntry[]
  problemEntries: ProbabilityCausalEntry[]
  recentlyChangedPatternId: string | null
}

export function CausalChecksList({
  highlightedPatternId,
  onEditPattern,
  onHighlightPattern,
  openingEntries,
  problemEntries,
  recentlyChangedPatternId,
}: CausalChecksListProps) {
  return (
    <section className="grid gap-3">
      <div className="grid gap-0.5">
        <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Que lo empuja</p>
        <h3 className="m-0 text-[1rem] leading-none text-(--text-main)">Reglas relevantes del modelo</h3>
      </div>

      <div className="grid gap-3">
        <CausalChecksGroup
          entries={openingEntries}
          emptyMessage="No aparece una salida clara con el threshold actual."
          groupTone="positive"
          highlightedPatternId={highlightedPatternId}
          onEditPattern={onEditPattern}
          onHighlightPattern={onHighlightPattern}
          recentlyChangedPatternId={recentlyChangedPatternId}
          title="Salidas"
        />
        <CausalChecksGroup
          entries={problemEntries}
          emptyMessage="No aparece un problema dominante con el threshold actual."
          groupTone="negative"
          highlightedPatternId={highlightedPatternId}
          onEditPattern={onEditPattern}
          onHighlightPattern={onHighlightPattern}
          recentlyChangedPatternId={recentlyChangedPatternId}
          title="Problemas"
        />
      </div>
    </section>
  )
}

function CausalChecksGroup({
  entries,
  emptyMessage,
  groupTone,
  highlightedPatternId,
  onEditPattern,
  onHighlightPattern,
  recentlyChangedPatternId,
  title,
}: {
  entries: ProbabilityCausalEntry[]
  emptyMessage: string
  groupTone: 'negative' | 'positive'
  highlightedPatternId: string | null
  onEditPattern: (patternId: string) => void
  onHighlightPattern: (patternId: string | null) => void
  recentlyChangedPatternId: string | null
  title: string
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-[0.9rem] text-(--text-main)">{title}</strong>
        <span className="surface-card px-2 py-0.5 text-[0.68rem] text-(--text-muted)">{entries.length}</span>
      </div>

      {entries.length === 0 ? (
        <p className="surface-card m-0 px-3 py-3 text-[0.78rem] text-(--text-muted)">
          {emptyMessage}
        </p>
      ) : (
        <div className="grid gap-2">
          {entries.map((entry) => {
            const isHighlighted = highlightedPatternId === entry.patternId
            const isRecentlyChanged = recentlyChangedPatternId === entry.patternId

            return (
              <article
                key={entry.patternId}
                className={[
                  'surface-card grid gap-2.5 px-3 py-3 transition-[box-shadow,border-color,transform] duration-150',
                  'min-[980px]:grid-cols-[minmax(0,1.2fr)_minmax(180px,0.78fr)_auto]',
                  isHighlighted ? 'ring-1 ring-[rgb(var(--primary-rgb)/0.34)]' : '',
                  isRecentlyChanged ? 'border-[rgb(var(--primary-rgb)/0.34)]' : '',
                ].join(' ')}
                onMouseEnter={() => onHighlightPattern(entry.patternId)}
                onMouseLeave={() => onHighlightPattern(null)}
                onFocus={() => onHighlightPattern(entry.patternId)}
                onBlur={() => onHighlightPattern(null)}
              >
                <div className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <strong className="text-[0.88rem] text-(--text-main)">{entry.name}</strong>
                    {entry.isCore ? (
                      <span
                        className={[
                          'px-1.5 py-0.5 text-[0.65rem]',
                          groupTone === 'positive'
                            ? 'surface-card-success text-accent'
                            : 'surface-card-danger text-destructive',
                        ].join(' ')}
                      >
                        Modelo base
                      </span>
                    ) : null}
                    {isRecentlyChanged ? (
                      <span className="surface-panel-soft px-1.5 py-0.5 text-[0.65rem] text-(--text-muted)">
                        Actualizado
                      </span>
                    ) : null}
                  </div>
                  <p className="app-muted m-0 text-[0.76rem] leading-[1.14]">{entry.technicalSubtitle}</p>
                </div>

                <div className="grid gap-1">
                  <p className="m-0 text-[0.78rem] text-(--text-main)">{entry.description}</p>
                  <strong className="text-[0.9rem] leading-none text-(--text-main)">
                    {entry.possible ? formatPercent(entry.probability) : '0.0%'}
                  </strong>
                </div>

                <div className="flex items-start justify-end">
                  <Button variant="primary" size="sm" onClick={() => onEditPattern(entry.patternId)}>
                    Editar
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
