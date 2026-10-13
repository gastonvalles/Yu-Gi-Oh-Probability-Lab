import type { MetaTrend } from '../../app/meta'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'

interface TrendArrowProps {
  trend: MetaTrend
  size?: number
  className?: string
}

/**
 * Flecha de tendencia, sólo el trazo con color: verde hacia arriba si sube, roja hacia abajo si baja; nada si está
 * estable. Lleva un borde negro grueso debajo para leerse sobre el arte de cualquier carta (también la roja sobre un marco naranja).
 */
export function TrendArrow({ trend, size = 24, className }: TrendArrowProps) {
  if (trend === 'flat') {
    return null
  }

  const name = trend === 'up' ? 'chevron-up' : 'chevron-down'

  return (
    // Las dos flechas comparten la misma celda de la grilla: la negra queda debajo de la de color.
    <span
      role="img"
      aria-label={t(trend === 'up' ? 'meta.trend.up' : 'meta.trend.down')}
      className={cx('inline-grid shrink-0 place-items-center [&>*]:col-start-1 [&>*]:row-start-1', className)}
    >
      <Icon name={name} size={size} strokeWidth={8.5} className="text-black/90" />
      <Icon name={name} size={size} strokeWidth={4.5} className={trend === 'up' ? 'text-success' : 'text-danger'} />
    </span>
  )
}
