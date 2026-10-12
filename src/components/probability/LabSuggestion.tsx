import { useCallback, useMemo } from 'react'

import { ROLE_GROUP_LABEL, type Culprit, type Outcome, type PerTurnResults } from '../../app/lab-suggestion'
import { t } from '../../i18n'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { ProgressRing } from '../ui/ProgressRing'
import { TONE } from '../ui/tone'
import { overline, supportText } from '../ui/typography'
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
  const { culprit, state } = useLabSuggestion(cards, checks, handSize, view, result, maxCopiesOf, perTurn)

  if (!culprit) {
    return null
  }

  const best = state.analysis.best

  return (
    <Card className="order-2 grid content-start gap-4 min-[1101px]:order-3 min-[1101px]:col-span-5 min-[1101px]:col-start-1" aria-label={t('lab.suggestion.label')}>
      <header className="grid min-w-0 gap-0.5">
        <p className={cx('m-0', overline, TONE.danger.text)}>{t('lab.suggestion.overline')}</p>
        <strong className="text-lead font-semibold leading-tight text-foreground [overflow-wrap:anywhere]">{culprit.name}</strong>
        <p className={supportText}>{describeCulprit(culprit)}</p>
      </header>

      {best ? (
        <div className="border-t border-border-subtle pt-4">
          <SwapSummary best={best} />
        </div>
      ) : state.status === 'loading' ? (
        <div className="flex items-center gap-3 border-t border-border-subtle pt-4" role="status">
          <ProgressRing value={state.progress.total > 0 ? state.progress.done / state.progress.total : 0} size={44} strokeWidth={4} label={t('lab.suggestion.progressLabel')} />
          <p className="m-0 text-body text-muted motion-safe:animate-pulse">
            {t('lab.suggestion.testing', { done: state.progress.done, total: state.progress.total })}
          </p>
        </div>
      ) : null}
    </Card>
  )
}

/** El cambio de un vistazo: qué sacar y qué meter. */
function SwapSummary({ best }: { best: Outcome }) {
  const { from, to } = best.swap

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {from ? <SwapChip action="remove" label={ROLE_GROUP_LABEL[from]} /> : null}
        {from && to ? <Icon name="arrow-right" size={16} className="text-soft" /> : null}
        {to ? <SwapChip action="add" label={ROLE_GROUP_LABEL[to]} /> : null}
      </div>
    </div>
  )
}

function SwapChip({ action, label }: { action: 'remove' | 'add'; label: string }) {
  const tone = action === 'remove' ? TONE.danger : TONE.success

  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-tag px-2 py-1 text-micro font-semibold', tone.soft, tone.text)}>
      <Icon name={action === 'remove' ? 'minus' : 'plus'} size={12} strokeWidth={2.5} />
      {t(action === 'remove' ? 'lab.suggestion.remove' : 'lab.suggestion.add', { label })}
    </span>
  )
}

function describeCulprit(culprit: Culprit): string {
  // Un problema es una regla ("Pasa en…"); las manos sin salida son varias ("Pasan en…").
  return formatOdds(culprit.probability, true, culprit.kind !== 'problem')
}
