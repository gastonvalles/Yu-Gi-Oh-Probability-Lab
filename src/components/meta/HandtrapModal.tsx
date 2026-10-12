import { useEffect, useState } from 'react'

import { MIN_WEEK_DECKS, PROJECTION_WEEKS, type HandtrapStat } from '../../app/meta-handtraps'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import type { ApiCardReference } from '../../types'
import { fetchCardsByIds, type ApiCardSearchResult } from '../../ygoprodeck'
import { CardOverlay, CardPanelBody, CardPanelFooter, CardPanelHeader } from '../card-detail/CardOverlay'
import { buildCardSummary } from '../card-detail/card-summary'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { choiceChip } from '../ui/surfaces'
import { overline } from '../ui/typography'
import { TREND_LOOK, percent, tierLabel, trendText, usageText } from './meta-format'
import { TrendArrow } from './TrendArrow'

const MAX_ARCHETYPE_CHIPS = 16
/** La carta no cambia: un día en el dispositivo evita volver a pedirla. */
const CARD_PERSIST_MS = 24 * 60 * 60 * 1000

interface HandtrapModalProps {
  stat: HandtrapStat | null
  onClose: () => void
  onPickArchetype: (name: string) => void
  onShowDecks: (cardId: number) => void
}

/** Detalle de una hand trap del tier list, en el mismo marco de carta que el resto de la app. */
export function HandtrapModal({ stat, onClose, onPickArchetype, onShowDecks }: HandtrapModalProps) {
  return stat ? <HandtrapOverlay key={stat.id} stat={stat} onClose={onClose} onPickArchetype={onPickArchetype} onShowDecks={onShowDecks} /> : null
}

function HandtrapOverlay({ stat, onClose, onPickArchetype, onShowDecks }: HandtrapModalProps & { stat: HandtrapStat }) {
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

  return (
    <CardOverlay
      ariaLabel={t('meta.handtrap.ariaLabel', { name: stat.name })}
      panelLabel={t('meta.handtrap.panelLabel')}
      name={stat.name}
      card={card ?? placeholderCard(stat)}
      tall
      artOverlay={<TrendArrow trend={stat.trend} size={56} />}
      onClose={onClose}
    >
      <CardPanelHeader
        title={stat.name}
        lines={[
          summary ? `${summary.typeLine}${summary.statLine ? ` · ${summary.statLine}` : ''}` : null,
          t('meta.handtrap.shareLine', { tier: tierLabel(stat.tier), percent: percent(stat.share), decks: formatInteger(stat.decks) }),
          t('meta.handtrap.usageLine', {
            main: usageText(stat.main.decks, stat.main.copies, stat.decks),
            side: usageText(stat.side.decks, stat.side.copies, stat.decks),
          }),
        ]}
      />
      <CardPanelBody label={t('meta.handtrap.bodyLabel')}>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <span className={overline}>{t('meta.handtrap.trend')}</span>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={TREND_LOOK[stat.trend].tone}>{trendText(stat)}</Badge>
              <span className="text-micro text-white/66">{t('meta.handtrap.projection', { ahead: formatInteger(PROJECTION_WEEKS) })}</span>
            </div>
            {/* Una semana con pocos decks se muestra vacía: tampoco pesa en la tendencia. */}
            <p className="m-0 text-micro text-white/66 tabular-nums" title={t('meta.handtrap.weeklyHint')}>
              {t('meta.handtrap.weekly', { values: stat.weekly.map((week) => (week.decks >= MIN_WEEK_DECKS ? percent(week.share) : '—')).join(' · ') })}
            </p>
          </div>

          <div className="grid gap-1.5">
            <span className={overline}>{t('meta.handtrap.archetypes')}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {stat.archetypes.slice(0, MAX_ARCHETYPE_CHIPS).map((archetype) => (
                <button
                  key={archetype.name}
                  type="button"
                  className={cx(choiceChip, 'h-7 gap-1.5 px-2.5 text-micro')}
                  title={t('meta.handtrap.onlyArchetype', { name: archetype.name })}
                  onClick={() => onPickArchetype(archetype.name)}
                >
                  {archetype.name}
                  <span className="font-medium text-soft tabular-nums">
                    {formatInteger(archetype.decks)}/{formatInteger(archetype.total)}
                  </span>
                </button>
              ))}
              {stat.archetypes.length > MAX_ARCHETYPE_CHIPS ? (
                <span className="text-micro text-white/66">{t('meta.handtrap.moreArchetypes', { count: formatInteger(stat.archetypes.length - MAX_ARCHETYPE_CHIPS) })}</span>
              ) : null}
            </div>
          </div>
        </div>
      </CardPanelBody>
      <CardPanelFooter>
        <Button variant="primary" size="md" fullWidth icon="layers" onClick={() => onShowDecks(stat.id)}>
          {t('meta.handtrap.showDecks')}
        </Button>
      </CardPanelFooter>
    </CardOverlay>
  )
}

/** Hasta que llega la carta completa, el marco muestra la imagen chica del tier list. */
function placeholderCard(stat: HandtrapStat): ApiCardReference {
  return {
    ygoprodeckId: stat.id,
    cardType: '',
    frameType: '',
    description: null,
    race: null,
    attribute: null,
    level: null,
    linkValue: null,
    atk: null,
    def: null,
    archetype: null,
    ygoprodeckUrl: null,
    imageUrl: null,
    imageUrlSmall: stat.image,
    banlist: { tcg: null, ocg: null, goat: null },
    genesys: { points: null },
  }
}
