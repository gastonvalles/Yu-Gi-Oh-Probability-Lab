import type { PatternKind } from '../../types'
import { cx } from '../ui/cx'
import { formatOdds } from './lab-copy'
import { describePracticeMatch, type PracticeHandMatch } from './practice'
import { RULE_COLOR } from './practice-styles'

/**
 * Chip chico de una salida (verde) o un problema (rojo). En el celular los chips se reparten el ancho de
 * cada fila (sin huecos a la derecha); en escritorio tienen su ancho natural.
 */
const RULE_BUTTON =
  'min-h-8 w-full max-w-full rounded-full border border-[color-mix(in_srgb,var(--rule-color)_55%,transparent)] bg-[color-mix(in_srgb,var(--rule-color)_12%,transparent)] px-3 text-center text-micro font-semibold text-foreground transition-[background,box-shadow,transform] duration-150 [overflow-wrap:anywhere] [-webkit-tap-highlight-color:transparent] animate-rule-in active:scale-[0.96] aria-pressed:bg-[color-mix(in_srgb,var(--rule-color)_32%,transparent)] aria-pressed:shadow-[0_0_14px_color-mix(in_srgb,var(--rule-color)_45%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-hover motion-reduce:animate-none motion-reduce:transition-none min-[1101px]:w-auto min-[1101px]:text-left'
const RULE_ITEM = 'min-w-0 max-[1100px]:flex-1'
const EXPLAIN_TEXT = 'm-0 text-micro text-white/92 [overflow-wrap:anywhere]'
const ODDS_TEXT = 'm-0 col-span-full text-micro text-white/62 [overflow-wrap:anywhere]'

/** Se exporta desde acá para quien ya lo importaba (vive en lab-copy). */
export { formatOdds }

/** Id del chip "Mano no jugable" (no es una regla del Lab). */
export const UNPLAYABLE_ID = 'unplayable'

/** La salida que más cerca estuvo de cumplirse y qué le faltó. */
export interface PracticeNearMiss {
  name: string
  notes: string[]
}

interface PracticeBoardProps {
  openings: PracticeHandMatch[]
  problems: PracticeHandMatch[]
  activeId: string | null
  /** Qué caso (forma de cumplirla) de la regla activa se está mostrando. */
  caseIndex: number
  /** Mano sin salida: ninguna apertura se cumple (la mano se ve gris). */
  unplayable: boolean
  /** Probabilidad (0-1) de que una mano no sea jugable, cuando el Lab ya la calculó. */
  unplayableOdds: number | null
  /** Qué le faltó a las salidas más cercanas: explica por qué la mano no es jugable. */
  nearMisses?: PracticeNearMiss[]
  /** Probabilidad (0-1) de cada regla en este turno, por id: se muestra como "1 de cada x manos". */
  ruleOdds?: ReadonlyMap<string, number> | null
  onToggle: (patternId: string) => void
}

/** Salidas y problemas de la mano, en una fila de chips chicos; el tocado se explica debajo. */
export function PracticeBoard({ openings, problems, activeId, caseIndex, unplayable, unplayableOdds, nearMisses = [], ruleOdds = null, onToggle }: PracticeBoardProps) {
  const active = [...openings, ...problems].find((match) => match.patternId === activeId) ?? null

  // La explicación va ARRIBA de los chips (entre el campo y ellos); los chips quedan junto a la mano.
  return (
    <div className="grid gap-1.5">
      {activeId === UNPLAYABLE_ID && unplayable ? (
        <section className={explainStyle('problem')} aria-live="polite" aria-label="Mano no jugable">
          <p className={EXPLAIN_TEXT}>Ninguna salida se cumple con esta mano: por eso se ve gris.</p>
          {unplayableOdds !== null && unplayableOdds > 0 ? <p className={ODDS_TEXT}>{formatOdds(unplayableOdds)}</p> : null}
          {nearMisses.length > 0 ? (
            <ul aria-label="Qué faltó" className="m-0 col-span-full grid list-none gap-0.5 p-0 text-micro text-white/85">
              {nearMisses.map((miss) => (
                <li key={miss.name} className="[overflow-wrap:anywhere]">
                  <strong className="font-semibold">{miss.name}:</strong> {miss.notes.join(' ')}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      {active ? <RuleExplanation key={active.patternId} match={active} caseIndex={caseIndex} odds={ruleOdds?.get(active.patternId) ?? null} /> : null}
      <div className="flex flex-wrap items-center gap-1.5 max-[1100px]:[&>ul]:contents">
        <RuleGroup kind="opening" matches={openings} activeId={activeId} onToggle={onToggle} />
        <RuleGroup kind="problem" matches={problems} activeId={activeId} unplayable={unplayable} onToggle={onToggle} />
      </div>
    </div>
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
          className="rounded-full bg-[color-mix(in_srgb,var(--rule-color)_22%,transparent)] px-2 py-px text-micro font-extrabold tabular-nums"
          aria-label={`Caso ${caseIndex + 1} de ${match.cases.length}`}>
          {caseIndex + 1}/{match.cases.length}
        </span>
      ) : null}
      {odds !== null && odds > 0 ? <p className={ODDS_TEXT}>{formatOdds(odds)}</p> : null}
      {cards.length > 0 ? (
        <ul aria-label="Cartas de tu mano" className="m-0 col-span-full flex list-none flex-wrap gap-1 p-0">
          {cards.map((card) => (
            <li
              key={card.cardId}
              className="rounded-full bg-[color-mix(in_srgb,var(--rule-color)_18%,transparent)] px-2 py-px text-micro font-semibold"
            >{card.copies > 1 ? `${card.name} ×${card.copies}` : card.name}</li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

/** Explicación de la salida/problema tocado, debajo de los chips. */
function explainStyle(kind: PatternKind): string {
  return cx(
    'grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 rounded-card bg-[color-mix(in_srgb,var(--rule-color)_16%,var(--card-background))] px-3 py-2 text-white animate-sheet-in motion-reduce:animate-none',
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
    <ul className={cx('m-0 flex list-none flex-wrap items-center gap-1.5 p-0', RULE_COLOR[kind])} aria-label={kind === 'opening' ? 'Salidas' : 'Problemas'}>
      {unplayable && kind === 'problem' ? (
        <li className={cx(RULE_ITEM, RULE_COLOR[kind])}>
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
        <li key={match.patternId} className={cx(RULE_ITEM, RULE_COLOR[kind])}>
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
  )
}
