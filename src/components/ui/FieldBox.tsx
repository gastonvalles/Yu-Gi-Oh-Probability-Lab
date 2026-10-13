import type { ReactNode } from 'react'

import { cx } from './cx'

interface FieldBoxProps {
  children: ReactNode
  className?: string
}

/** Estilo del campo que va dentro de <FieldBox>: sin caja propia (la caja es la tarjeta de afuera). */
export const fieldInline =
  'w-full min-w-0 border-0 bg-transparent p-0 text-body font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-soft [color-scheme:dark] [&_option]:bg-secondary [&_option]:text-foreground'

/**
 * Campo en tarjeta de una sola línea (nombre del deck, formato…): sin etiqueta, porque el valor o el placeholder ya dicen qué es. El control de
 * adentro lleva su `aria-label` (y, si es un texto, su `placeholder`); tocar cualquier parte de la tarjeta lo enfoca.
 */
export function FieldBox({ children, className }: FieldBoxProps) {
  return (
    <label className={cx('flex h-10 min-w-0 items-center rounded-card border border-border-subtle bg-card-background px-4 shadow-card transition-[border-color,box-shadow] duration-150 focus-within:border-primary/60 focus-within:shadow-focus', className)}>
      {children}
    </label>
  )
}
