import type { ButtonHTMLAttributes, SVGProps } from 'react'

import { cx, variants } from './cx'

type IconButtonSize = 'sm' | 'md' | 'lg'

/**
 * raised: botón con relieve (por defecto) · close: X discreta de los encabezados ·
 * ghost: sin fondo (papelera de zona) · flat: blanco, grande y sin fondo (estética de la práctica).
 */
type IconButtonTone = 'raised' | 'close' | 'ghost' | 'flat'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: IconButtonSize
  tone?: IconButtonTone
}

const BASE = 'inline-flex shrink-0 items-center justify-center p-0 transition-[border-color,background,color,box-shadow,transform] duration-150 focus-visible:outline-none [&_svg]:block'

const TONES: Record<IconButtonTone, Record<IconButtonSize, string>> = {
  raised: {
    sm: 'size-8',
    md: 'size-[2.35rem]',
    lg: 'size-[2.7rem]',
  },
  close: { sm: 'size-[1.7rem]', md: 'size-[1.95rem]', lg: 'size-[2.2rem]' },
  ghost: {
    sm: 'size-[1.9rem] [&_svg]:size-4',
    md: 'size-[2.4rem] [&_svg]:size-[1.32rem]',
    lg: 'size-[2.4rem] [&_svg]:size-[1.32rem]',
  },
  flat: {
    sm: 'size-11 [&_svg]:size-6',
    md: 'size-12 [&_svg]:size-[1.7rem]',
    lg: 'size-12 [&_svg]:size-[1.7rem]',
  },
}

const toneStyle = variants({
  base: BASE,
  variants: {
    tone: {
      raised:
        'rounded-control border border-foreground/10 bg-linear-to-b from-secondary/98 to-background text-soft shadow-[inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(0,0,0,0.16),0_0_0_1px_rgb(var(--foreground-rgb)/0.03),0_10px_20px_rgba(0,0,0,0.14)] hover:-translate-y-px hover:border-primary/40 hover:from-primary/10 hover:to-card-background/98 hover:text-foreground hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(0,0,0,0.16),0_0_0_1px_rgb(var(--primary-rgb)/0.08),0_12px_24px_rgb(var(--primary-rgb)/0.12)] focus-visible:shadow-[0_0_0_2px_rgb(var(--background-rgb)),0_0_0_4px_rgb(var(--primary-rgb)/0.32)] [&_svg]:size-[0.92rem]',
      close:
        'rounded-control bg-transparent text-foreground/82 hover:text-foreground focus-visible:shadow-[0_0_0_2px_rgb(var(--primary-rgb)/0.24)] [&_svg]:size-[0.82rem]',
      ghost:
        'rounded-none bg-transparent text-white/76 hover:text-white/96 focus-visible:shadow-[0_0_0_2px_rgb(var(--primary-rgb)/0.18)]',
      flat: 'rounded-full bg-transparent text-white [-webkit-tap-highlight-color:transparent] hover:bg-white/8 active:bg-white/16 [&_svg]:stroke-[1.3]',
    },
  },
  defaults: { tone: 'raised' },
})

export function IconButton({
  size = 'md',
  tone = 'raised',
  className = '',
  type = 'button',
  ...props
}: IconButtonProps) {
  return <button type={type} className={cx(toneStyle({ tone }, TONES[tone][size]), className)} {...props} />
}

interface CloseButtonProps extends Omit<IconButtonProps, 'children'> {}

export function CloseButton({ tone = 'close', ...props }: CloseButtonProps) {
  return (
    <IconButton {...props} tone={tone}>
      <CloseIcon />
    </IconButton>
  )
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" aria-hidden="true" {...props}>
      <path d="m4 4 8 8" />
      <path d="m12 4-8 8" />
    </svg>
  )
}
