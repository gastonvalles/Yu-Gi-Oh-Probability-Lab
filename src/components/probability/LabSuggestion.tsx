import { formatShortPercent } from '../../app/utils'
import type { Change, Culprit, Outcome } from '../../app/lab-suggestion'
import { cx } from '../ui/cx'
import { surface } from '../ui/surfaces'
import { formatOdds } from './lab-copy'
import { useLabSuggestion } from './use-lab-suggestion'
import type { LabViewResult } from '../../app/probability-lab'
import type { CardEntry, HandPattern, TurnView } from '../../types'

interface LabSuggestionProps {
  cards: CardEntry[]
  checks: HandPattern[]
  handSize: number
  view: TurnView
  result: LabViewResult
}

/** "Lo que más te frena": la métrica del problema principal y un cambio concreto para mejorarlo. */
export function LabSuggestion({ cards, checks, handSize, view, result }: LabSuggestionProps) {
  const { culprit, state, hint, causes } = useLabSuggestion(cards, checks, handSize, view, result)

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

      {state.status === 'loading' ? (
        <div className="h-9 animate-pulse rounded-control bg-secondary/60 motion-reduce:animate-none" aria-hidden="true" />
      ) : state.analysis.best ? (
        <p className="m-0 rounded-control border border-accent/30 bg-accent/8 px-3 py-2 text-[0.84rem] leading-[1.4] text-foreground">
          <strong>Sugerencia: </strong>
          {describeBest(culprit, state.analysis.best, result.cleanProbability)}
        </p>
      ) : (
        <p className="m-0 text-[0.82rem] leading-[1.4] text-muted">
          {describeNoGain(culprit, state.analysis.tradeoff, result.cleanProbability, hint, causes)}
        </p>
      )}
    </section>
  )
}

function describeCulprit(culprit: Culprit): string {
  return culprit.kind === 'problem'
    ? `Es el problema que más pesa en las manos que no abren limpias. ${formatOdds(culprit.probability)}`
    : `Son las manos que no tienen ninguna salida. ${formatOdds(culprit.probability).replace('Pasa', 'Pasan')}`
}

function describeChanges(changes: Change[]): string {
  const removed = changes.find((change) => change.action === 'remove')
  const added = changes.find((change) => change.action === 'add')

  if (removed && added) return `cambiá 1 copia de ${removed.card.name} por 1 copia de ${added.card.name}`
  if (removed) return `sacá 1 copia de ${removed.card.name} (por una carta neutra)`
  return `sumá 1 copia de ${added?.card.name ?? ''}`
}

function describeBest(culprit: Culprit, best: Outcome, cleanBefore: number): string {
  const target = culprit.kind === 'problem' ? 'el problema' : 'las manos sin salida'

  // El cambio no baja el problema: sube las salidas (las manos limpias) por otro lado.
  if (best.culpritProbability >= culprit.probability - 0.0005) {
    return `Bajar este problema cuesta más salidas de las que ahorra, pero ${describeChanges(best.changes)} y las manos limpias pasarían de ${formatShortPercent(cleanBefore)} a ${formatShortPercent(best.cleanProbability)} (estimado, el resto del deck igual).`
  }

  return `${capitalize(describeChanges(best.changes))}: ${target} bajaría a ${oddsOnly(best.culpritProbability)} y las manos limpias pasarían de ${formatShortPercent(cleanBefore)} a ${formatShortPercent(best.cleanProbability)} (estimado, el resto del deck igual).`
}

/** Sin cambio que convenga: se explica por qué, con números, en vez de dejar un "no se puede". */
function describeNoGain(culprit: Culprit, tradeoff: Outcome | null, cleanBefore: number, hint: string | null, causes: CardEntry[]): string {
  if (hint) {
    return hint
  }

  if (tradeoff) {
    const card = tradeoff.changes[0].card.name

    return `Sacar 1 copia de ${card} bajaría el problema a ${oddsOnly(tradeoff.culpritProbability)}, pero te quita más salidas de las que ahorra: las manos limpias quedarían en ${formatShortPercent(tradeoff.cleanProbability)} (hoy ${formatShortPercent(cleanBefore)}). Es el precio de jugar esas cartas, así que conviene dejarlo así salvo que este problema te moleste más que perder jugadas.`
  }

  if (culprit.kind === 'problem' && causes.length > 0) {
    const copies = causes.reduce((total, card) => total + card.copies, 0)

    return `Lo causan ${causes.map((card) => card.name).join(', ')} (${copies} copias en total). Ningún cambio de una carta mejora el resultado: el deck ya está equilibrado para esta regla.`
  }

  return 'Ningún cambio de una carta mejora el resultado: el deck ya está equilibrado para esto.'
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

function oddsOnly(probability: number): string {
  return formatOdds(probability).replace(/^Pasa en /, '').replace(/\.$/, '')
}
