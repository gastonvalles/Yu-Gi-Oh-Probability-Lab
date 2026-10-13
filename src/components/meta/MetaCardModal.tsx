import { useEffect, useState } from 'react'

import { META_DECKS, PROJECTION_WEEKS, kindsOf, type MetaCardKind, type MetaCardStat } from '../../app/meta'
import { placeholderCard } from '../../app/card-placeholder'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import { fetchCardsByIds, type ApiCardSearchResult } from '../../ygoprodeck'
import { CardOverlay, CardPanelBody, CardPanelFooter, CardPanelHeader } from '../card-detail/CardOverlay'
import { buildCardSummary } from '../card-detail/card-summary'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { choiceChip } from '../ui/surfaces'
import { overline } from '../ui/typography'
import { TREND_LOOK, percent, tierLabel, trendText, usageText, weeklyText } from './meta-format'
import { TrendArrow } from './TrendArrow'

const MAX_ARCHETYPE_CHIPS = 16
/** La carta no cambia: un día en el dispositivo evita volver a pedirla. */
const CARD_PERSIST_MS = 24 * 60 * 60 * 1000
const KIND_LABEL_KEY = { handtrap: 'meta.card.kind.handtrap', boardbreaker: 'meta.card.kind.boardbreaker' } as const satisfies Record<MetaCardKind, string>

interface MetaCardModalProps {
  stat: MetaCardStat | null
  onClose: () => void
  onPickArchetype: (name: string) => void
  onShowDecks: (cardId: number) => void
}

/** Detalle de una carta de los tier lists (hand trap o boardbreaker), en el mismo marco de carta que el resto de la app. */
export function MetaCardModal({ stat, onClose, onPickArchetype, onShowDecks }: MetaCardModalProps) {
  return stat ? <MetaCardOverlay key={stat.id} stat={stat} onClose={onClose} onPickArchetype={onPickArchetype} onShowDecks={onShowDecks} /> : null
}

function MetaCardOverlay({ stat, onClose, onPickArchetype, onShowDecks }: MetaCardModalProps & { stat: MetaCardStat }) {
  const [card, setCard] = useState<ApiCardSearchResult | null>(null)

  // El tier list sólo trae nombre e imagen chica; la carta completa (arte grande, tipo, banlist) se pide al abrir.
  useEffect(() => {
    let cancelled = false

    fetchCardsByIds([stat.id], { persistForMs: CARD_PERSIST_MS })
      .then(([fetched]) => {
        if (!cancelled && fetched) {
          setCard(fetched)
        }
      })
      .catch(() => {
        // Sin la carta completa se sigue con la imagen chica del tier list.
      })

    return () => {
      cancelled = true
    }
  }, [stat.id])

  const summary = card ? buildCardSummary(card) : null
  // Una carta puede estar en las dos listas (un Bystial es hand trap y boardbreaker): se dice qué es.
  const kinds = kindsOf(META_DECKS.cards[String(stat.id)]).map((kind) => t(KIND_LABEL_KEY[kind])).join(' · ')

  return (
    <CardOverlay
      ariaLabel={t('meta.card.ariaLabel', { name: stat.name })}
      panelLabel={t('meta.card.panelLabel')}
      name={stat.name}
      card={card ?? placeholderCard(stat.id, stat.image)}
      tall
      artOverlay={<TrendArrow trend={stat.trend} size={56} />}
      onClose={onClose}
    >
      <CardPanelHeader
        title={stat.name}
        lines={[
          summary ? `${summary.typeLine}${summary.statLine ? ` · ${summary.statLine}` : ''}` : null,
          kinds,
          t('meta.detail.shareLine', { tier: tierLabel(stat.tier), percent: percent(stat.share), decks: formatInteger(stat.decks) }),
          t('meta.card.usageLine', {
            main: usageText(stat.main.decks, stat.main.copies, stat.decks),
            side: usageText(stat.side.decks, stat.side.copies, stat.decks),
          }),
        ]}
      />
      <CardPanelBody label={t('meta.card.bodyLabel')}>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <span className={overline}>{t('meta.detail.trend')}</span>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={TREND_LOOK[stat.trend].tone}>{trendText(stat)}</Badge>
              <span className="text-micro text-white/66">{t('meta.detail.projection', { ahead: formatInteger(PROJECTION_WEEKS) })}</span>
            </div>
            <p className="m-0 text-micro text-white/66 tabular-nums" title={t('meta.detail.weeklyHint')}>
              {t('meta.detail.weekly', { values: weeklyText(stat.weekly) })}
            </p>
          </div>

          <div className="grid gap-1.5">
            <span className={overline}>{t('meta.card.archetypes')}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {stat.archetypes.slice(0, MAX_ARCHETYPE_CHIPS).map((archetype) => (
                <button
                  key={archetype.name}
                  type="button"
                  className={cx(choiceChip, 'h-7 gap-1.5 px-2.5 text-micro')}
                  title={t('meta.card.onlyArchetype', { name: archetype.name })}
                  onClick={() => onPickArchetype(archetype.name)}
                >
                  {archetype.name}
                  <span className="font-medium text-soft tabular-nums">
                    {formatInteger(archetype.decks)}/{formatInteger(archetype.total)}
                  </span>
                </button>
              ))}
              {stat.archetypes.length > MAX_ARCHETYPE_CHIPS ? (
                <span className="text-micro text-white/66">{t('meta.card.moreArchetypes', { count: formatInteger(stat.archetypes.length - MAX_ARCHETYPE_CHIPS) })}</span>
              ) : null}
            </div>
          </div>
        </div>
      </CardPanelBody>
      <CardPanelFooter>
        <Button variant="primary" size="md" fullWidth icon="layers" onClick={() => onShowDecks(stat.id)}>
          {t('meta.card.showDecks')}
        </Button>
      </CardPanelFooter>
    </CardOverlay>
  )
}
