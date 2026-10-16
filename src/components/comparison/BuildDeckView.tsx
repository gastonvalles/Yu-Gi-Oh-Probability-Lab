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

export type ZoneKey = keyof BuildZones

const ZONES = [
  { key: 'main', labelKey: 'meta.compare.zoneMain' },
  { key: 'extra', labelKey: 'meta.compare.zoneExtra' },
  { key: 'side', labelKey: 'meta.compare.zoneSide' },
] as const satisfies ReadonlyArray<{ key: ZoneKey; labelKey: string }>

/** Las zonas que se muestran: las que tiene alguno de los dos mazos (así las dos listas llevan las mismas y quedan a la par). */
export function sharedZones(a: BuildZones, b: BuildZones): ZoneKey[] {
  return ZONES.map(({ key }) => key).filter((key) => key === 'main' || a[key].length > 0 || b[key].length > 0)
}

interface BuildDeckViewProps {
  side: 'A' | 'B'
  name: string
  zones: BuildZones
  /** Copias de B menos A por carta del Main (sólo las que cambian). */
  deltaByCardId: ReadonlyMap<string, number>
  onCardClick: (card: DeckCardInstance) => void
  /**
   * En escritorio las dos listas comparten las filas de la grilla de la pantalla (encabezado y una por zona): así cada zona queda a la altura de la
   * de la otra aunque un mazo tenga más cartas. `zoneKeys` son las zonas de las dos listas; `column`, la columna de la grilla donde va ésta.
   */
  aligned?: { zoneKeys: readonly ZoneKey[]; column: 1 | 3 }
}

const ZONE_STYLE = {
  main: 'bg-(--zone-main-background)',
  extra: 'bg-(--zone-extra-background)',
  side: 'bg-(--zone-side-background)',
} as const

/**
 * Grilla de una build. En el Main las cartas que cambian respecto de la otra se marcan fuerte (aro grueso con brillo y la cantidad: +N si B suma copias,
 * −N si B las saca) y las que no cambian se apagan: lo que importa es lo que difiere.
 */
export function BuildDeckView({ side, name, zones, deltaByCardId, onCardClick, aligned }: BuildDeckViewProps) {
  const visible = aligned ? ZONES.filter(({ key }) => aligned.zoneKeys.includes(key)) : ZONES.filter(({ key }) => zones[key].length > 0)
  const hasChanges = deltaByCardId.size > 0
  // La cantidad se muestra en la primera copia de cada carta que cambia (las demás llevan sólo el aro).
  const badged = new Set<string>()

  return (
    <section
      className={cx('grid min-w-0 gap-3', aligned && 'gap-y-3')}
      style={aligned ? { gridColumn: aligned.column, gridRow: `1 / span ${visible.length + 1}`, gridTemplateRows: 'subgrid' } : undefined}
      aria-label={t('meta.compare.deckAria', { side, name })}
    >
      <header className="flex min-w-0 items-center gap-2.5">
        <SideBadge side={side} />
        <strong className="truncate text-lead font-semibold text-foreground">{name}</strong>
      </header>
      {visible.map(({ key, labelKey }) => (
        <div key={key} className={cx('grid gap-1.5', aligned && 'grid-rows-[auto_minmax(0,1fr)]')}>
          <span className={overline}>
            {t(labelKey)} <span className="tabular-nums">[{formatInteger(zones[key].length)}]</span>
          </span>
          <div className={cx('grid grid-cols-8 content-start gap-1 rounded-card p-1.5 sm:grid-cols-10', ZONE_STYLE[key])}>
            {zones[key].map((card, index) => {
              const cardId = getDerivedCardId(card.apiCard.ygoprodeckId)
              const delta = key === 'main' ? deltaByCardId.get(cardId) ?? 0 : 0
              // B con más copias que A se marca en B; A con más copias que B, en A.
              const change = side === 'B' ? (delta > 0 ? 'added' : null) : delta < 0 ? 'removed' : null
              const dimmed = key === 'main' && hasChanges && delta === 0
              const pending = key === 'main' && isCardPendingClassification(card)
              const showBadge = change !== null && !badged.has(cardId)

              if (showBadge) {
                badged.add(cardId)
              }

              return (
                <button
                  key={`${card.instanceId}-${index}`}
                  type="button"
                  className={cx(
                    'relative min-w-0 cursor-pointer rounded-none border-0 bg-transparent p-0 transition-opacity duration-200',
                    change === 'added' && 'z-10 outline-[3px] -outline-offset-1 outline-success shadow-[0_0_16px_rgb(var(--success-rgb)/0.8)]',
                    change === 'removed' && 'z-10 outline-[3px] -outline-offset-1 outline-danger shadow-[0_0_16px_rgb(var(--danger-rgb)/0.8)]',
                    dimmed && 'opacity-40 hover:opacity-100 focus-visible:opacity-100',
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
                  {showBadge ? (
                    <span
                      className={cx(
                        'pointer-events-none absolute left-0.5 top-0.5 z-20 rounded-full px-1.5 text-micro font-bold leading-4 tabular-nums shadow-[0_1px_4px_rgba(0,0,0,0.6)]',
                        change === 'added' ? 'bg-success text-background' : 'bg-danger text-white',
                      )}
                    >
                      {change === 'added' ? '+' : '−'}
                      {formatInteger(Math.abs(delta))}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}
