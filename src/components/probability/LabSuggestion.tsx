import { useCallback, useMemo, type ReactNode } from 'react'

import { formatShortPercent } from '../../app/utils'
import { ROLE_GROUP_LABEL, type Culprit, type Outcome, type PerTurnResults } from '../../app/lab-suggestion'
import { cx } from '../ui/cx'
import { surface } from '../ui/surfaces'
import { formatOdds } from './lab-copy'
import { useLabSuggestion } from './use-lab-suggestion'
import type { LabViewResult } from '../../app/probability-lab'
import { getCardCopyLimit } from '../../app/deck-format'
import type { CardEntry, DeckFormat, HandPattern, TurnView } from '../../types'

interface LabSuggestionProps {
  deckFormat: DeckFormat
  cards: CardEntry[]
  checks: HandPattern[]
  handSize: number
  view: TurnView
  result: LabViewResult
  /** Resultados de 1º y 2º: el Promedio los usa para ponderar el culpable y mostrar el efecto por turno. */
  first: LabViewResult
  second: LabViewResult
}

/** "Lo que más te frena": la métrica del problema principal y un cambio concreto para mejorarlo. */
export function LabSuggestion({ cards, checks, deckFormat, handSize, view, result, first, second }: LabSuggestionProps) {
  const perTurn = useMemo<PerTurnResults>(() => ({ first, second }), [first, second])
  // Un cambio que suma copias tiene que ser legal en el formato (banlist): la sugerencia no puede pedir lo imposible.
  const maxCopiesOf = useCallback((card: CardEntry) => (card.apiCard ? getCardCopyLimit(card.apiCard, deckFormat) : 3), [deckFormat])
  const { culprit, state, hint, causes } = useLabSuggestion(cards, checks, handSize, view, result, maxCopiesOf, perTurn)

  if (!culprit) {
    return null
  }

  return (
    <section className={cx(surface.card, 'order-2 grid min-w-0 gap-2 p-3 min-[1101px]:order-3 min-[1101px]:col-span-full')} aria-label="Qué mejorar primero">
      <p className="m-0 text-[0.68rem] font-semibold uppercase tracking-widest text-accent">Lo que más te frena</p>
      <div className="grid gap-0.5">
        <strong className="text-[0.95rem] leading-tight text-foreground [overflow-wrap:anywhere]">{culprit.name}</strong>
        <p className="m-0 text-[0.84rem] leading-[1.35] text-muted">{describeCulprit(culprit)}</p>
      </div>

      {state.analysis.best ? (
        <AdviceBox label="Sugerencia">{describeBest(culprit, state.analysis.best, result.cleanProbability)}{perTurnLine(state.analysis.best, perTurn)}</AdviceBox>
      ) : state.status === 'loading' ? (
        <p className="m-0 text-[0.82rem] leading-[1.4] text-muted motion-safe:animate-pulse">
          Probando cambios en tu deck… ({state.progress.done}/{state.progress.total})
        </p>
      ) : (
        <AdviceBox label="Conclusión">
          {describeNoGain(culprit, state.analysis.tradeoff, result.cleanProbability, hint, causes, state.progress.total, state.analysis.compared)}
        </AdviceBox>
      )}
    </section>
  )
}

/** Recuadro verde del consejo (o de la conclusión cuando no hay un cambio que convenga). */
function AdviceBox({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="m-0 rounded-control border border-accent/30 bg-accent/8 px-3 py-2 text-[0.84rem] leading-[1.4] text-foreground">
      <strong>{label}: </strong>
      {children}
    </p>
  )
}

/** En el Promedio se aclara qué pasa en cada turno: así el consejo global no se confunde con el de 1º o 2º. */
function perTurnLine(best: Outcome, perTurn: PerTurnResults): string {
  return best.cleanBySide
    ? ` Por turno: yendo 1º ${formatShortPercent(perTurn.first.cleanProbability)} → ${formatShortPercent(best.cleanBySide.first)}, yendo 2º ${formatShortPercent(perTurn.second.cleanProbability)} → ${formatShortPercent(best.cleanBySide.second)}.`
    : ''
}

function describeCulprit(culprit: Culprit): string {
  return culprit.kind === 'problem'
    ? `Es el problema que más pesa en las manos que no abren limpias. ${formatOdds(culprit.probability)}`
    : `Son las manos que no tienen ninguna salida. ${formatOdds(culprit.probability).replace('Pasa', 'Pasan')}`
}

/** "Sacá 1 starter y meté 1 handtrap (ej.: A por B)": lo dice por familia, como un jugador, y da un ejemplo concreto. */
function describeSwap(outcome: Outcome): string {
  const removed = outcome.changes.find((change) => change.action === 'remove')
  const added = outcome.changes.find((change) => change.action === 'add')
  const { from, to } = outcome.swap
  const example = removed && added ? ` (por ejemplo, ${removed.card.name} por ${added.card.name})` : ''

  if (from && to) return `sacá 1 ${ROLE_GROUP_LABEL[from]} y meté 1 ${ROLE_GROUP_LABEL[to]}${example}`
  return `sumá 1 ${to ? ROLE_GROUP_LABEL[to] : 'carta'}${added ? ` (${added.card.name})` : ''}`
}

function describeBest(culprit: Culprit, best: Outcome, cleanBefore: number): string {
  const target = culprit.kind === 'problem' ? 'el problema' : 'las manos sin salida'

  // El cambio no baja el problema: sube las salidas (las manos limpias) por otro lado.
  if (best.culpritProbability >= culprit.probability - 0.0005) {
    return `Bajar este problema cuesta más salidas de las que ahorra, pero ${describeSwap(best)} y las manos limpias pasarían de ${formatShortPercent(cleanBefore)} a ${formatShortPercent(best.cleanProbability)} (estimado, el resto del deck igual).`
  }

  return `${capitalize(describeSwap(best))}: ${target} bajaría a ${oddsOnly(best.culpritProbability)} y las manos limpias pasarían de ${formatShortPercent(cleanBefore)} a ${formatShortPercent(best.cleanProbability)} (estimado, el resto del deck igual).`
}

/** Sin cambio que convenga: se explica por qué, con números, en vez de dejar un "no se puede". */
function describeNoGain(
  culprit: Culprit,
  tradeoff: Outcome | null,
  cleanBefore: number,
  hint: string | null,
  causes: CardEntry[],
  tried: number,
  compared: number,
): string {
  if (hint) {
    return hint
  }

  if (tried === 0) {
    const names = causes.slice(0, 4).map((card) => card.name).join(', ')

    return culprit.kind === 'problem' && causes.length > 0
      ? `Lo causan ${names}${causes.length > 4 ? '…' : ''}, que son parte de tu engine, y no hay cartas non-engine ni de relleno para mover (ni copias libres que tu formato permita). Para bajarlo hay que tocar el engine: es una decisión de armado, no una sugerencia automática.`
      : 'No hay un cambio permitido por tu formato (copias máximas y banlist) que ataque esto directamente.'
  }

  if (compared === 0) {
    return 'No se pudieron comparar cambios para esto con tu deck actual.'
  }

  if (tradeoff && culprit.probability - tradeoff.culpritProbability >= 0.01) {
    return `${capitalize(describeSwap(tradeoff))} bajaría el problema a ${oddsOnly(tradeoff.culpritProbability)}, pero te cuesta más manos limpias de las que ahorra: quedarían en ${formatShortPercent(tradeoff.cleanProbability)} (hoy ${formatShortPercent(cleanBefore)}). Es el precio de ese plan, así que conviene dejarlo así salvo que este problema te moleste más que perder jugadas.`
  }

  if (culprit.kind === 'problem' && causes.length > 0) {
    const copies = causes.reduce((total, card) => total + card.copies, 0)

    const engine = causes.filter((card) => card.origin !== 'non_engine')

    return `Lo causan ${causes.map((card) => card.name).join(', ')} (${copies} copias en total)${engine.length > 0 ? `, y ${engine.length === causes.length ? 'son' : 'varias son'} parte de tu engine, así que no conviene sacarlas` : ''}. Ningún cambio de una carta mejora el resultado: el deck ya está equilibrado para esta regla.`
  }

  return 'Ningún cambio de una carta mejora el resultado: el deck ya está equilibrado para esto.'
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

function oddsOnly(probability: number): string {
  return formatOdds(probability).replace(/^Pasa en /, '').replace(/\.$/, '')
}
