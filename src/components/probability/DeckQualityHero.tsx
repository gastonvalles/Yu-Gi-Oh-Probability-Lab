import { formatInteger, formatPercent } from '../../app/utils'
import type { ProbabilityCausalEntry } from './probability-lab-helpers'
import { Button } from '../ui/Button'

interface DeckSummarySnapshot {
  cleanProbability: number
  cleanHands: number
  totalHands: number
  basedOnActiveRules: boolean
}

interface DeckQualityHeroProps {
  allCheckCount: number
  deckSummary: DeckSummarySnapshot | null
  feedback: {
    label: string
    tone: 'negative' | 'neutral' | 'positive'
  } | null
  isEditingEnabled: boolean
  onEditPattern: (patternId: string) => void
  openingEntries: ProbabilityCausalEntry[]
  problemEntries: ProbabilityCausalEntry[]
}

export function DeckQualityHero({
  allCheckCount,
  deckSummary,
  feedback,
  isEditingEnabled,
  onEditPattern,
  openingEntries,
  problemEntries,
}: DeckQualityHeroProps) {
  if (!deckSummary) {
    return (
      <section className="surface-panel-strong grid gap-3 px-4 py-4">
        <div className="grid gap-1">
          <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Calidad del deck</p>
          <h3 className="m-0 text-[1.05rem] leading-none text-(--text-main)">Jugable sin problemas</h3>
          <p className="app-muted m-0 text-[0.8rem] leading-[1.16]">
            Activa al menos un chequeo para ver el KPI principal.
          </p>
        </div>
      </section>
    )
  }

  const orderedOpeningEntries = orderEntriesForDisplay(openingEntries)
  const orderedProblemEntries = orderEntriesForDisplay(problemEntries)
  const activeStrengths = orderedOpeningEntries.filter(isEntryActive).slice(0, 2)
  const activeRisks = orderedProblemEntries.filter(isEntryActive).slice(0, 2)
  const subtitle = `Este KPI se calcula con ${formatInteger(allCheckCount)} checks activos. A continuación se muestra el estado completo del deck.`

  return (
    <section className="surface-panel-strong grid gap-3 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="grid gap-1">
          <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Calidad del deck</p>
          <h3 className="m-0 text-[1.08rem] leading-none text-(--text-main)">Jugable sin problemas</h3>
          <p className="app-muted m-0 text-[0.8rem] leading-[1.16]">{subtitle}</p>
        </div>

        {feedback ? (
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={[
                'px-2 py-1 text-[0.72rem]',
                feedback.tone === 'positive'
                  ? 'surface-card-success text-(--accent)'
                  : feedback.tone === 'negative'
                    ? 'surface-card-danger text-(--destructive)'
                    : 'surface-panel-soft text-(--text-muted)',
              ].join(' ')}
            >
              {feedback.label}
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <strong className="text-[3.2rem] leading-none text-(--text-main) min-[760px]:text-[4rem]">
          {formatPercent(deckSummary.cleanProbability)}
        </strong>
        <p className="app-muted m-0 max-w-[26rem] text-[0.8rem] leading-[1.16] min-[760px]:text-right">
          {formatInteger(deckSummary.cleanHands)} manos limpias sobre {formatInteger(deckSummary.totalHands)} posibles.
        </p>
      </div>

      <div className="surface-panel-soft grid gap-1.5 px-3 py-2.5">
        <CompactNarrativeLine
          emptyLabel="Sin fortalezas activas"
          entries={activeStrengths}
          label="Impulsan el resultado"
        />
        <CompactNarrativeLine
          emptyLabel="Sin problemas activos"
          entries={activeRisks}
          label="Lo frenan"
        />
      </div>

      <div className="grid gap-2.5 min-[980px]:grid-cols-2">
        <CheckColumn
          emptyMessage="No hay fortalezas para mostrar."
          entries={orderedOpeningEntries}
          isEditingEnabled={isEditingEnabled}
          kind="opening"
          onEditPattern={onEditPattern}
          title={`Fortalezas (${formatInteger(orderedOpeningEntries.length)})`}
        />
        <CheckColumn
          emptyMessage="No hay riesgos para mostrar."
          entries={orderedProblemEntries}
          isEditingEnabled={isEditingEnabled}
          kind="problem"
          onEditPattern={onEditPattern}
          title={`Riesgos (${formatInteger(orderedProblemEntries.length)})`}
        />
      </div>
    </section>
  )
}

function CheckColumn({
  emptyMessage,
  entries,
  isEditingEnabled,
  kind,
  onEditPattern,
  title,
}: {
  emptyMessage: string
  entries: ProbabilityCausalEntry[]
  isEditingEnabled: boolean
  kind: 'opening' | 'problem'
  onEditPattern: (patternId: string) => void
  title: string
}) {
  return (
    <div className="grid content-start gap-1.5">
      <strong className="text-[0.86rem] text-(--text-main)">{title}</strong>

      {entries.length === 0 ? (
        <p className="surface-panel-soft m-0 px-3 py-2.5 text-[0.76rem] text-(--text-muted)">
          {emptyMessage}
        </p>
      ) : (
        <div className="grid gap-1.5">
          {entries.map((entry) => (
            <CheckStateCard
              key={entry.patternId}
              entry={entry}
              isEditingEnabled={isEditingEnabled}
              kind={kind}
              onEditPattern={onEditPattern}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CheckStateCard({
  entry,
  isEditingEnabled,
  kind,
  onEditPattern,
}: {
  entry: ProbabilityCausalEntry
  isEditingEnabled: boolean
  kind: 'opening' | 'problem'
  onEditPattern: (patternId: string) => void
}) {
  const active = isEntryActive(entry)
  const stateLabel = kind === 'opening'
    ? active ? 'Cumple' : 'No cumple'
    : active ? 'Activo' : 'Sano'

  return (
    <article
      className={[
        getCheckStateCardClass(kind, active),
        'grid gap-1.5 px-3 py-2.5',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-[0.88rem] text-(--text-main)">{entry.name}</strong>
          <span className={getCheckStateBadgeClass(kind, active)}>
            {stateLabel}
          </span>
        </div>
        <strong className="text-[0.88rem] leading-none text-(--text-main)">
          {formatPercent(entry.probability)}
        </strong>
      </div>

      <p className={active
        ? 'm-0 text-[0.77rem] leading-[1.16] text-(--text-main)'
        : 'app-muted m-0 text-[0.75rem] leading-[1.14]'}
      >
        {entry.description}
      </p>
      <small className={active
        ? 'app-soft text-[0.72rem] leading-[1.14]'
        : 'app-soft text-[0.7rem] leading-[1.12] opacity-80'}
      >
        {entry.technicalSubtitle}
      </small>

      {isEditingEnabled ? (
        <div className="pt-0.5">
          <Button variant="primary" size="sm" onClick={() => onEditPattern(entry.patternId)}>
            Editar
          </Button>
        </div>
      ) : null}
    </article>
  )
}

function CompactNarrativeLine({
  emptyLabel,
  entries,
  label,
}: {
  emptyLabel: string
  entries: ProbabilityCausalEntry[]
  label: string
}) {
  return (
    <p className="m-0 text-[0.76rem] leading-[1.22] text-(--text-main)">
      <span className="mr-1 font-medium text-(--text-muted)">{label}:</span>
      {entries.length > 0 ? (
        entries.map((entry, index) => (
          <span key={`${label}-${entry.patternId}`}>
            {index > 0 ? <span className="px-1 text-(--text-muted)">•</span> : null}
            <span>{entry.name}</span>
          </span>
        ))
      ) : (
        <span className="text-(--text-muted)">{emptyLabel}</span>
      )}
    </p>
  )
}

function isEntryActive(entry: ProbabilityCausalEntry): boolean {
  return entry.possible && entry.probability > 0
}

function orderEntriesForDisplay(entries: ProbabilityCausalEntry[]): ProbabilityCausalEntry[] {
  return [...entries].sort((left, right) => {
    const activeComparison = Number(isEntryActive(right)) - Number(isEntryActive(left))

    if (activeComparison !== 0) {
      return activeComparison
    }

    if (left.probability !== right.probability) {
      return right.probability - left.probability
    }

    return left.name.localeCompare(right.name)
  })
}

function getCheckStateCardClass(kind: 'opening' | 'problem', active: boolean): string {
  if (!active) {
    return 'surface-panel-soft'
  }

  return kind === 'opening'
    ? 'surface-card-success'
    : 'surface-card-danger'
}

function getCheckStateBadgeClass(kind: 'opening' | 'problem', active: boolean): string {
  if (!active) {
    return 'surface-panel-soft px-1.5 py-0.5 text-[0.65rem] text-(--text-muted)'
  }

  return [
    'px-1.5 py-0.5 text-[0.65rem]',
    kind === 'opening'
      ? 'surface-card-success text-(--accent)'
      : 'surface-card-danger text-(--destructive)',
  ].join(' ')
}
