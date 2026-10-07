import type { CSSProperties, ReactNode } from 'react'

import { cx } from './cx'
import { TONE, type Tone } from './tone'

interface ProgressRingProps {
  /** 0 a 1. */
  value: number
  /** Color del arco (por defecto el de marca). `onBrand` es para usarlo sobre una tarjeta violeta. */
  tone?: Tone | 'onBrand'
  /** Color propio ("R G B" o `var(--x-rgb)`), p. ej. el de un rol; reemplaza al tono. */
  color?: string
  /** Diámetro en px: 42 en listas, 76 en una tarjeta destacada. */
  size?: number
  strokeWidth?: number
  label: string
  /** Contenido del centro; por defecto el porcentaje. */
  children?: ReactNode
  className?: string
}

/** Anillo de progreso con el porcentaje al centro (como el de "Task Groups" del diseño). */
export function ProgressRing({ value, tone = 'brand', color, size = 42, strokeWidth, label, children, className }: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(1, value))
  const stroke = strokeWidth ?? (size >= 64 ? 8 : 4)
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const onBrand = tone === 'onBrand'

  return (
    <div
      className={cx('relative inline-grid shrink-0 place-items-center', onBrand ? '[--tone-rgb:255_255_255]' : TONE[tone].rgb, className)}
      style={{ width: size, height: size, ...(color ? ({ '--tone-rgb': color } as CSSProperties) : null) }}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className={onBrand ? 'stroke-white/25' : 'stroke-[rgb(var(--tone-rgb)/0.2)]'} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          className={cx('transition-[stroke-dashoffset] duration-300 motion-reduce:transition-none', onBrand ? 'stroke-lavender-light' : 'stroke-[rgb(var(--tone-rgb))]')}
        />
      </svg>
      <span className={cx('absolute inset-0 grid place-items-center font-semibold tabular-nums', size >= 64 ? 'text-body' : 'text-micro', onBrand ? 'text-primary-foreground' : 'text-foreground')}>
        {children ?? `${Math.round(clamped * 100)}%`}
      </span>
    </div>
  )
}
