import type { PatternKind } from '../../types'
import { cx } from '../ui/cx'
import { overline } from '../ui/typography'
import { formatOdds } from './lab-copy'
import { describePracticeMatch, type PracticeHandMatch, type PracticeVerdict } from './practice'
import { RULE_COLOR, VERDICT_COLOR } from './practice-styles'

const RULE_BUTTON =
  'min-h-10 max-w-full rounded-full border border-[color-mix(in_srgb,var(--rule-color)_55%,transparent)] bg-[color-mix(in_srgb,var(--rule-color)_12%,transparent)] px-4 text-left text-body font-semibold text-foreground transition-[background,box-shadow,transform] duration-150 [overflow-wrap:anywhere] [-webkit-tap-highlight-color:transparent] animate-rule-in active:scale-[0.96] aria-pressed:bg-[color-mix(in_srgb,var(--rule-color)_32%,transparent)] aria-pressed:shadow-[0_0_18px_color-mix(in_srgb,var(--rule-color)_45%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-hover min-[820px]:min-h-11 min-[820px]:text-lead motion-reduce:animate-none motion-reduce:transition-none'
const EXPLAIN_TEXT = 'm-0 text-body text-white/92 [overflow-wrap:anywhere]'
const ODDS_TEXT = 'm-0 col-span-full text-small text-white/62 [overflow-wrap:anywhere]'

/** Se exporta desde acá para quien ya lo importaba (vive en lab-copy). */
export { formatOdds }

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
    return <span aria-hidden="true" />
  }

  return (
    <span
      key={verdict}
      className={cx(
        'inline-flex min-h-[2.1rem] items-center gap-2 rounded-full border border-(--verdict-color) bg-[color-mix(in_srgb,var(--verdict-color)_14%,transparent)] pl-3 pr-[0.95rem] text-body font-bold text-foreground shadow-[0_0_22px_color-mix(in_srgb,var(--verdict-color)_28%,transparent)] animate-pop motion-reduce:animate-none',
        VERDICT_COLOR[verdict],
      )}
      role="status"
    >
      <span className="size-[0.55rem] rounded-full bg-(--verdict-color) shadow-[0_0_10px_var(--verdict-color)]" aria-hidden="true" />
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
  /** Probabilidad (0-1) de cada regla en este turno, por id: se muestra como "1 de cada x manos". */
  ruleOdds?: ReadonlyMap<string, number> | null
  onToggle: (patternId: string) => void
}

/** Salidas y problemas: cada uno aparece en cuanto la mano cumple sus condiciones. */
export function PracticeBoard({ openings, problems, activeId, caseIndex, unplayableOdds, ruleOdds = null, onToggle }: PracticeBoardProps) {
  const active = [...openings, ...problems].find((match) => match.patternId === activeId) ?? null

  return (
    <>
      <div className="grid w-full content-start gap-[1.1rem] pb-[0.9rem] pt-2">
        <RuleGroup kind="opening" matches={openings} activeId={activeId} onToggle={onToggle} />
        <RuleGroup kind="problem" matches={problems} activeId={activeId} unplayable={unplayableOdds !== null} onToggle={onToggle} />
      </div>
      {activeId === UNPLAYABLE_ID && unplayableOdds !== null && unplayableOdds > 0 ? (
        <section className={explainStyle('problem')} aria-live="polite" aria-label="Mano no jugable">
          <p className={EXPLAIN_TEXT}>{formatOdds(unplayableOdds)}</p>
        </section>
      ) : null}
      {active ? <RuleExplanation key={active.patternId} match={active} caseIndex={caseIndex} odds={ruleOdds?.get(active.patternId) ?? null} /> : null}
    </>
  )
}

/**
 * Qué pide la regla y, si hace falta, con qué cartas de la mano se cumple. El nombre ya está en el
 * botón apretado, y las cartas que el texto ya nombra no se repiten.
 */
function RuleExplanation({ match, caseIndex, odds }: { match: PracticeHandMatch; caseIndex: number; odds: number | null }) {
  const condition = describePracticeMatch(match, caseIndex)
  const cards = (match.cases[caseIndex]?.cards ?? []).filter((card) => !condition.includes(card.name))

  return (
    <section className={explainStyle(match.kind)} aria-live="polite" aria-label={match.name}>
      <p className={EXPLAIN_TEXT}>{condition}</p>
      {match.cases.length > 1 ? (
        <span
          className="rounded-full bg-[color-mix(in_srgb,var(--rule-color)_22%,transparent)] px-[0.6rem] py-[0.1rem] text-small font-extrabold tabular-nums"
          aria-label={`Caso ${caseIndex + 1} de ${match.cases.length}`}>
          {caseIndex + 1}/{match.cases.length}
        </span>
      ) : null}
      {odds !== null && odds > 0 ? <p className={ODDS_TEXT}>{formatOdds(odds)}</p> : null}
      {cards.length > 0 ? (
        <ul aria-label="Cartas de tu mano" className="m-0 col-span-full flex list-none flex-wrap gap-[0.35rem] p-0">
          {cards.map((card) => (
            <li
              key={card.cardId}
              className="rounded-full bg-[color-mix(in_srgb,var(--rule-color)_18%,transparent)] px-[0.65rem] py-[0.15rem] text-caption font-semibold"
            >{card.copies > 1 ? `${card.name} ×${card.copies}` : card.name}</li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

/** Explicación de la salida/problema tocado: abajo del tablero, junto a la mano. */
function explainStyle(kind: PatternKind): string {
  return cx(
    'mt-auto grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 rounded-card border border-[color-mix(in_srgb,var(--rule-color)_45%,transparent)] bg-card-background/92 px-4 py-[0.85rem] text-white animate-sheet-in motion-reduce:animate-none',
    RULE_COLOR[kind],
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
    <section className={cx('grid min-w-0 gap-2', RULE_COLOR[kind])} aria-label={kind === 'opening' ? 'Salidas' : 'Problemas'}>
      <h4 className={cx('m-0 flex items-center gap-2 before:size-1.5 before:rounded-full before:bg-(--rule-color)', overline)}>
        {kind === 'opening' ? 'Salidas' : 'Problemas'}
      </h4>
      <ul className="m-0 flex list-none flex-wrap gap-[0.45rem] p-0">
        {unplayable && kind === 'problem' ? (
          <li>
            <button
              type="button"
              className={RULE_BUTTON}
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
              className={RULE_BUTTON}
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
