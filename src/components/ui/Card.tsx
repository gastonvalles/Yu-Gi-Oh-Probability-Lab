import type { ElementType, HTMLAttributes } from 'react'

import { cx } from './cx'
import { TONE, type Tone } from './tone'

/**
 * card: tarjeta de primer nivel sobre el lienzo (adentro no van más cajas: se ordena con espacio y líneas finas) ·
 * hero: tarjeta destacada violeta (una por pantalla, con su botón lavanda).
 */
type CardLevel = 'card' | 'hero'
type CardPadding = 'sm' | 'md' | 'lg'

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType
  level?: CardLevel
  /** Tiñe la tarjeta con un tono (solo en `card`). */
  tone?: Tone
  padding?: CardPadding
}

const LEVEL: Record<CardLevel, string> = {
  card: 'rounded-card border border-border-subtle bg-card-background shadow-card',
  hero: 'rounded-panel bg-primary text-primary-foreground',
}

const PADDING: Record<CardPadding, string> = {
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
