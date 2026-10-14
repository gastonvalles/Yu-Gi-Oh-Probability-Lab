import type { HTMLAttributes } from 'react'

import { cx } from './cx'
import { Icon, type IconName } from './Icon'
import { TONE, type Tone } from './tone'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
  size?: 'sm' | 'md'
  /** pill: redondeada (estados, conteos) · tag: esquinas suaves (tipos como "Salida"). */
  shape?: 'pill' | 'tag'
  /** Punto de color a la izquierda. */
  dot?: boolean
  icon?: IconName
  /** El texto puede ocupar varias líneas (un nombre largo, como "Regional Qualifier Stamp"): nunca más ancho que lo que tiene alrededor, y crece a lo alto en vez de salirse. */
  wrap?: boolean
}

const SIZE = {
  sm: 'h-5 gap-1 px-1.5 text-micro',
  md: 'h-6 gap-1.5 px-2 text-micro',
} as const

const SIZE_WRAP = {
  sm: 'min-h-5 gap-1 px-1.5 py-0.5 text-micro',
  md: 'min-h-6 gap-1.5 px-2 py-1 text-micro',
} as const

/** Etiqueta compacta de estado, conteo o tipo. Un solo estilo para toda la app. */
export function Badge({ tone = 'neutral', size = 'md', shape = 'pill', dot = false, icon, wrap = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center border font-semibold',
        wrap ? 'max-w-full text-left leading-snug whitespace-normal [overflow-wrap:anywhere]' : 'shrink-0 leading-none whitespace-nowrap',
        shape === 'pill' ? 'rounded-full' : 'rounded-tag',
        wrap ? SIZE_WRAP[size] : SIZE[size],
        TONE[tone].tint,
        TONE[tone].text,
        className,
      )}
      {...props}
    >
      {dot ? <span className={cx('size-1.5 rounded-full', TONE[tone].fill)} aria-hidden="true" /> : null}
      {icon ? <Icon name={icon} size={size === 'sm' ? 11 : 13} strokeWidth={2} /> : null}
      {children}
    </span>
  )
}
