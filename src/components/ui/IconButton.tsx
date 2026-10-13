import type { ButtonHTMLAttributes, ComponentProps } from 'react'

import { cx, variants } from './cx'
import { Icon } from './Icon'

type IconButtonSize = 'sm' | 'md' | 'lg'

/**
 * Los botones que son sólo un ícono no llevan fondo y son siempre blancos: el aviso de que se pueden tocar es que el ícono se pone verde (con un
 * resplandor) al pasar el mouse, y verde se queda mientras el botón está seleccionado (`aria-pressed`, `aria-selected` o `data-active`); un poco menos
 * de opacidad al apretar; el foco lleva el aro de siempre. El tono sólo cambia el tamaño y la forma:
 * raised: el de las barras de herramientas (por defecto) · close: la X de los encabezados · ghost: el de las zonas del deck (papelera, ordenar) ·
 * flat: el grande de la práctica · outline: redondo con borde (volver al principio de un replay).
 * primary es la excepción: redondo violeta, la acción principal de una barra (reproducir).
 */
type IconButtonTone = 'raised' | 'close' | 'ghost' | 'flat' | 'outline' | 'primary'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: IconButtonSize
  tone?: IconButtonTone
}

const BASE =
  'inline-flex shrink-0 items-center justify-center p-0 transition-[opacity,color,border-color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:shadow-focus [&_svg]:block'

/** Lo común de los que van sin fondo: ícono blanco que se pone verde (con resplandor) al pasar el mouse o al estar seleccionado, más tenue al apretar o si está deshabilitado. */
const BARE =
  'bg-transparent text-white hover:text-success aria-pressed:text-success aria-selected:text-success data-[active=true]:text-success active:opacity-70 disabled:pointer-events-none disabled:opacity-40 [&_svg]:transition-[filter] [&_svg]:duration-150 hover:[&_svg]:drop-shadow-[0_0_6px_rgb(var(--success-rgb)/0.7)] aria-pressed:[&_svg]:drop-shadow-[0_0_6px_rgb(var(--success-rgb)/0.7)] data-[active=true]:[&_svg]:drop-shadow-[0_0_6px_rgb(var(--success-rgb)/0.7)]'

const SIZES: Record<IconButtonTone, Record<IconButtonSize, string>> = {
  raised: { sm: 'size-9 [&_svg]:size-4', md: 'size-10 [&_svg]:size-[1.125rem]', lg: 'size-11 [&_svg]:size-5' },
  // En táctil los chicos crecen a 44 px (área mínima recomendada) sin cambiar el ícono.
  close: { sm: 'size-8 pointer-coarse:size-11 [&_svg]:size-4', md: 'size-9 pointer-coarse:size-11 [&_svg]:size-[1.125rem]', lg: 'size-10 [&_svg]:size-5' },
  ghost: { sm: 'size-8 pointer-coarse:size-11 [&_svg]:size-4', md: 'size-10 [&_svg]:size-5', lg: 'size-10 [&_svg]:size-5' },
  flat: { sm: 'size-11 [&_svg]:size-6', md: 'size-12 [&_svg]:size-7', lg: 'size-12 [&_svg]:size-7' },
  outline: { sm: 'size-9 [&_svg]:size-4', md: 'size-10 [&_svg]:size-[1.125rem]', lg: 'size-12 [&_svg]:size-5' },
  primary: { sm: 'size-10 [&_svg]:size-[1.125rem]', md: 'size-12 [&_svg]:size-5', lg: 'size-14 [&_svg]:size-6' },
}

const toneStyle = variants({
  base: BASE,
  variants: {
    tone: {
      raised: cx('rounded-control', BARE),
      close: cx('rounded-full', BARE),
      ghost: cx('rounded-control', BARE),
      flat: cx('rounded-full [&_svg]:stroke-[1.3]', BARE),
      outline: cx('rounded-full border border-tint/30 hover:border-tint/60', BARE),
      primary: 'rounded-full bg-primary text-primary-foreground shadow-brand hover:bg-primary-hover active:translate-y-px disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none',
    },
  },
  defaults: { tone: 'raised' },
})

export function IconButton({ size = 'md', tone = 'raised', className = '', type = 'button', ...props }: IconButtonProps) {
  return <button type={type} className={cx(toneStyle({ tone }, SIZES[tone][size]), className)} {...props} />
}

type CloseButtonProps = Omit<IconButtonProps, 'children'>

export function CloseButton({ tone = 'close', ...props }: CloseButtonProps) {
  return (
    <IconButton {...props} tone={tone}>
      <CloseIcon />
    </IconButton>
  )
}

/** La X del set de íconos, para usarla suelta (chips, campos). */
export function CloseIcon(props: Omit<ComponentProps<typeof Icon>, 'name'>) {
  return <Icon name="x" strokeWidth={2} {...props} />
}
