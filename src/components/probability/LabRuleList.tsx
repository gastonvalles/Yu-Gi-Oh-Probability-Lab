import { formatInteger, formatShortPercent } from '../../app/utils'
import type { PatternKind } from '../../types'
import { Button } from '../ui/Button'
import { LabSection } from './LabSection'
import {
  isDescriptionRedundant,
  isTechnicalSubtitleRedundant,
  type ProbabilityCausalEntry,
} from './probability-lab-helpers'

interface LabRuleListProps {
  openings: ProbabilityCausalEntry[]
  problems: ProbabilityCausalEntry[]
  highlightedPatternId: string | null
  onEditRule: (patternId: string) => void
  onAddRecommended: () => void
  onCreateCustom: () => void
}

export function LabRuleList({
  openings,
  problems,
  highlightedPatternId,
  onEditRule,
  onAddRecommended,
  onCreateCustom,
}: LabRuleListProps) {
  return (
    <LabSection
      title="Reglas del análisis"
      summary={`${formatInteger(openings.length)} salidas · ${formatInteger(problems.length)} problemas`}
      className="lab-rules"
      actions={
        <>
          <Button variant="secondary" size="sm" onClick={onAddRecommended}>
            + Recomendada
          </Button>
          <Button variant="tertiary" size="sm" onClick={onCreateCustom}>
            + Propia
          </Button>
        </>
      }
    >
      <p className="lab-footnote m-0">Tocá una regla para editarla. Los cambios recalculan todo al instante.</p>
      <div className="lab-rule-columns">
        <RuleGroup
          title="Salidas"
          hint="La mano arranca si cumple alguna"
          kind="opening"
          entries={openings}
          highlightedPatternId={highlightedPatternId}
          onEditRule={onEditRule}
        />
        <RuleGroup
          title="Problemas"
          hint="Frenan la mano aunque tenga salida"
          kind="problem"
          entries={problems}
          highlightedPatternId={highlightedPatternId}
          onEditRule={onEditRule}
        />
      </div>
    </LabSection>
  )
}

function RuleGroup({
  title,
  hint,
  kind,
  entries,
  highlightedPatternId,
  onEditRule,
}: {
  title: string
  hint: string
  kind: PatternKind
  entries: ProbabilityCausalEntry[]
  highlightedPatternId: string | null
  onEditRule: (patternId: string) => void
}) {
  return (
    <div className="lab-rule-group" data-kind={kind}>
      <div className="lab-rule-group-head">
        <span className="lab-rule-dot" aria-hidden="true" />
        <strong>{title}</strong>
        <small>{hint}</small>
      </div>

      {entries.length === 0 ? (
        <p className="lab-empty-note">Sin reglas de este tipo.</p>
      ) : (
        <ul className="lab-rule-list">
          {orderEntries(entries).map((entry) => (
            <li key={entry.patternId}>
              <RuleRow
                entry={entry}
                isHighlighted={highlightedPatternId === entry.patternId}
                onEdit={() => onEditRule(entry.patternId)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RuleRow({
  entry,
  isHighlighted,
  onEdit,
}: {
  entry: ProbabilityCausalEntry
  isHighlighted: boolean
  onEdit: () => void
}) {
  const isActive = entry.possible && entry.probability > 0

  return (
    <button
      type="button"
      className="lab-rule"
      data-kind={entry.kind}
      data-active={isActive ? 'true' : 'false'}
      data-highlighted={isHighlighted ? 'true' : 'false'}
      aria-label={`Editar regla ${entry.name}: ${formatShortPercent(entry.probability)}`}
      onClick={onEdit}
    >
      <span className="lab-rule-main">
        <span className="lab-rule-name">
          <span className="truncate">{entry.name}</span>
          <TurnContextBadge turnContext={entry.turnContext} />
        </span>
        <span className="lab-rule-support">{getSupportText(entry)}</span>
      </span>
      <span className="lab-rule-value">{formatShortPercent(entry.probability)}</span>
      <span className="lab-rule-bar" aria-hidden="true">
        <span style={{ width: `${Math.min(100, entry.probability * 100)}%` }} />
      </span>
    </button>
  )
}

function TurnContextBadge({ turnContext }: { turnContext: ProbabilityCausalEntry['turnContext'] }) {
  if (turnContext === 'either') {
    return null
  }

  const label = turnContext === 'first' ? 'Solo 1º' : 'Solo 2º'

  return <span className="lab-rule-turn">{label}</span>
}

function getSupportText(entry: ProbabilityCausalEntry): string {
  if (!entry.possible) {
    return 'No puede darse con el deck actual.'
  }

  if (!isTechnicalSubtitleRedundant(entry)) {
    return entry.technicalSubtitle.trim()
  }

  if (!isDescriptionRedundant(entry)) {
    return entry.description.trim()
  }

  return entry.kind === 'opening' ? 'Salida definida por vos.' : 'Problema definido por vos.'
}

function orderEntries(entries: ProbabilityCausalEntry[]): ProbabilityCausalEntry[] {
  return [...entries].sort((left, right) => {
    const activeDelta = Number(right.possible) - Number(left.possible)
    return activeDelta !== 0 ? activeDelta : right.probability - left.probability || left.name.localeCompare(right.name)
  })
}
