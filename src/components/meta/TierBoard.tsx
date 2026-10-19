import type { ReactNode } from 'react'

import type { MetaCardStat, MetaTier } from '../../app/meta'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { cx } from '../ui/cx'
import { TILE_WIDTH, TierStrip } from './TierStrip'
import { TrendArrow } from './TrendArrow'
import { TIER_ORDER, TREND_LOOK, percent, tierColor, tierHint, tierLabel, trendPoints } from './meta-format'

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
 * La tier list, como la de siempre (Gastón, 2026-10-19: «las tierlist deben ser así»): una fila por tier (se dibujan todas, aunque estén vacías) con el recuadro de color y la letra grande a la izquierda y las
 * cartas pegadas una a otra a su lado (`TierStrip`). Cada carta lleva su porcentaje abajo y, si cambia, la flecha de la tendencia arriba a la derecha; lo que pide cada tier (el piso) está en el tooltip de la
 * letra y en la ayuda de la pantalla.
 */
export function TierBoard({ rows, floors }: TierBoardProps) {
  return (
    <div className="mt-3 grid gap-0.5">
      {rows.map(({ tier, tiles }) => (
        <TierStrip key={tier} label={tier} color={tierColor(tier)} ariaLabel={`${tierLabel(tier)}: ${tierHint(tier, floors)}`} title={`${tierHint(tier, floors)} · ${formatInteger(tiles.length)}`}>
          {tiles.map(({ key, tile }) => (
            <li key={key} className={cx('min-w-0', TILE_WIDTH)}>
              {tile}
            </li>
          ))}
        </TierStrip>
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
 * La carta con lo que se juega: el porcentaje abajo (sobre el arte) y, si cambia, la flecha de la tendencia arriba a la derecha. El detalle («▲ 1,4» puntos que se espera que suba o baje) está en el tooltip y en
 * la ficha de la carta. El botón se declara recto: el reset global le da radio.
 */
export function CardTile({ stat, share, onOpen }: TileProps<MetaCardStat>) {
  const look = TREND_LOOK[stat.trend]
  const trend = stat.trend === 'flat' ? '' : ` · ${look.label} ${trendPoints(stat)}`

  return (
    <button
      type="button"
      className="group block w-full rounded-none text-left focus-visible:outline-none focus-visible:shadow-focus"
      title={t('meta.tier.itemTitle', { name: stat.name, percent: percent(share) }) + trend}
      onClick={() => onOpen(stat)}
    >
      <span className="relative block aspect-[421/614] w-full overflow-hidden rounded-none bg-input">
        <CardArt tilt remoteUrl={stat.image} name={stat.name} className="h-full w-full object-cover" />
        <span className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-center text-micro font-bold tabular-nums text-white">{percent(share)}</span>
        <TrendArrow trend={stat.trend} size={32} className="absolute right-0 top-0" />
      </span>
    </button>
  )
}
