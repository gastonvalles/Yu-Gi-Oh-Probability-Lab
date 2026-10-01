import type { PatternKind } from '../../types'
import type { PracticeHandMatch, PracticeVerdict } from './practice'

const VERDICT_WORD: Record<PracticeVerdict, string> = {
  clean: 'Limpia',
  'with-problem': 'Con problema',
  'no-opening': 'Sin salida',
}

/** Resultado de la mano en una palabra: aparece cuando terminó de repartirse. */
export function PracticeVerdictChip({ verdict }: { verdict: PracticeVerdict | null }) {
  if (!verdict) {
    return <span className="practice-verdict-slot" aria-hidden="true" />
  }

  return (
    <span key={verdict} className="practice-verdict-chip" data-verdict={verdict} role="status">
      <span className="practice-verdict-dot" aria-hidden="true" />
      {VERDICT_WORD[verdict]}
    </span>
  )
}

interface PracticeBoardProps {
  openings: PracticeHandMatch[]
  problems: PracticeHandMatch[]
  activeId: string | null
  onToggle: (patternId: string) => void
}

/** Salidas y problemas: cada uno aparece en cuanto la mano cumple sus condiciones. */
export function PracticeBoard({ openings, problems, activeId, onToggle }: PracticeBoardProps) {
  return (
    <div className="practice-groups">
      <RuleGroup kind="opening" matches={openings} activeId={activeId} onToggle={onToggle} />
      <RuleGroup kind="problem" matches={problems} activeId={activeId} onToggle={onToggle} />
    </div>
  )
}

function RuleGroup({
  kind,
  matches,
  activeId,
  onToggle,
}: {
  kind: PatternKind
  matches: PracticeHandMatch[]
  activeId: string | null
  onToggle: (patternId: string) => void
}) {
  if (matches.length === 0) {
    return null
  }

  return (
    <section className="practice-group" data-kind={kind} aria-label={kind === 'opening' ? 'Salidas' : 'Problemas'}>
      <h4>{kind === 'opening' ? 'Salidas' : 'Problemas'}</h4>
      <ul>
        {matches.map((match) => (
          <li key={match.patternId}>
            <button
              type="button"
              className="practice-rule"
              data-kind={kind}
              aria-pressed={activeId === match.patternId}
              onClick={() => onToggle(match.patternId)}
            >
              {match.name}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
