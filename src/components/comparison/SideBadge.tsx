import { cx } from '../ui/cx'

interface SideBadgeProps {
  side: 'A' | 'B'
  size?: 'sm' | 'md' | 'lg'
}

const SIZE = { sm: 'size-5 text-micro', md: 'size-7 text-body', lg: 'size-10 text-lead' } as const

/** Círculo "A" / "B" que identifica cada build del comparador: A violeta, B celeste (el verde y el rojo quedan para mejor/peor). */
export function SideBadge({ side, size = 'md' }: SideBadgeProps) {
  return (
    <span
      className={cx(
        'inline-grid flex-none place-items-center rounded-full font-bold',
        SIZE[size],
        side === 'A' ? 'bg-primary text-primary-foreground' : 'bg-info text-background',
      )}
    >
      {side}
    </span>
  )
}
