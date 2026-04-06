import type { ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'tertiary'
type ButtonSize = 'sm' | 'md' | 'lg'
type ButtonColor = 'foreground' | 'primary' | 'accent' | 'destructive' | 'secondary'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  color?: ButtonColor
  fullWidth?: boolean
}

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
      className={[
        'ui-button',
        `ui-button-${variant}`,
        `ui-button-${size}`,
        `ui-button-color-${color}`,
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ').trim()}
      {...props}
    />
  )
}
