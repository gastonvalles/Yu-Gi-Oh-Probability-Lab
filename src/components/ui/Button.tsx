import type { ButtonHTMLAttributes } from 'react'

import { cx, variants } from './cx'
import { Icon, type IconName } from './Icon'

/** primary: la acción principal de la vista (una sola) · secondary: acciones de apoyo · tertiary: sin caja. */
export type ButtonVariant = 'primary' | 'secondary' | 'tertiary'
export type ButtonSize = 'sm' | 'md' | 'lg'
/** brand: violeta de la app · danger: acciones que borran o no se pueden deshacer. */
export type ButtonColor = 'brand' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  color?: ButtonColor
  fullWidth?: boolean
  /** Ícono antes del texto: la acción se reconoce sin leer. */
  icon?: IconName
  iconEnd?: IconName
}

const FILLED: Record<ButtonColor, string> = {
  brand: 'border-transparent bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_6px_16px_rgb(var(--primary-rgb)/0.28)] hover:bg-primary-hover',
  danger: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90',
}

const QUIET: Record<ButtonColor, string> = {
  brand: 'border-border-subtle bg-surface-raised text-foreground hover:bg-surface-hover',
  danger: 'border-danger/30 bg-danger/8 text-danger-soft hover:bg-danger/16',
}

const GHOST: Record<ButtonColor, string> = {
  brand: 'border-transparent bg-transparent text-muted hover:bg-white/6 hover:text-foreground',
  danger: 'border-transparent bg-transparent text-danger-soft hover:bg-danger/12',
}

const COLORS = { primary: FILLED, secondary: QUIET, tertiary: GHOST } as const

const ICON_SIZE: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 }

const buttonStyle = variants({
  base: 'inline-flex shrink-0 items-center justify-center gap-2 rounded-control border font-semibold leading-tight transition-[background-color,border-color,color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:shadow-focus active:translate-y-px disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none',
  variants: {
    size: {
      sm: 'min-h-8 px-3 py-1.5 text-small pointer-coarse:min-h-10',
      md: 'min-h-10 px-4 py-2 text-body pointer-coarse:min-h-11',
      lg: 'min-h-12 px-5 py-2.5 text-lead',
    },
  },
  defaults: { size: 'md' },
})

export function Button({
  variant = 'secondary',
  size = 'md',
  color = 'brand',
  fullWidth = false,
  icon,
  iconEnd,
  className = '',
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  const iconSize = ICON_SIZE[size]

  return (
    <button type={type} className={cx(buttonStyle({ size }, COLORS[variant][color]), fullWidth && 'w-full', className)} {...props}>
      {icon ? <Icon name={icon} size={iconSize} /> : null}
      {children}
      {iconEnd ? <Icon name={iconEnd} size={iconSize} /> : null}
    </button>
  )
}
