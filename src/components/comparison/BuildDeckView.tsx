import { getDerivedCardId } from '../../app/calculator-state'
import { isCardPendingClassification } from '../../app/build-comparison'
import type { DeckCardInstance } from '../../app/model'
import type { BuildZones } from '../../app/saved-builds'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { overline } from '../ui/typography'
import { SideBadge } from './SideBadge'
import { CardArt } from '../CardArt'

const ZONES = [
  { key: 'main', labelKey: 'meta.compare.zoneMain' },
  { key: 'extra', labelKey: 'meta.compare.zoneExtra' },
  { key: 'side', labelKey: 'meta.compare.zoneSide' },
] as const satisfies ReadonlyArray<{ key: keyof BuildZones; labelKey: string }>

interface BuildDeckViewProps {
  side: 'A' | 'B'
  name: string
  zones: BuildZones
  /** Copias de B menos A por carta del Main (sólo las que cambian). */
  deltaByCardId: ReadonlyMap<string, number>
  onCardClick: (card: DeckCardInstance) => void
}

const ZONE_STYLE = {
  main: 'bg-(--zone-main-background)',
  extra: 'bg-(--zone-extra-background)',
  side: 'bg-(--zone-side-background)',
} as const

/** Grilla de una build; en el Main se marcan las cartas que cambian respecto de la otra. */
export function BuildDeckView({ side, name, zones, deltaByCardId, onCardClick }: BuildDeckViewProps) {
  return (
    <section className="grid min-w-0 gap-3" aria-label={t('meta.compare.deckAria', { side, name })}>
      <header className="flex min-w-0 items-center gap-2.5">
        <SideBadge side={side} />
        <strong className="truncate text-lead font-semibold text-foreground">{name}</strong>
      </header>
      {ZONES.map(({ key, labelKey }) =>
        zones[key].length === 0 ? null : (
          <div key={key} className="grid gap-1.5">
            <span className={overline}>
              {t(labelKey)} <span className="tabular-nums">[{formatInteger(zones[key].length)}]</span>
            </span>
            <div className={cx('grid grid-cols-8 gap-1 rounded-card p-1.5 sm:grid-cols-10', ZONE_STYLE[key])}>
              {zones[key].map((card, index) => {
                const delta = key === 'main' ? deltaByCardId.get(getDerivedCardId(card.apiCard.ygoprodeckId)) ?? 0 : 0
                // B con más copias que A se marca en B; A con más copias que B, en A.
                const change = side === 'B' ? (delta > 0 ? 'added' : null) : delta < 0 ? 'removed' : null
                const pending = key === 'main' && isCardPendingClassification(card)

                return (
                  <button
                    key={`${card.instanceId}-${index}`}
                    type="button"
                    className={cx(
                      'relative min-w-0 cursor-pointer border-0 bg-transparent p-0',
                      change === 'added' && '-outline-offset-1 outline-2 outline-success/90',
                      change === 'removed' && '-outline-offset-1 outline-2 outline-danger/90',
                      pending &&
                        "after:absolute after:right-0.5 after:top-0.5 after:grid after:size-4 after:place-items-center after:rounded-full after:bg-warning after:text-micro after:font-bold after:text-[#1a1204] after:content-['?']",
                    )}
                    title={pending ? t('meta.compare.unclassifiedCard', { name: card.name }) : card.name}
                    onClick={() => onCardClick(card)}
                  >
                    <CardArt
                      remoteUrl={card.apiCard.imageUrlSmall ?? card.apiCard.imageUrl}
                      name={card.name}
                      className="block aspect-[0.72] w-full bg-input object-cover"
                      limitCard={card.apiCard}
                      limitBadgeSize="sm"
                    />
                  </button>
                )
              })}
            </div>
          </div>
        ),
      )}
    </section>
  )
}
