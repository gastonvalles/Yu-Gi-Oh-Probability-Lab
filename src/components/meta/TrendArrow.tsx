import type { MetaTrend } from '../../app/meta-handtraps'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'

interface TrendArrowProps {
  trend: MetaTrend
  size?: number
  className?: string
}

/** Flecha de tendencia, sólo el trazo con color: verde hacia arriba si sube, roja hacia abajo si baja; nada si está estable. */
export function TrendArrow({ trend, size = 18, className }: TrendArrowProps) {
  if (trend === 'flat') {
    return null
  }

  return (
    <span
      role="img"
      aria-label={trend === 'up' ? 'Sube' : 'Baja'}
      className={cx('inline-grid shrink-0 place-items-center', trend === 'up' ? 'text-success' : 'text-danger', className)}
    >
      <Icon name={trend === 'up' ? 'chevron-up' : 'chevron-down'} size={size} strokeWidth={3.5} className="drop-shadow-[0_1px_2px_rgb(0_0_0/0.9)]" />
    </span>
  )
}
