import { buildDeckZoneTypeCounts } from '../app/deck-presentation'
import type { DeckCardInstance, DeckZone as DeckZoneType } from '../app/model'
import { formatInteger } from '../app/utils'
import { ZONE_STYLES, ZONE_TYPE_SWATCH } from './deck-zone-styles'
import { Heading } from './ui/Heading'
import { cx } from './ui/cx'

interface DeckZoneHeaderProps {
  zone: DeckZoneType
  title: string
  cards: DeckCardInstance[]
  /** Cuántas cartas dice el título: por defecto, las de `cards` (quien sólo tiene datos de algunas pasa el total). */
  count?: number
  className?: string
}

/** Encabezado de una zona del deck (igual en escritorio y celular, y en el siding del duelo): el punto de su color, el título con el conteo y la cantidad por tipo con su color. */
export function DeckZoneHeader({ zone, title, cards, count = cards.length, className }: DeckZoneHeaderProps) {
  const zoneTypeCounts = buildDeckZoneTypeCounts(zone, cards)

  return (
    <div className={cx('flex min-w-0 items-center justify-between gap-3 px-0.5', className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: ZONE_STYLES[zone].dot }} aria-hidden="true" />
        <Heading level="section" className="whitespace-nowrap">
          {title.replace(' Deck', '')} <span className="font-medium text-muted tabular-nums">[{formatInteger(count)}]</span>
        </Heading>
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        {zoneTypeCounts.length > 0 ? (
          <div className="flex flex-none items-center gap-3">
            {zoneTypeCounts.map((entry) => (
              <span key={entry.kind} className="inline-flex items-center gap-1.5 text-body font-semibold text-muted tabular-nums" title={`${formatInteger(entry.count)} ${entry.label}`}>
                <span className={cx('size-2.5 rounded-tag', ZONE_TYPE_SWATCH[entry.kind])} aria-hidden="true" />
                {formatInteger(entry.count)}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
