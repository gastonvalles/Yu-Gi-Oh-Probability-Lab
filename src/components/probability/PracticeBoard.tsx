import { useEffect, useRef } from 'react'

import { t } from '../../i18n'
import type { PatternKind } from '../../types'
import { cx } from '../ui/cx'
import { formatOdds } from './lab-copy'
import { describePracticeMatch, type PracticeHandMatch } from './practice'
import { RULE_COLOR } from './practice-styles'

/**
 * Chip chico de una salida (verde) o un problema (rojo): de su ancho natural en filas (centradas en el celular,
 * a la izquierda en el panel de escritorio). Gastón los quiere chicos, como los de la práctica original.
 */
const RULE_BUTTON =
  'pointer-events-auto min-h-8 max-w-full rounded-full border border-[color-mix(in_srgb,var(--rule-color)_55%,transparent)] bg-[color-mix(in_srgb,var(--rule-color)_12%,transparent)] px-3 text-left text-micro font-semibold text-foreground transition-[background,box-shadow,transform] duration-150 [overflow-wrap:anywhere] [-webkit-tap-highlight-color:transparent] animate-rule-in active:scale-[0.96] aria-pressed:bg-[color-mix(in_srgb,var(--rule-color)_32%,transparent)] aria-pressed:shadow-[0_0_14px_color-mix(in_srgb,var(--rule-color)_45%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-hover motion-reduce:animate-none motion-reduce:transition-none'
const RULE_ITEM = 'min-w-0'
const EXPLAIN_TEXT = 'm-0 text-micro text-white/92 [overflow-wrap:anywhere]'
const ODDS_TEXT = 'm-0 col-span-full text-micro text-white/62 [overflow-wrap:anywhere]'

/** Se exporta desde acá para quien ya lo importaba (vive en lab-copy). */
export { formatOdds }

/** Id del chip "Mano no jugable" (no es una regla del Lab). */
export const UNPLAYABLE_ID = 'unplayable'

/** La salida que más cerca estuvo de cumplirse y qué le faltó. */
interface PracticeNearMiss {
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
  /** Se tocó fuera de los chips y de la explicación: se cierra la regla activa. */
  onDismiss?: () => void
}

/** Salidas y problemas de la mano, en una fila de chips chicos; el tocado se explica arriba de los chips. */
export function PracticeBoard({ openings, problems, activeId, caseIndex, unplayable, unplayableOdds, nearMisses = [], ruleOdds = null, onToggle, onDismiss }: PracticeBoardProps) {
  const active = [...openings, ...problems].find((match) => match.patternId === activeId) ?? null
  const ref = useRef<HTMLDivElement | null>(null)

  // Tocar en cualquier otro lado de la pantalla (la mesa, una carta, un menú) cierra la explicación.
  useEffect(() => {
    if (activeId === null || !onDismiss) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (ref.current && event.target instanceof Node && !ref.current.contains(event.target)) {
        onDismiss()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [activeId, onDismiss])

  // La explicación va ARRIBA de los chips: los chips quedan abajo, junto a la mano (que no se mueve), y la
  // explicación crece hacia arriba (en escritorio le saca lugar a la lista de pasos; en el celular flota, sin sacarle lugar a nada).
  return (
    <div ref={ref} className="grid gap-1.5 max-[1101px]:relative">
      {/* En el celular la explicación flota sobre los chips (en el aire que queda entre el campo y ellos): no ocupa lugar, así el campo no se corre al tocar un chip. */}
      <div className="grid gap-1.5 empty:hidden max-[1101px]:absolute max-[1101px]:inset-x-0 max-[1101px]:bottom-full max-[1101px]:z-10 max-[1101px]:mb-1.5">
        {activeId === UNPLAYABLE_ID && unplayable ? (
          <section className={explainStyle('problem')} aria-live="polite" aria-label={t('practice.board.unplayable')}>
            <p className={EXPLAIN_TEXT}>{t('practice.board.unplayableWhy')}</p>
            {unplayableOdds !== null && unplayableOdds > 0 ? <p className={ODDS_TEXT}>{formatOdds(unplayableOdds)}</p> : null}
            {nearMisses.length > 0 ? (
              <ul aria-label={t('practice.board.missing')} className="m-0 col-span-full grid list-none gap-0.5 p-0 text-micro text-white/85">
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
      </div>
      <div className="flex flex-wrap items-center gap-1.5 [&>ul]:contents max-[1101px]:justify-center">
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
          aria-label={t('practice.board.caseOf', { n: caseIndex + 1, total: match.cases.length })}>
          {caseIndex + 1}/{match.cases.length}
        </span>
      ) : null}
      {odds !== null && odds > 0 ? <p className={ODDS_TEXT}>{formatOdds(odds)}</p> : null}
      {cards.length > 0 ? (
        <ul aria-label={t('practice.board.handCards')} className="m-0 col-span-full flex list-none flex-wrap gap-1 p-0">
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

/** Explicación de la salida/problema tocado, arriba de los chips. */
function explainStyle(kind: PatternKind): string {
  return cx(
    'pointer-events-auto grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 rounded-card bg-[color-mix(in_srgb,var(--rule-color)_16%,var(--card-background))] px-3 py-2 text-white animate-sheet-in motion-reduce:animate-none',
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
    <ul className={cx('m-0 flex list-none flex-wrap items-center gap-1.5 p-0', RULE_COLOR[kind])} aria-label={kind === 'opening' ? t('practice.board.openings') : t('practice.board.problems')}>
      {unplayable && kind === 'problem' ? (
        <li className={cx(RULE_ITEM, RULE_COLOR[kind])}>
          <button
            type="button"
            className={RULE_BUTTON}
            aria-pressed={activeId === UNPLAYABLE_ID}
            onClick={() => onToggle(UNPLAYABLE_ID)}
          >
            {t('practice.board.unplayable')}
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
