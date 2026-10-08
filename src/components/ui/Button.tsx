import type { ButtonHTMLAttributes } from 'react'

import { cx, variants } from './cx'
import { Icon, type IconName } from './Icon'

/** primary: la acción principal de la vista (una sola) · secondary: acciones de apoyo (lavanda) · tertiary: sin caja · onBrand: sobre una tarjeta violeta. */
export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'onBrand'
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
  brand: 'bg-primary text-primary-foreground shadow-brand hover:bg-primary-hover',
  danger: 'bg-destructive text-white hover:brightness-110',
}

/** Lavanda: relleno violeta oscuro con texto blanco; al pasar el mouse se aclara. */
const QUIET: Record<ButtonColor, string> = {
  brand: 'bg-lavender text-foreground hover:bg-lavender-hover',
  danger: 'bg-danger/20 text-white hover:bg-danger/30',
}

const GHOST: Record<ButtonColor, string> = {
  brand: 'bg-transparent text-foreground hover:bg-tint/10',
  danger: 'bg-transparent text-danger-soft hover:bg-danger/12',
}

const ON_BRAND: Record<ButtonColor, string> = {
  brand: 'bg-lavender-light text-primary hover:bg-white',
  danger: 'bg-lavender-light text-primary hover:bg-white',
}

const COLORS = { primary: FILLED, secondary: QUIET, tertiary: GHOST, onBrand: ON_BRAND } as const

const ICON_SIZE: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 }

const buttonStyle = variants({
  base: 'inline-flex shrink-0 items-center justify-center gap-2 font-semibold leading-tight transition-[background-color,color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:shadow-focus active:translate-y-px disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none',
  variants: {
    size: {
      sm: 'min-h-9 rounded-control px-4 py-1.5 text-body pointer-coarse:min-h-10',
      md: 'min-h-11 rounded-control px-5 py-2 text-body',
      lg: 'min-h-12.5 rounded-card px-6 py-2.5 text-lead',
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
