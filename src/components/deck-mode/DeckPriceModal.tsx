import { useDeckPrice } from '../../app/use-deck-price'
import type { DeckBuilderState } from '../../app/model'
import { formatUsd } from '../../app/utils'
import { formatDay, t } from '../../i18n'
import { Callout } from '../ui/Callout'
import { EmptyState } from '../ui/EmptyState'
import { Modal } from '../ui/Modal'
import { Skeleton } from '../ui/Skeleton'

interface DeckPriceModalProps {
  isOpen: boolean
  onClose: () => void
  deckBuilder: DeckBuilderState
}

/** «2026-10-11» → «11/10/2026» (en inglés, «Oct 11, 2026»); un día con otra forma se muestra tal cual. */
function formatUpdated(day: string): string {
  const date = new Date(`${day}T00:00:00Z`)

  return Number.isNaN(date.getTime()) ? day : formatDay(date, 'UTC')
}

/**
 * El precio total del deck: el número grande y, debajo, qué cuesta cada carta (las más caras primero). Se calcula con la impresión más barata de cada carta
 * en TCGplayer; las que no tienen precio no suman y se dicen. Los precios se piden recién al abrir.
 */
export function DeckPriceModal({ isOpen, onClose, deckBuilder }: DeckPriceModalProps) {
  const state = useDeckPrice(deckBuilder, isOpen)

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" kicker={t('deck.price.kicker')} icon="dollar-sign" title={t('deck.price.title')}>
      {state.status === 'idle' ? (
        <EmptyState icon="dollar-sign" title={t('deck.price.emptyTitle')}>
          {t('deck.price.emptyText')}
        </EmptyState>
      ) : state.status === 'loading' ? (
        <div className="grid gap-3" aria-busy="true">
          <Skeleton className="h-16" />
          {[0, 1, 2, 3, 4].map((row) => (
            <Skeleton key={row} className="h-10" />
          ))}
        </div>
      ) : state.status === 'error' ? (
        <Callout tone="warning">{t('deck.price.loadError')}</Callout>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-1">
            <p className="m-0 text-micro font-semibold uppercase tracking-[0.08em] text-soft">{t('deck.price.totalLabel')}</p>
            <strong className="text-display font-bold tabular-nums text-foreground">{formatUsd(state.price.total)}</strong>
            <p className="m-0 text-body text-muted">{t('deck.price.cheapest')}</p>
          </div>

          {state.price.unpricedCopies > 0 ? (
            <Callout tone="warning">{t('deck.price.unpriced', { count: state.price.unpricedCopies })}</Callout>
          ) : null}

          <ul className="m-0 grid list-none p-0">
            {state.price.lines.map((line) => (
              <li key={line.cardId} className="flex min-w-0 items-baseline gap-3 border-t border-border-subtle py-2">
                <span className="w-8 shrink-0 text-body tabular-nums text-muted">{line.copies}×</span>
                <span className="min-w-0 flex-1 text-body text-foreground wrap-break-word">{line.name}</span>
                <span className="shrink-0 text-micro tabular-nums text-soft">{line.unit === null ? '' : formatUsd(line.unit)}</span>
                <span className="w-20 shrink-0 text-right text-body font-semibold tabular-nums text-foreground">
                  {line.total === null ? t('deck.price.noPrice') : formatUsd(line.total)}
                </span>
              </li>
            ))}
          </ul>

          <p className="m-0 text-micro text-soft">{t('deck.price.footnote', { date: formatUpdated(state.updated) })}</p>
        </div>
      )}
    </Modal>
  )
}
