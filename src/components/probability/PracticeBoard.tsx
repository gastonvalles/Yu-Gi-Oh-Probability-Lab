import { formatInteger, formatShortPercent } from '../../app/utils'
import type { PatternKind } from '../../types'
import { describePracticeMatch, type PracticeHandMatch, type PracticeVerdict } from './practice'

/** Id del chip "Mano no jugable" (no es una regla del Lab). */
export const UNPLAYABLE_ID = 'unplayable'

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
  /** Qué caso (forma de cumplirla) de la regla activa se está mostrando. */
  caseIndex: number
  /** Mano sin salida: probabilidad (0-1) de que pase. null si la mano es jugable. */
  unplayableOdds: number | null
  onToggle: (patternId: string) => void
}

/** Salidas y problemas: cada uno aparece en cuanto la mano cumple sus condiciones. */
export function PracticeBoard({ openings, problems, activeId, caseIndex, unplayableOdds, onToggle }: PracticeBoardProps) {
  const active = [...openings, ...problems].find((match) => match.patternId === activeId) ?? null

  return (
    <>
      <div className="practice-groups">
        <RuleGroup kind="opening" matches={openings} activeId={activeId} onToggle={onToggle} />
        <RuleGroup kind="problem" matches={problems} activeId={activeId} unplayable={unplayableOdds !== null} onToggle={onToggle} />
      </div>
      {activeId === UNPLAYABLE_ID && unplayableOdds !== null && unplayableOdds > 0 ? (
        <section className="practice-explain" data-kind="problem" aria-live="polite" aria-label="Mano no jugable">
          <p>Pasa en 1 de cada {formatInteger(Math.max(1, Math.round(1 / unplayableOdds)))} manos ({formatShortPercent(unplayableOdds)}).</p>
        </section>
      ) : null}
      {active ? <RuleExplanation key={active.patternId} match={active} caseIndex={caseIndex} /> : null}
    </>
  )
}

/**
 * Qué pide la regla y, si hace falta, con qué cartas de la mano se cumple. El nombre ya está en el
 * botón apretado, y las cartas que el texto ya nombra no se repiten.
 */
function RuleExplanation({ match, caseIndex }: { match: PracticeHandMatch; caseIndex: number }) {
  const condition = describePracticeMatch(match, caseIndex)
  const cards = (match.cases[caseIndex]?.cards ?? []).filter((card) => !condition.includes(card.name))

  return (
    <section className="practice-explain" data-kind={match.kind} aria-live="polite" aria-label={match.name}>
      <p>{condition}</p>
      {match.cases.length > 1 ? (
        <span className="practice-explain-count" aria-label={`Caso ${caseIndex + 1} de ${match.cases.length}`}>
          {caseIndex + 1}/{match.cases.length}
        </span>
      ) : null}
      {cards.length > 0 ? (
        <ul aria-label="Cartas de tu mano">
          {cards.map((card) => (
            <li key={card.cardId}>{card.copies > 1 ? `${card.name} ×${card.copies}` : card.name}</li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function RuleGroup({
  kind,
  matches,
  activeId,
  unplayable = false,
  onToggle,
}: {
  kind: PatternKind
  matches: PracticeHandMatch[]
  activeId: string | null
  unplayable?: boolean
  onToggle: (patternId: string) => void
}) {
  if (matches.length === 0 && !(unplayable && kind === 'problem')) {
    return null
  }

  return (
    <section className="practice-group" data-kind={kind} aria-label={kind === 'opening' ? 'Salidas' : 'Problemas'}>
      <h4>{kind === 'opening' ? 'Salidas' : 'Problemas'}</h4>
      <ul>
        {unplayable && kind === 'problem' ? (
          <li>
            <button
              type="button"
              className="practice-rule"
              data-kind="problem"
              aria-pressed={activeId === UNPLAYABLE_ID}
              onClick={() => onToggle(UNPLAYABLE_ID)}
            >
              Mano no jugable
            </button>
          </li>
        ) : null}
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
