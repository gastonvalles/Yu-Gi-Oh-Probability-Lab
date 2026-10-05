import type { ButtonHTMLAttributes } from 'react'

import { cx, variants } from './cx'

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary'
export type ButtonSize = 'sm' | 'md' | 'lg'
export type ButtonColor = 'foreground' | 'primary' | 'accent' | 'destructive' | 'secondary'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  color?: ButtonColor
  fullWidth?: boolean
}

const SOLID: Record<ButtonColor, string> = {
  foreground: 'border-foreground/8 bg-foreground text-background hover:border-primary hover:bg-primary hover:text-primary-foreground',
  primary: 'border-primary bg-primary text-primary-foreground hover:border-primary-hover hover:bg-primary-hover',
  accent: 'border-accent bg-accent text-accent-foreground hover:border-accent-hover hover:bg-accent-hover',
  destructive: 'border-destructive bg-destructive text-destructive-foreground hover:border-destructive/92 hover:bg-destructive/92',
  secondary: 'border-border bg-secondary text-secondary-foreground hover:border-foreground/10 hover:bg-input-hover',
}

const buttonStyle = variants({
  base: 'inline-flex items-center justify-center gap-[0.45rem] rounded-control border font-semibold leading-none transition-[border-color,background-color,color,opacity] duration-120 focus-visible:shadow-[0_0_0_1px_rgb(var(--primary-rgb)/0.42)] focus-visible:outline-none disabled:cursor-default disabled:border-border disabled:bg-input disabled:text-foreground/42 disabled:opacity-42 disabled:shadow-none',
  variants: {
    variant: {
      primary: '',
      secondary: 'border-border bg-secondary text-foreground hover:border-foreground/10 hover:bg-input',
      tertiary: 'border-border/90 bg-background text-muted hover:border-foreground/10 hover:bg-secondary hover:text-foreground',
    },
    size: {
      sm: 'min-h-[1.95rem] px-[0.86rem] py-[0.42rem] text-[0.78rem]',
      md: 'min-h-[2.2rem] px-4 py-[0.54rem] text-[0.84rem]',
      lg: 'min-h-[2.55rem] px-[1.18rem] py-[0.68rem] text-[0.92rem]',
    },
  },
  defaults: { variant: 'secondary', size: 'md' },
})

export function Button({
  variant = 'secondary',
  size = 'md',
  color = 'foreground',
  fullWidth = false,
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(buttonStyle({ variant, size }, variant === 'primary' && SOLID[color]), fullWidth && 'w-full', className)}
      {...props}
    />
  )
}
