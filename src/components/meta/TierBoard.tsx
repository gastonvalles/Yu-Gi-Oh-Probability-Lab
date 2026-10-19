import type { ReactNode } from 'react'

import type { MetaCardStat, MetaTier } from '../../app/meta'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { Badge } from '../ui/Badge'
import { cx } from '../ui/cx'
import { TrendArrow } from './TrendArrow'
import { TIER_ORDER, TREND_LOOK, percent, tierColor, tierHint, tierLabel, tierTextClass, trendPoints } from './meta-format'

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

/**
 * La tier list: un bloque por tier, sobre el lienzo y sin caja (se dibujan todos, aunque estén vacíos). En el celular, el nombre del tier con cuántas
 * cartas tiene y qué pide (el tooltip no se ve con el dedo) y las cartas en cuatro columnas; desde 1101 px, el cuadrado de color a la izquierda y las
 * cartas en fila, con su porcentaje y su tendencia debajo (ver `CardTile`).
 */
export function TierBoard({ rows, floors }: TierBoardProps) {
  return (
    <div className="mt-3">
      {rows.map(({ tier, tiles }) => (
        <section
          key={tier}
          aria-label={`${tierLabel(tier)}: ${tierHint(tier, floors)}`}
          className="grid gap-2 border-t border-border-subtle py-3.5 first:border-t-0 min-[1101px]:grid-cols-[4rem_minmax(0,1fr)] min-[1101px]:gap-4"
        >
          <div className="flex items-center gap-2 min-[1101px]:hidden">
            <strong className="text-body font-semibold text-foreground">{tierLabel(tier)}</strong>
            <Badge size="sm">{formatInteger(tiles.length)}</Badge>
            <span className="ml-auto min-w-0 truncate text-micro text-muted">{tierHint(tier, floors)}</span>
          </div>
          <div
            className={cx('hidden size-16 place-items-center px-1 text-center text-micro font-bold leading-tight min-[1101px]:grid', tierTextClass())}
            style={{ backgroundColor: tierColor(tier) }}
            title={`${tierHint(tier, floors)} · ${formatInteger(tiles.length)}`}
          >
            {tierLabel(tier)}
          </div>
          <ul className="m-0 grid list-none grid-cols-4 content-start gap-1.5 p-0 min-[560px]:grid-cols-6 min-[820px]:grid-cols-8 min-[1101px]:gap-2 min-[1300px]:grid-cols-10">
            {tiles.map(({ key, tile }) => (
              <li key={key} className="min-w-0">
                {tile}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

interface TileProps<T> {
  stat: T
  share: number
  onOpen: (stat: T) => void
}

/**
 * La carta con lo que se juega. En el celular, el porcentaje abajo (sobre el arte) y, si cambia, la flecha de la tendencia arriba a la derecha; desde 1101 px
 * esas dos cosas van debajo de la carta, en texto: «72%» y «▲ 1,4» (puntos que se espera que suba o baje). El botón se declara recto: el reset global le da radio.
 */
export function CardTile({ stat, share, onOpen }: TileProps<MetaCardStat>) {
  const look = TREND_LOOK[stat.trend]

  return (
    <button
      type="button"
      className="group grid w-full content-start gap-1 rounded-none text-left focus-visible:outline-none focus-visible:shadow-focus"
      title={t('meta.tier.itemTitle', { name: stat.name, percent: percent(share) })}
      onClick={() => onOpen(stat)}
    >
      <span className="relative block aspect-[421/614] w-full overflow-hidden rounded-none bg-input">
        <CardArt remoteUrl={stat.image} name={stat.name} className="h-full w-full object-cover" />
        <span className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-center text-micro font-bold text-white tabular-nums min-[1101px]:hidden">{percent(share)}</span>
        <TrendArrow trend={stat.trend} size={32} className="absolute right-0 top-0 min-[1101px]:hidden" />
      </span>
      <span className="hidden min-[1101px]:grid min-[1101px]:gap-0.5">
        <b className="text-body font-semibold tabular-nums text-foreground">{percent(share)}</b>
        {stat.trend === 'flat' ? null : (
          <span className={cx('text-micro font-semibold tabular-nums', look.tone === 'success' ? 'text-success' : 'text-danger-soft')}>
            <span aria-hidden="true">{stat.trend === 'up' ? '▲' : '▼'} </span>
            <span className="sr-only">{look.label} </span>
            {trendPoints(stat)}
          </span>
        )}
      </span>
    </button>
  )
}
