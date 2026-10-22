import { cx } from '../ui/cx'

interface SideBadgeProps {
  side: 'A' | 'B'
  size?: 'sm' | 'md' | 'lg'
}

const SIZE = { sm: 'size-5 text-micro', md: 'size-7 text-body', lg: 'size-10 text-lead' } as const

/** Círculo "A" / "B" que identifica cada build del comparador: A lila y B ámbar, los de sus anillos (`BUILD_TONE`); el verde y el rojo quedan para mejor/peor. */
export function SideBadge({ side, size = 'md' }: SideBadgeProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-grid flex-none place-items-center rounded-full font-bold',
        SIZE[size],
        side === 'A' ? 'bg-primary-soft text-background' : 'bg-info text-info-foreground',
      )}
    >
      {side}
    </span>
  )
}
