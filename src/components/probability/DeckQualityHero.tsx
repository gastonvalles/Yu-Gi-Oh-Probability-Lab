import { formatInteger, formatPercent } from '../../app/utils'

interface DeckSummarySnapshot {
  cleanProbability: number
  cleanHands: number
  totalHands: number
  basedOnActiveRules: boolean
}

interface DeckQualityHeroProps {
  activePatternCount: number
  deckSummary: DeckSummarySnapshot | null
  feedback: {
    label: string
    tone: 'negative' | 'neutral' | 'positive'
  } | null
}

export function DeckQualityHero({
  activePatternCount,
  deckSummary,
  feedback,
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

  return (
    <section className="surface-panel-strong grid gap-3 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Calidad del deck</p>
          <h3 className="m-0 text-[1.08rem] leading-none text-(--text-main)">Jugable sin problemas</h3>
          <p className="app-muted m-0 text-[0.8rem] leading-[1.16]">
            {deckSummary.basedOnActiveRules
              ? `Tus ${formatInteger(activePatternCount)} chequeos activos dejan este porcentaje de manos limpias.`
              : 'Todavia no hay chequeos activos; este valor muestra una referencia base del deck.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="surface-card px-2 py-1 text-[0.7rem] text-(--text-muted)">
            {deckSummary.basedOnActiveRules ? 'Analisis activo' : 'Linea base'}
          </span>
          {feedback ? (
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
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <strong className="text-[3.2rem] leading-none text-(--text-main) min-[760px]:text-[4rem]">
          {formatPercent(deckSummary.cleanProbability)}
        </strong>
        <p className="app-muted m-0 max-w-[26rem] text-[0.8rem] leading-[1.16] min-[760px]:text-right">
          {formatInteger(deckSummary.cleanHands)} manos limpias sobre {formatInteger(deckSummary.totalHands)} posibles.
        </p>
      </div>
    </section>
  )
}
