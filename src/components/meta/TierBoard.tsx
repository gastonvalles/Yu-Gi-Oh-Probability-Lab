import type { ReactNode } from 'react'

import type { MetaCardStat, MetaTier } from '../../app/meta'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { cx } from '../ui/cx'
import { TrendArrow } from './TrendArrow'
import { TIER_ORDER, percent, tierColor, tierHint, tierLabel, tierTextClass } from './meta-format'

export type BoardView = 'now' | 'projected'

type Floors = ReadonlyArray<readonly [MetaTier, number]>

interface Rankable {
  tier: MetaTier
  projectedTier: MetaTier
  share: number
  projectedShare: number
}

/** Cada tier con lo que le toca, de la S a la D y de lo más jugado a lo menos; con la proyección, en el tier al que iría. */
export function groupByTier<T extends Rankable>(items: readonly T[], view: BoardView): Array<{ tier: MetaTier; items: T[] }> {
  const tierKey = view === 'projected' ? 'projectedTier' : 'tier'
  const shareOf = (item: T) => (view === 'projected' ? item.projectedShare : item.share)

  return TIER_ORDER.map((tier) => ({ tier, items: items.filter((item) => item[tierKey] === tier).sort((left, right) => shareOf(right) - shareOf(left)) }))
}

interface TierBoardProps {
  rows: ReadonlyArray<{ tier: MetaTier; tiles: ReadonlyArray<{ key: string; tile: ReactNode }> }>
  floors: Floors
}

/** La tier list clásica: una fila por tier, con la etiqueta de color a la izquierda y los tiles en fila (se dibujan todas, aunque estén vacías). */
export function TierBoard({ rows, floors }: TierBoardProps) {
  return (
    <div className="mt-3 overflow-hidden rounded-card border border-border-subtle">
      {rows.map(({ tier, tiles }) => (
        // En mobile la etiqueta es angosta y los tiles van a todo el ancho; en pantallas grandes, en fila con ancho fijo.
        <div key={tier} className="grid min-h-[5.75rem] grid-cols-[3.5rem_minmax(0,1fr)] border-b border-border-subtle last:border-b-0 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
          <div
            className={cx('grid place-items-center px-1 text-center text-micro font-bold sm:text-body sm:font-semibold', tierTextClass(tier))}
            style={{ backgroundColor: tierColor(tier) }}
            title={tierHint(tier, floors)}
          >
            {tierLabel(tier)}
          </div>
          <ul
            className="m-0 grid list-none grid-cols-4 gap-1 content-start bg-background p-1 sm:flex sm:flex-wrap"
            aria-label={`${tierLabel(tier)}: ${tierHint(tier, floors)}`}
          >
            {tiles.map(({ key, tile }) => (
              <li key={key} className="min-w-0">
                {tile}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

const TILE_BASE = 'relative block overflow-hidden rounded-none bg-input transition-transform duration-150'
const TILE_BADGE = 'absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-center text-micro font-bold text-white tabular-nums'

interface TileProps<T> {
  stat: T
  share: number
  onOpen: (stat: T) => void
}

/** La carta con lo que se juega: el porcentaje abajo y, si cambia, la flecha de la tendencia arriba a la derecha. */
export function CardTile({ stat, share, onOpen }: TileProps<MetaCardStat>) {
  return (
    <button
      type="button"
      className={`${TILE_BASE} aspect-[421/614] w-full hover:scale-[1.04] focus-visible:outline-none focus-visible:shadow-focus sm:w-[4.5rem]`}
      title={t('meta.tier.itemTitle', { name: stat.name, percent: percent(share) })}
      onClick={() => onOpen(stat)}
    >
      <CardArt remoteUrl={stat.image} name={stat.name} className="h-full w-full object-cover" />
      <span className={TILE_BADGE}>{percent(share)}</span>
      <TrendArrow trend={stat.trend} size={32} className="absolute right-0 top-0" />
    </button>
  )
}
