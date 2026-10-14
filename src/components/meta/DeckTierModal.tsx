import { cardImageSrc } from '../../app/card-image-source'
import { PROJECTION_WEEKS, coverArtUrl, type DeckTierStat, type MetaDeck } from '../../app/meta'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { listItem } from '../ui/surfaces'
import { overline } from '../ui/typography'
import { TREND_LOOK, formatMetaDate, percent, tierLabel, trendText, weeklyText } from './meta-format'

const MAX_RESULTS = 6

interface DeckTierModalProps {
  stat: DeckTierStat | null
  onClose: () => void
  onOpenDeck: (deck: MetaDeck) => void
  onShowDecks: (name: string) => void
}

/** Detalle de un deck del tier list: cómo le va, hacia dónde va y sus mejores resultados (cada uno abre el deck entero). */
export function DeckTierModal({ stat, onClose, onOpenDeck, onShowDecks }: DeckTierModalProps) {
  if (!stat) {
    return null
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="md"
      icon="chart"
      kicker={t('meta.deckTier.kicker')}
      title={stat.name}
      footer={
        <Button variant="primary" size="sm" icon="layers" onClick={() => onShowDecks(stat.name)}>
          {t('meta.deckTier.showDecks')}
        </Button>
      }
    >
      <div className="grid gap-4">
        <div className="flex items-center gap-3">
          {stat.cover === null ? null : (
            <img src={cardImageSrc(coverArtUrl(stat.cover), 320)} alt="" decoding="async" className="size-20 shrink-0 rounded-none object-cover" />
          )}
          <div className="grid min-w-0 gap-1.5">
            <p className="m-0 text-body font-semibold text-foreground">
              {t('meta.detail.shareLine', { tier: tierLabel(stat.tier), percent: percent(stat.share), decks: formatInteger(stat.decks) })}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={TREND_LOOK[stat.trend].tone}>{trendText(stat)}</Badge>
              <span className="text-micro text-muted">{t('meta.detail.projection', { ahead: formatInteger(PROJECTION_WEEKS) })}</span>
            </div>
          </div>
        </div>

        <p className="m-0 text-micro text-muted tabular-nums" title={t('meta.detail.weeklyHint')}>
          {t('meta.detail.weekly', { values: weeklyText(stat.weekly) })}
        </p>

        <div className="grid gap-1.5">
          <span className={overline}>{t('meta.deckTier.results')}</span>
          <ul className="m-0 grid list-none gap-1 p-0">
            {stat.results.slice(0, MAX_RESULTS).map((deck) => (
              <li key={deck.id}>
                <button
                  type="button"
                  className={cx(listItem, 'flex w-full min-w-0 items-center gap-2 px-2 py-1.5 text-left text-body focus-visible:outline-none focus-visible:shadow-focus')}
                  title={t('meta.deckTier.openDeck', { player: deck.player ?? deck.name })}
                  onClick={() => onOpenDeck(deck)}
                >
                  <Badge tone="info" size="sm" icon="trophy">
                    {deck.placement ?? '—'}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-semibold text-foreground">{deck.player ?? t('meta.deckTier.noPlayer')}</span>
                    <span className="text-muted"> · {[deck.tournament, formatMetaDate(deck.date)].filter(Boolean).join(' · ')}</span>
                  </span>
                  <Icon name="chevron-right" size={16} className="shrink-0 text-soft" />
                </button>
              </li>
            ))}
          </ul>
          {stat.results.length > MAX_RESULTS ? (
            <p className="m-0 text-micro text-muted">{t('meta.deckTier.moreResults', { count: formatInteger(stat.results.length - MAX_RESULTS) })}</p>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
