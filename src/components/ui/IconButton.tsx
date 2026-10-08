import type { ButtonHTMLAttributes, ComponentProps } from 'react'

import { cx, variants } from './cx'
import { Icon } from './Icon'

type IconButtonSize = 'sm' | 'md' | 'lg'

/**
 * raised: botón de barra de herramientas (por defecto) · close: X de los encabezados ·
 * ghost: sin fondo (papelera de zona) · flat: blanco, grande y sin fondo (estética de la práctica).
 */
type IconButtonTone = 'raised' | 'close' | 'ghost' | 'flat'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: IconButtonSize
  tone?: IconButtonTone
}

const BASE =
  'inline-flex shrink-0 items-center justify-center p-0 transition-[background-color,border-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:shadow-focus [&_svg]:block'

const SIZES: Record<IconButtonTone, Record<IconButtonSize, string>> = {
  raised: { sm: 'size-9 [&_svg]:size-4', md: 'size-10 [&_svg]:size-[1.125rem]', lg: 'size-11 [&_svg]:size-5' },
  close: { sm: 'size-8 [&_svg]:size-4', md: 'size-9 [&_svg]:size-[1.125rem]', lg: 'size-10 [&_svg]:size-5' },
  ghost: { sm: 'size-8 [&_svg]:size-4', md: 'size-10 [&_svg]:size-5', lg: 'size-10 [&_svg]:size-5' },
  flat: { sm: 'size-11 [&_svg]:size-6', md: 'size-12 [&_svg]:size-7', lg: 'size-12 [&_svg]:size-7' },
}

const toneStyle = variants({
  base: BASE,
  variants: {
    tone: {
      raised: 'rounded-control bg-lavender text-foreground hover:bg-lavender-hover',
      close: 'rounded-full bg-transparent text-white hover:bg-tint/10 active:bg-tint/16',
      ghost: 'rounded-control bg-transparent text-foreground hover:bg-tint/10',
      flat: 'rounded-full bg-transparent text-white hover:bg-tint/8 active:bg-tint/16 [&_svg]:stroke-[1.3]',
    },
  },
  defaults: { tone: 'raised' },
})

export function IconButton({ size = 'md', tone = 'raised', className = '', type = 'button', ...props }: IconButtonProps) {
  return <button type={type} className={cx(toneStyle({ tone }, SIZES[tone][size]), className)} {...props} />
}

interface CloseButtonProps extends Omit<IconButtonProps, 'children'> {}

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
