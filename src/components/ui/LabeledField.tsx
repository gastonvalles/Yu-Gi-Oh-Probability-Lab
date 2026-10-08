import type { ReactNode } from 'react'

import { cx } from './cx'

interface LabeledFieldProps {
  label: string
  children: ReactNode
  className?: string
}

/** Estilo del campo que va dentro de <LabeledField>: sin caja propia (la caja es la tarjeta de afuera). */
export const fieldInline =
  'w-full min-w-0 border-0 bg-transparent p-0 text-body font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-soft [color-scheme:dark] [&_option]:bg-secondary [&_option]:text-foreground'

/** Campo en tarjeta: etiqueta chica arriba y el valor abajo (nombre del deck, formato…). */
export function LabeledField({ label, children, className }: LabeledFieldProps) {
  return (
    <label className={cx('grid min-w-0 gap-0.5 rounded-card border border-border-subtle bg-card-background px-4 py-2 shadow-card transition-[border-color,box-shadow] duration-150 focus-within:border-primary/60 focus-within:shadow-focus', className)}>
      <span className="text-micro text-soft">{label}</span>
      {children}
    </label>
  )
}
