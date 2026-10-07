import type { ElementType, HTMLAttributes } from 'react'

import { cx } from './cx'
import { TONE, type Tone } from './tone'

/**
 * card: tarjeta de primer nivel sobre el lienzo · inset: bloque hundido dentro de una tarjeta ·
 * raised: flotante (menús, popovers).
 */
type CardLevel = 'card' | 'inset' | 'raised'
type CardPadding = 'none' | 'sm' | 'md' | 'lg'

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType
  level?: CardLevel
  /** Tiñe la tarjeta con un tono (solo en `card`). */
  tone?: Tone
  padding?: CardPadding
}

const LEVEL: Record<CardLevel, string> = {
  card: 'rounded-card border border-border-subtle bg-card-background bg-linear-to-b from-white/4 to-transparent shadow-card',
  inset: 'rounded-control border border-border-subtle bg-black/25',
  raised: 'rounded-card border border-white/10 bg-surface-raised shadow-raised',
}

const PADDING: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4 min-[1101px]:p-5',
  lg: 'p-5 min-[1101px]:p-6',
}

/** Superficie base de la app: todas las tarjetas salen de acá (mismo radio, borde, fondo y sombra). */
export function Card({ as: Component = 'section', level = 'card', tone, padding = 'md', className, ...props }: CardProps) {
  return (
    <Component
      className={cx(
        'min-w-0',
        tone && level === 'card' ? cx('rounded-card border shadow-card', TONE[tone].wash, TONE[tone].rgb) : LEVEL[level],
        PADDING[padding],
        className,
      )}
      {...props}
    />
  )
}
