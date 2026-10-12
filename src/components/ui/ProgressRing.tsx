import type { CSSProperties, ReactNode } from 'react'

import { formatWholePercent } from '../../app/utils'
import { cx } from './cx'
import { RING_TRANSITION, clamp01, ringCenterText, ringGeometry } from './ring-shared'
import { TONE, type Tone } from './tone'
import { useRingReveal } from './use-ring-reveal'

interface ProgressRingProps {
  /** 0 a 1. */
  value: number
  /** Color del arco (por defecto el de marca). `onBrand` es para usarlo sobre una tarjeta violeta. */
  tone?: Tone | 'onBrand'
  /** Color propio ("R G B" o `var(--x-rgb)`), p. ej. el de un rol; reemplaza al tono. */
  color?: string
  /** Diámetro en px: 42 en listas, 76 en una tarjeta destacada, 168 como protagonista. */
  size?: number
  strokeWidth?: number
  label: string
  /** Marcas sobre el anillo (0 a 1), p. ej. los umbrales de la nota. */
  ticks?: ReadonlyArray<number>
  /** Milisegundos de espera antes de llenarse (para escalonar varios anillos). */
  delay?: number
  /** Contenido del centro; por defecto el porcentaje entero (`formatWholePercent`: nunca "100%" ni "0%" si no lo es). */
  children?: ReactNode
}

/** Anillo de progreso que se llena al aparecer, con el porcentaje al centro. Es la única forma de mostrar un porcentaje en la app. */
export function ProgressRing({ value, tone = 'brand', color, size = 42, strokeWidth, label, ticks, delay = 0, children }: ProgressRingProps) {
  const clamped = clamp01(value)
  const { stroke, radius, circumference, center } = ringGeometry(size, strokeWidth)
  const { ref, revealed, settled, delayMs, instant } = useRingReveal<HTMLDivElement>(delay)
  const shown = revealed ? clamped : 0
  const onBrand = tone === 'onBrand'

  return (
    <div
      ref={ref}
      className={cx('relative inline-grid shrink-0 place-items-center', !settled && 'will-change-transform', onBrand ? '[--tone-rgb:255_255_255]' : TONE[tone].rgb)}
      style={{ width: size, height: size, ...(color ? ({ '--tone-rgb': color } as CSSProperties) : null) }}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={center} cy={center} r={radius} fill="none" strokeWidth={stroke} className={onBrand ? 'stroke-white/25' : 'stroke-[rgb(var(--tone-rgb)/0.18)]'} />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap={shown > 0 ? 'round' : 'butt'}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown)}
          style={{ transitionDelay: `${delayMs}ms`, ...(instant ? { transitionDuration: '0ms' } : null) }}
          // Sobre violeta el arco es lavanda, salvo que venga un color propio (p. ej. verde = listo).
          className={cx(RING_TRANSITION, onBrand && !color ? 'stroke-lavender-light' : 'stroke-[rgb(var(--tone-rgb))]')}
        />
        {ticks?.map((tick) => {
          const angle = tick * 2 * Math.PI
          const inner = radius - stroke / 2
          const outer = radius + stroke / 2

          return (
            <line
              key={tick}
              x1={center + inner * Math.cos(angle)}
              y1={center + inner * Math.sin(angle)}
              x2={center + outer * Math.cos(angle)}
              y2={center + outer * Math.sin(angle)}
              strokeWidth={2.5}
              className="stroke-background"
            />
          )
        })}
      </svg>
      <span className={cx('absolute inset-0 grid place-items-center text-center tabular-nums', ringCenterText(size), onBrand ? 'text-primary-foreground' : 'text-foreground')}>
        {children ?? formatWholePercent(clamped)}
      </span>
    </div>
  )
}
