import type { ButtonHTMLAttributes, SVGProps } from 'react'

type IconButtonSize = 'sm' | 'md' | 'lg'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: IconButtonSize
}

export function IconButton({
  size = 'md',
  className = '',
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={[
        'ui-icon-button',
        `ui-icon-button-${size}`,
        className,
      ].join(' ').trim()}
      {...props}
    />
  )
}

interface CloseButtonProps extends Omit<IconButtonProps, 'children'> {}

export function CloseButton(props: CloseButtonProps) {
  return (
    <IconButton {...props}>
      <CloseIcon />
    </IconButton>
  )
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" {...props}>
      <path d="m4 4 8 8" />
      <path d="m12 4-8 8" />
    </svg>
  )
}
