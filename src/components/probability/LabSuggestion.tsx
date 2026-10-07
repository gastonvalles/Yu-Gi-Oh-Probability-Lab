import { formatShortPercent } from '../../app/utils'
import type { Culprit, Suggestion } from '../../app/lab-suggestion'
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
  const { culprit, state, hint } = useLabSuggestion(cards, checks, handSize, view, result)

  if (!culprit) {
    return null
  }

  return (
    <section className={cx(surface.card, 'order-3 grid min-w-0 gap-2 p-3 min-[1101px]:col-span-full')} aria-label="Qué mejorar primero">
      <p className="m-0 text-[0.68rem] font-semibold uppercase tracking-widest text-accent">Lo que más te frena</p>
      <div className="grid gap-0.5">
        <strong className="text-[0.95rem] leading-tight text-foreground [overflow-wrap:anywhere]">{culprit.name}</strong>
        <p className="m-0 text-[0.84rem] leading-[1.35] text-muted">{describeCulprit(culprit)}</p>
      </div>

      {state.status === 'loading' ? (
        <div className="h-9 animate-pulse rounded-control bg-secondary/60 motion-reduce:animate-none" aria-hidden="true" />
      ) : state.suggestion ? (
        <p className="m-0 rounded-control border border-accent/30 bg-accent/8 px-3 py-2 text-[0.84rem] leading-[1.4] text-foreground">
          <strong>Sugerencia: </strong>
          {describeSuggestion(culprit, state.suggestion, result.cleanProbability)}
        </p>
      ) : (
        <p className="m-0 text-[0.8rem] leading-[1.35] text-muted">
          {hint ?? 'Ningún cambio de una sola copia lo mejora de forma clara. Probá ajustar la regla o los roles de las cartas involucradas.'}
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

function describeSuggestion(culprit: Culprit, suggestion: Suggestion, cleanBefore: number): string {
  const verb = suggestion.action === 'remove' ? 'sacar 1 copia de' : 'sumar 1 copia de'
  const effect = culprit.kind === 'problem' ? `bajaría a ${oddsOnly(suggestion.culpritProbability)}` : `bajarían a ${oddsOnly(suggestion.culpritProbability)}`

  return `Probá ${verb} ${suggestion.card.name}: ${effect} y las manos limpias pasarían de ${formatShortPercent(cleanBefore)} a ${formatShortPercent(suggestion.cleanProbability)} (estimado, sin tocar el resto del deck).`
}

function oddsOnly(probability: number): string {
  return formatOdds(probability).replace(/^Pasa en /, '').replace(/\.$/, '')
}
