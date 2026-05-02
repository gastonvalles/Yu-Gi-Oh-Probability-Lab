import { formatInteger, formatPercent } from '../../app/utils'
import type { ProbabilityCausalEntry } from './probability-lab-helpers'
import {
  getKpiContextualLabel,
  isDescriptionRedundant,
  isTechnicalSubtitleRedundant,
} from './probability-lab-helpers'
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
  isEditMode: boolean
  onEditPattern: (patternId: string) => void
  onToggleEditMode: () => void
  onOpenQuickAdd: () => void
  onOpenCustomCreate: () => void
  openingEntries: ProbabilityCausalEntry[]
  problemEntries: ProbabilityCausalEntry[]
  /** Optional pie chart element to render next to the KPI percentage */
  pieChart?: React.ReactNode
}

export function DeckQualityHero({
  allCheckCount,
  deckSummary,
  feedback,
  isEditMode,
  onEditPattern,
  onToggleEditMode,
  onOpenQuickAdd,
  onOpenCustomCreate,
  openingEntries,
  problemEntries,
  pieChart,
}: DeckQualityHeroProps) {
  if (!deckSummary) {
    return (
      <section className="surface-panel-strong grid gap-3 px-4 py-4">
        <div className="grid gap-1">
          <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Calidad del deck</p>
          <h3 className="m-0 text-[1.05rem] leading-none text-(--text-main)">Jugable sin problemas</h3>
          <p className="app-muted m-0 text-[0.8rem] leading-[1.16]">
            Activa al menos una regla para ver el KPI principal.
          </p>
        </div>
      </section>
    )
  }

  const orderedOpenings = orderEntries(openingEntries)
  const orderedProblems = orderEntries(problemEntries)
  const kpiLabel = getKpiContextualLabel(deckSummary.cleanProbability)
  const primaryRisk = orderedProblems.find(isActive) ?? null

  return (
    <section className="surface-panel-strong probability-quality-hero grid gap-5 px-4 py-4 min-[980px]:gap-6 min-[980px]:px-5 min-[980px]:py-5">
      <div className="grid gap-3 min-[980px]:grid-cols-[minmax(0,1fr)_auto] min-[980px]:items-start">
        <div className="grid gap-0.5">
          <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Calidad del deck</p>
          <h3 className="m-0 text-[1.08rem] leading-none text-(--text-main) min-[980px]:text-[1.16rem]">
            Jugable sin problemas
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2 min-[980px]:justify-end">
          {isEditMode ? (
            <>
              <Button variant="primary" size="sm" onClick={onOpenQuickAdd}>
                Agregar regla recomendada
              </Button>
              <Button variant="secondary" size="sm" onClick={onOpenCustomCreate}>
                Crear regla propia
              </Button>
              <Button variant="tertiary" size="sm" onClick={onToggleEditMode}>
                Cerrar edición
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={onToggleEditMode}>
              Editar análisis
            </Button>
          )}
        </div>
      </div>

      <div className="probability-quality-main grid gap-3">
        <div className="probability-kpi-shell grid gap-4 min-[960px]:grid-cols-[auto_1fr_auto] min-[960px]:items-center">
          <div className="grid gap-1.5">
            <strong className="probability-kpi-value text-(--text-main)">
              {formatPercent(deckSummary.cleanProbability)}
            </strong>
            <p className="probability-kpi-reading m-0">
              {buildKpiReading(deckSummary.cleanProbability)}
            </p>
          </div>

          {pieChart ? <div className="flex items-center justify-end" style={{ maxWidth: '120px' }}>{pieChart}</div> : null}

          <div className="grid gap-2.5 min-[960px]:justify-items-end">
            <div className="flex flex-wrap items-center gap-2 min-[960px]:justify-end">
              <span className={['probability-kpi-tone', toneBadgeStyle(kpiLabel.tone)].join(' ')}>
                {toneBadgeLabel(kpiLabel.tone)}
              </span>
              {feedback ? (
                <span className={['px-2 py-0.5 text-[0.72rem]', feedbackStyle(feedback.tone)].join(' ')}>
                  {feedback.label}
                </span>
              ) : null}
            </div>

            <p className="probability-kpi-message m-0">
              {buildKpiMeaning(kpiLabel.tone)}
            </p>
            <p className="probability-kpi-note m-0">
              {buildKpiFocus(primaryRisk)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="probability-kpi-stat">
            <strong>{formatInteger(deckSummary.cleanHands)}</strong> manos limpias
          </span>
          <span className="probability-kpi-stat">
            <strong>{formatInteger(deckSummary.totalHands)}</strong> manos posibles
          </span>
          <span className="probability-kpi-stat">
            <strong>{formatInteger(allCheckCount)}</strong> {deckSummary.basedOnActiveRules ? 'checks activos' : 'checks base'}
          </span>
        </div>
      </div>

      <div className="grid gap-5 min-[980px]:grid-cols-2">
        <CardSection
          title="Salidas"
          entries={orderedOpenings}
          kind="opening"
          isEditMode={isEditMode}
          onEdit={onEditPattern}
        />
        <CardSection
          title="Problemas"
          entries={orderedProblems}
          kind="problem"
          isEditMode={isEditMode}
          onEdit={onEditPattern}
        />
      </div>
    </section>
  )
}

function CardSection({ title, entries, kind, isEditMode, onEdit }: {
  title: string
  entries: ProbabilityCausalEntry[]
  kind: 'opening' | 'problem'
  isEditMode: boolean
  onEdit: (id: string) => void
}) {
  if (entries.length === 0) {
    return (
      <div className="grid gap-3">
        <SectionHeading title={title} count={0} kind={kind} />
        <p className="app-muted m-0 text-[0.78rem]">Sin datos.</p>
      </div>
    )
  }

  return (
    <div className="grid content-start gap-3">
      <SectionHeading title={title} count={entries.length} kind={kind} />
      <div className="probability-section-scroll">
        <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
          {entries.map((e) => (
            <Card key={e.patternId} entry={e} kind={kind} isEditMode={isEditMode} onEdit={onEdit} />
          ))}
        </div>
      </div>
    </div>
  )
}

function SectionHeading({
  title,
  count,
  kind,
}: {
  title: string
  count: number
  kind: 'opening' | 'problem'
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        aria-hidden="true"
        className={[
          'h-2 w-2 rounded-full',
          kind === 'opening' ? 'bg-accent' : 'bg-destructive',
        ].join(' ')}
      />
      <strong className="text-[0.92rem] text-(--text-main)">
        {title} ({formatInteger(count)})
      </strong>
    </div>
  )
}

function Card({ entry, kind, isEditMode, onEdit }: {
  entry: ProbabilityCausalEntry
  kind: 'opening' | 'problem'
  isEditMode: boolean
  onEdit: (id: string) => void
}) {
  const active = isActive(entry)
  const supportText = getSupportText(entry)

  return (
    <article
      className={[
        'probability-check-card grid gap-1.5 outline-none',
        isEditMode ? 'cursor-pointer' : 'cursor-default',
      ].join(' ')}
      data-active={active ? 'true' : 'false'}
      data-interactive={isEditMode ? 'true' : 'false'}
      data-kind={kind}
      onClick={isEditMode ? () => onEdit(entry.patternId) : undefined}
      role={isEditMode ? 'button' : undefined}
      tabIndex={isEditMode ? 0 : undefined}
      onKeyDown={isEditMode ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onEdit(entry.patternId)
        }
      } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <strong className="text-[0.9rem] leading-[1.2] text-(--text-main)">{entry.name}</strong>
          {supportText ? (
            <p className="m-0 truncate text-[0.74rem] leading-[1.2] text-(--text-muted)">{supportText}</p>
          ) : null}
        </div>
        <span className="shrink-0 text-[0.9rem] font-semibold tabular-nums text-(--text-main)">
          {formatPercent(entry.probability)}
        </span>
      </div>
    </article>
  )
}

function getSupportText(entry: ProbabilityCausalEntry): string {
  if (!isTechnicalSubtitleRedundant(entry)) {
    return compactSupportText(entry.technicalSubtitle, entry)
  }

  if (!isDescriptionRedundant(entry)) {
    return compactSupportText(entry.description, entry)
  }

  return buildFallbackSupportText(entry)
}

function compactSupportText(value: string, entry: ProbabilityCausalEntry): string {
  const text = value.trim()
  const normalized = text.toLowerCase()

  if (
    normalized === '' ||
    normalized === 'presente en las manos que sí arrancan.' ||
    normalized === 'presente en las manos que frenan la salida.' ||
    normalized === 'no aparece con la configuración actual.'
  ) {
    return buildFallbackSupportText(entry)
  }

  return text
}

function buildFallbackSupportText(entry: ProbabilityCausalEntry): string {
  if (!entry.possible || entry.probability <= 0) {
    return entry.kind === 'opening'
      ? 'No entra en las aperturas del corte actual.'
      : 'No aparece como riesgo en el corte actual.'
  }

  if (entry.kind === 'opening') {
    if (entry.probability >= 0.85) {
      return 'Apertura base muy estable dentro del plan.'
    }

    if (entry.probability >= 0.6) {
      return 'Apertura frecuente dentro del plan principal.'
    }

    if (entry.probability >= 0.3) {
      return 'Línea secundaria que sigue sumando consistencia.'
    }

    return 'Apertura puntual, pero todavía relevante.'
  }

  if (entry.probability >= 0.3) {
    return 'Riesgo principal que más recorta manos jugables.'
  }

  if (entry.probability >= 0.15) {
    return 'Riesgo secundario que todavía aparece seguido.'
  }

  if (entry.probability >= 0.05) {
    return 'Riesgo ocasional que conviene vigilar.'
  }

  return 'Riesgo menor, pero todavía presente.'
}

function isActive(e: ProbabilityCausalEntry): boolean { return e.possible && e.probability > 0 }

function orderEntries(entries: ProbabilityCausalEntry[]): ProbabilityCausalEntry[] {
  return [...entries].sort((a, b) => {
    const d = Number(isActive(b)) - Number(isActive(a))
    if (d !== 0) return d
    if (a.probability !== b.probability) return b.probability - a.probability
    return a.name.localeCompare(b.name)
  })
}

function feedbackStyle(tone: 'positive' | 'negative' | 'neutral'): string {
  if (tone === 'positive') return 'surface-card-success text-accent'
  if (tone === 'negative') return 'surface-card-danger text-destructive'
  return 'surface-panel-soft text-(--text-muted)'
}

function toneBadgeLabel(tone: 'excellent' | 'good' | 'improvable' | 'critical'): string {
  if (tone === 'excellent') return 'Excelente'
  if (tone === 'good') return 'Sólido'
  if (tone === 'improvable') return 'Mejorable'
  return 'Crítico'
}

function toneBadgeStyle(tone: 'excellent' | 'good' | 'improvable' | 'critical'): string {
  if (tone === 'excellent') return 'probability-kpi-tone-excellent'
  if (tone === 'good') return 'probability-kpi-tone-good'
  if (tone === 'improvable') return 'probability-kpi-tone-improvable'
  return 'probability-kpi-tone-critical'
}

function buildKpiReading(probability: number): string {
  if (probability >= 0.9) {
    return 'Casi todas las manos quedan limpias.'
  }

  if (probability >= 0.7) {
    return 'La mayoría de las manos supera el corte.'
  }

  if (probability >= 0.45) {
    return 'Aproximadamente 1 de cada 2 manos supera el corte.'
  }

  if (probability >= 0.25) {
    return 'Menos de 1 de cada 3 manos supera el corte.'
  }

  return 'Muy pocas manos superan el corte.'
}

function buildKpiMeaning(tone: 'excellent' | 'good' | 'improvable' | 'critical'): string {
  if (tone === 'excellent') {
    return 'El deck ya tiene una base muy estable y consistente.'
  }

  if (tone === 'good') {
    return 'La salida es estable, pero todavía hay margen para afinar riesgos.'
  }

  if (tone === 'improvable') {
    return 'Todavía aparecen demasiadas manos que no llegan a una salida mínima.'
  }

  return 'La estructura actual falla demasiado seguido y necesita ajustes fuertes.'
}

function buildKpiFocus(entry: ProbabilityCausalEntry | null): string {
  if (!entry) {
    return 'No hay un riesgo dominante detectado.'
  }

  return `Principal freno: ${entry.name}.`
}
