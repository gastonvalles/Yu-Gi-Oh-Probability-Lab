import type { ButtonHTMLAttributes } from 'react'

import { cx, variants } from './cx'
import { Icon, type IconName } from './Icon'

/**
 * primary: la acción principal del grupo (una sola, y al final del pie) · secondary: una alternativa que hace algo, o acciones de igual peso (lavanda) ·
 * tertiary: lo que descarta o vuelve, sin caja (Cancelar, Volver) · onBrand: sobre una tarjeta violeta · outline: la acción de una tarjeta de una grilla
 * («Ver deck»), donde la lavanda no se distingue de la tarjeta; borde fino y ámbar al apuntarlo. Las reglas completas, en docs/design-system.md.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'onBrand' | 'outline'
type ButtonSize = 'sm' | 'md' | 'lg'
/** brand: violeta de la app · danger: acciones que borran o no se pueden deshacer · success: lo que confirma que se está listo o bien (verde) · confirm: violeta que se vuelve verde al apuntarlo (dar un paso por hecho, como «Listo»). */
export type ButtonColor = 'brand' | 'danger' | 'success' | 'confirm'

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
  brand: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  danger: 'bg-destructive text-white hover:brightness-110',
  success: 'bg-success-solid text-white hover:brightness-110',
  confirm: 'bg-primary text-primary-foreground hover:bg-success-solid hover:text-white',
}

/** Lavanda: relleno violeta oscuro con texto blanco; al pasar el mouse se aclara. */
const QUIET: Record<ButtonColor, string> = {
  brand: 'bg-lavender text-foreground hover:bg-lavender-hover',
  danger: 'bg-danger/20 text-white hover:bg-danger/30',
  success: 'bg-success/20 text-success-soft hover:bg-success/30',
  confirm: 'bg-lavender text-foreground hover:bg-success/30',
}

const GHOST: Record<ButtonColor, string> = {
  brand: 'bg-transparent text-foreground hover:bg-tint/10',
  danger: 'bg-transparent text-danger-soft hover:bg-danger/12',
  success: 'bg-transparent text-success-soft hover:bg-success/12',
  confirm: 'bg-transparent text-foreground hover:bg-success/12',
}

const ON_BRAND: Record<ButtonColor, string> = {
  brand: 'bg-lavender-light text-primary hover:bg-white',
  danger: 'bg-lavender-light text-primary hover:bg-white',
  success: 'bg-lavender-light text-primary hover:bg-white',
  confirm: 'bg-lavender-light text-primary hover:bg-white',
}

/**
 * Sin relleno y con un borde fino claro: se ve como botón sobre una tarjeta (la lavanda queda a 1,08:1 del fondo de la tarjeta) sin sumar un bloque de color por tarjeta.
 * Al apuntarlo (mouse o teclado) el borde, el texto y el ícono se encienden en ámbar, como el borde de la tarjeta. Como `onBrand`, no cambia con `color`.
 */
const OUTLINE_LOOK = 'border border-tint/45 bg-transparent text-foreground hover:border-info/80 hover:text-info-soft focus-visible:border-info/80 focus-visible:text-info-soft'
const OUTLINE: Record<ButtonColor, string> = { brand: OUTLINE_LOOK, danger: OUTLINE_LOOK, success: OUTLINE_LOOK, confirm: OUTLINE_LOOK }

const COLORS = { primary: FILLED, secondary: QUIET, tertiary: GHOST, onBrand: ON_BRAND, outline: OUTLINE } as const

const ICON_SIZE: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 }

const buttonStyle = variants({
  base: 'inline-flex shrink-0 items-center justify-center gap-2 font-semibold leading-tight transition-[background-color,color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:shadow-focus active:translate-y-px disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none',
  variants: {
    size: {
      sm: 'min-h-9 rounded-control px-4 py-1.5 text-body pointer-coarse:min-h-11',
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
