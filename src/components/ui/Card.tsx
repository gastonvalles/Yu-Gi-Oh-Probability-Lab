import type { ElementType, HTMLAttributes } from 'react'

import { cx } from './cx'
import { TONE, type Tone } from './tone'

/**
 * card: tarjeta de primer nivel sobre el lienzo (adentro no van más cajas: se ordena con espacio y líneas finas) ·
 * raised: flotante (menús, popovers) · hero: tarjeta destacada violeta (una por pantalla, con su botón lavanda).
 */
type CardLevel = 'card' | 'raised' | 'hero'
type CardPadding = 'none' | 'sm' | 'md' | 'lg'

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType
  level?: CardLevel
  /** Tiñe la tarjeta con un tono (solo en `card`). */
  tone?: Tone
  padding?: CardPadding
}

const LEVEL: Record<CardLevel, string> = {
  card: 'rounded-card border border-border-subtle bg-card-background bg-linear-to-b from-primary/8 to-transparent shadow-card',
  raised: 'rounded-card border border-tint/10 bg-surface-raised shadow-raised',
  hero: 'rounded-panel bg-primary text-primary-foreground shadow-brand',
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
