import { cx } from './cx'
import { TONE, type Tone } from './tone'

interface MeterProps {
  /** 0 a 1. */
  value: number
  tone?: Tone
  size?: 'sm' | 'md' | 'lg'
  /** Marcas verticales (0 a 1) sobre la barra, p. ej. los umbrales de la nota. */
  ticks?: ReadonlyArray<{ value: number; label?: string }>
  label: string
  className?: string
}

const HEIGHT = { sm: 'h-1.5', md: 'h-2', lg: 'h-3' } as const

/** Barra de progreso o de nivel: misma altura, pista y degradé en toda la app. */
export function Meter({ value, tone = 'brand', size = 'md', ticks, label, className }: MeterProps) {
  const clamped = Math.max(0, Math.min(1, value))

  return (
    <div
      className={cx('relative overflow-hidden rounded-full bg-foreground/8', HEIGHT[size], TONE[tone].rgb, className)}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
    >
      <div
        className="h-full origin-left rounded-[inherit] bg-linear-to-r from-[rgb(var(--tone-rgb)/0.55)] to-[rgb(var(--tone-rgb))] transition-transform duration-[240ms] motion-reduce:transition-none"
        style={{ transform: `scaleX(${clamped})` }}
      />
      {ticks?.map((tick) => (
        <span key={tick.value} className="absolute inset-y-0 w-0.5 bg-background/90" style={{ left: `${tick.value * 100}%` }} title={tick.label} />
      ))}
    </div>
  )
}
